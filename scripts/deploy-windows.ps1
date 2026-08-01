$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$installRoot = 'C:\feishu-agent'
$tempRoot = 'C:\Windows\Temp\feishu-agent-deploy'
$repoZip = Join-Path $tempRoot 'source.zip'
$repoUrl = 'https://codeload.github.com/Cai741013/git/zip/refs/heads/main'
$taskName = 'FeishuProposalAgent'

Write-Host '[1/5] Installing Node.js LTS...'
$nodeExe = Join-Path $env:ProgramFiles 'nodejs\node.exe'
if (-not (Test-Path $nodeExe)) {
  New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
  $releases = Invoke-RestMethod 'https://nodejs.org/dist/index.json'
  $release = $releases | Where-Object { $_.lts -and $_.files -contains 'win-x64-msi' } | Select-Object -First 1
  if (-not $release) { throw 'Could not find a Windows Node.js LTS installer.' }
  $msi = Join-Path $tempRoot "node-$($release.version)-x64.msi"
  Invoke-WebRequest "https://nodejs.org/dist/$($release.version)/node-$($release.version)-x64.msi" -OutFile $msi -UseBasicParsing
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
}
if (-not (Test-Path $nodeExe)) { throw 'Node.js installation failed.' }

Write-Host '[2/5] Downloading the proposal agent...'
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null
Invoke-WebRequest $repoUrl -OutFile $repoZip -UseBasicParsing
$extractRoot = Join-Path $tempRoot 'source'
if (Test-Path $extractRoot) { Remove-Item -LiteralPath $extractRoot -Recurse -Force }
Expand-Archive -Path $repoZip -DestinationPath $extractRoot -Force
$sourceRoot = Get-ChildItem $extractRoot -Directory | Select-Object -First 1
if (-not $sourceRoot) { throw 'Downloaded project archive is invalid.' }
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Get-ChildItem $sourceRoot.FullName -Force | ForEach-Object { Copy-Item $_.FullName -Destination $installRoot -Recurse -Force }

Write-Host '[3/5] Preparing server configuration...'
$envFile = Join-Path $installRoot '.env'
if (-not (Test-Path $envFile)) { Copy-Item (Join-Path $installRoot '.env.example') $envFile }
$content = [IO.File]::ReadAllText($envFile)
$content = [regex]::Replace($content, '(?m)^HOST=.*$', 'HOST=0.0.0.0')
$content = [regex]::Replace($content, '(?m)^PORT=.*$', 'PORT=80')
[IO.File]::WriteAllText($envFile, $content, (New-Object Text.UTF8Encoding($false)))

Write-Host '[4/5] Opening Windows Firewall port 80...'
if (-not (Get-NetFirewallRule -DisplayName 'Feishu Proposal Agent HTTP' -ErrorAction SilentlyContinue)) {
  try {
    New-NetFirewallRule -DisplayName 'Feishu Proposal Agent HTTP' -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow -ErrorAction Stop | Out-Null
  } catch {
    Write-Warning 'PowerShell firewall cmdlet failed; trying netsh fallback.'
    & netsh advfirewall firewall add rule name='Feishu Proposal Agent HTTP' dir=in action=allow protocol=TCP localport=80 | Out-Host
  }
}

Write-Host '[5/5] Registering the startup task...'
$action = New-ScheduledTaskAction -Execute $nodeExe -Argument (Join-Path $installRoot 'server.js') -WorkingDirectory $installRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

try {
  $health = Invoke-RestMethod 'http://127.0.0.1/healthz' -TimeoutSec 5
  Write-Host "Deployment health: $($health.status)"
} catch {
  Write-Warning 'The service was installed but did not pass its first health check. Check Task Scheduler history.'
}

Write-Host ''
Write-Host 'Deployment files: C:\feishu-agent'
Write-Host 'Next: edit C:\feishu-agent\.env and replace the DeepSeek key and ACCESS_CODE.'
Write-Host "Then run: Restart-ScheduledTask -TaskName '$taskName'"

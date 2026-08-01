# 腾讯云部署说明

## 当前 Windows 实例

服务器公网 IP：`129.204.181.166`

在腾讯云实例页面点击“执行命令”，选择 PowerShell，并运行：

```powershell
Invoke-Expression (Invoke-WebRequest 'https://raw.githubusercontent.com/Cai741013/git/main/scripts/deploy-windows.ps1' -UseBasicParsing).Content
```

脚本会自动安装 Node.js、下载项目、开放 Windows 防火墙端口 `80`，并注册开机自动启动任务。

完成后通过远程桌面登录服务器，用记事本打开：

```text
C:\feishu-agent\.env
```

填写真实的 `DEEPSEEK_API_KEY`，并把 `ACCESS_CODE` 改成你希望分享给使用者的口令。保存后，以管理员身份打开 PowerShell：

```powershell
Restart-ScheduledTask -TaskName 'FeishuProposalAgent'
```

还需要在腾讯云控制台的“防火墙”页面添加入站规则：协议 `TCP`、端口 `80`、来源 `0.0.0.0/0`。完成后访问：

```text
http://129.204.181.166
```

---

## 服务器要求

- 腾讯云轻量应用服务器
- Ubuntu 22.04 或 24.04
- 建议配置：2 核 CPU、2 GB 内存
- 防火墙开放：`22`（SSH）和 `80`（网页）

## 首次部署

通过腾讯云控制台登录服务器后执行：

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose git
sudo systemctl enable --now docker
git clone https://github.com/Cai741013/git.git feishu-agent
cd feishu-agent
cp .env.example .env
nano .env
```

在 `.env` 中确认以下内容：

```text
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=你的真实密钥
AI_MODEL=deepseek-chat
HOST=0.0.0.0
PORT=4173
ACCESS_CODE=设置一个分享给使用者的访问口令
RATE_LIMIT_PER_HOUR=20
```

保存后启动：

```bash
sudo docker-compose up -d --build
sudo docker-compose ps
```

浏览器访问：

```text
http://服务器公网IP
```

## 更新版本

```bash
cd ~/feishu-agent
git pull
sudo docker-compose up -d --build
```

## 正式对外使用

公网 IP 适合临时演示。正式使用建议购买域名、完成备案并配置 HTTPS，避免访问口令在 HTTP 网络中明文传输。DeepSeek 密钥只能保存在服务器 `.env` 中，不要上传到 GitHub。

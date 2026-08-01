# 腾讯云部署说明

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

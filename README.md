# 飞书 AI 提案工坊

输入任意客户行业、企业规模和业务痛点，系统会调用真实大模型完成行业调研、痛点诊断、飞书产品匹配、量化价值分析和三期实施方案。

## 第一次使用

1. 在 DeepSeek 开放平台创建 API Key：<https://platform.deepseek.com/api_keys>
2. 将项目里的 `.env.example` 复制为 `.env`
3. 把 `.env` 中的密钥替换为你的真实密钥：

```text
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-你的真实密钥
AI_MODEL=deepseek-chat
```

4. 在 VS Code 终端运行：

```powershell
npm.cmd run dev
```

5. 浏览器打开 <http://localhost:4173>

密钥只保存在本机 `.env` 文件中，该文件已加入 `.gitignore`，不会上传到 GitHub。

如需使用 OpenAI，将 `AI_PROVIDER` 改为 `openai`，并填写 `OPENAI_API_KEY`。OpenAI 模式支持内置网页搜索；DeepSeek 模式使用模型知识生成行业洞察。

## 网络代理

如果当前网络不能直接访问 OpenAI，在 `.env` 中加入：

```text
HTTPS_PROXY=http://127.0.0.1:7890
HTTP_PROXY=http://127.0.0.1:7890
```

端口按你的代理软件实际设置修改。系统会先尝试联网调研；网络搜索超时后，会自动改用模型已有知识继续生成，不会中断整份方案。

## 生成模式

- `AI 实时生成`：真实模型基于客户原始信息生成，可处理任意行业和问题。
- `本地规则兜底`：未配置密钥或接口异常时启用，只用于演示，不等同于真实 AI 调研。

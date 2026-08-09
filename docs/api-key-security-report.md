# API 密钥安全方案报告（服务端托管）

日期：2026-08-09（更新）

## 目标

浏览器与 WebSocket 载荷中**永不出现** LLM API Key；密钥仅存在于服务端环境变量。

## 架构

```
用户浏览器 ──chat{content, model?}──► Backend ──Bearer DEEPSEEK_API_KEY──► DeepSeek
                 ✗ 无 apiKey
```

## 已落地措施

### 1. 删除前端 BYOK

- 移除 `ConfigPanel`、设置齿轮、`secretStore`、`VITE_DEEPSEEK_API_KEY`
- Zustand 仅持久化 `messages` + `model`（`ai-chat-state-v5`）
- 启动时清理可能含明文 Key 的旧 localStorage / sessionStorage 键

### 2. 服务端凭证

- `DEEPSEEK_API_KEY` / `DEEPSEEK_API_URL` / `DEEPSEEK_DEFAULT_MODEL` 经 `dotenv` 从仓库根或 `backend/.env.local` 加载
- 启动时若缺少 Key 则进程退出（fail-fast）
- 日志永不打印 Key；健康检查仅返回 `llmConfigured: boolean`

### 3. 协议收紧

- `ClientMessage`：`chat`（content + 可选 model）| `ping`
- 删除 `set_config` / `config_ok`
- 解析时若发现 `config` / `apiKey` 字段，直接视为非法消息

### 4. 模型白名单

- `shared/src/config/models.ts`：`ALLOWED_MODEL_IDS`
- 客户端传入的未知 model 被拒绝；合法 model 才用于出站请求
- API URL 固定来自服务端环境，客户端无法指定任意上游

### 5. 其它硬化

- 生产 CORS：需显式 `CORS_ORIGIN`（未配置则拒绝跨域）
- Express JSON body limit `32kb`；WebSocket `maxPayload` `64kb`
- 既有连接级 rate limit、消息长度上限、友好错误文案（不回传上游细节）

## 使用方式

```bash
cp .env.example .env.local
# 填写 DEEPSEEK_API_KEY=sk-...
npm run dev:backend
npm run dev:frontend
```

## 仍建议的后续（未做）

| 项 | 说明 |
|----|------|
| 用户登录 / 会话 | 防止匿名滥用你的 Key |
| WSS + 反向代理 TLS | 生产必备 |
| 按 IP / 用户配额 | 防刷费用 |
| KMS / 密钥轮换 | 运维级托管 |
| CSP / 依赖审计 | 降低 XSS 与供应链风险 |

在「无登录演示项目」约束下，**服务端持有 Key + 前端零密钥**已是合理上限。

## 主要变更文件

- 删除：`ConfigPanel/*`、`secretStore.ts`
- 新增：`backend/src/config/env.ts`、`shared/src/config/models.ts`
- 更新：协议类型、`handleMessage`、`useChatService`、`useChatStore`、Header、README、`.env.example`

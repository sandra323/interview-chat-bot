# AI Chat Bot

Lightweight single-page AI chat web application with React frontend and Node.js WebSocket backend.

## Features

- Multi-turn AI conversation with full context passing
- Server-side DeepSeek API key (never exposed to the browser)
- Real-time communication via WebSocket
- Chat history persisted in browser localStorage (messages + model preference only)
- Loading states, error toasts, and connection status
- Docker Compose one-command deployment

## Architecture

```
Browser (React SPA) ──WebSocket (content + model)──► Node.js Backend ──HTTPS──► LLM API
       │                                                      │
       └── localStorage (no secrets)                          └── DEEPSEEK_API_KEY in env
```

Monorepo structure:
- `frontend/` — React + Vite + Tailwind + Less Modules
- `backend/` — Express + WebSocket + LLM adapter
- `shared/` — Shared TypeScript types

## Quick Start (Docker)

```bash
# Provide DEEPSEEK_API_KEY via environment or .env.local before up
docker-compose up --build
```

Open http://localhost in your browser.

## Local Development

### Prerequisites

- Node.js 20+（项目根目录有 `.nvmrc`）
- npm 9+
- 推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node 版本

### 启动步骤（推荐）

在项目**根目录**操作：

**1. 进入项目**

```bash
cd /path/to/interview-chat-bot
```

**2. 切换到 Node 20**（本机默认 Node 过旧时必须做）

```bash
nvm use
```

终端应出现类似 `Now using node v20.x`。可用 `node -v` 确认版本 ≥ 20。

**3. 安装依赖**（首次克隆，或依赖变更后）

```bash
npm install
```

**4. 配置服务端密钥**（**不要提交真实 Key**）

```bash
cp .env.example .env.local
# 编辑 .env.local，填写：
# DEEPSEEK_API_KEY=sk-your-key
```

密钥只存在后端进程环境变量中，前端无法读取。

**5. 启动前后端**

```bash
# 终端 1
npm run dev:backend

# 终端 2
npm run dev:frontend
```

看到 `Local: http://localhost:5173/` 后打开该地址即可聊天。Header 可切换白名单内的模型（Flash / Pro）。

若只想前端预览，把 `frontend/src/config/app.ts` 里 `USE_MOCK` 改为 `true`（无需后端与 Key）。

模型列表 UI 在 `frontend/src/config/providers.ts`；服务端白名单在 `shared/src/config/models.ts`（两边需保持一致）。

### 常用地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:3001 |
| 健康检查 | http://localhost:3001/health |
| WebSocket | `ws://localhost:3001/ws`（开发时由 Vite 代理 `/ws`） |

## Security notes

- LLM API Key **仅**配置在服务端 `.env.local`（`DEEPSEEK_API_KEY`）
- 浏览器不存储、不展示、不传输 API Key
- WebSocket `chat` 仅含 `content` + 可选 `model`；含 `apiKey`/`config` 的旧载荷会被拒绝
- 模型 id 经服务端白名单校验
- 生产环境建议设置 `CORS_ORIGIN`，并使用 HTTPS / WSS
- 详见 `docs/api-key-security-report.md`

## Testing

```bash
# Backend unit tests
npm run test --workspace=backend

# Frontend unit tests
npm run test --workspace=frontend
```

## Project Structure

```
frontend/src/
├── pages/Chat/          # Chat page + page-specific components
├── components/          # Shared UI components
├── apis/websocket/      # WebSocket client & message protocol
├── config/providers.ts  # Model labels for UI
├── hooks/               # useWebSocket, useChatService
├── store/               # Zustand state + localStorage persist
├── utils/               # Validators, formatters, scroll helpers
└── styles/              # Global Less variables & styles

backend/src/
├── config/              # Env loading & server LLM credentials
├── websocket/           # Connection manager & message handler
├── adapters/            # LLM provider adapters (OpenAI-compatible)
└── utils/               # Logger, rate limiter
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `engine` / 奇怪的 Node 报错 | 运行 `nvm use`，确认 `node -v` ≥ 20 |
| Backend exits: Missing DEEPSEEK_API_KEY | 在根目录 `.env.local` 填写 `DEEPSEEK_API_KEY` 后重启后端 |
| WebSocket won't connect | Ensure backend is running and `USE_MOCK` is `false`; check Vite proxy |
| 401 from LLM API | Verify `DEEPSEEK_API_KEY` / `DEEPSEEK_API_URL` on the **server** |
| Model rejected | Use an id from `shared/src/config/models.ts` allowlist |
| Messages not persisting | Check browser localStorage is enabled |
| Port 80 in use | Change frontend port mapping in docker-compose.yml |

## License

Private — for interview/demo purposes.

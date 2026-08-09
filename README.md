# AI Chat Bot

Lightweight single-page AI chat web application with React frontend and Node.js WebSocket backend.

## Features

- Multi-turn AI conversation with full context passing
- Configurable LLM API (OpenAI-compatible)
- Real-time communication via WebSocket
- Chat history persisted in browser localStorage
- Loading states, error toasts, and connection status
- Docker Compose one-command deployment

## Architecture

```
Browser (React SPA) ──WebSocket──► Node.js Backend ──HTTPS──► LLM API
       │                                    │
       └── localStorage                     └── In-memory per-connection state
```

Monorepo structure:
- `frontend/` — React + Vite + Tailwind + Less Modules
- `backend/` — Express + WebSocket + LLM adapter
- `shared/` — Shared TypeScript types

## Quick Start (Docker)

```bash
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

**4. 启动前端**

```bash
npm run dev:frontend
```

看到 `Local: http://localhost:5173/` 后，浏览器打开该地址即可。

当前 `frontend/src/config/app.ts` 中 `USE_MOCK = true` 时，**只开前端**就能用 mock 数据聊天，不必启动后端。停止服务：在对应终端按 `Ctrl + C`。

### 可选：连真实后端 / LLM

需要真实 WebSocket 与 LLM 时，开两个终端（或用根目录 `npm run dev`）：

```bash
# 终端 1 — 后端
npm run dev:backend

# 终端 2 — 前端
npm run dev:frontend
```

然后：

1. 将 `frontend/src/config/app.ts` 里的 `USE_MOCK` 改为 `false`
2. 打开应用，展开 **Settings**
3. 填写：
   - **API URL**：如 `https://api.openai.com/v1/chat/completions`
   - **API Key**：你的 LLM API Key
   - **Model**：如 `gpt-4o-mini`
4. 点击 **Save & Reconnect**

API key 只存在浏览器 localStorage，不会持久化到服务端。

### 常用地址

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:5173 |
| 后端 | http://localhost:3001 |
| 健康检查 | http://localhost:3001/health |
| WebSocket | `ws://localhost:3001/ws`（开发时由 Vite 代理 `/ws`） |

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
├── hooks/               # useWebSocket, useChatService
├── store/               # Zustand state + localStorage persist
├── utils/               # Validators, formatters, scroll helpers
└── styles/              # Global Less variables & styles

backend/src/
├── websocket/           # Connection manager & message handler
├── adapters/            # LLM provider adapters
└── utils/               # Logger, rate limiter
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `engine` / 奇怪的 Node 报错 | 运行 `nvm use`，确认 `node -v` ≥ 20 |
| WebSocket won't connect | Ensure backend is running and `USE_MOCK` is `false`; check Vite proxy |
| 401 from LLM API | Verify API key and URL in settings |
| Messages not persisting | Check browser localStorage is enabled |
| Port 80 in use | Change frontend port mapping in docker-compose.yml |

## License

Private — for interview/demo purposes.

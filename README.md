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

当前默认 `USE_MOCK = false`，需要同时启动后端才能真实对话。若只想前端预览，把 `frontend/src/config/app.ts` 里 `USE_MOCK` 改为 `true`。停止服务：在对应终端按 `Ctrl + C`。

### 接入 DeepSeek（推荐）

DeepSeek 兼容 OpenAI Chat Completions，本项目默认走 DeepSeek。

1. 复制环境变量模板并填入 Key（**不要提交真实 Key**）：

```bash
cp frontend/.env.example frontend/.env.local
# 编辑 frontend/.env.local：
# VITE_DEEPSEEK_API_KEY=sk-your-key
```

2. 启动前后端：

```bash
# 终端 1
npm run dev:backend

# 终端 2（修改 .env.local 后需重启 Vite）
npm run dev:frontend
```

3. 打开 http://localhost:5173  
   - Header 默认模型：**DeepSeek V4 Flash**（可切换 Pro）  
   - Settings 可点 **DeepSeek 默认** 一键填入 URL / 模型；Key 来自 `.env.local` 或手动粘贴  
   - 点 **保存并重连** 后即可聊天  

厂商与模型列表集中在 `frontend/src/config/providers.ts`，新增厂商时优先改该文件。

API key 只存在浏览器 localStorage（及本地 env），不会持久化到服务端。

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
├── config/providers.ts  # LLM vendor/model registry (extend here)
├── hooks/               # useWebSocket, useChatService
├── store/               # Zustand state + localStorage persist
├── utils/               # Validators, formatters, scroll helpers
└── styles/              # Global Less variables & styles

backend/src/
├── websocket/           # Connection manager & message handler
├── adapters/            # LLM provider adapters (OpenAI-compatible)
└── utils/               # Logger, rate limiter
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `engine` / 奇怪的 Node 报错 | 运行 `nvm use`，确认 `node -v` ≥ 20 |
| WebSocket won't connect | Ensure backend is running and `USE_MOCK` is `false`; check Vite proxy |
| 401 from LLM API | Verify API key in Settings / `frontend/.env.local` |
| Model list empty / wrong | Edit `frontend/src/config/providers.ts` |
| Messages not persisting | Check browser localStorage is enabled |
| Port 80 in use | Change frontend port mapping in docker-compose.yml |

## License

Private — for interview/demo purposes.

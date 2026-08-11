# AI Chat Bot（面试演示用聊天应用）

一个轻量的 **AI 多轮对话网页**：前端用 React，后端用 Node.js，通过 WebSocket 实时收发消息，并由服务端代调大模型（DeepSeek 等 OpenAI 兼容接口）。

适合本地快速跑通、演示，或作为面试项目说明「前后端怎么分工、密钥怎么放、会话怎么存」。

---

## 能做什么

- **多轮对话**：带着上下文连续聊；回复支持流式输出
- **密钥只在服务端**：浏览器里看不到、也传不走 API Key
- **历史会话**：侧边栏可查看、切换、重命名、删除；消息支持向上滚动加载更早内容
- **模型切换**：页头可在白名单模型间切换（如 Flash / Pro）
- **连接与异常提示**：断线、报错会有明确提示
- **Mock 模式**：不启后端也能先看界面（见下文）
- **一键 Docker 部署**（可选）

更细的「哪些已实现 / 哪些还没做」见文档：[`features-doc/ai-chat-page/engineering/current-state.md`](features-doc/ai-chat-page/engineering/current-state.md)。

---

## 整体怎么跑起来（概念）

```text
浏览器 (React)
    │  WebSocket：发消息 / 收流式回复
    │  HTTP：会话列表、分页、重命名、删除
    ▼
Node 后端
    │  环境变量里的 DEEPSEEK_API_KEY
    ▼
大模型 API
```

- **聊天内容的权威存储**：后端 SQLite  
- **浏览器 localStorage**：只存当前界面需要的状态（如消息缓存、模型偏好、当前会话 id），**绝不存密钥**

---

## 仓库目录

| 目录 | 里面是什么 |
|------|------------|
| `frontend/` | 网页：聊天页、侧边栏、样式 |
| `backend/` | 服务：WebSocket、HTTP 接口、调大模型、SQLite |
| `shared/` | 前后端共用的类型、模型白名单等 |
| `features-doc/` | 产品/技术/UI 文档（给人看也给 AI 助手检索）；从 [`features-doc/README.md`](features-doc/README.md) 开始 |

---

## 本地开发（推荐）

### 你需要准备

- **Node.js 20+**（根目录有 `.nvmrc`，建议用 [nvm](https://github.com/nvm-sh/nvm)）
- **npm 9+**
- 一份可用的 **DeepSeek（或兼容）API Key**（仅本地 `.env.local` 使用，不要提交到 Git）

### 五步跑通

在项目**根目录**操作：

**1. 进入项目**

```bash
cd /path/to/interview-chat-bot
```

**2. 切到 Node 20**（本机默认 Node 太旧时必做）

```bash
nvm use
node -v   # 应 ≥ 20
```

**3. 安装依赖**（首次克隆，或依赖变更后）

```bash
npm install
```

**4. 配置服务端密钥**（不要把真实 Key 提交进仓库）

```bash
cp .env.example .env.local
```

编辑 `.env.local`，至少填写：

```bash
DEEPSEEK_API_KEY=sk-你的密钥

# 演示登录账号（不要使用明文 AUTH_PASSWORD）
AUTH_USERNAME=demo
# 生成哈希（安装依赖后执行，勿把真实密码/哈希提交进 Git）：
#   node -e "require('bcryptjs').hash('your-password', 10).then(console.log)"
AUTH_PASSWORD_HASH=把上面命令输出的哈希贴到这里
AUTH_SESSION_TTL_HOURS=24
```

密钥与密码哈希只进后端进程环境变量，前端读不到。缺少 `AUTH_USERNAME` / `AUTH_PASSWORD_HASH` 时后端会直接退出。

**5. 分别启动后端和前端**

```bash
# 终端 1 — 后端
npm run dev:backend

# 终端 2 — 前端
npm run dev:frontend
```

浏览器打开终端里提示的地址（一般是 **http://localhost:5173/**）即可聊天。页头可切换白名单内的模型。

### 常用地址

| 服务 | 地址 |
|------|------|
| 前端页面 | http://localhost:5173 |
| 后端 HTTP | http://localhost:3001 |
| 健康检查 | http://localhost:3001/health |
| WebSocket | `ws://localhost:3001/ws`（开发时由 Vite 把 `/ws` 代理到后端） |

### 只想看界面、暂时不接大模型？

把 `frontend/src/config/app.ts` 里的 `USE_MOCK` 改成 `true`，可以**不启后端、不配 Key**先预览 UI（功能是模拟的）。

### 模型列表改哪里？

- 界面展示：`frontend/src/config/providers.ts`
- 服务端允许的模型 id：`shared/src/config/models.ts`  

两边需要保持一致，否则选了未放行的模型会被后端拒绝。

---

## 用 Docker 一键启动（可选）

先准备好环境变量（或 `.env.local`）里的 `DEEPSEEK_API_KEY`，再在根目录执行：

```bash
docker-compose up --build
```

按 `docker-compose.yml` 里的端口映射，在浏览器打开对应地址（常见是 http://localhost ）。

生产镜像里的 Nginx（`frontend/nginx.conf`）会把 **`/api`**、**`/ws`**、**`/health`** 反代到后端，与本地 Vite 代理一致；前端静态资源仍由 Nginx 直接提供。

---

## 安全说明（必读）

- API Key **只**写在服务端 `.env.local` 的 `DEEPSEEK_API_KEY`  
- 浏览器**不存储、不展示、不传输** Key  
- WebSocket 聊天载荷主要是内容 + 可选模型；带旧版 `apiKey` / `config` 的请求会被拒绝  
- 模型 id 必须过服务端白名单  
- 上生产时建议配置 `CORS_ORIGIN`，并用 HTTPS / WSS  

更完整的说明见：[`features-doc/ai-chat-page/decisions/001-api-key-server-side.md`](features-doc/ai-chat-page/decisions/001-api-key-server-side.md)。

---

## 怎么跑测试

```bash
# 后端单测
npm run test --workspace=backend

# 前端单测
npm run test --workspace=frontend
```

---

## 代码大概在哪（方便人肉定位）

```text
frontend/src/
├── pages/Chat/          # 聊天页：侧边栏、消息列表、输入框等
├── components/          # 通用布局、图标、连接提示等
├── apis/                # HTTP（会话）+ WebSocket 客户端
├── hooks/               # 聊天业务（发消息、切换会话等）
├── store/               # Zustand 状态与本地持久化
└── styles/              # 全局样式与设计变量

backend/src/
├── server.ts            # HTTP 接口 + 挂 WebSocket
├── store/               # SQLite 会话 / 消息 / 生成任务
├── websocket/           # 连接与消息处理
├── generation/          # 流式生成与停止
├── adapters/            # 调大模型的适配层
└── config/              # 环境变量与服务端凭证
```

---

## 常见问题

| 现象 | 可以怎么查 |
|------|------------|
| Node 报奇怪的 `engine` 错 | 先 `nvm use`，确认 `node -v` ≥ 20 |
| 后端一启动就退出：缺少 Key | 在根目录 `.env.local` 写好 `DEEPSEEK_API_KEY`，再重启后端 |
| 后端一启动就退出：缺少 AUTH / hash 无效 | 在 `.env.local` 写好 `AUTH_USERNAME` 与合法的 `AUTH_PASSWORD_HASH`（见上文生成命令）；不要设置明文 `AUTH_PASSWORD` |
| WebSocket 连不上 | 确认后端已启动，且 `USE_MOCK` 为 `false`；看 Vite 是否代理了 `/ws` |
| 调大模型返回 401 | 检查**服务端**的 Key / `DEEPSEEK_API_URL` 是否正确 |
| 提示模型不被允许 | 只用 `shared/src/config/models.ts` 白名单里的 id |
| 刷新后对话不对 | 看后端是否在跑、当前是否选中了侧边栏里的会话；浏览器需允许 localStorage |
| Docker 占了 80 端口 | 改 `docker-compose.yml` 里前端端口映射 |

---

## 文档从哪读

| 想了解… | 去看 |
|---------|------|
| 功能现状（已实现 / 未实现） | [`features-doc/ai-chat-page/engineering/current-state.md`](features-doc/ai-chat-page/engineering/current-state.md) |
| 文档目录怎么用 | [`features-doc/README.md`](features-doc/README.md) |
| 接口与协议约定 | [`features-doc/shared/api-contracts.md`](features-doc/shared/api-contracts.md) |

---

## 许可

Private — 仅用于面试 / 演示。

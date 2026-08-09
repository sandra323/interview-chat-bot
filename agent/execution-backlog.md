# Execution Backlog

## 1. Execution Strategy

**Implementation approach**: Bottom-up, dependency-first. Start with shared types and project scaffolding, build backend core before frontend UI, integrate early, and save deployment/QA for last. Each task is sized for one focused work session (30-90 min).

**Dependency logic**:
- Shared types → both frontend and backend depend on them → do first
- Backend WebSocket server → frontend hook needs a server to connect to → build backend core before frontend integration
- Frontend store → UI components depend on it → build store before UI
- WebSocket hook → chat UI needs it to send messages → build hook before wiring UI to backend
- Deployment → depends on everything working → do last

**Early validation points**:
- After M2: Test WebSocket server with `wscat` or a simple browser console — verify connection, echo, and LLM proxy works
- After M3: Verify store persistence + WebSocket hook connection/reconnection in browser dev tools
- After M4: Full manual E2E with real LLM API

**Working pattern**: One task at a time. Implement → verify → commit → next task. No multi-task parallel generation.

---

## 2. Milestones

| # | Milestone | Goal | Complete When |
|---|-----------|------|---------------|
| M1 | Project Foundation | Monorepo scaffolded, shared types defined, dev tools configured | Both frontend and backend can start; shared types importable from both |
| M2 | Backend Core | WebSocket server with LLM proxy fully functional | Can send a message via WebSocket and get an LLM reply back |
| M3 | Frontend Foundation | React app with state management and WebSocket connectivity | App loads, store persists to localStorage, WebSocket connects/reconnects |
| M4 | Frontend UI | Complete chat interface with config, messages, loading, errors | User can have a full multi-turn conversation through the UI |
| M5 | Integration & Polish | End-to-end flow verified, edge cases handled, UX polished | All acceptance criteria from PRD pass manually |
| M6 | Deployment & QA | Dockerized, deployable, QA-verified | `docker-compose up` gives a working app; all QA checks pass |

---

## 3. Task Breakdown by Milestone

### Milestone 1: Project Foundation

**Goal**: Set up the monorepo structure, shared type definitions, and development tooling so both frontend and backend teams (or a single developer) can start implementing immediately.

---

#### Task 1.1: Monorepo Scaffolding

**Purpose**
- Establish the project directory structure and build tooling so frontend and backend can coexist in one repo with shared types.

**Scope**
- Create root directory structure: `frontend/`, `backend/`, `shared/`
- Root `package.json` with workspaces (or simple path references)
- Root `tsconfig.base.json` with shared compiler options
- `.gitignore` for node_modules, dist, env files
- `README.md` with project setup instructions
- NOT included: actual frontend or backend implementation code

**Suggested implementation notes**
- Use npm workspaces for simplicity (no Lerna/Turborepo overhead for MVP)
- `shared/` exports TypeScript types only — no runtime code
- Frontend and backend each have their own `tsconfig.json` that extends the base
- File structure:
  ```
  /
  ├── package.json          (workspaces: ["frontend", "backend", "shared"])
  ├── tsconfig.base.json
  ├── .gitignore
  ├── README.md
  ├── shared/
  │   ├── package.json
  │   └── src/
  ├── frontend/
  │   ├── package.json
  │   └── tsconfig.json
  └── backend/
      ├── package.json
      └── tsconfig.json
  ```

**Acceptance criteria**
- `npm install` succeeds from root
- `shared/` package can be imported by both `frontend/` and `backend/` TypeScript projects
- Both `frontend/` and `backend/` have their own `package.json` with name, version, scripts
- `.gitignore` covers node_modules, dist/, .env, .env.local
- README has: project description, install steps, how to run frontend, how to run backend

**Suggested commit granularity**
1. **Commit: "chore: scaffold monorepo structure"** — directory structure, root package.json with workspaces, tsconfig.base.json, .gitignore
2. **Commit: "docs: add README with setup instructions"** — README.md with project overview and setup steps

**Dependencies**
- None

**Risks / failure modes**
- Workspace path resolution issues between frontend/backend and shared — verify with a test import after scaffolding
- TypeScript project references complexity — keep it simple: shared types are just .ts files imported via relative path or workspace alias

---

#### Task 1.2: Shared Type Definitions

**Purpose**
- Define all shared data contracts so frontend and backend can implement against the same types independently.

**Scope**
- `Message` type (id, role, content, timestamp, status)
- `ChatRole` type (`'user' | 'assistant'`)
- `Config` type (apiUrl, apiKey, model)
- WebSocket message protocol types (client→server and server→client union types)
- `LLMAdapter` interface + related types (ChatMessage, LLMConfig)
- Error code enum/union
- NOT included: frontend-only UI state types, backend-only internal state types

**Suggested implementation notes**
- File: `shared/src/types.ts`
- Use TypeScript `type` and `interface` (no enums — use string unions for better tree-shaking)
- WebSocket protocol types should use discriminated unions on `type` field:
  ```typescript
  type ClientMessage = 
    | { type: 'chat'; content: string; config: Config }
    | { type: 'ping' };
  
  type ServerMessage =
    | { type: 'connected'; connectionId: string }
    | { type: 'reply'; content: string; messageId: string }
    | { type: 'error'; code: ErrorCode; message: string };
  ```
- Error codes: `'INVALID_CONFIG' | 'LLM_API_ERROR' | 'NETWORK_ERROR' | 'REQUEST_TIMEOUT' | 'ALREADY_PROCESSING'`

**Acceptance criteria**
- All types compile without errors
- Frontend can import types from `@ai-chat/shared` (or workspace alias)
- Backend can import types from `@ai-chat/shared`
- Type definitions match the contracts defined in build-spec.md section 6 and 7
- No runtime code in shared — types only

**Suggested commit granularity**
1. **Commit: "feat(shared): define core data types"** — Message, ChatRole, Config, ChatMessage, LLMConfig types
2. **Commit: "feat(shared): define WebSocket protocol types"** — ClientMessage, ServerMessage discriminated unions, ErrorCode union

**Dependencies**
- Task 1.1 (monorepo structure)

**Risks / failure modes**
- Type drift between spec and implementation — reference build-spec.md sections 6-7 as source of truth
- Over-defining types (YAGNI) — only define what's needed for MVP; add more as needed

---

#### Task 1.3: Backend Project Setup

**Purpose**
- Set up the Node.js backend project with TypeScript, Express, and WebSocket dependencies.

**Scope**
- Backend `package.json` with dependencies: `express`, `ws`, `cors`
- Dev dependencies: `typescript`, `tsx` (dev runner), `@types/node`, `@types/express`, `@types/ws`, `@types/cors`, `vitest`
- `tsconfig.json` extending base, targeting ES2022, module NodeNext
- Entry point: `src/index.ts` (basic Express server with health endpoint)
- `src/server.ts` — Express app factory
- Dev script: `npm run dev` (tsx watch)
- Build script: `npm run build` (tsc)
- NOT included: WebSocket server implementation, LLM adapter

**Suggested implementation notes**
- Use `tsx` for dev (faster than ts-node, no config needed)
- Express server should:
  - Listen on port 3001 (or PORT env var)
  - Serve `GET /health` returning `{ status: 'ok', uptime: process.uptime() }`
  - Not yet handle WebSocket (that's Task 2.1)
- File structure:
  ```
  backend/src/
  ├── index.ts      (entry point — starts server)
  └── server.ts     (Express app factory)
  ```

**Acceptance criteria**
- `npm run dev` starts the server without errors
- `GET http://localhost:3001/health` returns `{"status":"ok","uptime":...}`
- TypeScript compiles with zero errors (`npx tsc --noEmit`)
- Project uses shared types package (import from `@ai-chat/shared` resolves)

**Suggested commit granularity**
1. **Commit: "chore(backend): set up Node.js + TypeScript project"** — package.json, tsconfig.json, dependencies
2. **Commit: "feat(backend): add Express server with health endpoint"** — server.ts, index.ts, health route

**Dependencies**
- Task 1.1, Task 1.2

**Risks / failure modes**
- TypeScript version mismatch between projects — use the same version across all packages
- Port conflicts — use 3001 for backend, 5173 (Vite default) for frontend

---

#### Task 1.4: Frontend Project Setup

**Purpose**
- Set up the React + Vite + Tailwind frontend project with basic layout shell.

**Scope**
- Create Vite React + TypeScript project in `frontend/`
- Install and configure Tailwind CSS
- Install Zustand
- Basic app layout: header + main content area + footer
- NOT included: chat UI, store, WebSocket hook

**Suggested implementation notes**
- Use `npm create vite@latest frontend -- --template react-ts` (or manual setup)
- Tailwind setup: install `tailwindcss`, `postcss`, `autoprefixer`; create config files
- Zustand: install `zustand`
- Basic layout components:
  - `App.tsx` — main layout
  - `components/Layout/Header.tsx` — app title bar
  - `components/Layout/Main.tsx` — content area (placeholder)
- File structure:
  ```
  frontend/src/
  ├── App.tsx
  ├── main.tsx
  ├── index.css        (Tailwind directives)
  ├── components/
  │   └── Layout/
  │       ├── Header.tsx
  │       └── Main.tsx
  └── vite-env.d.ts
  ```
- Dev server on port 5173

**Acceptance criteria**
- `npm run dev` starts Vite dev server without errors
- Page loads at `http://localhost:5173` with header + main content area
- Tailwind classes work (verify with a styled element)
- TypeScript compiles with zero errors
- Shared types package is importable

**Suggested commit granularity**
1. **Commit: "chore(frontend): set up Vite + React + TypeScript"** — Vite project, dependencies, tsconfig
2. **Commit: "feat(frontend): add Tailwind CSS configuration"** — Tailwind setup, config files, index.css
3. **Commit: "feat(frontend): add basic layout shell"** — Header, Main components, App layout

**Dependencies**
- Task 1.1, Task 1.2

**Risks / failure modes**
- Vite + workspace resolution — may need to configure `vite.config.ts` resolve.alias for shared package
- Tailwind content paths — make sure `tailwind.config.js` content array includes all source files (including shared if relevant)

---

### Milestone 2: Backend Core

**Goal**: Build a fully functional WebSocket server that can accept connections, proxy LLM API calls, and return responses. Testable via WebSocket client tools.

---

#### Task 2.1: WebSocket Server Skeleton

**Purpose**
- Implement the WebSocket server that accepts connections, manages per-connection state, and handles basic message routing.

**Scope**
- Integrate `ws` library with Express server
- WebSocket upgrade handler at `/ws` path
- Per-connection state management (connectionId, messages array, isProcessing flag)
- Connection lifecycle: on connect → send `connected` message; on close → cleanup
- Basic message parsing (JSON parse + type validation)
- Echo handler for testing (send back what was received)
- NOT included: LLM integration, rate limiting, error handling beyond basic parse errors

**Suggested implementation notes**
- New file: `backend/src/websocket/connectionManager.ts`
  - `ConnectionManager` class managing a Map of connectionId → connection state
  - Methods: `addConnection`, `removeConnection`, `getConnection`
- New file: `backend/src/websocket/handleMessage.ts`
  - Message type discrimination and routing
  - For now, echo handler for `chat` type (send back a mock reply)
- Modify `server.ts` to attach WebSocket server to HTTP server
- Connection state type:
  ```typescript
  interface ConnectionState {
    connectionId: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    isProcessing: boolean;
    ws: WebSocket;
  }
  ```
- Generate connectionId using `crypto.randomUUID()`

**Acceptance criteria**
- Client can connect to `ws://localhost:3001/ws`
- On connect, server sends `{ type: 'connected', connectionId: '...' }`
- Sending `{ type: 'chat', content: 'hello', config: {...} }` gets a response back (echo or mock)
- Connection state is cleaned up when client disconnects
- Invalid JSON messages are handled gracefully (connection stays open, error sent back)

**Suggested commit granularity**
1. **Commit: "feat(backend): add WebSocket server with connection management"** — ws integration, connection manager, connect/disconnect lifecycle
2. **Commit: "feat(backend): add basic message routing with echo handler"** — message parsing, type discrimination, echo for testing

**Dependencies**
- Task 1.3 (backend setup)

**Risks / failure modes**
- Express + ws integration — need to attach WebSocket server to the same HTTP server, not create a separate one
- Memory leak from unclosed connections — verify cleanup on close and error events
- Message size — no limit yet; add a note that size limiting comes later

---

#### Task 2.2: LLM Adapter — OpenAI-Compatible Implementation

**Purpose**
- Implement the LLM adapter layer that normalizes requests/responses for OpenAI-compatible APIs.

**Scope**
- `LLMAdapter` interface (from shared types, or defined in backend types)
- `OpenAICompatibleAdapter` class implementing the interface
- Request shaping: transform messages array + config into OpenAI chat completions request body
- Response shaping: extract `choices[0].message.content` from response
- Error normalization: HTTP errors → typed error objects with code + message
- Request timeout (30s default)
- Unit tests with mocked fetch

**Suggested implementation notes**
- File: `backend/src/adapters/openaiCompatible.ts`
- File: `backend/src/adapters/types.ts` (adapter interface, error types)
- File: `backend/src/adapters/index.ts` (export default adapter)
- Use native `fetch` (Node 18+)
- Error classes or typed error objects:
  ```typescript
  class LLMAdapterError extends Error {
    code: ErrorCode;
    constructor(code: ErrorCode, message: string) { ... }
  }
  ```
- Test file: `backend/src/adapters/openaiCompatible.test.ts`
  - Test: successful response extraction
  - Test: 401 error → LLM_API_ERROR with detail
  - Test: network error → NETWORK_ERROR
  - Test: timeout → REQUEST_TIMEOUT
  - Use Vitest with `vi.mock` for fetch

**Acceptance criteria**
- `adapter.chat(messages, config)` returns the reply content string on success
- HTTP non-2xx responses throw `LLMAdapterError` with appropriate code
- Network failures throw `LLMAdapterError` with `NETWORK_ERROR` code
- Request times out after 30s with `REQUEST_TIMEOUT` code
- All unit tests pass
- Request body matches OpenAI chat completions format: `{ model, messages: [{role, content}] }`
- Authorization header uses `Bearer <apiKey>`

**Suggested commit granularity**
1. **Commit: "feat(backend): add LLM adapter interface and error types"** — types.ts with interface and error classes
2. **Commit: "feat(backend): implement OpenAI-compatible adapter"** — openaiCompatible.ts with request/response shaping
3. **Commit: "test(backend): add unit tests for LLM adapter"** — Vitest tests for success and error cases

**Dependencies**
- Task 1.2 (shared types), Task 1.3 (backend setup)

**Risks / failure modes**
- Different providers may have slightly different response formats — keep adapter flexible, document assumptions
- Fetch timeout in Node — use `AbortController` with setTimeout for timeout
- Test flakiness from real network — all tests must mock fetch; no real API calls in tests

---

#### Task 2.3: Wire Chat Flow — WebSocket to LLM Adapter

**Purpose**
- Connect the WebSocket message handler to the LLM adapter so that chat messages are actually processed by the LLM API.

**Scope**
- Replace echo handler with real LLM call
- Per-connection processing lock (reject if isProcessing)
- Append user message to connection.messages before calling LLM
- Append assistant message to connection.messages on success
- Send `reply` message on success
- Send `error` message on failure
- Config validation (check apiUrl + apiKey present)
- Basic input validation (content not empty, max length)
- NOT included: rate limiting, streaming, message history sync on reconnect

**Suggested implementation notes**
- Modify `handleMessage.ts` chat handler:
  1. Validate config (apiUrl + apiKey required) → if invalid, send `INVALID_CONFIG` error
  2. Validate content (non-empty string, max 10000 chars) → if invalid, send error
  3. Check isProcessing → if true, send `ALREADY_PROCESSING` error
  4. Set isProcessing = true
  5. Append user message to connection.messages
  6. Call `adapter.chat(connection.messages, config)`
  7. On success: append assistant message, send `reply`, set isProcessing = false
  8. On error: send `error`, set isProcessing = false (keep user message in history)
- Use the default OpenAICompatibleAdapter instance
- Generate messageId for replies using `crypto.randomUUID()`

**Acceptance criteria**
- Sending a chat message over WebSocket triggers a real LLM API call (test with actual API key)
- Response comes back as `{ type: 'reply', content: '...', messageId: '...' }`
- Multi-turn: second message includes first message + reply as context
- Sending while already processing returns `ALREADY_PROCESSING` error
- Missing apiUrl or apiKey returns `INVALID_CONFIG` error
- Empty content returns an error (define specific code or generic)
- Connection state's messages array grows with each turn

**Suggested commit granularity**
1. **Commit: "feat(backend): wire chat messages to LLM adapter"** — replace echo with real LLM call, success path
2. **Commit: "feat(backend): add input validation and error handling"** — config validation, content validation, processing lock, error responses

**Dependencies**
- Task 2.1 (WebSocket server), Task 2.2 (LLM adapter)

**Risks / failure modes**
- isProcessing not reset on error → always check both try/catch paths
- Connection state mutation race conditions — Node is single-threaded, but async calls can interleave if not careful; the processing lock should prevent this
- Large message payloads — add max length check before processing

---

#### Task 2.4: Backend Hardening — Logging, Rate Limiting, Error Handling

**Purpose**
- Add production-readiness basics: structured logging, basic rate limiting, payload size limits, and robust error handling.

**Scope**
- Structured logging (simple console with timestamps + JSON format, or pino if lightweight)
- Per-connection rate limit: max 10 messages per minute
- WebSocket message size limit: 1MB max
- Error boundary around message handler (uncaught errors don't crash server)
- Graceful shutdown (close all connections on SIGTERM)
- API key redaction in logs (never log the key)
- NOT included: full observability stack, metrics, alerting

**Suggested implementation notes**
- Logger: create `backend/src/utils/logger.ts`
  - Simple wrapper around console with timestamp + level
  - Methods: `info`, `warn`, `error`
  - Never log API keys — add a `redactConfig(config)` utility
- Rate limiter: `backend/src/utils/rateLimiter.ts`
  - Per-connection token bucket or simple timestamp array
  - 10 messages / minute sliding window
- Message size: use `ws` library's `maxPayload` option
- Graceful shutdown: listen for SIGTERM/SIGINT, close all WS connections, close HTTP server
- Wrap message handler in try/catch as safety net

**Acceptance criteria**
- Server logs connection open/close events with timestamps and connectionId (no API key in logs)
- Server logs LLM call duration and error codes (no message content or API key)
- Sending >10 messages in 60s from one connection gets rate limited (error response with code `RATE_LIMITED`)
- Messages >1MB are rejected
- Uncaught errors in message handler send a generic error back to client instead of crashing
- Server shuts down gracefully on Ctrl+C (closes connections, logs shutdown)

**Suggested commit granularity**
1. **Commit: "feat(backend): add structured logging with redaction"** — logger utility, integrate into connection manager and message handler
2. **Commit: "feat(backend): add rate limiting and payload size limits"** — rate limiter utility, integrate into message handler, maxPayload config
3. **Commit: "feat(backend): add graceful shutdown and error boundary"** — SIGTERM handler, try/catch around message handler

**Dependencies**
- Task 2.3 (chat flow wired)

**Risks / failure modes**
- Rate limiting state per-connection vs global — MVP is per-connection only; document this
- Logger performance — keep it simple; don't over-engineer
- Graceful shutdown race conditions — make sure to wait for in-flight LLM calls or cancel them

---

### Milestone 3: Frontend Foundation

**Goal**: Build the non-UI foundation of the React app: state management with persistence, and WebSocket connectivity with auto-reconnect.

---

#### Task 3.1: Zustand Store with localStorage Persistence

**Purpose**
- Create the application state store with message management, config management, and localStorage persistence.

**Scope**
- Zustand store with:
  - `messages` array (Message type)
  - `config` object (Config type — apiUrl, apiKey, model)
  - `ui` state (loading: boolean, error: string | null, connectionStatus: 'connecting' | 'open' | 'closed')
  - Actions:
    - `addMessage(message: Message)`
    - `updateMessage(id, updates)`
    - `setConfig(config: Partial<Config>)`
    - `setLoading(boolean)`
    - `setError(string | null)`
    - `setConnectionStatus(status)`
    - `clearChat()`
- Persist middleware: persist `messages` and `config` to localStorage
- Store file + types
- Unit tests for store actions

**Suggested implementation notes**
- File: `frontend/src/store/useChatStore.ts`
- Use `zustand` with `persist` middleware
- localStorage key: `ai-chat-state`
- Store shape:
  ```typescript
  interface ChatState {
    messages: Message[];
    config: Config;
    ui: {
      loading: boolean;
      error: string | null;
      connectionStatus: 'connecting' | 'open' | 'closed';
    };
    // actions...
  }
  ```
- `clearChat()` should empty messages array but keep config
- Test file: `frontend/src/store/useChatStore.test.ts`
  - Test: addMessage appends to array
  - Test: clearChat empties messages
  - Test: setConfig updates config
  - Test: persist middleware saves to localStorage (mock localStorage)

**Acceptance criteria**
- Store can be imported and used in components
- Adding a message updates the messages array
- Clearing chat empties messages but keeps config
- Config updates persist to localStorage
- Messages persist to localStorage
- Page refresh restores messages and config from localStorage
- All unit tests pass

**Suggested commit granularity**
1. **Commit: "feat(frontend): create Zustand store with message and config state"** — store definition, core actions
2. **Commit: "feat(frontend): add localStorage persistence to store"** — persist middleware integration
3. **Commit: "test(frontend): add unit tests for chat store"** — Vitest tests for actions and persistence

**Dependencies**
- Task 1.4 (frontend setup)

**Risks / failure modes**
- Zustand persist middleware version compatibility — check docs for current API
- localStorage quota — MVP won't hit it, but be aware
- Hydration mismatch — store starts empty then hydrates from localStorage; handle this in UI (show loading or just render after mount)

---

#### Task 3.2: WebSocket Client Hook

**Purpose**
- Create a custom React hook that manages WebSocket connection lifecycle, message sending, and auto-reconnection.

**Scope**
- `useWebSocket()` hook with:
  - Connection status state
  - `sendMessage(message: ClientMessage)` function
  - Message event handler registration (callback for incoming messages)
  - Auto-reconnect with exponential backoff (3 attempts: 1s, 2s, 4s)
  - Manual `connect()` and `disconnect()` functions
- Hook connects when config is available (apiUrl + apiKey present)
- JSON serialization/deserialization of messages
- Error handling (connection errors, message parse errors)
- NOT included: integration with store (that's Task 3.3)

**Suggested implementation notes**
- File: `frontend/src/hooks/useWebSocket.ts`
- Hook signature:
  ```typescript
  function useWebSocket(options: {
    url: string;
    onMessage?: (msg: ServerMessage) => void;
    onStatusChange?: (status: ConnectionStatus) => void;
    autoConnect?: boolean;
  }): {
    status: ConnectionStatus;
    send: (msg: ClientMessage) => void;
    connect: () => void;
    disconnect: () => void;
  }
  ```
- Reconnect logic:
  - Track attempt count
  - On close (not manual disconnect): schedule reconnect with backoff
  - Reset attempt count on successful connection
  - Max 3 attempts; after that, stop retrying and set status to 'closed'
- Use `useRef` for WebSocket instance (prevents re-renders)
- Use `useCallback` for send/connect/disconnect to stabilize references
- WebSocket URL: `ws://${window.location.host}/ws` in production, or configurable dev URL

**Acceptance criteria**
- Hook establishes WebSocket connection when called with autoConnect
- `send()` sends JSON-serialized message over WebSocket
- `onMessage` callback fires with parsed ServerMessage when server sends a message
- Connection status reflects current state (connecting, open, closed)
- On unexpected disconnect, hook attempts to reconnect 3 times with exponential backoff
- Manual `disconnect()` does not trigger reconnect
- `connect()` can be called to manually establish connection after disconnect
- Invalid JSON from server is handled (logs error, doesn't crash)

**Suggested commit granularity**
1. **Commit: "feat(frontend): add useWebSocket hook with basic connect/send"** — core hook, connection management, send function
2. **Commit: "feat(frontend): add auto-reconnect with exponential backoff"** — reconnect logic, backoff calculation, attempt tracking

**Dependencies**
- Task 1.4 (frontend setup), Task 2.1 (WebSocket server — for testing)

**Risks / failure modes**
- Reconnect storms — make sure manual disconnect doesn't trigger reconnect; use a flag
- Memory leaks from event listeners — clean up all listeners on unmount
- WebSocket readyState checks — send should queue or fail gracefully if not open
- Dev server proxy — Vite dev server needs proxy config for `/ws` to backend

---

#### Task 3.3: Store + WebSocket Integration

**Purpose**
- Wire the WebSocket hook into the Zustand store so that chat messages flow through the store and WebSocket responses update the store.

**Scope**
- Create a service layer or custom hook that:
  - Connects WebSocket when config is present
  - Sends chat messages via WebSocket when user sends
  - Updates store on incoming reply/error messages
  - Syncs connection status to store
- Handle the full send flow:
  1. User triggers send → add user message to store → set loading → send via WS
  2. Receive reply → add AI message to store → clear loading
  3. Receive error → set error in store → clear loading
- Config change → reconnect with new config? (MVP: reconnect only on manual trigger or page refresh)
- NOT included: UI components

**Suggested implementation notes**
- File: `frontend/src/hooks/useChatService.ts` — wraps useWebSocket + store actions
- Or: integrate directly in store with a middleware — but hooks are cleaner
- `useChatService` hook:
  - Reads config from store
  - Manages WebSocket connection
  - Exposes `sendMessage(text)` function that orchestrates the flow
  - Updates store on WS events
- App component calls `useChatService()` to set up the connection
- On mount: if config exists, connect; if not, wait for config to be set

**Acceptance criteria**
- When config is set in store, WebSocket connection is established
- Calling `sendMessage("hello")` adds user message to store, sets loading, sends via WS
- Receiving a `reply` message from server adds assistant message to store and clears loading
- Receiving an `error` message sets error in store and clears loading
- Connection status in store reflects actual WebSocket state
- Page refresh: store hydrates from localStorage, WS reconnects automatically

**Suggested commit granularity**
1. **Commit: "feat(frontend): wire WebSocket hook to chat store"** — useChatService hook, send flow, reply/error handling
2. **Commit: "feat(frontend): auto-connect on mount when config exists"** — mount logic, config-driven connection

**Dependencies**
- Task 3.1 (store), Task 3.2 (WebSocket hook)

**Risks / failure modes**
- Race condition: send before connection is open — queue message or show error
- Double-connection in React StrictMode dev — use ref to track connection state, handle cleanup properly
- Store persistence + WS connection timing — don't try to connect before store hydrates

---

### Milestone 4: Frontend UI

**Goal**: Build the complete chat interface so users can have real conversations through the UI.

---

#### Task 4.1: Message List + Message Bubble Components

**Purpose**
- Build the core chat display: a scrollable message list with user messages on the right and AI messages on the left.

**Scope**
- `MessageList` component:
  - Renders list of messages from store
  - Auto-scrolls to bottom when new messages arrive
  - Empty state placeholder when no messages
- `MessageBubble` component:
  - Renders single message with role-based styling
  - User messages: right-aligned, colored background
  - AI messages: left-aligned, different background
  - Shows message content (plain text for MVP)
  - Shows timestamp (optional, subtle)
- NOT included: loading indicator bubble, error states, markdown rendering

**Suggested implementation notes**
- Files:
  - `frontend/src/components/Chat/MessageList.tsx`
  - `frontend/src/components/Chat/MessageBubble.tsx`
- MessageBubble props: `{ message: Message }`
- Use Tailwind for styling:
  - User: `bg-blue-500 text-white rounded-2xl rounded-br-sm ml-auto max-w-[80%]`
  - AI: `bg-gray-100 text-gray-900 rounded-2xl rounded-bl-sm mr-auto max-w-[80%]`
- Auto-scroll: use `useRef` on container, `useEffect` on messages length, scroll to bottom
- Empty state: centered text "Start a conversation"

**Acceptance criteria**
- Messages from store render in chronological order
- User messages appear on the right side
- AI messages appear on the left side
- New message auto-scrolls to bottom
- Empty state shows when message list is empty
- Long text wraps correctly within max-width bubbles
- Messages are readable with good contrast

**Suggested commit granularity**
1. **Commit: "feat(frontend): add MessageBubble component"** — single message bubble with role styling
2. **Commit: "feat(frontend): add MessageList with auto-scroll"** — message list component, auto-scroll, empty state

**Dependencies**
- Task 3.1 (store)

**Risks / failure modes**
- Auto-scroll fighting with user scroll — for MVP, always scroll to bottom on new message; add "scroll to bottom" button later if needed
- Performance with many messages — MVP is fine with simple map; virtualization not needed
- Timestamp format — keep it simple (HH:MM) or omit for MVP

---

#### Task 4.2: Input Area — Text Input + Send Button

**Purpose**
- Build the message input area with text input, send button, and Enter key submission.

**Scope**
- `ChatInput` component:
  - Textarea or input field for message entry
  - Send button
  - Enter key to send (Shift+Enter for newline if textarea)
  - Disabled state when loading or no connection
  - Character count or max length indicator (optional)
- Integration with store/chat service:
  - On send: call `sendMessage(text)` from chat service
  - Clear input after send
- NOT included: file upload, voice input, emoji picker

**Suggested implementation notes**
- File: `frontend/src/components/Chat/ChatInput.tsx`
- Use `<textarea>` for multi-line support
- Enter key handler: on KeyDown, if Enter and not Shift, prevent default and send
- Disabled state: grayed out input + button, cursor not-allowed
- Read loading state from store to disable input
- Auto-focus input on mount
- Max length: 10000 characters (match backend validation)

**Acceptance criteria**
- User can type text in the input field
- Clicking send button sends the message
- Pressing Enter sends the message
- Shift+Enter creates a new line (if textarea)
- Input is disabled when loading is true
- Input clears after sending
- Empty message doesn't send (button disabled or no-op)
- Input auto-focuses when page loads

**Suggested commit granularity**
1. **Commit: "feat(frontend): add ChatInput with textarea and send button"** — input component, basic send functionality
2. **Commit: "feat(frontend): add Enter-to-send and disabled states"** — keyboard handling, loading disabled state, auto-focus

**Dependencies**
- Task 3.3 (store + WS integration)

**Risks / failure modes**
- Textarea height management — for MVP, fixed height or auto-grow with simple CSS
- Double-send on Enter + click — prevent with loading state check
- Mobile keyboard issues — out of scope for MVP

---

#### Task 4.3: Loading Indicator

**Purpose**
- Show a visual loading state while waiting for AI responses.

**Scope**
- Typing indicator / loading bubble in the message list
- "AI is thinking..." text with animated dots or pulse
- Appears when loading state is true
- Disappears when loading state is false
- NOT included: progress bar, token count, streaming indicator

**Suggested implementation notes**
- Can be part of MessageList or a separate `TypingIndicator` component
- Render as an AI-aligned message bubble with animated content
- Animation: three bouncing dots or pulsing ellipsis
- Show only when `store.ui.loading === true`
- Position: after the last message in the list

**Acceptance criteria**
- Loading indicator appears when a message is sent and waiting for reply
- Loading indicator disappears when reply is received or error occurs
- Indicator is styled as an AI message (left-aligned)
- Animation is visible and smooth
- Doesn't cause layout shift when appearing/disappearing (reserve space or smooth transition)

**Suggested commit granularity**
1. **Commit: "feat(frontend): add typing/loading indicator"** — loading bubble component, animation, integration with loading state

**Dependencies**
- Task 4.1 (message list)

**Risks / failure modes**
- Loading indicator not showing for brief responses — that's fine, it's just fast
- Animation performance — keep it CSS-only, no JS animation

---

#### Task 4.4: Config Panel

**Purpose**
- Allow users to configure LLM API URL, API key, and model.

**Scope**
- `ConfigPanel` component:
  - API URL input field
  - API key input field (password type, with show/hide toggle)
  - Model input field (text or select)
  - Save / apply button
  - Collapsible (can be hidden after config is set)
  - Validation: URL format, non-empty key
- Load current config from store on mount
- Save config to store (which persists to localStorage)
- Reconnect WebSocket after config change? (MVP: show "Save & Reconnect" button)
- NOT included: multiple configs, config import/export

**Suggested implementation notes**
- File: `frontend/src/components/Config/ConfigPanel.tsx`
- Can be a slide-in panel, modal, or top-of-page section — MVP: collapsible section at top or a settings modal
- Form fields:
  - API URL: text input, placeholder `https://api.openai.com/v1/chat/completions`
  - API Key: password input, placeholder `sk-...`
  - Model: text input, placeholder `gpt-4o-mini`
- Save button: disabled until all fields have values
- On save: `setConfig({ apiUrl, apiKey, model })` → trigger reconnect
- Show/hide toggle for API key: eye icon button
- Collapse: settings gear icon in header toggles panel

**Acceptance criteria**
- Config panel shows current config values from store
- User can edit all three fields
- Save button updates config in store (which persists to localStorage)
- After save, WebSocket connection uses new config (reconnects)
- API key field is masked by default, can be toggled visible
- Validation: save button disabled if any field is empty
- Config panel can be collapsed/expanded

**Suggested commit granularity**
1. **Commit: "feat(frontend): add ConfigPanel with form fields"** — config form, inputs, save to store
2. **Commit: "feat(frontend): add config panel toggle and API key visibility toggle"** — collapse/expand, show/hide key

**Dependencies**
- Task 3.1 (store)

**Risks / failure modes**
- Config change mid-conversation — should we keep messages? Yes, messages are independent of config
- Reconnect timing — make sure old connection is closed before opening new one
- URL validation — basic check (starts with http), don't over-validate

---

#### Task 4.5: Error Handling UI

**Purpose**
- Display errors to users in a clear, non-intrusive way.

**Scope**
- `Toast` component for error notifications
- Show error messages from store
- Auto-dismiss after 5 seconds
- Manual dismiss (close button)
- Error types: API errors, network errors, connection errors
- Connection status indicator (subtle banner when disconnected)
- NOT included: error recovery actions, retry buttons (retry by sending again)

**Suggested implementation notes**
- File: `frontend/src/components/UI/Toast.tsx`
- File: `frontend/src/components/UI/ConnectionBanner.tsx`
- Toast:
  - Position: top-right or bottom-center
  - Red/orange background for errors
  - Shows error message text
  - Close button (X)
  - Auto-dismiss timer
- Connection banner:
  - Shows "Reconnecting..." or "Disconnected" at top
  - Subtle, not blocking interaction
  - Only shows when connection status is not 'open'

**Acceptance criteria**
- When store has an error, a toast appears with the error message
- Toast auto-dismisses after 5 seconds
- User can manually dismiss the toast
- Multiple errors: show latest, or stack (MVP: show latest only)
- Connection banner shows when WebSocket is not connected
- Banner is hidden when connection is open
- Error toast doesn't block chat interaction

**Suggested commit granularity**
1. **Commit: "feat(frontend): add Toast component for error display"** — toast component, auto-dismiss, close button
2. **Commit: "feat(frontend): add connection status banner"** — disconnected/reconnecting indicator

**Dependencies**
- Task 3.1 (store)

**Risks / failure modes**
- Toast stacking / multiple errors — keep it simple: show one at a time, new error replaces old
- Accessibility — add role="alert" or aria-live for screen readers
- Banner position — make sure it doesn't overlap with chat content

---

#### Task 4.6: Clear Chat Button

**Purpose**
- Add the ability to clear the current conversation.

**Scope**
- Clear chat button in header or config panel
- Confirmation before clearing? (MVP: simple confirm dialog or just clear with undo toast)
- Calls `clearChat()` action from store
- Also clears server-side message history? (MVP: no — server state is per-connection; on reconnect it starts fresh anyway)
- NOT included: delete individual messages, export chat

**Suggested implementation notes**
- Add button in header or config panel: "Clear Chat"
- On click: call `clearChat()` from store
- Optional: show a brief "Chat cleared" toast with undo (undo = restore from backup? MVP: no undo, just clear)
- After clear, empty state shows again

**Acceptance criteria**
- Clear chat button is visible in the UI
- Clicking it empties the message list
- Config is preserved (not cleared)
- Empty state appears after clearing
- localStorage is updated (messages removed)

**Suggested commit granularity**
1. **Commit: "feat(frontend): add clear chat button"** — button component, clearChat integration, confirmation or direct clear

**Dependencies**
- Task 4.1 (message list), Task 3.1 (store)

**Risks / failure modes**
- Accidental clear — add a simple confirm() for MVP, or a toast with brief undo window
- Server-side state inconsistency — after clear, next message will have only user message as context, which is correct

---

### Milestone 5: Integration & Polish

**Goal**: Verify end-to-end flow, fix edge cases, and polish UX to meet all acceptance criteria.

---

#### Task 5.1: End-to-End Integration Test

**Purpose**
- Verify the complete user flow works end-to-end with a real LLM API.

**Scope**
- Manual E2E test of all core flows:
  1. Fresh page load → configure API → send message → get reply
  2. Multi-turn conversation (5+ turns) → verify context carries
  3. Page refresh → verify history restored → continue conversation
  4. Clear chat → verify empty state → start new conversation
  5. Invalid API key → verify error toast
  6. Network disconnect → verify reconnect behavior
  7. Rapid sends → verify loading/disabled state
- Fix any bugs found during testing
- NOT included: automated E2E tests (Cypress/Playwright)

**Suggested implementation notes**
- Use a real LLM API endpoint for testing
- Test in both Chromium and Firefox (minimum)
- Document any bugs found, fix them, re-test
- Common issues to check:
  - WebSocket URL in production vs dev
  - Vite proxy config for WebSocket
  - CORS (shouldn't be an issue with same-origin via Nginx, but dev mode might have issues)
  - localStorage quota with long conversations
  - Message ordering / timing

**Acceptance criteria**
- All 7 test scenarios pass
- No console errors in normal flow
- Page loads under 1.5s (LCP measurement in dev tools)
- Multi-turn conversation correctly maintains context
- All PRD acceptance criteria are met:
  - Webpage opens normally under mainstream desktop browsers ✓
  - User can configure LLM request address and API key ✓
  - Single-round text question gets response ✓
  - At least 5 consecutive multi-turn conversations carry context ✓
  - Send button locked during API response ✓
  - Network error and API error show visible tips ✓
  - Chat history persists after page refresh ✓
  - One-click clear-chat function works ✓

**Suggested commit granularity**
1. **Commit: "fix: resolve E2E integration issues"** — bug fixes found during testing (multiple small fixes OK in one commit if related)
2. **Commit: "chore: add Vite WebSocket proxy config for dev"** — if needed for dev mode WS connection

**Dependencies**
- All M4 tasks complete

**Risks / failure modes**
- Dev vs production WebSocket URL differences — use relative URL `/ws` with proxy
- CORS in dev mode — configure Vite proxy
- Real API costs during testing — use cheap model, limit test messages

---

#### Task 5.2: UX Polish & Edge Cases

**Purpose**
- Polish the user experience and handle edge cases discovered during integration testing.

**Scope**
- Auto-scroll behavior refinement (only auto-scroll if user is already at bottom)
- Input area resizing (auto-grow textarea)
- Message content formatting (preserve newlines, basic whitespace handling)
- Loading state visual feedback (button spinner, input disabled state)
- Empty state improvements (helpful prompt when config missing)
- Keyboard navigation improvements (Tab order, focus management)
- "Scroll to bottom" button if user scrolls up
- NOT included: markdown rendering, code highlighting, themes

**Suggested implementation notes**
- Auto-scroll: check if user is within N pixels of bottom before auto-scrolling
- Textarea auto-grow: use `rows` attribute + onInput height adjustment, or CSS-only solution
- Message rendering: use `white-space: pre-wrap` to preserve newlines
- Focus management: after sending, keep focus on input; after receiving reply, don't steal focus
- Scroll-to-bottom button: appears when scrolled up, disappears when at bottom

**Acceptance criteria**
- Auto-scroll doesn't jump if user is reading older messages
- Textarea grows with content (up to a max height)
- Newlines in messages are preserved
- Tab order is logical: input → send button → config toggle
- Input stays focused after sending a message
- Scroll-to-bottom button appears when scrolled up and new messages arrive

**Suggested commit granularity**
1. **Commit: "feat(frontend): refine auto-scroll behavior"** — smart auto-scroll, scroll-to-bottom button
2. **Commit: "feat(frontend): polish input and message rendering"** — auto-grow textarea, pre-wrap messages, focus management

**Dependencies**
- Task 5.1 (E2E integration)

**Risks / failure modes**
- Over-polishing — stick to the list above, don't add new features
- Auto-scroll edge cases — test with fast incoming messages, long messages

---

#### Task 5.3: Accessibility Baseline

**Purpose**
- Meet the accessibility baseline defined in the build spec.

**Scope**
- Semantic HTML structure (main, section, button elements)
- Input has associated label
- Send button has aria-label
- Error messages announced via aria-live region
- Keyboard navigation works (Tab order, Enter to send)
- Color contrast meets WCAG AA minimum
- NOT included: full WCAG 2.1 AA compliance, screen reader testing beyond basic

**Suggested implementation notes**
- Audit current components with browser dev tools accessibility inspector
- Fix any issues found:
  - Add `<label>` for textarea (visually hidden if needed)
  - Add `aria-label` to icon-only buttons
  - Add `role="alert"` or `aria-live="polite"` to error toast container
  - Ensure buttons are `<button>` elements, not divs
  - Check color contrast with dev tools

**Acceptance criteria**
- All interactive elements are reachable via keyboard
- Send button has descriptive aria-label
- Error messages are announced by screen readers (aria-live region)
- Text input has associated label
- Color contrast ratio ≥ 4.5:1 for normal text
- No "div as button" patterns

**Suggested commit granularity**
1. **Commit: "a11y: add semantic HTML and ARIA attributes"** — labels, aria-labels, aria-live regions
2. **Commit: "a11y: fix color contrast and keyboard navigation"** — contrast adjustments, tab order fixes

**Dependencies**
- All UI components (M4 tasks)

**Risks / failure modes**
- Over-investing in accessibility for MVP — stick to baseline checklist
- Breaking visual design with contrast fixes — find colors that meet both design and contrast requirements

---

### Milestone 6: Deployment & QA

**Goal**: Containerize the app, set up deployment configuration, and run final QA.

---

#### Task 6.1: Dockerize Backend

**Purpose**
- Package the backend service into a Docker container for consistent deployment.

**Scope**
- Backend Dockerfile:
  - Multi-stage build (build stage + runtime stage)
  - Node 20 Alpine base image
  - Install production dependencies only
  - Expose port 3001
  - Healthcheck using /health endpoint
- .dockerignore for backend
- NOT included: Docker Compose (that's Task 6.3)

**Suggested implementation notes**
- File: `backend/Dockerfile`
- Multi-stage:
  1. Builder: `node:20-alpine`, install all deps, run `tsc` build
  2. Runner: `node:20-alpine`, copy built files + package.json, install prod deps only
- Healthcheck: `curl -f http://localhost:3001/health || exit 1`
- Environment variables: `PORT=3001`, `NODE_ENV=production`
- .dockerignore: node_modules, dist, .git, *.md, tests

**Acceptance criteria**
- `docker build -t ai-chat-backend .` succeeds
- `docker run -p 3001:3001 ai-chat-backend` starts the server
- `GET /health` returns 200 from the container
- Image size is reasonable (< 200MB target)
- No dev dependencies in production image

**Suggested commit granularity**
1. **Commit: "chore(backend): add Dockerfile and .dockerignore"** — multi-stage Dockerfile, dockerignore

**Dependencies**
- M2 complete (backend fully functional)

**Risks / failure modes**
- Workspace dependencies in Docker — shared package needs to be copied too; may need to adjust build context or use a monorepo-aware Docker setup
- Node Alpine native module issues — shouldn't be a problem with our deps (no native modules)

---

#### Task 6.2: Dockerize Frontend + Nginx

**Purpose**
- Build the frontend static assets and serve them with Nginx, also proxying WebSocket connections to the backend.

**Scope**
- Frontend Dockerfile (multi-stage: build with Node, serve with Nginx)
- Nginx configuration:
  - Serve static files from /usr/share/nginx/html
  - Proxy `/ws` to backend service (WebSocket proxy config)
  - Proxy `/health` to backend
  - SPA fallback (index.html for all routes)
  - Basic security headers (CSP, X-Content-Type-Options, etc.)
  - Gzip compression
- .dockerignore for frontend
- NOT included: SSL/TLS termination (assume upstream handles it, or add later)

**Suggested implementation notes**
- File: `frontend/Dockerfile`
  - Stage 1: `node:20-alpine`, build Vite app
  - Stage 2: `nginx:alpine`, copy dist + nginx.conf
- File: `frontend/nginx.conf`
  - WebSocket proxy needs: `proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`
  - Backend hostname: `backend` (Docker Compose service name)
  - SPA fallback: `try_files $uri $uri/ /index.html;`
- CSP: restrictive but functional — allow inline styles (Tailwind), connect to WS endpoint

**Acceptance criteria**
- `docker build -t ai-chat-frontend .` succeeds
- Container serves the frontend at port 80
- Static assets are served with gzip compression
- `/ws` proxies to backend WebSocket
- `/health` proxies to backend health endpoint
- SPA routing works (refresh on any path loads index.html)
- Security headers are present in response

**Suggested commit granularity**
1. **Commit: "chore(frontend): add Dockerfile with Nginx"** — multi-stage build, Nginx config
2. **Commit: "chore(frontend): add security headers and gzip to Nginx"** — CSP, security headers, gzip config

**Dependencies**
- M4 + M5 complete (frontend fully functional)

**Risks / failure modes**
- WebSocket proxy misconfiguration — make sure Upgrade and Connection headers are set correctly
- CSP too restrictive — test that the app works fully; may need to adjust for inline styles or eval
- Vite base path — if not served from root, need to set base in vite.config

---

#### Task 6.3: Docker Compose Setup

**Purpose**
- Create a single-command deployment with Docker Compose that runs frontend, backend, and Nginx.

**Scope**
- `docker-compose.yml` at root:
  - `backend` service — builds from backend/Dockerfile
  - `frontend` service — builds from frontend/Dockerfile, depends on backend
  - Port mapping: 80:80 (frontend)
  - Environment variables as needed
  - Restart policy
- NOT included: SSL certificates, domain configuration, production orchestration

**Suggested implementation notes**
- File: `docker-compose.yml`
- Services:
  - `backend`: build: ./backend, expose 3001, restart: unless-stopped
  - `frontend`: build: ./frontend, ports: "80:80", depends_on: backend, restart: unless-stopped
- Frontend Nginx proxies to `backend:3001` (Docker DNS)
- No volumes needed for MVP (no persistent data on server)
- Add `.env.example` file with any configurable env vars

**Acceptance criteria**
- `docker-compose up --build` starts both services
- App is accessible at `http://localhost`
- WebSocket connection works through Nginx proxy
- Both services restart automatically if they crash
- `docker-compose down` stops and removes everything cleanly

**Suggested commit granularity**
1. **Commit: "chore: add Docker Compose configuration"** — docker-compose.yml, .env.example

**Dependencies**
- Task 6.1, Task 6.2

**Risks / failure modes**
- Frontend starts before backend is ready — depends_on only waits for container start, not readiness; add healthcheck depends_on condition
- Port 80 conflicts — document that user may need to change the host port

---

#### Task 6.4: Final QA & Documentation

**Purpose**
- Run final quality assurance and update documentation for release.

**Scope**
- Full regression test of all MVP features
- Performance check (page load time, bundle size)
- Security check (no API key in logs, CSP headers, input validation)
- Update README with:
  - Quick start (docker-compose up)
  - Local development setup
  - Configuration guide
  - Architecture overview (link to build-spec)
  - Troubleshooting common issues
- Final code review pass
- NOT included: load testing, security audit, performance profiling beyond basic checks

**Suggested implementation notes**
- Create a QA checklist based on PRD acceptance criteria + build-spec non-functional requirements
- Run through checklist manually
- Check bundle size: `npm run build` in frontend, check dist size
- Check Lighthouse scores (performance, accessibility, best practices)
- Verify API key never appears in: server logs, browser URL, error messages
- README should be the first thing a new developer reads

**Acceptance criteria**
- All PRD acceptance criteria pass ✓
- Page load < 1.5s (on local / fast network)
- Frontend bundle < 200KB gzipped
- API key not exposed in logs, URLs, or error messages
- README has clear setup, config, and run instructions
- No console errors or warnings in normal usage
- Docker Compose one-command setup works on a clean machine

**Suggested commit granularity**
1. **Commit: "docs: update README with full setup and usage guide"** — comprehensive README
2. **Commit: "chore: final QA fixes and polish"** — any small fixes found during final QA

**Dependencies**
- All previous tasks

**Risks / failure modes**
- QA finds major issues — should have been caught in earlier milestones; if major, fix and re-test
- Documentation drift — make sure README reflects actual setup steps

---

## 4. Cross-Cutting Checks

Apply these checks throughout implementation. Verify at each task's completion, not just at the end.

### Type Safety
- All function parameters and return values have TypeScript types
- No `any` types without explicit justification comment
- WebSocket message handlers validate incoming data against type guards (don't trust client input)
- Shared types are the single source of truth — no re-defining types in frontend/backend

### Linting & Formatting
- Consistent code style (Prettier for formatting — add if team agrees)
- No unused imports or variables
- No `console.log` in production code (use logger or remove)
- ESLint with TypeScript plugin (add in M1 if desired, or defer to post-MVP)

### Loading / Error / Empty States
- Every async operation has a loading state
- Every API call has error handling
- Every list has an empty state
- Errors are user-friendly (not raw stack traces)
- Loading states don't cause layout shift

### Security
- API key never logged server-side
- API key stored only in localStorage (client-side)
- User input is sanitized before rendering (React default XSS protection is sufficient, but double-check any `dangerouslySetInnerHTML`)
- WebSocket messages validated on server (type, size, structure)
- No sensitive data in URL query params

### Responsiveness
- Layout works at 1024px width (minimum target)
- Layout works at 1920px width (common desktop)
- No horizontal scroll at minimum width
- Chat area grows/shrinks with viewport height

### Logging
- Backend: structured logs with timestamps and levels
- Backend: never log API keys or message content
- Backend: log connection events, error codes, LLM call duration
- Frontend: console.error for unexpected errors only; no debug logs in production

### Config / Env Validation
- Backend validates required env vars on startup (PORT with default)
- Frontend config validated before sending messages
- Config changes are reflected immediately (no page refresh needed)

### Accessibility
- All interactive elements are keyboard-accessible
- Icon-only buttons have aria-labels
- Form inputs have associated labels
- Error messages are announced (aria-live)
- Color contrast meets minimum requirements

---

## 5. Definition of Done for MVP

### Feature Completeness
- All MVP features from build-spec section 3 ("In Scope") are implemented
- All PRD acceptance criteria (section 10) pass
- No features from "Intentionally Excluded" are implemented

### Quality Baseline
- TypeScript compiles with zero errors
- All unit tests pass
- No console errors in normal usage
- No known critical bugs
- Code follows project structure conventions

### Validation Baseline
- Manual E2E test passes with real LLM API
- Multi-turn conversation (10+ rounds) works correctly
- Error scenarios handled gracefully (bad key, network error, timeout)
- Page refresh preserves chat history and config
- Works in Chrome and Firefox (minimum browser support)

### Deployment Readiness
- `docker-compose up --build` works on a clean machine
- Frontend served via Nginx with WebSocket proxy
- Backend runs in production mode (NODE_ENV=production)
- Health endpoint works
- README has complete setup and configuration instructions

### Performance Baseline
- Page load < 1.5s (first contentful paint, desktop broadband)
- Frontend bundle < 200KB gzipped
- No page freeze during API waiting
- Message render < 100ms from WS message to DOM

---

## 6. Recommended Working Pattern for AI Coding

### One Task at a Time
- Feed exactly one task description + acceptance criteria into the AI coding tool
- Don't combine tasks — each task is one focused generation step
- After each task, verify the result before moving to the next

### Validate After Each Task
- Run the acceptance criteria checklist before committing
- Test the feature manually (or run unit tests when applicable)
- If something doesn't work, fix it before moving on
- Don't accumulate untested code

### Keep Commits Small
- Follow the suggested commit granularity in each task
- Each commit should be reviewable and reversible
- If a task has 2-3 suggested commits, make them separately
- Squash only if the commits are truly trivial fixes

### Review Generated Code
- Always read generated code before accepting it
- Check for: type safety, security issues, unnecessary complexity, off-scope features
- AI tools often add extra stuff — trim it back to what the task requires
- Verify imports and file paths match the project structure

### Stay Within Scope
- If a task says "NOT included", don't implement it
- If you notice a gap, note it but don't fix it in the current task
- Follow the build order — don't jump ahead to later milestones

### Rollback Strategy
- If a task goes wrong, revert the commit and try again with clearer instructions
- Don't pile fixes on top of broken code
- Each task's commits should be independent enough to revert individually

### Context Management
- When feeding a task to an AI tool, include:
  1. Task name and purpose
  2. Scope (in/out)
  3. Acceptance criteria
  4. Relevant file paths and existing code structure
  5. Shared types / contracts to use
- Don't paste the entire build-spec every time — reference specific sections

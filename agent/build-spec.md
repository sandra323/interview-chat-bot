# Build Spec

## 1. Technical Summary

Lightweight single-page AI chat web app with a React frontend and Node.js backend, communicating over WebSocket for real-time message exchange. The backend proxies LLM API calls, and the frontend persists conversation history and API configuration in browser localStorage.

**Main technical goals:**
- Stable multi-turn conversation via WebSocket with full context passing
- Sub-2s model reply rendering (network-dependent)
- Zero-friction onboarding — no login, config once in browser
- Clean separation between API layer and UI layer for easy LLM provider swapping

**Key implementation assumptions:**
- Backend is added to MVP (deviation from PRD "Out of Scope") to handle WebSocket connections and proxy LLM calls — rationale: user-specified WebSocket + Node.js stack requires a server
- API key is sent per-request over WebSocket but NOT persisted server-side — preserves PRD security requirement ("do not upload key to third-party server" interpreted as: no server-side storage)
- MVP uses full-context transmission (no compression/truncation) per PRD assumption
- Single conversation session only (multi-session management is out of scope)
- LLM API uses OpenAI-compatible request/response format as the default adapter; adapter pattern allows adding other providers

## 2. Recommended Tech Stack

### Frontend
| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **React 18 + TypeScript** | User-specified; strong ecosystem, type safety for message/state contracts |
| Build tool | **Vite** | Fast HMR, sub-1.5s cold start aligns with performance target |
| Styling | **Tailwind CSS** | Rapid UI build, utility-first keeps chat layout code concise |
| State management | **Zustand** | Lightweight, minimal boilerplate — perfect for a single-session chat app |
| WebSocket client | **Native `WebSocket` API** | No extra dependency; simple reconnect logic can be wrapped in a custom hook |
| Persistence | **localStorage** | Per PRD; zero backend dependency for chat history |

### Backend
| Layer | Choice | Why |
|-------|--------|-----|
| Runtime | **Node.js 20+** | User-specified; native async/await fits I/O-bound LLM proxy workload |
| HTTP framework | **Express** | Minimal, widely known; only needed for health checks and static serving |
| WebSocket server | **`ws` library** | Lightweight, performant, no Socket.io overhead — MVP doesn't need rooms/ack features |
| LLM client | **`fetch` (native Node 18+) + adapter pattern** | Zero extra deps; adapter isolates provider-specific request/response shapes |

### Database
- **None on backend** — MVP is stateless on the server; all persistence is frontend localStorage
- Rationale: PRD explicitly scopes chat history to local storage; adding a DB would be over-engineering for MVP

### Authentication
- **None** — PRD explicitly out of scope; API key serves as per-request credential passed from client

### Storage
- Frontend: `localStorage` (chat history + API config)
- Backend: No persistent storage required

### Deployment
| Layer | Choice | Why |
|-------|--------|-----|
| Container | **Docker + Docker Compose** | Single-command local dev and deployment; frontend + backend in one compose file |
| Reverse proxy | **Nginx** (in container) | Serves static frontend, proxies WebSocket (`/ws`) to backend |
| Hosting target | Any VPS / container platform | MVP scale: single instance sufficient |

### Third-Party Services
- LLM API (OpenAI-compatible endpoint) — user-configurable URL + key
- No other external services for MVP

### AI / Model Integration
- Backend maintains a **provider adapter interface** with a default OpenAI-compatible implementation
- Adapter contract: `adaptRequest(messages) → providerRequestBody`, `adaptResponse(providerResponse) → messageContent`
- New providers = new adapter file; no changes to core WebSocket handler

## 3. System Scope

### In Scope (MVP)
- React SPA with chat UI (left/right message layout)
- Node.js WebSocket server proxying LLM API calls
- Configurable API endpoint + API key (stored client-side)
- Multi-turn conversation with full context sent per request
- Loading state during LLM response
- Error handling for network / API failures
- localStorage persistence of chat history + config
- Clear-chat button
- Basic desktop responsiveness

### Intentionally Excluded
- User accounts / authentication system
- Multiple chat sessions / session list
- Streaming token-by-token output (WebSocket is established but MVP sends complete response in one message; streaming is a natural v2 extension)
- File / image / voice input
- Chat export, themes, mobile optimization
- API key management / rotation on server
- Rate limiting / abuse prevention UI
- Analytics / admin panel
- Database persistence of conversations

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (React SPA)                                │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ Chat UI  │  │ Zustand   │  │ localStorage     │  │
│  │ (messages│  │ Store     │  │ (history + config│  │
│  │  + input)│  │           │  │  + apiKey)       │  │
│  └────┬─────┘  └─────┬─────┘  └──────────────────┘  │
│       │              │                              │
│  ┌────┴──────────────┴─────┐                        │
│  │ WebSocket Client Hook   │                        │
│  │ (connect / send /       │                        │
│  │  handle message /       │                        │
│  │  auto-reconnect)        │                        │
│  └────────────┬────────────┘                        │
└───────────────┼─────────────────────────────────────┘
                │ ws://host/ws
┌───────────────┼─────────────────────────────────────┐
│  Nginx        │                                     │
│  (static + WS proxy)                                │
└───────────────┼─────────────────────────────────────┘
                │
┌───────────────┼─────────────────────────────────────┐
│  Node.js Backend                                    │
│  ┌──────────────────────────────────────────────┐   │
│  │ WebSocket Server (ws)                        │   │
│  │  - connection management                     │   │
│  │  - message routing                           │   │
│  │  - per-connection state (messages array)     │   │
│  └──────────────┬───────────────────────────────┘   │
│                 │                                   │
│  ┌──────────────┴───────────────┐                   │
│  │ LLM Adapter Layer            │                   │
│  │  - OpenAI-compatible adapter │                   │
│  │  - request/response shaping  │                   │
│  └──────────────┬───────────────┘                   │
│                 │                                   │
│  ┌──────────────┴───────────────┐                   │
│  │ HTTP Client (fetch)          │                   │
│  └──────────────┬───────────────┘                   │
└─────────────────┼───────────────────────────────────┘
                  │ HTTPS
┌─────────────────┴───────────────────────────────────┐
│  External LLM API                                   │
│  (user-configured endpoint + key)                   │
└─────────────────────────────────────────────────────┘
```

**Key integration points:**
- Client ↔ Server: Single WebSocket connection per browser tab; JSON message protocol
- Server ↔ LLM: HTTP POST with user-provided API key in Authorization header
- Client ↔ localStorage: Chat history + config read on mount, written on each message

## 5. Core Modules

### 5.1 Frontend: Chat UI Module
- **Purpose**: Render conversation and handle user input
- **Responsibilities**:
  - Render message list (user right, AI left) with auto-scroll
  - Text input + send button + Enter key submit
  - Loading indicator during pending AI response
  - Error toast display
  - Clear-chat button
- **Inputs**: Message array from store, loading state, error state
- **Outputs**: `sendMessage(text)` action, `clearChat()` action
- **Dependencies**: Zustand store, WebSocket hook

### 5.2 Frontend: Config Module
- **Purpose**: Manage LLM API configuration
- **Responsibilities**:
  - Settings panel (collapsible) for API URL + API key
  - Validate config before first send
  - Persist to / load from localStorage
- **Inputs**: User input
- **Outputs**: Config object to store + localStorage
- **Dependencies**: Zustand store

### 5.3 Frontend: WebSocket Hook (`useWebSocket`)
- **Purpose**: Manage WebSocket lifecycle and message handling
- **Responsibilities**:
  - Connect on mount (with config available)
  - Auto-reconnect with exponential backoff (3 attempts: 1s, 2s, 4s)
  - Send messages as JSON
  - Parse incoming messages and dispatch to store
  - Track connection status (connecting / open / closed / error)
- **Inputs**: Config (url + apiKey), message send requests
- **Outputs**: Connection status, incoming messages, errors
- **Dependencies**: None (native WebSocket API)

### 5.4 Frontend: State Store (Zustand)
- **Purpose**: Single source of truth for app state
- **Responsibilities**:
  - Messages array (id, role, content, timestamp)
  - Config object (apiUrl, apiKey)
  - UI state (loading, error, connectionStatus)
  - Actions: addMessage, setLoading, setError, setConfig, clearChat
- **Persistence**: `persist` middleware syncs messages + config to localStorage
- **Dependencies**: Zustand

### 5.5 Backend: WebSocket Server
- **Purpose**: Accept WS connections, route messages, manage per-connection state
- **Responsibilities**:
  - Accept WebSocket connections at `/ws`
  - Parse incoming JSON messages
  - Maintain per-connection message history (in-memory, for context assembly)
  - Send AI responses back as JSON
  - Handle connection close / cleanup
  - Enforce single-active-request per connection (ignore sends while loading)
- **Inputs**: Client messages (JSON)
- **Outputs**: AI response messages, error messages, status messages
- **Dependencies**: LLM adapter

### 5.6 Backend: LLM Adapter Layer
- **Purpose**: Isolate provider-specific API details from WebSocket handler
- **Responsibilities**:
  - Define adapter interface: `chat(messages, config) → string`
  - Default implementation: OpenAI-compatible `/chat/completions`
  - Normalize errors into consistent error objects
- **Inputs**: Message array, config (apiUrl, apiKey, model)
- **Outputs**: Reply text string, or throws typed error
- **Dependencies**: Node fetch

## 6. Data Model

### 6.1 Message (Frontend + Backend shared concept)
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID (UUID or timestamp + random) |
| `role` | `'user' \| 'assistant'` | Message sender |
| `content` | string | Message text |
| `timestamp` | number | Unix timestamp (ms) |
| `status` | `'pending' \| 'sent' \| 'error'` | Delivery status (frontend only) |

**Relationships**: Messages belong to a single conversation session (implicit — MVP has only one session).

### 6.2 Config (Frontend-only, persisted in localStorage)
| Field | Type | Description |
|-------|------|-------------|
| `apiUrl` | string | LLM API endpoint URL (e.g., `https://api.openai.com/v1/chat/completions`) |
| `apiKey` | string | API key for authentication |
| `model` | string | Model identifier (e.g., `gpt-4o-mini`) |

### 6.3 WebSocket Message Protocol (Client ↔ Server)

**Client → Server message types:**
```typescript
// Send a chat message
{ type: 'chat', content: string, config: { apiUrl: string, apiKey: string, model: string } }

// Ping (keepalive, optional for MVP)
{ type: 'ping' }
```

**Server → Client message types:**
```typescript
// AI reply (complete response)
{ type: 'reply', content: string, messageId: string }

// Error
{ type: 'error', code: string, message: string }

// Connection acknowledgment
{ type: 'connected', connectionId: string }
```

### 6.4 Backend Per-Connection State (In-Memory)
| Field | Type | Description |
|-------|------|-------------|
| `connectionId` | string | Unique per connection |
| `messages` | Array<{role, content}> | Conversation history for context |
| `isProcessing` | boolean | Whether a request is in-flight |
| `ws` | WebSocket | The raw WS connection reference |

**No database** — all state is in-memory and lost on server restart. This is acceptable for MVP because the source of truth for chat history is frontend localStorage.

## 7. API / Interface Contracts

### 7.1 WebSocket: Chat Message
- **Purpose**: User sends a message, server proxies to LLM and returns reply
- **Method**: WebSocket `message` event (JSON)
- **Input (client → server)**:
  ```json
  {
    "type": "chat",
    "content": "What is React?",
    "config": {
      "apiUrl": "https://api.openai.com/v1/chat/completions",
      "apiKey": "sk-...",
      "model": "gpt-4o-mini"
    }
  }
  ```
- **Output (server → client, success)**:
  ```json
  {
    "type": "reply",
    "content": "React is a JavaScript library for building user interfaces...",
    "messageId": "msg_abc123"
  }
  ```
- **Output (server → client, error)**:
  ```json
  {
    "type": "error",
    "code": "LLM_API_ERROR",
    "message": "The server returned status 401: Invalid API key"
  }
  ```
- **Error cases**:
  - `INVALID_CONFIG` — missing apiUrl or apiKey
  - `LLM_API_ERROR` — LLM API returned non-2xx
  - `NETWORK_ERROR` — couldn't reach LLM endpoint
  - `REQUEST_TIMEOUT` — LLM call exceeded timeout (30s)
  - `ALREADY_PROCESSING` — send attempted while previous request pending

### 7.2 WebSocket: Connection Lifecycle
- **Purpose**: Establish and verify connection
- **On connect**: Server sends `{ type: 'connected', connectionId: '...' }`
- **On disconnect**: Server cleans up per-connection state
- **Reconnect**: Client handles automatically via hook (exponential backoff, max 3 attempts)

### 7.3 LLM Adapter Interface (Internal)
- **Purpose**: Standardize how the backend calls different LLM providers
- **Interface**:
  ```typescript
  interface LLMAdapter {
    chat(messages: ChatMessage[], config: LLMConfig): Promise<string>;
  }

  interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
  }

  interface LLMConfig {
    apiUrl: string;
    apiKey: string;
    model: string;
  }
  ```
- **Default implementation**: `OpenAICompatibleAdapter` — POST to `apiUrl` with `Authorization: Bearer <apiKey>`, body `{ model, messages }`
- **Error mapping**: HTTP errors → `LLM_API_ERROR` with status detail

### 7.4 Backend HTTP Endpoints (Minimal)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check (returns `{ status: 'ok' }`) |
| `/ws` | GET (upgrade) | WebSocket upgrade endpoint |

No REST API — all real-time communication goes through WebSocket.

## 8. State and Data Flow

### 8.1 Client State Flow
```
User types message → press Enter / click Send
  → Validate config (apiUrl + apiKey must be set)
  → Add user message to store (status: 'sent')
  → Set loading = true
  → Send { type: 'chat', content, config } over WebSocket
  → Wait for server response
    → On 'reply': add AI message to store, set loading = false
    → On 'error': set error message, set loading = false, mark user message as 'error'? (no, keep user message, show error toast)
  → Store persists to localStorage automatically (Zustand persist middleware)
```

### 8.2 Server State Flow
```
WebSocket connection established
  → Create per-connection state (empty messages array, isProcessing = false)
  → Send { type: 'connected' }

Receive 'chat' message
  → If isProcessing → send { type: 'error', code: 'ALREADY_PROCESSING' }
  → Set isProcessing = true
  → Append user message to connection.messages
  → Call LLMAdapter.chat(connection.messages, config)
  → On success:
    → Append assistant message to connection.messages
    → Send { type: 'reply', content, messageId }
    → Set isProcessing = false
  → On error:
    → Remove user message from connection.messages? No — keep it, let client decide
    → Send { type: 'error', code, message }
    → Set isProcessing = false

Connection closes
  → Clean up per-connection state
```

### 8.3 Page Load / Refresh
```
App mounts
  → Load messages + config from localStorage (via Zustand persist)
  → If config exists → auto-connect WebSocket
  → If config missing → show settings panel, don't connect yet
  → Render existing messages
```

### 8.4 Loading / Error / Empty States
| State | UI Behavior |
|-------|-------------|
| **Empty** (no messages) | Show placeholder: "Start a conversation" + prompt to configure API if not set |
| **Loading** | Disable send button + input, show typing indicator in AI message bubble |
| **Error** | Toast notification with error message; auto-dismiss after 5s; conversation history preserved |
| **Disconnected** | Show subtle banner "Reconnecting..." with retry indicator |

### 8.5 Caching / Persistence
- **Chat history**: localStorage (persisted by Zustand persist middleware, key: `ai-chat-state`)
- **Config**: localStorage (same persisted store)
- **No server-side caching** — each chat request goes directly to LLM API
- **Per-connection message history**: in-memory only (rebuilt from client on reconnect — MVP doesn't re-sync history; user continues from where they left off client-side)

## 9. Security and Permission Considerations

### Authentication
- **No user auth** — MVP is single-user, browser-local
- API key serves as the credential, provided per-request by client

### Authorization
- Not applicable — no multi-tenant data, no roles

### Session Handling
- WebSocket connections are anonymous; each connection gets a random `connectionId`
- No session tokens, no cookies

### Secret Management
- **API key is stored in localStorage** (client-side only) — per PRD requirement
- **API key is NOT logged** on the server — backend must strip / redact API key from all logs
- **API key is sent over WebSocket** (WSS in production) — encrypted in transit
- Server never persists API key to disk or database

### Input Validation
- **Client-side**: Trim whitespace, reject empty messages, max length limit (e.g., 10,000 chars)
- **Server-side**: Validate message structure (type, content, config fields), reject oversized payloads (max 1MB per message), sanitize to prevent injection
- **API URL validation**: Must be https:// (in production); reject localhost / internal IPs? MVP: allow any URL, warn user

### Privacy Concerns
- Chat history stays in user's browser — no server-side storage of conversations
- Backend only holds messages in memory for the duration of a connection (for context assembly)
- Memory is cleared on disconnect

### Abuse Prevention
- **Per-connection concurrency**: Only one active LLM request per connection (server enforces)
- **Message rate limit**: Max 10 messages per minute per connection (basic server-side throttle)
- **Payload size limit**: 1MB max per WebSocket message
- No IP-based rate limiting in MVP (single-user tool)

## 10. Non-Functional Technical Expectations

### Performance
- **Page load**: < 1.5s (first contentful paint) on desktop broadband — achieved via Vite + code splitting (single bundle < 200KB gzipped target)
- **Message render**: < 100ms from receiving WebSocket message to DOM paint
- **API latency**: Target < 2s for LLM response (network + model dependent — not fully controllable, but backend should add < 50ms overhead)

### Reliability
- **WebSocket auto-reconnect**: 3 attempts with exponential backoff (1s, 2s, 4s)
- **Chat history durability**: Survives page refresh, browser restart (localStorage)
- **Error resilience**: Failed LLM calls don't crash the app; user sees error toast and can retry
- **Backend crash resilience**: Server restart drops in-memory state but client re-establishes connection; chat history preserved client-side

### Responsiveness
- **Target**: Desktop browsers (1280px+ width)
- **Minimum**: Usable at 1024px width
- **Mobile**: Not optimized for MVP (PRD out of scope), but should not be completely broken

### Accessibility Baseline
- Semantic HTML (`<main>`, `<section>`, `<button>`)
- Input has associated label
- Send button has `aria-label`
- Error messages announced via `aria-live` region
- Keyboard navigation: Tab order is logical, Enter submits

### Observability / Logging
- **Backend**: Structured JSON logs (pino or simple console with timestamp) with levels (info, warn, error)
  - Log: connection open/close, message count, LLM call duration, error codes
  - Never log: API key, message content
- **Frontend**: `console.error` for dev; no production error tracking service in MVP
- **Health endpoint**: `GET /health` returns 200 + uptime

### Maintainability
- **File structure**: Feature-based (not type-based) — `src/components/Chat/`, `src/hooks/`, `src/store/`, `src/types/`
- **Type sharing**: Shared TypeScript types (message, WS protocol) in a `shared/` directory used by both frontend and backend
- **Adapter pattern**: Adding a new LLM provider = one new file, no changes to core logic
- **Component isolation**: Pure UI components receive props only; no direct store access in presentational components

### Testing Baseline
- **Unit tests**: Backend LLM adapter (mock fetch, test request/response shaping, error handling) — Vitest
- **Unit tests**: Frontend store actions (addMessage, clearChat, persist) — Vitest
- **Integration test**: WebSocket message flow (client send → server proxy → client receive) — single test with mock LLM
- **Manual E2E**: Verify acceptance criteria manually (MVP scope — no E2E test framework)
- **No full test coverage mandate** for MVP; focus on critical paths

## 11. Delivery Risks and Trade-Offs

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **LLM provider API incompatibility** | High — core feature breaks if format doesn't match | High — providers vary | Adapter pattern with OpenAI-compatible default; document expected request/response format clearly; add new adapters as needed |
| **Long context causes request timeout / oversized payload** | Medium — conversation breaks after many turns | Medium — grows with usage | MVP: hard cap at 20 messages or 8K tokens (whichever comes first); show warning when approaching limit; v2: context truncation/summarization |
| **WebSocket connection drops mid-request** | Medium — user loses response | Low-Medium — depends on network | Client shows "Connection lost" + reconnect; server cleans up on close; user re-sends message |
| **API key exposure via localStorage** | Low-Medium — XSS could steal key | Low — single-user tool, no third-party scripts | Sanitize message rendering (React default XSS protection); no external scripts; CSP headers in production; user aware it's local-only |
| **Backend adds complexity vs. pure frontend** | Medium — more moving parts | N/A — user specified Node.js + WebSocket | Keep backend minimal (single file ~200 lines); no DB; stateless except per-connection memory; Docker Compose for one-command run |
| **No streaming = perceived slowness** | Medium — long responses feel unresponsive | High — for long outputs | MVP: show animated loading indicator with "AI is thinking..." text; v2: implement streaming over WebSocket (natural extension, same connection) |
| **CORS / mixed content issues** | Low — setup complexity | Medium — common dev pain | Nginx reverse proxy serves both frontend and WS from same origin; Docker Compose handles this in one setup |
| **Speed vs. maintainability** | Low — MVP may accumulate tech debt | N/A — inherent trade-off | Clear module boundaries + adapter pattern provides extension points; shared types prevent drift; document known shortcuts |

## 12. Suggested Build Order

1. **Project scaffolding** — Monorepo structure (frontend/ + backend/ + shared/), Docker Compose base, TypeScript configs
2. **Shared types** — Define message types, WebSocket protocol types, config types in `shared/`
3. **Backend: WebSocket server skeleton** — `ws` server, connection management, basic message echo, health endpoint
4. **Backend: LLM adapter** — OpenAI-compatible adapter, request/response shaping, error normalization, unit tests
5. **Backend: Chat flow integration** — Wire WS messages → adapter → WS responses, per-connection state, processing lock
6. **Frontend: Vite + React + Tailwind setup** — Basic project structure, routing (single page), layout shell
7. **Frontend: Zustand store + localStorage persistence** — Message store, config store, persist middleware
8. **Frontend: WebSocket hook** — Connection management, send/receive, auto-reconnect, status tracking
9. **Frontend: Chat UI components** — Message list, message bubbles, input area, loading indicator
10. **Frontend: Config panel** — API URL + key + model inputs, validation, persist on change
11. **Frontend: Error handling + empty states** — Toast component, error display, empty state placeholder
12. **Integration & polish** — End-to-end test with real LLM API, clear-chat button, disabled state during loading, auto-scroll
13. **Docker + Nginx deployment** — Containerize both services, Nginx config for static + WS proxy, Docker Compose one-command start
14. **Final QA** — Verify all acceptance criteria, performance check, error scenario testing

## 13. Open Questions

1. **Which LLM provider(s) must work at launch?** — MVP assumes OpenAI-compatible; is there a specific provider we need to validate against?
2. **What is the expected max conversation length?** — PRD says "no less than 10 rounds" but doesn't cap it. Should we hard-cap at N messages / N tokens for MVP?
3. **Is streaming output a v2 must-have, or nice-to-have?** — WebSocket infrastructure supports it, but MVP sends complete responses. Affects perceived latency.
4. **Should the backend support multiple LLM adapters at once (user selects in UI), or just one configurable endpoint?** — MVP assumes single configurable URL; multi-adapter UI adds complexity.
5. **Do we need a system prompt feature?** — PRD doesn't mention it, but most chat apps have one. If yes, where does it live (config panel, always prepended)?
6. **What is the deployment target?** — VPS, container platform (Fly.io, Render), or local-only? Affects Nginx/SSL setup.
7. **Should message content be logged server-side for debugging?** — Current spec says no (privacy), but this makes debugging harder. Confirm privacy stance.
8. **Do we need any rate limiting beyond per-connection concurrency?** — For a single-user tool, probably not, but worth confirming if it might be shared.

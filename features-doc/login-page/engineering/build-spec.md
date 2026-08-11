# Build Spec

```yaml
feature: login-page
doc_role: design-intent
status: planned
last_verified: 2026-08-11
```

> Implements [`product/product-brief.md`](../product/product-brief.md). All items **planned** until coded. After ship, add `engineering/current-state.md`.  
> Extends existing monorepo; does **not** replace chat stack.

## 1. Technical Summary
- Add a **login gate** and **logout** around the shipped AI Chat app: unauthenticated users only see a login page; authenticated users use existing chat HTTP/WS.
- Persist server-side sessions with **absolute 24h TTL** (configurable); protect `/api/conversations*` and `/ws`; wire Sidebar `.userCard` logout + confirm.
- **Main technical goals**
  - Frontend route/page gate + backend auth on HTTP and WebSocket
  - Demo credentials via env (no self-serve registration)
  - Reuse antd dark theme / tokens; no new visual system
- **Key implementation assumptions**
  - Keep current Express + `ws` + SQLite + React/Vite/antd/Zustand stack
  - Introduce **`react-router-dom`** for `/login` (public) and `/` (Chat behind `RequireAuth`) — not a multi-app rewrite
  - User-facing errors: always Chinese; prefer server `msg`, frontend fixed Chinese fallback; never show secrets/stack traces
  - Session = opaque token stored server-side; client holds token for HTTP `Authorization`; WS authenticates via `{ type: 'auth', token }` after `connected` (no `?token=` on URL)
  - Single demo user from env (`AUTH_USERNAME` + **`AUTH_PASSWORD_HASH` only** — no plaintext password env)
  - `USE_MOCK` may bypass auth for UI-only demos (explicit exception; document in code)

## 2. Recommended Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Existing React 18 + Vite + TypeScript + antd + Less modules + Zustand | Already shipped; login UI reuses `ConfigProvider` dark tokens |
| Routing | **`react-router-dom` v6** | **This MVP only:** map `/login` → LoginPage, `/` → gated ChatPage; `Navigate` on login success / logout / unauth; support deep-link & back-button gate. Not for nested app shells or many feature routes yet. |
| Backend | Existing Express + `ws` | Add auth middleware + WS post-connect `auth` gate; no new server |
| Database | Existing SQLite (`better-sqlite3`) + new `auth_sessions` table | Matches chat store; sessions survive process restart within TTL |
| Authentication | Username/password vs env demo user; opaque session token | Brief: preset demo account; no OAuth/MFA |
| Password check | `bcryptjs.compare` against **required** `AUTH_PASSWORD_HASH` | Deploy-safe: no plaintext password in env; generate hash offline before deploy |
| Session medium | **Bearer token** in `localStorage` + `Authorization: Bearer` on `/api/*`; **WS: auth message after `connected`** (URL stays `/ws`, no `?token=`) | Deploy-safe vs Nginx access logs; fits existing JSON message protocol; server remains TTL authority |
| Storage | SQLite sessions; client localStorage for token + username display only | No secrets in client beyond opaque token |
| Deployment | Existing Docker Compose / `npm run dev:*` | Add auth env vars to `.env.example` |
| Third-party | None new (no Auth0, no CAPTCHA) | Out of MVP scope |
| AI/LLM | Unchanged (`DEEPSEEK_API_KEY` server-only) | Auth wraps access; does not change LLM adapter |

**Colour / UI (reuse, do not invent)**
- Background `#0a0c10`, surfaces `#0d1017` / `#111318`, border `#1e2330`, text `#e8eaed`, primary `#3b82f6`, error `#ef4444` (already in `App.tsx` / `variables.less`)
- Login: centered card on dark canvas; antd `Form` + `Input` + `Input.Password` + `Button`
- Logout menu: antd `Dropdown` `placement="topRight"` (or `top`), item `danger` + `LogoutOutlined`
- Confirm: `App.useApp().modal.confirm` same as delete-conversation

## 3. System Scope

### Required
- Login page UI + client auth store/API
- Auth routes: login, logout, session probe (`/api/auth/me`)
- Session table + TTL enforcement
- HTTP middleware requiring auth on conversation APIs
- WebSocket connection auth (reject unauthenticated)
- App router + `RequireAuth` gate
- Sidebar `.userCard` menu + logout confirm
- Env config: `AUTH_USERNAME`, **`AUTH_PASSWORD_HASH`** (required), `AUTH_SESSION_TTL_HOURS`
- Tests for auth store helpers / login validation / middleware reject
- `.env.example` + short README/auth notes

### Excluded (per brief)
- CAPTCHA, sign-up, reset password, MFA, OAuth, refresh tokens, sliding idle TTL, roles, profile/avatar upload, multi-device kick
- Rewriting chat message protocol beyond attaching auth

## 4. High-Level Architecture

```text
Browser
  ├── /login  → LoginPage (Form)
  └── /       → RequireAuth → ChatPage
        │
        ├── Authorization: Bearer <token>  → Express /api/auth/*, /api/conversations*
        └── WebSocket /ws                  → connected → client `{ type: 'auth', token }` → then chat msgs
                                              │
                                              ▼
                                         SQLite
                                         - auth_sessions
                                         - conversations / messages / generations (unchanged)
                                              │
                                              ▼
                                         LLM API (unchanged)
```

- **Client**: gate UI; store token; attach to fetch; after WS `connected`, send `auth`; on logout/401/expiry clear auth **and** chat local persist, then `/login`
- **Server**: issue/validate/revoke sessions; reject unauthorized HTTP; WS rejects `chat` until auth succeeds
- **External**: DeepSeek only (unchanged)

## 5. Core Modules

### Auth API (backend)
- **Purpose**: Login, logout, session validation
- **Responsibilities**: Verify demo credentials; create/revoke rows in `auth_sessions`; return user display fields + `expiresAt`
- **In**: username, password; Bearer token
- **Out**: `{ token, username, expiresAt }` or envelope errors
- **Deps**: env, SQLite, bcrypt

### Auth middleware (backend)
- **Purpose**: Protect HTTP `/api/conversations*`
- **Responsibilities**: Parse Bearer; lookup session; check `expires_at`; set `req.auth`; 401 envelope on failure
- **Deps**: auth store

### WS auth gate (backend)
- **Purpose**: Block anonymous chat traffic
- **Responsibilities**: Connection starts **unauthenticated**; accept `{ type: 'auth', token }`; validate session; mark connection authenticated; **reject** `chat` / `resume` / `stop` / `hello` until authed (or allow `ping` only); timeout unauthenticated sockets; on failure send `error` and close
- **Deps**: auth store, ConnectionManager, shared WS types (`auth` client message)

### Auth client (frontend)
- **Purpose**: Talk to auth HTTP APIs; persist token
- **Responsibilities**: `login`, `logout`, `fetchMe`; set/clear `localStorage`; notify app on 401
- **Deps**: `apis/http/client` (extend for Bearer + 401 handling)

### Auth gate + router (frontend)
- **Purpose**: Enforce brief gate UX
- **Responsibilities**: `/login` public; `/` requires valid session; redirect loops avoided; optional expiry toast
- **Deps**: react-router, auth store

### LoginPage (frontend)
- **Purpose**: Credential form
- **Responsibilities**: Validate empty fields; submit; loading; show `msg` errors; navigate to `/` on success
- **Deps**: antd Form, auth client, design tokens

### Sidebar userCard logout (frontend)
- **Purpose**: Logout entry matching brief UX
- **Responsibilities**: Show username from session; ⋮ + upward danger menu; confirm modal; call logout; **clear auth + chat client state**; navigate `/login`
- **Deps**: antd Dropdown/Avatar/Modal, auth client

## 6. Data Model

### Demo user (not a table — env)
- `AUTH_USERNAME` (string) — required
- `AUTH_PASSWORD_HASH` (bcrypt string) — **required in all environments** (local + deploy)
- **Do not** support `AUTH_PASSWORD` plaintext in env (avoids credential leak via env panels, backups, mis-committed files)
- How to set: generate hash once (`npx bcryptjs-cli` / small node one-liner), put hash in `.env.local` / host secrets; never commit real values
- Display name: use username (Avatar text = first character)

### `auth_sessions` (SQLite) — new
| Field | Type | Notes |
|-------|------|-------|
| `id` | TEXT PK | Session id (= token id) or separate `token` unique |
| `token_hash` | TEXT UNIQUE | Store **hash** of opaque token (not raw token) |
| `username` | TEXT | Demo user name |
| `created_at` | INTEGER | ms |
| `expires_at` | INTEGER | ms; `created_at + TTL` |
| `revoked_at` | INTEGER NULL | Set on logout |

**Relationships**: none to conversations in MVP (shared demo user → all chats remain global as today). Document that shared account shares history.

### Unchanged
- `conversations`, `messages`, `generations`

## 7. API / Interface Contracts

Use existing envelope `{ code, msg, data }`. Add `ApiCode.UNAUTHORIZED = 40100` (and optionally `ApiCode.FORBIDDEN = 40300`).

### `POST /api/auth/login`
- **Purpose**: Authenticate demo user; create session
- **Input**: `{ username: string, password: string }`
- **Output**: `{ token: string, username: string, expiresAt: number }`
- **Errors**: empty fields → `BAD_REQUEST`; wrong credentials → `UNAUTHORIZED` + friendly msg (do not reveal which field); rate-limit optional later

### `POST /api/auth/logout`
- **Purpose**: Revoke current session
- **Input**: Bearer token (header)
- **Output**: `{ ok: true }`
- **Errors**: missing/invalid token → still `SUCCESS` or `UNAUTHORIZED` (prefer idempotent success after revoke attempt)

### `GET /api/auth/me`
- **Purpose**: Boot/session probe; drive gate without trusting client clock alone
- **Input**: Bearer token
- **Output**: `{ username: string, expiresAt: number }`
- **Errors**: missing/expired/revoked → `UNAUTHORIZED` + msg e.g. `登录已过期，请重新登录` when expired

### Protected (existing)
- `GET/PATCH/DELETE /api/conversations*` → require valid Bearer; same bodies as today
- **Errors**: add `UNAUTHORIZED` path

### WebSocket `/ws`
- **Purpose**: Same chat protocol after auth
- **Auth (resolved for deploy)**: Connect to `/ws` **without** query token. After server `connected`, client must send `{ type: 'auth', token: string }`. Server replies e.g. `{ type: 'auth_ok' }` or `error` + close.
- **Rules**: Until authenticated, ignore/reject business messages (`chat`, `hello`, `resume`, `stop`). Optional short auth deadline (e.g. 5s) then close.
- **Not used as default**: `?token=` (leaks into Nginx/access logs); subprotocol (extra complexity, little gain here)
- **Errors**: invalid/expired token → `error` (`UNAUTHORIZED` semantics) + close; client clears auth and goes to `/login`

### Frontend routes (`react-router-dom` — MVP scope)
- **Why introduce it now:** Today `App` mounts `ChatPage` only. Login needs a real URL for the gate (`/login` vs `/`), redirects after login/logout/expiry, and blocking back/deep-link into chat while logged out. Router is the smallest durable way to do that.
- **What it is used for in this pass (only):**
  - `/login` → public `LoginPage`
  - `/` → `RequireAuth` → existing `ChatPage`
  - Unauthenticated visit to `/` → redirect `/login`
  - Authenticated visit to `/login` → redirect `/`
  - After login → `navigate('/')`; after logout/expiry cleanup → `navigate('/login')` (prefer `replace` where appropriate)
- **What it is not for yet:** multi-layout apps, nested chat routes, code-splitting forests, query-driven mini-apps
- Unknown paths → redirect `/` or `/login` based on session

### User-facing error copy (resolved)
- **Always Chinese** on screen; never show stack traces, bcrypt hashes, raw tokens, env names, or SQL
- **Prefer** server envelope `msg` when non-empty (backend must write user-friendly Chinese, e.g. `账号或密码错误` / `登录已过期，请重新登录`)
- **Fallback** if `msg` missing/empty/network failure: fixed frontend strings (e.g. `登录失败，请稍后重试` / `网络异常，请检查连接后重试`)
- Client-side validation (empty fields) may use fixed Chinese before request
- Same rule for auth-related toasts after 401/WS auth failure

## 8. State and Data Flow

### Client state
- Zustand (or small auth store): `{ token, username, expiresAt, status: 'unknown'|'authenticated'|'anonymous' }`
- Persist `token` (+ username/expiresAt cache) in `localStorage` key e.g. `ai-chat-auth-v1`
- Chat Zustand remains separate (`ai-chat-state-v7`)
- **On logout or forced expiry/401:** clear auth storage **and** wipe chat client persist (`clearChat()` / equivalent — messages, `conversationId`, `conversationTitle`, etc.) so the next visitor on a shared browser does not see the previous UI. Server history remains; same demo user can reload it from the sidebar after re-login.

### Boot
1. Read token from localStorage  
2. `GET /api/auth/me`  
3. OK → mark authenticated → allow `/`  
4. Fail → clear storage → `/login` (+ expiry toast if msg indicates expiry)

### Login
1. Submit form → `POST /api/auth/login`  
2. Save token → navigate `/`  
3. Chat page mounts; HTTP clients attach Bearer; WS connects to `/ws` → on `connected` send `{ type: 'auth', token }` → wait `auth_ok` then `hello` / resume as today

### Authenticated use
- All conversation fetches include Bearer  
- WS connection stays authenticated; re-check session TTL on messages or periodically; on revoke/expiry close socket and force re-login

### Logout
1. Menu → confirm modal  
2. `POST /api/auth/logout` (best effort)  
3. Disconnect WS  
4. Clear auth storage **and** `clearChat()` / wipe chat persist (`ai-chat-state-v7` conversation fields)  
5. Navigate `/login`

### Expiry / 401
- Any `code === UNAUTHORIZED` on API or WS auth failure → same local cleanup as logout (auth + chat client persist) → `/login` + message  
- Do not rely only on client `expiresAt`; always confirm with server when unsure

### Loading / error / empty
- Login: button `loading`; field validation; display errors per **User-facing error copy** (prefer `msg`, else Chinese fallback)
- Gate: brief splash/null while `status === 'unknown'` (me in flight)

## 9. Security and Permission Considerations
- **AuthN**: Demo `AUTH_USERNAME` + bcrypt verify of password against `AUTH_PASSWORD_HASH`; opaque session tokens (32+ bytes random)
- **AuthZ**: MVP = “any valid session may use all chat APIs” (no roles)
- **Session**: Absolute TTL default 24h via `AUTH_SESSION_TTL_HOURS`; store `expires_at`; logout sets `revoked_at`
- **Token storage**: Prefer hash-at-rest in SQLite; raw token only on wire + client storage
- **Secrets**: `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `DEEPSEEK_API_KEY` only in private env; **never** store or accept plaintext login password in env; never log passwords or raw tokens
- **Boot**: If `AUTH_PASSWORD_HASH` missing/invalid, fail fast (same spirit as missing LLM key in production/demo deploy)
- **Validation**: Trim username; reject empty password; max length caps; existing chat body limits remain
- **HTTP**: Unauthorized → envelope `UNAUTHORIZED`, HTTP 401 optional alongside
- **Public exceptions**: `GET /health` stays **fully public** (no auth) for deploy probes / Docker / LB; must not return secrets (status + non-sensitive flags only)
- **WS**: Unauthenticated connections must not run LLM; require successful `auth` message; close on failure/timeout
- **Abuse**: Optional simple in-memory login rate limit per IP (nice-to-have, not blocker)
- **Privacy**: Shared demo user shares all conversations (product constraint)
- **Mock**: If `USE_MOCK`, document whether auth is skipped; prefer skip only for pure UI mock

## 10. Non-Functional Technical Expectations
- **Performance**: Login page no chat history fetch; `/api/auth/me` &lt; 100ms local; gate resolve before painting Chat
- **Reliability**: Logout/expiry always end in login page even if logout API fails (clear local auth + chat persist in `finally`)
- **Responsiveness**: Desktop-first; login card readable ≥1280px; match Chat density
- **A11y baseline**: Form labels; focus visible; modal keyboard OK/Cancel
- **Observability**: Log login success/failure **without** password; log session revoke; existing request logger
- **Maintainability**: Auth code under `backend/src/auth/`, `frontend/src/pages/Login/`, `frontend/src/apis/auth.ts`; update `features-doc/shared/api-contracts.md` when shipping
- **Testing baseline**
  - Backend: credential fail; session create/expiry/revoke; middleware 401
  - Frontend: gate redirect; logout confirm cancel vs OK (component/unit where cheap)
- **CI/CD**: Existing npm test workspaces; no new pipeline required for MVP
- **Deployment**: Document new env vars; Compose unchanged except env
- **Monitoring/maintenance**: `GET /health` remains **public** (no Bearer) for orchestration probes; alert on repeated auth failures manually for demo

## 11. Delivery Risks and Trade-Offs

| Risk | Mitigation |
|------|------------|
| UI-only gate | Mandatory HTTP + WS server checks |
| Bearer in localStorage XSS | Keep CSP later; hash sessions server-side; short TTL; no refresh tokens |
| Cookie vs Bearer debate | MVP picks Bearer for speed; can migrate to HttpOnly cookie later without changing session table much |
| WS auth via query string may leak in logs | **Resolved**: use post-`connected` `{ type: 'auth', token }` instead of `?token=` |
| Shared demo history | Document; acceptable for interview demo |
| `USE_MOCK` bypass confusion | Explicit flag + comment in App gate |
| Upward dropdown clipping | antd `getPopupContainer` / placement tweak |
| Speed vs hardening | Env demo user + SQLite sessions over full user service |

## 12. Suggested Build Order
1. Env + shared `ApiCode.UNAUTHORIZED` + `.env.example` (`AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SESSION_TTL_HOURS=24` + short note on generating the hash)
2. SQLite `auth_sessions` + auth store helpers (create/find/revoke/purge expired)
3. `POST /api/auth/login|logout`, `GET /api/auth/me`
4. HTTP Bearer middleware on `/api/conversations*`
5. WS: `auth` message after `connected`; gate chat until authenticated; extend shared WS types
6. Frontend auth API client + auth store + 401 interceptor
7. `react-router` + `LoginPage` + `RequireAuth` in `App.tsx`
8. Wire WS client to send `auth` then existing hello/resume flow
9. Sidebar `.userCard` username + ⋮ menu + logout confirm → logout
10. Manual E2E against acceptance criteria; unit tests for session TTL/middleware/WS auth gate
11. Update `features-doc/shared/api-contracts.md` + `login-page/engineering/current-state.md` (mark shipped)

## 13. Open Questions
- ~~Prefer `AUTH_PASSWORD_HASH` only vs plaintext `AUTH_PASSWORD`?~~ **Resolved: `AUTH_PASSWORD_HASH` only (deploy-safe); no plaintext password env.**
- ~~WS auth: query `token` vs subprotocol vs auth message after `connected`?~~ **Resolved: auth message after `connected` (`{ type: 'auth', token }`); no query token by default.**
- ~~On logout, clear chat local persist?~~ **Resolved: yes — clear auth + `clearChat()` / wipe chat Zustand persist on logout and on forced expiry/401; server history kept; reload from API after re-login.**
- ~~Should `/health` stay fully public?~~ **Resolved: yes — public for deploy/LB probes; no secrets in body; chat/auth APIs still require session.**
- ~~Login error copy: fixed Chinese vs server `msg`?~~ **Resolved: always user-facing Chinese; prefer non-empty server `msg`; frontend fixed Chinese fallback; never expose sensitive details.**
- ~~Introduce `react-router-dom`?~~ **Resolved: yes — for `/login` vs `/` gate, redirects, and back/deep-link protection only in this MVP.**

---

### Algorithm notes (session)

```text
login(username, password):
  if AUTH_PASSWORD_HASH missing: fail boot / INTERNAL
  if !timingSafeEqualUser(username) or !bcrypt.compare(password, AUTH_PASSWORD_HASH): fail UNAUTHORIZED
  token = randomBytes(32).toString('base64url')
  insert auth_sessions(token_hash=sha256(token), username, expires_at=now+TTL)
  return { token, username, expiresAt }

validate(token):
  row = find by sha256(token) where revoked_at IS NULL and expires_at > now
  else fail UNAUTHORIZED (msg expired vs invalid as appropriate)

logout(token):
  set revoked_at=now where token_hash matches

ws_on_connected(connection):
  connection.authenticated = false
  send { type: 'connected', connectionId }

ws_on_message(connection, msg):
  if msg.type == 'auth':
    if validate(msg.token): connection.authenticated = true; send { type: 'auth_ok' }
    else: send error; close
    return
  if not connection.authenticated and msg.type != 'ping':
    send error UNAUTHORIZED; return (or close)
  // existing hello/chat/resume/stop handlers
```

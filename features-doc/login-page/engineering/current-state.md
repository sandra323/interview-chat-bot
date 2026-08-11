# Login Page — Current State

```yaml
feature: login-page
doc_role: current-state
status: shipped
last_verified: 2026-08-11
```

**Source of truth for what is implemented.** Prefer this file + code over older `planned` wording in design docs.

---

## Shipped

### Gate & routing
- `/login` public login page; `/` Chat behind `RequireAuth`
- Boot: persist hydrate → optional `GET /api/auth/me` → `authenticated` / `anonymous` (no Chat flash while `unknown`)
- Unauthenticated visit to `/` → `/login`; authenticated visit to `/login` → `/`
- Deep link / back while logged out stays gated
- `USE_MOCK`: auth gate skipped for UI-only demos (documented exception; do not pair with a protected backend)

### Credentials & session
- Demo user from env: `AUTH_USERNAME` + **`AUTH_PASSWORD_HASH` only** (no plaintext `AUTH_PASSWORD`)
- Absolute TTL via `AUTH_SESSION_TTL_HOURS` (default 24); server is TTL authority
- Opaque Bearer token; SQLite `auth_sessions` stores **sha256(token)** only
- Login / logout / me: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- User-facing errors always Chinese; prefer non-empty server `msg`, frontend fixed fallback
- Logout is idempotent on the server (missing/invalid token still succeeds)

### HTTP & WebSocket protection
- `/api/conversations*` requires valid Bearer (`requireAuth`)
- `/health` and `/api/auth/*` remain public (health has no secrets)
- WS `/ws`: after `connected`, client must send `{ type: 'auth', token }` → `auth_ok` before `hello` / `chat` / `resume` / `stop`
- Unauthenticated WS business messages → `UNAUTHORIZED` + close; ~5s auth deadline
- No `?token=` on the WS URL

### Client state & logout UX
- Auth persist key `ai-chat-auth-v1` (token, username, expiresAt)
- Chat persist remains `ai-chat-state-v7` (separate)
- Logout / 401 / WS auth failure: clear auth **and** local chat UI (`clearChat`); **server history kept**
- Sidebar `.userCard`: session username + Avatar initial; upward danger「退出登录」; confirm modal then logout cleanup → `/login`

### Config / deploy
- `.env.example` documents `AUTH_*` + bcrypt hash generation note
- Docker Compose passes `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SESSION_TTL_HOURS`
- Boot fails fast if auth env missing/invalid

---

## Partial

| Item | Done | Missing |
|------|------|---------|
| HttpOnly cookie session | Bearer + localStorage MVP | Cookie migration reduces XSS token theft |

---

## Security hardening (post-MVP, shipped)

- Login rate limit: 20 POSTs / 15 min per IP (before bcrypt); 5 failures / 15 min per IP and per username → `RATE_LIMITED` (42900)
- Single active session per demo user: new login revokes peer sessions
- WS stream fan-out skips unauthenticated / revoked sockets and closes them
- Boot `/me`: only force-logout on `UNAUTHORIZED` or client `expiresAt` past; network/5xx keep session
- Logout retries once; warns if server revoke failed while clearing local state
- `purgeExpired` also deletes revoked rows; production Express `trust proxy` for IP

---

## Explicitly NOT shipped

| Item | Status | Notes |
|------|--------|-------|
| Sign-up / reset password / MFA | planned | Out of MVP |
| OAuth / SSO | planned | Out of MVP |
| CAPTCHA | planned | Explicitly deferred |
| Remember-me / refresh tokens / sliding idle TTL | planned | Absolute TTL only |
| Roles / multi-user accounts table | planned | Single shared demo user |
| Profile / avatar upload | planned | Avatar shows username initial |

---

## Product constraints (document for demos)

- **Shared demo account shares all conversation history** on the server (by design for interview/demo).
- Logging out clears **this browser’s** chat UI only; re-login reloads history from the API.

---

## Code anchors

| Area | Path |
|------|------|
| Auth HTTP | `backend/src/auth/routes.ts`, `middleware.ts`, `sessionStore.ts` |
| WS auth gate | `backend/src/websocket/handleMessage.ts`, `connectionManager.ts` |
| FE auth store / API | `frontend/src/store/useAuthStore.ts`, `frontend/src/apis/auth.ts` |
| Gate / login UI | `frontend/src/auth/*`, `frontend/src/pages/Login/` |
| Sidebar logout | `frontend/src/pages/Chat/components/Sidebar/` |
| WS client auth | `frontend/src/apis/websocket/client.ts` |

---

## Quick verification

```bash
# Login
curl -s localhost:3001/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo"}'

# Conversations without Bearer → UNAUTHORIZED
curl -s localhost:3001/api/conversations

# Health stays public
curl -s localhost:3001/health

# Automated
npm test -w @ai-chat/backend -- src/auth src/websocket/wsAuth.test.ts
npm test -w @ai-chat/frontend -- src/store src/apis/websocket/client.test.ts
```

Manual UI: login success/fail → chat → refresh keeps session → Sidebar 退出登录 confirm → `/login` → `/` redirects to login.

# Execution Backlog

```yaml
feature: login-page
doc_role: execution-backlog
status: shipped
source: engineering/build-spec.md
last_verified: 2026-08-11
```

> Source of truth for *design*: [`build-spec.md`](./build-spec.md). **Implementation truth**: [`current-state.md`](./current-state.md). This backlog is **historical** after ship.

## 1. Execution Strategy

- **Approach**: Backend-first hard gate (session + HTTP + WS), then frontend store/router/login UI, then Sidebar logout, then tests/docs. UI alone must never be the only protection.
- **Dependency logic**: Shared `ApiCode` + env → SQLite session helpers → auth HTTP routes → protect conversations → WS `auth` message → FE auth client/store → router + LoginPage → WS client auth → Sidebar logout → verification/docs.
- **Staging**: After Milestone 2, login can be validated with curl. After Milestone 3–4, anonymous chat is blocked server-side even without UI. After Milestone 6, gate UX works; Milestone 7–8 complete the real product loop.
- **Validate early**:
  1. Wrong password / missing hash fails safely (curl)
  2. Unauthenticated `GET /api/conversations` → `UNAUTHORIZED`
  3. WS without `auth` cannot run chat
  4. Then login page + redirect + logout confirm

**Explicit assumptions (from build-spec)**

- Single demo user: `AUTH_USERNAME` + `AUTH_PASSWORD_HASH` only (no plaintext `AUTH_PASSWORD`)
- Session: opaque Bearer token; SQLite stores `token_hash`; absolute TTL via `AUTH_SESSION_TTL_HOURS` (default 24)
- WS: no `?token=`; after `connected`, client sends `{ type: 'auth', token }`
- `GET /health` remains fully public
- Errors: Chinese `msg` preferred; FE fixed Chinese fallback; no secrets/stacks
- Logout / 401 / expiry: clear auth **and** chat client persist (`clearChat` / wipe `ai-chat-state-v7` conversation fields)
- Rate limiting: out of MVP (nice-to-have; do not block)
- `USE_MOCK`: prefer skip auth only for pure UI mock; document in code if used

## 2. Milestones

| # | Name | Goal | Complete when |
|---|------|------|----------------|
| 1 | Foundations | Shared codes, env, deps, fail-fast config | `UNAUTHORIZED` exists; auth env documented; backend boots only with valid hash (or clear fail) |
| 2 | Session + Auth HTTP | Create/validate/revoke sessions via API | curl login/me/logout works; wrong creds Chinese `msg` |
| 3 | HTTP conversation gate | Protect `/api/conversations*` | No Bearer → 401 envelope; valid Bearer → existing behavior |
| 4 | WS auth gate | Block anonymous WS chat | Unauthed business msgs rejected; `auth` → `auth_ok` then chat works |
| 5 | FE auth client + store | Persist token; attach Bearer; handle 401 | Store + HTTP client ready; 401 clears auth+chat path callable |
| 6 | Router + LoginPage + gate | `/login` vs `/` gate UX | Unauth → login; success → chat; Chinese errors |
| 7 | WS client auth | Wire post-`connected` `auth` | Chat send/receive after login; auth failure → login cleanup |
| 8 | Sidebar logout UX | userCard menu + confirm logout | Confirm cancel/OK; cleanup; `/login`; deep-link blocked |
| 9 | Verify + ship docs | Tests, contracts, current-state | Acceptance checklist pass; docs mark shipped |

## 3. Task Breakdown by Milestone

### Milestone 1: Foundations

**Goal**
- Unlock auth work with shared contract, env vars, and required packages—without implementing login routes yet.

**Tasks**

#### Task 1.1: Add `ApiCode.UNAUTHORIZED` (+ optional FORBIDDEN)

**Purpose**
- Give HTTP/WS a stable unauthorized business code for the envelope.

**Scope**
- **Do**: Add `UNAUTHORIZED = 40100` to `shared` `ApiCode`; export types remain consistent; rebuild/link shared if required by workspace.
- **Don't**: Change existing route handlers; don't add auth routes yet. `FORBIDDEN` only if you already need it—otherwise skip.

**Suggested implementation notes**
- File: `shared/src/types/api.ts` (and package export path if any)
- Keep envelope `{ code, msg, data }` unchanged
- Downstream: backend auth + FE 401 interceptor

**Acceptance criteria**
- `ApiCode.UNAUTHORIZED === 40100` available from `@ai-chat/shared`
- Existing shared/backend/frontend typecheck still passes
- No behavior change to chat APIs yet

**Suggested commit granularity**
1. **chore(shared): add ApiCode.UNAUTHORIZED** — code + any re-export only

**Dependencies**
- None

**Risks / failure modes**
- Forgetting to rebuild/link `@ai-chat/shared` so backend still sees old codes

---

#### Task 1.2: Auth env config + `.env.example` + bcrypt dependency

**Purpose**
- Make demo credentials and TTL configurable and deploy-safe before writing session code.

**Scope**
- **Do**: Add `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SESSION_TTL_HOURS` (default 24) to backend config (`backend/src/config/env.ts`); document in `.env.example` with hash-generation one-liner; add `bcryptjs` (+ types if needed) to backend; fail fast on missing/invalid `AUTH_PASSWORD_HASH` at boot (same spirit as missing LLM key in deploy).
- **Don't**: Implement login handlers; don't accept plaintext `AUTH_PASSWORD`; don't commit real secrets.

**Suggested implementation notes**
- Hash generation note example: `node -e "require('bcryptjs').hash('your-password', 10).then(console.log)"`
- Local: put hash in `.env.local` / secrets; never commit real values
- Assumption: boot fails hard if hash missing—do not silently allow open chat

**Acceptance criteria**
- `.env.example` lists the three auth vars + short hash note
- Config module reads and validates them
- Process refuses to start (or refuses auth mode) without `AUTH_PASSWORD_HASH`
- `bcryptjs` installable / importable in backend
- No plaintext password env supported

**Suggested commit granularity**
1. **chore(backend): add bcryptjs and auth env schema** — package.json + env.ts
2. **docs: document AUTH_* in .env.example** — example + hash note only

**Dependencies**
- None (can parallelize with 1.1; prefer after 1.1 if shared rebuild is in flight)

**Risks / failure modes**
- Committing a real hash of a known demo password into git
- Soft-failing when hash missing (leaves chat open)

---

### Milestone 2: Session store + Auth HTTP APIs

**Goal**
- Server can issue, probe, and revoke sessions with Chinese user-facing errors.

**Tasks**

#### Task 2.1: SQLite `auth_sessions` + session helpers

**Purpose**
- Persist sessions across process restart within absolute TTL.

**Scope**
- **Do**: Create `auth_sessions` table (`id`, `token_hash` UNIQUE, `username`, `created_at`, `expires_at`, `revoked_at`); helpers: create session (random 32+ byte token, store sha256 hash), find valid by raw token, revoke, purge expired (optional on write).
- **Don't**: HTTP routes yet; don't store raw token in DB; don't link sessions to conversations.

**Suggested implementation notes**
- Prefer `backend/src/auth/` or extend store pattern near `backend/src/store/chatStore.ts`—keep auth isolated under `backend/src/auth/` per build-spec
- Token: `randomBytes(32).toString('base64url')`; persist `sha256(token)`
- TTL: `expires_at = now + AUTH_SESSION_TTL_HOURS`
- Unit-test helpers in this or next commit (create / expire / revoke)

**Acceptance criteria**
- Table migrates/creates on boot with existing SQLite approach
- create → findValid returns username + expiresAt
- expired or revoked → findValid fails
- DB never contains plaintext session token
- Unit tests cover create / expiry / revoke

**Suggested commit granularity**
1. **feat(backend): add auth_sessions schema and helpers** — schema + CRUD helpers
2. **test(backend): cover auth session TTL and revoke** — tests only

**Dependencies**
- Task 1.2 (TTL + username from config)

**Risks / failure modes**
- Storing raw token in SQLite
- Clock skew only on client (server must own `expires_at`)

---

#### Task 2.2: `POST /api/auth/login` + `GET /api/auth/me` + `POST /api/auth/logout`

**Purpose**
- Expose the auth contract the frontend will call.

**Scope**
- **Do**: Wire three routes with envelope; login verifies username (timing-safe compare) + `bcrypt.compare` vs `AUTH_PASSWORD_HASH`; wrong creds → `UNAUTHORIZED` + Chinese msg (do not reveal which field); empty → `BAD_REQUEST` Chinese; me/logout use Bearer; logout idempotent success preferred; never log password/raw token.
- **Don't**: Protect conversations yet; don't touch WS; don't build FE.

**Suggested implementation notes**
- Files: `backend/src/auth/` routes + mount in `backend/src/server.ts`
- Login out: `{ token, username, expiresAt }`
- Me out: `{ username, expiresAt }`; expired → msg like `登录已过期，请重新登录`
- Wrong login msg e.g. `账号或密码错误`
- `/health` unchanged and public

**Acceptance criteria**
- curl login success returns token + username + expiresAt
- Wrong password → `code === UNAUTHORIZED`, Chinese `msg`, no stack/hash leak
- Empty body → `BAD_REQUEST` Chinese
- me with valid Bearer → 0 + user fields
- me with missing/expired/revoked → `UNAUTHORIZED` Chinese
- logout with Bearer revokes; subsequent me fails
- logout without valid token still safe (idempotent success or clear unauthorized—pick one and document)
- Passwords/tokens never appear in logs

**Suggested commit granularity**
1. **feat(backend): add /api/auth login me logout** — routes + wiring
2. **test(backend): auth HTTP credential and session probe** — request-level tests if harness exists; else helper-level + manual curl notes in PR

**Dependencies**
- Tasks 1.1, 1.2, 2.1

**Risks / failure modes**
- Revealing “user not found” vs “bad password”
- Logging Authorization header or password
- Breaking `/health` by accidental global auth middleware

---

### Milestone 3: HTTP conversation gate

**Goal**
- Anonymous clients cannot list/mutate conversations.

**Tasks**

#### Task 3.1: Bearer middleware on `/api/conversations*`

**Purpose**
- Enforce AuthN on existing chat HTTP APIs.

**Scope**
- **Do**: Middleware parse `Authorization: Bearer <token>`; validate session; set `req.auth`; on failure return envelope `UNAUTHORIZED` + Chinese `msg` (HTTP 401 optional alongside); apply only to conversation routes; leave `/api/auth/*` and `/health` reachable as designed.
- **Don't**: Change conversation response bodies on success; don't add roles.

**Suggested implementation notes**
- Mount narrowly on conversation router, not global app
- Reuse session `findValid` from Task 2.1
- Existing clients without Bearer will break until FE Task 5.x—expected

**Acceptance criteria**
- No/invalid Bearer on `GET/PATCH/DELETE /api/conversations*` → `UNAUTHORIZED` Chinese
- Valid Bearer → same success behavior as today
- `GET /health` still public, no secrets
- `POST /api/auth/login` still public

**Suggested commit granularity**
1. **feat(backend): require Bearer on conversation HTTP APIs** — middleware + mount

**Dependencies**
- Tasks 2.1, 2.2

**Risks / failure modes**
- Accidentally protecting `/health` or login
- Middleware order issues (body parser / error handler)

---

### Milestone 4: WS auth gate

**Goal**
- Unauthenticated WebSocket connections cannot drive LLM/chat protocol.

**Tasks**

#### Task 4.1: Shared WS types for `auth` / `auth_ok`

**Purpose**
- Keep FE/BE message types aligned before changing handlers.

**Scope**
- **Do**: Add client message `{ type: 'auth', token: string }` and server ack e.g. `{ type: 'auth_ok' }` (and error path using existing error shape) to shared WS types.
- **Don't**: Change FE client behavior yet; don't remove existing chat message types.

**Suggested implementation notes**
- Locate existing WS type defs under `shared/`
- Keep URL `/ws` with no query token

**Acceptance criteria**
- Types compile in shared + backend import
- No runtime protocol change until Task 4.2

**Suggested commit granularity**
1. **feat(shared): add WS auth message types** — types only

**Dependencies**
- None beyond shared package workflow (can start after 1.1)

**Risks / failure modes**
- Divergent ad-hoc string types between FE and BE

---

#### Task 4.2: Server WS: post-`connected` auth gate + deadline

**Purpose**
- Block `hello` / `chat` / `resume` / `stop` until session validated.

**Scope**
- **Do**: Connection starts `authenticated=false`; after `connected`, accept `auth`; validate token; send `auth_ok` or error+close; reject business msgs until authed (allow `ping` if already supported); optional ~5s auth deadline then close; on expiry/revoke during use, reject/close.
- **Don't**: Put token in query string; don't change LLM adapter.

**Suggested implementation notes**
- Files: `backend/src/websocket/handleMessage.ts`, `connectionManager.ts`, `server.ts` as needed
- Algorithm: build-spec § Algorithm notes
- Log auth success/failure without raw token

**Acceptance criteria**
- Connect → `connected`; send chat before auth → error / ignore (UNAUTHORIZED semantics), no LLM call
- Valid `auth` → `auth_ok` → existing hello/chat flow works
- Invalid/expired token → error + close
- Unauthenticated socket past deadline closes (if deadline implemented)
- No `?token=` required or documented as default

**Suggested commit granularity**
1. **feat(backend): require WS auth message before chat** — gate + deadline
2. **test(backend): WS rejects unauthenticated chat** — unit/integration as feasible

**Dependencies**
- Tasks 2.1, 4.1 (and practically 2.2 for issuing tokens in manual tests)

**Risks / failure modes**
- Forgetting to gate `resume`/`stop`/`hello`
- Closing too aggressively on `ping`
- Token leaking into server logs

---

### Milestone 5: Frontend auth client + store

**Goal**
- Browser can hold a session, call auth APIs, attach Bearer, and centrally clear on 401.

**Tasks**

#### Task 5.1: Auth API module + HTTP Bearer attachment

**Purpose**
- Thin client for login/logout/me; all conversation fetches send Bearer.

**Scope**
- **Do**: `frontend/src/apis/auth.ts` (or equivalent) with `login` / `logout` / `fetchMe`; extend `apis/http` client to read token from a getter and set `Authorization`; map envelope errors so UI can prefer `msg`.
- **Don't**: Build LoginPage UI; don't add router yet.

**Suggested implementation notes**
- Match existing HTTP helper patterns under `frontend/src/apis/`
- Token source: auth store or temporary getter injectable to avoid circular imports
- Chinese fallback constants can live next to auth API (`登录失败，请稍后重试` / `网络异常，请检查连接后重试`)

**Acceptance criteria**
- login/me/logout functions typed against envelope
- Conversation HTTP calls include Bearer when token present
- Empty/missing server `msg` can be replaced by fixed Chinese fallback helper
- No password logged on client

**Suggested commit granularity**
1. **feat(frontend): add auth API client and Bearer header support** — apis + http client only

**Dependencies**
- Milestone 2 APIs available (for manual verification)

**Risks / failure modes**
- Circular import between http client and auth store
- Attaching Bearer to `/health` unnecessarily (harmless) vs forgetting conversations (harmful)

---

#### Task 5.2: Auth Zustand store + persist + session cleanup helper

**Purpose**
- Single source of client auth status and shared cleanup for logout/401/expiry.

**Scope**
- **Do**: Store `{ token, username, expiresAt, status: 'unknown'|'authenticated'|'anonymous' }`; persist key e.g. `ai-chat-auth-v1`; helpers: `setSession`, `clearAuth`, `bootstrapFromStorage`; **`forceLogoutLocal()`** clears auth storage **and** chat persist via `clearChat()` / wipe conversation fields; expose hook for 401 interceptor to call cleanup (navigation can wait until router exists—provide callback registration if needed).
- **Don't**: Implement full router redirects here (stub callback OK); don't redesign chat store schema beyond clear/wipe.

**Suggested implementation notes**
- Keep chat store key `ai-chat-state-v7` separate
- Server history must remain; only client UI state wiped
- Status `unknown` during boot me-in-flight

**Acceptance criteria**
- Token survives refresh via localStorage
- `clearAuth` removes auth key
- Force logout local clears chat messages / conversationId / title from client persist
- 401 handler path can invoke the same cleanup function
- Unit test for clearAuth + chat wipe if cheap

**Suggested commit granularity**
1. **feat(frontend): add auth store and logout cleanup helper** — store + tests
2. **feat(frontend): wire HTTP 401 to session cleanup** — interceptor only (navigate deferred if no router)

**Dependencies**
- Task 5.1

**Risks / failure modes**
- Clearing server-side history by calling DELETE APIs (must not)
- Leaving stale chat UI in localStorage after logout

---

### Milestone 6: Router + LoginPage + RequireAuth

**Goal**
- Unauthenticated users only see login; authenticated users reach Chat.

**Tasks**

#### Task 6.1: Add `react-router-dom` and route shell

**Purpose**
- Introduce MVP routes only: `/login` and `/`.

**Scope**
- **Do**: Dependency `react-router-dom` v6; `App.tsx` uses `BrowserRouter` / `Routes`; `/login` placeholder or empty outlet; `/` wraps existing `ChatPage` behind a stub `RequireAuth` that still allows all (temporary) **or** immediately redirects—prefer Task 6.2 same session if tiny; unknown paths redirect by session.
- **Don't**: Nested chat routes; code-splitting forests; redesign App theme.

**Suggested implementation notes**
- MVP scope only—see build-spec Frontend routes
- Prefer `Navigate replace` for auth redirects

**Acceptance criteria**
- App renders via router without breaking dark `ConfigProvider`
- `/` still shows Chat when auth forced/authenticated (next task hardens)
- Package locked in frontend package.json

**Suggested commit granularity**
1. **chore(frontend): add react-router-dom and route shell** — dep + App routes wiring with Chat at `/`

**Dependencies**
- Task 5.2 recommended (boot status); can stub auth true temporarily only if followed immediately by 6.2 in same day—prefer not shipping stub open gate

**Risks / failure modes**
- Shipping an open `/` after middleware is on (broken UX) or open chat without server auth (bad)—sequence with 6.2 quickly
- Vite SPA fallback already OK for `/login` in prod—confirm nginx/`try_files` if applicable

---

#### Task 6.2: `RequireAuth` + boot `GET /api/auth/me`

**Purpose**
- Enforce gate using server probe, not client clock alone.

**Scope**
- **Do**: On app boot, if token present call `fetchMe`; success → `authenticated`; fail → cleanup → `anonymous`; `RequireAuth` waits while `unknown` (null/splash); unauth visiting `/` → `/login`; auth visiting `/login` → `/`; optional expiry toast using server `msg` or fallback Chinese.
- **Don't**: Build full login form (Task 6.3); don't skip server me when token exists.

**Suggested implementation notes**
- Document `USE_MOCK` auth bypass in code comment if enabled—prefer skip only for pure UI mock
- Avoid redirect loops (unknown must not bounce)

**Acceptance criteria**
- No token → `/` redirects to `/login`
- Valid token → `/` shows Chat; `/login` redirects to `/`
- Expired token → cleanup auth+chat client; `/login`; Chinese message when available
- While `unknown`, Chat is not briefly flashed (or flash is minimal/null)

**Suggested commit granularity**
1. **feat(frontend): RequireAuth gate with /api/auth/me bootstrap** — gate component + boot logic

**Dependencies**
- Tasks 5.2, 6.1, backend me endpoint

**Risks / failure modes**
- Redirect loop between `/` and `/login`
- Flashing Chat HTML before redirect (shared-device leak)

---

#### Task 6.3: LoginPage UI + submit flow

**Purpose**
- Credential form matching dark theme; navigate to chat on success.

**Scope**
- **Do**: `frontend/src/pages/Login/` with antd `Form` + `Input` + `Input.Password` + `Button`; empty-field Chinese validation; submit → login API → save session → `navigate('/', { replace: true })`; loading / anti double-submit; show server `msg` or Chinese fallback; reuse App color tokens (`#0a0c10`, etc.).
- **Don't**: CAPTCHA, register, OAuth, remember-me; don't fetch chat history on login page.

**Suggested implementation notes**
- Centered card on dark canvas; no new design system
- Prefer server msg; never show stack/hash/token

**Acceptance criteria**
- Login page usable at `/login` desktop-first
- Empty fields blocked with Chinese hints
- Wrong password stays on login; Chinese error; no navigation to Chat
- Success enters Chat (`/`)
- Button shows loading and prevents double submit
- Visuals match Chat dark tokens

**Suggested commit granularity**
1. **feat(frontend): add LoginPage form and styles** — UI only wired to auth store/API
2. **fix(frontend): login error copy prefers msg with Chinese fallback** — if not included in first commit

**Dependencies**
- Tasks 5.1, 5.2, 6.2

**Risks / failure modes**
- Exposing technical errors from network layer
- Leaving token in memory after failed parse

---

### Milestone 7: WS client auth wiring

**Goal**
- Authenticated chat works end-to-end over WebSocket after HTTP login.

**Tasks**

#### Task 7.1: Send `{ type: 'auth', token }` after `connected`; wait `auth_ok`

**Purpose**
- Align FE WS client with server gate from Milestone 4.

**Scope**
- **Do**: Update `frontend/src/apis/websocket/client.ts` (and `useChatService` if needed): on `connected`, send auth with current token; wait for `auth_ok` before `hello` / resume; on auth error/close → force local logout cleanup + navigate `/login` (via registered callback); no `?token=` on URL.
- **Don't**: Redesign chat protocol beyond auth handshake.

**Suggested implementation notes**
- Token from auth store at connect time; reconnect must re-auth
- Coordinate with existing mock path (`USE_MOCK`)—document bypass

**Acceptance criteria**
- After login, WS connects, auths, then hello/chat works as before
- Missing/invalid token → user returned to login with Chinese feedback; chat client state cleared
- WS URL has no token query param
- Reconnect after refresh still auths when session valid

**Suggested commit granularity**
1. **feat(frontend): authenticate WebSocket after connected** — client + service wiring

**Dependencies**
- Tasks 4.2, 5.2, 6.2 (navigation target)

**Risks / failure modes**
- Racing hello before auth_ok
- Infinite reconnect loop on bad token without clearing session

---

### Milestone 8: Sidebar logout UX

**Goal**
- Match product brief userCard logout with confirm; shared-device safe cleanup.

**Tasks**

#### Task 8.1: userCard username + ⋮ + upward danger menu

**Purpose**
- Surface session username and logout entry without changing history row UX.

**Scope**
- **Do**: Sidebar `.userCard`: show username from auth store; Avatar first character; entire card `cursor: pointer`; ⋮ with no extra hover style on icon; click card → Dropdown `placement="topRight"`/`top`; single item「退出登录」+ `LogoutOutlined`, both danger/red; `getPopupContainer` if clipping.
- **Don't**: Implement confirm/logout API yet (can wire menu click to open confirm in 8.2 same PR if tiny—prefer separate commits).

**Suggested implementation notes**
- Files: `frontend/src/pages/Chat/components/Sidebar/index.tsx` + less
- Avoid stealing clicks from history list

**Acceptance criteria**
- Username matches session (not hardcoded「用户」 once logged in)
- Hover pointer on `.userCard`
- Menu opens upward with red logout item + icon
- ⋮ has no distinct hover chrome beyond card

**Suggested commit granularity**
1. **feat(frontend): Sidebar userCard menu chrome for logout** — UI only / menu open

**Dependencies**
- Task 5.2 (username in store); Chat page reachable via Milestone 6

**Risks / failure modes**
- Menu clipped at sidebar bottom
- Whole-card click conflicting with other controls

---

#### Task 8.2: Logout confirm modal + cleanup + navigate

**Purpose**
- Second confirmation; revoke session; clear local auth+chat; land on login.

**Scope**
- **Do**: `App.useApp().modal.confirm` (same pattern as delete-conversation): dark, danger OK, cancel available; OK → best-effort `POST /api/auth/logout` → disconnect WS → `forceLogoutLocal()` → `navigate('/login', { replace: true })`; cancel does nothing; logout API failure still clears local in `finally`.
- **Don't**: Delete server conversations; don't sound like “delete data” in copy.

**Suggested implementation notes**
- Copy e.g. confirm title/content about ending login session, not deleting history
- Reuse cleanup from Task 5.2

**Acceptance criteria**
- Cancel → still logged in; still on Chat
- OK → `/login`; auth storage cleared; chat UI persist cleared
- Server history still listable after re-login
- Deep link `/` while logged out → login gate
- Confirm keyboard OK/Cancel works (a11y baseline)

**Suggested commit granularity**
1. **feat(frontend): confirm logout clears session and chat persist** — modal + logout flow

**Dependencies**
- Tasks 5.2, 7.1 (WS disconnect), 8.1, backend logout

**Risks / failure modes**
- Clearing only auth but leaving previous user's messages on screen
- Blocking logout if logout API fails (must still clear local)

---

### Milestone 9: Verify + ship documentation

**Goal**
- Prove acceptance criteria; leave repo truthful for the next engineer.

**Tasks**

#### Task 9.1: Automated tests for auth critical paths

**Purpose**
- Lock session TTL, middleware 401, and WS auth gate regressions.

**Scope**
- **Do**: Backend tests—credential fail; session create/expiry/revoke; conversation middleware 401; WS unauth reject (as feasible). Frontend—gate redirect and/or logout cancel vs OK where cheap.
- **Don't**: Full Playwright suite required unless already cheap to add; manual E2E still required in 9.2.

**Suggested implementation notes**
- Follow existing `*.test.ts` patterns in backend/frontend
- Prefer fast unit tests over brittle e2e for MVP

**Acceptance criteria**
- New/updated tests pass in workspace npm test
- At least one test each: bad login, expired session, conversations unauthorized, WS gate (or documented gap if harness cannot)

**Suggested commit granularity**
1. **test: cover login session middleware and WS auth gate** — tests only (may split FE/BE)

**Dependencies**
- Milestones 2–8 implemented

**Risks / failure modes**
- Tests that depend on real wall-clock flakiness—control time/`expires_at` in helpers

---

#### Task 9.2: Manual E2E vs product acceptance + docs ship

**Purpose**
- Close the feature: human verification + doc truth.

**Scope**
- **Do**: Walk product-brief acceptance criteria; update `features-doc/shared/api-contracts.md`; add `login-page/engineering/current-state.md`; flip login-page statuses to **shipped** where accurate; note shared demo user shares history; confirm `.env.example` / README auth notes.
- **Don't**: Expand scope (CAPTCHA, OAuth, rate limit) in this pass.

**Suggested implementation notes**
- Checklist source: `product/product-brief.md` §10 + build-spec
- Mark backlog tasks done in PR description if useful

**Acceptance criteria**
- Manual checklist all pass (login, fail, refresh, TTL or simulated expiry, logout confirm, deep-link/back, Chinese errors, `/health` public)
- api-contracts + current-state updated
- Feature README/status labels reflect shipped
- No plaintext password env documented as supported

**Suggested commit granularity**
1. **docs: ship login-page current-state and api-contracts** — docs only
2. **chore: mark login-page feature shipped in indexes** — README/status yaml only if separate

**Dependencies**
- Task 9.1 recommended; all feature milestones

**Risks / failure modes**
- Docs saying shipped while WS still open anonymously
- Forgetting to document shared-account history behavior

---

## 4. Cross-Cutting Checks

Apply on every task that touches the area:

- **Type safety**: shared → backend/frontend still typecheck; WS message types shared
- **Lint / existing test workspaces**: don't leave red CI for unrelated files
- **Envelope errors**: Chinese `msg`; prefer server msg; FE fallback; never secrets/stacks/hashes/tokens
- **Auth checks**: UI gate + HTTP Bearer + WS `auth` all required for “done”
- **Public exceptions**: `/health` and login remain reachable without session
- **Loading / error / empty**: login button loading; gate `unknown` state; auth toasts Chinese
- **Session cleanup**: logout / 401 / WS auth fail always clear auth **and** chat client persist
- **Logging**: login success/fail without password; revoke without raw token
- **Config validation**: missing `AUTH_PASSWORD_HASH` fails fast
- **A11y baseline**: form labels; focus visible; modal keyboard
- **Responsiveness**: login readable desktop-first (≥1280 mindset); no mobile redesign required
- **Out of scope guard**: no CAPTCHA, sign-up, OAuth, refresh tokens, rate limit blocker, `?token=` WS

## 5. Definition of Done for MVP

- **Feature completeness**
  - Login gate, session TTL, logout confirm, HTTP+WS protection, Chinese errors, Sidebar userCard UX per brief
- **Quality baseline**
  - Critical backend auth paths tested; no password/token logging; hash-only env password
- **Validation baseline**
  - Manual acceptance checklist green; curl proves anonymous HTTP/WS blocked
- **Deployment readiness**
  - `.env.example` documents `AUTH_*` + hash generation; Compose works with new env; `/health` public; `current-state.md` + api-contracts updated; feature status **shipped**

## 6. Recommended Working Pattern for AI Coding

1. Feed **one task id** (e.g. `Task 2.1`) per generation; paste its Purpose/Scope/Acceptance/Commits.
2. Do **not** merge milestones or unrelated tasks in one step.
3. After each task: run relevant tests/typecheck; manually curl or click the acceptance bullets.
4. Commit using the task’s suggested granularity (1–3 small commits); stop if review finds scope creep.
5. If blocked, implement the listed Dependencies first—don’t stub past HTTP/WS gates.
6. After Milestone 4, verify server rejection **before** polishing Login UI.
7. Update this backlog checkboxes in PR notes if helpful; keep `build-spec.md` as design authority if conflicts arise.

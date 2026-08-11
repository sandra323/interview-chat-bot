# Product Brief

```yaml
feature: login-page
doc_role: design-intent
status: planned
last_verified: 2026-08-11
```

> Design intent only. All capabilities below are **planned** (not implemented). After shipping, add `engineering/current-state.md` and update status labels.  
> Related: [`../README.md`](../README.md), chat [`../../ai-chat-page/engineering/current-state.md`](../../ai-chat-page/engineering/current-state.md), visuals [`../../shared/design-system.md`](../../shared/design-system.md).

## 1. Product Overview
- What the product is: **Login gate + logout** for this repo’s AI chat app (login page + logout from the chat sidebar user area)
- Who it is for: Users in demo / interview scenarios who must not enter chat or consume the server LLM key while anonymous
- What core problem it solves: Chat is usable without auth (server API key exposure); sidebar user area has no logout
- Why this product should exist now: Chat main flow is **shipped**; next step is minimal auth to reduce anonymous abuse and accidental entry into the main UI

## 2. Goals
- Primary goal: Unauthenticated users stay on the login page; only after valid username/password can they enter chat and use existing features
- Secondary goals:
  - Sidebar `.userCard` provides logout with a second confirmation
  - Login sessions have a clear expiry policy; expiry is treated like a logged-out state
  - Login page visuals match the AI Chat dark theme
- Success metrics / measurable outcomes
  1. No valid session when hitting protected routes → login page only; no chat UI
  2. Correct credentials → enter chat; send/receive works (existing WS/HTTP)
  3. Logout (after confirm) → back to login; cannot return to chat without signing in again
  4. Session expired → redirected to login (or equivalent gate); must re-enter credentials
  5. Wrong credentials → clear error; stay off the main page

## 3. Target Users
- Primary users: Local / demo operators (a shared demo account is fine)
- Key user characteristics: Need a simple gate, not a full account center; familiar with NeuralChat dark UI
- Core usage scenarios
  1. Open site → log in → use chat and sidebar
  2. Open user area → Log out → confirm → must re-enter credentials to continue
  3. Return next day or after TTL → session expired; must log in again
  4. (Negative) Hit chat routes while logged out → forced back to login

## 4. Problem Statement
- Current pain points
  1. Frontend chat works immediately; server-held API key is exposed to anonymous use
  2. Sidebar user area (avatar + “用户”) has no logout
- Existing alternatives: Stay demo-without-login; or adopt a full IdP (OAuth/SSO)
- Why current solutions are insufficient: No login fails the gate requirement; full IdP is too heavy for this interview/demo repo

## 5. MVP Scope
### In Scope
- Login page: username + password; submit; error feedback; loading / anti double-submit — **planned**
- After success, enter existing AI Chat main page — **planned**
- App/route gate: without login, chat and later pages are not visible or usable — **planned**
- Sidebar `.userCard`: avatar (antd `Avatar`) + username from session — **planned**
- Ellipsis (⋮) icon on `.userCard` (no separate hover style on the icon) — **planned**
- Entire `.userCard` uses `cursor: pointer` on hover — **planned**
- Click `.userCard` → dropdown that opens **upward**; single item “退出登录” (Log out) — **planned**
- Log-out label preceded by a matching semantic icon; icon and text both red — **planned**
- Click Log out → **confirm modal** (same pattern as history delete confirm: `App.useApp().modal.confirm`, dark theme, primary `danger` OK, default Cancel) → on OK clear session → login page — **planned**
- Login session **absolute TTL** (see “Session expiry” below) and expiry gate / messaging — **planned**
- Login UI/colors aligned with AI Chat (dark tokens / antd dark) — **planned**

### Out of Scope
- Slider CAPTCHA (later) — **planned** (explicitly not this MVP)
- Sign-up, password reset, change password, MFA — **planned** / not this MVP
- OAuth / SSO / third-party login — not this MVP
- “Remember me”, refresh tokens, multi-device kick — not this MVP
- Idle sliding renewal — not this MVP (keeps complexity down; see expiry design)
- Profile edit / avatar upload — not this MVP
- Roles (admin, etc.) — not this MVP
- Reworking the chat protocol itself (reuse HTTP/WS; wrap auth outside) — see shared docs

### Explicit assumptions (for execution)
- MVP may use a **preset demo account** (server check or env config); no self-serve registration
- Session survives refresh until logout, expiry, or server rejection
- Backend must reject chat APIs when unauthenticated (UI gate alone is not enough)

### Session expiry design (MVP decision)

| Item | Decision | Rationale |
|------|----------|-----------|
| Strategy | **Absolute TTL** from successful login time | Simple, predictable; limits how long a shared demo session can hang and burn the API key |
| Default duration | **24 hours** | Covers same-day demos; overnight requires re-login. Override via env (e.g. `AUTH_SESSION_TTL_HOURS=24`) |
| Not doing | Idle sliding, refresh tokens, “remember 30 days” | Avoid dual-token and renewal races in MVP |
| Authority | Server decides expiry (`exp` on session/token); client clears state on boot or unauthorized | Prevents bypass by tweaking local clock only |
| Expiry UX | Same cleanup as logout (auth + local chat persist) → login page; optional message “登录已过期，请重新登录” | Shared-device safe; copy differs from explicit logout |
| Explicit logout | Invalidate server session immediately (if any); clear client auth **and** local chat persist; do not wait for TTL | Shared-device safe; server history remains for re-login |

## 6. User Flow
1. **Entry**: User opens app root (or any protected route)
2. **Gate**: No valid session (logged out / expired / never logged in) → login page; valid session → AI Chat
3. **Login page**: Enter username + password → submit
4. **Validating**: Button loading / disabled to prevent double submit
5. **Failure**: Show error; stay on login
6. **Success**: Persist session (with expiry) → chat page; `.userCard` shows avatar + username + ⋮
7. **In session**: Use existing chat/history; if TTL ends mid-use, next protected call or boot check fails → expiry message → login
8. **Logout entry**: Hover `.userCard` (pointer) → click → upward menu with red Log out (+ icon) → choose it
9. **Confirm**: Modal aligned with “删除对话” (`modal.confirm`, dark, `okButtonProps.danger`, default cancel)
   - Title example: `退出登录`
   - Body example: `确定退出当前账号吗？退出后需要重新登录才能继续使用。`
   - OK: `退出` (danger); Cancel: `取消`
   - Cancel → close modal; remain logged in
   - OK → clear session → login page
10. **Done**: No valid session; using main features requires credentials again

## 7. Functional Requirements
1. Unauthenticated or expired access to protected routes shows only the login page; do not mount/expose chat UI
2. Login form has username and password; password is masked
3. Empty username/password cannot submit (or show validation errors)
4. Failed login shows a readable **Chinese** error (prefer server `msg`, else fixed frontend fallback) and does not navigate to the main app; never show sensitive/technical internals
5. Successful login enters AI Chat; within absolute TTL, refresh keeps the session (unless logged out)
6. Server session carries expiry; default **24h** absolute TTL (configurable); auth fails after expiry
7. On boot, route guard, or unauthorized response, client clears local session and returns to login; expiry may show “登录已过期，请重新登录”
8. Sidebar `.userCard` shows avatar + username + ⋮ icon with **no** separate hover style on the ⋮
9. `.userCard` uses `cursor: pointer`; click opens an upward dropdown
10. Menu has only Log out; leading semantic icon; icon and text are red
11. Choosing Log out opens a confirm dialog first (same pattern as delete-history confirm: dark, danger OK, default cancel); logout runs only after OK
12. After confirm, clear client/server session **and wipe local chat UI persist** (`clearChat` equivalent), then navigate to login
13. After logout or expiry, back button or deep link into chat is still blocked by the gate; previous message list must not remain visible on the login transition
14. Login page uses the same dark surfaces/borders/primary accents as AI Chat

## 8. Non-Functional Expectations
- **Usability**: Readable login/expiry errors; logout path: user area → Log out → confirm (cancelable, anti-misclick)
- **Security/privacy**: No plaintext password display; session not trivially forgeable (server check + TTL); never log passwords; 24h TTL limits idle demo abuse
- **Reliability**: After logout/expiry, chat requests must not succeed (client stop + server reject)
- **Responsiveness**: Desktop-first like Chat; single-column login form is enough
- **Maintainability**: Auth decoupled from chat; document TTL and login API in `features-doc/shared/api-contracts.md` / build-spec
- **Performance**: Login first paint stays light; no need to load full chat history

## 9. Risks and Open Questions
- **Product risks**: Shared demo accounts make conversation history shared (acceptable for demos; document it)
- **Technical risks**: UI-only gate is bypassable → MVP needs backend auth (cookie session or Bearer) on `/api/*` and `/ws`; long-lived WS must disconnect or reject after TTL
- **UX risks**: Whole `.userCard` click vs history rows; upward menu clipping at sidebar bottom; confirm copy must not sound like “delete data”
- **Dependency risks**: Relies on antd dark + `App.useApp().modal` (same as Sidebar delete confirm)
- **Unclear assumptions** (decide in build-spec)
  - Demo account: fixed env user (`AUTH_USERNAME` + **`AUTH_PASSWORD_HASH` only** — resolved in build-spec; no plaintext password env)
  - Session medium: HttpOnly cookie vs localStorage token (expiry is server-authoritative) — build-spec currently picks Bearer + localStorage for MVP
  - ~~Error copy / router~~ — resolved in build-spec (Chinese `msg` + fallback; introduce `react-router-dom` for `/login` + `/` only)

## 10. Acceptance Criteria
- No session → login page only; no sidebar history / chat area
- Wrong credentials → readable Chinese error (prefer server `msg`, else frontend fallback); stay in login flow; no sensitive/technical leak
- Correct credentials → enter AI Chat; can send and receive (when backend/Key are configured)
- Refresh while not expired and not logged out → still signed in
- Past absolute TTL (default 24h) → protected features blocked; return to login; optional “session expired” style message
- `.userCard` shows avatar, username, ⋮; ⋮ has no extra hover style
- Hover `.userCard` → pointer cursor
- Click `.userCard` → upward menu with red Log out + leading red icon
- Click Log out → confirm modal first (dark, danger OK, cancel available); cancel does not log out
- Confirm OK → login page; local chat UI state cleared (server history intact)
- After logout or expiry, without signing in again → cannot use chat or later pages (including deep link / back); prior conversation UI not left on screen
- Login visuals match AI Chat dark system
- No slider CAPTCHA, sign-up, OAuth, remember-me, or refresh-token flows in this MVP

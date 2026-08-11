# Login Page — Acceptance Checklist

```yaml
feature: login-page
doc_role: qa
status: shipped
last_verified: 2026-08-11
```

Walk after deploy / local smoke. Prefer automated suites for regressions; this list is for human E2E.

## Auth gate

- [ ] No session → only login page; no sidebar history / chat area
- [ ] Wrong credentials → Chinese error; stay on login; no sensitive/tech leak
- [ ] Correct credentials → enter Chat; can send/receive when backend/Key configured
- [ ] Refresh within TTL while logged in → still signed in
- [ ] Deep link `/` while logged out → forced to `/login`

## Session expiry / revoke

- [ ] After logout or forced 401 → `/login`; prior conversation UI not left on screen
- [ ] Server history still available after re-login (same demo user)
- [ ] Optional: simulate expiry (short `AUTH_SESSION_TTL_HOURS` or revoke) → re-login required

## Sidebar logout

- [ ] `.userCard` shows avatar + session username; hover pointer
- [ ] Click card → upward menu;「退出登录」red + icon
- [ ] Confirm cancel → still logged in
- [ ] Confirm OK → login page; local chat cleared

## Protocol / public

- [ ] Anonymous `GET /api/conversations` → UNAUTHORIZED Chinese
- [ ] WS without `auth` cannot chat; after login WS works
- [ ] `GET /health` public
- [ ] Login visuals match Chat dark system
- [ ] No CAPTCHA / sign-up / OAuth in this MVP

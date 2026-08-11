# Shared — API Contracts

```yaml
doc_role: current-state
last_verified: 2026-08-11
```

## HTTP envelope — **shipped**

All `/api/*` routes use:

```ts
{ code: number; msg: string; data: T | null }
```

- Success: `code === 0` (`ApiCode.SUCCESS`), `data` non-null  
- Failure: non-zero `code`, `data: null`, user-facing Chinese `msg`  
- `/health` is **outside** this envelope  

Codes: `shared/src/types/api.ts` — `BAD_REQUEST` 40000, `UNAUTHORIZED` 40100, `RATE_LIMITED` 42900, `NOT_FOUND` 40400, `INTERNAL_ERROR` 50000.

Frontend unwrap: `frontend/src/apis/http/client.ts` (`apiGet` / `apiPost` / `apiPatch` / `apiDelete`). Authenticated `UNAUTHORIZED` with a Bearer attached triggers local auth+chat cleanup.

## Auth HTTP — **shipped**

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | public | Body `{ username, password }` → `{ token, username, expiresAt }`. Rate-limited (per IP request cap + failure lockout). New login revokes other sessions for the same user. |
| POST | `/api/auth/logout` | Bearer preferred | Idempotent `{ ok: true }` even without valid token |
| GET | `/api/auth/me` | Bearer | `{ username, expiresAt }`; expired/revoked → `UNAUTHORIZED` |

Demo credentials: env `AUTH_USERNAME` + `AUTH_PASSWORD_HASH` (bcrypt). Absolute TTL: `AUTH_SESSION_TTL_HOURS` (default 24).

## Conversation HTTP — **shipped** (auth required)

All `/api/conversations*` require `Authorization: Bearer <token>`.

See [`../ai-chat-page/engineering/api-surface.md`](../ai-chat-page/engineering/api-surface.md) for list/rename/delete/messages shapes.

## WebSocket — **shipped**

Message union types: `shared/src/types/websocket.ts`.

Auth handshake (**shipped**):
- Connect to `/ws` **without** query token  
- Server sends `{ type: 'connected', connectionId }`  
- Client must send `{ type: 'auth', token }`  
- Server replies `{ type: 'auth_ok }` or `error` (`UNAUTHORIZED`) + close  
- Until authenticated, `hello` / `chat` / `resume` / `stop` are rejected; `ping` allowed  
- Unauthenticated sockets may be closed after a short deadline (~5s)  

Notable chat behaviors:
- `hello` without `conversationId` unbinds to a blank client session (no empty DB row)  
- `session.conversationId` may be `null`  
- Streaming via `reply_*`; `resume` / `reply_catchup` for switch-back  
- Legacy `reply` remains in the type union and client handler; new streams use `reply_*`  
- Unknown client fields that look like legacy `apiKey` / config are rejected  

## Public exceptions

- `GET /health` — fully public; no secrets in body  

## Planned (not this MVP)

- HttpOnly cookie sessions (Bearer still in localStorage — XSS can steal token), refresh tokens, CAPTCHA, OAuth, multi-user account service  

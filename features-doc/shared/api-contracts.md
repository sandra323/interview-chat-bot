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
- Failure: non-zero `code`, `data: null`, user-facing `msg`  
- `/health` is **outside** this envelope  

Codes: `shared/src/types/api.ts` (`BAD_REQUEST` 40000, `NOT_FOUND` 40400, `INTERNAL_ERROR` 50000).

Frontend unwrap: `frontend/src/apis/http/client.ts` (`apiGet` / `apiPatch` / `apiDelete`).

## Feature-specific routes

See [`../ai-chat-page/engineering/api-surface.md`](../ai-chat-page/engineering/api-surface.md).

## WebSocket — **shipped**

Message union types: `shared/src/types/websocket.ts`.

Notable behaviors:
- `hello` without `conversationId` unbinds to a blank client session (no empty DB row)  
- `session.conversationId` may be `null`  
- Streaming via `reply_*`; `resume` / `reply_catchup` for switch-back  
- Legacy `reply` remains in the type union and client handler; new streams use `reply_*`  
- Unknown client fields that look like legacy `apiKey` / config are rejected  

## Planned

- Authenticated HTTP/WS (tokens, cookies) — not present  

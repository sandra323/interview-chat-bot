# AI Chat Page — API Surface

```yaml
feature: ai-chat-page
doc_role: current-state
last_verified: 2026-08-11
```

Cross-cutting shapes: [`../../shared/api-contracts.md`](../../shared/api-contracts.md).

## HTTP (`backend/src/server.ts`) — **shipped**

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness + `llmConfigured` (not API envelope) |
| `GET` | `/api/conversations` | Sidebar list (`items[]`: id, title, updatedAt, generating) |
| `GET` | `/api/conversations/:id/messages` | Paginated messages; `page=1` = newest batch |
| `PATCH` | `/api/conversations/:id` | Rename (`body.title`, trim, 1–100 chars) |
| `DELETE` | `/api/conversations/:id` | Delete + abort in-memory generation job |

Frontend clients: `frontend/src/apis/conversations.ts`, `frontend/src/apis/http/client.ts`.

## WebSocket (`/ws`) — **shipped**

Client → server: `hello`, `chat`, `resume`, `stop`, `ping`  
Server → client: `connected`, `session`, `reply_start`, `reply_delta`, `reply_end`, `reply_catchup`, `generation_error`, `error`  
Also in the union (legacy / client-handled): `reply` — still typed and handled in `useChatService`; live streaming path uses `reply_*`

Types: `shared/src/types/websocket.ts`.

## Not exposed — **planned / n/a**

- Auth / session cookies  
- Client `set_config` / API key over WS (**deprecated**)  

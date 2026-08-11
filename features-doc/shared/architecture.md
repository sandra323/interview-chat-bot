# Shared — Architecture

```yaml
doc_role: current-state
last_verified: 2026-08-11
```

## Monorepo

| Package | Role |
|---------|------|
| `frontend/` | React 18 + Vite + antd + Less modules + Zustand |
| `backend/` | Express HTTP + `ws` WebSocket + SQLite chat store + LLM adapter |
| `shared/` | Types, model allowlist, timeouts |

## Runtime split — **shipped**

```text
Browser ──WebSocket (chat / hello / stop / resume)──► Node backend ──HTTPS──► LLM API
   │                         │
   ├── HTTP /api/conversations* (list, pages, rename, delete)
   └── localStorage (`ai-chat-state-v7`): messages, model, conversationId/title (no secrets)
                         └── DEEPSEEK_API_KEY in server env only
```

- **WebSocket**: live generation stream and session binding  
- **HTTP**: conversation CRUD-ish read/list/rename/delete and message pages  
- **SQLite**: server source of truth for conversations/messages/generations  

## Planned

- User auth layer in front of the same chat APIs (`login-page`)  
- Production WSS / reverse-proxy TLS details beyond Compose defaults  

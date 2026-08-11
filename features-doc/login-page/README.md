# Login Page

```yaml
feature: login-page
status: planned
doc_role: index
last_verified: 2026-08-11
```

**Not implemented.** Placeholder for future auth UX.

## Before building

1. Read [`../shared/architecture.md`](../shared/architecture.md) and [`../shared/api-contracts.md`](../shared/api-contracts.md).  
2. Copy skeletons from [`../_templates/`](../_templates/).  
3. Decide how auth wraps existing chat HTTP/WS (do not invent parallel chat protocols).  
4. Keep capabilities marked **planned** until code lands; then add `engineering/current-state.md`.  

## Planned (intent only)

- User sign-in / session  
- Gate anonymous abuse of server-held LLM key  
- Post-login entry into `ai-chat-page`  

## Explicitly not started

- No routes, pages, or components under `frontend/` for login yet.  

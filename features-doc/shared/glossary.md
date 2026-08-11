# Shared — Glossary

```yaml
doc_role: current-state
last_verified: 2026-08-11
```

| Term | Meaning |
|------|---------|
| `conversationId` | Server UUID for a chat thread |
| `conversationTitle` | Client/header title; custom rename or first user message |
| `generationId` | In-flight or finished assistant generation job id |
| `generating` | Server flag or local set: reply still running |
| `historyRefreshKey` | Bumps Sidebar to refetch conversation list |
| `navEpoch` | Guards stale async results after switch/clear |
| `historyEpoch` (Sidebar) | Guards stale list fetches vs optimistic rename/delete |
| `USE_MOCK` | Build-time mock chat without real WS/LLM |
| `page` (messages API) | `1` = newest batch; higher = older |
| shipped / planned / … | Doc status labels — see [`../README.md`](../README.md) |

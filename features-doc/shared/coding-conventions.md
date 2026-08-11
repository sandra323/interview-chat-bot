# Shared — Coding Conventions

```yaml
doc_role: current-state
last_verified: 2026-08-11
```

## Frontend — **shipped** norms

1. **antd** for interactive/feedback: Button, Select, Modal, Dropdown, Input, message, Alert.  
2. **Native + Less CSS Modules** for shell, bubbles, sidebar chrome, suggestions.  
3. **Do not introduce shadcn/ui.**  
4. Theme via `ConfigProvider` + dark algorithm; tokens in `frontend/src/styles/variables.less`.  
5. Chat wiring in `useChatService` (mock + real branches); UI state in Zustand (`useChatStore`).  
6. User-facing errors: Chinese friendly copy; prefer server `msg` when present.  
7. Prefer CSS ellipsis over hard string truncation for titles.  

## Backend — **shipped** norms

1. Express JSON routes under `/api/*` with `sendSuccess` / `sendFail`.  
2. WebSocket protocol changes go through `shared` types first.  
3. Generations via `GenerationRunner`; HTTP delete must abort via runner registry.  
4. Never log API keys.  

## Planned

- Shared ESLint rule pack docs (if added later)  

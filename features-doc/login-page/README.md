# Login Page

```yaml
feature: login-page
status: shipped
doc_role: index
last_verified: 2026-08-11
```

**Shipped.** Demo login gate + logout around the AI Chat app.

## Docs

| File | Role |
|------|------|
| [`engineering/current-state.md`](engineering/current-state.md) | **Truth** — what works today |
| [`qa/acceptance-checklist.md`](qa/acceptance-checklist.md) | Manual E2E checklist |
| [`product/product-brief.md`](product/product-brief.md) | Product intent (`design-intent`; may still say planned in body — trust current-state) |
| [`engineering/build-spec.md`](engineering/build-spec.md) | Technical design (`design-intent`) |
| [`engineering/execution-backlog.md`](engineering/execution-backlog.md) | Implementation backlog (`historical` after ship) |

## Quick start

1. Set `AUTH_USERNAME`, `AUTH_PASSWORD_HASH`, `AUTH_SESSION_TTL_HOURS` in `.env.local` (see root `.env.example`)  
2. Start backend + frontend; open app → `/login`  
3. After login, use Chat; Sidebar user card → 退出登录  

Shared demo accounts share server conversation history by design.

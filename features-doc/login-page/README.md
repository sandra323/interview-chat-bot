# Login Page

```yaml
feature: login-page
status: planned
doc_role: index
last_verified: 2026-08-11
```

**Not implemented yet.**

## Docs

| File | Role |
|------|------|
| [`product/product-brief.md`](product/product-brief.md) | Product intent (login gate + logout) |
| [`engineering/build-spec.md`](engineering/build-spec.md) | Technical MVP build spec |
| [`engineering/execution-backlog.md`](engineering/execution-backlog.md) | Step-by-step implementation backlog (tasks + AC + commits) |

## Before coding

1. Read product brief → build spec → **execution backlog**  
2. Read [`../shared/architecture.md`](../shared/architecture.md), [`../shared/api-contracts.md`](../shared/api-contracts.md)  
3. Implement **one backlog task at a time** (order follows build-spec §12)  
4. After ship: write `engineering/current-state.md` and flip labels to **shipped**

## Not started

- No login routes/components under `frontend/` yet  
- No auth APIs / `auth_sessions` table yet  

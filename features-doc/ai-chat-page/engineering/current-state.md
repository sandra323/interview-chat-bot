# AI Chat Page — Current State

```yaml
feature: ai-chat-page
doc_role: current-state
last_verified: 2026-08-11
```

**Source of truth for what is implemented.** Design docs may still mention older MVP assumptions; if they conflict with this file, trust this file + code.

---

## Shipped

### Chat core
- Multi-turn chat over WebSocket with streaming deltas (`reply_start` / `reply_delta` / `reply_end`); client also handles legacy `reply`
- Model select from allowlisted models (Header `Select`); model preference persisted in Zustand (`ai-chat-state-v7`)
- Stop in-flight generation (`stop` + local finalize)
- Mock mode via `USE_MOCK` (no backend required for UI demos)
- Connection banner when not mock; input gated on connection / history loading
- Empty state with suggestions; antd error toasts
- Markdown / code blocks in assistant bubbles (Streamdown)
- Assistant message copy (bubble action) + code-block copy (Streamdown control)
- Pending / streaming UX via MessageBubble (“正在生成…” + cursor), not the standalone TypingIndicator

### Persistence & sessions
- Server-side conversations in SQLite (`backend/src/store/chatStore.ts`)
- Client persist (no secrets): `messages`, `model`, `conversationId`, `conversationTitle`
- Sidebar history list (newest first), title from custom title or first user message
- Switch conversation without stopping background generation; “生成中” indicator + poll
- New chat unbinds session (`hello` without creating empty DB row); empty chats pruned/filtered
- Message pagination: scroll-up loads older pages (`GET …/messages?page=&pageSize=`)
- Rename conversation (`PATCH /api/conversations/:id`) — modal; does not reorder list
- Delete conversation (`DELETE /api/conversations/:id`) — confirm; aborts runner; resets active session safely
- Header title = full conversation title with CSS ellipsis when space is tight
- Sidebar title = CSS ellipsis; more menu (rename/delete); touch-visible ⋮ via `@media (hover)`

### Security / config
- LLM API key **server-only** (`DEEPSEEK_API_KEY`); browser never sends key
- BYOK ConfigPanel **removed** (not present under `pages/Chat/`; see decision `001`)
- Unified HTTP envelope `{ code, msg, data }` for `/api/*`

### UI shell
- Dark NeuralChat tokens in `frontend/src/styles/variables.less`
- Collapsible sidebar + Header + main column
- antd `ConfigProvider` dark theme

---

## Partial

| Item | What’s done | What’s missing |
|------|-------------|----------------|
| Message actions (copy / regenerate / like) | Assistant bubble **复制** + Streamdown code-block copy | Regenerate / like (and fuller action row) not productized |
| TypingIndicator | Component exists under `MessageList` | Chat passes `loading={ui.loading && !isGenerating}` so the dots path is effectively unused; pending UI is in MessageBubble |
| Assistant markdown | Streamdown rendering | Not a full GFM suite by design |
| Mobile layout | Basic fluid layout | No dedicated mobile IA (**planned** / out of MVP) |

---

## Explicitly NOT shipped (design mentioned — keep short)

| Item | Status | Notes |
|------|--------|-------|
| User login / accounts | **planned** | Tracked under `features-doc/login-page/` |
| Client-side API key / ConfigPanel UX | **deprecated** | Replaced by server key; decision `001` |
| Theme toggle (light/dark) | **planned** | Locked to dark only |
| File / image / voice input | **planned** | Out of current MVP |
| Chat export | **planned** | Not built |
| WSS + production TLS hardening extras | **planned** | See decision follow-ups |
| Per-IP / user quotas | **planned** | Abuse controls beyond demo |

---

## Known agent pitfalls (doc drift)

Early `product-brief` / `build-spec` / `ui-handoff` still describe or assume some of:
- Browser-stored API key / ConfigPanel  
- Single local-only session / “history stub only”  
- No backend DB  

Those are **outdated**. Prefer this file.

---

## Quick verification commands

```bash
# HTTP
GET  /api/conversations
GET  /api/conversations/:id/messages?page=1&pageSize=10
PATCH /api/conversations/:id   { "title": "..." }
DELETE /api/conversations/:id

# WS (see shared/api-contracts.md)
hello | chat | stop | resume | ping
```

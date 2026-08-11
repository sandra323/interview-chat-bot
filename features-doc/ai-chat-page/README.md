# AI Chat Page

```yaml
feature: ai-chat-page
status: shipped
doc_role: index
last_verified: 2026-08-11
```

Single-page NeuralChat-style AI chat (React + Express/WS). **For “what works today”, read [`engineering/current-state.md`](engineering/current-state.md) first.**

## Code anchors

| Area | Path |
|------|------|
| Page shell | `frontend/src/pages/Chat/` |
| Sidebar / history | `frontend/src/pages/Chat/components/Sidebar/` |
| Messages / input | `…/MessageList/`, `MessageBubble/`, `ChatInput/` |
| Chat service | `frontend/src/hooks/useChatService.ts` |
| Client store | `frontend/src/store/useChatStore.ts` |
| HTTP APIs | `frontend/src/apis/conversations.ts` |
| Shared types | `shared/src/types/` |
| HTTP routes | `backend/src/server.ts` |
| WS handler | `backend/src/websocket/handleMessage.ts` |
| Persistence | `backend/src/store/chatStore.ts` |
| LLM jobs | `backend/src/generation/` |

## Doc map

| Path | Role | Notes |
|------|------|-------|
| [`engineering/current-state.md`](engineering/current-state.md) | **current-state** | Shipped / partial / not shipped |
| [`engineering/api-surface.md`](engineering/api-surface.md) | current-state | Endpoints & WS types used by this page |
| [`product/product-brief.md`](product/product-brief.md) | design-intent | Annotated vs reality |
| [`engineering/build-spec.md`](engineering/build-spec.md) | historical | Early tech plan; many assumptions superseded |
| [`engineering/execution-backlog.md`](engineering/execution-backlog.md) | historical | Milestone checklist archive |
| [`ui/ui-handoff.md`](ui/ui-handoff.md) | design-intent | UI execution; status annotated |
| [`ui/ui-direction.md`](ui/ui-direction.md) | design-intent | Dark tech direction (**shipped**) |
| [`ui/design-tokens.md`](ui/design-tokens.md) | design-intent | Tokens ↔ `variables.less` |
| [`ui/component-mapping.md`](ui/component-mapping.md) | design-intent | antd vs native |
| [`qa/acceptance-checklist.md`](qa/acceptance-checklist.md) | current-state | Manual QA |
| [`decisions/001-api-key-server-side.md`](decisions/001-api-key-server-side.md) | historical decision | Server-held API key |

## Reading order

1. This README  
2. `engineering/current-state.md`  
3. Only then product/UI/build docs (respect **planned** markers)  
4. Code under the anchors above  

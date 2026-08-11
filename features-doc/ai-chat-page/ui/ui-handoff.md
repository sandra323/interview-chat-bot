# UI Handoff

```yaml
feature: ai-chat-page
doc_role: design-intent
last_verified: 2026-08-11
```

Execution brief for the NeuralChat visual system. Read with [`ui-direction.md`](ui-direction.md), [`design-tokens.md`](design-tokens.md), and [`component-mapping.md`](component-mapping.md).  
**Reality:** [`../engineering/current-state.md`](../engineering/current-state.md) — several scope rows below were later expanded (multi-session is **shipped**; ConfigPanel **deprecated**).

## Goal

Ship a **single-page Chat shell** (collapsible sidebar + main column) visually aligned with the [Figma Make NeuralChat reference](https://www.figma.com/make/bu0j0F7YSvvyfrt8EVpBHm/AI%E8%81%8A%E5%A4%A9%E6%9C%BA%E5%99%A8%E4%BA%BA%E9%A1%B5%E9%9D%A2--Community-), while keeping chat capabilities.

| Capability | Status |
|------------|--------|
| WebSocket chat + mock (`USE_MOCK`) | **shipped** |
| Connection status banner | **shipped** |
| Zustand store / shared types | **shipped** |
| Enter-to-send, stop while generating | **shipped** |
| Pending / streaming UX | **shipped** (MessageBubble hint + cursor; TypingIndicator **partial**) |
| Streaming assistant output | **shipped** |
| LLM API config panel (BYOK) | **deprecated** (removed) |
| Multi-session sidebar | **shipped** *(beyond original handoff stub)* |

## Target page structure

```
App
└── ChatPage
    ├── Sidebar (260px ↔ 0)          # shipped — real history, not stub
    │   ├── New chat
    │   ├── Session list + ⋮ menu
    │   └── User card (display)
    └── Main
        ├── Header (collapse, title, model select, clear)
        ├── ConnectionBanner (non-mock)
        ├── MessageList (empty | conversation)
        └── ChatInput
```

Primary code anchors: `frontend/src/pages/Chat/`, `frontend/src/components/Layout/`, `frontend/src/styles/`.

## UI states

| State | Expected behavior | Status |
|-------|-------------------|--------|
| Empty | Logo, headline, suggestions | **shipped** |
| Conversation | User right / assistant left; stream | **shipped** |
| Sidebar open / closed | 260 ↔ 0 | **shipped** |
| Model selector | antd Select + badges | **shipped** |
| Loading / typing | Stop control + bubble pending hint | **shipped**; TypingIndicator dots **partial** (wiring unused) |
| Streaming cursor | Accent blink on pending content | **shipped** |
| Error | antd message | **shipped** |
| Connection | Banner; input gated | **shipped** |
| Config incomplete / Settings | BYOK panel | **deprecated** |

## Scope decisions

| Item | Original decision | Status now |
|------|-------------------|------------|
| Visual direction | Dark tech | **shipped** |
| Multi-session history backend | Out of scope / stub only | **superseded → shipped** |
| Mobile layout | Desktop-first | **shipped** direction; dedicated mobile IA **planned** |
| Theme toggle | Not in MVP | **planned** |
| antd; no shadcn | Locked | **shipped** |

## Constraints

1. Tokens from `design-tokens.md` → `variables.less` — **shipped**
2. Prefer antd for Form/Select/Modal/Alert/message/Button/Input — **shipped** (Form/ConfigPanel removed)
3. Native bubbles, suggestions, CatBot — **shipped**; TypingIndicator component **partial**
4. Preserve mock badge — **shipped**
5. Do not expand into auth / upload / export without new docs — auth **planned**
6. Fonts: Inter + JetBrains Mono — **shipped** intent

## Acceptance checklist (docs-era)

Prefer [`../qa/acceptance-checklist.md`](../qa/acceptance-checklist.md) for current shipped QA.

## Suggested implementation order

*(Historical — UI pass largely complete.)*

## Done definition for this docs phase

The four UI files exist under `ai-chat-page/ui/`:

- `ui-direction.md`
- `design-tokens.md`
- `component-mapping.md`
- `ui-handoff.md`

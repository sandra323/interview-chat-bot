# UI Handoff

Execution brief for implementing the NeuralChat visual system in this repo. Read with [`ui-direction.md`](ui-direction.md), [`design-tokens.md`](design-tokens.md), and [`component-mapping.md`](component-mapping.md).

**This handoff is for UI work only when scheduled.** Docs generation does not change `frontend/` by itself.

## Goal

Ship a **single-page Chat shell** (collapsible sidebar + main column) visually aligned with the [Figma Make NeuralChat reference](https://www.figma.com/make/bu0j0F7YSvvyfrt8EVpBHm/AI%E8%81%8A%E5%A4%A9%E6%9C%BA%E5%99%A8%E4%BA%BA%E9%A1%B5%E9%9D%A2--Community-), while **keeping** existing product capabilities:

- WebSocket chat + mock mode (`USE_MOCK`)
- LLM API config panel
- Connection status banner
- Zustand store / shared types
- Enter-to-send, loading / typing, local persistence as already implemented

## Target page structure

```
App
└── ChatPage
    ├── Sidebar (260px ↔ 0)
    │   ├── Brand (icon + name)
    │   ├── New chat / clear entry
    │   ├── Session list stub (optional UI; see Scope)
    │   └── User card (display)
    └── Main
        ├── Header (collapse, title, model select, settings)
        ├── ConnectionBanner (non-mock)
        ├── ConfigPanel (toggle)
        ├── MessageList (empty | conversation)
        └── ChatInput + disclaimer
```

Primary code anchors: `frontend/src/pages/Chat/`, `frontend/src/components/Layout/`, `frontend/src/styles/`.

## UI states to implement

| State | Expected behavior |
|-------|-------------------|
| Empty (no messages / new chat) | Centered logo, headline (“有什么我可以帮您的？” or product-equivalent), model subtitle, 2×2 suggestion chips that send on click |
| Conversation | Messages in `max-w-2xl` column; user right / assistant left; timestamps |
| Sidebar open / closed | Width `260` ↔ `0`, ~200ms transition; main flexes |
| Model selector open | Dropdown/Select with optional badges; selection updates UI (wire to config `model` when applicable) |
| Loading / typing | Typing dots while waiting; send disabled; optional button loading |
| Streaming (if enabled later) | Accent blink cursor on assistant text — only if product adds streaming; MVP brief currently out-of-scopes streaming |
| Error | antd `message` / `notification` with error text; dismissible |
| Connection | antd `Alert` for connecting / closed / error; input disabled when not `open` (non-mock) |
| Config incomplete | Existing validation; block send until config complete (non-mock) |
| Settings open | ConfigPanel visible; antd Form fields |

## Scope decisions

| Item | Decision |
|------|----------|
| Visual direction | Dark tech — locked in `ui-direction.md` |
| Multi-session history backend | **Out of scope** (matches `product-brief.md`) |
| Sidebar history list | **UI stub only**: show current session label and/or static placeholders; “新建对话” / clear can reset local messages — **do not** build multi-session persistence |
| Mobile layout | Desktop-first; no dedicated mobile IA this pass |
| Theme toggle | Not in MVP |
| Backend / WS protocol | **No changes** |
| Component library | Introduce **antd**; prefer antd for interactive pieces; native otherwise (`component-mapping.md`) |
| shadcn | **Do not use** |

## Constraints

1. Apply tokens from `design-tokens.md` into `variables.less` / CSS variables; restyle via Less modules.
2. Prefer antd for Form, Select/Dropdown, Modal.confirm, Alert, message, Button, Input.TextArea.
3. Keep chat bubbles, suggestion grid, CatBot icon, and typing dots as native implementations.
4. Preserve mock mode badge behavior.
5. Do not expand MVP into auth, file upload, or export.
6. Fonts: Inter + JetBrains Mono.

## Acceptance checklist

- [ ] App background and surfaces match dark tokens (`#0a0c10` / `#0d1017` / `#111318` / `#1e2330`)
- [ ] Inter (UI) + JetBrains Mono (meta/model/time) loaded and applied
- [ ] Sidebar collapses/expands ~200ms; open width 260px
- [ ] Empty state: logo, title, subtitle, 2×2 suggestions
- [ ] User messages right-aligned blue bubbles; assistant left with avatar + accent label
- [ ] Message column and input capped at ~`max-w-2xl`, centered
- [ ] Composer: auto-growing textarea (max ~160px), send enabled only when text present and not loading / connected as today
- [ ] Typing indicator visible while waiting for reply
- [ ] Config panel usable with antd Form; save + reconnect still works
- [ ] Errors via antd message/notification; Clear Chat via `Modal.confirm`
- [ ] Connection banner via antd Alert (non-mock)
- [ ] No shadcn dependency; antd themed to dark tokens
- [ ] Existing send / WS / mock flows still pass manual smoke test

## Suggested implementation order

1. Tokens + global dark base + antd `ConfigProvider`
2. Shell layout (sidebar + header + main)
3. MessageList empty + bubbles + typing
4. ChatInput
5. ConfigPanel / Toast / Banner / Confirm migrations to antd
6. Polish motion, scrollbar, focus states

## Done definition for this docs phase

The four root files exist and are enough for a later Cursor coding pass:

- `ui-direction.md`
- `design-tokens.md`
- `component-mapping.md`
- `ui-handoff.md`

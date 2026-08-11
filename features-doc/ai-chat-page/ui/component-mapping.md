# Component Mapping

```yaml
feature: ai-chat-page
doc_role: design-intent
last_verified: 2026-08-11
```

Maps Figma Make (NeuralChat) UI blocks to this repo’s React tree. **antd first** for interactive / form / feedback pieces; **native HTML + Less CSS Modules** for layout shells and chat-specific chrome. **Do not introduce shadcn/ui.**

Reality: [`../engineering/current-state.md`](../engineering/current-state.md).

## Selection rules

1. Clear interaction, a11y, or state machine (forms, menus, confirms, alerts, toasts) → **antd**.
2. Pure layout or distinctive chat visuals (bubbles, suggestion grid, brand icon) → **native + Less**.
3. Theme antd via `ConfigProvider` to match [`design-tokens.md`](design-tokens.md) (dark algorithm + token overrides).

## Figma → implementation

| Figma / logical block | Implementation | Status | Notes |
|-----------------------|----------------|--------|-------|
| App shell (sidebar + main) | Native shell | **shipped** | |
| Sidebar collapse | Native width transition | **shipped** | |
| Brand + CatBotIcon | Native SVG | **shipped** | In Header / empty state |
| 新建对话 | antd `Button` | **shipped** | |
| History list items | Native row + Dropdown ⋮ | **shipped** | Real API list; rename/delete |
| User card (sidebar footer) | Native | **shipped** | Display-only |
| Header hamburger | antd `Button` | **shipped** | |
| Conversation title | Native + CSS ellipsis | **shipped** | Full title when space allows |
| ModelSelector | antd `Select` + `Tag` | **shipped** | |
| Empty state | Native | **shipped** | |
| Suggestion cards | Native buttons | **shipped** | |
| MessageBubble (user/assistant) | Native + Streamdown | **shipped** | Includes bubble **复制** when not pending |
| TypingIndicator | Native component | **partial** | Mounted in MessageList but Chat wiring keeps `loading` false during gen |
| Message actions row | Bubble copy + code copy | **partial** | Copy shipped; regenerate / like **planned** |
| ChatInput | antd `Input.TextArea` + send/stop | **shipped** | |
| ConfigPanel (BYOK) | — | **deprecated** | Directory removed; do not revive |
| Toast / error | antd `message` | **shipped** | |
| Clear / delete confirm | antd `Modal` | **shipped** | |
| ConnectionBanner | antd / custom banner | **shipped** | |
| Mock badge | antd `Tag` | **shipped** | |

## Repo path → target direction

| Path | Status |
|------|--------|
| `frontend/src/pages/Chat/index.tsx` | **shipped** shell wiring |
| `frontend/src/components/Layout/Header/` | **shipped** |
| `frontend/src/pages/Chat/components/Sidebar/` | **shipped** (real history) |
| `frontend/src/pages/Chat/components/MessageList|Bubble|ChatInput` | **shipped** |
| `frontend/src/pages/Chat/components/TypingIndicator/` | **partial** (component present; see wiring note above) |
| ~~`frontend/src/pages/Chat/components/ConfigPanel/`~~ | **deprecated** — deleted; do not recreate BYOK |
| `frontend/src/styles/variables.less` | **shipped** dark tokens |
| `frontend/src/components/CatBotIcon/` | **shipped** |

## antd theming notes

- Use `theme.darkAlgorithm` and override tokens — **shipped** in `App.tsx`.
- Chat bubbles / suggestions stay native — **shipped**.

## Out of scope for mapping

- shadcn/ui or a second component library — **planned** not to introduce.
- Full dedicated markdown highlighter suite — Streamdown **shipped** as current approach.

# Component Mapping

Maps Figma Make (NeuralChat) UI blocks to this repo’s React tree. **antd first** for interactive / form / feedback pieces; **native HTML + Less CSS Modules** for layout shells and chat-specific chrome. **Do not introduce shadcn/ui.**

## Selection rules

1. Clear interaction, a11y, or state machine (forms, menus, confirms, alerts, toasts) → **antd**.
2. Pure layout or distinctive chat visuals (bubbles, suggestion grid, brand icon) → **native + Less**.
3. Theme antd via `ConfigProvider` to match [`design-tokens.md`](design-tokens.md) (dark algorithm + token overrides).

## Figma → implementation

| Figma / logical block | Implementation | Notes |
|-----------------------|----------------|-------|
| App shell (sidebar + main) | Native `div` / `aside` / `main` **or** antd `Layout` | Prefer **native shell** if deep dark customization fights antd Layout; use antd only for inner controls |
| Sidebar collapse | Native width transition (`260px` ↔ `0`) | Matches design; `Layout.Sider` collapsible is optional if theming stays clean |
| Brand + CatBotIcon | Native inline SVG component | Port from Figma Make `CatBotIcon`; no antd equivalent |
| 新建对话 | antd `Button` | Ghost / default bordered; full width in sidebar |
| History list items | Native `<button>` list | Selected: left border + `--color-selected-bg`; antd `Menu` is heavier than needed for MVP static/local list |
| User card (sidebar footer) | Native | Display-only; gradient avatar chip via CSS |
| Header hamburger | antd `Button` (`type="text"`) + icon | Or native icon button with token colors |
| Conversation title | Native `<p>` / `<h1>` | Truncate with CSS |
| ModelSelector | antd `Select` **or** `Dropdown` + `Tag` for badges | Prefer `Select` if options are flat; custom option render for LATEST / POWERFUL / FAST |
| Empty state | Native | Logo + headline + copy |
| Suggestion cards | Native `<button>` grid (`grid-cols-2`) | Hover border/bg via tokens |
| MessageBubble (user) | Native | Right-aligned; `--color-user-bubble`; `rounded-2xl` + sharp top-right |
| MessageBubble (assistant) | Native | Avatar + model label + markdown body + action row |
| MarkdownContent | Native light parser (keep simple) | Bold / lists / fenced code; no full markdown suite for MVP |
| TypingIndicator | Native three-dot animation | Closer to design than `Spin`; optional `Spin` on send button only |
| Message actions (复制 / 重新生成 / 点赞) | antd `Button` `type="text"` `size="small"` | Wire only what product needs; copy can use `navigator.clipboard` |
| ChatInput shell | Native flex container | Border / focus-within styles from tokens |
| ChatInput field | antd `Input.TextArea` (`autoSize`) **or** native `textarea` | Prefer **antd** `Input.TextArea` for autoSize + disabled states |
| Send button | antd `Button` (icon) | Active: gradient / primary; loading: `loading` prop or small spinner |
| Disclaimer footer | Native `<p>` | Mono, lowest contrast text |
| ConfigPanel (repo-specific) | antd `Form` + `Input` + `Input.Password` + `Button` | Faster than hand-rolled fields in `ConfigPanel` |
| Toast / error | antd `message` or `notification` | Replace `frontend/src/components/Toast` |
| Clear Chat confirm | antd `Modal.confirm` | Replace `window.confirm` in Header |
| ConnectionBanner | antd `Alert` | Map connection status → type (`info` / `warning` / `error` / `success`) |
| Mock badge | antd `Tag` | Optional in header |

## Repo path → target direction

| Current path | Target |
|--------------|--------|
| `frontend/src/pages/Chat/index.tsx` | Compose sidebar + main shell; keep WebSocket / mock / store wiring |
| `frontend/src/components/Layout/Header/index.tsx` | Restyle to NeuralChat header; `Modal.confirm` for clear; settings toggle may stay or move into sidebar |
| `frontend/src/components/Layout/Main/index.tsx` | Main column flex; host messages + input |
| `frontend/src/pages/Chat/components/MessageList/index.tsx` | Empty state + suggestion grid + scroll list |
| `frontend/src/pages/Chat/components/MessageBubble/index.tsx` | Dark bubbles; assistant meta row; optional action buttons |
| `frontend/src/pages/Chat/components/ChatInput/index.tsx` | antd `Input.TextArea` + send `Button` |
| `frontend/src/pages/Chat/components/TypingIndicator/index.tsx` | Keep native dots; restyle colors to accent |
| `frontend/src/pages/Chat/components/ConfigPanel/index.tsx` | Rebuild fields with antd `Form` |
| `frontend/src/components/Toast/index.tsx` | Prefer antd `message`; deprecate custom Toast when replaced |
| `frontend/src/components/ConnectionBanner/index.tsx` | antd `Alert` |
| `frontend/src/styles/variables.less` | Dark token set from [`design-tokens.md`](design-tokens.md) |
| _(new)_ Sidebar component | e.g. `frontend/src/pages/Chat/components/Sidebar/` — brand, new chat, list stub, user card |
| _(new)_ Brand icon | e.g. `frontend/src/components/CatBotIcon/` |

## antd theming notes

- Use `theme.darkAlgorithm` (or equivalent) and override `colorPrimary`, `colorBgBase`, `colorBorder`, `borderRadius`, `fontFamily` from tokens.
- Chat bubbles and suggestion cards stay outside antd primitives so they are not forced into Card/List defaults.
- Tree-shake / import antd styles once at app entry (`main.tsx`).

## Out of scope for mapping

- shadcn/ui, Radix-only stacks, or a second component library alongside antd.
- Full markdown / syntax-highlighter libraries unless a later task requires them.

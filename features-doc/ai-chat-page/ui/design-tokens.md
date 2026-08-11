# Design Tokens

```yaml
feature: ai-chat-page
doc_role: design-intent
last_verified: 2026-08-11
```

Status: **shipped** in `frontend/src/styles/variables.less`. Also see [`../../shared/design-system.md`](../../shared/design-system.md).

Source: Figma Make NeuralChat (`@theme` + component inline values). Implement via Less variables and CSS custom properties in `frontend/src/styles/variables.less` (and global styles as needed).

## Color

### Surfaces

| Token | Value | Role |
|-------|-------|------|
| `--color-background` | `#0a0c10` | App / main background |
| `--color-sidebar` | `#0d1017` | Sidebar background |
| `--color-card` | `#111318` | Cards, input shell, dropdown panel |
| `--color-muted` | `#1a1f2e` | Disabled / muted fills (e.g. inactive send) |
| `--color-logo-well` | `#0a1628` | Icon / avatar well behind CatBot |

### Borders

| Token | Value | Role |
|-------|-------|------|
| `--color-border` | `#1e2330` | Default borders (alias of card-border) |
| `--color-card-border` | `#1e2330` | Same as border in this system |

### Text

| Token | Value | Role |
|-------|-------|------|
| `--color-foreground` | `#e8eaed` | Primary text, input caret content |
| `--color-text-secondary` | `#9ca3af` | Secondary labels, inactive history title |
| `--color-muted-foreground` | `#6b7280` | Placeholder-level / header icons |
| `--color-text-tertiary` | `#4b5563` | Meta lines, “新建对话” empty title |
| `--color-text-quaternary` | `#374151` | Timestamps, section labels, disclaimer-adjacent |
| `--color-text-disabled` | `#1f2937` | Footer disclaimer (lowest contrast) |

### Brand / interactive

| Token | Value | Role |
|-------|-------|------|
| `--color-primary` | `#3b82f6` | Selected history accent, focus hints |
| `--color-primary-strong` | `#1d4ed8` | Gradient start (CTA), strong blue accent |
| `--color-accent` | `#06b6d4` | Assistant name, status dot, cursor, badges |
| `--color-accent-dim` | `rgba(6, 182, 212, 0.12)` | Badge / accent wash |
| `--color-accent-mid` | `#0891b2` | Gradient end (CTA) |
| `--color-user-bubble` | `#0bb9d7` | User message background (matches `variables.less`) |
| `--color-ai-bubble` | `#151b27` | Optional AI surface (design token; bubbles may be transparent + markdown) |
| `--color-selected-bg` | `rgba(59, 130, 246, 0.1)` | Active history row |
| `--color-selected-text` | `#93c5fd` | Active history title |
| `--gradient-cta` | `linear-gradient(135deg, #1d4ed8, #0891b2)` | Send button (active), avatar chip |

### Markdown / code (content chrome)

| Token | Approx. Tailwind / value | Role |
|-------|--------------------------|------|
| Strong text | `#67e8f9` / cyan-300 | `**bold**` |
| Inline code text | emerald-300 | `` `code` `` |
| Code block text | emerald-200/90 | Fenced blocks |
| Code chrome border | `rgba(255,255,255,0.1)` | Block border / header |

### Scrollbar

| Token | Value |
|-------|-------|
| Track | transparent |
| Thumb | `#2a3040` |
| Thumb hover | `#3b4560` |
| Width | `4px` |
| Thumb radius | `2px` |

### Semantic (repo needs; not strong in Figma)

| Token | Suggested | Role |
|-------|-----------|------|
| `--color-error` | `#ef4444` | Keep for API / connection errors |
| `--color-success` | `#22c55e` | Optional; only if needed |

---

## Typography

### Families

| Token | Stack | Weights |
|-------|-------|---------|
| `--font-sans` | `'Inter', system-ui, sans-serif` | 300, 400, 500, 600 |
| `--font-mono` | `'JetBrains Mono', monospace` | 400, 500 |

Load Inter + JetBrains Mono (Google Fonts or self-host). Ant Design `ConfigProvider` should use `--font-sans` as the base font.

### Scale & usage

| Step | Size | Weight / family | Usage |
|------|------|-----------------|-------|
| Display | `~20px` (`text-xl`) | 600 sans | Empty-state headline |
| Brand | `14px` (`text-sm`) | 600 sans, tight tracking | Sidebar product name |
| Body | `14px` (`text-sm`) | 400 sans, `leading-relaxed` | Bubbles, markdown paragraphs |
| Title (header) | `14px` | 500 sans | Active conversation title |
| Meta | `12px` (`text-xs`) | 400 sans | Secondary lines, actions |
| Mono meta | `12px` / `11px` | 400–500 mono | Model label, timestamps, history meta |
| Badge | `9px` | 500 mono, `letter-spacing: 0.05em` | Model badges (LATEST, etc.) |
| Code | `12px` | mono | Code blocks & inline code |

---

## Spacing

Base unit: **4px**. Prefer 4 / 8 / 12 / 16 / 24.

| Token / rule | Value | Usage |
|--------------|-------|-------|
| `--sidebar-width` | `260px` | Open sidebar |
| `--sidebar-width-collapsed` | `0` | Collapsed (overflow hidden) |
| `--content-max-width` | `42rem` (`max-w-2xl`) | Message column + input |
| `--suggestions-max-width` | `32rem` (`max-w-lg`) | Empty-state suggestion grid |
| Header padding | `16px` × `12px` (`px-4 py-3`) | Top bar |
| Sidebar header padding | `16px` (`px-4 py-4`) | Brand row |
| Message list padding | `16px` × `24px` (`px-4 py-6`) | Scroll area |
| Message stack gap | `24px` (`space-y-6`) | Between messages |
| Bubble padding | `16px` × `12px` (`px-4 py-3`) | User bubble |
| Input shell padding | `16px` × `12px` (`px-4 py-3`) | Composer |
| Input area outer | `16px` bottom / sides, `8px` top | Page chrome |
| Gap sm / md | `8px` / `12px` | Icon+label, header clusters |
| History item | `py-2.5`, `mb-0.5` | List density |
| Selected indicator | `2px` left border | Active history |

### Input field

| Rule | Value |
|------|-------|
| Textarea min-height | `24px` |
| Textarea max-height | `160px` |
| Send button | `32×32px` (`w-8 h-8`) |

---

## Radius

Defined in `variables.less`: `--radius-lg` / `--radius-xl` / `--radius-2xl` / `--radius-full`.

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-md` | *not in `:root`*; callers use `var(--radius-md, 6px)` fallback | Sidebar user card etc. |
| `--radius-lg` | `8px` | Default interactive surfaces |
| `--radius-xl` | `12px` | Empty-state logo, composer shell |
| `--radius-2xl` | `16px` | Message bubbles |
| `--radius-bubble-user-corner` | sharp top-right (CSS, not a Less var) | User bubble asymmetry |
| `--radius-full` | `9999px` | Pills / chips |

---

## Motion

| Name | Spec | Usage |
|------|------|-------|
| `fadeSlideIn` | `0.25s ease-out`; from `opacity 0` + `translateY(8px)` | Message enter |
| `pulse-dot` | `1.2s` infinite ease-in-out; stagger `0.2s` | Typing indicator dots |
| `blink` | `0.7s` infinite; caret color `--color-accent` | Streaming cursor `▋` |
| Sidebar width | `transition ~200ms` | Open / collapse |
| Hover wash | `hover:bg-white/5` | Buttons, rows |
| Suggestion hover | border `blue-500/50`, bg `blue-500/5` | Empty-state cards |

---

## Mapping note (`variables.less`)

Dark tokens above are **shipped** in `frontend/src/styles/variables.less`. Alias keys still exist for back-compat (`--color-bg`, `--color-surface`, `--color-text-primary`).

If design intent and code diverge, **prefer the Less file** for shipped values (e.g. user bubble `#0bb9d7`).

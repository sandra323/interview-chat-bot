# features-doc

Feature-oriented documentation for agents and humans. **Implementation truth lives in code + each feature’s `current-state.md`.** Design docs may contain `planned` items — do not treat those as shipped.

## Status labels (required)

| Label | Meaning | Agent behavior |
|-------|---------|----------------|
| **shipped** | Implemented and usable | Safe to rely on / extend |
| **partial** | Present but incomplete | Read `current-state` + code before changing |
| **planned** | Designed, not built | Reference only; **do not assume exists** |
| **deprecated** | Intentionally dropped | Ignore for new work |
| **archived** | Historical milestone / old plan | Read only when investigating “why” |

Doc roles in front matter:

- `doc_role: current-state` — source of truth for what works today  
- `doc_role: design-intent` — product/tech/UI intent (may mix shipped + planned)  
- `doc_role: historical` — backlog, old assumptions; default skip  

## Layout

```text
features-doc/
├── README.md                 ← you are here
├── _templates/               ← copy when starting a new feature
├── shared/                   ← cross-feature contracts & conventions
├── ai-chat-page/             ← chat SPA feature
└── login-page/               ← planned auth (stub)
```

## Read map (by task)

| Task | Read first |
|------|------------|
| Fix / extend chat behavior | [`ai-chat-page/README.md`](ai-chat-page/README.md) → [`engineering/current-state.md`](ai-chat-page/engineering/current-state.md) → code anchors |
| UI / Figma alignment | [`ai-chat-page/ui/ui-handoff.md`](ai-chat-page/ui/ui-handoff.md) + [`component-mapping.md`](ai-chat-page/ui/component-mapping.md) (check Status columns) |
| HTTP / WebSocket protocol | [`shared/api-contracts.md`](shared/api-contracts.md) → [`ai-chat-page/engineering/api-surface.md`](ai-chat-page/engineering/api-surface.md) |
| Coding style / antd vs native | [`shared/coding-conventions.md`](shared/coding-conventions.md) |
| Architecture overview | [`shared/architecture.md`](shared/architecture.md) |
| Why API key is server-only | [`ai-chat-page/decisions/001-api-key-server-side.md`](ai-chat-page/decisions/001-api-key-server-side.md) |
| Start login page | [`login-page/README.md`](login-page/README.md) → `_templates/` → `shared/*` |
| Original MVP plan / milestones | `*/engineering/build-spec.md`, `execution-backlog.md` (**historical** — verify against `current-state`) |

## Rules for maintaining these docs

1. Align claims with code; mark every capability **shipped / partial / planned**.  
2. If code ships something missing from docs → add it to `current-state` (and briefly to brief/api-surface).  
3. If design mentioned something not built → keep a short **planned** note; never write as if delivered.  
4. Prefer short `current-state.md` over editing huge historical backlogs.

## Shared docs

| File | Purpose |
|------|---------|
| [`shared/architecture.md`](shared/architecture.md) | Monorepo layers, WS vs HTTP |
| [`shared/api-contracts.md`](shared/api-contracts.md) | Envelope, codes, message shapes |
| [`shared/coding-conventions.md`](shared/coding-conventions.md) | FE/BE conventions |
| [`shared/design-system.md`](shared/design-system.md) | Global visual tokens pointer |
| [`shared/glossary.md`](shared/glossary.md) | Domain terms |

# UI Direction

## Decision

Adopt the **NeuralChat dark tech** visual direction from the [Figma Make community design](https://www.figma.com/make/bu0j0F7YSvvyfrt8EVpBHm/AI%E8%81%8A%E5%A4%A9%E6%9C%BA%E5%99%A8%E4%BA%BA%E9%A1%B5%E9%9D%A2--Community-): near-black surfaces (`#0a0c10`), cool blue primary, cyan accent.

Product chrome may keep the existing name **AI Chat** or use **NeuralChat** as brand label in the sidebar; the visual system is what we lock, not the marketing name.

## Why this direction

1. **Source of truth** — Matches the approved Figma Make reference (layout, tokens, motion).
2. **Chat ergonomics** — Dark UI reduces glare for long multi-turn sessions.
3. **Clear role colors** — Blue for user bubbles and primary actions; cyan for assistant identity, status dots, and streaming cursor.
4. **Fits the product** — Lightweight LLM debug/chat client benefits from a focused, tool-like shell rather than a marketing landing look.

## Explicitly not chosen

| Rejected | Reason |
|----------|--------|
| Current repo light gray/white (`variables.less` today) | Diverges from the design reference |
| Purple / indigo gradient “AI default” look | Generic; not in the Figma system |
| Warm cream + terracotta / broadsheet newspaper look | Wrong mood for a chat tool |
| Multi-theme (light + dark) in MVP | Out of scope; ship one locked direction |

## Scope of this decision

- **In**: Desktop-first sidebar + main chat shell; tokens and component feel from the Figma analysis.
- **Out of this decision**: Mobile-optimized layout, theme toggle, full multi-session backend. Those do not reopen the visual direction.

## References

- Token details → [`design-tokens.md`](design-tokens.md)
- Component → antd / native mapping → [`component-mapping.md`](component-mapping.md)
- Execution handoff → [`ui-handoff.md`](ui-handoff.md)

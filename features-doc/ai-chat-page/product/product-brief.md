# Product Brief

```yaml
feature: ai-chat-page
doc_role: design-intent
last_verified: 2026-08-11
```

> **Reality check:** Many early MVP assumptions below are outdated. Prefer [`../engineering/current-state.md`](../engineering/current-state.md). Items are annotated **shipped / planned / deprecated**.

## 1. Product Overview
- What the product is: Light‑weight single‑page AI‑chat web application, which requests LLM API and implements multi‑turn text conversation
- Who it is for: Ordinary end‑users to chat with large‑language‑model, developers for quick‑test LLM interface
- What core problem it solves: Offer a ready‑made chat UI to send user messages, receive model responses and persist conversation history
- Why this product should exist now: Need a low‑cost frontend chat client to debug and experience LLM API quickly

## 2. Goals
- Primary goal: Complete stable multi‑round dialogue by invoking the LLM API on the web‑page MVP
- Secondary goals: Friendly chat interface, reply loading prompt, local conversation‑history storage
- Success metrics
  1. Support no less than 10 continuous rounds of conversation
  2. LLM API request success rate ≥95% under normal network
  3. The page can render model reply within 2s after request sent

## 3. Target Users
- Primary users: Individual users needing text AI chat, front‑end engineers debugging LLM‑API
- Key user characteristics: Require simple interaction, no complicated registration process, focus on dialogue function
- Core usage scenarios
  1. Input text question and obtain LLM reply
  2. Conduct continuous multi‑turn discussion based on historical chat records
  3. Test the response effect of different LLM interfaces

## 4. Problem Statement
- Current pain points
  1. It takes time to build chat‑box UI from zero when accessing LLM‑API
  2. Hard to maintain multi‑turn context transmission manually
  3. Missing loading status and message‑display interaction
- Existing alternatives: Official LLM web console, open‑source heavy‑duty chat‑web projects
- Why current solutions are insufficient: Official platforms lack custom‑API configuration; open‑source projects carry redundant functions with high‑access‑cost

## 5. MVP Scope
### In Scope
- Chat message left‑and‑right layout for user and AI messages — **shipped**
- Text input box with send button and enter‑key send — **shipped**
- Call LLM API (server-held key) and pass conversation context — **shipped** (not browser-configured key)
- Loading state when waiting for model reply — **shipped** (incl. streaming)
- Persist active session (client store + server conversation history) — **shipped**
- Basic error prompt for API / WS failure — **shipped**
- Multi-session sidebar (list / switch / rename / delete) — **shipped** *(added after original brief)*
- Message history pagination — **shipped** *(added after original brief)*

### Out of Scope / later
- User login and account system — **planned** (see `features-doc/login-page/`)
- File upload, picture input, voice interaction — **planned**
- Chat‑record export, theme switching, dedicated mobile IA — **planned**
- Browser BYOK API-key panel — **deprecated** (replaced by server key; decision `001`)
- “No backend” — **deprecated** (Node backend is required and shipped)

## 6. User Flow
1. User opens the AI‑chat single‑page website — **shipped**
2. ~~User fills in LLM API‑key in browser~~ — **deprecated**; server env key used instead
3. User types question and sends (Enter / button) — **shipped**
4. Page shows loading / streaming assistant reply — **shipped**
5. Multi‑round dialogue with server-side history — **shipped**
6. Optional: switch / rename / delete sidebar sessions — **shipped**
7. Refresh: client persist + server conversation resume — **shipped**
8. Clear / new chat or delete session — **shipped**

## 7. Functional Requirements
1. Chat‑area user right / AI left — **shipped**
2. Text input, send button, Enter — **shipped**
3. Context assembled server-side from stored messages — **shipped**
4. Loading / typing while awaiting reply — **shipped**
5. Visible error tips — **shipped**
6. History in SQLite + client persist for active UI state — **shipped**
7. Clear / new chat — **shipped**
8. ~~Configurable API URL and API key in browser~~ — **deprecated**
9. Streaming token output — **shipped** *(was out of original brief)*
10. Sidebar multi-session management — **shipped** *(was out of original brief)*

## 8. Non‑Functional Expectations
- Performance / reliability / usability targets remain design intent; desktop-first — **shipped** direction
- Security: API key server-only — **shipped** (not “key in localStorage”)
- Maintainability: adapter + shared types — **shipped**

## 9. Risks and Open Questions
*(Unchanged as product risks; still relevant.)*

## 10. Acceptance Criteria
See also [`../qa/acceptance-checklist.md`](../qa/acceptance-checklist.md) for an up-to-date shipped checklist.

- Webpage opens on desktop browsers — **shipped**
- ~~User configures API key in UI~~ — **deprecated**
- Multi-turn chat works — **shipped**
- Send locked / stop while generating — **shipped**
- Errors visible — **shipped**
- History survives refresh (server + client) — **shipped**
- Clear / new chat — **shipped**
- Sidebar rename/delete — **shipped**
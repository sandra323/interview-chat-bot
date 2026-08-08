# Product Brief

## 1. Product Overview

- **What the product is:** A web-based AI mock interview app for **front-end developers**. Users register, configure an interview (topic + difficulty), practice through real-time multi-turn Q&A with an AI interviewer, and review saved transcripts later.
- **Who it is for:** Job-seeking or upskilling front-end developers preparing for technical interviews (junior to senior level).
- **What core problem it solves:** Technical interview practice is costly, hard to schedule, or too passive. Users need on-demand, front-end-focused, interactive mock interviews they can pause, resume, and revisit.
- **Why this product should exist now:** LLMs support adaptive follow-up questioning at low cost; WebSocket enables real-time dialogue; interview prep is high-intent and recurring.

**Assumptions (explicit):**
- Web app (desktop-first, mobile-responsive)
- **Front-end engineer role only** — no back-end interview track in v1
- **No evaluation report in v1** — transcript + session history only; scoring/report deferred to v2
- Self-service **registration** + login
- Chinese UI with English technical terms acceptable
- One LLM provider via backend API (provider TBD)
- Slider captcha on login only (not on register or every action)

---

## 2. Goals

- **Primary goal:** Let a registered user complete a full front-end mock interview—from setup through multi-round Q&A to session completion—and resume or review the transcript later.
- **Secondary goals:**
  - Calibrate questioning by difficulty (junior / intermediate / advanced)
  - Preserve full session history for later review
  - Maintain stable real-time chat during interviews
- **Success metrics / measurable outcomes:**
  - ≥80% of started interviews reach `completed` status within 7 days of launch
  - WebSocket session uptime ≥95% (no unrecoverable disconnect during active interview)
  - Median time from "Start Interview" to first AI question ≤3 seconds
  - ≥60% of users who complete one interview start a second within 14 days
  - Registration → first completed interview conversion ≥40% within 7 days

---

## 3. Target Users

- **Primary users:** Front-end developers actively job hunting or upskilling.
- **Key user characteristics:**
  - Familiar with Vue, React, JavaScript, or browser fundamentals
  - Wants structured mock interviews, not generic AI chat
  - Values saved transcripts and session continuity
  - Uses a desktop browser for focused practice
- **Core usage scenarios:**
  1. **Pre-interview drill:** User picks topic + difficulty, runs a 20–40 min mock interview before a real company interview.
  2. **Weak-area training:** User repeats intermediate/advanced sessions on a specific topic (e.g., performance optimization).
  3. **Transcript review:** User browses past sessions and re-reads Q&A to reflect on answers.

---

## 4. Problem Statement

- **Current pain points:**
  - Human mock interviews are expensive and hard to schedule
  - Static question banks don't adapt follow-ups to weak answers
  - Generic AI chat lacks interview structure and persistent history
  - Dropping mid-session loses context and progress
- **Existing alternatives:** LeetCode (coding only), prep books, paid mock platforms, ad-hoc ChatGPT prompts, peer practice.
- **Why current solutions are insufficient:**
  - No simple end-to-end flow: register → configure → live interview → persist → revisit
  - Lack front-end-specific, difficulty-calibrated interview presets
  - Real-time, ordered, reconnect-safe dialogue is not handled out of the box
  - v1 focuses on **practice + transcript**; structured scoring can come later

---

## 5. MVP Scope

### In Scope

- **Registration:** Self-service sign-up with **email, phone number, or username** + password; basic validation (unique identifiers, password rules)
- **Authentication:** Login/logout; slider captcha on login; persistent session (token/cookie)
- **Interview setup:** Fixed role — **Front-end Development Engineer**; user selects:
  - **Direction/topic:** Vue, React, JavaScript, Performance Optimization, Browser Principles (configurable list)
  - **Difficulty:** Junior, Intermediate, Advanced
- **Live AI interview:** WebSocket bidirectional chat; AI asks first question proactively; multi-round contextual follow-ups; real-time message list UI
- **Session persistence:** Save in-progress session metadata + full transcript (AI questions, user answers, follow-ups); restore on re-entry
- **Session completion:** User ends interview; session marked `completed` (no report generated)
- **History:** List past interviews; view full transcript for any session
- **WebSocket reliability:** Heartbeat; auto-reconnect with exponential backoff + random jitter (max 5 attempts); ordered message delivery (server-side sequencing)

### Out of Scope

- **Back-end developer interviews** (Java, Spring, etc.)
- **AI evaluation report** (overall rating, capability breakdown, improvement suggestions) — **v2**
- Voice/video interview
- Code editor / live coding / whiteboard
- Human interviewer or peer matching
- Payment, subscriptions, credits
- Admin dashboard, content moderation console
- Email/SMS verification (unless required later)
- Mobile native apps
- Social sharing, leaderboards, gamification
- Custom job descriptions or company-specific interview packs
- Real-time proctoring or anti-cheat
- Team accounts, recruiter-facing features
- Export to PDF
- Position/role picker (always front-end in v1)

---

## 6. User Flow

**Primary journey: Register and complete a mock interview**

1. **Entry:** Unauthenticated user lands on login page; link to register page available.
2. **Register:** User enters **email, phone number, or username** + password (+ confirm password) → validation passes → account created → redirected to login or auto-logged-in.
3. **Login:** User enters credentials → completes slider captcha → persistent auth session → redirected to dashboard.
4. **Create interview:** User clicks "New Interview" → selects **direction/topic** → selects **difficulty** (Junior / Intermediate / Advanced) → confirms. (Role is implicitly Front-end Engineer.)
5. **Start:** User clicks "Start Interview" → system creates session → opens interview room → WebSocket connects.
6. **Live interview:** AI sends opening question → user types answer → sends → AI sends contextual follow-up(s) → repeat until:
   - User clicks "End Interview", **or**
   - System reaches a configurable round/time limit (e.g., 8–12 exchanges or 30 min)—*assumption for MVP*.
7. **Decision point (disconnect):** If connection drops, client auto-reconnects using **exponential backoff + random jitter**, up to **5 attempts**; on success, reloads session state + message history and user continues. After 5 failed attempts, show disconnected state with manual retry.
8. **Completion:** On end, session status → `completed` → user sees a simple completion confirmation (no report) → option to return to dashboard or view transcript.
9. **Post-session:** User opens history → selects a past session → views full Q&A transcript.

**Secondary journey: Resume interrupted interview**

1. User logs in → dashboard/history shows "In Progress" session.
2. User opens session → WebSocket reconnects → transcript restored → interview continues.

---

## 7. Functional Requirements

### Registration
- FR-1: User can register with **email, phone number, or username** + password (at least one identifier required).
- FR-2: Registration validates required fields, password confirmation match, minimum password rules, and phone number format (when provided).
- FR-3: Registration rejects duplicate email, phone number, or username with a clear error message.
- FR-4: Successful registration creates a user account and redirects to login or authenticated home.

### Authentication
- FR-5: User can log in with any registered identifier (email, phone number, or username) + password.
- FR-6: Login requires slider captcha verification before credentials are accepted.
- FR-7: Authenticated sessions persist across browser refresh (token with expiry or session cookie).
- FR-8: User can log out; logout clears client session and requires re-login for protected routes.

### Interview configuration
- FR-9: All interviews are scoped to **Front-end Development Engineer** (no role selection UI).
- FR-10: User selects one direction/topic from a predefined list (minimum: Vue, React, JavaScript, Performance Optimization, Browser Principles).
- FR-11: User selects difficulty: **Junior**, **Intermediate**, or **Advanced**.
- FR-12: Starting an interview creates a unique session ID and navigates to the interview room.

### Real-time dialogue
- FR-13: Interview room establishes a WebSocket connection bound to the authenticated user and session.
- FR-14: Server/AI sends the first interview question automatically after session start.
- FR-15: User can send text answers; each message is persisted on or before ACK.
- FR-16: AI generates contextual follow-up questions based on prior turns in the same session.
- FR-17: Chat UI displays messages chronologically with role labels (AI vs User) and timestamps.
- FR-18: User can manually end the interview at any time.

### Session & history
- FR-19: System saves session config (role fixed as FE, direction, difficulty, status, timestamps).
- FR-20: System saves every message (role, content, sequence, created_at).
- FR-21: In-progress sessions appear in the user's list and can be resumed.
- FR-22: Completed sessions are read-only in the interview room view.
- FR-23: Ending an interview sets status to `completed` without triggering report generation.

### WebSocket
- FR-24: Server implements heartbeat (ping/pong) at a fixed interval (e.g., 30s); client treats missed heartbeats as disconnect.
- FR-25: While session is active, client auto-reconnects using **exponential backoff + random jitter**, with a **maximum of 5 attempts** per disconnect event; backoff cap e.g., 30s before jitter.
- FR-25a: After 5 failed reconnect attempts, client stops auto-retry, shows a disconnected state, and offers a manual "Retry connection" action.
- FR-26: Messages carry monotonic sequence numbers; client renders in order; duplicates ignored.
- FR-27: On reconnect, client fetches missed messages since last acknowledged sequence.

### History
- FR-28: User sees a paginated list of past sessions (date, direction, difficulty, status).
- FR-29: User can open any session to view the full Q&A transcript.

---

## 8. Non-Functional Expectations

- **Performance:** First AI question within 3s p95 after WebSocket ready; message send ACK ≤500ms p95.
- **Reliability:** No message loss on normal disconnect/reconnect; session state recoverable from DB after server restart.
- **Usability:** Interview room usable without training; clear connection status (connected / reconnecting / disconnected / reconnect failed); disable send while reconnecting; show reconnect attempt count (e.g., "Reconnecting 2/5").
- **Responsiveness:** Layout works on ≥1280px desktop and degrades on tablet (~768px); chat input sticky at bottom.
- **Security/privacy:** HTTPS/WSS only; auth required for all session APIs; users access only their own sessions; captcha on login; rate-limit register, login, and message send; passwords hashed server-side; LLM API keys server-side only.
- **Maintainability:** Direction and difficulty lists configurable (env or DB seed); prompt templates versioned per direction + difficulty; WebSocket and REST share the same session/message models.

---

## 9. Risks and Open Questions

### Product risks
- AI questions may be too generic for the selected direction → mitigate with structured system prompts per direction + difficulty.
- Users may not know when to end → visible "End Interview" button + soft nudge after N rounds.
- No report in v1 may feel incomplete → set expectation in UI copy; transcript review is the v1 value.

### Technical risks
- LLM latency degrades real-time feel → stream tokens to UI; show typing indicator.
- WebSocket scaling behind load balancers → sticky sessions or shared pub/sub.
- Long transcripts exceed LLM context → summarize early turns for follow-ups; cap session length in v1.

### UX risks
- Reconnect may show duplicate messages → strict sequence dedup + "Reconnected" toast.
- Max 5 reconnect attempts may leave user stuck mid-interview → show clear failure state + manual retry; session remains resumable via page refresh or re-entry.
- Slider captcha friction → login only, not registration.
- Empty history and registration validation errors need clear copy.

### Dependency risks
- LLM provider availability, pricing, and content policy
- Captcha provider SDK integration
- WebSocket proxy timeout on deployment target

### Open questions / unclear assumptions
| Item | Assumption for MVP | Needs confirmation? |
|------|-------------------|---------------------|
| Auto-login after register | Redirect to login page | Optional |
| Interview length | ~8–12 Q&A rounds or 30 min cap | Yes |
| Interview language | Chinese questions, bilingual OK | Yes |
| Streaming responses | Stream AI text to UI | Recommended |
| Direction list | Keep Vue/React/JS/etc. sub-topics | Yes — or difficulty-only? |

---

## 10. Acceptance Criteria

- [ ] User can register with email, phone number, or username + password; duplicate email, phone, or username is rejected.
- [ ] User can log in using any registered identifier (email, phone, or username) + password.
- [ ] User can log in after registration; login requires valid slider captcha.
- [ ] After login, user stays authenticated across page refresh until logout or expiry.
- [ ] User can log out and cannot access protected routes without re-login.
- [ ] Interview setup shows **no back-end role option**; role is front-end only.
- [ ] User can select direction/topic and one of **Junior / Intermediate / Advanced** difficulty, then enter the interview room with an active WebSocket.
- [ ] Within 3 seconds of connection (p95 in staging), AI sends the first question automatically.
- [ ] User messages appear in UI and persist after page refresh.
- [ ] AI follow-up questions reference prior user answers (manual spot-check on 3 sample sessions per difficulty).
- [ ] Simulated disconnect ≤30s restores full transcript with no gaps and no duplicate messages in UI.
- [ ] User can leave mid-interview, log back in, reopen the session, and continue chatting.
- [ ] User can end interview; session status becomes `completed`.
- [ ] **No evaluation report is generated or shown after completion** — only completion confirmation + transcript access.
- [ ] History list shows session date, direction, difficulty, and status (no rating column in v1).
- [ ] Opening a historical session shows the full Q&A transcript matching the live session.
- [ ] WebSocket heartbeat and auto-reconnect (exponential backoff + jitter, max 5 attempts) are verifiable via network tools.
- [ ] After 5 failed reconnect attempts, UI shows disconnected/failed state and manual retry; no silent infinite retry loop.
- [ ] Messages display in strict chronological order matching server sequence numbers.

---

*Document version: MVP v1.2 · Front-end only · No evaluation report · Registration via email/phone/username · WebSocket reconnect: backoff + jitter, max 5 attempts · Intended for design, sprint breakdown, and AI-assisted implementation.*

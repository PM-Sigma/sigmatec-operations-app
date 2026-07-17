# EMS Companion — Master Blueprint (design spec)

STATUS: 🟡 OPEN — blueprint DRAFT for review. Not built. This is the north-star doc that
governs a multi-phase program; each phase gets its own spec + plan + build cycle after this is
approved. Phase 1 (actionable notifications) spec is a **separate file** and depends on the
EMS-notification de-dup investigation (see §7).
Date: 2026-07-17 · Owner: עידן · Author session: dashboard integrator.
Grounded in a 4-front Fable review (notifications, mobile UX, AI, sibling-project survey) — 2026-07-17.

### ⏸️ PAUSED 2026-07-17 — resume here
Planning paused by עידן at the "review the specs" gate. Nothing built. To resume:
1. Read this blueprint + the two companion specs:
   [Phase 1 notifications](2026-07-17-actionable-notifications-design.md),
   and (to-be-written) Phase 3 WhatsApp observer.
2. **Decisions locked this session:**
   - Phase 1 = actionable-notifications engine (event registry, `source:app|ems` de-dup guard).
   - EMS access = hybrid tiered (read via PG-read-only · write-safe via existing proxy+queue · deep-link · ping via Windows-server ICMP runner).
   - EMS de-dup exclusion list confirmed from the graph (see §7): EMS owns task assigned/comment/status (bell + env-dependent WhatsApp) — app excludes these; EMS sends nothing for task due/overdue → app-safe.
   - **Phase 3 reshaped → local-only WhatsApp OBSERVER** (see §5/§8): observe-only (no sending) as a first experiment, running on עידן's OWN number. Privacy hard rule — WhatsApp data must stay LOCAL: gateway + parsing + storage all on the Windows server, **NOT** Gemini/Groq/Supabase. Local LLM via **Ollama**; gateway = **WAHA (NOWEB/Baileys)** recommended, or Baileys script (no-Docker). App receives only a sanitized/generic signal. For design, עידן brings a **sanitized** message sample (real format, fake details) — real data never leaves his machine, so it also must not be pasted into a cloud chat.
3. **Open items:** (a) reply from "EMS Graph update" session (local_de008d54) — resolves the §2/§7 WhatsApp-task fork + newer-commit changes; (b) **Play Store $25 one-time** — yes or $0 (APK/PWA); (c) עידן's sanitized WhatsApp sample; (d) Ollama Hebrew-extraction model pick.
4. **Next step (per עידן):** on approval → run `writing-plans` for the Phase 1 implementation plan → **open a NEW dev chat in the app folder**, work on a `feat/<phase>` branch (ideally its own worktree), per `docs/testing-methodology.md` + the memory contract, ff-only to main via the single integrator.

An interactive plan overview was rendered as an artifact (see chat) — regenerate from this spec if needed.

---

## 1. Vision (north star)

Turn the Sigmatec Operations App from a status **dashboard** into the **fast, mobile-first,
notification-driven front-door to EMS** — the place the team runs daily field + office work in
parallel, and the place quick EMS actions happen without opening the heavy EMS mobile UI.

Three through-lines, applied to every phase:
- **Notification-driven.** The app tells each person *what to do now* and lets them act from the
  notification itself (the order-approval one-tap pattern, generalized) — **without duplicating
  what EMS already notifies** (§7).
- **Mobile-first & clear.** Every screen answers "what should *I* do", fast, in ≤1 screen, per role.
- **AI-augmented.** The `parse-order` learn-from-usage pattern extended to field reports and data entry.

The app does **not** replace EMS. EMS remains the system of record for meters/clients/sites/billing.
The app is the *operational layer* on top: it captures field work, routes it, and pushes the
minimum necessary writes into EMS (or deep-links to the right EMS screen).

## 2. Current state (from the review)

- **Notifications:** solid infra (`push-send` edge fn, `sw.js`, `push_subscriptions`, `push_log`,
  VAPID), but **hardcoded to orders/attendance** — only 3 event types push; ~25 real events surface
  only in-app or nowhere. iOS is skipped entirely; viewer role never subscribes.
- **Mobile UX:** the home page is the 50-card kibbutz-onboarding board for *everyone*; there is no
  personal "what should I do" entry; nav + header are overloaded; EMS is a hidden page.
- **AI:** only in `parse-order` (Gemini→Groq→offline + a real learning loop via `parse_corrections`).
- **EMS integration (already exists):** the app already writes to EMS via an Apps-Script proxy →
  `api.sigmatec-ems.com/v1` using each user's own EMS token, with an offline write-queue
  (`emsWriteOrQueue`: comment / status / createTask). A **`claude_readonly` Postgres** connection
  exposes `meters` (incl. `ip_address`, `device_number`, `phone_number`), `sites`, `clients`, and
  reading-freshness. The archived `kibbutz-dashboard` holds the approved staged-integration spec.

## 3. EMS integration model (recommended)

**Hybrid, tiered by risk** — because in-app EMS writes already exist, the migration extends them safely.

| Tier | Mechanism | Use for |
|------|-----------|---------|
| **Read** | Supabase Edge Function → `claude_readonly` PG (RDS; note IP-allowlist for any hosted runner) | meter/site/client lookups, meter-health (reading freshness, broken/frozen/garbage patterns already written), IP/serial display |
| **Write (safe)** | existing Apps-Script proxy → EMS `/v1` with the user's token + offline queue | task comment / status / create; extend to meter-field PATCH + IP change **after per-endpoint verification** |
| **Write (risky)** | deep-link to the pre-filled EMS screen | create-heavy / validation-heavy / unverified endpoints |
| **Ping test** | ICMP runner **inside the allowed network** (the always-on Windows server that hosts the email-manager) → writes results to Supabase; app reads/triggers | connectivity checks post-install (or confirm whether EMS `/v1` exposes a ping endpoint) |

Reusable assets: `New client in ems validation` kit (per-kibbutz mismatch reports → onboarding
"migration health" widget), PG `recalculation_log` queue (a narrowly-scoped "queue history fix"
write), `EMS Graph` (dev-time design/query tool, not a runtime API), `Git Ticket System` recipe
(file EMS tickets from the app), `sigmatec-email-manager` EMS_ALERT stream (bridge to Supabase).

## 4. Cross-cutting principles

1. **No duplicate notifications with EMS** (§7) — hard rule, gates every notification we add.
2. **Mobile-first clarity** — role-personalized home ("היום שלי"), 4-item nav, central "+" action
   sheet, staged forms (required-first), next-action instead of raw status vocabulary.
3. **One-tap safety** — only non-mutating or status-flip actions run window-less from the SW;
   anything touching stock/EMS/money stays a deep-link to an in-app confirm. One-tap actions that
   mutate need an auth token in the notification `data` (today `approveOrder` trusts an unauthenticated
   actor field — must be fixed before expanding one-tap).
4. **AI = confirm-before-commit** — every AI extraction lands on a confirm screen; every accepted
   result feeds a learning loop (the `parse_corrections` pattern).
5. **Testing per `docs/testing-methodology.md`** — pure builders + golden fixtures + role-gating
   matrix; one full-suite runner per feature; loop until green.
6. **Parallel-safe git** — per `CLAUDE.md`: one session = one worktree, ff-only to main, rebuild
   generated files on integrate, single integrator.

## 5. Phases

Each phase is a separate spec → plan → build cycle. Phases 1–2 are order-independent; 3→4→5 build
the migration; 6 is packaging, anytime.

### Phase 1 — Actionable notifications engine ← FIRST
Generalize the push system into an **event registry** (event → recipients rule → payload template →
actions), a generic `push_log`/schema, a `push_prefs` mute matrix (owner × event), iOS-installed +
viewer subscription fixes, and a general cron for time-based alerts. Then add the high-value events
that **EMS does not already cover** (§7). Separate spec: `2026-07-17-actionable-notifications-design.md`.

### Phase 2 — Mobile-first personal home
Role "היום שלי" (my tasks + my approvals + quick-actions) as the landing; move the kibbutz board to
its own "🏘 לקוחות" item (search-first, collapsed); 4-item bottom nav + central "+" action sheet;
staged visit/order forms; agenda-first calendar; per-role noise trim; render-from-cache for speed.

### Phase 3 — AI field-reports → **local-only WhatsApp Observer** (reshaped 2026-07-17)
**Observe-only, local-only.** A WhatsApp gateway (WAHA/NOWEB or Baileys) on the Windows server watches
the installations + comms-conversion groups (first experiment: עידן's own number, no sending), a
**local LLM (Ollama)** extracts `{site, meter, action, ip, notes}`, results land in a **local store
(SQLite)**, and the cloud app receives only a **sanitized/generic** signal (details visible after
in-app auth / local review UI). **Privacy hard rule:** WhatsApp content never touches Gemini/Groq/
Supabase — all parsing/storage is local. Cloud AI (`parse-order`) stays for non-personal order text
only. Later, optionally: confirm-screen writes to EMS, voice→visit, photo→meter serial. See the
PAUSED resume block for the locked decisions + open items (Ollama model pick, sanitized sample).

### Phase 4 — EMS quick-actions
Read meter/site/client + meter-health via PG read-only; in-app EMS writes for verified endpoints
(task comment/status/create, meter PATCH, IP change) via the proxy+queue; ping-test button; deep-links
for the rest. Add `ems_task_id` link column first (unlocks order↔EMS bidirectional status).

### Phase 5 — Field-work management (WhatsApp replacement)
Installations + comms-conversions as structured in-app tasks with status, assignee, and a flow that
ends in the EMS updates (meter/customer data, create, IP change, ping). Fed by Phase-3 AI intake.

### Phase 6 — Play Store packaging
Wrap the PWA as an Android app via **TWA (Trusted Web Activity)** — no code rewrite. Cost: one-time
**$25** Google Play developer fee. Free alternatives: signed APK direct-install, or keep the PWA
"Add to Home Screen". Decide at packaging time.

## 6. Data / schema additions (across phases)

- **Generic notification schema:** `push_log` → `{event, entity_type, entity_id, recipient, …}`;
  event registry table or in-code map; `push_prefs (owner, event, muted)`.
- **`ems_task_id`** on orders (links order ↔ EMS task; unlocks status sync + delivery auto-stamp).
- **Meter-health** (Phase 4): read-only views/queries over PG (reading freshness, broken/frozen/garbage).
- **Field-report** (Phase 3): `parse_field_corrections` (learning loop clone), field-report records.

## 7. Notification governance — no duplication with EMS (BLOCKING for Phase 1)

**Rule:** the app must not send a push for an event EMS already notifies natively. Per עידן, EMS
already notifies on **(a) a new task assigned to a user** and **(b) a new comment/reply on a task**.

**Action (in progress):** confirm EMS's full native-notification set + channels via the **EMS Graph**
(`C:\Users\idann\Projects\EMS Graph`) and, for anything the snapshot misses, the **"EMS Graph update"
session** (`local_de008d54`, live EMS repo). Produce an **exclusion list** before finalizing the
Phase 1 event table.

**Design consequence:** the Phase 1 event registry carries a `source: 'app' | 'ems'` flag; only
`app`-owned events push from our engine. Events EMS owns are, at most, *mirrored read-only* in the
app UI (no push), or we deep-link to EMS. Candidate app-owned events (pending confirmation they're
NOT EMS-covered): staff message received, order arrived/stock-in, stock transferred to you, low-stock
red line, approval escalation, return awaiting decision. EMS-owned (exclude): task assigned, new
task comment — and whatever else the investigation surfaces.

## 8. AI strategy

Reuse the proven `parse-order` shape everywhere: model chain (Gemini→Groq→offline), EMS-token gate,
live catalog/glossary grounding, JSON schema, and the **learn-from-accepted-output** loop. New
surfaces: field-report parsing (Phase 3), voice→visit, photo→meter serial/reading (Gemini multimodal;
gas-meter-reading precedent), and a rule-based-first anomaly/digest layer (overdue tasks, stuck
orders, red-line stock, missing attendance) with AI only phrasing the digest.

## 9. Open questions / to confirm

1. EMS native-notification full set + channels (§7) — **investigation running**.
2. Which EMS `/v1` write endpoints are verified for in-app use (meter PATCH, IP change, ping)?
3. Ping: does EMS `/v1` expose a ping endpoint, or do we need the Windows-server ICMP runner?
4. Play Store: is the one-time $25 acceptable, or direct-APK/PWA only?
5. Per-role notification defaults (who gets what by default in `push_prefs`).

## 10. Success criteria

- A field worker opens the app and sees *their* next actions in ≤1 screen, ≤2s.
- Every operationally-important, app-owned event reaches the right person as an actionable push,
  with **zero duplicates** of EMS-native notifications.
- Common EMS updates (task comment/status, meter field/IP, ping) are doable from the app or one tap
  to the right EMS screen — no scrolling the heavy EMS mobile UI.
- WhatsApp installation messages become structured records/EMS updates via AI + confirm.

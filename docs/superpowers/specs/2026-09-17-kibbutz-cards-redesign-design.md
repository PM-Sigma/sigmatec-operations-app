# Kibbutz cards redesign + field-worker flow — design spec

STATUS: 🟢 APPROVED by עידן 17.9.26 (mockup https://claude.ai/artifact/URG8xSZMq1SiWk2u3pWRnP reviewed, comments folded in) — NOT built yet. Next: implementation plan → chunks.
Date: 2026-09-17. Branch: `feat/kibbutz-cards-redesign` (worktree `SigmatecOps-wt-cards`, off `origin/dev` 425437f).
Requested by עידן, 17.9.26 (chat). Execution: Opus (parser, DB, push cron, arrival flow) + Sonnet (markup/CSS sweeps, tests).

## 0. What עידן asked for (verbatim intent)

1. Kibbutz card page: **no more "אחראים"** per kibbutz. **No more free-text "סטטוס ומשימות"**.
2. Instead: the per-kibbutz sentences from the **company meeting summaries** become **accumulating bullets** on the
   kibbutz, so the last meeting's state is visible on the card, and history stays.
3. **Open an EMS task from any bullet** — one tap, description prefilled from the bullet, assignee from "אחריות X".
4. **EMS tasks shown in full** on the kibbutz (they are the only real tasks) — not title-only.
5. Rename **"עלו לאוויר במערכת החדשה" → "לקוחות פעילים"**. Rename **"ממתינים" → "בתהליך שיווקי"**.
6. Remove **"בעדיפות עליונה"** section, the **overall progress bar**, and **"תצוגה מצומצמת"**.
7. **Visual refresh**: fast, thumb-friendly on phone; on desktop fills the whole width at any size.
8. **Field-worker arrival flow**: worker opens the app → picks the kibbutz he arrived at → gets pushed the open EMS
   tasks + last meeting bullets + last visit; **2 h later, if no visit summary was filed → push reminder** with
   motivating copy.
9. (added mid-turn) **Complaints & ideas box** — anyone can type or **record voice → transcribed**.
10. (added mid-turn) **Create kibbutzim from inside the app** — no code change per new client.
11. (added 17.9, during planning) **Energy types editable per kibbutz — עידן only.**
12. (added 17.9) **Inside each section, group by geographic region** — visually subtle — and **alphabetical (א״ב)
    inside each region.**
13. (added 17.9) **The viewer / reports user gets the new design too**, with every existing viewer function intact.

## 1. Current state (what exists, what we reuse)

| Area | Today | File(s) |
|------|-------|---------|
| Cards | Static HTML, 4 sections (`priority`/`new_client`/`done`/`pending`), `data-name`, `data-types` | `index.html` 250–345, `01-data.js` |
| Card modal | Tabs ✏️ עדכון / 📍 סיכום ביקור; `editStatus` textarea; `editOwner1/2`; category select; step 1–15 | `index.html` 750–830, `01-data.js` |
| Kibbutz rows | Supabase `tasks` table (`status`, `expected_task`, `owners`, `task`, `editor`…) | `01-data.js` 469–540 |
| EMS tasks | Shared cache; card widget shows **title + status badge** only; `createTask(item)` exists | `13-ems.js` |
| Visits | `visits` table, quick modal `visitQuickModal`, `getLastVisit()` | `09-visits.js`, `index.html` 88 |
| Push | `push_subscriptions`, `push_log`, Edge Fn `push-send` (modes incl. `attendanceCron`), pg_cron hourly | `22-push.js`, `supabase/functions/push-send` |
| Meeting summaries | `Sigmatec Management\Company Meeting\<D.M.YY>\summary_<D.M.YY>.md` — one `**N. <kibbutz>**` heading per kibbutz, a paragraph, ending `**אחריות X, Y.**`. Also `Dev Meeting`, `Clients Meetings`. | external repo |
| Design tokens | `:root` vars (navy primary, accent blue), Heebo, `--radius:10px` | `css/app.css` |

## 2. Part A — Card page: removals & renames

**Remove** (markup + JS + CSS + tests):
- `#compactToggle` + `toggleCompactMode()` + `.compact-mode` CSS.
- Progress bar block (`.progress-label`, `.progress-bar`, `#progressLegend`) and its updater.
- Section **🔴 בעדיפות עליונה** + filter chip `priority` + modal option `priority` + `.priority-flag` CSS.
- Modal: `editStatus`, `editTask`, `editOwner1/2`, "👥 אחראים" label, the "📋 נתוני תפעול" banner. Card owner chips
  (`owners-row`) and `.excel-status` render. Owners stay in the DB column (no migration), just unused.
  `12-reports.js` "משימות באחריותי" report stops reading `status` lines and instead lists **EMS tasks assigned to the
  person** (data already in cache) + company tasks.

**Rename**: `done` → label **"✅ לקוחות פעילים"** (chip + section + modal option + `kibbutz-stats.html` +
`17-staff.js` pipe text). Internal key `done` stays (no data churn).

**"בתהליך שיווקי" is a TAG, not a section** (עידן, 17.9: "שיווקי יכול להיות גם פעילים וגם חדשים"). New card flag
`data-marketing="true"` → 🤝 **בתהליך שיווקי** badge on the card + a filter chip. Set from the modal (checkbox).

**Re-home cards** (עידן, 17.9): the former **ממתינים** (`pending`) kibbutzim are "יותר פעילים" → all move to
**לקוחות פעילים** with the 🤝 tag on. Former `track priority` cards (גבת, יגור, חוקוק, דגניה א, אלומות) → **חדשים
בהקמה**; former `pending priority` cards (עין חרוד מאוחד, בית זרע, כנרת, כפר עזה, יסעור, מגידו, ניר עציון, כפר מנחם,
משואות יצחק) → **לקוחות פעילים** + 🤝. **Status/flow flags are removed** (עידן, mockup comment 17.9: "לא צריך את זה יותר את הזרימה והכל"): `ready-flow`, `flow-active`, `manual-flow`, `new-client-flag` pills, the `urgentAlert` "באוויר ללא זרימת נתונים" banner, the modal's **שלב 1–15** + **הערת הקמה** fields and the "התקדמות הקמת מערכת" group. A card shows only: name · energy badge · 🤝 tag (if set) · meeting bullets · EMS tasks. The `has-bug` note goes too — bugs live as EMS tasks. Category select in
the modal shrinks to two values: חדשים בהקמה / לקוחות פעילים.

Final page order (עידן): **🆕 לקוחות חדשים — בהקמה → ✅ לקוחות פעילים**. Filter chips: הכל · חדשים · פעילים · 🤝 שיווקי.

## 3. Part B — Meeting bullets per kibbutz

### 3.1 Data
New Supabase table `kibbutz_meeting_notes`:
```
id uuid pk · kibbutz text (card data-name) · meeting_date date · meeting_kind text ('company'|'dev'|'client')
seq int (order inside the section) · text text · owners text[] (from "אחריות …")
ems_task_id text null (set when a task was opened from this bullet) · done_at timestamptz null
created_by text · created_at timestamptz default now()
unique (kibbutz, meeting_date, meeting_kind, seq)
```
RLS: same staged policy as `visits` (authenticated write, anon read within the EMS-gated app).

### 3.2 Import — in-app paste (recommended, D3)
Admin-only (עידן, עמיחי) modal **"📥 ייבוא סיכום ישיבה"**: paste the summary markdown, pick date + kind (auto-detected
from the first line `**סיכום ישיבת חברה — 17.9.26**`), click **תצוגה מקדימה**.

Parser (`js/src/24-meeting-notes.js`, pure function → unit-tested with the 3 real summaries as golden fixtures):
- Section start: `**N. <names>**` (strip optional ` — …` suffix as in 6.9). `·`-separated names = one section
  copied to each kibbutz (17.9 §27).
- Paragraph → bullets: split on sentence end (`. ` / `; ` / `? `) — **one bullet per sentence** (D4). Trailing
  `**אחריות …**` is removed from text and parsed into `owners[]` (split on `,`/`ו`), attached to every bullet of
  that paragraph; a parenthesised scope `(מאזן)` is kept in the bullet text for context.
- `ללא פערים.` / `אין חדש.` / `עדיין לא.` → a single muted bullet (kept, so the timeline shows the kibbutz was
  reviewed).
- Kibbutz name → card `data-name` via `KIBBUTZ_ALIASES` (e.g. `דגניה א`→`דגניה`, `אור הנר`→ both `אור הנר חשמל`/`אור
  הנר גז`, `גשר השלום` → new card? → preview flags **unmatched names in red**; עידן maps or skips them).
- Idempotent: re-importing the same date replaces that date's rows (delete+insert in one call).

Preview shows every kibbutz with its bullets and owner chips; **שמור** writes. Later the `Sigmatec Management`
pipeline can POST the same JSON (not in scope).

### 3.3 Display
- **Card**: under the name, the **latest meeting's bullets** (all of them, full text), with a small date chip
  `🗓 17.9`. Older meetings collapsed under **"היסטוריה (2)"** → tap expands inline, newest first.
- Each bullet row: `• text` · owner chips (existing `.owner-chip` styles) · trailing action:
  - unlinked → **➕** "פתח משימה ב-EMS" → opens the existing `emsTaskModal` prefilled: site = kibbutz,
    title = first sentence clause (≤ 70 chars), description = full bullet + `\n\nמקור: ישיבת חברה 17.9.26`,
    assignee = first owner (existing name→EMS user lookup in `createTask`), priority default medium.
    On success → store `ems_task_id`; row shows **🔗** and opens the task.
  - **✓** long-press / secondary menu → mark bullet done (`done_at`), row dims. Undo from the same menu.
- **Modal**: tab ✏️ becomes **"🗓 ישיבות"** = same timeline, full history expanded, plus the import button for admins.
  Tab 📍 סיכום ביקור unchanged.
- Empty state on card: "אין סיכום ישיבה עדיין" (muted, one line).

## 4. Part C — EMS tasks in full on the card

- Card widget renders **title, full description, assignee, due date, priority dot, status badge** per open task.
  No line-clamp (D5). Verify the shared cache carries `description`; if not, add it to the cache mapper in
  `13-ems.js` (one field) and bump the cache version key.
- Cards use CSS grid `grid-auto-flow: dense` + `align-items:start` so tall cards do not stretch neighbours.
- Tap task → existing `openKibbutzEmsTask`.

## 5. Part D — Field-worker arrival flow + 2-hour reminder

### 5.1 Arrival sheet
- Trigger: אביאם/ניתאי open the app (or tap the new bottom-nav **📍 ביקור**) and there is no check-in today.
  Full-screen bottom sheet **"לאיזה קיבוץ הגעת?"**: search box + big buttons, ordered: kibbutzim with open EMS
  tasks assigned to me → recently visited → the rest. Buttons ≥ 56 px tall. "לא בקיבוץ היום" dismisses for the day.
- Pick → insert `field_checkins` (`id, person, kibbutz, checked_in_at, reminded_at null, dismissed bool`) and open
  the **בריפינג** screen for that kibbutz: open EMS tasks in full (mine first), latest meeting bullets, last visit
  summary, then two primary buttons **📍 סיכום ביקור** and **🚚 תעודת משלוח** (existing flows, kibbutz prefilled).
- A second check-in the same day (another kibbutz) is allowed from the 📍 tab.
- **Fast path to סיכום ביקור (עידן, 17.9):** the bottom-nav **📍 ביקור** button ALWAYS opens the visit form directly
  (kibbutz picker inline, prefilled with today's check-in if any) — the arrival sheet/briefing is never a mandatory
  detour. The arrival sheet itself has a **"ישר לסיכום ביקור →"** link under the kibbutz list, and the briefing's
  primary button is the same form. Target: visit form visible within 2 taps from cold start.
- **Delivery-cert rules are preserved verbatim (עידן, 17.9 — "יש התניות שעשינו בנושא"):**
  1. Equipment supplied in a visit **MUST have an issued, active delivery cert linked to the visit** before the
     summary can be saved (`09-visits.js` saveVisit gate, עידן 2026-07-15) — the briefing's 🚚 button and the form's
     🚚 button both go through `certFromVisitForm()` with the pre-minted draft id so the cert links to the visit.
  2. The status chip in the visit form ("✅ תעודה N נופקה" / "❌ טרם הופקה תעודה") stays, restyled with tokens.
  3. 🚚 on a saved visit (last-visit box, history rows, briefing "ביקור קודם") appears only when the visit has items.
  4. Cert issuing needs connection; offline → the existing guidance alert. Reprint/reissue/cancel flows untouched.
  Contract test: saving a visit with checked products and no active cert is rejected; with a linked cert it saves.

### 5.2 Reminder
- Edge Fn `push-send` gets mode **`visitCron`**: for each `field_checkins` row with `checked_in_at < now()-2h`,
  `reminded_at is null`, `dismissed=false`, and **no `visits` row** for (person, kibbutz, that date) → send push,
  set `reminded_at`. Idempotent by row.
- pg_cron: existing hourly job is too coarse → add `push-visit-15min` (`*/15 * * * *`) hitting `visitCron`.
  (Hour-gating not needed; a check-in implies a work day.)
- Push copy (D6, proposal):
  - title: **`📍 <קיבוץ> — עוד לא סיכמת את הביקור`**
  - body: **`2 דקות עכשיו חוסכות טלפונים בסוף החודש. מה נעשה, מה נשאר? — וסיימת את <קיבוץ> נקי 💪`**
    (עידן 17.9: positive reinforcement only — no "בלעדיו הביקור לא נספר" threat line.)
  - actions: **✍️ כתוב סיכום** → `#visit?kibbutz=<name>&person=<me>` (opens the visit form prefilled) ·
    **🙈 לא היום** → sets `dismissed`.
- Client (`22-push.js` + `sw.js`): handle the new deep link; `09-visits.js` reads `?kibbutz=` to prefill.

## 6. Part E — Visual refresh (direction, not pixel spec)

Direction **"Clean field SaaS"** (D1): keep vanilla JS, no framework. Motion via CSS transitions + **View Transitions
API** for section/modal changes; springs via **`motion`** (motion.dev, ~5 kB, `animate()` only) for the arrival
sheet and bullet-linked feedback; `canvas-confetti` (tiny) once, when a visit summary is saved.

- **Layout**: `body` padding → 12/16 px; `.kibbutz-grid: repeat(auto-fill, minmax(300px,1fr))` so desktop fills any
  width; container has no max-width. Sections are collapsible with a sticky header while scrolling.
- **Mobile**: **bottom tab bar** (thumb zone) — 🏘 קיבוצים · 📍 ביקור · 🚚 תעודה · 📦 מלאי · ⋯ עוד. Header shrinks to
  one row; search becomes a sticky pill. Touch targets ≥ 44 px, primary ≥ 56 px. Pull-down search focus.
- **Cards**: name + energy badge on one row; flags as small pills; meeting bullets; EMS tasks; light shadow, 14 px
  radius, hover lift on desktop, press-scale on mobile. Section color = left border only (calm).
- **App name (mockup review 17.9):** wordmark **סיגמה** with subtitle "תפעול שטח" (alternatives offered: Σ שטח, סיגמה
  בשטח, מגדלור, SigmaOps — עידן to confirm; default סיגמה). Push notifications show the same name.
- **Header (mockup review):** Σ mark · wordmark · spacer · 🌙/☀️ · **user chip "● עידן"** (green dot = EMS connected;
  tap → switch user / EMS status / install / notifications). No bare 👤 icon.
- **Brand orientation (עידן, 17.9)**: the design keys off the company logo — the Σ with a **cyan → green gradient**
  (`icons/sigma_crop.png`; brand values already used in the הדרכות template: turquoise `#06C2CB`, green `#1ABE63`,
  text `#1B1F23`, secondary `#5A6672`). Tokens: `--brand-1:#06C2CB`, `--brand-2:#1ABE63`,
  `--brand-grad: linear-gradient(135deg,var(--brand-1),var(--brand-2))`. The gradient is used **sparingly**: header
  wordmark + Σ mark, active bottom-tab indicator, primary buttons, progress/loader, the "🔗 linked" state on a bullet.
  `--accent` becomes brand-1; `--primary` (navy) stays as the text/ink color so contrast holds. The Σ replaces the ⚡
  emoji in the header, and is the splash/loader mark.
- **Dark mode (עידן, 17.9)**: real toggle, not only system. `:root[data-theme="dark"]` block overrides the surface
  tokens (`--bg:#0f1417`, `--card:#161c21`, `--surface-2:#1d252b`, `--text:#e6edf3`, `--text-light:#93a1ad`,
  `--border:#263038`); brand gradient unchanged (it reads well on dark). Toggle 🌙/☀️ in the header and in ⋯ עוד;
  choice persisted in `localStorage('theme')`, default = `prefers-color-scheme`. `theme-color` meta updated live so the
  PWA chrome matches. Every new component is written against tokens only — no hard-coded colors — and the CSS sweep in
  chunk 4 replaces the existing hex literals in `app.css` with tokens (a contract test greps for stray hex in new CSS).
- **Tokens**: add `--radius-lg:14px`, `--surface-2`, the brand pair, and the dark block above.
- **Density**: one card ≈ 3 scrolls of thumb max; long EMS descriptions allowed (per §4) — tall cards, dense grid.
- **Viewer / reports user (עידן 17.9):** the `body.user-viewer` experience is redesigned with the same tokens, bottom
  nav (🏘 · 📊 דוחות · ⋯) and dark mode. Every current viewer function stays: `#viewerReportsHub` (visits PDF/Excel,
  attendance PDF/Excel, delivery-cert PDF/Excel, monthly cert summary, stock/kibbutz Excel), read-only cards, read-only
  meeting bullets (no ➕), read-only EMS tasks, cert view/reprint, and all write blocks (`test-viewer-gate.mjs`
  regression). Feedback box IS allowed for the viewer.

## 7. Part F — Complaints & ideas box (📣 תיבת רעיונות ותלונות)

- Entry: **⋯ עוד → 📣 רעיון / תלונה** (all roles). Sheet with: kind toggle (💡 רעיון / 😠 תלונה), textarea, **🎙 הקלט**
  button, anonymous checkbox, שלח.
- Voice, ladder order: (1) **Web Speech API** (`webkitSpeechRecognition`, `lang='he-IL'`, continuous) — live
  transcript into the textarea, editable, no server. Android Chrome + desktop Chrome/Edge: yes. (2) Fallback where
  unsupported (iOS Safari PWA): `MediaRecorder` → upload `.webm/.m4a` to Supabase Storage bucket `feedback-audio` →
  Edge Fn **`transcribe`** → **Groq Whisper (`whisper-large-v3`)** (Groq key already a project secret from
  `parse-order`) → text returned and saved. Recording capped at 3 min.
- Table `feedback` (`id, author text null, kind, text, audio_path null, status 'new'|'seen'|'done', created_at`).
  Admin view for עידן/עמיחי in the ⋯ menu: list, mark seen/done. Push to עידן on new feedback (existing `sendTo`).

## 7b. Part G — Kibbutzim as data (create from the app)

Today every card is hard-coded in `index.html` (adding גבעת חיים איחוד on 17.9 needed a code commit). This part
makes the card list **data-driven**, which also simplifies Part A (renames/re-homing become row updates).

- New table `kibbutzim`: `id uuid pk · name text unique (= card data-name) · display_name text · section text
  ('setup'|'active') · energy text[] ('electric'|'water'|'gas') · marketing bool default false · **region text**
  (e.g. עמק יזרעאל, עמק הירדן, גליל, שער הנגב, שפלה, שרון, עמק המעיינות…) · ems_site_ids text[] · archived_at
  timestamptz null · created_by, created_at`. (`sort` dropped — order is deterministic, see below.)
- **Order inside a section (עידן 17.9):** group by `region` (rows with empty region last under "ללא איזור"), regions
  ordered by a fixed list `REGION_ORDER` (north → south), then **alphabetical he-IL** inside each region. The region
  appears as a **subtle sub-header** — a small muted label with a hairline, never a card or a colored bar
  ("שלא יהיה בולט מדי"). The section count stays on the section header only. No region filter chips; the search box
  already matches region text.
- **Energy types are editable only by עידן** (`isIdan()`): in the ➕/✏️ sheet the energy chips are disabled for everyone
  else (עמיחי can still create a kibbutz and set section/region/marketing; energy defaults to ⚡ חשמל). Region is
  editable by עידן + עמיחי.
- **Seed migration**: `db/kibbutzim_seed.mjs` parses the current `index.html` cards (name, section per §2 re-homing,
  energy badge, flags) → insert rows; then the static card markup is deleted and `01-data.js` renders cards from the
  table (one `renderCards()` pass, then the existing EMS-widget / meeting-bullet passes attach as today).
- **➕ קיבוץ חדש** (עידן/עמיחי): header button (desktop) and ⋯ עוד (phone). Sheet: name · section toggle · energy chips
  · 🤝 marketing toggle · EMS site (auto-suggest by exact name against live `/sites`; may be saved unlinked → card
  shows the existing ⚠️ "לא מקושר ל-EMS" indicator). Save → row inserted → card appears for everyone on next load.
- Edit the same fields from the card modal (replaces the removed category/step/note fields). Archive instead of
  delete (`archived_at`) so history in `kibbutz_meeting_notes` / `visits` stays reachable.
- `KIBBUTZ_SITE_MAP` fallback stays for offline; `ems_site_ids` on the row is the source when online.
- Contract test: every row renders exactly one card; every meeting-note kibbutz resolves to a row or the import
  preview flags it (the "אין כרטיס תואם" state in §3.2 now offers "צור קיבוץ" inline).

## 8. Execution plan (agents)

Branch `feat/kibbutz-cards-redesign`; sub-branches per chunk merged into it; then → `dev` → `main` per CLAUDE.md
parallel-safe loop. Each chunk ends green on `node --test` suites + a smoke on `?login=0&sb=0`.

| # | Chunk | Agent | Depends on |
|---|-------|-------|-----------|
| 1 | Part G table + seed + data-driven cards, then Part A removals/renames on top + reports rewrite | Opus | — |
| 1b | ➕ קיבוץ חדש sheet + modal edit/archive | Sonnet | 1 |
| 2 | Part B parser + table SQL + import modal + card/modal timeline + ➕ task | Opus | 1 |
| 3 | Part C full EMS tasks on card (+ cache field) | Sonnet | 1 |
| 4 | Part E brand tokens + dark mode + layout/bottom-nav/motion sweep (CSS + markup) | Sonnet (frontend-design skill) | 1,2,3 |
| 5 | Part D check-ins table + arrival sheet + briefing + `visitCron` + cron + SW deep link | Opus | 2,3,4 |
| 6 | Part F feedback box + `transcribe` fn + Storage bucket | Opus | 4 |
| 7 | Release: CHANGELOG, backlog, INDEX 🚦, spec STATUS ✅, `node build.mjs major` → 2.00 | Sonnet | all |

Tests (per `docs/testing-methodology.md`): parser golden fixtures = the 3 real summaries (17.9, 6.9, 23.8) → expected
JSON; contract sweep that every `.kibbutz[data-name]` maps to exactly one section and one alias; role matrix for
arrival sheet (only אביאם/ניתאי) and import (only עידן/עמיחי); `visitCron` unit test with fake clock (reminded once,
skipped when a visit exists, skipped when dismissed).

## 9. Open decisions for עידן

| # | Question | Recommendation |
|---|----------|----------------|
| D1 | "תשתמש בחבילות האלו" — no packages were attached. Which ones? | Until told: `motion` + View Transitions + `canvas-confetti`, no framework. |
| D2 | ~~Where do the 14 priority kibbutzim land?~~ **Decided 17.9:** two sections (בהקמה → פעילים); שיווקי = tag; ממתינים → פעילים+🤝. | — |
| D3 | Import via in-app paste, or a Python step in the Management pipeline? | In-app paste (works from anywhere, one codebase). |
| D4 | Bullet granularity: one per sentence, or one per paragraph? | Per sentence (matches "משפטים … כבולטים"). |
| D5 | ~~EMS description~~ **Decided 17.9 (mockup approved):** full text always. | — |
| D6 | ~~Reminder copy~~ **Decided 17.9:** positive-only wording (§5.2). One nudge, no second. | — |
| D7 | Feedback: allow anonymous? Who sees the inbox? | Yes anonymous; inbox = עידן + עמיחי. |

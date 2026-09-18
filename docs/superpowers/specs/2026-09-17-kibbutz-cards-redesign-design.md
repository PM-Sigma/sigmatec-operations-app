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
14. (added 17.9) **Sections are 🆕 לקוחות חדשים and ✅ פעילים** — the word "בהקמה" is gone; שיווק stays a tag.
15. (added 17.9) **➕ has two modes:** a new kibbutz (= new client) **or a new sub-site (תת-אתר) of an existing
    kibbutz** that עידן wants to visit. Marking a sub-site runs a **verification chain against the EMS** that pulls the
    relevant parameters.

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
**לקוחות פעילים** with the 🤝 tag on. Former `track priority` cards (גבת, יגור, חוקוק, דגניה א, אלומות) → **לקוחות
חדשים**; former `pending priority` cards (עין חרוד מאוחד, בית זרע, כנרת, כפר עזה, יסעור, מגידו, ניר עציון, כפר מנחם,
משואות יצחק) → **לקוחות פעילים** + 🤝. **Status/flow flags are removed** (עידן, mockup comment 17.9: "לא צריך את זה יותר את הזרימה והכל"): `ready-flow`, `flow-active`, `manual-flow`, `new-client-flag` pills, the `urgentAlert` "באוויר ללא זרימת נתונים" banner, the modal's **שלב 1–15** + **הערת הקמה** fields and the "התקדמות הקמת מערכת" group. A card shows only: name · energy badge · 🤝 tag (if set) · meeting bullets · EMS tasks. The `has-bug` note goes too — bugs live as EMS tasks. Category select in
the modal shrinks to two values: חדשים בהקמה / לקוחות פעילים.

Final page order (עידן): **🆕 לקוחות חדשים → ✅ לקוחות פעילים** (section keys `new` / `active`). Filter chips: הכל · חדשים · פעילים · 🤝 שיווקי.

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
- **Card quick actions (עידן, mockup comment 17.9 — "סיכום ביקור כבר מלחיצה על קיבוץ"):** every card ends with a
  compact action row: **📍 סיכום ביקור** (opens the visit form with this kibbutz prefilled — `openVisitQuick(name)`,
  one tap, no modal in between), **🚚 תעודת משלוח** (`certFromVisitForm()` after the visit form opens, so the cert
  links to the visit — spec §5 cert rules), **🗓 ישיבות** (opens the modal timeline). Roles: 📍/🚚 shown to אביאם, ניתאי,
  עידן, עמיחי; viewer sees only 🗓. **🚚 appears only when there is something to deliver to this kibbutz** (עידן,
  mockup comment 18.9): an open customer order (`orders` type customer, not delivered) or products checked in a
  visit draft — with the item count as a badge; otherwise the button is not rendered. General rule for every
  screen: **no button without a current purpose** — actions render only when their precondition holds (pure
  `visibleActions(role, context)` per surface, tested). Tapping the card body still opens the modal as today.

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

### 5.1b Field-worker view: clean, but complete (עידן 18.9)
Two rules that pull in opposite directions, both binding:
- **Clean:** a technician's card and briefing show only what serves the field work. Hidden for the `field` role
  (אביאם, ניתאי): health score, onboarding progress, billing/financial signals, PM internal notes tagged
  `audience:'office'`, usage/analytics, import/admin buttons. Visible: open EMS tasks (mine first), open items from the
  previous visit ("נשאר פתוח"), meeting bullets tagged for the field (`audience:'field'|'all'` — the review screen sets
  it; default `all`), stock to deliver / open customer orders for this kibbutz, contacts, alerts on non-transmitting
  meters (they are field work).
- **Complete:** he must leave the kibbutz with nothing untouched. The briefing ends with a **"לפני שיוצאים" checklist**
  = every open item above as a checkbox row; the visit form's "מה נשאר לי פתוח" is pre-filled with the unchecked ones;
  the 2 h nudge and the gap list mention the count ("3 פריטים נשארו פתוחים בגבים"). Roles are decided by
  `sigma.getRole()`; the same card component renders both views from one `audienceFor(role)` filter (pure, tested).

### 5.1c Visit drafts — nothing typed is ever lost (עידן, mockup comment 18.9)
- **Autosave:** the visit form saves a **draft** on every field change (debounced 800 ms) and on every section
  change / tab switch / `pagehide`: `visit_drafts(id = the pre-minted visit id, person, kibbutz, date, payload jsonb,
  updated_at)` in Supabase (authenticated) **and** a `localStorage` mirror for offline. Reopening the app, the card,
  the briefing or 📍 for that kibbutz offers **"המשך טיוטה מ-14:02"** (one tap restores; "התחל מחדש" discards).
- **Visible state:** a card/briefing with an open draft shows a **"סיכום ביקור בהתהוות"** chip; the gaps list counts
  a draft as "started, not filed" (its own line, not a missing visit); the 2 h nudge copy changes to "יש לך טיוטה
  פתוחה על <קיבוץ> — עוד דקה וזה סגור".
- **Cert requires a summary first:** when 🚚 תעודת משלוח is pressed and there is no visit form open and no draft for
  this kibbutz today, the app says **"נדרש קודם סיכום ביקור — פותח את הטופס"** (toast + opens the form with the
  kibbutz prefilled); the cert opens from inside the form (existing `certFromVisitForm`), so the link to the visit is
  guaranteed. With a draft present, the same tap resumes the draft and opens the cert on top.
- Drafts are deleted when the visit is saved (same transaction path) and expire after 14 days (cron sweep). Pure
  `draftState(kibbutz, person, today, drafts)` → `none|draft|filed` with tests; autosave debounce tested with fake
  timers.

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
  - **Rotating copy pool (עידן, mockup comment 17.9 — "תגוון וכל פעם תביא משהו שונה"):** the title/body above is
    variant 0; the server picks one of the variants below per push (index = hash(checkin id) mod N, so the same
    check-in always gets the same text but consecutive days differ). Title is always prefixed `📍 <קיבוץ> — `. Tone:
    positive only, our world (שטח, מונים, חיוב, ישיבה), never a threat. `{kibbutz}` is substituted.
  | # | Title | Body |
  |---|-------|------|
  | 1 | **סוגרים עכשיו, נחים אחר כך** | רבע שעה של פוקוס עכשיו, ושקט נפשי מוחלט בסוף החודש 🧘‍♂️ |
  | 2 | **העתיד שלך מודה לך** | תחשוב על עצמך ב-30 לחודש שותה קפה בנחת, בלי לרדוף אחרי מה היה ב{kibbutz} ☕✨ |
  | 3 | **שליטה על השטח** | מה שכתוב נשמר. מה שבראש נעלם. הסיכום של {kibbutz} הוא הכוח שלך בישיבה הבאה 💪 |
  | 4 | **חוק ה-10 דקות** | פשוט תתחיל. שתי שורות על {kibbutz} וזה זורם מעצמו ונמחק מהראש ⏱️🚀 |
  | 5 | **כל מונה מקבל כתובת** | משימה קטנה אחת שחוסכת טלפונים והפתעות בחיוב של {kibbutz} 🎯 |
  | 6 | **מורידים משקל מהכתפיים** | אין תחושה משחררת יותר מלסמן וי על הביקור ב{kibbutz} כבר עכשיו 📋✔️ |
  | 7 | **זמן שווה זהב** | השעה שתחסוך בסוף החודש שווה יותר מהדקות האלה עכשיו. תשקיע אותן בעצמך ⏳🙌 |
  | 8 | **מקצוען של השטח** | ככה בדיוק עובד מי שמנהל את הקיבוצים שלו ולא נותן להם לנהל אותו 💼😎 |
  | 9 | **בלי דרמות ברגע האחרון** | סוגרים את {kibbutz} בלי לחץ, בלי פאניקה, בשיא הסטייל 🧊👌 |
  | 10 | **צעד קטן, תוצאה גדולה** | נראה טכני, אבל הסיכום של {kibbutz} הוא הפעולה הכי חכמה שתעשה היום 🧠📈 |
  | 11 | **ניצחון קל על הדחיינות** | שלוק מים, שתי דקות, וסוגרים את הפינה של {kibbutz} כמו אלוף 🥊🏆 |
  | 12 | **שקט בשטח, שקט בראש** | סיכום ביקור שנכתב בזמן מביא את השינה הכי טובה בלילה 😴 |
  | 13 | **חוסך לעצמך כאב ראש** | מה שלוקח עכשיו 2 דקות ייקח פי ארבעה כשינסו לשחזר את {kibbutz} בסוף החודש 💡🛡️ |
  | 14 | **הרגלים של תותח** | עוד ביקור אחד מתועד באותו יום. ככה נבנה שם של איש שטח מסודר 🏗️🔥 |
  | 15 | **יאללה, לגמור עם זה** | מוזיקה טובה ברקע, שתי שורות על {kibbutz}, ועוד דקה אתה חופשי לגמרי 🎧 |
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
  tap → a small menu: **⚙️ הגדרות** (§7h), **👤 האזור האישי** with the gaps count badge, 🔔 התראות, 📲 התקנה, EMS
  status/connect, החלפת משתמש / יציאה — עידן, mockup comment 18.9: app settings live here too, not only under ⋯).
  No bare 👤 icon.
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
- **Libraries (עידן 17.9 — "פחות AI, יותר מקצועי ונקי, טיפה יותר הנפשות"):** Lucide SVG icons instead of UI emoji ·
  GSAP core for sheet/cards/link animations (CSS fallback, reduced-motion respected) · **Assistant** as the body face (עידן 17.9: cleaner, faster to read; Rubik as the alternative if he prefers rounder), base 15px. Flat hairline cards, shadows only on floating layers, gradient only on brand touchpoints.
- **Visit-summary and attendance pages are redesigned too (עידן 17.9):** the visit form (`#tab-visit`, `visitQuickModal`,
  products checklist, workday/duration, 🚚 cert status chip) and the attendance page (daily day-type buttons, monthly
  report, missing-days nags) get the same tokens, shadcn controls (ToggleGroup for day type, Checkbox list for
  products, Textarea, Sheet on phone) and Assistant type. Logic, gates and data shapes are untouched
  (`test-visit-cert-gate.mjs`, `test-attendance-*.mjs` keep passing); this is a re-skin through the legacy markup +
  tokens where the form stays vanilla, or a React island where the form is re-mounted — implementer's call per form,
  recorded in the report.
- **RTL correctness is a release gate (עידן 17.9: "שאין עיצוב שבור בעברית"):** `dir="rtl"` on `html` and on every
  island root; logical CSS only (`margin-inline-start`, `padding-inline`, `inset-inline`, `text-align:start`) — a
  contract test greps new CSS/TSX for `margin-left|margin-right|padding-left|padding-right|left:|right:|text-align:
  left|text-align: right` outside an allowlist; numbers, codes, dates, phone numbers and English tokens wrapped in
  `<bdi>` (or `unicode-bidi: isolate`) so they never flip inside Hebrew rows; icons that imply direction (chevrons,
  arrows, "back") are mirrored via `rtl:` Tailwind variants; inputs `text-align:start`; toasts and sheets anchored by
  logical side. Manual RTL smoke (390 px + 1440 px, both themes) is part of every task's smoke and the release smoke.
- **Micro-motion (עידן 17.9):** cards fade in/out on filter and search (crossfade, staggered), sections tween open/closed,
  new/edited card fades in with a brief brand-gradient hairline highlight, bullet→🔗 morph, button press scale, sliding
  chip pill, toast slide, skeleton shimmer while loading. All ≤ 250 ms (sheet 320 ms); `prefers-reduced-motion` disables.
- **Tokens**: add `--radius-lg:14px`, `--surface-2`, the brand pair, and the dark block above.
- **Density**: one card ≈ 3 scrolls of thumb max; long EMS descriptions allowed (per §4) — tall cards, dense grid.
- **Viewer / reports user (עידן 17.9):** the `body.user-viewer` experience is redesigned with the same tokens, bottom
  nav (🏘 · 📊 דוחות · ⋯) and dark mode. Every current viewer function stays: `#viewerReportsHub` (visits PDF/Excel,
  attendance PDF/Excel, delivery-cert PDF/Excel, monthly cert summary, stock/kibbutz Excel), read-only cards, read-only
  meeting bullets (no ➕), read-only EMS tasks, cert view/reprint, and all write blocks (`test-viewer-gate.mjs`
  regression). Feedback box IS allowed for the viewer.

## 7. Part F — Complaints & ideas box (📣 תיבת רעיונות ותלונות)

- Entry: **⋯ עוד → 📣 רעיון / באג / תלונה** (all roles). Sheet with: kind toggle (💡 רעיון / 🐞 דיווח באג / 😠 תלונה — עידן, mockup comment 17.9), textarea, **🎙 הקלט**
  button, anonymous checkbox, שלח.
- Voice, ladder order: (1) **Web Speech API** (`webkitSpeechRecognition`, `lang='he-IL'`, continuous) — live
  transcript into the textarea, editable, no server. Android Chrome + desktop Chrome/Edge: yes. (2) Fallback where
  unsupported (iOS Safari PWA): `MediaRecorder` → upload `.webm/.m4a` to Supabase Storage bucket `feedback-audio` →
  Edge Fn **`transcribe`** → **Groq Whisper (`whisper-large-v3`)** (Groq key already a project secret from
  `parse-order`) → text returned and saved. Recording capped at 3 min.
- Table `feedback` (`id, author text null, kind ('idea'|'bug'|'complaint'), text, audio_path null, status 'new'|'seen'|'done', github_issue int null, created_at`). In the admin inbox a **bug** row has **🐙 פתח כרטיס בלוח הפיתוח** → creates a GitHub issue via the existing `github` edge function (title = first line, body = text + author + date, label `bug`, project column Backlog) and stores `github_issue`; the row then links to the dev page.
  Admin view for עידן/עמיחי in the ⋯ menu: list, mark seen/done. Push to עידן on new feedback (existing `sendTo`).

## 7b. Part G — Kibbutzim as data (create from the app)

Today every card is hard-coded in `index.html` (adding גבעת חיים איחוד on 17.9 needed a code commit). This part
makes the card list **data-driven**, which also simplifies Part A (renames/re-homing become row updates).

- New table `kibbutzim`: `id uuid pk · name text unique (= card data-name) · display_name text · section text
  ('new'|'active') · energy text[] ('electric'|'water'|'gas') · marketing bool default false · **region text**
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
- **Sub-sites (עידן 17.9).** Columns `kind text ('kibbutz'|'subsite') default 'kibbutz'`, `parent text null`,
  `ems_params jsonb null`. The ➕ sheet opens with a two-way choice: **🏘 קיבוץ חדש (לקוח חדש)** or **↳ תת-אתר של
  קיבוץ קיים** (parent picker = existing rows). A sub-site inherits the parent's `section` and `region`, is rendered as
  its own card directly after the parent (badge `↳ תת-אתר של <parent>`), and is a valid target for check-in, visit
  summary, delivery cert, meeting bullets and EMS tasks like any card.
- **EMS verification chain for a sub-site** (runs when the name is typed / on "בדוק מול EMS", needs EMS connection;
  each step shows ✓ / ⚠️ / ✗ and the pulled value, all steps run even if one fails):
  1. **אתר ב-EMS** — `GET /sites`, exact normalized name match, then containment (`emsSiteIdForKibbutz`). ✗ → the
     sub-site can still be saved unlinked (⚠️ card indicator), nothing else runs.
  2. **מונים** — `GET /meters?siteId=<id>&take=500` (if the API rejects the filter, fall back to skipping with ⚠️
     "לא ניתן לספור מונים"): count per `energy_type_code` (1 חשמל / 2 מים / 3 גז) → proposes `energy[]` (עידן may
     override; for non-עידן this proposal is what gets saved).
  3. **משימות פתוחות** — `GET /employee-tasks?siteId=<id>&statuses=open,in_progress,pending&take=100` → count +
     titles (shown, and the card's EMS widget will pick them up via the cache).
  4. **אנשי קשר** — Supabase `site_contacts?site_id=eq.<id>` (existing table) → names/phones shown.
  5. **קיבוץ-אב** — the parent row must exist and not be archived; the sub-site's `ems_site_ids` must not already
     belong to another row (else ⚠️ "האתר כבר מקושר ל-<name>").
  Result is stored in `ems_params` (`{site:{id,name}, meters:{electric,water,gas,total}, openTasks:n, contacts:[…],
  checkedAt}`) and the sheet's save button reads "שמור תת-אתר" once step 1 passed or the user confirms saving unlinked.
  The same chain is offered (as "🔄 בדוק מול EMS") on a normal kibbutz card edit to refresh `ems_site_ids`/energy.
- `KIBBUTZ_SITE_MAP` fallback stays for offline; `ems_site_ids` on the row is the source when online.
- Contract test: every row renders exactly one card; every meeting-note kibbutz resolves to a row or the import
  preview flags it (the "אין כרטיס תואם" state in §3.2 now offers "צור קיבוץ" inline).

## 7d. Part H — Dev page (עמוד פיתוח) redesign (עידן 17.9)

Keep it **more colorful** than the rest of the app (it is the one page where color carries meaning per column), but on
the new tokens/type. Data source and write paths are unchanged (`18-dev-tasks.js`: GitHub Projects v2 via the `github`
edge function, `devStage()`, `dev_status_log`).

- **Board view (default):** four **full columns** in this order — **ספרינט הקרוב** (`ready` / Sprint Ready) ·
  **בפיתוח עכשיו** (`prog`) · **שלבי בדיקות** (`review`) · **ממתין לפיתוח** (`backlog`). Every other column (`done` /
  Scope Refinement, `committed` / עלה, Main Fields…) is a **minimized chip** in a thin rail at the end of the board
  (count + name, colored dot); tapping a chip expands that column in place (as a 5th column) and collapses back on a
  second tap. Column widths never shrink below 280 px because of the rail. **No "משימות כלליות" columns** (the general
  tasks lane is removed from this page). Drag-and-drop, multi-select → "העבר לספרינט", 🚀 עלתה גרסה, filters and search
  stay exactly as today.
- **Tree view (toggle 🌳 / 🗂 at the top):** the GitHub sub-issue tree — one row per **נושא/epic** (root issue), children
  nested with indent; each row shows a status pill and each **root shows a stacked status bar** (backlog / ready / in
  progress / review / done / committed, proportional) — the "Sankey-ish" glance at what is left under each topic.
  Filters: **הסתר שבוצע** (hides done+committed leaves and roots whose children are all done), by assignee, by
  column; search. Expand/collapse per root, "פתח הכל / כווץ הכל". Clicking a leaf opens the issue drawer as today.
- **Tree data:** already fetched (`t.parent` / children from the `github` function's tree mode); when a task has no
  parent it appears under **ללא נושא**.
- **Flow strip (top of the page):** one horizontal stacked bar for the whole board (same six colors) with counts —
  reads like a mini Sankey without the ribbons; tapping a segment filters the board/tree to that stage.
- Colors: six stage colors defined as tokens (`--stage-backlog … --stage-committed`) with dark-mode variants; column
  headers keep a colored top border + tinted count pill; cards stay neutral surfaces with a colored left rule.
- Mobile: columns become a horizontal snap-scroll (one column ≈ 88 vw), the rail becomes a chip row above; tree view
  is the recommended mobile default (remembered per device).
- Tests: pure `devBoardLayout(tasks, expandedKeys)` → `{full:[…], rail:[…]}` golden; `devTree(tasks, {hideDone})` →
  nested structure golden (root with all-done children disappears when hideDone); stacked-bar proportions sum to 100.

## 7e. Attendance (עמוד נוכחות) redesign + holidays (עידן 17.9)

Beyond the re-skin in §6: the page is rebuilt for **density on the phone** (a month at a glance + today's action in one
screen, no scrolling to the important part) and a wide desktop table view.

- **Phone:** header (person, month switcher) → **היום** card with the day-type row (one tap) → 3 KPIs (שטח / משרד /
  חסרים) → **month grid** 7 columns: filled (green), office/home (blue), missing (red dashed), weekend (dim), **חג /
  חול המועד (violet with a small label)** → list of missing days as tappable chips → monthly report button. Tapping a
  day opens a small sheet to set/edit that day.
- **Desktop:** left: the same grid larger; right: a table of the month (date, day, type, kibbutz visited, hours,
  source: ביקור/ידני) + the existing monthly PDF/Excel.
- **Holidays (עידן 17.9):** dates that are **Israeli public holidays or company-declared closures** are not required for
  attendance and are **not counted as missing** — e.g. 13.9.26 (ראש השנה), 21.9 (יום כיפור), 26.9 (סוכות), 3.10 (שמחת
  תורה); and **חול המועד סוכות 27.9–2.10.26 is a company closure (עמיחי)**. They render as **חג** (or **חול המועד**)
  cells. **Entering attendance on a holiday is still allowed** (someone did urgent work) — the sheet shows a note "יום
  חג — הזנה אופציונלית" and the row is counted as a work day in the report with a 🕎 marker.
- **Holiday source:** `db/company_holidays.sql` table `company_holidays(date date pk, name text, kind text
  ('holiday'|'chol_hamoed'|'company_closure'), required boolean default false, created_by)`, seeded for 5786/5787
  (Sept 2026 → Oct 2027) from Hebcal's Israel calendar (one-shot script `db/holidays_seed.mjs` calling
  `https://www.hebcal.com/hebcal?v=1&cfg=json&maj=on&min=off&i=on&year=2026&month=x` … and writing rows; chol hamoed
  rows inserted as `company_closure` with `name='חול המועד סוכות'` per עמיחי's decision; Pesach chol hamoed 2027 is
  inserted as `chol_hamoed` with `required=true` until עמיחי decides). עידן/עמיחי can toggle a date's `required` in a
  small admin list (⋯ עוד → חגים).
- **Missing-days logic** skips non-required holiday dates in BOTH places: client `attMissingDays` (04-attendance-daily
  / 22-push.js) and server `priorMissing` + evening check in `push-send` `attendanceCron` (reads
  `company_holidays`). Golden test: September 2026 fixture with 13.9, 21.9, 26.9, 27.9–2.10 → missing list excludes
  them; a filled 21.9 row is still reported with the 🕎 marker.

## 7f. Part I — Unified calendar (יומן) redesign (עידן 17.9)

One calendar, three layers, one toggle. Data sources already exist: office Google Calendar (edge fn `calendar`),
visits (`visits`), EMS tasks with `expectedCompletionDate` (shared EMS cache). New: **day plans** (route order).

- **Layers:** 📅 אירועי משרד (Google) · 📍 ביקורים · 📋 משימות EMS (only tasks that have a due date). A **"הסתר משימות
  EMS" toggle** (remembered per device) hides the EMS layer. עמיחי sees the full unified calendar (all people); a
  field worker sees the same calendar with **his** tasks/visits highlighted and others dimmed (toggle "רק שלי").
- **Views:** switcher **שבוע / חודש** (remembered). Month: 7 columns Sun→Sat (RTL, Sunday at the right), **week
  numbers in a narrow column on the right side** (same treatment as the day letters on top: small, muted). Week: 7
  day columns with the day's items as full rows (no clipping), grouped by kibbutz. Day cells show up to 3 chips per
  layer color and "+N"; today has a ring; holidays (company_holidays, §7e) show a violet dot.
- **Tap a day (not the +):** desktop → a **day panel below the grid** (stays open while browsing days); phone → a
  **bottom sheet**. Content: the day's items **grouped by kibbutz**, each group: kibbutz name · EMS tasks due that day
  (title, assignee) · visit (if any) · office events; group header has **📍 בריפינג** (opens the briefing for that
  kibbutz, §5) and **➕ צ׳ק-אין** when the day is today. This links the calendar to the arrival flow.
- **Route order ("מסלול היום"):** inside the day panel, the kibbutz groups are an **ordered list** the user can reorder
  with **↑ ↓ arrows** or by **dragging** (mouse and touch; Motion `Reorder`). Order is saved per (person, date) in
  `day_plans(person text, date date, stops jsonb [{kibbutz, task_ids[]}], updated_at, pk(person,date))`. Headers are
  derived, not typed: stop 1 = **🌅 תחילת יום**, middle = **➡️ בהמשך**, last = **🌇 אחרון להיום**; a kibbutz with due
  tasks but not placed in the route sits under **📥 לא משובץ** (עידן asked for a suggested classification — this is it;
  free-text headers are not needed). The arrival sheet (§5.1) orders its list by today's `day_plans` first, then the
  existing heuristic.
- **Absences & events in the calendar (עידן 18.9):** the ➕ on a day (or a drag across days) also offers **🌴 חופש**,
  **🪖 מילואים**, **🎉 אירוע** (company event / training / conference) for a **person** (or the whole company) with a
  date range and a note. Stored in `calendar_absences(id, person null=all, kind 'vacation'|'reserve'|'event', start_date,
  end_date, note, created_by)`. They render as a fourth layer (soft grey band across the range, person avatar), are
  visible to everyone, and: **for אביאם/ניתאי a vacation or reserve range auto-fills attendance** for those days (day
  type `vacation` / `reserve`, source `calendar`), so the missing-days logic and the nudges skip them and the monthly
  report shows them correctly; a company-wide event marks the day as not-required like a holiday (§7e) unless עידן
  ticks "נדרשת נוכחות". Editing/deleting the range updates the generated attendance rows (only rows with source
  `calendar`). Who may enter: עידן/עמיחי for anyone; a technician for himself. Tests: range → generated attendance rows
  (incl. weekend skip), edit shrinks range → rows removed, overlap with a manual row → manual wins.
- **Company meetings show the Meet link (עידן 18.9):** the office Google Calendar event for ישיבת חברה / ישיבת פיתוח
  (already fetched by the `calendar` function) exposes `hangoutLink`/`conferenceData`; the calendar chip, the day
  panel and the meeting-mode header show **🎥 הצטרף ל-Meet** (opens the link) and the agenda push includes it. If the
  event has no conference data the button is not rendered.
- **➕ on a day (schedule EMS tasks):** opens **"שיבוץ משימות EMS ל-<date>"**: search a kibbutz (Command list of cards)
  → shows all its open EMS tasks (from cache; live refresh when connected) with status/assignee → **multi-select** →
  **שבץ N משימות** → PATCH each task's `expectedCompletionDate` to that date via `emsApi('/employee-tasks/:id',
  PATCH)` (existing write path in `14-calendar.js saveEmsTask`), optimistic update in the cache, toast with undo
  (undo = PATCH back the previous dates). Tasks already due another day show their current date and move on select.
  Also allowed: "➕ אירוע משרד" (existing `calAddLink` flow) and "➕ משימה חדשה" (existing create modal with the date
  prefilled).
- Roles: everyone with EMS access can schedule; viewer sees the calendar read-only (no ➕, no reorder).
- Tests: pure `calendarItems(events, visits, emsTasks, {hideEms, onlyMine, me})` golden; `weekNumber(date)` ISO-8601
  with Sunday-start display; `groupByKibbutz(items)`; `routeWithHeaders(stops, dueByKibbutz)` → headers per spec incl.
  "לא משובץ"; `reorder(stops, from, to)`; `scheduleTasksPlan(taskIds, date)` → PATCH bodies + undo bodies; role matrix.

## 7g. Part J — "משימות" page redesign (עידן 17.9)

The "משימות" nav page (`#my-tasks-view`, `renderMyTasks` in `14-calendar.js` + `12-reports.js` builders) becomes a
React island: **my open EMS tasks** grouped by kibbutz, sorted by due date (overdue first, no-date last), each row =
full task (title, description, due, priority, status, 🔗 open in EMS); filters: status, kibbutz, "כולל של אחרים"
(admins); quick actions on a row: **📅 שבץ** (opens the same scheduler as §7f with the task preselected), **✓ סיים**
(PATCH status via the existing write path), **📍 בריפינג**. Company tasks (`companyTasks`) stay as a collapsible block
at the top. Export/copy/mail actions of `generateMyTasksReport` are kept as a ⋯ menu.

## 7h. Part K — Personal settings + personal area (עידן 18.9)

**⚙️ הגדרות** (⋯ עוד → הגדרות; React island `#sigma-settings`, per-user rows in `user_settings(person text pk, font text,
theme text, eod_hour int, updated_at)` + `localStorage` mirror for instant apply):
- **פונט**: Assistant (default) · Rubik · Noto Sans Hebrew · Heebo — applies to the whole app via `--font` token.
- **מצב תצוגה**: בהיר / כהה / לפי המכשיר (same toggle as the header).
- **📲 התקן כאפליקציה**: the existing `appInstall()` prompt (shown when the browser exposes `beforeinstallprompt`; on
  iOS shows the "שתף → הוסף למסך הבית" instructions).
- **🔔 התראות**: one button that requests notification permission and subscribes push (existing `22-push.js`
  subscribe flow), with state text: פעיל / חסום (with the unblock instructions) / לא נתמך.
- **⏰ שעת תזכורת סוף יום** (אביאם/ניתאי): time picker, default 19:00, stored in `user_settings.eod_hour`; the server
  `attendanceCron` evening job reads it per person instead of the fixed 19. The 2-hour visit reminder is unchanged.
- **👤 האזור האישי**: name, role, EMS connection status, devices registered for push (from `push_subscriptions`),
  and the **פערים** panel below.

**📋 הפערים שלי** (personal gaps — for אביאם/ניתאי in their area; for עמיחי and the viewer as a per-person list):
a derived list, no new table, computed by `gapsFor(person, {visits, checkins, dayPlans, emsTasks, attendance,
holidays}, today)`:
- **ביקור בלי סיכום**: a check-in (`field_checkins`) or a route stop (`day_plans`) or an EMS task due that day at that
  kibbutz, with no `visits` row for (person, kibbutz, date) → "היית ב-<קיבוץ> ב-<date> ואין סיכום ביקור".
- **נוכחות חסרה**: the existing missing-days logic (§7e, holiday-aware).
- **משימת EMS שעבר תאריך היעד** assigned to the person, still open.
- **ספירת מלאי פתוחה** (later, from the inventory spec).
Each gap row has the one action that closes it (📍 סיכום ביקור prefilled with kibbutz+date · 📅 מלא נוכחות · 🔗 פתח
משימה). The viewer/עמיחי view is the existing red-rows + 🔔 nudge flow (already live for attendance: `attNagDay` in
`22-push.js`) extended to visit gaps — one `push-send` mode `gapReminder` reusing `attendanceReminder`'s shape.
Golden tests: fixture week with two check-ins (one with a visit, one without), one overdue task, one holiday →
exactly two gaps, in date order.

**Copy rule — never tell a user who else sees his data (עידן, mockup comment 18.9):** no sentence in the app says
"עמיחי רואה…", "עידן רואה…", "מנהל יראה…" or similar. Management visibility is a fact of the roles, not a message to
the employee; the personal area speaks only to the person ("סוגרים את השלושה האלה — והחודש נקי."). The admin views
(gaps per person, health, usage) exist as their own screens with no mirror text on the employee side. Contract test:
grep UI strings for the names עמיחי/עידן followed by ראה/רואה/יראה → must be empty outside admin-only screens.

## 7i. Part L — יומן שטח חופשי: paste/dictate the day, AI splits it into visit summaries (עידן 18.9)

Field workers already write what they did on paper or in WhatsApp. New entry **📝 יומן היום** (bottom-nav ⋯ and a
button on the visit page): one big textarea (or 🎙 dictation, §7 voice) → **נתח** → the text is sent to the existing
edge function pattern (`parse-order` uses Gemini `gemini-2.5-flash-lite` with Groq `llama-3.1-8b-instant` fallback
and an offline heuristic — the same chain, in a new function `parse-daylog`) with the **catalog of kibbutz names +
sub-sites, the product list (technical names), and today's date** as grounding. The model returns strict JSON:
`{visits:[{kibbutz, date, duration_hours|workday, did, open_items, products:[{name, qty}], ems_updates:[{task_hint,
comment}], confidence}], unmatched_text}`. The UI shows **one editable card per kibbutz** (kibbutz picker if the
match is uncertain, products as the normal checklist with the parsed quantities pre-filled, did/open text fields),
the user fixes anything, then **שמור הכל** creates the visits through the normal `saveVisit` path (so the cert gate,
stock movements from the pool, and `visit-saved` events all apply). Nothing is saved before the user confirms.
- **EMS task updates from the same text:** when a sentence clearly refers to an open EMS task at that kibbutz (title
  similarity ≥ threshold, computed client-side over the cached tasks), the card offers "עדכן משימה" → posts a
  comment on the task via the existing comments write path with the prefix **"עדכון מ<שם> על המשימה: …"** (עידן's
  wording); optional status change (in_progress / done) as a checkbox, off by default. Editing a saved visit later
  that is linked to a task posts a second comment with the same prefix.
- **Verify the AI chain still works** as the first step of the task: call `parse-order` with a known fixture and
  confirm Gemini answers (else Groq); record model, latency, and cost tier in the report. The prompt is a file
  (`supabase/functions/parse-daylog/prompt.md`) with a golden test: 5 real-style Hebrew day logs → expected JSON
  (structure asserted, kibbutz names must resolve to the catalog).
- Learning loop like `parse-order`'s `parse_corrections`: every user correction (kibbutz, product, qty) is stored and
  fed back as few-shot examples.

**Voice / Whisper — feasibility answer (עידן 18.9):** Google Drive / OneDrive are storage, not compute; Whisper cannot
"run on" them. Real options, all fine for Hebrew: (1) **Groq Whisper `whisper-large-v3`** via API — best Hebrew
quality in the open-weights family, seconds per minute of audio, fractions of a cent per minute, the key already
exists in this project → **default**; (2) OpenAI `whisper-1` / `gpt-4o-transcribe` API — similar, costs a bit more;
(3) on-device browser speech recognition (Android Chrome, `he-IL`) — free and instant, weaker on jargon, no iOS PWA
support → used as the live path when available; (4) self-hosting `faster-whisper` needs a GPU/VPS (~$20–40/month) —
not worth it at this volume. **Free-first decision (עידן 18.9): self-hosted Whisper on the office server, prototyped on עידן's existing
Whisper machine.** Architecture: the office server runs `faster-whisper` behind an OpenAI-compatible HTTP API
(`fedirz/faster-whisper-server` Docker image, or `speaches`), model **`ivrit-ai/whisper-large-v3-turbo-ct2`** (Hebrew
fine-tune, CTranslate2 int8 — near real-time on a modern CPU, ~4× faster on any NVIDIA GPU) with `whisper-large-v3`
as the quality fallback. Because the PWA is HTTPS (GitHub Pages), the server must be reachable over HTTPS: a **Cloudflare
Tunnel** (free) or **Tailscale Funnel** (free) publishes `https://whisper.<domain>` with a bearer token; the browser
never calls it directly — the `transcribe` Edge Function proxies (`SELF_WHISPER_URL` + `SELF_WHISPER_TOKEN` secrets),
tries the office server first with a 25 s timeout, and falls back to Groq `whisper-large-v3` only if the server is
down (so the free path is the default and the paid one is insurance; Groq can be disabled with a flag). Health is shown
in ⚙️ הגדרות for עידן (last success, model, avg seconds per audio minute). Prototype = Task 6 step 0: run the
container on עידן's server, transcribe three real WhatsApp voice notes, compare `ivrit-ai` vs base `large-v3` on
Hebrew names of kibbutzim/products, record WER-by-ear and latency in the report before wiring the function.
Recordings go to the private `feedback-audio`/`visit-audio` Storage buckets and are deleted after transcription
succeeds (retention 7 days for retry). Every transcript is editable before it is used.

## 7j. Part M — Usage analytics (עידן 18.9) — עידן only

- Table `usage_events(id bigint identity, person text, page text, action text, target text, at timestamptz default
  now(), session_id text, device text)`; client `track(action, target?)` in the bridge (legacy) and a hook (React),
  buffered and flushed every 10 s / on `pagehide` via one bulk insert; PII-free (person name + what/when only).
  Instrumented: page views (`showPage`), island mounts, every primary action (save visit, check-in, cert issued,
  task created/scheduled, order approved, stock report, feedback sent, import, ➕ kibbutz), and dead-end signals
  (search with no results, sheet opened and dismissed without saving).
- **📈 שימוש** page (⋯ עוד, `isIdan()` only): per person × page heat table for the last 30 days, top actions, pages with
  zero use, median time-to-first-action after check-in, "last seen". Charts here use shadcn Charts (Recharts) — the
  first use of the chart library in the app.
- **Weekly digest push to עידן (Sunday 08:00, `push-send` mode `usageDigest`, pg_cron hourly gate):** written as
  sentences, not numbers — a pure `usageNarrative(events, prevWeek)` builder produces lines like "אביאם נכנס 5 ימים
  מתוך 6 ופתח סיכום ביקור 9 פעמים (שבוע שעבר 4)", "ניתאי לא השתמש בעמוד המשימות כלל השבוע", "עמוד המלאי לא נפתח על
  ידי אף אחד", "החיפוש בקיבוצים נכשל 3 פעמים (לא נמצאו: 'גשר', 'שלוחות ב')". Golden tests on the narrative.

## 7k. Decisions from the UX / navigation / adoption review (עידן 18.9) — binding

Source: `docs/reports/2026-09-18-ux-review.md`, `docs/reports/2026-09-18-adoption-strategy.md`, decision page
https://claude.ai/artifact/Cq6MPDDU1MavN2HujKqzYo. עידן's rulings:

| # | Decision | Where it lands |
|---|----------|----------------|
| 1 | **Accepted.** Arrival pick + briefing = one screen: picking a kibbutz morphs the sheet into the briefing in place (view transition); the 📍/🚚 CTAs are already in its sticky footer. Visit form ≤ 2 taps from cold start. | §5.1, Task 5 |
| 2 | **Accepted with a test period.** Phone cards: 2 lines + "עוד"; desktop/briefing/modal: full. **A per-user setting** (⚙️ הגדרות → "תיאור משימות בכרטיס: מקוצר / מלא") overrides the default. **Reminder set for 3 weeks (≈ 9.10.26)** to ask עידן which is better; the constant stays. | §4, §7h, Task 4/15 |
| 3 | **Accepted.** ⋯ עוד = labeled bottom sheet with large rows (יומן, נוכחות, משימות, הגדרות, יומן היום, פידבק, and admin items), attention badges only for action-needed items (gaps, replies). נוכחות never hidden without a label. | §6, Task 4 |
| 4 | **Accepted.** In-app banner at the top of the home screen mirrors the 2 h reminder when the timer fires, independent of push delivery. | §5.2, Task 5 |
| 5 | **Accepted.** Cert gate chip sits under the products list; the save button relabels to "🚚 הפק תעודה ← שמור" the moment a product is checked. Logic untouched. | §5.1b/Task 4 (5b) |
| 6 | **Changed.** No "unlink". Every EMS task must stay visible and traceable. Rule: a bullet that produced an EMS task **may be deleted** (its content lives in the task; the task keeps `מקור: ישיבת חברה d.m.yy` in its description). New requirement: **EMS tasks without an assignee are tracked** — card badge "⚠️ ללא אחראי", a line in the admins' gaps view, the Sunday agenda header, and עמיחי's Monday one-pager; the ➕ flow from a bullet requires an assignee (owner from "אחריות" or an explicit pick). | §3.3, §7h, Task 2 follow-up in Task 18 |
| 7 | **Accepted.** Card order: EMS tasks (action) above meeting bullets (history); bullets collapsed to the latest 1–2 lines + "עוד N". | §3.3/§4, Task 4 |
| 8 | **Accepted.** Dev-page rail is a horizontal chip strip, no rotated text. | §7d, Task 11 |
| 9 | **Accepted (strongly).** Voice fallback also on permission denied / no result in 3 s. | §7, done in Task 6 |
| 10 | **Changed to stale-while-revalidate.** Every screen paints the **last known state instantly** (persisted cache), then refreshes silently in the background; skeletons only when there is no cache at all. **Pull-to-refresh** on phone. The shared EMS cache refreshes in the background from any page on any user's device (existing sync, throttled), and additionally a **half-hourly refresh job from עידן's office PC** (`scripts/ems-cache-refresh.mjs`, Windows Task Scheduler, uses עידן's EMS login; runbook) keeps it fresh for everyone even when nobody is in the app. Later: server-side refresh once EMS issues a service token. | §6, §7c, Task 4 + new Task 20 |
| 11 | Needs a picture — added to the mockup ("היום" strip above the cards): today's route stops + open nudge, collapsible. עידן to confirm after seeing it. | §6, Task 5 |
| 12 | **Accepted.** Desktop Ctrl+K command bar. Methodology (§7k.1 below). | §6, Task 4 |
| 13 | **Accepted with care.** One context-aware header ➕ — must be fully modeled (§7k.2) and never ambiguous. | §6, Task 4 |
| 14 | **Accepted.** Unified view-switcher + breadcrumbs beyond one level. | §6, Tasks 11/13 |
| 15 | "What not to copy" — explanation in the mockup notes; nothing to build. | — |
| ג | **All accepted.** Global cap 3 non-digest pushes/person/day enforced in `push-send`; quiet hours 21:00–06:30 (except immediate low-stock); 2 h reminder capped at 20:00; escalation of audience not tone; 10 new copy variants added to the pool; 2-week pilot with thresholds via usage events. | §5.2, §7j, Task 5 + Task 18 |

### 7k.1 Ctrl+K command bar — methodology
One input, one list, keyboard first. Sources merged and ranked: kibbutzim (name/display/region), EMS tasks (title, site),
internal tasks, pages (`קיבוצים, יומן, מלאי, נוכחות, משימות, פיתוח, הגדרות, שימוש`), actions (`➕ קיבוץ`, `📥 ייבוא`,
`📝 יומן היום`, `🔢 דיווח שינוי במלאי`). Ranking: exact prefix > word prefix > fuzzy; recent items first; role-filtered
by the same `visibleActions(role, context)`. Enter runs the first result; `↑/↓` move; `Esc` closes; typing `>` limits
to actions, `#` to tasks, `@` to people (future). Built on shadcn `Command` (cmdk), opened by Ctrl+K / Cmd+K and by the
header search on desktop; on phone the same list backs the search field (no shortcut). Every open/select is tracked
(usage events) so unused sources can be removed later.

### 7k.2 Context-aware header ➕ — model
`primaryAdd(page, role, context)` → exactly one of: `kibbutz` (home, admins) · `schedule` (calendar, when a day is
selected; else `event`) · `stockChange` (inventory) · `visit` (my tasks / attendance → opens the visit form) ·
`feedback` (anywhere for the viewer) · `none` (page has no add). The button label always says what it does
("➕ קיבוץ", "➕ שבץ ליום", "➕ דיווח מלאי"), never a bare plus; when `none`, the button is not rendered (no purposeless
buttons). Pure function with a full page×role matrix test; the same function feeds Ctrl+K's actions list.

## 7l. First screen per role — **APPROVED by עידן 18.9 as the default landing per employee**

Same app, same bottom nav; only the landing view and the "היום" strip content differ. Rule: the first screen answers
the one question that role asks every morning, and the second tap is the most frequent action.

| Role | Lands on | Top strip ("היום") | Why |
|------|----------|--------------------|-----|
| אביאם / ניתאי (field) | **קיבוצים** with the arrival sheet auto-opened when there is no check-in today (§5.1); after check-in → the briefing of the current kibbutz | route stops in order, open nudge/draft, gaps count | "Where am I going and what do I owe?" — visit form ≤ 2 taps |
| עידן (PM) | **היום שלי** — a PM landing card set: email drafts to confirm (§3b), internal tasks due, onboarding waits ("ממתין למייל" > 3 days), unassigned EMS tasks (§7k #6), Sunday agenda button (Sat/Sun), hours timer state; then the קיבוצים grid below | same cards, collapsed to counts on phone | His day is triage across kibbutzim, not one kibbutz |
| מתניה, **אליה** (devs) | **פיתוח** board (4 columns; on phone the tree view) with his cards first; Saturday: the sprint prep card | comments mentioning him, cards in בדיקות waiting on him, next dev meeting Meet link | He lives in the board, kibbutz cards are secondary |
| עמיחי (CEO) | **סקירה** — the health table (§5 of the company-process spec) sorted red→green, yesterday's stock digest, gaps per person (admin view), Monday one-pager, revenue mix (hours vs equipment) when Task 8–10/hours ship | KPIs: red kibbutzim, unanswered client requests, missing summaries | He reads, rarely acts; one screen must let him spot trouble in 30 s |
| צופה (reports) | **דוחות** hub (existing `#viewerReportsHub`) | none | Only job: produce reports |

Landing = role default (field / pm / dev / ceo / viewer, from `getCurrentUser()` → role map incl. אליה as dev), overridable per person in ⚙️ הגדרות ("מסך פתיחה") and remembered in `user_settings.landing`. All roles keep
🏘 קיבוצים one tap away in the bottom nav.

## 7m. Redundancy audit (עידן 18.9: "תמליץ לי מה מיותר וכפול") — recommendations

Current pages in the legacy nav: קיבוצים · מלאי · נוכחות · EMS · משימות · יומן · עובדים · פיתוח (+ `kibbutz-stats.html`).
Planned additions: הגדרות, פערים, יומן היום, שימוש, סקירה (CEO), פידבק, ישיבה. Overlaps found and what to do:

| # | Duplicate / redundant | Recommendation |
|---|-----------------------|----------------|
| R1 | **משימות page (§7g)** = my EMS tasks; the same tasks already appear on cards (§4), in the calendar's EMS layer + day panel (§7f), in the briefing (§5.1), in פערים (overdue) and in Ctrl+K (#) | **Drop the standalone page.** Add a third view to יומן: **שבוע / חודש / רשימה** — the list view = my open tasks grouped by kibbutz, overdue first (exactly §7g's content), with the same 📅 שבץ / ✓ / 📍 row actions. Task 14 shrinks to "list view inside the calendar island". |
| R2 | **Legacy 📋 EMS page** (task list with filters, create/edit modal) vs cards + calendar + list view | **Retire the page**; keep only the task detail/create/edit modals (they are used everywhere). Its filters live on in the calendar list view. |
| R3 | **משימות חברה כלליות** block + its edit modal on the home page vs **internal tasks (🔒)** | **Merge**: a company task = an internal task with `kibbutz = null`. Delete the legacy block/modal; internal tasks with no kibbutz show under a "חברה" group in the list view and the Sunday agenda header. |
| R4 | **"משימות באחריותי" report** (copy/WhatsApp/mail export in 12-reports.js) vs the list view | **Drop the report**; keep one "שתף" action on the list view (copies the same text). |
| R5 | **עובדים page (staff)** — per-employee load/stats — vs פערים admin view, שימוש analytics, CEO סקירה | **Retire**; its useful numbers (visits/month, open tasks per person) move into עמיחי's סקירה. |
| R6 | **kibbutz-stats.html** (legacy stats page) vs CEO סקירה + health | **Retire** after סקירה ships. |
| R7 | **Gaps admin screen** ("פערים בצוות") vs עמיחי's סקירה vs Monday one-pager vs Sunday agenda header | **No separate screen**: gaps-per-person is a block inside סקירה; the one-pager and agenda quote the same numbers. |
| R8 | **Holidays admin list** (⋯ → חגים, §7e) vs calendar absences (§7f) | **Merge**: in the calendar, a day's ➕ offers "סמן כחג / סגירת חברה" (admins); no separate list. |
| R9 | **Meeting bullets** on card + modal "ישיבות" tab + briefing "ישיבת חברה" block | Keep, but **one component** (`MeetingNotes` with `mode: latest | history | field`); briefing shows only bullets tagged `field|all` (§5.1b). |
| R10 | **Mic/dictation** in feedback (§7), day-log (§7i), future visit form | **One `VoiceInput` component** and one ladder (already `voiceNext`); no second implementation. |
| R11 | **Home search box** vs **Ctrl+K** | Same component (§7k.1) — search field on phone is the Ctrl+K list. |
| R12 | **Feedback inbox statuses** (new/seen/done) vs the dev board for bugs and 💡 ideas | Keep the inbox tiny: a row is "done" when forwarded (bug → card, idea → card or internal task) or dismissed; no separate seen state. |
| R13 | **Two settings entry points** (⋯ and user chip) | Fine — one screen, two doors (עידן asked for both). |
| R14 | **Briefing** reached from arrival, from the card 📍, from the calendar day panel | One component; the arrival sheet morphs into it (#1). |
| R15 | **Digests**: stock 12:00/17:00 (עמיחי), Monday one-pager (עמיחי), Sunday agenda (עידן), weekly usage (עידן), low-stock instant | Keep all — different questions, different days; the global 3/day cap (ג) protects against stacking. |

**עידן's ruling (18.9): all accepted.** R10 clarified: it means one shared recording/dictation component used by every
surface (not merging the surfaces). R12 accepted as a design detail. **Guard rail (עידן): no retirement may drop a
function that is still needed and not covered by the remaining spec** — a coverage audit (`docs/reports/
2026-09-18-retirement-coverage.md`) maps every function of the retired pages/blocks to its new home or marks it KEEP;
Task 18 enforces it (a retired function with no mapping fails the sweep).

Net effect (all accepted): **4 pages retired** (EMS, משימות, עובדים, kibbutz-stats), **2 admin lists merged** (gaps
admin, holidays), **1 legacy block removed** (company tasks), **3 shared components** (MeetingNotes, VoiceInput,
Briefing). Bottom nav unchanged; ⋯ sheet becomes shorter: יומן · נוכחות · הגדרות · יומן היום · פידבק (+ admins: פיתוח,
סקירה, שימוש, ייבוא, ➕ קיבוץ).

## 7c. Architecture — React islands on the existing PWA (עידן 17.9: "תשתמש בספריות שנתתי לך")

עידן named a React/Tailwind stack: **shadcn/ui, Magic UI, Aceternity UI, Motion, Sonner, Vite, TanStack Query,
supabase-js** (+ shadcn Charts / Tremor for data viz). The app today is 13k lines of vanilla JS in 23 modules. A full
rewrite is out of scope for this release; instead the **new surfaces are built in React** and mounted as islands
inside the existing page, while legacy modules (orders, inventory, certs, attendance, calendar, dev board, push,
EMS client) keep running unchanged and are reached through a typed bridge.

- **`app/`** — Vite + React 18 + TypeScript + Tailwind 3 + shadcn/ui (Lucide icons come with it). Build output
  `ui/sigma.js` + `ui/sigma.css` **committed** (GitHub Pages is static; same convention as `js/app.js`).
  `node build.mjs` runs `npm --prefix app run build` first, then the legacy concat + cache-bust.
- **Islands** (each a `createRoot` into a placeholder in `index.html`): `#sigma-home` (cards: sections, regions,
  meeting bullets, EMS tasks, filters/search, ➕ sheet), `#sigma-nav` (bottom nav + theme toggle + user chip),
  `#sigma-field` (arrival sheet + briefing), `#sigma-feedback`, `#sigma-import`, `#sigma-toaster` (Sonner).
- **Bridge `window.sigma`** (defined in a new legacy module `js/src/00-bridge.js`, first in concat order): `{
  getCurrentUser, isViewer, isIdan, isAdmin, ATT_PEOPLE, emsApi, isEmsConnected, emsCacheData, emsSiteIdForKibbutz,
  getEmsSites, kibbutzHasSite, openVisitQuick(kibbutz?), certFromVisitForm, certFromVisit(id), getLastVisit,
  loadAllVisitsCombined, openKibbutzEmsTask(id), createTask(item), showPage, toast(msg) }` — React never touches other
  globals. Legacy code calls back into React through `window.sigmaBus` (a tiny `EventTarget`): events `user-changed`,
  `ems-cache-synced`, `visit-saved`, `theme-changed`.
- **Data**: supabase-js client (anon key; the EMS-gate JWT is passed with `setSession` when present) + TanStack Query
  (`['kibbutzim']`, `['meetingNotes']`, `['checkins', person]`, `['feedback']`; `staleTime` 60 s; persisted to
  `localStorage` via the query persister for offline first paint).
- **Styling isolation**: Tailwind `corePlugins.preflight=false`, `important: '#sigma-root'` (every island root has that
  id-class pair), scoped mini-reset inside islands; shadcn CSS variables map to the brand tokens (`--primary` = brand
  gradient stops, `--radius: 0.875rem`); `darkMode: ['class']`, `.dark` toggled together with `data-theme`.
- **Library roles**: shadcn — Button, Sheet (bottom sheets), Dialog, Badge, Tabs, Command (kibbutz search / arrival
  picker), Select, Switch, Textarea, Skeleton, ToggleGroup; **Motion** — `AnimatePresence` + `layout` for card
  crossfade/reorder on filters, sheet springs, bullet→🔗 morph; **Magic UI** — BorderBeam (new/edited card), ShimmerButton
  (primary CTA), AnimatedList (bullets), NumberTicker (section counts), BlurFade (screen enter); **Aceternity** — one
  restrained Spotlight hover on desktop cards and a subtle background-beams header on the briefing only; **Sonner** —
  all toasts (replaces legacy `toast` for React surfaces, legacy toast kept for legacy pages); **Charts (shadcn/Recharts,
  Tremor)** — NOT in this release; earmarked for the `kibbutz-stats.html` rewrite.
- **Tests**: pure logic lives in `app/src/lib/*.ts` (parser, grouping, chain reduce, nudges, validators) with **vitest**
  golden fixtures (same methodology); legacy node runners keep running; `npm test` runs both.
- **Motion budget** stays as §6: ≤ 250 ms (sheets 320), `useReducedMotion()` disables.

## 8. Execution plan (agents)

Branch `feat/kibbutz-cards-redesign`; sub-branches per chunk merged into it; then → `dev` → `main` per CLAUDE.md
parallel-safe loop. Each chunk ends green on `node --test` suites + a smoke on `?login=0&sb=0`.

| # | Chunk | Agent | Depends on |
|---|-------|-------|-----------|
| 0 | React islands scaffold: `app/` Vite+React+TS+Tailwind+shadcn, bridge, build integration, theme, Sonner, bottom nav shell | Opus | — |
| 1 | Part G table + seed + Part A removals/renames + reports rewrite (data layer; card render moves to React in 1b) | Opus | — |
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

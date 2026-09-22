# סבב תיקונים 2 — QA מהטלפון (22.9.2026, אחר הצהריים)

STATUS: 🟡 OPEN — planned by Fable; executed by Opus/Sonnet agents in parallel worktrees; final test plan + QA by Fable.
Base: `origin/main` ad4cfcd (2.11, כל סבב 1 בפרודקשן). Data ruling applied 22.9 15:30: `section='new'` only for
דגניה ב · עין דור · ניר עציון; every other kibbutz is `active`.

## Ground rules for every package (agents: read this first)
- Work in YOUR worktree/branch only (given in your brief). Never touch another package's files. Build with
  `node build.mjs` (needs `npm ci` + `npm --prefix app ci` in the worktree), test with `npm test` (legacy runners +
  vitest) and the relevant `npx playwright test --config qa/playwright/playwright.config.ts --project=mobile-390-light <spec>`.
- Commit SOURCE only: `js/src/*`, `app/src/*`, `css/app.css`, `index.html`, `db/*`, `docs/*`, `qa/*`, `test-*.mjs`.
  Never commit `js/app.js`, `ui/*`, `css/app.min.css`, `sw.js`, `VERSION`, `docs/integration-map.md` (Fable rebuilds
  once after merging). Use `git add <files>`; never `git add -A`.
- The visit summary the team USES is the React chapters sheet (`app/src/islands/Field.tsx`, opened by 📍 on a card
  and the bar). The legacy form in `index.html` + `js/src/09-visits.js` is the fallback (`?login=0` smoke, viewer).
  Apply visit-form changes to the chapters sheet FIRST and mirror what is cheap to the legacy form.
- Copy rules: `test-copy-rules.mjs` (no system talk), humanizer (no " — " in new UI strings: period/comma/colon/·).
- Every non-trivial rule = a pure function + a vitest golden; every screen change = the Playwright spec of that
  screen updated. Loop until green. Report: files touched, what was NOT done and why, anything for Fable to merge.

## Package A — shell: header, nav, home order  (Sonnet)
Files: `index.html` (header block only), `css/app.css` (header/nav rules), `app/src/components/Nav.tsx`,
`app/src/components/MoreSheet.tsx`, `app/src/islands/HeaderActions.tsx`, `app/src/islands/Home.tsx`,
`app/src/lib/kibbutzim.ts` (+test), `app/src/lib/landing.ts` (nav order per role), `qa/playwright/tests/nav-shell.spec.ts`,
`home-cards.spec.ts`, `viewer-shell.spec.ts`.
1. Header (screenshot): the title is cut and the bell overlaps it. Title in TWO lines ("Sigmatec" / "Operations"),
   Σ at the top-right corner, the right-hand cluster (bell · user initial) never overlapping; one clean row at 360 px.
2. "➕ קיבוץ" leaves the home header on the phone → only in ⋯ עוד (it is already registered there: remove the header
   button on phones; keep on desktop).
3. Bottom bar: 🗓 יומן takes the "רעיון / באג" slot (feedback stays in ⋯). For אביאם and ניתאי the bar is:
   נוכחות · יומן · [📍 ביקור] · קיבוצים · עוד — and מלאי is the FIRST row of ⋯. Other roles: קיבוצים · יומן · [📍] · מלאי · עוד.
   Rule = pure function `navTabsFor(role, user)` + golden.
4. Home order: kibbutzim with an open visit draft or an in-progress EMS-task creation sort to the TOP with a line
   "✍️ יש טיוטה פתוחה של סיכום ביקור" (the `useVisitDraft` chip exists; make it the sort key too).
5. נוכחות icon must not resemble יומן's (`CalendarDays` twice): use `UserCheck` / `ClipboardCheck` for נוכחות.

## Package B — Back button + dirty forms  (Opus)
Files: `js/src/00-guard.js`, `js/src/02-init-attendance.js`, `app/src/lib/useUnsavedGuard.tsx`,
`app/src/components/ui/sheet.tsx` (only if needed), `qa/playwright/tests/pending-states.spec.ts`, new `test-back-button.mjs`.
1. Phone Back with nothing open on 🏘 קיבוצים must NOT leave the app silently: show a small dialog
   "לצאת מהאפליקציה?" with [חזרה לדף הבית] [יציאה]. Implement by keeping one extra history entry
   (`replaceState` sentinel at boot + `pushState`), and on the popstate that would exit → re-push and show the dialog;
   [יציאה] → `history.go(-2)` / `history.back()` twice.
2. Back with an open dialog/sheet that holds typed input → the §7p question (שמור טיוטה / לצאת בלי לשמור / להמשיך);
   an untouched one just closes (round-1 behaviour). Back on an inner page → previous page (round-1).
3. Tap outside a sheet/dialog: stays on the same screen after the close (never navigates). Verify + spec.

## Package C — visit summary + delivery certificate  (Opus)
Files: `app/src/islands/Field.tsx`, `app/src/lib/field.ts` (+test), `app/src/lib/visitDrafts.ts`, `js/src/09-visits.js`,
`js/src/20-delivery-cert.js`, `index.html` (visit form + cert modal only), `js/src/06-products.js`, `app/src/lib/inventory.ts`,
new `app/src/lib/productSearch.ts` (+test), `qa/playwright/tests/visit-chapters.spec.ts`, `visit-form.spec.ts`, `field.spec.ts`.
1. Manual hours placeholder "1.5" (not "הזנה ידנית").
2. Remove "מלאי מקור" (everything is חברה now): hide the select, default POOL.
3. REQUIRED = מי ביקר · משך ותאריך · מה עשיתי בביקור · איש קשר מלווה. Everything else optional. In-place red marks
   (round-1 `.sig-req-miss` idea) in the chapters sheet too; save scrolls to the first miss.
4. מוצרים נוספים: keyword search over the catalog with aliases. `productSearch.ts`: normalize (lowercase, strip
   spaces/hyphens, Hebrew/Latin digits), alias table: "לנדיס", "landis", "360", "e360" → the E360 family with a
   follow-up pick CT / PP / SP; "570", "e570" → E570; "em133", "133" → EM133; "pm135", "135" → PM135; "בקר", "504" →
   בקר 504; give every catalog product 3–6 plausible misspellings. Exactly one hit → picked; several → chips to choose.
   Remove SIM products from the pickable list for now (`products` rows whose name contains "סים"/"SIM" are hidden,
   not deleted).
5. "ציוד שהוחזר מהקיבוץ": collapsed, a ➕ adds a row; a row is one clean line at 360 px (no clipped text).
6. EMS link: NEVER preselect a task. Show the kibbutz's open EMS tasks AND the person's open internal tasks as a
   multi-select list (אביאם sees ניתאי's and vice versa — rule `sharedOwners(user)` in `field.ts`). The summary is
   posted as a comment to EVERY selected EMS task; selected internal tasks are marked done. If nothing is selected:
   a required "סיבת הביקור" chip row — הלקוח התקשר וביקש להגיע · אספקת מוצרים בלבד · תקלה · ביקור מתוכנן · אחר (טקסט)
   — stored on the visit (`visits.reason`, migration `db/visits_reason.sql`, client tolerant when the column is missing).
7. Certificate flow: when products were supplied, saving the visit goes straight to the certificate screen. There:
   [הפק תעודה] (no printing). After issuing: [שלח במייל לאיש קשר] (pick from `site_contacts` with email; add a
   contact + email inline; or "פתח במייל" with the PDF attached where the browser allows — fallback: download + open
   mailto with the text) and [הורד PDF]. Issued certificates are reachable again from the visit, the inventory
   certificates tab and the card; text edits → "שמור עדכונים" then send/download again. The "🚚 הפק תעודת משלוח"
   button at the bottom of the visit summary must be back (it disappeared).
8. 🎙 Experimental: "הקלט סיכום ביקור" at the TOP of the chapters sheet — record or paste text → the day-log
   analysis (`islands/DayLog.tsx` pattern, `supabase/functions/*` that DayLog already uses) fills date, products,
   what was done, what is left, contact, extra products, related EMS task. Label it ניסיוני, show 3 recording tips,
   every field stays editable, and every correction the person makes is stored (`daylog_corrections` pattern) for
   learning. Check the API usage/cost path DayLog uses before wiring; reuse it, do not add a provider.

## Package D — feedback box (רעיון / באג)  (Sonnet)
Files: `app/src/islands/Feedback.tsx`, `app/src/lib/feedback.ts` (+test), `app/src/lib/speech.ts` (+test),
`app/src/components/ui/switch.tsx` (RTL only if needed), `qa/playwright/tests/feedback*.spec.ts`.
1. Closing the sheet crashes / loses the text: fix the crash (reproduce with the crash card / console), and keep a
   DRAFT in localStorage that comes back when the sheet reopens.
2. Speech: the live transcript duplicates ("זו זו זו בדיקה זו בדיקה…") because interim results are appended instead
   of replacing the interim segment. Fix `speech.ts` so `interim` REPLACES and only `final` appends. Replace the
   recording concept with one "🎤 דיבור לטקסט" button (Web Speech) — recording/upload/transcribe only as the fallback
   when Web Speech is unsupported. The level meter that does nothing goes.
3. The anonymous toggle moves the wrong way in RTL (Radix Switch thumb translate): fix with `rtl:` classes or
   logical transforms; verify in the mobile Playwright screenshot.
4. Remove the sentence "מגיע לעידן ועמיחי" (copy rule 2). Keep "אפשר להקליד או לדבר".

## Package E — inventory: certificates tab  (Sonnet)
Files: `index.html` (inventory view only), `js/src/20-delivery-cert.js`, `js/src/21-excel-export.js`, `css/app.css`
(inventory rules), `qa/playwright/tests/inventory-pool.spec.ts`.
1. Tab order: הזמנות · מלאי בקיבוצים · תעודות משלוח · … (certificates right after kibbutz stock).
2. Certificates quick filters as a chip matrix like the visit-form tiles; "הכל" is the default and comes back when a
   chip is deselected; the date range as two styled inputs in the app's design.
3. Two buttons that act on the CURRENT filter: 📄 סיכום תקופתי (PDF) and 📗 Excel. Remove "סיכום חודשי".
4. Sending an issued certificate by email from the tab (same sender as Package C item 7 — coordinate: Package C owns
   the send helper in `20-delivery-cert.js` `certSend*`; Package E only calls it).

## Package F — attendance  (Opus)
Files: `app/src/islands/Attendance.tsx`, `app/src/lib/attendance.ts` (+test), `js/src/04-attendance-daily.js`,
`app/src/lib/calendar.ts` (holiday eves only), `db/company_holidays*.sql` (eves), `qa/playwright/tests/attendance.spec.ts`.
1. Missing days as tappable bubbles (chips), obviously clickable.
2. A saved visit summary → an automatic "יום שטח" for that person and date. If the visit's date is edited, the
   auto day moves with it (the old date becomes missing unless another summary covers it). Pure rule + golden.
3. Clear 📗 Excel / 📄 PDF buttons with icon + label.
4. Missing-report days marked red on the calendar grid too (coordinate with Package G: G owns the calendar cell
   render; F exposes `missingDaysFor(person, month)`).
5. ערבי חג: mark in attendance and calendar, require a report; default = מהבית. Tapping the day starts a 4-second
   countdown that saves the default unless cancelled; the person can pick another type or save faster.
6. אביאם sees ניתאי's attendance (read) so he can tell him to fill it.
7. Icon: see Package A item 5.

## Package G — calendar + briefing  (Opus)
Files: `app/src/islands/Calendar.tsx`, `app/src/lib/calendar.ts` (+test), `app/src/lib/dayPlans.ts` if present,
`app/src/islands/Field.tsx` (briefing part ONLY — coordinate with Package C which owns the form part), `app/src/lib/field.ts`
(briefing rules only), `app/src/components/home/Burns.tsx` (nothing — reuse the collapsed panel), `qa/playwright/tests/calendar.spec.ts`,
`field.spec.ts` (briefing tests).
1. Remove the "+" in the grid. Default view = work week (א–ה). Toggle button: shows "חודש מלא" when א–ה is on, and
   "שבוע עבודה" when the full month is on. Only a month view shows Fri/Sat.
2. Week numbers tiny and at the very edge; the grid uses the whole width.
3. A past date with a visit summary shows it (read-only); no "הוסף למסלול"/briefing on past dates.
4. A future date: search a kibbutz → place it in the route. The briefing for that day lists ALL the kibbutz's open
   tasks (ignore EMS due dates). Remove "הסתר משימות EMS".
5. View picker חודש · שבוע · רשימה: clearly separated, each selectable.
6. Briefing: 🔥 צריבות as a collapsed category with a summary line; the briefing opens on tap of a FUTURE day that has
   a route; today's briefing (if the person has one) opens on the first entry of the day and also sits as a row above
   attendance, like the burns strip.

## Package H — ▶ מצב ישיבה + ישיבת פיתוח  (Sonnet)
Files: `app/src/islands/Presenter.tsx`, `app/src/islands/DevPresenter.tsx`, `app/src/lib/meetingRun.ts` (+test),
`qa/playwright/tests/presenter.spec.ts`, `dev-meeting.spec.ts`.
1. Fits the phone width; the ✕ closes (it does nothing now).
2. Show the open EMS tasks and internal tasks as text on each kibbutz slide.
3. "ניהולי"/region are not headlines: small editable chips like the kibbutz card. The bottom line spans edge to
   edge without overflow. Big prominent ◀ ▶ arrows with the previous/next kibbutz name under them.
4. The stopwatch: the person chooses when to start and whether to stop it.
5. "מאז הישיבה הקודמת": tasks (EMS + internal) opened since the previous meeting date; which closed, which are open.

## Package I — usage documentation for brag  (Sonnet)
Files: `docs/usage/*.md` (new). Five short how-to guides in Hebrew with screenshots taken from the mobile Playwright
run (`qa/playwright/shots`): סיכום ביקור · תעודת משלוח · דיווח רעיון/באג · שיבוץ משימות ביומן · תיעוד נוכחות.
Each: what it is for, the 5–8 taps, what the person gets, common mistakes. Written for the `brag` skill to consume.

## Answered without code
- **Whisper as a "meeting participant" that summarizes live:** feasible with what exists. `transcribe` Edge Function +
  the DayLog analysis chain give transcription and structured summaries; live = chunked recording every 60 s →
  transcribe → append → every minute an LLM summary "headings + list" guided by a prompt. Cost: ~1 Whisper call/min +
  1 LLM call/min per meeting; the self-hosted Whisper (docs/whisper-server.md) makes the transcription free. Risks:
  Hebrew accuracy on a phone mic across a table, and speaker attribution (Whisper does not diarize). Recommended
  as a Package after Package H lands: `MeetingScribe` island inside ▶ מצב ישיבה.

## Fable's closing steps
Merge packages (A → B → D → E → C → F → G → H → I), rebuild, `npm test`, full Playwright (4 projects), write the
comprehensive test plan (`docs/reports/2026-09-22-round-2-test-plan.md`), docs checkpoint, `dev` → `main`.

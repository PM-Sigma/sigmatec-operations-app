# Field-ops hub — round 2 (עידן 8.10)

STATUS: 🟡 OPEN — planned, NOT built. Builds on branch `feat/field-ops-hub` (round 1, awaiting עידן's phone approval).
Resume: read this spec + `2026-09-29-field-ops-hub-design.md` + `docs/superpowers/WORKING-METHOD.md`. Build on a branch off
`feat/field-ops-hub` merged with `origin/main` (main has since changed `Attendance.tsx`/`BurnsPage.tsx` export buttons and
`Field.tsx` qty select — keep both). Execution = Sonnet sessions on the home server; MAIN reviews. Not to main until עידן approves.

## Decisions (עידן, 8.10)

### A. "תכנון היום שלי" (was "היום שלי")
1. Rename the section + jump-nav label to **תכנון היום שלי**.
2. When the day has nothing scheduled: a **"שיבוץ קיבוצים"** button. It opens the calendar's own scheduling sheet for
   today as a bottom sheet OVER the field page (same component as in the calendar; no navigation). On close the
   section refreshes and shows what was scheduled.

### B. Attendance (נוכחות)
1. **Shortages ("חסרים") visibility:**
   - אביאם (field-team lead): his own shortages + the team's shortages.
   - עידן, עמיחי: the team's shortages only (no personal "חסר לך" strip).
   - Everyone else in the field team: their own only.
2. The heading under it ("היום") → **"דיווח נוכחות ידני"**.
3. **"אחר" fix:** choosing "אחר" opens the short free-text answer directly (today it re-opens the same choice list).
   The answer is required (existing rule: other needs a note).
4. **Monthly stats tiles** (cumulative, current month) for the person shown (own; עידן/עמיחי: whoever is selected in
   the person toggle): חסרים · שטח · משרד · בית — plus **חופש** tile only if there are vacation days, plus **מילואים**
   tile only if there are reserve days. Layout: **two rows** (3 + 3 when 6 tiles, 2 + 2 when 4, 3 + 2 when 5).
   When a report made right now creates a new tile, it appears with a simple scale/fade-in animation
   (respect `prefers-reduced-motion`).
5. **Attendance calendar** (bottom of the section):
   - **Collapsed by default** under a soft heading **"נוכחות על גבי יומן"**; tap to expand (remember per user).
   - **Past days:** filled with the category colour, no border; tapping lets the user update what actually happened.
     Each day shows a small source indicator: **סיכום ביקור** / **דיווח ידני** / **יומן (היעדרות)** / other reason.
   - **Future days:** only what is scheduled (visits, absences), thin border, no fill, no suggestions.

### C. Communication check (was "קריאות IP")
1. Rename to **"בדיקת תקשורת MODBUS"**. Design unchanged.
2. **Live meter search** (feasible — research below): after 2–3 typed characters, a dropdown list of matches showing
   **"מספר מונה · כתובת · לקוח"**. Picking one fills the meter for the Modbus check. Debounced (~300 ms), max 20 results,
   keyboard + screen-reader friendly, empty/loading/error states with the app's error mapper.

### D. EMS actions (new) — tiles under the communication check, titled **"פעולות מערכת EMS"**
Tiles: **החלפת מונה** · **הוספת מונה** · **עריכת מונה**. Feasible (research below), with guardrails:
- **Visibility (עידן 8.10):** every app user except the viewer is an EMS admin → the tiles show to all staff, never to
  the viewer. Keep a safety net: if EMS answers 403, show a clear Hebrew message (via the error mapper), no crash.
- **Edit** = GET the meter → edit form → full PUT (EMS's PUT is full-body: omitted fields are nulled). Never partial.
- **Replace** = `POST /v1/meters` with `replacementOfMeterId` + optional `dismantlingReading`. It is effectively
  irreversible (ends client associations, moves children/solar, tags the old meter) → a two-step confirmation screen
  with a summary of what will change, and the installation date shown prominently.
- **Add** = `POST /v1/meters`; required fields: serialNumber, address, installationDate, roleCode, typeCode,
  energyTypeCode, communicationTypeCode (+ site). Reference lists fetched from EMS.
- **Replace = the same form as EMS (עידן 8.10):** mirror the EMS web UI's replace-meter dialog exactly: the same fields,
  labels, order, defaults and validation. Read the EMS frontend (sigmatec-ems repo, the meters replace dialog/component)
  and copy its field list; reference lists (roles/types/sub-types/communication/kVA/voltage) fetched from EMS.
- **Associate a customer after create (add or replace):** after the meter is created, offer "שיוך לקוח" — search
  the customer (EMS clients search), start date (default = installation date), percentage if EMS asks for it — using
  the EMS endpoint that the EMS UI uses for client↔meter association (find it in the EMS code; don't send
  clientAssociations on the create call itself for a replace, to avoid double associations).
- **Edit → quick "העברה לארכיון" (עידן 8.10, frequent action):** a one-tap action inside edit that sets the meter's
  role to the EMS archive role (find its roleCode in the EMS reference data). **Only allowed when the meter has no
  active customer association** (no association with endDate null or ≥ today); otherwise the button is disabled
  with the reason ("למונה יש לקוח פעיל — יש לסיים את השיוך קודם"). It still goes GET → full PUT with only the role
  changed, + a confirm step, + the audit row.
- **No delete** (EMS has DELETE; we don't build it).
- Each action writes an app audit row (who / what / when / meter) — new table, service-role insert via an edge fn or
  RLS insert-own.
- ⚠️ Production impact on customer billing data: built behind a flag, tested against a test site first, עידן approves
  before it's switched on.

### E. Burns (צריבות)
1. **Collapsed by default** — every kibbutz group closed; the user opens the one they work on (remember the last open).
2. **Reports by kibbutz:** tapping PDF/Excel opens a picker — the open kibbutz (default) / one kibbutz / several
   (checkboxes) / all — then exports only those.
3. **Excel structure (עידן 8.10):**
   - **One kibbutz:** file named `צריבות — <kibbutz> — <date>.xlsx`; **one sheet per generator** (sheet name = generator,
     ≤31 chars, Excel-safe), plus a first sheet **"סיכום"** (per generator: total / burned / remaining / problems).
   - **Several kibbutzim:** file `צריבות — <n> קיבוצים — <date>.xlsx`; **one sheet per kibbutz**, every sheet has a
     **"גנרטור" column with an Excel AutoFilter** on the header row (dropdown to pick a generator), frozen header, RTL
     sheets. Plus a first sheet **"סיכום"** = a pivot-style table (rows: kibbutz → generator; columns: total / burned /
     remaining / problems) with AutoFilter. (A native Excel PivotTable isn't writable with the bundled xlsx library; the
     summary sheet + AutoFilter gives the same "pick a generator" convenience. Note it as the upgrade path if עידן wants a
     real PivotTable.)
   - PDF follows the same grouping (a section per kibbutz → generator).

## EMS research (8.10, read-only, sigmatec-ems repo)
- **Search:** `GET /v1/meters?search=…&take=20` — ILIKE over serial, address, type, role, site name, **client name**,
  tag; returns `{data, meta}`, joins `clientMeters.client` (customer). Solar system NOT joined (would need
  `GET /meters/:id` per hit — skip for v1; show the customer). Roles: admin, site_manager, operations_manager,
  account_manager, meter_viewer, solar_viewer; scoped to the user's sites. Better than `/v1/upload-readings/meters`
  (no customer, no paging).
- **Meter create/replace/edit:** `meters.controller.ts` — `POST /v1/meters` (replace via `replacementOfMeterId`),
  `PUT /v1/meters/:id` (full body); guards AuthUserGuard + MeterAccessGuard; roles ADMIN / SITE_MANAGER /
  OPERATIONS_MANAGER. Duplicate serial → 400. Replace is one transaction (associations end at installationDate,
  children/solar move, old meter tagged "מונה שהוחלף", optional final MANUAL reading).
- **Token:** the app's EMS login (`ems_token_v1`, 12 h, no refresh, 401 → re-login). Calls go through the existing
  `emsApi` path. The app doesn't know the user's EMS role yet → add `/auth/me`.

## Tests (per docs/testing-methodology.md)
Role matrix for every visibility rule above (אביאם / ניתאי / עמיחי / עידן / viewer); the stats-tile layout for 4/5/6
tiles; the "אחר" flow; calendar past/future rendering + source indicator; search debounce + result format with a mocked
EMS; EMS actions: role gating, GET→full-PUT payload equality for untouched fields, replace confirmation; burns collapsed
default + export picker. Playwright 360/412 light+dark, dark-contrast 0, test-html-guard green, boot ≤ 311,296 B.

## Build order (suggested)
A + B (attendance) → E (burns) → C (rename + search) → D (EMS actions, behind a flag, last).

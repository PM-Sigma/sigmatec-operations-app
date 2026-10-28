# Visit services ("שירותים שניתנו") — design

STATUS: 🟡 OPEN — spec only, NOT built. Resume: build per this spec on `feat/visit-services` off `origin/main`.

## Goal (עידן 28.10.26)
During a visit summary the field technician ticks the services he actually performed, as a checklist, with a QUANTITY next to each. No price for now. The service list is a basic catalog that can be changed and deleted.

## UX
- New chapter in the visit summary (app/src/islands/Field.tsx chapters): **"שירותים שניתנו"**, after the products chapter.
- One row per active catalog service: checkbox + name; when ticked, a quantity control appears (the native `<select>` wheel used for products, 1..max(20, current+10), default 1) with ➖/➕.
- Search/filter box when the catalog has > 12 items. "+ שירות אחר" free-text line (name + qty) for a one-off service not in the catalog.
- Optional (decision pending): a gentle reminder on save when nothing is ticked; never blocks the save.
- Read side: the attendance day-details block, the kibbutz card's last visit, the visits Excel/PDF exports list "שירותים: התקנת מונה ×3, בדיקת תקשורת ×1".

## Catalog management
- Screen under ⋯ → ניהול → "קטלוג שירותים" (עידן, עמיחי; decision pending). Add, rename, reorder (drag or ↑↓), delete.
- Delete = soft (`active=false`): hidden from new visits, still shown by name on old visits.
- Seed (editable): התקנת מונה · החלפת מונה · התקנת בקר תקשורת · צריבת בקר / כרטיס · בדיקת תקשורת · טיפול בתקלת תקשורת · חיווט / תיקון חיווט · ריסט לבקר · הקמת מונה ב-EMS · שיוך מונה ללקוח · קריאת מונים ידנית · בדיקת מאזן · אספקת ציוד · הדרכת לקוח.

## Data
- `public.service_catalog (id uuid pk, name text not null unique, sort int, active bool default true, created_by text, created_at timestamptz)`. RLS: select = authenticated non-viewer… (viewer may read for reports); insert/update = עידן/עמיחי by JWT name claim; no delete (soft only).
- `public.visits.services jsonb default '[]'` = `[{ "id": uuid|null, "name": text, "qty": int>0 }]` — name snapshotted so renames/deletes never rewrite history. Respect the visit edit lock trigger (no change needed: it's a visits column).
- SQL file `db/visit_services.sql` with BACKUP / ROLLBACK; applied by MAIN.
- Client tolerates a missing column/table (fallback: chapter hidden) so the client can ship before the SQL.

## Tests
Pure builders (selection ↔ jsonb, qty bounds, soft-deleted names on old visits), role matrix for the catalog, Playwright: tick 2 services + qty, save, see them in day details; catalog add/rename/delete; 360/412 light+dark + desktop. Gates as usual.

## Later (not now)
Price per service, billing per kibbutz, service ↔ EMS task link, monthly services report per kibbutz.

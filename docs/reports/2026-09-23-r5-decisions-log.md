# סבב 5: החלטות שנלקחו בלי עידן

כל החלטה שנלקחה במהלך הסבב בלי אישור מפורש של עידן. לסקירה בסיום, ומה שעידן משנה חוזר לתיקון.
עמודות: מתי · חבילה · ההחלטה · למה · איך משנים אם צריך.

| # | מתי | חבילה | ההחלטה | למה | לשינוי |
|---|---|---|---|---|---|
| 1 | 23.9 | 0 · הקפאה | קישורי תעודת משלוח ללקוח (`?cert=`) ומצב mock פתוחים גם בהקפאה | הלקוח אינו משתמש באפליקציה; הבדיקות רצות ב-mock | להסיר את הפטור ב-`upgradeFreezeDecision` |
| 2 | 23.9 | 0 · הקפאה | שכבת מסך ההקפאה מעל כל שכבה אחרת (z 2147483000) | כדי ששום חלון/הודעה לא יופיעו מעליו | — |
| 3 | 23.9 | 1 · ניקוי | כתובת ה-Apps Script נשארת כ-proxy ל-EMS (דוחות, פענוח הזמנות, תמלול) | רק ה-Sheet כמקור נתונים בוטל; ה-proxy עדיין בשימוש חי | תכנית נפרדת להעברת ה-proxy |
| 4 | 23.9 | 1 · ניקוי | הטבלאות `tasks`, `settings`, `ems_cache`, `ems_queue` לא נמחקו | כולן בשימוש חי (סטטוס קיבוץ, משימות חברה, מטמון EMS, תור כתיבה) | — |
| 5 | 23.9 | 1 · נקודת עצירה | יתרת פתיחה נכתבה כתנועה מ-'' אל המיקום, בתאריך העצירה, בשם עידן | כל חישובי המלאי מתעלמים ממקור ריק, והמספרים נשארו זהים | — |
| 6 | 23.9 | 1 · נקודת עצירה | הטריגר של התראות המלאי הושבת לזמן הכתיבה (81 שורות) | כדי שלא יישלחו 81 התראות | — |
| 7 | 23.9 | 1 · גיבוי | גיבוי מקומי דרך פונקציה עם מפתח, קובץ JSON יומי (לא pg_dump) | אין סיסמת DB במחשב | — |
| 8 | 23.9 | 2 · מערכת עיצוב | פריטים שכשלו ב-360 ש-main כבר נכשל בהם נרשמים ברשימה ממופה לחבילות, והרשימה חייבת להתרוקן עד סוף הסבב | חוב קיים, לא רגרסיה | — |
| 9 | 23.9 | פעולות שטח | הספק נכתב ונדחה לאחרי הסבב | תלוי במערכת העיצוב; עידן אישר את העיתוי | — |
| 10 | 23.9 | DOC | Documentation modelled on EMS (generated schema + knowledge layer + map); retired docs move to docs/history; a new test fails if a retired path comes back | So the graph relies on one source with no duplicates | The spec `2026-09-23-r5-DOC-documentation.md` |
| 11 | 23.9 | DOC | **Waiting for עידן:** proposed addition to CLAUDE.md, "every feature updates its module doc". Not applied. | CLAUDE.md is his file | Approve or reject at the end |
| 12 | 23.9 | A | The builder was allowed to change one line in `Attendance.tsx` (the saved message) during its logic stage | The audit required it as the acceptance step of A-L2 | — |
| 13 | 23.9 | K | K committed generated files against the rules; they are rebuilt at merge | So they don't conflict | — |
| 14 | 24.9 | X | The stock digest to עמיחי keeps showing supply movements from visits, even though the bell hides them from him | It's an inventory summary, not a visit alert | Filter `inventoryDigest` in push-send |
| 15 | 24.9 | X | Writing to the GitHub board (including opening an issue) for עידן, עמיחי and מתניה, per עידן's ruling; the spec had proposed issues for עידן/עמיחי only | עידן's ruling wins | gate.js roster |
| 16 | 24.9 | G/C | The setting "אביאם sees ניתאי's tasks" is C's `cal_peer_tasks`; G's duplicate was removed | One field for one ruling | — |
| 17 | 24.9 | 1 | The tables `backup.snapshots` and `archive.movements_pre_breakpoint` are without RLS; confirmed that anon has no permission on the schema or the table | Not reachable through the API; RLS would only add overhead | `alter table … enable row level security` |
| 18 | 24.9 | Process | Agents resumed 6 at a time instead of 12 | The usage limit stopped everyone twice | Raise it back if the quota allows |
| 19 | 24.9 | V | The stock difference when editing a September visit from before the breakpoint is computed against the products stored in the visit itself, not against the archive (the archive RPC was dropped) | The archive's movements come from personal bags, so it would have deducted twice; the visit's products match the archive exactly | — |
| 20 | 24.9 | V | Order of production changes: backup → attendance source column → history backfill → lock trigger → client and push-send together → re-run the backfill after deployment and the next day | Without the backfill, all past visit days would appear as missing and send reminders | — |
| 21 | 24.9 | 2 | The designer offered A (accept the foundation now) or B (one short round of fixes and then a gallery check). I chose B, which is the designer's recommendation | The fixes are small and it's better to close them before 11 packages are built on them | Switch to A |
| 22 | 24.9 | V | Production went out: attendance source column (49 manual), history backfill (+54 automatic for אביאם/ניתאי, 0 missing), lock trigger (August locked, September until 10.10), push-send deploy, all after a backup | According to the approved order | Rollback: remove the trigger; `delete from attendance where source='visit_auto'` |
| 23 | 24.9 | X | Stopped before production: the staff list mapped by first name only, so a customer named עידן would have received admin access. The fix: only @sigmatec-energy.com users | Security | — |

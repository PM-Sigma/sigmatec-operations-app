# סבב תיקונים — בדיקת אפליקציה מהטלפון (Galaxy S24) · 22.9.2026

STATUS: 🟡 OPEN — in progress on `feat/phone-qa-round` (worktree `SigmatecOps-wt-qa`, base `origin/main` 25aa1a5 = 2.03).

מקור: הערות עידן מבדיקה בטלפון, 22.9. הקטלוג מסודר לפי תחומים; לכל פריט: מזהה, ההערה כפי שנמסרה,
מיקום בקוד, מקומות-אחים עם אותו באג, והחלטת ביצוע. כללי עבודה: humanizer לכל טקסט/כותרת,
impeccable (craft-floor / polish / adapt / clarify) לכל שינוי עיצוב; QA מלא אחרי הסבב על ידי סשן ה-QA.

עדיפויות: **P0** = חוסם/תקוע · **P1** = הערה מפורשת שנוגעת לתפעול יומי · **P2** = עיצוב/ניסוח · **P3** = פיצ'ר חדש (מתועד, נבנה אחרי P0–P2 או בסבב נפרד).

---

## A · ניווט, סגירה וחזרה (P0)

| # | הערה | קוד | אחים | ביצוע |
|---|------|-----|------|-------|
| A1 | בצריבות → "הכל" → גנרטורים: אין דרך לצאת מהחלון; יציאה מהאפליקציה מחזירה לדף הבית במקום לצריבות | `js/src/24-meter-burns.js` `burnAssignModal`/`burnCardModal` (רק כפתורי פעולה, ללא X; לחיצה על הרקע לא סוגרת כי `.modal` עוצר propagation ואין handler על backdrop) · `showPage('burns')` לא נשמר בין סשנים | כל `.modal-backdrop` ב-`index.html` (14 מודלים): `emsDetailModal`, `emsTaskModal`, `voiceModal`, `intakeModal`, `orderQModal`, `attEditModal`, `visitQuickModal`, `invOrderModal`, `invRequirementModal`, `invProductModal`, `visitsReportModal`, `activityModal`, `modalBackdrop`, `emsQueueModal` (דינמי) | **כלל אחד** ב-`00-guard.js`: לחיצה על `.modal-backdrop` עצמו סוגרת (דרך `modalDismiss` כך שה-§7p guard נשמר), Esc סוגר, וכל `.modal` מקבל כפתור ✕ אחיד בפינה (מוזרק אוטומטית אם אין). בדיקה: `test-modal-close.mjs` סורק את index.html ומוודא שלכל backdrop יש נתיב סגירה. |
| A2 | בתוך מונה בצריבות — אין סגירה, תקוע. "תגיד ל-QA לבדוק בכל האפליקציה" | `burnCardModal` | ראה A1 | A1 מכסה. ל-QA: בדיקה גנרית "כל דיאלוג נסגר" (Playwright). |
| A3 | אין כפתור חזרה לעמוד הקודם מצריבות | `burns-view` נפתח דרך `showPage('burns')`; אין header לעמוד | `pushlog-view`, `dev-view` (עמודי "עוד" ללא חזרה בטלפון) | כותרת עמוד אחידה `.page-head` עם ◀ חזרה לכל עמוד שאינו בסרגל התחתון. `showPage` דוחף `history.pushState` כדי שכפתור Back של אנדרואיד יחזיר לעמוד הקודם ולא יצא מהאפליקציה. |
| A4 | חזרה מהרקע: מסך טעינה ארוך → מסך ריק → זמן רב עד שחוזר | חשד: `visibilitychange` מפעיל בו-זמנית `emsBackgroundSync` (13-ems), `check()` גרסה (19-version-check) שעשוי לעשות reload, TanStack `refetchOnWindowFocus`, ו-SW network-first על `index.html` (sw.js) שברשת סלולרית איטית מחכה לרשת לפני שמגיש מהמטמון | — | (1) sw.js: ל-navigation — stale-while-revalidate (מגיש מטמון מיד, מרענן ברקע; `controllerchange` כבר עושה reload חד-פעמי). (2) 19-version-check: בלי reload אוטומטי בחזרה מהרקע, רק באנר. (3) EMS sync בחזרה מהרקע רק אם עברו 15 דק'. ל-QA: תרחיש background→foreground ×10 עם throttling. |
| A5 | "עוד": גלילה למעלה בתוך הגיליון נתפסת כ-pull-to-refresh | `app/src/components/PullToRefresh.tsx` — `atTop()` בודק רק את ה-document; המאזין ב-`document` תופס touch גם בתוך Radix Sheet | כל `SheetContent`/`DialogContent`/`.modal-backdrop.open`/אלמנט `overflow-y:auto` | `onStart`: אם `e.target.closest('[data-sigma-portal], .modal-backdrop')` או שיש אב גלילי → לא מתחילים. בדיקה ב-`PullToRefresh.test.tsx`. |
| A6 | לחיצה ארוכה על סרגל המודולים → הסרגל "משתחרר" ועולה עם כל המודולים (כמו מגירת הטוגלים באנדרואיד) | `Nav.tsx` | — | P3: `onPointerDown` + timer 450ms על ה-nav → פותח את MoreSheet. |
| A7 | Back של אנדרואיד/יציאה מהאפליקציה זורק לדף הבית | `currentPage.ts` + `showPage` | — | חלק מ-A3: `_currentPage` נשמר ב-`sessionStorage`, boot מחזיר אליו. |

## B · Header, סרגלים ופריסה (P1–P2)

| # | הערה | קוד | אחים | ביצוע |
|---|------|-----|------|-------|
| B1 | Header נעלם בגלילה למטה וחוזר בגלילה למעלה (כמו שורת כתובת בדפדפן) — בכל הדפים | `css/app.css` `.header{position:sticky}` | `FilterChips` sticky, `.inv-tabs` sticky, `.section-header` sticky | סקריפט קטן ב-`00-guard.js`: כיוון גלילה → `body.hdr-hidden` → `.header{transform:translateY(-100%)}`. |
| B2 | סרגל הסינון המהיר צר יותר, שורה אחת, נכנס במלואו ב-S24 | `FilterChips.tsx` — `overflow-x-auto`, `px-3 py-1.5 text-[13px]` | — | `text-[12px] px-2 py-1`, ארבעה צ'יפים ב-flex ללא גלילה. |
| B3 | Header: לוגו לפינה הימנית-עליונה; dark-mode לתוך תפריט המשתמש; הכל בשורה אחת כולל התראות | `index.html` `.header-top`, `HeaderActions.tsx` (ThemeToggle), `UserChip.tsx`, `#sigma-alerts` | — | הסרת ThemeToggle מה-header (נשאר ב-Settings). CSS: `.header-top{flex-wrap:nowrap}` בטלפון, גובה 48px. |
| B4 | "עבור למלאי" מוצע כשאני כבר במלאי — להסיר | `app/src/lib/primaryAdd.ts` `inventory→stockChange` עם `ADD_OPENS_FORM=false` | `calendar→'עבור ליומן'` כשאני ביומן — אותו באג | פעולה שהיא רק ניווט → `'none'`. StockChange island קיים → `stockChange` פותח טופס (➕ דיווח מלאי). |
| B5 | גלילה לרוחב: חיווי "יש עוד", במיוחד בטלפון | טבלאות `.inv-table`, `.dev-board`, `.cal-*` | — | Utility CSS `.scroll-x` עם fade בקצה; מוחל על כל `overflow-x:auto`. |
| B6 | "1 פעולות ממתינות לחיבור" לא ברור — להסיר | `13-ems.js` `emsQueueChipRender` + `#emsQueueChip` | — | הסרת הצ'יפ; התור מתנקז ברקע. |
| B7 | כפתור רענון EMS 🔄 — להסיר מכל המודולים; סנכרון ברקע כל 15 דק' | `24-meter-burns.js` 🔄, `18-dev-tasks.js` 🔄, `23-push-log.js` 🔄, `00-consts.js` `EMS_BG_MIN_MS` | — | הסרת כל כפתורי 🔄. `EMS_BG_MIN_MS = 15 דק'`. Pull-to-refresh נשאר ככלי היחיד לרענון ידני. |

## C · מצב ישיבה, לקוחות פוטנציאליים, הרשאות תצוגה (P1)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| C1 | מצב ישיבה — לא בטלפון; בדסקטופ רק אם יש לו סיבה אמיתית | `05-meeting-returns.js` `toggleMeetingMode` (body.meeting-mode), `#meetingBadge`; **נפרד** מ-▶ מצב ישיבה (Presenter.tsx, Task 24) | ממצא: `body.meeting-mode` משנה רק את גודל שדה החיפוש (`app.css:1141`). **אין לו סיבה אחרי 2.00** → הסרה מלאה של `#meetingBadge` והפונקציה. Presenter ▶ נשאר (פיצ'ר אחר). |
| C2 | לקוחות פוטנציאליים — רק עידן ועמיחי, רק בדף הבית | `#potentialsBtn` ב-header (גלובלי), `renderPotentials` 01-data | הסרה מה-header; כפתור בדף הבית בלבד, `isIdan() || עמיחי`. |
| C3 | בתוך צריבות לא רואים פוטנציאליים/ישיבה — רק יציאה | header גלובלי | C1+C2 פותרים; A3 מוסיף חזרה. |
| C4 | שם המשתמש ב-header — לצמצם | `UserChip.tsx` | בטלפון: אווטאר-אות בלבד, שם מלא בתפריט. |

## D · דף הבית — כרטיס קיבוץ (P1)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| D1 | צריבות בכרטיס: מכווץ כברירת מחדל, לחיצה להרחבה; לא אייקון בכרטיס בדף הבית — פנימי בלבד | `KibbutzCard.tsx` `<BurnChip>`, `Burns.tsx` `BurnsPanel` | הסרת `BurnChip` מהכרטיס. במודל: `BurnsPanel` ב-Collapsible סגור עם שורת סיכום. |
| D2 | "פרטי קיבוץ" מקריס את הכרטיס; העריכה רק לעידן, כפופאפ: שם, איזור, קוד, סוגי אנרגיה, תתי-אתרים, קטגוריה | `KibbutzCard.tsx` ✏️ (`canManageKibbutzim` = עידן+עמיחי), `KibbutzSheet.tsx` | ✏️ עובר מהכרטיס למודל ליד השם, `isIdan()` בלבד. KibbutzSheet מוסיף: קוד לקוח, תתי-אתרים, קטגוריה. |
| D3 | כרטיס סגור: משימות EMS ללא תיאור; הפרדה רכה EMS/פנימיות; אין פעולות פנימיות מחוץ לכרטיס; משימה פנימית → פופאפ אחריות → נקודה + שם; תאריך יעד (ריק מותר); אותם מרכיבים כמו EMS; אין משימות → שתי בועות "משימת EMS"/"משימה פנימית"; אלו הפעולות היחידות מהכרטיס | `EmsTasks.tsx`, `InternalTasks.tsx`, `CardActions.tsx` | EmsTasks compact בכרטיס (כותרת+👤+📅). InternalTasks בכרטיס: קריאה בלבד; הוספה דרך Sheet: כותרת, אחראי, יעד, עדיפות, סוג. סכימה: `internal_tasks` + `due_date`, `priority`, `kind` (`db/internal_tasks_due.sql`). CardActions → "➕ משימת EMS" / "➕ משימה פנימית". |
| D4 | "אין סיכום ישיבה" — לא להציג; בכרטיס: רק משויך + יעד; בפנים: עדיפות וסוג בבועות קטנות למטה משמאל | `MeetingNotes.tsx` `empty`, `EmsTasks.tsx` `t-meta` | empty → null. EmsTaskRow compact/full. |
| D5 | "עודכן על ידי X" — רק בפנים. בכרטיס: "ביקור אחרון בתאריך …"; משימת EMS עם יעד שעבר וללא ביקור אחריו → בתאריך היעד, אדום מודגש, "ללא סיכום ביקור!" | `01-data.js lastUpdateText`, `10-activity.js applyCardLastVisit` | `lastVisitLine()` טהור + `test-last-visit-line.mjs`. |
| D6 | קריסות בלחיצות בכרטיס — לבדוק כל קישור | `openEditModal`, `switchTab`, `CardActions`, ✏️→`KibbutzSheet` | Playwright על כל קישורי הכרטיס; `ErrorBoundary` בכל island → "משהו נשבר · דווח". |
| D7 | תעודת משלוח — לא במסך הראשי; רק בסיכום ביקור | `CardActions.tsx` `cert`, `Nav.tsx` 🚚 | הסרה משניהם. נשאר בטופס הביקור. |
| D8 | "ישיבות" רק פותח את הכרטיס — להסיר; טאבים: "מצב הקיבוץ" ו"ביקורים" | `CardActions.tsx`, `index.html` `.modal-tabs` | הסרה + שינוי כותרות. |
| D9 | להסיר בועת "פרויקט זמני" | `Burns.tsx`, island label | הסרה. |
| D10 | ✏️ בתוך הכרטיס ליד השם משמאל, עידן בלבד | ראה D2 | D2. |
| D11 | "1 פעולות ממתינות" | ראה B6 | B6. |
| D12 | דפנה קפצה ל"לקוחות חדשים" בלחיצה על ✏️ | `KibbutzSheet` `setSection(row ? sectionOf(row) : 'new')` — `sectionOf` מחזיר 'new' לכל מה שאינו 'active' | בעריכה `section` לא נשלח אם לא שונה. + תיקון נתונים: דפנה → active (אישור עידן). |
| D13 | איבוד מידע בשדרוג: 3 חדשים, השאר פעילים; שיווקי לא לגעת; לשחזר למצב 18.9 18:00 | `kibbutzim`, `tasks` | **פעולת נתונים.** לבדוק Supabase PITR / cache / Sheet snapshot; לתעד ולהציע לעידן לפני שינוי. |

## E · טיימר שעות + עמוד שעות (P3)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| E1 | טיימר רץ גלוי; לחיצה → עצור/המשך, שעת התחלה ידנית, איש קשר, תגית (auto אם קרוב), עצור-ומחק, שמור והמשך; אחרי שעתיים — עצירה + התראה "עדכן את השעון של קיבוץ X" | `WorkTimer.tsx`, `WorkTimerStopSheet.tsx`, `lib/clockify.ts` | `WorkTimerEditSheet`; auto-stop 2h + push `timerStale`. |
| E2 | עמוד "שעות עבודה מול לקוחות" לעידן/עמיחי/מתניה: טבלה, עריכה (עידן+עמיחי), הוספה ידנית, PDF/Excel, גם ב-viewer; כל שינוי ללוג | `work_sessions`, `21-excel-export.js` | `hours-view` + `Hours.tsx`; `work_sessions_log`. |

## F · סרגל תחתון ו"עוד" (P1)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| F1 | "תעודה" לא בסרגל — מתאחד עם ביקור | `Nav.tsx` 🚚 | הסרה. |
| F2 | רעיון/באג לסרגל במקום תעודה | `Nav.tsx`, `Feedback.tsx` | טאב "רעיון/באג" → `openFeedback()`. |
| F3 | מה ששייך להגדרות — בהגדרות, לא ב"עוד" | `MoreSheet.tsx` ThemeToggle | הסרה מ-MoreSheet. |
| F4 | ב"עוד" לא מופיעים המודולים שבסרגל | `MoreSheet.tsx` MORE_PAGES כולל inventory | סינון לפי NAV_PAGES. |

## G · התראות (P1)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| G1 | מה שלחצתי נשמר ויורד; איגוד לפי נושא; סיכום מלאי; צבירה לפי תאריך; ביקור אחד = התראה אחת | `Alerts.tsx`, `alerts.ts` | `groupAlerts(rows)` טהור: לפי `(ref_id, reason, date)`; seen על הקבוצה; שנקראו מוסתרות כברירת מחדל. |

## H · מלאי / הזמנות (P1)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| H1 | הזמנות שנגמרו לא ברשימה כברירת מחדל | `07-orders.js invRenderOrders` | ברירת מחדל: פתוחות; מתג "הצג סגורות". |

## I · צריבות — תוכן וניסוח (P1–P2)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| I1 | לחיצה על שורת צריבה לא עושה כלום | `24-meter-burns.js` טבלה, `Burns.tsx` rows | `onclick` על השורה → כרטיס מונה. |
| I2 | "מוכן לעיסוק" — אין סטטוס כזה. נצרב → "נצרב"; ללא גנרטור → "נצרב · ממתין לשיבוץ גנרטור" | `24-meter-burns.js:71,260`, `lib/burns.ts:84` | לייבל לפי `generator_id`. עדכון goldens. |
| I3 | בעיה שהוזנה — לאן? אפשרות לפתוח תקלה ב-EMS עם תיאור, מונה, כתובת, מערכת, גנרטור | `Burns.tsx issueOne` (prompt → note) | Sheet "דיווח בעיה" + מתג "פתח משימה ב-EMS" → `sigma.createTask`. |
| I4 | PP = תלת-פאזי, CT = משנה זרם — אייקונים מתקשרים | `🔌 PP` / `🧲 CT` | "⚡ תלת-פאזי" / "🔁 משנה זרם". |
| I5 | Excel: גיליון לכל קיבוץ; עמודות: מונה, סוג, כתובת, מערכת, סטטוס | `B.xlsxSpec` | ספק חדש לפי site. |

## J · סיכום ביקור (P1–P2)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| J1 | כותרת אחת "משך ותאריך הביקור"; שדה 1.5 = placeholder "הזנה ידנית" | `index.html` visit form | איחוד labels. |
| J2 | מוצרים לפי תחומים; "מונים" כותרת ואז גריד 3 עמודות, a-b-c, לשמאל; לחיצה → כמות על התא; חוזר לכותרת+כמות; לחיצה שוב → שינוי או 🗑 | `09-visits.js renderProductsForVisitor` | `renderProductGrid` legacy JS. |
| J3 | להסיר "יורד מהמלאי" | `index.html:754` | הסרה. |
| J4 | מוצרים נוספים: חיפוש + הצעה; אין → הצעה לקטלוג; גם בלי אישור → בועה עם כמות | `#visitProductsOther` | datalist + ad-hoc bubble. |
| J5 | להסיר "הסיכום יישלח כתגובה"; חובה איש קשר מלווה; חדש נשמר ל-`site_contacts` | `index.html`, `saveVisit` | צ'יפים + חסימת שמירה. |
| J6 | אזור חובה חסר → הבהוב אדום, כוכבית, מסגרת; "שמור" → גלילה לראשון החסר | `saveVisit` | `visitRequiredCheck()` + `.sig-req-miss`. |

## K · מיתוג, ניסוח ועיצוב (P2)

| # | הערה | קוד | ביצוע |
|---|------|-----|-------|
| K1 | אייקון עם מסגרת "תפעול"; שם **Sigmatec Operations** בכל מקום | `manifest.webmanifest`, `<title>`, `.brand`, footer | manifest + title + brand; אייקון מ-`sigma_crop.png`. |
| K2 | humanizer על כל טקסט | כל UI | סוויפ מתועד ב-`docs/reports/2026-09-22-copy-sweep.md`. |
| K3 | impeccable על כל מודול | | audit+polish; `impeccable detect` בסוף. |
| K4 | דף שגיאה: סטטוס + הגשת באג עם לוגים ולחיצות | `Feedback.tsx`, `track.ts` | `ErrorBoundary` + `window.onerror` → "משהו נשבר · דווח" עם 50 אירועים אחרונים. |

---

## סדר ביצוע

1. **P0 ניווט**: A1, A2, A5, A3+A7, A4.
2. **P1 ניקוי**: C1, C2, C4, B6, B7, B4, D7, D8, D9, F1–F4, H1, J3, J5-הודעה, K1.
3. **P1 כרטיס**: D1, D3, D4, D5, D6, D12; I1, I2, I4, I5; G1.
4. **P2 עיצוב/ניסוח**: B1, B2, B3, B5; J1, J2, J4, J5, J6; K2, K3, K4.
5. **P3 פיצ'רים**: A6, E1, E2, I3, D13 (נתונים — לאישור).
6. build → tests → dev preview → הודעה לסשן QA → QA מלא → dev→main.

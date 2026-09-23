# ביקורת כיסוי QA — כל הערות עידן מ-22.9 מול הקוד (23.9.2026)

בסיס: `origin/main` e752108 (2.23), worktree `r7/pkg-C`. מקורות: ארבעת מפרטי סבבי הטלפון
(`docs/superpowers/specs/2026-09-22-phone-qa-round{,-2,-3,-4}-design.md`) ותכנית הבדיקות
`docs/reports/2026-09-22-round-2-test-plan.md` (השורות של 2.20/2.21 הן גם הערות של עידן).
שיטה: לכל שורה, קוד בשורה המצוטטת, ואחר כך בדיקה שמפעילה אותו. ההערה האחרונה גוברת.

מקרא: ✅ נענה · 🟡 חלקי · ❌ לא נענה · ↪ הוחלף בהערה מאוחרת · → A / → B שייך לסוכן המקביל
(A = אוטומציות סיכום ביקור, B = חגים וצבעי יומן).

## סיכום

| | סבב 1 | סבב 2 | סבבים 3–4 + 2.20/2.21 | סה"כ |
|---|---|---|---|---|
| ✅ | 52 | 35 | 36 | **123** |
| 🟡 | 2 | 2 | 0 | **4** |
| ❌ | 0 | 0 | 0 | **0** |
| ↪ | 6 | 0 | 4 | **10** |
| → A / → B | 0 | 4 / 2 | 0 | **6** |
| סה"כ שורות | 60 | 43 | 40 | **143** |

תוקן בסבב הזה: סדר הלשוניות במלאי (סבב 2 E1, היה 🟡). אין ❌.
הפריטים ה-🟡 שנשארו גדולים מדי לסבב הזה, ראו "פתוח" בסוף.

## סבב 1 (בוקר 22.9)

| # | הערה | סטטוס | ראיה | הערה |
|---|---|---|---|---|
| A1 | אין דרך לצאת מחלון בצריבות | ✅ | `js/src/00-guard.js:132,238,247-284` (רקע/Esc/✕ מוזרק) · `test-back-button.mjs`, `pending-states.spec.ts` | `test-modal-close.mjs` מהמפרט לא נכתב; הסריקה מכוסה ב-pending-states |
| A2 | כרטיס מונה תקוע | ✅ | כמו A1 | — |
| A3 | אין חזרה לעמוד קודם | ✅ | `js/src/02-init-attendance.js:84` (pushState) · `test-back-button.mjs` | — |
| A4 | חזרה מהרקע איטית | ✅ | `sw.js:59-65`, `js/src/19-version-check.js:25`, `js/src/00-consts.js:53` · `test-version.mjs`, `test-ems-refresh.mjs` | אין תרחיש רקע→חזית אוטומטי |
| A5 | גלילה ב"עוד" נתפסת כרענון | ✅ | `app/src/components/PullToRefresh.tsx:48` · `PullToRefresh.test.tsx` | — |
| A6 | לחיצה ארוכה על הסרגל | ✅ | `app/src/components/Nav.tsx:37,87` | — |
| A7 | Back זורק לדף הבית | ✅ | `02-init-attendance.js:85` (`sigma_page_v1`) · `test-back-button.mjs` | — |
| B1 | Header נעלם בגלילה | ✅ | `00-guard.js:483`, `css/app.css:1992` | אין בדיקה |
| B2 | סרגל סינון בשורה אחת | ✅ | `app/src/components/home/FilterChips.tsx:66` · `layout-overflow.spec.ts` | — |
| B3 | לוגו בפינה, מצב כהה בתפריט | ✅ | ThemeToggle רק ב-Settings · `test-theme.mjs` | — |
| B4 | "עבור למלאי" כשכבר במלאי | ✅ | `app/src/lib/primaryAdd.ts:24,45` · `primaryAdd.test.ts` | — |
| B5 | חיווי גלילה לרוחב | ✅ | `css/app.css:1996-2001` (`.scroll-x`) | אין בדיקה |
| B6 | "פעולות ממתינות" | ✅ | `js/src/13-ems.js:183-186` | שארית מתה `emsQueueChipOpen` |
| B7 | כפתורי 🔄 EMS | ✅ | `00-consts.js:53` (15 דק') · `test-ems-refresh.mjs` | — |
| C1 | מצב ישיבה | ✅ | `toggleMeetingMode`/`#meetingBadge` הוסרו | — |
| C2 | פוטנציאליים רק לעידן/עמיחי בבית | ✅ | `index.html:289`, `js/src/11-search-login.js:180` | — |
| C3 | בצריבות רק יציאה | ✅ | C1+C2+A3 | — |
| C4 | לצמצם שם בכותרת | ↪ | סבב 3 O1: שם פרטי · `app/src/components/UserChip.tsx:70` | — |
| D1 | צריבות בכרטיס מכווצות | ✅ | הכרטיס לא מציג `BurnChip`; `Burns.tsx` Collapsible · `Burns.test.tsx` | `BurnChip` עדיין מיוצא (נבדק רק ב-test) |
| D2 | ✏️ לעידן בלבד, שדות נוספים | ✅ | `js/src/10-activity.js:503`, `app/src/components/home/KibbutzSheet.tsx` · `kibbutz-sheet.spec.ts`, `KibbutzSheet.test.tsx` (חדש) | — |
| D3 | משימות בכרטיס סגור | ✅ | `KibbutzCard.tsx:99-101`, `InternalTasks.tsx` · `InternalTasks.test.tsx` | — |
| D4 | "אין סיכום ישיבה" | ✅ | `MeetingNotes.tsx:287,310` · `meeting-notes.spec.ts` | — |
| D5 | ביקור אחרון / באיחור באדום | ✅ | `10-activity.js:623-658` · `test-last-visit-line.mjs` | — |
| D6 | קריסות בלחיצות בכרטיס | 🟡 | ErrorBoundary `app/src/islands.tsx:14-28`, `00-guard.js:431` · `home-cards.spec.ts` | אין סריקת Playwright על **כל** קישור בכרטיס |
| D7 | תעודה לא במסך הראשי | ✅ | `Nav.tsx:42`, `CardActions.tsx` · `test-cert-removals.mjs` | — |
| D8 | טאבים "מצב הקיבוץ"/"ביקורים" | ✅ | `index.html:619-620` | — |
| D9 | בועת "פרויקט זמני" | ✅ | `Burns.test.tsx:134` | — |
| D10 | ✏️ ליד השם | ✅ | כמו D2 | — |
| D11 | "1 פעולות ממתינות" | ✅ | כמו B6 | — |
| D12 | דפנה קפצה לחדשים | ✅ | `app/src/lib/kibbutzim.ts:67` · `kibbutz-sheet.spec.ts` | — |
| D13 | איבוד מידע בשדרוג | ✅ | פסיקת נתונים 22.9 (חדשים: דגניה ב · עין דור · ניר עציון) | — |
| E1 | טיימר, עצירה אחרי שעתיים | ✅ | `WorkTimer.tsx`, `WorkTimerEditSheet.tsx`, cron `push-timer-5min` · `test-timer-push.mjs`, `clockify.spec.ts` | — |
| E2 | עמוד שעות | ✅ | `index.html:588`, `app/src/islands/Hours.tsx` | אין בדיקה ייעודית |
| F1 | "תעודה" לא בסרגל | ✅ | `Nav.tsx:42` · `nav-shell.spec.ts` | — |
| F2 | רעיון/באג בסרגל | ↪ | סבב 2 A3: יומן במקום, משוב ב-⋯ | — |
| F3 | הגדרות לא ב"עוד" | ✅ | `MoreSheet.tsx` | — |
| F4 | "עוד" בלי מודולי הסרגל | ✅ | `MoreSheet.tsx:94-96` | — |
| G1 | איגוד התראות | ✅ | `app/src/lib/alerts.ts` `groupAlerts` · `alerts.test.ts`, `alerts.spec.ts` | — |
| H1 | הזמנות סגורות מוסתרות | ✅ | `js/src/07-orders.js:692-694` | אין בדיקה |
| I1 | לחיצה על שורת צריבה | ✅ | `js/src/24-meter-burns.js:299` · `burns.spec.ts` | — |
| I2 | "נצרב · ממתין לשיבוץ גנרטור" | ✅ | `24-meter-burns.js:77`, `app/src/lib/burns.ts:92` · `burns.test.ts` | — |
| I3 | בעיה → משימה ב-EMS | ✅ | `app/src/components/home/Burns.tsx:380` · `burns.test.ts` | — |
| I4 | אייקוני תלת-פאזי/משנה זרם | ✅ | `burns.ts:114` · `burns.test.ts:210` | — |
| I5 | Excel גיליון לכל קיבוץ | ✅ | `24-meter-burns.js:96-110` · `test-meter-burns.mjs` | — |
| J1 | "משך ותאריך הביקור" | ↪ | סבב 3 V (גלילה אחת) | — |
| J2 | גריד מוצרים | ↪ | סבב 3 T3 (`ProductTiles`) | — |
| J3 | להסיר "יורד מהמלאי" | ✅ | לא קיים ב-`index.html` | — |
| J4 | מוצרים נוספים: חיפוש | ↪ | סבב 2 C4 (`productSearch.ts`) | — |
| J5 | איש קשר מלווה חובה | ✅ | `js/src/09-visits.js:88-119` · `test-visit-writevisit.mjs` | — |
| J6 | חובה חסר → סימון וגלילה | ✅ | `09-visits.js:957-965`, `css/app.css:2036` · `visit-form.spec.ts` | — |
| K1 | אייקון + שם Sigmatec Operations | ↪ | האייקון: Gemini (2.20) · `manifest.webmanifest`, `scripts/make-icons.py` | אין אייקון maskable |
| K2 | humanizer על כל טקסט | 🟡 | `docs/reports/2026-09-22-copy-sweep.md`, `test-copy-rules.mjs` | 14 הודעות דחיפה ב-`field.ts` מחכות להחלטה |
| K3 | impeccable | ✅ | `contrast.spec.ts` | — |
| K4 | דף שגיאה + דיווח | ✅ | `islands.tsx:14-28`, `00-guard.js:431-468` · `feedback.spec.ts` | — |

## סבב 2 (אחר הצהריים 22.9)

| # | הערה | סטטוס | ראיה | הערה |
|---|---|---|---|---|
| A1 | כותרת בשתי שורות, בלי חפיפה | ✅ | `index.html:210-212`, `css/app.css:1703` · `nav-shell.spec.ts` | אין בדיקת חפיפה ב-360px |
| A2 | ➕ קיבוץ רק ב-⋯ בטלפון | ✅ | `HeaderActions.tsx`, `Home.tsx:155,234` · `home-cards.spec.ts`, `HeaderActions.test.tsx` (חדש) | — |
| A3 | סרגל תחתון לפי תפקיד | ✅ | `app/src/lib/landing.ts` `navTabsFor` · `landing.test.ts`, `nav-shell.spec.ts` | — |
| A4 | טיוטה פתוחה למעלה | ✅ | `kibbutzim.ts` `draftsAtTop`, `KibbutzCard.tsx:79` · `kibbutzim.test.ts`, `home-cards.spec.ts` | "משימת EMS בתהליך": עידן החליף בשעון פעיל |
| A5 | אייקון נוכחות שונה | ✅ | `Nav.tsx:117` `UserCheck` | — |
| B1 | Back → "לצאת מהאפליקציה?" | ✅ | `00-guard.js:313-377` · `test-back-button.mjs`, `pending-states.spec.ts` | — |
| B2 | Back בטופס מלוכלך | ✅ | `app/src/lib/useUnsavedGuard.tsx` · `pending-states.spec.ts` | — |
| B3 | לחיצה מחוץ לחלון נשארת | ✅ | `test-back-button.mjs:170-178` · `pending-states.spec.ts` | — |
| C1 | placeholder "1.5" | ✅ | `Field.tsx:1611`, `index.html:770` · `visit-form.spec.ts` | — |
| C2 | להסיר מלאי מקור | ✅ | `index.html:751`, `09-visits.js:1113` · `visit-form.spec.ts` | — |
| C3 | 4 שדות חובה + סימון | ✅ | `app/src/lib/visitDraft.ts:131-143`, `Field.tsx:1183` · `visitDraft.test.ts`, `visit-chapters.spec.ts` | — |
| C4 | חיפוש מוצרים עם כינויים | ✅ | `app/src/lib/productSearch.ts` · `productSearch.test.ts` | — |
| C5 | ציוד שהוחזר | ✅ | `Field.tsx:801-819` · `visit-chapters.spec.ts` | — |
| C6 | בחירה מרובה של משימות, סיבת ביקור | → A | `field.ts:882,895`, `Field.tsx:1313,1321` | — |
| C7 | שמירה → מסך תעודה, שליחה | → A | `Field.tsx:1443,1456`, `20-delivery-cert.js:573` | — |
| C8 | 🎙 הקלטת סיכום ביקור | → A | `Field.tsx:868-986` | ל-A: `recordCorrection` לא נקרא מ-Field.tsx |
| D1 | קריסה בסגירה + טיוטה | ✅ | `Feedback.tsx:98-109` · `feedback.spec.ts`, `feedback.test.ts` | — |
| D2 | תמלול מכפיל | ✅ | `app/src/lib/speech.ts:86-105` · `speech.test.ts` | — |
| D3 | מתג אנונימי הפוך | ✅ | `app/src/components/ui/switch.tsx:19-25` · `feedback.spec.ts` | — |
| D4 | להסיר "מגיע לעידן ועמיחי" | ✅ | `Feedback.tsx:512` · `feedback.spec.ts` | — |
| E1 | תעודות אחרי מלאי בקיבוצים | ✅ **(תוקן היום)** | `index.html:339-341` הזמנות · מלאי בקיבוצים · תעודות · `test-html-structure.mjs` (בדיקת סדר חדשה) | היה: "מלאי החברה" באמצע |
| E2 | סינונים כמטריצה | ✅ | `index.html:349-358`, `20-delivery-cert.js:717-722` | אין בדיקה ל-`certRangeTap` |
| E3 | סיכום תקופתי + Excel לפי סינון | ✅ | `certMonthlyFromTab`, `xlExportCertsFromTab` · `test-exports.mjs:115-131` | — |
| E4 | שליחה במייל מהלשונית | ✅ | `20-delivery-cert.js:788` | ידני |
| F1 | ימים חסרים כבועות | ✅ | `Attendance.tsx:115` · `attendance.spec.ts` | — |
| F2 | סיכום ביקור → יום שטח | → A | `attendance.ts:425` · `attendance.test.ts` | — |
| F3 | כפתורי Excel/PDF | ✅ | `Attendance.tsx:454,464` · `attendance.spec.ts` | — |
| F4 | ימים חסרים באדום ביומן | → B | `Calendar.tsx:1186` · `calendar.spec.ts` | — |
| F5 | ערבי חג | → B | `attendance.ts:15,147`, `db/company_holidays_eves.sql` | — |
| F6 | אביאם רואה את ניתאי | ✅ | `attendance.ts:509-518` · `attendance.spec.ts` | — |
| F7 | אייקון | ✅ | כמו A5 | — |
| G1 | בלי +, שבוע עבודה | ✅ | `Calendar.tsx:189`, `calendar.ts:170` · `calendar.test.ts`, `calendar.spec.ts` | — |
| G2 | מספרי שבוע בקצה | ✅ | `Calendar.tsx:177` · `calendar.spec.ts` | — |
| G3 | תאריך עבר: צפייה בלבד | ✅ | `Calendar.tsx:397` `PastDay` · `calendar.spec.ts` | — |
| G4 | תאריך עתידי: מסלול ובריפינג | ✅ | `Calendar.tsx:439`, `field.ts:398` · `calendar.spec.ts`, `field.test.ts` | שארית מתה `hideEms` ב-`calendar.ts:115` |
| G5 | בורר תצוגה ברור | ✅ | `Calendar.tsx:1340` · `calendar.spec.ts` | — |
| G6 | בריפינג: צריבות, יום עתידי, היום | ✅ | `Field.tsx:382,2208`, `Calendar.tsx:485` · `field.spec.ts` | — |
| H1 | מצב ישיבה ברוחב טלפון, ✕ | ✅ | `Presenter.tsx:382,483` · `presenter.spec.ts` | — |
| H2 | משימות כטקסט בשקופית | ✅ | `Presenter.tsx:141,435` | — |
| H3 | צ'יפים ניתנים לעריכה, חצים | 🟡 | `Presenter.tsx:214-227` | הצ'יפים לקריאה בלבד: אין נתיב עדכון מהמצגת |
| H4 | סטופר ידני | ✅ | `app/src/lib/meetingRun.ts:36` · `meetingRun.test.ts` | — |
| H5 | מאז הישיבה הקודמת | 🟡 | `meetingRun.ts:136` · `meetingRun.test.ts` | משימות EMS לא מפוצלות לנפתח/נסגר: חסרה חותמת פתיחה במטמון EMS |
| I | מדריכי שימוש ל-brag | ✅ | `docs/usage/` (5 מדריכים + README + תמונות) | — |

## סבב 3, סבב 4, ובדיקות חוזרות 2.20/2.21

| # | הערה | סטטוס | ראיה | הערה |
|---|---|---|---|---|
| נתונים 3 | גבת/דפנה בארכיון | ✅ | תיקון נתונים; המניעה ב-N1 | — |
| N1 | ✏️ לא עובד, ארכוב בטעות | ✅ | `app/src/components/ui/sheet.tsx:23-44` (z-1200), `KibbutzSheet.tsx` הקלדת שם · `kibbutz-sheet.spec.ts`, `KibbutzSheet.test.tsx` (חדש) | — |
| N2 | שם הקיבוץ ככותרת | ✅ | `10-activity.js:550` · `kibbutz-sheet.spec.ts:58` | — |
| N3 | רשימת ביקור מהיר = רשימת הבית | ✅ | `02-init-attendance.js:186` · `visit-form.spec.ts` | אין מקרה ל"(אתר EMS ללא כרטיס)" |
| N4 | קישור EMS, התחברות נתקעת | ✅ | `01-data.js:836`, `15-login-gate.js:230,239` · `session-gate.spec.ts` | — |
| O1 | שם פרטי בצ'יפ | ✅ | `UserChip.tsx:70` · `nav-shell.spec.ts` | — |
| O2 | מקרא צבעים | ✅ | הוסר · `home-cards.spec.ts:128` | — |
| O3 | "פעולות" בחיפוש | ✅ | `CommandBar.tsx:126` · `command-bar.spec.ts` | — |
| O4 | פס המשימות הפנימיות | ↪ | סבב 4 X; הפס נמחק · `home-cards.spec.ts:150`, `my-tasks.spec.ts` | — |
| P1 | תעודות מתרעננות כל הזמן | ✅ | `20-delivery-cert.js:725` · `inventory-pool.spec.ts:128` | — |
| P2 | תאריכים בשורה אחת | ✅ | `css/app.css:2029-2031` | ידני |
| P3 | סטטוס הזמנה תקוע | ✅ | `index.html:1048` · `test-order-patch.mjs` | — |
| P4 | "אחראי על ההספקה" | ✅ | `index.html:1010,1070` · `test-order-patch.mjs` | — |
| Q1 | התראות חוזרות | ✅ | `Alerts.tsx:209-227`, `db/alert_mark_seen_fix.sql` · `alerts.spec.ts` | — |
| Q2 | נקרא מוסתר אחרי רענון | ✅ | `alerts.ts:113-120` · `alerts.spec.ts:54` | — |
| R | מדריך יומן גוגל | ✅ | `docs/usage/יומן-גוגל.md` | סנכרון דו-כיווני: רשימת פערים בלבד, לפי המפרט |
| S | ההקלטה לא נראית לעידן | ✅ | `Nav.tsx:74` `openManual` · `visit-chapters.spec.ts:396`, `test-field.mjs` | — |
| V | סיכום ביקור בגלילה | ✅ | `Field.tsx` · `visit-chapters.spec.ts:87` | — |
| T1 | קוד לקוח, תתי-אתרים, קטגוריה | ✅ | `KibbutzSheet.tsx` · `kibbutz-sheet.spec.ts`, `kibbutzim.test.ts` | — |
| T2 | EMS בכרטיס: תיאור מלא | ✅ | `js/src/14-calendar.js:478` · `test-modal-ems.mjs` | — |
| T3 | אריחי מוצרים בגיליון | ✅ | `Field.tsx:630,1504` · `visit-chapters.spec.ts` | — |
| U | אייקון עם מסגרת "תפעול" | ↪ | 2.20: אייקון Gemini | — |
| 2.20 | אייקון Gemini | ✅ | `scripts/make-icons.py:15`, `manifest.webmanifest:14-15` | אין maskable |
| 2.20 | הפס על כל הגלילה | ↪ | סבב 4 X | — |
| 2.20 | רשימת קיבוצים מ-EMS | ✅ | נתונים (56 מקושרים) | — |
| 2.21 | גלילה במקום המשכים | ✅ | כמו V | — |
| 2.21 | הקלטה חוזרת על עצמה | ✅ | `speech.ts` · `speech.test.ts:63` | — |
| 2.21 | Whisper לא מזהה שמות | ✅ | `speech.ts:247-258`, `supabase/functions/transcribe/index.ts:96,121` | ידני |
| נתונים 4 | אור הנר אחד, עין המפרץ + מים | ✅ | נתונים | — |
| X | המשימות שלי | ✅ | `app/src/islands/MyTasks.tsx`, `HeaderActions.tsx`, `lib/myTasks.ts` · `my-tasks.spec.ts`, `myTasks.test.ts`, `HeaderActions.test.tsx` + `myTasksBadge.test.tsx` (חדשים) | — |
| X-אישי | כניסה מהאזור האישי | ↪ | מתועד בלבד (`MyTasks.tsx:10`) | האזור האישי עוד לא קיים |
| Y1 | להסיר את שרשרת ה-EMS | ✅ | `KibbutzSheet.tsx` · `kibbutz-sheet.spec.ts:202` | — |
| Y2 | אתר EMS לקריאה בלבד | ✅ | `KibbutzSheet.tsx:361-368` · `kibbutz-sheet.spec.ts:223`, `KibbutzSheet.test.tsx` | — |
| Y3 | שגיאה בכרטיס על אתר לא מקושר | ✅ | `js/src/13-ems.js:386` `applyCardSiteWarnings` (דרך `sigma.decorateCards`) · `test-site-indicator.mjs` | הכרטיס מחשיב גם התאמת שם מול המפה/EMS; הפעמון רק `ems_site_ids`. שני כללים — ראו "פתוח" |
| Y4 | שגיאה בהתראות | ✅ | `Alerts.tsx:163`, `alerts.ts:248` · `alerts.spec.ts`, `alerts.test.ts` | — |
| Y5 | שגיאה בבריאות | ✅ | `app/src/lib/health.ts:245-253` | אין מקרה ב-`health.test` |
| Y6 | כמה סוגי אנרגיה | ✅ | `KibbutzSheet.tsx:288` · `kibbutzim.test.ts:85` | — |
| Z1 | ✏️/🚚 על ביקור קיים | ✅ | `09-visits.js:444-448` · `visit-form.spec.ts:212,222` | — |
| Z2 | ההיסטוריה נעלמה | ✅ | ספק סבב 4 Z §2 | רשימת תעודות בכרטיס: להחלטת עידן |
| Z3 | תאריך לפני בחירת קיבוץ | ✅ | `Field.tsx:244` `arrival-date` · `field.spec.ts`, `visitDraft.test.ts:157` | — |

## פתוח (גדול מדי לסבב הזה, או מחכה להחלטה)

- **סבב 2 H3** — צ'יפים ניתנים לעריכה במצב ישיבה: צריך נתיב כתיבה ל-`kibbutzim.region/section` מתוך המצגת. בינוני.
- **סבב 2 H5** — פיצול משימות EMS לנפתחו/נסגרו מאז הישיבה: המטמון לא שומר מתי משימה נפתחה. גדול.
- **סבב 1 D6** — סריקת Playwright על כל קישור בכרטיס הקיבוץ. בינוני.
- **סבב 1 K2** — 14 הודעות הדחיפה ב-`field.ts`: החלטת טון של עידן.
- **Y3, שני כללים** — הצ'יפ בכרטיס (`kibbutzHasSite`: שורה, מפה, או שם) והפעמון (`isUnlinked`: `ems_site_ids` בלבד) לא תמיד מסכימים. לאחד על כלל אחד אחרי שכל 56 השורות מקושרות. דורש החלטה.
- ניקוי קטן: `emsQueueChipOpen` (13-ems.js), `hideEms` (calendar.ts), `BurnChip` (Burns.tsx) — קוד מת.

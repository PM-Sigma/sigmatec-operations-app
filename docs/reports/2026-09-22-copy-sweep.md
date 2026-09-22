# סוויפ ניסוח (humanizer) — 22.9.2026

הכלל שהוחל: [blader/humanizer](https://github.com/blader/humanizer) v3 על טקסט שמופיע למשתמש.
שלושת הדפוסים שנמצאו באפליקציה, לפי סדר תפוצה:

1. **§8 קו מפריד כמחבר אוניברסלי** (` — `). ~180 מחרוזות בקוד (89 ב-`app/src`, 92 ב-`js/src`) ו-22 בטקסט הגלוי של `index.html`. הכלל: נקודה כשהחצי השני הוא הוראה ("נסה שוב", "אפשר להקליד", "רענן"), פסיק כשהוא המשך המשפט, נקודתיים כשהוא פירוט, נקודה אמצעית (·) בכותרות סטטוס.
2. **§12/§4 "דיבור מערכת"** — משפטים שמסבירים את המכניקה במקום את המצב של המשתמש ("המערכת לומדת מכל הזמנה", "יורד מהמלאי", "הסיכום יישלח כתגובה במשימה", "גרסת בנייה — עולה בכל העלאת גרסה"). `test-copy-rules.mjs` כבר אוסר חלק מהמילים; ההערות של עידן מ-22.9 הוסיפו שלוש נוספות.
3. **§20 כותרות מקושטות** — אימוג'י בכל כותרת. לא שונה בסבב הזה: זו שפת העיצוב של האפליקציה (spec §6), והשינוי דורש החלטה.

## מה תוקן בסבב הזה (41 מחרוזות)

- `index.html`: כל 22 המשפטים עם קו מפריד בטקסט הגלוי (מודל עריכת נוכחות, זרימת הזמנה, קליטת הזמנה, שער הצפייה, דוחות, טופס ביקור). שלושה משפטי מערכת הוסרו או קוצרו: "המערכת לומדת מכל הזמנה…", "גרסת בנייה — עולה בכל העלאת גרסה", "👋 ברוך הבא — מי אתה?" → "👋 מי אתה?".
- טופס הביקור (הערות J1/J3/J5): "יורד מהמלאי" ו"הסיכום יישלח כתגובה במשימה" הוסרו; כותרת אחת "משך ותאריך הביקור".
- `Feedback.tsx` (7), `KibbutzSheet.tsx` (2), `UserChip.tsx`, `Settings.tsx`, `TranscribeRetry.tsx`, `authThrottle.ts`, `burns.ts` (2) + הבדיקות שהצמידו את הנוסח הישן (`Feedback.test.tsx`, `Burns.test.tsx`, `burns.test.ts`, `feedback*.spec.ts`, `transcribe-unavailable.spec.ts`, `test-viewer-gate.mjs`).
- צריבות (I2/I4): "מוכן לעיסוק" → "נצרב" / "נצרב · ממתין לשיבוץ גנרטור"; "PP"/"CT" → "תלת-פאזי"/"משנה זרם"; "פרויקט זמני" הוסר.

## סבב שני (22.9.2026, המשך באותו יום) — 170 מחרוזות

השלמת הטבלה "מה נשאר" מהסבב הראשון: כל שאר ה-` — ` בעברית ב-`app/src/**/*.ts(x)` (לא בדיקות) וב-`js/src/*.js`, לפי אותו כלל (נקודה לפני הוראה, פסיק להמשך משפט, נקודתיים לפני פירוט/ערך, · בכותרות סטטוס קצרות).

**שונו (170 מחרוזות, 60 קבצי מקור):**

| קבוצה | קבצים | מחרוזות |
|---|---|---|
| `app/src/components/home/*` | KibbutzSheet, MeetingNotes, OnboardingProgress, WorkTimer, WorkTimerStopSheet | 9 |
| `app/src/islands/*` | Attendance, Calendar, CommandBar, DayLog, FeedbackInbox, Field, Gaps, Holidays, Home, ImportNotes, InventoryStrip, MeetingReview, Presenter, Settings, StockChange, Usage | 37 |
| `app/src/lib/*` | attendance, daylogChain, gaps, health, kibbutzim, meetingReview, orderStrip, pending, speech, stockChange, supabase (הערת קוד), taskList | 18 |
| `js/src/*.js` (legacy) | 21 קבצים, `00`–`24` | 94 |
| בדיקות שעודכנו בעקבות נוסח חדש | `MeetingReview.test.tsx`, `Usage.test.tsx`, `attendance.test.ts`, `meetingReview.test.ts`, `orderStrip.test.ts`, `stockChange.test.ts`, `taskList.test.ts`, `test-delivery-cert.mjs`, `qa/playwright/tests/alerts.spec.ts`, `qa/playwright/tests/visit-chapters.spec.ts` | 12 |

**נשמר בכוונה (לא שונה):**
- `app/src/lib/field.ts` — 14 מחרוזות של הודעות דחיפה (טון שיווקי-מוטיבציוני, כמו בסבב הראשון). ההחלטה נשארת: דורש שיחת טון עם עידן, לא תיקון מכני של מקף. מוצמד גם ב-`field.test.ts` ומשוקף ב-`supabase/functions/push-send/field.ts` — אם ייערך, לערוך את שניהם יחד.
- `app/src/lib/meetingNotes.ts` שורות 87–88 (`'אור הנר — חשמל'`, `'אור הנר — גז'`) — אלה מפתחות בטבלת alias-ים (lookup), לא טקסט שמוצג למשתמש.
- כל ה-` — ` שנמצאו בתוך הערות קוד (`//`, `/* */`) — לא טקסט משתמש, לא נגעתי.
- `js/src/20-delivery-cert.js` שורות 983, 997 — טווח תאריכים (`${from} — ${to}`) הוא שימוש לגיטימי של מקף כמפריד טווח, לא מחבר משפטים; הושאר.
- `js/src/01-data.js` — נתוני MOCK/דמו (תיאורי משימות והערות לדוגמה), לא ניסוח שכתב הצוות; הושאר מחוץ לתחום.

דרך שעבדה: `grep` על ` — ` בעברית, סינון שורות קוד בלבד (לא הערות), מיפוי מפורש old→new לפי הכלל, `node build.mjs`, `npm test` (68 קבצי vitest + 50 ריצות legacy), ואז Playwright מלא (`--project=mobile-390-light`, פורט 8124) — 181 עברו, 2 מדולגים מראש. שלוש כשלים ראשונים (מחרוזות מוצמדות בדיקות: `כמות — <מוצר>` ב-`visit-chapters.spec.ts`, `הגיע — ...` ב-`alerts.spec.ts`) תוקנו ואז ירוק מלא.

## impeccable detect (K3) — ממצאים על הקבצים ששונו

117 ממצאים, כולם ברמת אזהרה, כולם קיימים מלפני הסבב (הקוד החדש לא הוסיף ממצא):

- `low-contrast` ×66 — סגנונות inline ב-`index.html` עם צבעי hex קבועים (`#334155`, `#64748b`, `#5b21b6`, `#9a3412`) שנבדקים מול רקע כהה. במצב כהה הם אכן חלשים. תיקון: להעביר לטוקנים (`var(--text-light)` וכו'). מומלץ לסבב עיצוב נפרד.
- `side-tab` ×24 — פסי צבע בצד כרטיסים (`border-right: 3px`), כולל `KibbutzCard` (`border-s-[3px]`). זו החלטת עיצוב של spec §2; להשאיר או לשנות ביחד.
- `dark-glow` ×10 — `box-shadow` צבעוני על רקע כהה (FAB, כפתורים).
- `undersized-ui-text` ×7 / `tiny-text` ×4 — טקסט 10–11px בצ'יפים.
- `em-dash-overuse` — 22 קווים ב-`index.html`: **טופל** בסבב הזה.
- `ai-color-palette` ×2 (סגול `#5b21b6` במודל האישורים של עמיחי), `marquee`, `layout-transition`, `gpt-thin-border-wide-shadow` — בודדים.

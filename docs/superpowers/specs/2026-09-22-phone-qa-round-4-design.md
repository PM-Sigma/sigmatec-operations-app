# סבב 4 — עידן, ערב 22.9.2026 (אחרי 2.21)

STATUS: ✅ SHIPPED (2.22, 22.9 night) — X, Y, Z merged; data merges applied.
Ground rules: as `2026-09-22-phone-qa-round-2-design.md` (source-only commits, own files, tests green, humanizer copy).

## נתונים (בוצע ב-Supabase, 22.9 21:20, Fable)
- אור הנר גז + אור הנר חשמל → שורה אחת **אור הנר**, `energy = {electric,gas,water}`, קוד 915. ההפניות (visits, site_contacts,
  kibbutz_details, requirements) הועברו לשם האחד. עין המפרץ: `{electric,water}`.
- כלל (עידן): לכל אתר יכולים להיות כמה סוגי אנרגיה. `energy` הוא מערך — הבחירה בגיליון היא מרובה (לוודא, Package Y).

## Package X — "המשימות שלי" (Opus)
עידן: "המשימות הפנימיות שלי" → **המשימות שלי**; כולל גם משימות EMS שלי; מסווג לפי קיבוצים ברשימה מסודרת ומעוצבת;
אייקון אחר (לא מנעול); נפתח מאייקון בכותרת ליד ההתראות (מימין), מ-⋯ עוד, ומהאזור האישי (עדיין לא קיים — לתעד בלבד);
מופיע גם ביומן; **הפס הצף נעלם מכל הדפים.**
- קיים: `app/src/lib/taskList.ts` (רשימה של היומן: EMS + פנימיות? לבדוק `ListTask`, `isMine`, `filterTasks`, `COMPANY_GROUP`),
  `Calendar.tsx` view `list`, `InternalTasks.tsx` (`MyInternalTasks`, `myOpen`), `PmToday.tsx` (mount ל-`#sigma-my-tasks`),
  `HeaderActions.tsx` (הפעמון), `MoreSheet.tsx`/`registry.ts`.
- לבנות: island `MyTasks` (Sheet מלא, `data-testid="my-tasks"`): קבוצות לפי קיבוץ (חברה ראשון, אחר כך א-ב), בכל קבוצה שורות
  EMS (כותרת · סטטוס · 📅 יעד · בועת עדיפות) ופנימיות (🔒 קטן בקצה, ✓ סימון בוצע), ריק = `EMPTY_LIST`. אייקון `ListTodo`.
  כותרת פותחת: כפתור ליד הפעמון ב-`HeaderActions` עם badge של מספר המשימות הפתוחות. שורת ⋯ עוד: `registerMoreItem({id:'my-tasks', label:'המשימות שלי', icon:'ListTodo'})`.
  היומן: המשימות הפנימיות שלי מופיעות ברשימה (view `list`) לצד ה-EMS, וב-חודש/שבוע ביום היעד שלהן אם יש `due`.
- למחוק: הפס הצף (`MyInternalTasks` + `.my-tasks-strip` CSS + `body.has-my-tasks` + `#sigma-my-tasks` mount → ה-placeholder נשאר ריק או נמחק
  מ-index.html + `PmToday.tsx`). לעדכן `home-cards.spec` (הבדיקה של הפס), `internal-tasks.spec`, `InternalTasks.test`.
- ספק: `qa/playwright/tests/my-tasks.spec.ts` (כותרת → גיליון → קבוצות → ✓ → היומן מציג).
- ✅ בוצע (Opus). **נקודות הכניסה:** `openMyTasks()` ב-`app/src/islands/MyTasks.tsx` הוא השער היחיד — קוראים לו כפתור ✅ ב-`HeaderActions` (עם badge מ-`lib/myTasksBadge.ts`), שורת `my-tasks` ב-⋯ עוד, האירוע הגולמי `sigma-open-my-tasks` ו-`window.sigmaOpenMyTasks` (דיפ-לינק/לגאסי); האזור האישי כשיגיע = שורה אחת שקוראת לאותה פונקציה. הכללים טהורים ב-`app/src/lib/myTasks.ts`, שכבת `internal` ביומן ב-`app/src/lib/calendar.ts`.

## Package Y — עריכת קיבוץ ללא שרשרת EMS + שגיאה על אתר לא מקושר (Sonnet)
עידן: "להעיף את השרשרת בדיקה מול ה-EMS. אני רוצה לקבל שגיאה אם יש אתר שלא מחובר ל-EMS — זה הדבר הכי לא תקין במערכת."
- `KibbutzSheet.tsx`: להסיר את שלבי ה-chain (`emsChain.ts`: `steps`, `setChain`, `allowUnlinked`, הודעות "מחפש אתר…"). השמירה
  כותבת את השורה כפי שהיא. שדה `ems_site_ids` נשאר (מוצג read-only כ-"אתר EMS: ✓ מקושר / ⚠️ לא מקושר").
- שגיאה: קיבוץ (kind=kibbutz או subsite, לא מארכב) עם `ems_site_ids = {}` → (1) בכרטיס: פס אדום "⚠️ לא מקושר ל-EMS" (קיים chip ב-`13-ems.js:393`
  — לוודא שהוא מוצג גם בכרטיס React `KibbutzCard`), (2) בהתראות (`Alerts.tsx`/`alerts.ts`): קבוצת "אתרים לא מקושרים ל-EMS" לעידן/עמיחי,
  נגזרת מהשורות (לא טבלה חדשה), (3) ב-`health.ts` אם יש ציון בריאות — סעיף.
- בחירת אנרגיה מרובה: `energy` toggle group — לוודא multi (`ToggleGroup type="multiple"`), golden ב-`kibbutzim.test`.
- ספק: `kibbutz-sheet.spec` (ללא chain, שמירה ישירה), `alerts.spec` (קיבוץ לא מקושר → התראה).

## Package Z — רגרסיות בכרטיס + תאריך בסיכום ביקור (Opus)
עידן: "כשאני נכנס לקיבוץ אני לא רואה יותר עריכה והפקת תעודת משלוח של דוח סיכום שכבר היה — היה תקין ושברת";
"אני מרגיש שכל ההיסטוריה של האפליקציה נעלמה"; "היה פעם בחירת תאריכים ואז גישה לקיבוץ — אין את בחירת התאריכים".
1. **✏️ ערוך / 🚚 תעודה על הביקור האחרון בכרטיס**: `index.html #lastVisitBox` (`editLastVisitBtn`, `certLastVisitBtn`, `visitsHistoryWrap`),
   `js/src/09-visits.js renderLastVisit`, נקרא מ-`10-activity.js:581`. לשחזר ב-Playwright כעידן על קיבוץ עם ביקורים (fixture: חוקוק)
   ולמצוא למה הקופסה/הכפתורים לא מוצגים (חשודים: `display:none` שלא מוסר, `currentKibbutzVisits` ריק אחרי שינוי שם/`ems_site_ids`,
   Package S ה-`#legacyVoiceHandoff` שהוכנס באמצע, Package N `#modalTitle`, ה-CSS של `.sig-frm`). לתקן + מקרה בדיקה.
2. **ההיסטוריה**: לוודא שבכרטיס מוצגים: היסטוריית ביקורים (`visitsHistoryWrap`), פגישות (`ModalMeetings`), תעודות, צריבות, משימות EMS —
   להשוות ל-`docs/superpowers/specs/2026-09-17-kibbutz-cards-redesign-design.md` (המפרט המקורי של הכרטיס) ולרשום כל סעיף שנעלם. לתקן.
3. **תאריך הביקור**: גיליון ההגעה (`Field.tsx` mode `arrival`) — לפני רשימת הקיבוצים שדה תאריך (`<input type="date">`, ברירת מחדל היום,
   `data-testid="arrival-date"`), נשמר ל-`ChapterDraft.date` ונכתב ל-`visits.date`. הטופס הישן כבר יש לו `visitDate`. golden ב-`visitDraft.test`.

### Z · דוח רגרסיה — למה ✏️ / 🚚 נעלמו (בוצע, Opus, worktree `r6/pkg-Z`)

**שחזור:** Playwright כעידן על חוקוק. עם הביקור שב-mock (2.9, בתוך החודש) — `#lastVisitBox` מוצג והכפתורים שם.
עם ביקור בן 62 יום (`SHEET_DATA.visits` מוזרע מחדש) — `getComputedStyle(#lastVisitBox).display === 'none'`,
`currentKibbutzVisits.length === 0`, וגם `#editLastVisitBox` שבטאב מצב הקיבוץ נעלם. זה הבאג.

**שורש:** `js/src/09-visits.js renderLastVisit` סינן לחלון של **31 יום אחורה** (`monthAgo`) לפני שהוא מחליט מה להציג.
קיבוץ שביקרו בו לפני חודשיים → `allForKibbutz = []` → `box.style.display = 'none'` → אין ✏️, אין 🚚, ואין
"📚 ביקורים קודמים" (וגם `editLastVisit()` הפך לno-op שקט). החלון עצמו עתיק (קדום ל-`0164c92`); מה שנשבר ב-22.9
הוא סבב 2, קומיט **`068cc63`**, שהוסיף לכרטיס את שורת "📍 ביקור אחרון · <תאריך>" (`lastVisitLine` ב-`10-activity.js`)
בלי שום חלון. מאז הכרטיס מבטיח סיכום שהמודל שלו מסרב לפתוח — בדיוק "דוח סיכום שכבר היה" שעידן דיווח עליו.
החשודים שבמפרט נבדקו ונפסלו: `#legacyVoiceHandoff` (`934743f`) הוא תוספת בלבד, `#modalTitle` (N) לא נוגע,
`.sig-frm` לא מסתיר, ו-`ems_site_ids` / שינוי שם לא נוגעים — הסינון הוא לפי `v.kibbutz` בלבד.

**תיקון:** הוסר החלון לגמרי, סיכום שקיים ניתן לעריכה בכל גיל. בנוסף, הכרטיס נפתח על טאב **מצב הקיבוץ**,
והקופסה ששם הייתה "לקריאה בלבד" — היא מקבלת את אותם שני כפתורים (`editLastVisitEditBtn` → `editLastVisitFromStatus()`
שעובר לטאב ביקורים וממלא את הטופס, `editLastVisitCertBtn` → `certFromVisit`), כי שם עידן מחפש אותם.
`editLastVisit()` כבר לא שותק כשאין ביקור. בדיקות: `visit-form.spec.ts`, שני מקרים.

### Z · סעיף 2 — מה המפרט מ-17.9 מציג והכרטיס לא

נבדק במודל של חוקוק כעידן (Playwright, 390 + 1440), מול `2026-09-17-kibbutz-cards-redesign-design.md` §3.3 / §4 / §5:

| סעיף במפרט | בכרטיס היום | הכרעה |
|---|---|---|
| בולטים מסיכומי ישיבות + היסטוריה (§3.3) | ✅ `#sigma-modal-meetings` | — |
| משימות EMS במלואן (§4) | ✅ `#modalEmsSection` (ב-mock אין משימות פתוחות; `ems-tasks.spec` ירוק) | — |
| 🔥 צריבות | ✅ `#sigma-burns-modal` | — |
| 🔒 משימות פנימיות | ✅ `#sigma-internal-modal` | — |
| מצב הקיבוץ (health) | ✅ `#sigma-health-modal` | — |
| דוח ביקור אחרון + ✏️/🚚 | ❌ נעלם לכל ביקור מעל 31 יום | **רגרסיה, תוקנה** (סעיף 1) |
| היסטוריית ביקורים (`visitsHistoryWrap`, עד 3 קודמים) | ❌ נעלמה מאותה סיבה | **רגרסיה, תוקנה** |
| 🚚 תעודת משלוח כפעולה על הכרטיס (§3.3) | אינו | **הוסר בהחלטה**: סבב 1, D7/F1 (לא במסך הראשי; רק בסיכום ביקור) |
| 🗓 ישיבות כפעולה על הכרטיס + שמות הטאבים (§3.3) | אינו; הטאבים היום מצב הקיבוץ / ביקורים | **הוסר בהחלטה**: סבב 1, D8 |
| רשימת תעודות שהופקו לקיבוץ | אינה בכרטיס; חיה במלאי → 🚚 תעודות משלוח | מעולם לא הייתה בכרטיס במפרט, לא רגרסיה. להחלטת עידן אם רוצים אותה שם |

### Z · סעיף 3 — תאריך בגיליון ההגעה

`Field.tsx` mode `arrival`: שדה `<input type="date" data-testid="arrival-date">` מעל רשימת הקיבוצים, ברירת המחדל היום,
נוסע ב-`VisitChaptersOpen.date` אל הטיוטה ומשם ל-`visits.date`. הכלל הוא פונקציה טהורה `openingVisitDate(stored, picked, today)`
(`app/src/lib/visitDraft.ts`, golden ב-`visitDraft.test.ts`): מה שכבר נכתב בטיוטה מנצח, אחריו התאריך שנבחר בהגעה, ורק אז השעון.
בדיקה: `field.spec.ts` — השדה מעל הרשימה, בחירת אתמול → `vc-date` נפתח על אתמול.

## סבב 5 · B — חגים וצבעי יומן

**שורש הבעיה 1 — חגים/ערבי חג/חוה"מ נעלמו:** `db/rls_2_00_lockdown.sql` (22.9 19:31) נעל את `company_holidays`
ל-`select ... to authenticated` (במקום `using(true)` הציבורי). קריאה שיוצאת לפני שה-pass של הגשר EMS→Supabase
מוטבע (`window._sbToken`) חוזרת `200` עם מערך **ריק** — לא `401` — כי RLS פשוט משמיט שורות לתפקיד שלא רשום במדיניות;
זה לא עובר דרך משפך "הפג תוקף" הרגיל. `attLoadHolidays()` (`js/src/04-attendance-daily.js`) שינן את ההבטחה הזאת
לצמיתות ב-`window.attHolidaysLoaded` — פעם אחת ריק, ריק לכל הסשן, גם אחרי שה-pass כן מוטבע. תוקן: הקריאה מחכה
ל-`sbEnsurePass()` לפני השליפה, ותוצאה ריקה בזמן ש-`window._sbPassPending` עדיין `true` לא ננעלת — הניסיון הבא
(לרוב כשנוכחות/יומן נפתחים שוב) שולף מחדש.

**שורש הבעיה 2 — אין ירוק ביומן:** `missingInView` (round 2, F-4·G) הוסיפה אדום ליום עבודה שלא דווח, אבל לא היה
מקביל חיובי. נוסף `reportedDaysFor` (`app/src/lib/attendance.ts`) — מראה `monthGrid` לימים עם שורה (שטח/משרד/אחר) —
ו-`reportedInView` (`app/src/lib/calendar.ts`), אותה צורה בדיוק כמו `missingInView` (שואל כל חודש שהרשת נוגעת בו,
חותך למה שעל המסך). `Calendar.tsx` מצייר `data-reported="1"` + נקודה ירוקה (`--att-field-ink`, אותו ירוק כמו נוכחות)
לצד `data-missing`, לחודש ולשבוע כאחד, לאדם המחובר בלבד (ליומן אין מתג אדם) — בדיוק כמו האדום. יום לא יכול להיות גם
אדום וגם ירוק בו-זמנית (`missingDaysFor` כבר מוציא כל מה שדווח).

בדיקות: `attendance.test.ts` (`reportedDaysFor`), `calendar.test.ts` (`reportedInView`, כולל בדיקה מפורשת שהסט הירוק
והאדום אף פעם לא חופפים).

## Not in this round
- אזור אישי (לא ממודל) — X מתעד בלבד.
- graphify של הריפו — שאלה של עידן; מוצע להריץ אחרי הסבב על `docs/` + `app/src/lib` + `js/src`.

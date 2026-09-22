# סבב 4 — עידן, ערב 22.9.2026 (אחרי 2.21)

STATUS: 🟡 OPEN — planned by Fable, executed by Opus/Sonnet agents in worktrees off `main` 84d7026 (2.21).
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

## Not in this round
- אזור אישי (לא ממודל) — X מתעד בלבד.
- graphify של הריפו — שאלה של עידן; מוצע להריץ אחרי הסבב על `docs/` + `app/src/lib` + `js/src`.

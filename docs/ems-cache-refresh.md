# 🔄 רענון מטמון EMS מהמחשב במשרד — runbook

`scripts/ems-cache-refresh.mjs` · spec §7k #10 · Task 20

> **אין בקובץ הזה שום סיסמה, טוקן או מפתח — ולעולם לא יהיה.** הוא מסביר אילו *שמות* משתנים
> למלא בקובץ `.env` מקומי (שאינו נכנס ל-git), לא מה למלא בהם.

---

## למה זה קיים

לוח המשימות של EMS מוצג על כרטיס הקיבוץ מתוך **תמונת מצב משותפת** אחת (`ems_cache`, שורה `id=1`).
את התמונה הזו מרענן רק דפדפן שמחובר ל-EMS. אביעם וניתאי בשטח לא מתחברים ל-EMS בכלל — הם רק
קוראים. לכן ביום שבו אף מנהל לא פותח את האפליקציה, כולם רואים את המשימות של אתמול.

הג'וב הזה הוא אותו דפדפן, בלי מסך, מהמחשב של עידן במשרד — עד ש-EMS ינפיק service token
ואפשר יהיה להעביר את הרענון לצד השרת (spec §7k #10, "Later").

בתוך האפליקציה יש את החצי השני של אותה החלטה: `js/src/13-ems.js` מרענן את התמונה ברקע מכל עמוד
כשיש חיבור — עם throttle של 5 דקות, משותף לכל הטאבים של אותו דפדפן.

---

## מה הוא עושה, בדיוק

| # | שלב | איך |
|---|------|-----|
| 1 | התחברות ל-EMS | `POST {EMS_API_BASE}/v1/auth/login/password` → `accessToken` |
| 2 | סריקת המשימות הפתוחות | `GET /v1/employee-tasks?page=N&take=200&status=…` לכל סטטוס פתוח, עד 20 עמודים — בדיוק כמו `emsSyncCache()` |
| 3 | מיפוי לשורה הרזה | `slimTask()` — **זהה** ל-`emsSlimTask` שב-`js/src/13-ems.js` (נעול ע"י `test-ems-refresh.mjs`) |
| 4 | הנפקת pass ל-Supabase | `POST {SUPABASE}/functions/v1/ems-auth` עם ה-EMS token |
| 5 | כתיבת התמונה | `POST /rest/v1/ems_cache?on_conflict=id` עם `Prefer: resolution=merge-duplicates` |

שלבים 4–5 הם בדיוק מה שהדפדפן עושה: `emsCacheWrite` **אינו** קריאה ל-Apps Script — `js/src/01-data.js`
מיירט אותה והופך אותה ל-upsert ל-Supabase, ומאז נעילת ה-RLS הוא דורש את ה-pass המאומת
(מפתח ה-anon הוא קריאה בלבד).

כתובת פרויקט Supabase ומפתח ה-anon (הציבורי) **נקראים מתוך `js/src/01-data.js`** בזמן ריצה, ולא
משוכפלים לסקריפט — כך פריסה מחדש מזיזה גם את הג'וב.

---

## התקנה חד-פעמית

### 1. `.env` מקומי

בשורש הפרויקט, לצד `package.json`, קובץ בשם `.env`. **הוא כבר ב-`.gitignore`** (יש על זה בדיקה
ב-`test-ems-refresh.mjs`, וגם gitleaks רץ בכל `npm run qa`).

```ini
# שורש הפרויקט / .env   ← לא נכנס ל-git, לא נשלח לאף אחד
EMS_EMAIL=<האימייל של עידן ב-EMS>
EMS_PASSWORD=<הסיסמה>
```

משתנים אופציונליים:

| מפתח | ברירת מחדל | מתי צריך |
|------|------------|----------|
| `EMS_TOKEN` | — | במקום אימייל+סיסמה. **הדרך היחידה אם לחשבון יש 2FA** (ראה למטה) |
| `EMS_API_BASE` | `https://api.sigmatec-ems.com` | סביבת בדיקות |
| `EMS_SYNCED_BY` | `משרד` | מה שמוצג באפליקציה כ"סונכרן ע"י" |
| `EMS_REFRESH_LOG` | `%LOCALAPPDATA%\Sigmatec\ems-cache-refresh.log` | לוג במקום אחר |

> ⚠️ **2FA.** אם חשבון ה-EMS מוגדר עם אימות דו-שלבי, EMS מחזיר `type: "2FA"` ושולח קוד למייל —
> ואין מי שיקליד אותו ב-07:30. הסקריפט עוצר עם קוד יציאה **3** והודעה מפורשת. שתי דרכים קדימה:
> (א) להדביק ב-`.env` טוקן מהתחברות אמיתית כ-`EMS_TOKEN` (מתיישן — פתרון זמני);
> (ב) לבקש מצוות EMS חשבון שירות בלי 2FA. **(ב) היא הדרך הנכונה.**

### 2. בדיקה יבשה — לפני שמתחברים בכלל

```powershell
cd C:\Users\idann\Projects\Sigmatec Operations App
node scripts/ems-cache-refresh.mjs --dry-run
```

הרצה יבשה **לא שולחת שום בקשה**: היא בודקת תצורה בלבד ומדפיסה מה הייתה עושה. בלי פרטי התחברות
היא מסיימת ב-0 ואומרת מה חסר.

בדיקת המיפוי בלבד, בלי רשת ובלי פרטי התחברות:

```powershell
node scripts/ems-cache-refresh.mjs --dry-run --fixture qa/fixtures/ems-tasks.json
```

### 3. הרצה אמיתית ידנית אחת

```powershell
node scripts/ems-cache-refresh.mjs
echo $LASTEXITCODE     # 0 = נכתב
```

פותחים את האפליקציה ובודקים ש"סונכרן ע"י" מראה את מה שהוגדר ב-`EMS_SYNCED_BY`.

### 4. Task Scheduler — כל 30 דקות, 07:00–20:00

מ-PowerShell **כמנהל** (החליפו את הנתיב אם הפרויקט יושב במקום אחר):

```powershell
$node   = (Get-Command node).Source
$script = "C:\Users\idann\Projects\Sigmatec Operations App\scripts\ems-cache-refresh.mjs"
schtasks /Create /TN "Sigmatec EMS cache refresh" /SC MINUTE /MO 30 /ST 07:00 /DU 0013:00 /K /RL LIMITED /F /TR "`"$node`" `"$script`" --quiet"
```

* `/SC MINUTE /MO 30` — כל 30 דקות
* `/ST 07:00 /DU 0013:00 /K` — חלון של 13 שעות מ-07:00, כלומר עד **20:00**, ואז נעצר (`schtasks` מצפה ל-`HHHH:MM`)
* `/RL LIMITED` — בלי הרשאות מנהל. הג'וב לא צריך אותן.
* `--quiet` — בלי פלט למסך; הכול הולך לקובץ הלוג

דרך ה-GUI (`taskschd.msc`) אותו דבר: Trigger יומי ב-07:00 · "Repeat task every 30 minutes" ·
"for a duration of 13 hours" · Action = `node.exe` עם נתיב הסקריפט כארגומנט · Start in = תיקיית
הפרויקט · "Run only when user is logged on".

**המחשב חייב להיות דלוק ומחובר.** זו המגבלה של הפתרון הזה, והיא הסיבה שהוא זמני.

בדיקה שהמשימה קיימת ומה היה הקוד האחרון:

```powershell
schtasks /Query /TN "Sigmatec EMS cache refresh" /V /FO LIST
schtasks /Run   /TN "Sigmatec EMS cache refresh"      # הרצה מיידית לבדיקה
```

---

## קודי יציאה

| קוד | משמעות | מה עושים |
|-----|--------|----------|
| **0** | רוענן (או הרצה יבשה שהסתיימה) | כלום |
| **1** | תקלה לא צפויה בסקריפט | לפתוח את הלוג, לשלוח את השורה האחרונה |
| **2** | תצורה — אין `.env` / אין פרטי התחברות / לא נקראו קבועי הלקוח | להשלים את `.env` (סעיף 1) |
| **3** | EMS דחה את ההתחברות — סיסמה שגויה, או 2FA | להחליף סיסמה ב-`.env`, או לעבור ל-`EMS_TOKEN` |
| **4** | מחובר, אבל סריקת המשימות נפלה | בדרך כלל זמני (רשת/EMS). אם חוזר — לבדוק את EMS |
| **5** | נסרק, אבל הכתיבה למטמון המשותף נכשלה | לרוב `ems-auth` או RLS. לבדוק שההתחברות באפליקציה עצמה עובדת |

---

## לוג

ברירת מחדל: `%LOCALAPPDATA%\Sigmatec\ems-cache-refresh.log` — **מחוץ לתיקיית הפרויקט**, כדי
שמשימה שרצה כל חצי שעה לא תלכלך את `git status`. שורה אחת JSON לכל הרצה, נחתך אוטומטית סביב
1MB (נשמרות 2000 השורות האחרונות).

```powershell
Get-Content "$env:LOCALAPPDATA\Sigmatec\ems-cache-refresh.log" -Tail 5
```

שורה של הרצה מוצלחת נראית כך (ללא סודות — רק סטטוסים ומספרים):

```json
{"at":"2026-09-19T07:30:02.114Z","mode":"live","base":"https://api.sigmatec-ems.com",
 "statuses":["new","in_progress","waiting_for_client","on_hold"],"ver":2,"syncedBy":"משרד",
 "envFile":".env found","credentials":"present","auth":"password sign-in",
 "pages":1,"stoppedBecause":"short-page","fetched":37,"tasks":37,"wrote":37,"exit":0,"ms":2841}
```

**הסקריפט לעולם לא מדפיס ולא כותב ללוג סיסמה או טוקן** — רק `"credentials":"present"` ו-`"auth"`.

---

## החלפת סיסמה (rotation)

כשעידן מחליף את סיסמת ה-EMS שלו:

1. לפתוח את `.env` בשורש הפרויקט.
2. להחליף את הערך של **`EMS_PASSWORD`** בלבד. אין עוד שום מקום בפרויקט שמחזיק אותה —
   לא בקוד, לא ב-Supabase, לא ב-Task Scheduler (המשימה מריצה סקריפט; היא לא מחזיקה סוד).
3. לשמור, ואז:
   ```powershell
   node scripts/ems-cache-refresh.mjs --dry-run    # תצורה תקינה?
   node scripts/ems-cache-refresh.mjs              # הרצה אמיתית; מצפים ל-0
   ```
4. אם עברתם בעבר ל-`EMS_TOKEN` בגלל 2FA — טוקן מתיישן. להחליף אותו באותו אופן, או לעבור
   לחשבון שירות.

> אם סיסמה נחשפה (נשלחה בצ'אט, נכנסה בטעות ל-commit) — **קודם מחליפים אותה ב-EMS**, ורק אחר כך
> מעדכנים את `.env`. קובץ שכבר נכנס להיסטוריית git לא "נמחק" בעריכה.

---

## תקלות נפוצות

| מה רואים | למה | פתרון |
|-----------|-----|-------|
| `exit 3` + `requires a 2FA code` | לחשבון יש אימות דו-שלבי | `EMS_TOKEN` זמני, או חשבון שירות |
| `exit 5` + `ems-auth did not mint a pass` | ה-EMS token נדחה ע"י פונקציית `ems-auth` | לוודא שההתחברות באפליקציה עצמה עובדת |
| `exit 5` + `ems_cache upsert answered 401` | ה-pass לא התקבל ע"י RLS | אותה בדיקה; ראו `docs/ems-session.md` |
| `"warning":"hit the page cap"` | יותר מ-4000 משימות פתוחות | להעלות את `PAGE_CAP` בסקריפט *וב-`js/src/13-ems.js`* יחד |
| המשימה רצה, `exit 0`, והאפליקציה לא מתעדכנת | הדפדפן מציג מטמון מקומי | משיכה למטה (pull-to-refresh) בטלפון, או רענון |
| אין שורות חדשות בלוג | המחשב היה כבוי / המשתמש לא היה מחובר | זו המגבלה של הפתרון; ראו סעיף 4 |

---

## קשור

* `js/src/13-ems.js` — `emsSyncCache` (המקור לאמת של המיפוי), `emsBackgroundSync` (הרענון בתוך האפליקציה)
* `app/src/lib/query.ts` — מדיניות stale-while-revalidate בצד הלקוח
* `test-ems-refresh.mjs` — נועל את המיפוי מול הלקוח, את קודי היציאה ואת היגיינת הסודות
* `docs/ems-session.md` — תוקף ה-session של EMS

# 🔥 מעקב צריבת מונים (Landis E360 ייצור) — תכנון

**STATUS: 🟡 OPEN — built (1.68 on `feat/meter-burns-rel`), NOT shipped.** Resume: `docs/backlog.md` → 🟡 IN PROGRESS 🔥 צריבות (apply the two SQL files, smoke as עידן, ff to dev→main).

**תאריך:** 2026-09-06 · **סטטוס:** בנוי (1.68 על `feat/meter-burns-rel`), ממתין ל-SQL + מיזוג · שער השקה: עידן בלבד · **משתמשים:** אביאם, ניתאי (עדכון) · עידן, עמיחי (צפייה + ניהול)

## 1. מה בונים (במשפט)
טאב חדש **"🔥 צריבות"** באפליקציה: רשימת כל מוני Landis E360 (PP/SP/CT) שתפקידם ייצור (role 20–24),
מקובצת לפי קיבוץ, עם חיפוש מהיר, סימון "נצרב / לא נצרב / בעיה" בלחיצה אחת, ומונה "נותרו X" לכל קיבוץ.
אופציונלי לכל עדכון: דחיפת שינוי תפקיד (למשל → 24 "ייצור עם גנרטור") ל-EMS.

## 2. מקור הנתונים (מאומת מול ה-DB, 6.9.26)
שאילתת ה-DB: `meters.type_code IN (6,7,8)` (E360PP / E360SP / E360CT) `AND role_code BETWEEN 20 AND 24`.
**תוצאה: 268 מונים ב-~45 אתרים.** קובץ: `docs/reports/landis_e360_generation_meters.csv` (הופק היום).

| סוג | מונים ייצור | הערה |
|-----|-------------|------|
| E360PP | 176 | חיבור ישיר. `current_multiplier` = 1 |
| E360CT | 85 | דרך משנ"ז. `current_multiplier` = יחס ה-CT (למשל 50) — **חייב להיצרב במונה** |
| E360SP | 7 | חד-פאזי, כמו PP |

ריכוזים גדולים: מעוז חיים 30, מעלה גלבוע 34 (27 PP + 7 CT), תל קציר 20, שער הנגב חינוך 20, שלוחות 18,
משמר השרון 16, עין המפרץ 14 (כולם CT), כנרת 16, ניצנים 12 (10 CT).

**מקור חי (בעתיד):** `GET /v1/meters?typeCodes=6,7,8&roleCodes=20,21,22,23,24&take=500` דרך ה-proxy
הקיים (`emsApi`). לשלב 1 — seed מה-CSV לטבלת Supabase (אין תלות בחיבור EMS בשטח).

## 3. מה זה "צריבה" ומה ההבדל CT ↔ PP (לפי עידן, 6.9.26)
**מצב היום:** המונים ברשת הציבורית. צריבה = להגיע פיזית, לחבר PROBE, לצרוב → המונה עובר ל-**רשת סגורה / APN**
ונפתח לניהול מרחוק. זהו שלב 1, זהה בזמן ל-PP ול-CT.

**CT בלבד — שלב 2:** מונה CT הוא חלק ממערכת **ניתוק מרחוק** (על פי ערכי עומס המונה מבצע פקודות). אחרי הצריבה
בשטח נדרש **עדכון תוכנה מרחוק** (דרך ה-APN). לכן ל-CT יש שני סטטוסים עד "גמור".

| | PP / SP | CT |
|--|---------|----|
| תג | 🔌 PP | 🧲 CT ×50 (מציג את `current_multiplier`) |
| שלבים | ⬜ ממתין → ✅ נצרב | ⬜ ממתין → ✅ נצרב → **נצבע 🟣 "מוכן לעיסוק"** (עיצוב בלבד, לא שלב שמסמנים) |
| "נותרו" | סופר ממתין | סופר ממתין. CT נצרב = גמור מבחינת השטח; הצבע רק מסמן שהמונה זמין לעדכון תוכנה מאוחר יותר |
| אזהרה | — | `current_multiplier` = 1 → 🔴 "יחס CT חסר ב-EMS" |
| חסר אב | `parent_serial` ריק → ⚠️ "אין מונה אב" (חוק EMS: role≠1,2 חייב parent) | אותו דבר |

**גנרטור:** לכל מונה גנרטור יש רשימת מונים שהוא מכבה. היום זה JSON ליד ה-EXE של תוכנת הניתוק. הטאב ינהל
את השיבוץ הזה (סעיף 6א). ייצוא JSON / ממשק ב-EMS — **לא עכשיו**.

## 4. מודל נתונים (Supabase — טבלה אחת)
```sql
create table public.meter_burns (
  meter_id     uuid primary key,          -- EMS meters.id
  serial       text not null,
  site         text not null,             -- שם קיבוץ (תואם tasks.name / EMS site)
  site_id      uuid,
  meter_type   text not null,             -- 'E360PP' | 'E360SP' | 'E360CT'
  address      text,
  role_code    int,
  ct_ratio     numeric,                   -- current_multiplier מה-EMS (לתצוגה/אזהרה)
  parent_serial text,
  status       text not null default 'pending',  -- pending | burned | issue
  burned_by    text,                      -- 'אביאם' | 'ניתאי'
  burned_at    timestamptz,
  generator_id uuid references generators(id), -- תחת איזה גנרטור המונה (סעיף 6א)
  solar_names  text,                      -- המערכות המקושרות למונה (solars.name, מופרד ב-" · ") — מה-EMS DB
  note         text,
  updated_at   timestamptz default now()
);
-- RLS: read anon (כמו dev_status_log); insert/update = authenticated (bridge). מחיקה — אין.
```
```sql
create table public.generators (
  id          uuid primary key default gen_random_uuid(),
  site        text not null,
  name        text not null,               -- שם חופשי ("גנרטור רפת", "גנרטור לולים")
  device_serial text,                      -- מספר מונה/בקר של הגנרטור (עידן ממלא בטבלת העזר)
  created_by  text, created_at timestamptz default now(),
  unique (site, name)
);
```
Seed: `db/meter_burns.sql` מייצר את הטבלה + `insert` של 268 השורות מה-CSV. רענון עתידי = upsert לפי `meter_id`
(סטטוס לא נדרס — `on conflict do update set address/ct_ratio/parent_serial/role_code`).

*ponytail:* אין טבלת היסטוריה. `updated_at` + `burned_by` מספיקים; אם יידרש audit — `meter_burn_log` מאוחר יותר.

## 5. UI — מודול `js/src/24-meter-burns.js` (+ `#burns-view`, `.burn-*` ב-CSS)

**מסך ראשי (mobile-first, אביאם/ניתאי בשטח):**
```
🔥 צריבות                                    [ 🔍 חפש קיבוץ / מס' מונה / כתובת ]
מסננים: [כל הקיבוצים ▾] [הכול | נותרו | נצרבו | בעיה]  [PP | CT]
──────────────────────────────────────────────
▼ מעלה גלבוע ····························· נותרו 34/34  ▓░░░░░░░░ 0%
   🧲 CT ×40  68369287  לול 4 מונה ייצור  אב 6836…   [ ✅ נצרב ] [ ⚠ ]
   🔌 PP      59965612  סולארי דיר         אב —  ⚠️   [ ✅ נצרב ] [ ⚠ ]
▶ מעוז חיים ······························ נותרו 30/30
▶ תל קציר ································· נותרו  3/20  ▓▓▓▓▓▓▓░ 85%
```
- **חיפוש "שדוחף קדימה":** תיבה אחת, live-filter על קיבוץ+סידורי+כתובת, תואם עברית/ספרות חלקיות
  (סידורי `…287` מוצא 68369287). Enter על תוצאה יחידה → פותח את המונה. שמירת החיפוש/מסנן האחרון ב-localStorage.
- **סדר:** קיבוצים עם הכי הרבה "נותרו" למעלה (דוחף את העבודה); בתוך קיבוץ — לא-נצרבים קודם, CT לפני PP.
- **עדכון בלחיצה אחת:** `✅ נצרב` = status→burned, burned_by=המשתמש המחובר, burned_at=now. אין מודל.
  CT שנצרב נצבע 🟣 "מוכן לעיסוק" (PP נצרב = ✅ ירוק רגיל). זה עיצוב בלבד — אין שלב נוסף לסמן.
  `⚠` = פותח שדה הערה קצר (מה הבעיה) → status=issue. לחיצה שוב על ✅ נצרב → מבטלת (חזרה ל-pending, עם confirm).
- **מערכות מקושרות:** בכל שורת מונה מופיע שם המערכת הסולארית המקושרת (☀️ "סולארי רפת 7"), ובכרטיס — הרשימה המלאה.
  מקור: `solar_meters` → `solars.name` (261 מתוך 268 המונים מקושרים למערכת; 7 בלי).
- **צריבה מרוכזת:** בחירה מרובה בקיבוץ → "סמן N כנצרבו" (יום שטח = 10–30 מונים).
- **כותרת קיבוץ:** `נותרו X/Y` + פס התקדמות + פירוט `CT: a · PP: b`. סה"כ עליון: "נותרו 268 מתוך 268 · 0 בעיות".
- **כרטיס מונה (לחיצה על השורה):** כל השדות מה-EMS (סוג, יחס CT, אב, תקשורת, תאריך התקנה, תפקיד נוכחי),
  קישור `sigmatec-ems.com/admin/meters/<id>` ↗, היסטוריה (מי/מתי), ושורת **"עדכן ב-EMS"** (סעיף 6).
- **צפייה:** viewer/עידן/עמיחי רואים הכול, כפתורי עדכון מוסתרים (אותו gating כמו FAB שטח).
- **דוח:** 📗 Excel דרך `21-excel-export.js` הקיים (קיבוץ / סוג / נצרב / מי / מתי / הערה).

## 6א. שיבוץ מונים תחת גנרטור
- בכרטיס המונה (ובבחירה מרובה): שדה **"גנרטור"** = `<input list>` (datalist) של הגנרטורים **של אותו קיבוץ**.
  הקלדת שם שלא קיים + Enter → יוצר שורה חדשה ב-`generators` (site, name, created_by) ומשבץ. בלי מודל נוסף.
- **טבלת עזר גנרטורים** (עידן/עמיחי בלבד, בתוך הטאב): קיבוץ · שם · מספר מונה/בקר (`device_serial`)
  · כמה מונים משובצים.
- **קיבוץ מונים:** בתוך קיבוץ — בחירה מרובה של מונים → "שבץ תחת גנרטור ▾" (datalist, או שם חדש). שיבוץ הוא בתוך
  קיבוץ בלבד (הרשימה מסוננת לפי `site`).
- **תצוגה בקיבוץ:** קיבוץ ▸ גנרטור ▸ המונים תחתיו + המערכות של כל מונה (מונים ללא גנרטור תחת "לא משובץ").
- **לא עכשיו:** ייצוא JSON לתוכנת הניתוק, הצמדת גנרטור למונה EMS, כל דחיפה ל-EMS.

## 6. חיבור ל-EMS — **מושהה (החלטת עידן 6.9.26: האפליקציה לא כותבת שום דבר ל-EMS)**
נשאר כאן לתיעוד בלבד: `PUT /v1/meters/:id` (body מלא = `CreateMeterDTO`, guards ADMIN/SITE_MANAGER/OPERATIONS_MANAGER,
לאביאם ולניתאי יש ADMIN) ו-`POST /v1/meters/:id/logs`. כשיוחלט לחבר — GET→שינוי `roleCode`→PUT→log. **לא בבנייה הזו.**
קריאות מה-EMS (GET) לרענון הרשימה — מותר, בפאזה 6.

## 7. פאזות
| # | מה | קבצים | בדיקה |
|---|----|-------|-------|
| 1 | טבלאות `meter_burns` + `generators` + seed 268 שורות (כולל `solar_names`) | `db/meter_burns.sql` | count=268, 261 עם מערכת, RLS anon read |
| 2 | fetch-router: `meterBurns` read/write | `01-data.js` | `test-meter-burns.mjs` (write partial-safe) |
| 3 | טאב + רשימה + חיפוש + ✅/⚠ + נותרו | `24-meter-burns.js`, `index.html`, `css/app.css` | mobile 375px, ≥40px targets |
| 4 | כרטיס מונה (מערכות מקושרות, צבע 🟣 ל-CT נצרב) + Excel | `24-…`, `21-excel-export.js` | export checks |
| 4א | גנרטורים: בחירה מרובה → שיבוץ, datalist, טבלת עזר | `24-…` | שיבוץ נשמר, מסונן לקיבוץ |
| ~~5~~ | ~~"עדכן ב-EMS"~~ — מושהה | | |
| 6 | ✅ רענון רשימה מ-EMS חי (סעיף 7, 7.9.26) | `24-…` | upsert לא דורס סטטוס |

**הערכה:** פאזות 1–4 = מפגש עבודה אחד. 4א = חצי יום.

## 8. פתוח / להחלטת עידן
- **סגור (6.9.26):** אין כתיבה ל-EMS · אין ייצוא JSON כרגע · CT נצרב = צבע בלבד · שיבוץ לגנרטור בתוך קיבוץ · מערכות מקושרות מוצגות לכל מונה.
- **NotebookLM לא היה נגיש** בסשן (פרופיל `sigmatek`: RPC Not found / account-routing mismatch; `default`: auות פג).
  ההתייעצות נעשתה מול קוד ה-backend של EMS ומסמכי ניהול (ישיבת 23.8.26). להשלים כשהחיבור יתוקן.
- בדוח היום: **18 מונים ללא אב** ו-**1 מונה CT עם מכפיל 1** — לתקן ב-EMS לפני הצריבה (הטאב יסמן אותם ⚠️).

## 7. רענון חי מה-EMS — **בנוי 7.9.26** (הוחלט: "ה-seed נחמד, אבל חשוב העדכון מהמערכת" — עידן)
- **מקור:** `GET /v1/meters?roleCodes=20,21,22,23,24&take=200&page=N` + `GET /v1/solars?take=200&page=N` דרך ה-proxy הקיים (`emsApi`,
  הטוקן של המשתמש המחובר). הסינון ל-Landis E360 נעשה בצד הלקוח לפי `type.key`/`type.name` (`landis_e360pp|sp|ct`) — לא לפי קודי סוג.
- **מתי:** בפתיחת הטאב אם עברו ≥12 שעות מהרענון האחרון במכשיר (`localStorage: burn_ems_synced_v1`), וכפתור **⟳ EMS** ידני (לכותבים בלבד).
- **מה מתעדכן:** רק העמודות ש-EMS הוא הבעלים שלהן (serial, site, site_id, meter_type, address, role_code, ct_ratio, parent_serial,
  solar_names) ב-upsert לפי `meter_id` (`POST /rest/v1/meter_burns?on_conflict=meter_id`, `resolution=merge-duplicates`).
  status / burned_* / generator_id / note **לא נשלחים ולא נדרסים**. מונה חדש ב-EMS נכנס כ-`pending`.
- **RLS:** נוספה policy `meter_burns_insert` (authenticated) — מיגרציה `meter_burns_insert_policy` (7.9.26). ה-seed נשאר bootstrap בלבד.
- **לא מטופל (בכוונה):** מונה שנעלם מה-EMS (שינוי תפקיד/ארכיון) נשאר ברשימה — אם יפריע: עמודת `seen_at` + סינון. אין כתיבה ל-EMS.
- **קוד:** PURE `B.emsMeterType / B.emsSolarNames / B.emsToBurnRows` (נבדקים ב-`test-meter-burns.mjs`), `burnEmsAll` (דפדוף),
  `burnRefreshFromEms`. הפוטר מציג "עודכן מה-EMS <תאריך שעה>".

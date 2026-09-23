# מה צריך ממך, עידן — סיגמה 2.01

> **עודכן 20.9 01:30 — הכל בוצע.** סעיפים A–C הושלמו (חלק על ידך, חלק על ידי הבקר בגישה מלאה). נותר רק סעיף D (בדיקות מחובר) ו-F (החלטות).

מדריך פשוט לביצוע. **שורה אחת = פעולה אחת**, בסדר ביצוע. סמן ☑ תוך כדי. `main` יישאר במצב תחזוקה
(מסך "האפליקציה סגורה לשדרוג") עד שכל סעיף B יבוצע. **הבקר ניסה להעלות `dev`→`main` ולהריץ את המיגרציות ב-19.9 20:00 — מסנן ההרשאות חסם את ה-git merge/push ואת רוב המיגרציות (צעד 1 עבר). לכן סעיפים B ו-C אצלך.**
(עודכן ב-2.01: נוספו 7 צעדים על ה-20 שהיו ב-2.00 — מלאי מאוחד P6 + נעילת ה-RLS הכללית.)

קישור SQL Editor / Secrets לשימוש חוזר (פרויקט `wwqfcajnxinaxmobrgol`):
- SQL Editor: https://supabase.com/dashboard/project/wwqfcajnxinaxmobrgol/sql/new
- Edge Functions → Secrets: https://supabase.com/dashboard/project/wwqfcajnxinaxmobrgol/settings/functions
- Edge Functions (רשימה/deploy/logs): https://supabase.com/dashboard/project/wwqfcajnxinaxmobrgol/functions
- Cron (pg_cron jobs): https://supabase.com/dashboard/project/wwqfcajnxinaxmobrgol/database/cron-jobs
- GitHub repo settings (טוקנים/scopes): https://github.com/settings/tokens

---

## A. סודות להגדיר (Edge Functions → Secrets)

לא כותבים כאן ערכים — רק איפה כל ערך נמצא.

- [ ] **`SELF_WHISPER_TOKEN`** — אם שרת ה-Whisper הביתי דורש טוקן (ראה `docs/whisper-server.md`);
  בלעדיו התמלול פשוט נופל ל-Groq, לא שובר כלום.
- [ ] **`CRON_SECRET`** — ערך חדש שאתה בוחר (מחרוזת אקראית); צריך אותו גם בסעיפי ה-cron למטה
  (הם מצפים לאותו ערך בכותרת הבקשה) וגם בסעיף ה-`private.push_config` (התראות מלאי, למטה).
- [ ] **`VIEWER_PIN`** — קוד הכניסה לצופה (4 ספרות, כמו היום); בלעדיו מסך הצופה נשאר סגור.
- [ ] **`GH_TOKEN`** — לוודא שה-scope כולל **`project` (write)**, לא רק `read:project` (תקלה ידועה).
  צור/עדכן ב-https://github.com/settings/tokens לפי `docs/operations.md`.
- [ ] **`CLOCKIFY_API_KEY`** — Clockify → Profile settings → API → Generate. גם קיים אצלך מקומית
  ב-`sigmatec-email-manager\.env`.
- [ ] **`CLOCKIFY_WORKSPACE_ID`** — מזהה ה-workspace שלך ב-Clockify (מופיע ב-URL אחרי `/workspaces/`).
  גם קיים ב-`sigmatec-email-manager\.env`.
- [ ] *(רשות)* **`CLOCKIFY_USER_ID`** — אם ריק, הפונקציה מזהה לבד את המשתמש של המפתח.

כל הסודות נשארים בצד השרת בלבד — לא בקוד, לא בבאנדל של הדפדפן.

---

## B. 27 הצעדים החסומים בסביבת הייצור — לפי סדר תלות

**כלל אצבע: מיגרציה = SQL Editor (העתק-הדבק את כל הקובץ מ-`db/`); deploy = Edge Functions.**
בצע לפי המספור — יש תלות בין חלק מהסעיפים.

### B1–B4 — לוח שנה + נוכחות
- [x] **1.** מיגרציה `db/day_plans.sql` — **בוצע ע"י הבקר 19.9 20:05** (כולל read `to authenticated`).
- [ ] **2.** מיגרציה `db/calendar_absences.sql` (🌴/🪖/🎉 + מוסיפה עמודה ל-`attendance`).
- [ ] **3.** Deploy פונקציית **`calendar`** (`supabase/functions/calendar/index.ts`) — טווח from/to + `hangoutLink`.
- [ ] **4.** מיגרציה `db/company_holidays.sql` **ואז** `db/company_holidays_seed.sql` (38 שורות חגים).

### B5 — משימות פנימיות + יומן יום
- [ ] **5.** מיגרציה `db/internal_tasks.sql`.
- [ ] **6.** מיגרציה `db/daylog_corrections.sql`.
- [ ] **7.** Deploy פונקציית **`parse-daylog`** (חדשה).
- [ ] **8.** Deploy (redeploy) פונקציית **`parse-order`**.
- [ ] **9.** מיגרציה `db/rls_corrections_lockdown.sql` — **רק אחרי** 7+8 (אחרת שוברת בשקט את
  לולאת התיקונים של שני הפרסרים).

### B6 — ישיבות
- [ ] **10.** מיגרציה `db/meeting_sessions.sql`.
- [ ] **11.** מיגרציה `db/meeting_events.sql`.
- [ ] **12.** מיגרציה `db/kibbutz_meeting_notes_source.sql`.
- [ ] **13.** להריץ מחדש `db/kibbutz_meeting_notes_import.sql` (בטוח לריצה חוזרת — `create or replace`).
  קיבוץ ששינה שם (למשל `גת`→`קיבוץ גת`) כבר לא מאבד את הקישור ל-EMS ואת ה-✓ שלו.

### B7 — אונבורדינג
- [ ] **14.** מיגרציה `db/onboarding_templates.sql`.
- [ ] **15.** מיגרציה `db/onboarding_steps.sql`.

### B8 — בריאות קיבוץ + Clockify
- [ ] **16.** מיגרציה `db/kibbutz_health.sql` (ספים עדיין DRAFT — החלטה עד שלישי 22.9, לא חוסם deploy).
- [ ] **17.** מיגרציה `db/work_sessions.sql`.
- [ ] **18.** Deploy פונקציית **`clockify`** (חדשה) — אחרי שסעיף A הושלם (הסודות).

### B9 — מלאי מאוחד (P6, חדש ב-2.01) — לפי הסדר הזה בדיוק
- [ ] **19.** מיגרציה `db/inventory_pool.sql` (מאגר אחד `חברה`; הטריגר על תנועות כולל את ענף
  ה-low-stock).
- [ ] **20.** מיגרציה `db/stock_recounts.sql` (כל 🔢 ספירה נושאת הערה משלה — NOT NULL).
- [ ] **21.** להריץ `node db/pool_migration.mjs` (ברירת מחדל: dry-run בלבד, לא כותב). ה-dry-run
  שהופעל על הייצור מצא **20 שורות / 1079 יחידות** להעברה — אביאם + ניתאי בלבד, משרד/עמיחי מתאזנים
  ל-0, ו**יתרה שלילית אחת**: מונה `E360PP` ×2 אצל אביאם, שהמיגרציה סופגת. תראה את המספרים לפני
  שממשיכים.
  - [ ] **21א.** אחרי שאישרת את המספרים: `node db/pool_migration.mjs --apply --yes`.
- [ ] **22.** מיגרציה `db/inventory_pool_v2.sql` (התשתית להתראות מלאי נמוך, דור שני).
- [ ] **23.** מיגרציה `db/inventory_alert_webhook.sql` — ואז מיד סעיף ה-`push_config` למטה (חובה
  יחד, אחרת ההתראה נרשמת בטבלה אבל הדחיפה לא נשלחת).
- [ ] **24.** SQL: `db/cron_inventory_digest.sql` — להחליף `<ANON>` ו-`<CRON_SECRET>` ולהריץ
  (התקציר 12:00/17:00 לעמיחי).
- [ ] **24א.** למלא `min_qty` לפריטים המרכזיים (📦 מלאי → 🎚 מינימום מלאי) — בלי זה אין התראות מלאי
  נמוך בכלל (הכרעה I3).

### 🔔 התראות מלאי — צעד ידני שאין דרך לאוטמט אותו (חלק מ-23)
הטריגר על `movements` שולח דחיפה מיידית על מלאי נמוך (pg_net → push-send). ל-SQL אין
גישה ל-`CRON_SECRET` של ה-Edge Functions, אז צריך להעתיק אותו פעם אחת לטבלה פרטית
(`private.push_config`, ללא גישה ל-anon). אחרי הרצת `db/inventory_alert_webhook.sql`:

- [ ] ב-SQL editor (לא לשמור בריפו):
```sql
insert into private.push_config(key, value) values
  ('base_url',    'https://wwqfcajnxinaxmobrgol.supabase.co'),
  ('anon_key',    '<anon key>'),
  ('cron_secret', '<אותו ערך כמו CRON_SECRET>')
on conflict (key) do update set value = excluded.value;
```
עד שזה רץ — ההתראה עדיין נרשמת בטבלה ונראית בפעמון, רק הדחיפה לא נשלחת.

### B10 — Cron הכללי (אחרי שכל ה-secrets מ-A מוגדרים)
- [ ] **25.** SQL: `db/cron_usage_weekly.sql` — דוח 📈 שבועי + מתזמן מחדש את קרון הנוכחות עם הכותרת.
- [ ] **26.** SQL: קרון תזכורת ביקור כל 15 דק' + קרון כותרת נוכחות שעתי (ראה
  `docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md` §Task 15/17 להפניה לקובץ המדויק).

### B11 — נעילת ה-RLS הכללית (Task 31, חדש ב-2.01) — לפני main
- [ ] **27.** מיגרציה `db/rls_2_00_lockdown.sql` — **חייבת לרוץ יחד עם** עדכון הלקוח ב-
  `app/src/islands/Alerts.tsx` (כבר בקוד, יעלה עם 2.01 ל-`main`). הקובץ נועל `select` ל-15 טבלאות
  עסקיות ל-`authenticated` בלבד, מסיר מ-`push_subscriptions` את ה-`for all to anon` (כל אחד עם
  ה-bundle יכול היה למחוק כל מנוי דחיפה בחברה), הופך את `inventory_alerts`/`stock_recounts`
  ל-append-only עם RPC בשם `alert_mark_seen(id, person)` לפעמון, מסיר את הטאוטולוגיה על
  `work_sessions`, ומוסיף ל-`meter_burns` את מדיניות ה-INSERT שהתיעוד כבר הבטיח. `company_holidays`
  ננעל גם הוא. **בלי הרצה — הפעמון (סימון "נקרא") לא יעבוד אחרי שהאפליקציה עולה.**

### רק **אחרי** ש-2.01 חי ב-`main` (סדר הפוך: קודם האפליקציה, אחר כך הנעילה)
- [ ] **28.** Deploy (redeploy) **`push-send`** — כותרות/`usageDigest`/`gapReminder`.
- [ ] **29.** Deploy (redeploy) **`github`** — כולל תגובות (comments) בקריאה.
- [ ] **30.** מיגרציה `db/rls_corrections_lockdown.sql` — אם עוד לא רץ (ראה B5#9).
- [ ] **31.** מיגרציה `db/rls_certs_checkins_lockdown.sql` — **חובה אחרי** ש-2.01 חי ב-`main`, כי צופה
  התעודה עדיין קורא מהטבלה הפתוחה עד אז (`cert_by_id()` הוא הנתיב החדש). בסוף הקובץ יש בלוק
  VERIFY: קישור שיתוף קיים עדיין נפתח, ו-`select * from delivery_certs` בתור `anon` מחזיר 0 שורות.
  אם מריצים לפני שהגרסה באוויר — קישורי שיתוף פתוחים יראו "התעודה לא נמצאה" עד שהיא תעלה.

> **הבקר מבצע; אם נחסם — אתה.** הבקר ינסה להריץ כמה שיותר מהסעיפים האלה בעצמו דרך ה-MCP
> (`mcp__supabase__apply_migration`/`deploy_edge_function`). מיגרציה שה-classifier שלו חוסם
> ("Production Deploy") נשארת מסומנת ☐ כאן — אלה הצעדים שבאמת צריכים אותך.

---

## C. שחרור ל-main + הסרת מצב תחזוקה

לביצוע ע"י הבקר (Claude), רק אחרי אישורך שסעיפים A+B בוצעו:

```bash
git fetch origin
git merge-base --is-ancestor origin/dev origin/main && echo "already merged" || \
  (git checkout main && git merge --ff-only origin/dev && git push origin main)
```

לאחר מכן: להסיר את מסך התחזוקה (`maintenance.html` + הבלוק בראש `index.html`) בקומיט נפרד על
`main`, ו-GitHub Pages יעדכן את https://pm-sigma.github.io/sigmatec-operations-app/ תוך דקה-שתיים.

---

## D. סמוקים לבדוק מחובר (אחרי שהגרסה באוויר)

- [ ] כניסה ל-EMS מהאפליקציה, ראה שהכרטיסים נטענים.
- [ ] פתח כרטיס קיבוץ → סעיף 🔥 צריבות (אם רלוונטי) + הערות ישיבה.
- [ ] ▶ מצב ישיבה על כרטיס אחד — הערה חיה, יצירת משימה.
- [ ] 📝 יומן היום — הכתבה/הקלדה חופשית, שמירה.
- [ ] 📣 תיבת פידבק — הודעת קול קצרה, ודא תמלול חוזר.
- [ ] 📈 שימוש — פתיחת הדוח השבועי (`#usage`).
- [ ] ▶/■ Clockify על כרטיס — התחלה ועצירה.
- [ ] מסך צופה (VIEWER_PIN) — כניסה, קריאה בלבד.
- [ ] מובייל 390px + דארק-מוד — מעבר מהיר על 2–3 מסכים.
- [ ] 📦 מלאי — המסך מציג מאגר אחד (`חברה`), 🔢 דיווח שינוי במלאי עובד קצה-לקצה.
- [ ] 📍 על כרטיס קיבוץ פותח את גיליון הפרקים (לא את הטופס הישן) — לכל תפקיד.
- [ ] **בדיקת אידמפוטנטיות של ביקור כפול** — ב-📍 סיכום ביקור, בפרק 5 לחצו **שלח** פעמיים ברצף
  (double-tap מהיר). זה נבדק בקוד מול המוק (`visit-chapters.spec.ts`) אבל **לא ניתן לאימות מהריפו**
  מול ה-Apps Script האמיתי — צריך לוודא בעין שנוצר ביקור אחד בלבד בגיליון, לא שניים.

---

## E. רשות (לא חוסם שחרור)

- [ ] Docker Desktop — כדי ש-ZAP ירוץ בשערי ה-QA (כרגע מדולג, לא Critical).
- [ ] 3 הודעות קול לבדיקת מילון Whisper (אביאם/ניתאי) — נאסף אחרי השחרור לפי ההכרעה מ-18.9.
- [ ] אישורי EMS ל-`scripts/ems-cache-refresh.mjs` (רענון מטמון מהמשרד) — **אזהרת 2FA:** אם יש
  אימות דו-שלבי בחשבון ה-EMS שלך, הסקריפט ייצא בקוד 3 ולא ירוץ; ה-runbook (`docs/ems-cache-refresh.md`)
  מפרט שתי דרכים חלופיות.

---

## G. Round 5 — package V (visit editor + attendance rules): SQL to apply, in order

- [ ] **1. `db/attendance_source.sql`** — מוסיף `attendance.source` (manual/visit_auto/calendar) + אינדקס ייחודי.
  הרץ ואז הדבק כאן את פלט ה-Verify (2 שאילתות).
- [ ] **2. `db/attendance_visit_backfill.sql`** — **רק אחרי** #1. מילוי חד-פעמי של שורות נוכחות שטח
  מביקורים קיימים של אביאם/ניתאי, בלי לגעת בשורות ידניות. הדבק כאן את פלט ה-Verify (3 שאילתות; #2 חייב
  להיות 0).

## F. החלטות פתוחות (מחכות לך)

- [ ] ספי בריאות קיבוץ (`kibbutz_health`) — פגישה מתוכננת שלישי 22.9. רק "פניות ללא מענה" מבוסס
  היום על נתוני EMS אמיתיים.
- [ ] סטטוס פר-משימה ב-📝 יומן היום — מי רשאי לסגור משימה של אחר.
- [ ] Clockify: להחיל גם משתתפים (attendees) כתגיות? (~40 מתוך 87 תגיות הן שמות אנשי קשר).
- [ ] היסק עמודת 🚀 (source) בלוח הפיתוח.
- [ ] קליטת Gmail (Gmail intake) — נשאר רשות/לא מאושר.
- [ ] מלאי: עורך ברירות מחדל ל-`min_qty` לעמיחי, ורצועת הזמנות §4a — נדחו לגלגול הבא (לא ב-2.01).
- [ ] ביקורת Task 31 — כמה ממצאים נדחו במפורש (A7/A10/A11/F-17..F-21/F-23/F-24 טופלו, F-22 עדיין
  שלך): ראה `docs/backlog.md` לרשימה המלאה עם הסיבות.

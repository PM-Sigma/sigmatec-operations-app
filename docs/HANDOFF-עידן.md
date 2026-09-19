# מה צריך ממך, עידן — סיגמה 2.00

מדריך פשוט לביצוע. **שורה אחת = פעולה אחת**, בסדר ביצוע. סמן ☑ תוך כדי. `main` יישאר במצב תחזוקה
(מסך "האפליקציה סגורה לשדרוג") עד שכל סעיף B יבוצע והבקר יעלה את `dev` ל-`main`.

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
- [ ] **`CRON_SECRET`** — ערך חדש שאתה בוחר (מחרוזת אקראית); צריך אותו גם ב-B7/B8/B9 למטה כשמריצים
  את קובצי ה-cron (הם מצפים לאותו ערך בכותרת הבקשה).
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

## B. 20 הצעדים החסומים בסביבת הייצור — לפי סדר תלות

**כלל אצבע: מיגרציה = SQL Editor (העתק-הדבק את כל הקובץ מ-`db/`); deploy = Edge Functions.**
בצע לפי המספור — יש תלות בין חלק מהסעיפים.

### B1–B4 — לוח שנה + נוכחות
- [ ] **1.** מיגרציה `db/day_plans.sql` (סדר מסלול שדה).
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

### B9 — Cron (אחרי שכל ה-secrets מ-A מוגדרים)
- [ ] **19.** SQL: `db/cron_usage_weekly.sql` — דוח 📈 שבועי + מתזמן מחדש את קרון הנוכחות עם הכותרת.
- [ ] **20.** SQL: קרון תזכורת ביקור כל 15 דק' (ראה `docs/superpowers/plans/...` §Task 15/17 להפניה
  לקובץ המדויק אם נוסף בנפרד) + קרון כותרת נוכחות שעתי.

### רק **אחרי** ש-2.00 חי ב-`main` (סדר הפוך: קודם האפליקציה, אחר כך הנעילה)
- [ ] **21.** Deploy (redeploy) **`push-send`** — כותרות/`usageDigest`/`gapReminder`.
- [ ] **22.** Deploy (redeploy) **`github`** — כולל תגובות (comments) בקריאה.
- [ ] **23.** מיגרציה `db/rls_corrections_lockdown.sql` — אם עוד לא רץ (ראה B5#9).
- [ ] **24.** מיגרציה `db/rls_certs_checkins_lockdown.sql` — **חובה אחרי** ש-2.00 חי ב-`main`, כי צופה
  התעודה עדיין קורא מהטבלה הפתוחה עד אז (`cert_by_id()` הוא הנתיב החדש). בסוף הקובץ יש בלוק
  VERIFY: קישור שיתוף קיים עדיין נפתח, ו-`select * from delivery_certs` בתור `anon` מחזיר 0 שורות.
  אם מריצים לפני שהגרסה באוויר — קישורי שיתוף פתוחים יראו "התעודה לא נמצאה" עד שהיא תעלה.

### 🔔 התראות מלאי (Task 10) — צעד ידני שאין דרך לאוטמט אותו
הטריגר על `movements` שולח דחיפה מיידית על מלאי נמוך (pg_net → push-send). ל-SQL אין
גישה ל-`CRON_SECRET` של ה-Edge Functions, אז צריך להעתיק אותו פעם אחת לטבלה פרטית
(`private.push_config`, ללא גישה ל-anon). אחרי הרצת `db/inventory_alert_webhook.sql`:

- [ ] **25.** ב-SQL editor (לא לשמור בריפו):
```sql
insert into private.push_config(key, value) values
  ('base_url',    'https://wwqfcajnxinaxmobrgol.supabase.co'),
  ('anon_key',    '<anon key>'),
  ('cron_secret', '<אותו ערך כמו CRON_SECRET>')
on conflict (key) do update set value = excluded.value;
```
עד שזה רץ — ההתראה עדיין נרשמת בטבלה ונראית בפעמון, רק הדחיפה לא נשלחת.

- [ ] **26.** `db/cron_inventory_digest.sql` — להחליף `<ANON>` ו-`<CRON_SECRET>` ולהריץ
  (התקציר 12:00/17:00 לעמיחי).
- [ ] **27.** למלא `min_qty` לפריטים המרכזיים (📦 מלאי → 🎚 מינימום מלאי) — בלי זה
  אין התראות מלאי נמוך בכלל (הכרעה I3).

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

---

## E. רשות (לא חוסם שחרור)

- [ ] Docker Desktop — כדי ש-ZAP ירוץ בשערי ה-QA (כרגע מדולג, לא Critical).
- [ ] 3 הודעות קול לבדיקת מילון Whisper (אביאם/ניתאי) — נאסף אחרי השחרור לפי ההכרעה מ-18.9.
- [ ] אישורי EMS ל-`scripts/ems-cache-refresh.mjs` (רענון מטמון מהמשרד) — **אזהרת 2FA:** אם יש
  אימות דו-שלבי בחשבון ה-EMS שלך, הסקריפט ייצא בקוד 3 ולא ירוץ; ה-runbook (`docs/ems-cache-refresh.md`)
  מפרט שתי דרכים חלופיות.

---

## F. החלטות פתוחות (מחכות לך)

- [ ] ספי בריאות קיבוץ (`kibbutz_health`) — פגישה מתוכננת שלישי 22.9.
- [ ] סטטוס פר-משימה ב-📝 יומן היום — מי רשאי לסגור משימה של אחר.
- [ ] Clockify: להחיל גם משתתפים (attendees) כתגיות? (~40 מתוך 87 תגיות הן שמות אנשי קשר).
- [ ] היסק עמודת 🚀 (source) בלוח הפיתוח.
- [ ] קליטת Gmail (Gmail intake) — נשאר רשות/לא מאושר.

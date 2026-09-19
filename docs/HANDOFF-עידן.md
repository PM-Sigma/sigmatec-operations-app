# מה צריך ממך, עידן

רשימת פעולות ידניות שהאפליקציה לא יכולה לעשות לבד. פעולה אחת בשורה — אפשר לסמן ולשכוח.

## Clockify (Task 29 — ▶/■ שעות על כרטיס קיבוץ)

- [ ] **הוסף סוד `CLOCKIFY_API_KEY`** ב-Supabase → Edge Functions → Secrets.
  הערך: מפתח ה-API שלך מ-Clockify (Profile settings → API → Generate).
  https://supabase.com/dashboard/project/wwqfcajnxinaxmobrgol/settings/functions
- [ ] **הוסף סוד `CLOCKIFY_WORKSPACE_ID`** באותו מסך (מזהה ה-workspace; מופיע ב-URL של Clockify אחרי `/workspaces/`).
  https://supabase.com/dashboard/project/wwqfcajnxinaxmobrgol/settings/functions
- [ ] *(רשות)* `CLOCKIFY_USER_ID` — אם לא תגדיר, הפונקציה מזהה לבד את המשתמש של המפתח.

שני הערכים כבר קיימים אצלך מקומית ב-`sigmatec-email-manager\.env` — פשוט להעתיק משם. הם נשארים
בצד השרת בלבד: הם לא נמצאים ולא ייכנסו לקוד של האפליקציה.

## סגירת קריאה אנונימית ל-delivery_certs ו-field_checkins (Task 18b, הכרעה 19.9)

היום כל תעודת משלוח בעסק ניתנת לשליפה עם המפתח הציבורי שמופיע בקוד של הדף — שם הלקוח, ח.פ.,
שורות הפריטים והחתימה של המקבל. אותו דבר ל-`field_checkins` (מי היה איפה ומתי).

**סדר הפעולות חשוב** — קודם האפליקציה, אחר כך המיגרציה:

- [ ] **1. לוודא ש-2.00 (או כל גרסה מ-Task 18b והלאה) חיה ב-`main`.** הצופה של התעודה קורא דרך
  `cert_by_id()`, ועד שהגרסה הזו באוויר קישור שיתוף פתוח עדיין קורא מהטבלה.
- [ ] **2. להריץ את `db/rls_certs_checkins_lockdown.sql`** ב-Supabase → SQL Editor (העתק־הדבק את
  כל הקובץ). https://supabase.com/dashboard/project/wwqfcajnxinaxmobrgol/sql
- [ ] **3. לבדוק** בסוף הקובץ יש בלוק VERIFY: קישור שיתוף קיים עדיין נפתח, ו-`select * from
  delivery_certs` בתור `anon` מחזיר 0 שורות.

אם מריצים את המיגרציה **לפני** שהגרסה באוויר — כל קישור שיתוף פתוח יראה "התעודה לא נמצאה" עד
שהיא תעלה.

## ייבוא סיכום ישיבה — מפתח המיזוג לפי שם קנוני (Task 18b, הכרעה 19.9)

- [ ] **להריץ מחדש את `db/kibbutz_meeting_notes_import.sql`** (אותו מסך SQL Editor). הקובץ הוא
  `create or replace`, אפשר להריץ אותו שוב בלי נזק.
  מה השתנה: קיבוץ ששינה שם (למשל `גת` → `קיבוץ גת`) כבר לא מאבד את הקישור ל-EMS ואת ה-✓ שלו
  בייבוא חוזר של אותה ישיבה — השורות מקבלות את השם החדש במקום להימחק ולהיווצר מחדש.

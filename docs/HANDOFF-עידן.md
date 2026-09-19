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

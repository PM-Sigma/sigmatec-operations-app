# QA brief — סבב בדיקת הטלפון (22.9.2026)

עידן שלח את סשן "הערות בדיקת אפליקציה מטלפון" לסשן ה-QA (סשן B — בקר Opus). ההודעות הישירות בין הסשנים
לא אושרו, אז הבריף כאן. **מה לעשות:** להריץ QA מלא על `dev` (2.11, ענף `feat/phone-qa-round`).

## מה נבנה
קטלוג ההערות: `docs/superpowers/specs/2026-09-22-phone-qa-round-design.md`. פירוט השינויים: `docs/CHANGELOG.md` [2.08].
ניסוח ועיצוב: `docs/reports/2026-09-22-copy-sweep.md`. Preview: `https://raw.githack.com/PM-Sigma/sigmatec-operations-app/dev/index.html?login=0&sb=0`.

## מה להריץ
1. `npm run qa` המלא: gitleaks, semgrep, `npm test`, Playwright בארבעת הפרויקטים (כולל dark), Lighthouse, ZAP אם יש Docker.
   מצב אצל הסשן המפתח: legacy runners + vitest ירוקים; Playwright light (phone + desktop) ירוק אחרי עדכון specs.
2. תרחישי טלפון שעידן ביקש במפורש:
   - **כל פופאפ/מודל/גיליון באפליקציה נסגר** ויש חזרה לעמוד הקודם. ב-`index.html` 14 מודלים legacy, כולם מקבלים ✕
     מ-`js/src/00-guard.js modalEnsureClose` (גם דיאלוגים שנבנים בזמן ריצה); גיליונות Radix עם X; Android Back
     (popstate) סוגר דיאלוג פתוח ואז חוזר עמוד. במיוחד צריבות: כרטיס מונה, שיבוץ גנרטור, גנרטורים.
   - **חזרה מהרקע**: לא להיתקע על מסך טעינה. `sw.js` cache-first לניווט ולקבצי `?v=`; `19-version-check` לא עושה
     reload לטאב מוסתר. תרחיש: background→foreground ×10 עם throttling רשת; גם reload מלא באמצע עמוד פנימי.
   - עמודים פנימיים (צריבות/התראות/פיתוח/שעות) עם → חזרה; sessionStorage מחזיר לעמוד האחרון אחרי reload.
   - Pull-to-refresh לא נורה מתוך "עוד" או דיאלוג (`pullAllowedFrom`).
   - כרטיס קיבוץ: כל קישור מהכרטיס (עידן דיווח קריסות): ✏️ בתוך המודל (עידן בלבד), ➕ משימת EMS, ➕ משימה פנימית,
     📍, מצב הקיבוץ/ביקורים, צריבות מכווץ.
   - טיימר שעות (עידן/מתניה): לחיצה על שעון רץ → גיליון עריכה → השהיה/המשך → "סגור שעות"; עמוד ⏱ שעות מול לקוחות.
3. מהירות: Lighthouse על הבית ועל טופס הביקור; לוודא שה-SW החדש לא מגיש bundle ישן אחרי deploy (controllerchange).

## הוסר בכוונה (לא באגים)
מצב ישיבה (הצ'יפ), "פעולות ממתינות", כל 🔄, 🚚 מהסרגל ומהכרטיס, 🗓 ישיבות מהכרטיס, 🌙 מה-header, "פרויקט זמני",
"אין סיכום ישיבה", ✏️ בכרטיס הבית.

## פתוח
- שלוש מיגרציות לא הוחלו (הקוד סובל את היעדרן; `work_sessions_log.sql` נדרש לעריכה בעמוד השעות).
- `ems-auth` Edge Function: משפט אחד שונה (THROTTLE_MESSAGE) — לא נדרש deploy, לציין.
- ממצאים → `qa/reports/<date>-phone-qa.md`.

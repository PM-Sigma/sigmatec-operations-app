# יומן עבודה ובעיות — מ-27.9 (עידן ביקש: לתעד את כל העבודה, כל התיקונים וכל הבעיות שצפות)

כל שורה: מתי · מה · למה · תוצאה · קומיט. נכתב תוך כדי, לא בדיעבד.

## ממוזג ל-main (27.9)
| # | מה | בעיה/סיבה | תוצאה | קומיט |
|---|---|---|---|---|
| 1 | Inventory (I-U) | מיזוג ידני של index.html הוריד loginModal/authGate/toast | index.html נבנה מחדש כמיזוג תלת-כיווני תקין; רק markup ישן של מלאי הוסר | dc9341e4 |
| 2 | Visit summary (V-U) | הטופס הישן הוסר | 2059 בדיקות + 49 Playwright | 3af25c15 |
| 3 | Other screens (R-U) | Gaps שינה התנהגות — הוחזר (עיצוב בלבד); alerts.spec התנגש | 2067 בדיקות, 595 Playwright | dd242f0d |
| 4 | QA6 יומן | חודש עבודה: עמודת מספרי שבוע נסתרת כיווצה 5 ימים; אין דוחות ביקור | תוקן + ביקורים בלוח; הוסרה נקודת נוכחות | b28b860f |
| 5 | QA6 כרטיס קיבוץ | תגית שיווק על ה-✕; אין ➕ בביקורים; "בריפינג" | תוקן; "דוח מצב" בכל מקום גלוי | 76a11e2a |
| 6 | QA6 שגיאות/התראות/משימות | VALIDATION ERROR גולמי | הודעות בעברית + "דווח כבאג"; סמן הכל כנקרא; כל הכרטיס לחיץ | 7a500802 |
| 7 | פעולות שטח — קריאת מודבוס | חדש; ביקורת אבטחה מצאה SSRF + CORS פתוח | תוקן, נפרס ל-Supabase, 401 בלי התחברות | f33e7779 |
| 8 | כפתורי ביקור בכרטיסים | אין כפתור ייעודי כשיש היסטוריה | ➕ חדש + ✏️ עריכת האחרון | 88aa5a51 |
| 9 | פעולות שטח בטלפון | נחתך ~30px ב-SectionBlock | תוקן בעמוד + סריקת 7 רוחבים | 88ba332b |
| 10 | SectionBlock לכל האפליקציה | ה-bleed נחתך ע"י overflow-hidden משני הצדדים | תוקן ברכיב עצמו + בדיקה | 57015e6e |

## בעיות פתוחות
| # | מתי | בעיה | מצב |
|---|---|---|---|
| P1 | 27.9 | **עמוד הבית של הקיבוצים: כרטיסים לא מראים את כל המידע, לא נכנסים לכרטיס, נחתכים** (עידן, בטלפון, חדש) | בבדיקה — בדיקות עם נתוני דמה עוברות (17/17), כלומר זה קורה רק עם נתונים אמיתיים. חשודים: #8 (כפתורים חדשים בכרטיס) או #10 (SectionBlock) |
| P2 | 26.9 | כתובת פנימית של ModbusClient נשארה בהיסטוריית git (הריפו ציבורי) | הוסרה מהקבצים; בהיסטוריה נשארת — דורש החלטה אם לשכתב היסטוריה |
| P3 | 27.9 | 12 בדיקות "מצב המתנה" (pending-states §2) בנוכחות/ביקור/בית | ידוע, מתועד, לבדיקת QA מלאה |
| P4 | 27.9 | קוד מת של #visitFab ב-02-init-attendance.js | ניקוי |
| P5 | 27.9 | מודבוס לא נבדק על מונה אמיתי; "פער מול EMS" לא נבנה (אין קריאה אחרונה ב-EMS) | דורש בדיקה בשטח |

## לבקלוג (עידן 27.9)
1.3 מחיקת משימות הבדיקה (לביא/אפיק) · 3.2 האצת הקלטה · 4.4 חופשות לכל העובדים ביומן · 5.1 יישור מלאי RTL

## 27.9 — P1 טיפול
- חשוד עיקרי: 36fac282 (כפתורי ביקור בכרטיס הבית) — כל כרטיס מריץ שאילתת ביקורים משלו (useKibbutzVisits). עם נתונים אמיתיים זה שובר את הכרטיסים; בדיקות עם נתוני דמה עברו (17/17) ולא תפסו.
- פעולה: CardActions.tsx + home-cards.spec.ts הוחזרו לגרסה שלפני 36fac282, נבנה, 2146 בדיקות עברו, נדחף ל-main.
- הבא: עידן מאשר שהכרטיסים חזרו; בנייה מחדש של הכפתורים בלי שאילתה לכל כרטיס (לקחת את הביקור האחרון מהנתונים שכבר נטענו לכרטיס), ובדיקה עם כמות נתונים אמיתית (fixture גדול).
- לא יכולתי להתחבר לאפליקציה החיה לבדיקה: הזנת סיסמה אסורה עליי.
- 27.9 (2): עידן — עדיין שבור אחרי ה-revert של 36fac282. הוחזר גם 2c09a0da (SectionBlock) → 21fe1734. אם עדיין שבור: הבעיה לא באחד משני אלה — צריך לראות שגיאות קונסול מהאפליקציה החיה (עידן מתחבר ב-Browser pane, אני קורא קונסול בלי להזין כלום).
- 27.9 (3): **עידן: עובד** אחרי שני ה-reverts (21fe1734). P1 נסגר. לא ידוע איזה משני השינויים שבר — שניהם בוטלו.
  - לבנות מחדש, בזהירות, כל אחד בנפרד עם בדיקה על כמות נתונים אמיתית: (a) כפתורי ביקור בכרטיס הבית בלי שאילתה לכל כרטיס; (b) תיקון SectionBlock (חיתוך השוליים) — ענף משלו, בדיקה על כל המסכים עם נתונים גדולים, ועידן מאשר בטלפון לפני שממשיכים.
  - לקח: בדיקות עם נתוני דמה קטנים לא תופסות שבירה על נתונים אמיתיים → להוסיף fixture בגודל אמיתי (כל הקיבוצים, מאות ביקורים) לבדיקות הבית.

## בקלוג חדש (עידן 27.9, "לאחר כך")
- שורות בכרטיס קיבוץ (סיכומי ישיבות / מתמלול): **מחיקת שורה**; **העברת שורה לקיבוץ אחר** (כשהתמלול שייך לא נכון); **פתיחת משימה מהשורה והסבה למשימת EMS**.
- 27.9 (4): **הקפאה הוסרה** — UPGRADE_FREEZE=false, האפליקציה פתוחה לכל העובדים (עידן אישר). 385a6d8b. בוחר הפונטים הוסר בסבב 5 (פונט אחד קבוע, Assistant) — לא מופיע בהודעה לצוות.
- 27.9 (5): **נמצא בבדיקת הפריסה:** VERSION ו-sw.js עלו לחיים עם סימני קונפליקט (<<<<<<<) מאחד המיזוגים — sw.js היה שגיאת תחביר, כלומר טלפונים לא יכלו לעדכן את ה-service worker (ייתכן שזה גם הסביר חלק מ"זה לא מתעדכן"). תוקן, `node --check sw.js` עובר. לקח: אחרי כל מיזוג להריץ `git grep "^<<<<<<< "` ו-`node --check sw.js` לפני push → להוסיף כבדיקה ב-test-all.

## 29.9 — wave 1 merged (MAIN, Opus integration / Sonnet execution)
- 73fd68fa w1-docs: WORKING-METHOD, checkpoint docs, release guards (conflict markers + `node --check sw.js`) in test-all, dead #visitFab removed.
- 717e530c w1-cardbtn: home-card visit buttons back via ONE lookup built in Home (no per-card query) + real-size fixture (60 kibbutzim/480 visits). Render ~1.75s→~2.4s (rough, worker counts differed) — watch.
- 42329a26 w1-noterows: meeting-note row ⋯ menu — delete (undo 5s), move to another kibbutz (undo), open internal task, convert to EMS task. Internal link stored as `internal:<id>` in ems_task_id. No SQL.
- 96de68ee w1-vacations: calendar absences for all staff (add/edit/delete, types חופשה/מחלה/אחר/מילואים/אירוע); only אביאם/ניתאי reach attendance.
  PROD 29.9: `db/calendar_absences_sick_other.sql` applied via `supabase db query --linked` (MCP down). Backup `calendar_absences_bak_r9` (table had 0 rows). Constraint verified. Rollback in the file.
- Open: build warning duplicate `tag` key in app/src/islands/DayLog.tsx:559/561; one flaky kibbutz-detail Playwright test (passes alone); untested missing-enum error path (moot — enum applied).
- 48ab796f w2-voice-ltr: recorder mono 24 kbps + echo/noise suppression (upload ~5.4x smaller; end-to-end not measured); inventory certs values wrapped in <bdi>, qty inputs dir=ltr (no visual check at 360).
- d3ff6ab8 w2-h3h5: DayLog duplicate `tag` removed; kibbutz-detail ✕/Esc test waits for sheet (flake not reproduced — guess). H3/H5 SKIPPED — need עידן: H3 = presenter may edit kibbutz region/section? which roles (new write path + RLS). H5 = add opened-at stamp to EMS cache now, or defer?
- r9/w2-sectionblock (733f15dd, pushed as branch, NOT on main): non-flush SectionBlock clipped ~16px (-mx-4 inside overflow-hidden) → classes moved onto the overflow div. Touches ~30 screens. Waiting עידן's phone check via githack preview.
- Observed: 15 Playwright failures in full 360-light run (calendar, feedback-refine, product-names, settings, shell, transcribe-unavailable, upgrade-freeze, voice-ladder) — no baseline yet; next QA pass.

## 29.9 - wave 3 docs (r9/w3-docs)
- Ops graph rebuilt; audit found `.graphify_detect.json` stale (388 files, 23 deleted, ~100 live files missing). List refreshed, graph now 6,747 nodes; every screen/module/edge function present.
- `docs/modules.md` islands/retired modules corrected; `docs/superpowers/DECISIONS-round5.md` written (open questions: H3, H5, SectionBlock); INDEX + backlog current state refreshed.
- 29.9 prod: 3 test internal_tasks (לביא ×2, אפיק ×1, titles "בדיקה…") deleted; backup table internal_tasks_bak_test_29_9.
- a84b6e1b w3-e2e: 15 Playwright failures triaged — stale locators (feedback/DayLog redesign), legacy inventory specs removed (covered by React specs), upgrade-freeze specs skipped (freeze lifted), calendar "next Tuesday" month-rollover helper. REAL BUG fixed: Σ home button dropped by the I-U index.html merge (2nd time).
- Guard added: test-release-guards.mjs asserts index.html keeps loginModal/authGate/toast/sigmaGoHome (proven red→green).
- 29.9 ISSUE: a Python edit opened DECISIONS-round5.md for write before building the content, hit a TypeError, and the emptied file was committed+pushed. Restored in the next commit. Lesson: build the full content first, write once, check the diff before commit.
- 15916c15 H3: presenter region/section chips editable by עידן/עמיחי via RPC set_kibbutz_region_section (PROD 29.9 applied; backup kibbutzim_region_section_bak_29_9, 58 rows; anon no exec). Open: kibbutzim_write still lets any non-viewer write directly (separate decision).
- dfdf0895 H5: EMS lifecycle tracking + stats page (עידן/עמיחי). PROD 29.9: db/ems_task_lifecycle.sql applied (new tables only; backfill 38 tasks); MAIN added a guard refusing a "full" snapshot under half the open set. ISSUE: taking main index.html dropped #emsstats-view; test-html-structure caught it, restored; rule added to WORKING-METHOD. Open: EMS probe on office PC (real createdAt/updatedAt keys), office job not calling the RPC, closed-history backfill.
- 20837a1c H3 fix (עידן 29.9: region fixed, section עידן/עמיחי only via card ✏️ and presenter ✏️). PROD: db/kibbutz_section_lock.sql applied (set_kibbutz_section, old RPC dropped, BEFORE UPDATE trigger). Verified in a rolled-back txn as staff role: region BLOCKED, section BLOCKED, other fields ALLOWED. Open: presenter has 2 pencils (note-sheet + section) — עידן to choose.
- H3 chip: presenter category chip (🆕/✅) opens the section picker for עידן/עמיחי; second pencil removed (v2.117)
- Q7-B: bell derived 'not linked to EMS' alert markable read (hash, per device); my-tasks spacing (v2.119). Note: one vitest flake in the 1st full run, green on rerun.

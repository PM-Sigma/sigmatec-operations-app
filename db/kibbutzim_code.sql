-- ══════════════════════════════════════════════════════════════════════════════
-- `kibbutzim.customer_code` — the customer code as DATA, not as code (QA round 3, D2).
--
-- Until now the code lived in a hard-coded map (`CUSTOMER_CODES` in js/src/01-data.js):
-- a new customer meant a commit and a deploy before his number showed anywhere. עידן
-- asked for it to be editable in ✏️ פרטי קיבוץ, so it becomes a column, seeded from
-- exactly that map, and `customerCodeFor()` prefers the row over the map.
--
-- The map stays in the bundle as the offline fallback for a row that has no code yet.
-- Apply once against prod:  psql ... -f db/kibbutzim_code.sql
-- ══════════════════════════════════════════════════════════════════════════════
alter table kibbutzim add column if not exists customer_code integer;

comment on column kibbutzim.customer_code is
  'קוד לקוח — the internal customer number, editable in ✏️ פרטי קיבוץ (QA round 3, D2)';

-- Seed from the CUSTOMER_CODES map (js/src/01-data.js). `is null` so re-running never
-- overwrites a code someone has since corrected by hand.
update kibbutzim k set customer_code = v.code
from (values
  ('משמר השרון', 926), ('תל קציר', 927), ('כפר גלעדי', 906), ('גניגר', 953),
  ('גבים', 974), ('מעוז חיים', 948), ('אפיקים', 903), ('גברעם', 934),
  ('עין המפרץ', 957), ('אלונים', 959), ('אור הנר', 915), ('מתחם חינוך שער הנגב', 950),
  ('שדה אליהו', 951), ('קיבוץ גת', 964), ('מעלה גלבוע', 911), ('גבעת חיים מאוחד', 971),
  ('גבת', 960), ('יגור', 940), ('חוקוק', 966), ('כנרת', 941), ('דגניה', 980),
  ('עין השופט', 944), ('בית זרע', 975), ('עין חרוד מאוחד', 979),
  ('אלומות', 895), ('אפיק', 896), ('חוצות יגור', 972), ('שלוחות', 973),
  ('אגודת המים עמק הירדן', 907), ('כפר מסריק', 947), ('להב', 976),
  ('קבוצת יבנה', 937), ('שער הגולן', 902), ('בית אריזה גלבוע', 956),
  ('כפר מנחם', 961), ('לביא', 968), ('מגן', 935), ('משואות יצחק', 900),
  ('פרחי אביב', 930), ('קיבוץ ניצנים', 910), ('כפר דניאל', 977)
) as v(name, code)
where k.name = v.name and k.customer_code is null;

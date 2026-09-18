// Fixture rows served to the islands instead of Supabase (QA gate 3).
//
// The React islands read through supabase-js and do NOT honour `?sb=0` (that flag only routes
// the LEGACY bundle to its in-page mock), so `_helpers.ts` intercepts every request to the
// Supabase origin and answers from here. That is what makes the suite hermetic, offline and
// incapable of writing to production: non-GET requests are answered 401, which is exactly the
// state the islands show their "יש להתחבר ל-EMS כדי לשמור" hint for.
//
// The rows are chosen to exercise the UI, not to mirror production:
//   * two sections (new + active) and three regions → the section headers AND the region
//     sub-labels both have something to render (a single region renders no sub-label);
//   * a marketing row → the 🤝 chip and the 🤝 שיווקי filter chip have a member;
//   * a sub-site → the ↳ תת-אתר chip;
//   * a gas/water row → the energy badge is not always "⚡ חשמל".
// Names match the legacy mock sheet (js/src/01-data.js) so the EMS-task widget and the legacy
// decorators find the same kibbutzim the cards show.

export interface Fixtures {
  kibbutzim: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  usage: Array<Record<string, unknown>>;
}

const daysAgo = (n: number) => {
  const d = new Date(Date.UTC(2026, 8, 18) - n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

export const KIBBUTZIM = [
  // ── active · גליל וגולן
  { id: 'k1', name: 'חוקוק', display_name: null, section: 'active', region: 'גליל וגולן',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null },
  { id: 'k2', name: 'דגניה', display_name: null, section: 'active', region: 'גליל וגולן',
    energy: ['electric', 'water'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null },
  // ── active · העמקים (one of them a sub-site of יגור)
  { id: 'k3', name: 'יגור', display_name: null, section: 'active', region: 'העמקים',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null },
  { id: 'k4', name: 'יגור — רפת', display_name: null, section: 'active', region: 'העמקים',
    energy: ['water'], kind: 'subsite', parent: 'יגור', marketing: false, archived_at: null },
  // ── active · דרום — gas, and the one marketing row
  { id: 'k5', name: 'כפר עזה', display_name: null, section: 'active', region: 'דרום, עוטף עזה והנגב',
    energy: ['gas'], kind: 'kibbutz', parent: null, marketing: true, archived_at: null },
  // ── new customers (their own section)
  { id: 'k6', name: 'גבת', display_name: null, section: 'new', region: 'העמקים',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null },
  { id: 'k7', name: 'שדה אליהו', display_name: null, section: 'new', region: 'גליל וגולן',
    energy: ['electric', 'gas'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null },
];

/** Four meetings on חוקוק → a latest block plus a "היסטוריה (3)" disclosure on that card. */
export const NOTES = [
  { id: 'n1', kibbutz: 'חוקוק', meeting_date: daysAgo(2), meeting_kind: 'company', seq: 1,
    text: 'להשלים החלפת מונה ראשי במחלבה', owners: ['אביאם'], ems_task_id: null, done_at: null },
  { id: 'n2', kibbutz: 'חוקוק', meeting_date: daysAgo(2), meeting_kind: 'company', seq: 2,
    text: 'לתאם מול הגזבר את החתימה על ההסכם', owners: ['עידן'], ems_task_id: null, done_at: null },
  { id: 'n3', kibbutz: 'חוקוק', meeting_date: daysAgo(2), meeting_kind: 'company', seq: 3,
    text: 'לבדוק זרימת נתונים מהבקר החדש', owners: [], ems_task_id: null, done_at: null },
  { id: 'n4', kibbutz: 'חוקוק', meeting_date: daysAgo(9), meeting_kind: 'company', seq: 1,
    text: 'הוזמנו 12 מונים מהמחסן', owners: ['ניתאי'], ems_task_id: null, done_at: null },
  { id: 'n5', kibbutz: 'חוקוק', meeting_date: daysAgo(16), meeting_kind: 'company', seq: 1,
    text: 'סוכם על סקר ראשוני', owners: ['עידן'], ems_task_id: null, done_at: null },
  { id: 'n6', kibbutz: 'חוקוק', meeting_date: daysAgo(23), meeting_kind: 'company', seq: 1,
    text: 'פגישת היכרות עם מנהל המשק', owners: ['עמיחי'], ems_task_id: null, done_at: null },
  { id: 'n7', kibbutz: 'גבת', meeting_date: daysAgo(4), meeting_kind: 'company', seq: 1,
    text: 'להוציא הצעת מחיר', owners: ['עידן'], ems_task_id: null, done_at: null },
];

/** A handful of usage events so 📈 שימוש renders a populated report, not its empty state. */
export const USAGE_EVENTS = (() => {
  const people = ['עידן', 'אביאם', 'ניתאי'];
  const actions = ['visit-saved', 'command-open', 'more-sheet-open'];
  const out: Array<Record<string, unknown>> = [];
  let i = 0;
  for (const person of people) {
    for (let d = 0; d < 6; d++) {
      out.push({
        id: 'u' + ++i,
        person,
        at: new Date(Date.UTC(2026, 8, 18 - d, 9, 30)).toISOString(),
        page: d % 2 ? 'kibbutz' : 'inventory',
        action: actions[d % actions.length],
        target: null,
      });
    }
  }
  return out;
})();

export const FIXTURES: Fixtures = { kibbutzim: KIBBUTZIM, notes: NOTES, usage: USAGE_EVENTS };

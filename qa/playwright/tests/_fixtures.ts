// Fixture rows served to the islands instead of Supabase (QA gate 3).
//
// The React islands read through supabase-js and do NOT honour `?sb=0` (that flag only routes
// the LEGACY bundle to its in-page mock), so `_helpers.ts` intercepts every request to the
// Supabase origin and answers from here. That is what makes the suite hermetic, offline and
// incapable of writing to production: non-GET requests are answered 401, which is exactly the
// state the islands show their "ההתחברות פגה" save hint for.
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
  /**
   * Field arrivals (spec §5.1). Built RELATIVE TO NOW, not to a frozen date: the "היום" strip
   * and its 2 h nudge are decided by the clock, so a fixed timestamp would pass in the
   * morning and fail in the afternoon. `checkins()` is a function for the same reason.
   */
  checkins: () => Array<Record<string, unknown>>;
  /** 🔥 צריבות (Task 23): חוקוק has work left, יגור is finished — so one card
   *  carries the chip and the other proves hide-at-zero on the same screen. */
  burns: Array<Record<string, unknown>>;
  generators: Array<Record<string, unknown>>;
}

const daysAgo = (n: number) => {
  const d = new Date(Date.UTC(2026, 8, 18) - n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

// `ems_site_ids` (Package Y, 22.9): every fixture kibbutz is LINKED by default, so existing
// specs (alert counts, card chips) see no change. Specs that need an UNLINKED row (the new
// alerts.spec / kibbutz-sheet.spec coverage) override the `kibbutzim` route themselves rather
// than changing this shared baseline.
export const KIBBUTZIM = [
  // ── active · גליל וגולן
  { id: 'k1', name: 'חוקוק', display_name: null, section: 'active', region: 'גליל וגולן',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null,
    ems_site_ids: ['d1bdff7a-82c2-46d1-92f1-96ab0679911e'] },
  { id: 'k2', name: 'דגניה', display_name: null, section: 'active', region: 'גליל וגולן',
    energy: ['electric', 'water'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null,
    ems_site_ids: ['cc079fe9-5f00-4a3d-a654-707207d831db'] },
  // ── active · העמקים (one of them a sub-site of יגור)
  { id: 'k3', name: 'יגור', display_name: null, section: 'active', region: 'העמקים',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null,
    ems_site_ids: ['ebb4306f-d289-422a-b3cb-ce3e8ee68bdc'] },
  { id: 'k4', name: 'יגור — רפת', display_name: null, section: 'active', region: 'העמקים',
    energy: ['water'], kind: 'subsite', parent: 'יגור', marketing: false, archived_at: null,
    ems_site_ids: ['ebb4306f-d289-422a-b3cb-ce3e8ee68bdc'] },
  // ── active · דרום — gas, and the one marketing row
  { id: 'k5', name: 'כפר עזה', display_name: null, section: 'active', region: 'דרום, עוטף עזה והנגב',
    energy: ['gas'], kind: 'kibbutz', parent: null, marketing: true, archived_at: null,
    ems_site_ids: ['d1ed862f-a03a-4a43-8c22-1f19028a1b68'] },
  // ── new customers (their own section)
  { id: 'k6', name: 'גבת', display_name: null, section: 'new', region: 'העמקים',
    energy: ['electric'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null,
    ems_site_ids: ['ed86a5b9-ae41-4317-942e-f42b0ba44aba'] },
  { id: 'k7', name: 'שדה אליהו', display_name: null, section: 'new', region: 'גליל וגולן',
    energy: ['electric', 'gas'], kind: 'kibbutz', parent: null, marketing: false, archived_at: null,
    ems_site_ids: ['3f91ccf9-67ae-4420-bf30-b7ea57ad16b2', '14a28537-15a6-4860-8a57-410d9cbf738c'] },
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
  // 'command-open' was Ctrl+K's own action key (removed round 5, X-L7) — 'primary-add' (the
  // header ➕, still real) keeps this fixture's actions all currently-tracked ones.
  const actions = ['visit-saved', 'primary-add', 'more-sheet-open'];
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

/**
 * One arrival, two and a half hours old, with no visit filed for it — which is exactly the
 * state the in-app nudge (§7k #4) and the `visitCron` push both exist for. Only served to
 * specs that ask for it (`boot({ checkins: true })`), so no other screen grows a strip.
 */
export const CHECKINS = () => [
  {
    id: '11111111-1111-4111-8111-111111111111',
    person: 'אביאם',
    kibbutz: 'חוקוק',
    checked_in_at: new Date(Date.now() - 2.5 * 3600_000).toISOString(),
    reminded_at: null,
    dismissed: false,
  },
];

/**
 * 🔥 צריבות — the temporary meter-burn project (Task 23).
 *   חוקוק: 1 CT pending · 1 PP issue · 1 PP burned  → chip "🔥 נותרו 2/3", 2 briefing rows
 *   יגור:  2 burned                                → NO chip (hide at zero) on the same screen
 * חוקוק is also the kibbutz the check-in fixture arrives at, so the briefing has burns in it.
 */
export const METER_BURNS = [
  { meter_id: 'mb1', serial: '68369287', site: 'חוקוק', site_id: null, meter_type: 'E360CT', address: 'רפת 7 מונה ייצור',
    role_code: 20, ct_ratio: 50, parent_serial: '68369290', solar_names: 'סולארי רפת 7',
    status: 'pending', burned_by: null, burned_at: null, generator_id: null, note: null },
  { meter_id: 'mb2', serial: '59965612', site: 'חוקוק', site_id: null, meter_type: 'E360PP', address: 'סולארי דיר',
    role_code: 24, ct_ratio: 1, parent_serial: '59965600', solar_names: null,
    status: 'issue', burned_by: null, burned_at: null, generator_id: null, note: 'אין גישה לארון' },
  { meter_id: 'mb3', serial: '11112222', site: 'חוקוק', site_id: null, meter_type: 'E360PP', address: 'מוסך',
    role_code: 20, ct_ratio: 1, parent_serial: '11112200', solar_names: null,
    status: 'burned', burned_by: 'ניתאי', burned_at: daysAgo(3), generator_id: null, note: null },
  { meter_id: 'mb4', serial: '33334444', site: 'יגור', site_id: null, meter_type: 'E360PP', address: 'לול 4',
    role_code: 20, ct_ratio: 1, parent_serial: '33334400', solar_names: null,
    status: 'burned', burned_by: 'אביאם', burned_at: daysAgo(5), generator_id: null, note: null },
  { meter_id: 'mb5', serial: '55556666', site: 'יגור', site_id: null, meter_type: 'E360CT', address: 'מחלבה',
    role_code: 20, ct_ratio: 40, parent_serial: '55556600', solar_names: 'סולארי מחלבה',
    status: 'burned', burned_by: 'אביאם', burned_at: daysAgo(5), generator_id: null, note: null },
];

export const GENERATORS: Array<Record<string, unknown>> = [];

export const FIXTURES: Fixtures = {
  kibbutzim: KIBBUTZIM, notes: NOTES, usage: USAGE_EVENTS, checkins: CHECKINS,
  burns: METER_BURNS, generators: GENERATORS,
};

// Goldens for the field flow (spec §5, guards §7k ג). Everything the arrival sheet, the
// briefing, the "היום" strip and the `visitCron` reminder decide is pinned here.
import { describe, expect, it } from 'vitest';
import {
  arrivalGroups, arrivalOrder, audienceFor, bulletForField, capBlocked, capFor, DAYLOG_NUDGES,
  dm, fieldShouldPrompt, hasSomethingToDeliver, hashIdx, inQuietHours, israelAt, israelParts,
  briefingAutoOpen, briefingTasks, burnRowsOf, burnSummary,
  leaveChecklist, nudgeFor, openItemsPrefill, openNudges, pushactParse, RECOUNT_NUDGES,
  reminderDueAt, splitOpenItems, todayStops, visitCronSelect, VISIT_NUDGES,
  ATT_MORNING_HH, attendanceCronRuns, EOD_DEFAULT_HH, eodHourFor,
  sharedOwners, VISIT_REASONS, visitReasonRequired, visitReasonText, visitReasonValid,
  joinVisitors, visitorsOf,
  type CheckinRow, type FieldTask,
} from './field';
import { burnLeaveItems } from './burns';

const task = (id: string, kibbutz: string, title: string, who?: string): FieldTask => ({
  id, kibbutz, title, assignee: who ? { firstName: who } : null,
});

describe('arrivalOrder', () => {
  const kibbutzim = ['גבים', 'גבת', 'מעוז חיים', 'גניגר', 'עין המפרץ', 'אלונים'];
  const myTasks = [
    task('1', 'גבים', 'מאזן אנרגיה בראשי', 'אביאם'),
    task('2', 'גבים', 'אספקה והתקנת מונים', 'אביאם'),
    task('3', 'מעוז חיים', 'הזמנת מונים', 'אביאם'),
  ];
  const visits = [
    { visitor: 'אביאם', kibbutz: 'גניגר', date: '2026-09-11' },
    { visitor: 'אביאם', kibbutz: 'עין המפרץ', date: '2026-09-09' },
    { visitor: 'ניתאי', kibbutz: 'גבת', date: '2026-09-15' },      // not mine → not "recent"
    { visitor: 'אביאם', kibbutz: 'אלונים', date: '2026-01-02' },   // older than 30 days
  ];
  const now = new Date('2026-09-17T09:00:00+03:00');

  it('groups: my tasks → recently visited → the rest', () => {
    const out = arrivalOrder({ kibbutzim, myTasks, visits, me: 'אביאם', now });
    expect(out.map(x => x.name)).toEqual(['גבים', 'מעוז חיים', 'גניגר', 'עין המפרץ', 'אלונים', 'גבת']);
    expect(out.map(x => x.group)).toEqual(['tasks', 'tasks', 'recent', 'recent', 'rest', 'rest']);
    expect(out[0].count).toBe(2);
    expect(out[0].why).toBe('מאזן אנרגיה בראשי · אספקה והתקנת מונים');
    expect(out[2].why).toBe('ביקור אחרון 11.9');
  });

  it('the day plan comes first, in the order he arranged it, and never twice', () => {
    const out = arrivalOrder({ kibbutzim, myTasks, visits, me: 'אביאם', now, plan: ['גבת', 'גבים'] });
    expect(out.slice(0, 2).map(x => x.name)).toEqual(['גבת', 'גבים']);
    expect(out.slice(0, 2).map(x => x.group)).toEqual(['plan', 'plan']);
    expect(out.filter(x => x.name === 'גבים')).toHaveLength(1);
    expect(out[0].why).toBe('משובץ למסלול של היום');
    expect(out[1].count).toBe(2);
  });

  it('ties inside a group break on the Hebrew alphabet', () => {
    const out = arrivalOrder({
      kibbutzim: ['גבת', 'אלונים'], me: 'אביאם', visits: [], now,
      myTasks: [task('a', 'גבת', 'x'), task('b', 'אלונים', 'y')],
    });
    expect(out.map(x => x.name)).toEqual(['אלונים', 'גבת']);
  });

  it('arrivalGroups drops the empty groups', () => {
    const out = arrivalGroups(arrivalOrder({ kibbutzim: ['גבים'], myTasks: [], visits: [], me: 'אביאם', now }));
    expect(out.map(g => g.group)).toEqual(['rest']);
  });
});

describe('fieldShouldPrompt', () => {
  const base = { me: 'אביאם', today: '2026-09-17' };
  it('a field worker with no check-in today is asked', () => {
    expect(fieldShouldPrompt(base)).toBe(true);
  });
  it('someone who is not field is never asked', () => {
    expect(fieldShouldPrompt({ ...base, me: 'עידן' })).toBe(false);
    expect(fieldShouldPrompt({ ...base, isViewer: true })).toBe(false);
  });
  it('after a check-in today, and after "לא בקיבוץ היום", he is left alone', () => {
    expect(fieldShouldPrompt({ ...base, checkin: { date: '2026-09-17', kibbutz: 'גבים' } })).toBe(false);
    expect(fieldShouldPrompt({ ...base, dismissedDate: '2026-09-17' })).toBe(false);
  });
  it('yesterday’s check-in and yesterday’s dismissal do not carry over', () => {
    expect(fieldShouldPrompt({ ...base, checkin: { date: '2026-09-16', kibbutz: 'גבים' } })).toBe(true);
    expect(fieldShouldPrompt({ ...base, dismissedDate: '2026-09-16' })).toBe(true);
  });
});

describe('the field view is clean (§5.1b)', () => {
  it('hides management signals from the field role only', () => {
    expect(audienceFor('field')).toEqual({
      health: false, onboarding: false, billing: false, officeNotes: false, usage: false, admin: false,
    });
    expect(audienceFor('pm').health).toBe(true);
  });
  it('bullets default to everyone; office-only ones are out', () => {
    expect(bulletForField(null)).toBe(true);
    expect(bulletForField('all')).toBe(true);
    expect(bulletForField('field')).toBe(true);
    expect(bulletForField('office')).toBe(false);
  });
});

describe('leaveChecklist ("לפני שיוצאים")', () => {
  const input = {
    me: 'אביאם',
    kibbutz: 'גבים',
    tasks: [task('9', 'גבים', 'הסבת בקרים', 'ניתאי'), task('1', 'גבים', 'מאזן אנרגיה בראשי', 'אביאם')],
    prevVisit: {
      visitor: 'ניתאי', kibbutz: 'גבים', date: '2026-09-02',
      open_items: 'מונה 133 — CT חלופי\nלבדוק כופל במונה הראשי',
    },
    orders: [
      { id: 'o119abcdef', kibbutz: 'גבים', order_type: 'customer', status: 'pending', items: [{ product: 'E360CT', qty: 2 }] },
      { id: 'o120', kibbutz: 'גבים', order_type: 'customer', status: 'delivered', items: [{ product: 'E360', qty: 5 }] },
      { id: 'o121', kibbutz: 'גבת', order_type: 'customer', status: 'pending', items: [{ product: 'E360', qty: 1 }] },
    ],
  };

  it('my tasks first, then the others, then what the last visit left open, then the order', () => {
    const out = leaveChecklist(input);
    expect(out.map(x => x.kind)).toEqual(['task', 'task', 'prev', 'prev', 'order']);
    expect(out[0].text).toBe('מאזן אנרגיה בראשי');
    expect(out[0].sub).toBe('משימת EMS · באחריותך');
    expect(out[1].sub).toBe('משימת EMS · ניתאי');
    expect(out[2].sub).toBe('נשאר פתוח מהביקור הקודם (ניתאי, 2.9)');
    expect(out[4].text).toBe('לספק 2 × E360CT');
  });

  it('what he did NOT tick is what pre-fills "מה נשאר לי פתוח"', () => {
    const out = leaveChecklist(input);
    const checked = { [out[0].id]: true, [out[2].id]: true };
    expect(openItemsPrefill(out, checked).split('\n')).toEqual([
      'הסבת בקרים', 'לבדוק כופל במונה הראשי', 'לספק 2 × E360CT',
    ]);
    expect(openItemsPrefill(out, {}).split('\n')).toHaveLength(5);
  });

  // 🔥 צריבות (Task 23) — the pending meters ride in as rows of kind `burn`.
  it('🔥 rows come LAST, so a temporary project never pushes the kibbutz own work down', () => {
    const burns = burnLeaveItems([
      { meter_id: 'b1', serial: '68369287', site: 'גבים', meter_type: 'E360CT', ct_ratio: 50, address: 'רפת 7', status: 'pending', parent_serial: '900' },
      { meter_id: 'b2', serial: '59965612', site: 'גבים', meter_type: 'E360PP', status: 'burned', parent_serial: '900' },
    ], 'גבים');
    const out = leaveChecklist({ ...input, burns });
    expect(out.map(x => x.kind)).toEqual(['task', 'task', 'prev', 'prev', 'order', 'burn']);
    expect(out[5].text).toBe('לצרוב מונה 68369287 · רפת 7');
    expect((out[5] as { meterId?: string }).meterId).toBe('b1');
  });

  it('🔥 rows are NEVER pre-filled into "מה נשאר לי פתוח" — they live in meter_burns', () => {
    const burns = burnLeaveItems([
      { meter_id: 'b1', serial: '68369287', site: 'גבים', meter_type: 'E360CT', status: 'pending', parent_serial: '900' },
      { meter_id: 'b2', serial: '11112222', site: 'גבים', meter_type: 'E360PP', status: 'pending', parent_serial: '900' },
    ], 'גבים');
    const out = leaveChecklist({ ...input, burns });
    const text = openItemsPrefill(out, {});
      expect(text.split('\n')).toHaveLength(5);            // the same five as without burns
    expect(text).not.toMatch(/לצרוב/);
  });

  it('no burns passed in is the same checklist as before (the surface is optional)', () => {
    expect(leaveChecklist({ ...input, burns: [] })).toEqual(leaveChecklist(input));
  });

  it('splitOpenItems copes with bullets, dashes and semicolons', () => {
    expect(splitOpenItems('• אחד\n- שתיים; שלוש')).toEqual(['אחד', 'שתיים', 'שלוש']);
    expect(splitOpenItems('')).toEqual([]);
  });
});

describe('hasSomethingToDeliver — no button without purpose', () => {
  const orders = [{ id: 'o1', kibbutz: 'גבים', order_type: 'customer', status: 'pending', items: [{ product: 'E360', qty: 1 }] }];
  it('an open customer order counts', () => {
    expect(hasSomethingToDeliver('גבים', orders)).toBe(true);
    expect(hasSomethingToDeliver('גבת', orders)).toBe(false);
  });
  it('a delivered order does not', () => {
    expect(hasSomethingToDeliver('גבים', [{ ...orders[0], status: 'delivered' }])).toBe(false);
  });
  it('products already ticked in today’s draft count', () => {
    const draft = { id: 'd', person: 'אביאם', kibbutz: 'גבת', date: '2026-09-17', payload: { items: [{ product: 'E360', qty: 2 }] } };
    expect(hasSomethingToDeliver('גבת', [], draft)).toBe(true);
    expect(hasSomethingToDeliver('גבת', [], { ...draft, payload: { items: [] } })).toBe(false);
  });
});

describe('the "היום" strip (§7k #11)', () => {
  const today = '2026-09-17';
  const checkins: CheckinRow[] = [
    { id: 'c1', person: 'אביאם', kibbutz: 'גבים', checked_in_at: '2026-09-17T06:12:00Z' },
    { id: 'c2', person: 'ניתאי', kibbutz: 'שריד', checked_in_at: '2026-09-17T06:30:00Z' },
  ];
  it('the plan sets the order; a check-in outside it is appended; a filed visit strikes it out', () => {
    const out = todayStops({
      me: 'אביאם', today, checkins,
      visits: [{ visitor: 'אביאם', kibbutz: 'גבים', date: today }],
      plan: ['גבים', 'גבת'], tasksByKibbutz: { 'גבת': 2 },
    });
    expect(out.map(s => [s.n, s.name, s.done])).toEqual([[1, 'גבים', true], [2, 'גבת', false]]);
    expect(out[0].note).toMatch(/^צ׳ק-אין \d{2}:\d{2}$/);
    expect(out[1].note).toBe('2 משימות');
  });
  it('without a plan the strip is simply where he checked in — his own stops only', () => {
    const out = todayStops({ me: 'אביאם', today, checkins, visits: [] });
    expect(out.map(s => s.name)).toEqual(['גבים']);
  });
});

describe('the in-app nudge banner (§7k #4)', () => {
  const now = new Date('2026-09-17T11:30:00+03:00');
  const c: CheckinRow = { id: 'c1', person: 'אביאם', kibbutz: 'גבים', checked_in_at: '2026-09-17T09:12:00+03:00' };
  it('appears two hours after a check-in with no visit', () => {
    const out = openNudges({ me: 'אביאם', checkins: [c], visits: [], now });
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe('גבים — עוד לא סיכמת את הביקור (שעתיים)');
  });
  it('not before two hours, not once the visit is filed, not when dismissed', () => {
    expect(openNudges({ me: 'אביאם', checkins: [c], visits: [], now: new Date('2026-09-17T11:00:00+03:00') })).toEqual([]);
    expect(openNudges({ me: 'אביאם', checkins: [c], visits: [{ visitor: 'אביאם', kibbutz: 'גבים', date: '2026-09-17' }], now })).toEqual([]);
    expect(openNudges({ me: 'אביאם', checkins: [{ ...c, dismissed: true }], visits: [], now })).toEqual([]);
  });
  it('a draft changes the words (§5.1c)', () => {
    const out = openNudges({
      me: 'אביאם', checkins: [c], visits: [], now,
      drafts: [{ id: 'd', person: 'אביאם', kibbutz: 'גבים', date: '2026-09-17' }],
    });
    expect(out[0].text).toBe('יש לך טיוטה פתוחה על גבים — עוד דקה וזה סגור');
  });
});

describe('the copy pool (§5.2 + §7k ג)', () => {
  it('holds §5.2’s sixteen plus the three visit-context variants', () => {
    expect(VISIT_NUDGES).toHaveLength(19);
    expect(VISIT_NUDGES[0].t).toBe('עוד לא סיכמת את הביקור');
    expect(DAYLOG_NUDGES).toHaveLength(3);
    expect(RECOUNT_NUDGES).toHaveLength(4);
  });

  it('hashIdx is deterministic and in range for a thousand ids', () => {
    const seen = new Set<number>();
    for (let n = 0; n < 1000; n++) {
      const id = 'checkin-' + n + '-' + (n * 7919).toString(16);
      const a = hashIdx(id, VISIT_NUDGES.length);
      expect(a).toBe(hashIdx(id, VISIT_NUDGES.length));
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(VISIT_NUDGES.length);
      seen.add(a);
    }
    expect(seen.size).toBe(VISIT_NUDGES.length);   // the pool is actually spread over
  });

  it('every {kibbutz} is substituted and the title is always prefixed', () => {
    for (let n = 0; n < VISIT_NUDGES.length; n++) {
      const { title, body } = nudgeFor('id-' + n, 'גבים');
      expect(title.startsWith('📍 גבים — ')).toBe(true);
      expect(body).not.toContain('{kibbutz}');
    }
  });

  it('the tone rule: no threat, no system talk', () => {
    for (const n of [...VISIT_NUDGES, ...DAYLOG_NUDGES, ...RECOUNT_NUDGES]) {
      const s = n.t + ' ' + n.b;
      expect(s).not.toMatch(/לא נספר|חובה|Supabase|RLS|אוטומטי/);
      expect(s).not.toMatch(/עמיחי|עידן/);
    }
  });

  it('a draft gets its own line', () => {
    expect(nudgeFor('anything', 'גבים', true).body).toBe('יש לך טיוטה פתוחה על גבים — עוד דקה וזה סגור ✍️');
  });
});

describe('israel time', () => {
  it('reads the wall clock in Asia/Jerusalem, summer and winter', () => {
    expect(israelParts('2026-09-17T06:12:00Z')).toEqual({ date: '2026-09-17', hh: 9, mm: 12 });
    expect(israelParts('2026-01-17T06:12:00Z')).toEqual({ date: '2026-01-17', hh: 8, mm: 12 });
  });
  it('israelAt pins an hour on that local day', () => {
    expect(new Date(israelAt('2026-09-17T06:12:00Z', 20, 0)).toISOString()).toBe('2026-09-17T17:00:00.000Z');
  });
  it('quiet hours are 21:00 → 06:30 Israel', () => {
    expect(inQuietHours('2026-09-17T18:05:00Z')).toBe(true);    // 21:05
    expect(inQuietHours('2026-09-17T16:59:00Z')).toBe(false);   // 19:59
    expect(inQuietHours('2026-09-17T03:15:00Z')).toBe(true);    // 06:15
    expect(inQuietHours('2026-09-17T03:35:00Z')).toBe(false);   // 06:35
  });
  it('the reminder is due at +2 h', () => {
    expect(reminderDueAt('2026-09-17T09:12:00+03:00')).toBe(+new Date('2026-09-17T11:12:00+03:00'));
    expect(reminderDueAt('2026-09-17T06:00:00+03:00')).toBe(+new Date('2026-09-17T08:00:00+03:00'));
    expect(reminderDueAt('2026-09-17T17:30:00+03:00')).toBe(+new Date('2026-09-17T19:30:00+03:00'));
  });

  it('20:00 only ever pulls it EARLIER, and never closer than 30 min to the arrival (fix 1)', () => {
    // +2 h would be 20:30 → 20:00, and 20:00 is 1.5 h after he arrived: fine.
    expect(reminderDueAt('2026-09-17T18:30:00+03:00')).toBe(+new Date('2026-09-17T20:00:00+03:00'));
    // exactly the 30 min floor — still allowed
    expect(reminderDueAt('2026-09-17T19:30:00+03:00')).toBe(+new Date('2026-09-17T20:00:00+03:00'));
  });

  it('an arrival too late in the day gets NO push at all — the banner carries it', () => {
    expect(reminderDueAt('2026-09-17T19:40:00+03:00')).toBeNull();   // 20 min — under the floor
    expect(reminderDueAt('2026-09-17T19:45:00+03:00')).toBeNull();
    expect(reminderDueAt('2026-09-17T20:30:00+03:00')).toBeNull();
    expect(reminderDueAt('not a date')).toBeNull();
  });
});

describe('the daily caps (§7k ג, as fix round 1 settled them)', () => {
  it('attendance and the digest are exempt; visits get 2, gaps 1, everything else 3', () => {
    expect(capFor('attendanceCron')).toBeNull();
    expect(capFor('attendanceReminder')).toBeNull();
    expect(capFor('usageDigest')).toBeNull();
    expect(capFor('inventoryDigest')).toBeNull();   // the 12:00/17:00 stock digest is a report too
    expect(capFor('visitCron')).toBe(2);
    expect(capFor('gapReminder')).toBe(1);
    expect(capFor('somethingNew')).toBe(3);
  });

  it('an exempt mode always sends, however full the day is', () => {
    expect(capBlocked('attendanceCron', 9, 9)).toBe(false);
  });

  it('the mode ceiling bites before the global one', () => {
    expect(capBlocked('visitCron', 1, 1)).toBe(false);
    expect(capBlocked('visitCron', 2, 2)).toBe('mode cap');
    expect(capBlocked('gapReminder', 1, 1)).toBe('mode cap');
  });

  it('the global ceiling is the sum of the capped modes', () => {
    // two visit nudges + one gap already out → the day is full for everything capped
    expect(capBlocked('gapReminder', 3, 0)).toBe('daily cap');
    expect(capBlocked('visitCron', 3, 0)).toBe('daily cap');
  });
});

describe('visitCronSelect', () => {
  const nowIso = '2026-09-17T09:00:00Z';           // 12:00 Israel
  const mk = (over: Partial<CheckinRow> = {}): CheckinRow => ({
    id: 'c1', person: 'אביאם', kibbutz: 'גבים', checked_in_at: '2026-09-17T06:00:00Z', ...over,
  });
  const run = (checkins: CheckinRow[], rest: Partial<Parameters<typeof visitCronSelect>[0]> = {}) =>
    visitCronSelect({ checkins, visits: [], nowIso, ...rest });

  it('1 h 59 → too early; 2 h 01 → reminded', () => {
    expect(run([mk({ checked_in_at: '2026-09-17T07:01:00Z' })]).skip[0].reason).toBe('too early');
    expect(run([mk({ checked_in_at: '2026-09-17T06:59:00Z' })]).remind.map(r => r.id)).toEqual(['c1']);
  });

  it('a filed visit, a dismissal, an already-sent reminder and a 15 h-old row are all skipped', () => {
    expect(run([mk()], { visits: [{ visitor: 'אביאם', kibbutz: 'גבים', date: '2026-09-17' }] }).skip[0].reason)
      .toBe('visit exists');
    expect(run([mk({ dismissed: true })]).skip[0].reason).toBe('dismissed');
    expect(run([mk({ reminded_at: '2026-09-17T08:00:00Z' })]).skip[0].reason).toBe('reminded');
    expect(run([mk({ checked_in_at: '2026-09-16T17:00:00Z' })]).skip[0].reason).toBe('too old');
  });

  it('a visit filed by somebody else at the same kibbutz does not count as his', () => {
    expect(run([mk()], { visits: [{ visitor: 'ניתאי', kibbutz: 'גבים', date: '2026-09-17' }] }).remind).toHaveLength(1);
  });

  it('quiet hours hold everything (§7k ג)', () => {
    const plan = visitCronSelect({ checkins: [mk({ checked_in_at: '2026-09-17T15:00:00Z' })], visits: [], nowIso: '2026-09-17T18:30:00Z' });
    expect(plan.skip[0].reason).toBe('quiet hours');
  });

  it('TWO visit nudges a day is the ceiling, and this run counts towards it', () => {
    const three = ['a', 'b', 'c'].map((id, n) =>
      mk({ id, kibbutz: 'ק' + n, checked_in_at: '2026-09-17T0' + n + ':00:00Z' }));
    const plan = run(three);
    expect(plan.remind.map(r => r.id)).toEqual(['a', 'b']);
    expect(plan.skip).toEqual([{ id: 'c', reason: 'mode cap' }]);
  });

  it('visit nudges already sent today count; the attendance nudges he got do not', () => {
    expect(run([mk()], { sentTodayVisit: { 'אביאם': 2 } }).skip[0].reason).toBe('mode cap');
    // `sentToday` is fed ONLY the capped modes (push-send filters attendance out), so a full
    // day of other capped pushes is what closes the door here.
    expect(run([mk()], { sentToday: { 'אביאם': 3 } }).skip[0].reason).toBe('daily cap');
    expect(run([mk()], { sentToday: { 'ניתאי': 3 }, sentTodayVisit: { 'ניתאי': 2 } }).remind).toHaveLength(1);
  });

  it('a filed visit and a too-late arrival are SETTLED, so the cron stops re-reading them', () => {
    const filed = run([mk()], { visits: [{ visitor: 'אביאם', kibbutz: 'גבים', date: '2026-09-17' }] });
    expect(filed.settle).toEqual([{ id: 'c1', reason: 'visit exists' }]);
    const late = visitCronSelect({
      checkins: [mk({ checked_in_at: '2026-09-17T16:45:00Z' })],   // 19:45 Israel
      visits: [], nowIso: '2026-09-17T17:30:00Z',
    });
    expect(late.remind).toEqual([]);
    expect(late.settle).toEqual([{ id: 'c1', reason: 'late' }]);
  });

  it('a row that is merely waiting is NOT settled', () => {
    expect(run([mk({ checked_in_at: '2026-09-17T07:01:00Z' })]).settle).toEqual([]);
  });

  it('a draft does not stop the nudge — it changes its words (§5.1c)', () => {
    const plan = run([mk()], { drafts: [{ id: 'd', person: 'אביאם', kibbutz: 'גבים', date: '2026-09-17' }] });
    expect(plan.remind[0].hasDraft).toBe(true);
  });
});

describe('pushactParse', () => {
  it('reads the visit deep link, kibbutz and all', () => {
    expect(pushactParse('?pushact=visit&kibbutz=%D7%92%D7%91%D7%99%D7%9D'))
      .toEqual({ act: 'visit', kibbutz: 'גבים' });
  });
  it('reads the dismissal', () => {
    expect(pushactParse('?pushact=visitDismiss&cid=abc')).toEqual({ act: 'visitDismiss', cid: 'abc' });
  });
  it('nothing to do without the parameter', () => {
    expect(pushactParse('?x=1')).toBeNull();
    expect(pushactParse('')).toBeNull();
  });
});

describe('dm', () => {
  it('formats the short date a field worker reads', () => {
    expect(dm('2026-09-02')).toBe('2.9');
    expect(dm(null)).toBe('');
  });
});


// ───────────── ⏰ the attendance cron's two hours (spec §7h) ─────────────
describe('eodHourFor', () => {
  it('is 19:00 for anyone who never chose', () => {
    expect(EOD_DEFAULT_HH).toBe(19);
    expect(eodHourFor('אביאם', {})).toBe(19);
    expect(eodHourFor('אביאם', null)).toBe(19);
    expect(eodHourFor('אביאם', { אביאם: null })).toBe(19);
  });
  it('honours his own hour', () => {
    expect(eodHourFor('אביאם', { אביאם: 18, ניתאי: 21 })).toBe(18);
  });
  it('honours the ends of the picker range, 17 and 20', () => {
    expect(eodHourFor('אביאם', { אביאם: 17 })).toBe(17);
    expect(eodHourFor('אביאם', { אביאם: 20 })).toBe(20);
  });
  it('a value that is not an hour is not an hour', () => {
    for (const bad of [24, -1, 7.5, NaN, 'שש' as unknown as number])
      expect(eodHourFor('אביאם', { אביאם: bad })).toBe(19);
  });
  it('clamped to the Settings picker range 17–20 (FIX ROUND 1, task-15 review Minor #2) — a ' +
    'stray/legacy value outside it falls back to the default instead of being honored', () => {
    for (const outside of [0, 16, 21, 23])
      expect(eodHourFor('אביאם', { אביאם: outside })).toBe(19);
  });
});

describe('attendanceCronRuns', () => {
  const people = ['אביאם', 'ניתאי'];

  it('09:00 is the morning nudge, for everyone', () => {
    expect(ATT_MORNING_HH).toBe(9);
    expect(attendanceCronRuns(9, people, {})).toEqual([
      { person: 'אביאם', kind: 'morning' }, { person: 'ניתאי', kind: 'morning' },
    ]);
  });

  it('19:00 is the evening nudge for whoever did not choose', () => {
    expect(attendanceCronRuns(19, people, {})).toEqual([
      { person: 'אביאם', kind: 'evening' }, { person: 'ניתאי', kind: 'evening' },
    ]);
  });

  it('a chosen hour moves that person and nobody else', () => {
    expect(attendanceCronRuns(18, people, { אביאם: 18 })).toEqual([{ person: 'אביאם', kind: 'evening' }]);
    expect(attendanceCronRuns(19, people, { אביאם: 18 })).toEqual([{ person: 'ניתאי', kind: 'evening' }]);
  });

  it('any other hour has nothing to say', () => {
    expect(attendanceCronRuns(14, people, { אביאם: 18 })).toEqual([]);
    expect(attendanceCronRuns(19, [], {})).toEqual([]);
  });

  it('a holiday silences the evening half only', () => {
    expect(attendanceCronRuns(19, people, {}, true)).toEqual([]);
    expect(attendanceCronRuns(9, people, {}, true))
      .toEqual([{ person: 'אביאם', kind: 'morning' }, { person: 'ניתאי', kind: 'morning' }]);
  });

  it('a stored hour outside the 17–20 picker range falls back to the 19:00 default ' +
    '(FIX ROUND 1, task-15 review Minor #2 — 09:00 is no longer a reachable evening choice, ' +
    'so it can no longer collide with the fixed 09:00 morning slot)', () => {
    expect(attendanceCronRuns(9, ['אביאם'], { אביאם: 9 }))
      .toEqual([{ person: 'אביאם', kind: 'morning' }]);
    expect(attendanceCronRuns(19, ['אביאם'], { אביאם: 9 }))
      .toEqual([{ person: 'אביאם', kind: 'evening' }]);
  });
});

// ───────────── round 2 · package G — the briefing ─────────────

describe('briefingTasks (G4)', () => {
  const rows = [
    { id: '1', title: 'בלי תאריך' },
    { id: '2', title: 'לעוד חודשיים', expectedCompletionDate: '2027-01-01' },
    { id: '3', title: 'באיחור', expectedCompletionDate: '2020-01-01' },
    { id: '4', title: 'נסגרה', status: 'done' },
    { id: '5', title: 'נדחתה', status: 'rejected' },
  ] as FieldTask[];

  it('every OPEN task of the kibbutz, whatever EMS calls its due date', () => {
    expect(briefingTasks(rows).map(t => t.id)).toEqual(['1', '2', '3']);
  });
  it('nothing in, nothing out', () => {
    expect(briefingTasks(null)).toEqual([]);
    expect(briefingTasks([])).toEqual([]);
  });
});

describe('🔥 as a collapsed category (G6)', () => {
  const items = [
    { id: 'task:1', text: 'משימה', sub: '', kind: 'task' as const },
    { id: 'burn:a', text: 'מונה 1', sub: '', kind: 'burn' as const },
    { id: 'burn:b', text: 'מונה 2', sub: '', kind: 'burn' as const },
  ];
  it('the 🔥 rows are their own category', () => {
    expect(burnRowsOf(items).map(x => x.id)).toEqual(['burn:a', 'burn:b']);
  });
  it('the summary line counts what is still OPEN', () => {
    expect(burnSummary(items)).toBe('2 מונים ממתינים לצריבה');
    expect(burnSummary(items, { 'burn:a': true })).toBe('מונה אחד ממתין לצריבה');
    expect(burnSummary(items, { 'burn:a': true, 'burn:b': true })).toBe('הכל נצרב כאן');
  });
  it('no 🔥 rows, no category and no line', () => {
    expect(burnSummary([{ id: 'task:1', text: 'x', sub: '', kind: 'task' }])).toBe('');
  });
});

describe('briefingAutoOpen (G6)', () => {
  const base = { today: '2026-09-22', stops: ['גבת', 'דגניה'] };
  it('opens the first stop on the first entry of the day', () => {
    expect(briefingAutoOpen({ ...base, lastShown: null })).toBe('גבת');
    expect(briefingAutoOpen({ ...base, lastShown: '2026-09-21' })).toBe('גבת');
  });
  it('…and only once — a reload later the same day opens nothing', () => {
    expect(briefingAutoOpen({ ...base, lastShown: '2026-09-22' })).toBe('');
  });
  it('no route, no briefing', () => {
    expect(briefingAutoOpen({ today: '2026-09-22', stops: [], lastShown: null })).toBe('');
    expect(briefingAutoOpen({ today: '2026-09-22', stops: ['  '], lastShown: null })).toBe('');
  });
  it('a viewer is never interrupted', () => {
    expect(briefingAutoOpen({ ...base, lastShown: null, isViewer: true })).toBe('');
  });
});

// ───────────── the visit summary's EMS link + סיבת הביקור (QA round 2, C6) ─────────────

describe('sharedOwners', () => {
  it('the two field people cover for each other, and the reader comes first', () => {
    expect(sharedOwners('אביאם')).toEqual(['אביאם', 'ניתאי']);
    expect(sharedOwners('ניתאי')).toEqual(['ניתאי', 'אביאם']);
  });

  it('everyone else sees their own and nobody elses', () => {
    expect(sharedOwners('עידן')).toEqual(['עידן']);
    expect(sharedOwners('עמיחי')).toEqual(['עמיחי']);
  });

  it('nobody signed in is an empty list, never a crash', () => {
    expect(sharedOwners('')).toEqual([]);
    expect(sharedOwners(null)).toEqual([]);
    expect(sharedOwners(undefined)).toEqual([]);
    expect(sharedOwners('  ')).toEqual([]);
  });
});

describe('סיבת הביקור', () => {
  it('there are exactly five, and only the last one is free text', () => {
    expect(VISIT_REASONS).toHaveLength(5);
    expect(VISIT_REASONS.filter(r => r.free).map(r => r.id)).toEqual(['other']);
    expect(VISIT_REASONS[0].id).toBe('called');
  });

  it('linking anything at all IS the reason — the chips are only asked for when nothing is', () => {
    expect(visitReasonRequired({})).toBe(true);
    expect(visitReasonRequired({ emsTaskIds: [], internalTaskIds: [] })).toBe(true);
    expect(visitReasonRequired({ emsTaskIds: ['T-1'] })).toBe(false);
    expect(visitReasonRequired({ internalTaskIds: ['i-1'] })).toBe(false);
  });

  it('a fixed chip stores its own words', () => {
    expect(visitReasonText('fault', '')).toBe('תקלה');
    expect(visitReasonValid('planned', '')).toBe(true);
  });

  it('אחר is answered only once something is typed into it', () => {
    expect(visitReasonValid('other', '')).toBe(false);
    expect(visitReasonValid('other', '   ')).toBe(false);
    expect(visitReasonValid('other', 'הייתי באזור')).toBe(true);
    expect(visitReasonText('other', ' הייתי באזור ')).toBe('הייתי באזור');
  });

  it('no chip picked is never valid', () => {
    expect(visitReasonValid('', '')).toBe(false);
    expect(visitReasonValid(null, 'טקסט')).toBe(false);
    expect(visitReasonText('nonsense', 'x')).toBe('');
  });
});

describe('visitorsOf / joinVisitors (round 5 V13: מי ביקר is multi-select)', () => {
  it('P1 one name', () => expect(visitorsOf({ visitor: 'אביאם' })).toEqual(['אביאם']));
  it('P2 a list', () => expect(visitorsOf({ visitor: 'אביאם, ניתאי' })).toEqual(['אביאם', 'ניתאי']));
  it('P3 stray separators and spaces', () => expect(visitorsOf('  אביאם ,, ניתאי , ')).toEqual(['אביאם', 'ניתאי']));
  it('P4 empty / missing', () => { expect(visitorsOf({})).toEqual([]); expect(visitorsOf(null)).toEqual([]); });
  it('P5 join dedupes and keeps order', () => expect(joinVisitors(['אביאם', 'ניתאי', 'אביאם', ' '])).toBe('אביאם, ניתאי'));
  it('P6 round trip', () => expect(visitorsOf(joinVisitors(['עמיחי', 'אביאם']))).toEqual(['עמיחי', 'אביאם']));
});

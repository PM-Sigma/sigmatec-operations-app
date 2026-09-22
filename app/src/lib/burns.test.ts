// 🔥 צריבות goldens (Task 23). The chip count, the briefing rows, hide-at-zero, the role
// matrix (incl. the viewer regression assert) and the removal flag — every rule the four
// surfaces are built on, asserted here so the components stay rendering shells.
import { afterEach, describe, expect, it } from 'vitest';
import {
  BURN_VISUAL_LABEL, burnChip, burnCounts, burnLeaveItems, burnOpenWork, burnProgress,
  burnSitesWithPending, burnStripText, burnVisual, burnWarnings, burnedPatch, burnsForSite,
  burnsProjectActive, canSeeBurns, canWriteBurns, clearIssuePatch, generatorPatch,
  generatorsForSite, issuePatch, unburnedPatch, type BurnRow,
} from '@/lib/burns';

const row = (o: Partial<BurnRow> & { meter_id: string; site: string }): BurnRow => ({
  serial: o.meter_id, meter_type: 'E360PP', status: 'pending', parent_serial: '900', ...o,
});

// אור הנר: 1 CT pending · 1 PP burned · 1 PP issue      → 2 left of 3
// מעוז חיים: 2 PP burned                                 → 0 left of 2 (done)
// שלוחות: 1 CT pending                                   → 1 left of 1
const ROWS: BurnRow[] = [
  row({ meter_id: 'a1', site: 'אור הנר', serial: '68369287', meter_type: 'E360CT', ct_ratio: 50, address: 'רפת 7' }),
  row({ meter_id: 'a2', site: 'אור הנר', serial: '59965612', status: 'burned', burned_by: 'אביאם' }),
  row({ meter_id: 'a3', site: 'אור הנר', serial: '11112222', status: 'issue', note: 'אין גישה' }),
  row({ meter_id: 'm1', site: 'מעוז חיים', serial: '22221111', status: 'burned' }),
  row({ meter_id: 'm2', site: 'מעוז חיים', serial: '22223333', status: 'burned' }),
  row({ meter_id: 's1', site: 'שלוחות', serial: '33334444', meter_type: 'E360CT', ct_ratio: 1, parent_serial: null }),
];

afterEach(() => { delete (globalThis as any).BURNS_PROJECT_ACTIVE; });

describe('the removal path — one flag', () => {
  it('is ACTIVE by default (no flag on the page = the legacy bundle has not loaded)', () => {
    expect(burnsProjectActive()).toBe(true);
  });

  it('BURNS_PROJECT_ACTIVE = false hides EVERY surface, and the data is untouched', () => {
    (globalThis as any).BURNS_PROJECT_ACTIVE = false;
    expect(burnsProjectActive()).toBe(false);
    expect(burnChip(ROWS, 'אור הנר')).toBeNull();                 // 1. the card chip
    expect(burnLeaveItems(ROWS, 'אור הנר')).toEqual([]);          // 3. the briefing rows
    expect(canSeeBurns('אביאם', false)).toBe(false);              // 2. the modal section + 4. the table
    expect(canWriteBurns('עידן', false)).toBe(false);
    expect(burnOpenWork(ROWS, 'אור הנר')).toBe(0);
    // …and the rows themselves are still there for the report
    expect(burnCounts(ROWS).total).toBe(6);
    expect(burnProgress(ROWS).done).toBe(3);
  });

  it('true is the same as absent', () => {
    (globalThis as any).BURNS_PROJECT_ACTIVE = true;
    expect(burnsProjectActive()).toBe(true);
    expect(burnChip(ROWS, 'אור הנר')?.remaining).toBe(2);
  });
});

describe('the role matrix (spec audience, restored by עידן 18.9)', () => {
  it('the field team and the two managers write', () => {
    for (const who of ['אביאם', 'ניתאי', 'עידן', 'עמיחי']) {
      expect(canSeeBurns(who, false), who).toBe(true);
      expect(canWriteBurns(who, false), who).toBe(true);
    }
  });

  it('VIEWER REGRESSION: a viewer reads everything and writes nothing — even under a name that could', () => {
    expect(canSeeBurns('צופה', true)).toBe(true);
    expect(canWriteBurns('צופה', true)).toBe(false);
    // the PIN role wins over the name, exactly like canManageKibbutzim (viewerGate.test.ts)
    expect(canSeeBurns('עידן', true)).toBe(true);
    expect(canWriteBurns('עידן', true)).toBe(false);
    expect(canWriteBurns('אביאם', true)).toBe(false);
  });

  it('hidden from מתניה and אליה — no surface at all', () => {
    for (const who of ['מתניה', 'אליה']) {
      expect(canSeeBurns(who, false), who).toBe(false);
      expect(canWriteBurns(who, false), who).toBe(false);
    }
  });

  it('an unknown name sees nothing — a temporary project does not widen by accident', () => {
    expect(canSeeBurns('אבצן', false)).toBe(false);
    expect(canSeeBurns('', false)).toBe(false);
    expect(canSeeBurns('  ', false)).toBe(false);
  });

  it('a name is matched trimmed, not loosely', () => {
    expect(canSeeBurns('  אביאם  ', false)).toBe(true);
    expect(canSeeBurns('אביאמי', false)).toBe(false);
  });
});

describe('row state', () => {
  it('a burned CT is coloured 🟣, a burned PP is plain ✅ — colour, not a fourth status', () => {
    expect(burnVisual(ROWS[0])).toBe('pending');
    expect(burnVisual(ROWS[1])).toBe('burned');
    expect(burnVisual(ROWS[2])).toBe('issue');
    expect(burnVisual({ ...ROWS[0], status: 'burned' })).toBe('burned-ct');
    expect(BURN_VISUAL_LABEL['burned-ct']).toBe('🟣 נצרב');
  });

  it('an SP meter is not a CT', () => {
    expect(burnVisual({ ...ROWS[1], meter_type: 'E360SP', status: 'burned' })).toBe('burned');
  });

  it('warns about the two EMS data problems the field has to fix first', () => {
    expect(burnWarnings(ROWS[0])).toEqual([]);
    expect(burnWarnings(ROWS[5])).toEqual(['⚠️ אין מונה אב', '🔴 יחס CT חסר ב-EMS']);
  });
});

describe('the card chip — 🔥 נותרו X/Y', () => {
  it('counts pending AND issue as "left" — a meter with a problem is not burned', () => {
    expect(burnChip(ROWS, 'אור הנר')).toEqual({ remaining: 2, total: 3, text: '🔥 נותרו 2/3' });
  });

  it('HIDE AT ZERO: a finished kibbutz shows nothing, never a stale 0/2', () => {
    expect(burnChip(ROWS, 'מעוז חיים')).toBeNull();
  });

  it('a kibbutz with no meters at all has no chip', () => {
    expect(burnChip(ROWS, 'דפנה')).toBeNull();
    expect(burnChip([], 'אור הנר')).toBeNull();
    expect(burnChip(null, 'אור הנר')).toBeNull();
  });

  it('matches the site trimmed, and never on an empty name', () => {
    expect(burnChip(ROWS, '  אור הנר ')?.remaining).toBe(2);
    expect(burnChip(ROWS, '')).toBeNull();
  });

  it('burnOpenWork is the same number — the card and the health signals cannot disagree', () => {
    expect(burnOpenWork(ROWS, 'אור הנר')).toBe(2);
    expect(burnOpenWork(ROWS, 'מעוז חיים')).toBe(0);
    expect(burnOpenWork(ROWS, 'שלוחות')).toBe(1);
  });
});

describe('counts and per-site ordering', () => {
  it('counts every bucket', () => {
    expect(burnCounts(ROWS)).toEqual({ total: 6, pending: 2, burned: 3, issue: 1, ct: 2, pp: 4 });
    expect(burnCounts([])).toEqual({ total: 0, pending: 0, burned: 0, issue: 0, ct: 0, pp: 0 });
  });

  it('not-done first, CT before PP, then serial — a stable list under a tap', () => {
    expect(burnsForSite(ROWS, 'אור הנר').map(r => r.meter_id)).toEqual(['a1', 'a3', 'a2']);
  });

  it('a site with no rows is an empty list, not a throw', () => {
    expect(burnsForSite(ROWS, 'לא קיים')).toEqual([]);
    expect(burnsForSite(undefined, 'אור הנר')).toEqual([]);
  });
});

describe('the progress strip', () => {
  const p = burnProgress(ROWS);

  it('totals the whole project and each kibbutz', () => {
    expect({ total: p.total, done: p.done, remaining: p.remaining, pct: p.pct, sitesLeft: p.sitesLeft })
      .toEqual({ total: 6, done: 3, remaining: 3, pct: 50, sitesLeft: 2 });
  });

  it('most-left first, then alphabetical (he) — the work pushes itself forward', () => {
    expect(p.sites.map(s => s.site)).toEqual(['אור הנר', 'שלוחות', 'מעוז חיים']);
    expect(p.sites[2]).toEqual({ site: 'מעוז חיים', total: 2, done: 2, remaining: 0, pct: 100 });
  });

  it('the tap target is exactly the kibbutzim with something open', () => {
    expect(burnSitesWithPending(ROWS)).toEqual(['אור הנר', 'שלוחות']);
  });

  it('the field team is told what is LEFT; everyone else how far it has got (עידן 21:50)', () => {
    expect(burnStripText(p, 'field')).toBe('🔥 צריבות · נותרו 3 ב-2 קיבוצים');
    expect(burnStripText(p, 'other')).toBe('🔥 צריבות · בוצעו 3 מתוך 6 · 50%');
  });

  it('one kibbutz left reads קיבוץ, not קיבוצים', () => {
    const one = burnProgress([ROWS[0], ROWS[1], ROWS[3]]);
    expect(burnStripText(one, 'field')).toBe('🔥 צריבות · נותרו 1 ב-1 קיבוץ');
  });

  it('HIDE AT ZERO: nothing left → empty text, for both roles', () => {
    const done = burnProgress([ROWS[3], ROWS[4]]);
    expect(done.remaining).toBe(0);
    expect(burnStripText(done, 'field')).toBe('');
    expect(burnStripText(done, 'other')).toBe('');
    expect(burnStripText(burnProgress([]), 'other')).toBe('');
  });

  it('a row with no site name is ignored rather than becoming a "" kibbutz', () => {
    const p2 = burnProgress([...ROWS, row({ meter_id: 'x', site: '  ' })]);
    expect(p2.sites.map(s => s.site)).not.toContain('');
    expect(p2.total).toBe(6);
  });
});

describe('the briefing rows — kind `burn`', () => {
  const items = burnLeaveItems(ROWS, 'אור הנר');

  it('one row per meter that is still open — a burned meter has nothing left to tick', () => {
    expect(items.map(i => i.meterId)).toEqual(['a1', 'a3']);
    expect(items.every(i => i.kind === 'burn')).toBe(true);
  });

  it('the id carries the meter, so ticking it can write to that row', () => {
    expect(items[0].id).toBe('burn:a1');
    expect(items[0].meterId).toBe('a1');
  });

  it('reads as field work, with the meter type and the CT ratio', () => {
    expect(items[0].text).toBe('לצרוב מונה 68369287 · רפת 7');
    expect(items[0].sub).toBe('🔁 משנה זרם ×50 · צריבה');
  });

  it('a reported problem is carried into the row, so he sees it before he starts', () => {
    expect(items[1].sub).toBe('⚡ תלת-פאזי · ⚠ אין גישה');
  });

  it('a finished kibbutz contributes no rows', () => {
    expect(burnLeaveItems(ROWS, 'מעוז חיים')).toEqual([]);
  });
});

describe('the write patches', () => {
  const now = '2026-09-19T08:00:00.000Z';

  it('נצרב stamps who and when', () => {
    expect(burnedPatch('אביאם', now)).toEqual({ status: 'burned', burned_by: 'אביאם', burned_at: now, updated_at: now });
  });

  it('undo clears who and when rather than leaving a ghost', () => {
    expect(unburnedPatch(now)).toEqual({ status: 'pending', burned_by: null, burned_at: null, updated_at: now });
  });

  it('a problem keeps its note; clearing it sends the meter back to pending', () => {
    expect(issuePatch('אין גישה', now)).toEqual({ status: 'issue', note: 'אין גישה', updated_at: now });
    expect(clearIssuePatch(now)).toEqual({ status: 'pending', note: null, updated_at: now });
  });

  it('a generator patch touches only the generator (an empty pick clears it)', () => {
    expect(generatorPatch('g1', now)).toEqual({ generator_id: 'g1', updated_at: now });
    expect(generatorPatch('', now)).toEqual({ generator_id: null, updated_at: now });
  });

  it('no patch ever carries an EMS-owned column — the refresh must not be overwritten', () => {
    const EMS_OWNED = ['serial', 'site', 'site_id', 'meter_type', 'address', 'role_code', 'ct_ratio', 'parent_serial', 'solar_names'];
    for (const patch of [burnedPatch('עידן', now), unburnedPatch(now), issuePatch('x', now), clearIssuePatch(now), generatorPatch('g', now)]) {
      for (const k of EMS_OWNED) expect(patch).not.toHaveProperty(k);
    }
  });
});

describe('generators', () => {
  const gens = [
    { id: 'g2', site: 'אור הנר', name: 'גנרטור רפת' },
    { id: 'g1', site: 'אור הנר', name: 'גנרטור לולים' },
    { id: 'g3', site: 'מעוז חיים', name: 'גנרטור מוסך' },
  ];

  it('assignment never crosses a kibbutz, and the list is alphabetical (he)', () => {
    expect(generatorsForSite(gens, 'אור הנר').map(g => g.id)).toEqual(['g1', 'g2']);
    expect(generatorsForSite(gens, 'דפנה')).toEqual([]);
    expect(generatorsForSite(null, 'אור הנר')).toEqual([]);
  });
});

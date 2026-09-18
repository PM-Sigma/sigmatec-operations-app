// Goldens for the kibbutz card home (Task 1b). Grouping cases are the same fixtures the
// legacy runner (test-kibbutzim.mjs) asserts on js/src/24-kibbutzim.js — both renderers must
// agree, so the goldens are deliberately duplicated rather than shared.
import { describe, it, expect } from 'vitest';
import {
  groupBySection, filterRows, countRows, matchesQuery,
  validateKibbutz, kibbutzimSaveBody, canEditEnergy, canManageKibbutzim, cardActionsFor,
  emsChainPlan, emsChainReduce, energyText, REGION_ORDER,
  type KibbutzRow,
} from './kibbutzim';

// A region is REQUIRED on a kibbutz now (Task 4, spec §2), so the default fixture carries a
// real one; the cases that test the rule itself pass region: '' explicitly.
const row = (r: Partial<KibbutzRow> & { name: string }): KibbutzRow =>
  ({ section: 'active', energy: ['electric'], region: 'העמקים', ...r });

describe('groupBySection', () => {
  it('orders regions by REGION_ORDER, rows alphabetical he-IL, "" last', () => {
    const g = groupBySection([
      row({ name: 'יגור', region: 'העמקים' }),
      row({ name: 'אפיקים', region: 'גליל וגולן' }),
      row({ name: 'גבת', region: 'העמקים' }),
      row({ name: 'שלוחות', region: '' }),
    ]);
    expect(g.active.map(x => x.region)).toEqual(['גליל וגולן', 'העמקים', '']);
    expect(g.active[1].rows.map(r => r.name)).toEqual(['גבת', 'יגור']);
    expect(g.new).toEqual([]);
  });

  it('sorts unknown regions after the known ones, alphabetically', () => {
    const g = groupBySection([
      row({ name: 'א', section: 'new', region: 'תימן' }),
      row({ name: 'ב', section: 'new', region: 'אוגנדה' }),
      row({ name: 'ג', section: 'new', region: 'העמקים' }),
    ]);
    expect(g.new.map(x => x.region)).toEqual(['העמקים', 'אוגנדה', 'תימן']);
  });

  it('pins a sub-site directly after its parent', () => {
    const g = groupBySection([
      row({ name: 'תל קציר', region: 'העמקים' }),
      row({ name: 'חוצות יגור', region: 'העמקים', kind: 'subsite', parent: 'יגור' }),
      row({ name: 'אפיקים', region: 'העמקים' }),
      row({ name: 'יגור', region: 'העמקים' }),
    ]);
    expect(g.active[0].rows.map(r => r.name)).toEqual(['אפיקים', 'יגור', 'חוצות יגור', 'תל קציר']);
  });

  it('sorts by display_name when there is one', () => {
    const g = groupBySection([
      row({ name: 'אור הנר גז', display_name: 'תמר', region: 'העמקים' }),
      row({ name: 'תל קציר', display_name: 'אבן', region: 'העמקים' }),
    ]);
    expect(g.active[0].rows.map(r => r.name)).toEqual(['תל קציר', 'אור הנר גז']);
  });
});

describe('filters + counts', () => {
  const rows = [
    row({ name: 'גבת', section: 'new', region: 'העמקים' }),
    row({ name: 'יגור', section: 'active', marketing: true, region: 'חוף הכרמל' }),
    row({ name: 'גבים', section: 'active', region: 'שער הנגב' }),
    row({ name: 'ישן', section: 'active', archived_at: '2026-01-01T00:00:00Z' }),
  ];

  it('chips select by section and by the marketing tag', () => {
    expect(filterRows(rows, 'all', '').length).toBe(4);
    expect(filterRows(rows, 'new', '').map(r => r.name)).toEqual(['גבת']);
    expect(filterRows(rows, 'marketing', '').map(r => r.name)).toEqual(['יגור']);
  });

  it('search matches name, display_name and region', () => {
    expect(matchesQuery(row({ name: 'גבים', region: 'שער הנגב' }), 'הנגב')).toBe(true);
    expect(matchesQuery(row({ name: 'אור הנר גז', display_name: 'אור הנר — גז' }), 'הנר —')).toBe(true);
    expect(matchesQuery(row({ name: 'גבים', region: 'שער הנגב' }), 'יגור')).toBe(false);
    expect(filterRows(rows, 'new', 'יגור')).toEqual([]);         // chip AND search, both must match
  });

  it('counts skip archived rows', () => {
    expect(countRows(rows)).toEqual({ all: 3, new: 1, active: 2, marketing: 1 });
  });

  it('renders the energy badge text', () => {
    expect(energyText(row({ name: 'x', energy: ['electric', 'water'] }))).toBe('⚡ חשמל + 💧 מים');
    expect(energyText(row({ name: 'x', energy: [] }))).toBe('⚡ חשמל');
  });
});

describe('roles', () => {
  it('canManageKibbutzim — עידן/עמיחי only, never a viewer', () => {
    expect(canManageKibbutzim('עידן')).toBe(true);
    expect(canManageKibbutzim('עמיחי')).toBe(true);
    ['אביאם', 'ניתאי', 'מתניה', 'אבצן', ''].forEach(u => expect(canManageKibbutzim(u)).toBe(false));
    expect(canManageKibbutzim('עידן', true)).toBe(false);
  });

  it('canEditEnergy — עידן alone', () => {
    expect(canEditEnergy('עידן')).toBe(true);
    ['עמיחי', 'אביאם', ''].forEach(u => expect(canEditEnergy(u)).toBe(false));
  });

  it('cardActionsFor — viewer sees only the meetings timeline', () => {
    expect(cardActionsFor('viewer')).toEqual(['meetings']);
    expect(cardActionsFor('idan')).toEqual(['visit', 'cert', 'meetings']);
    expect(cardActionsFor('team')).toEqual(['visit', 'cert', 'meetings']);
  });
});

describe('validateKibbutz', () => {
  const all = [row({ name: 'גבים', section: 'active', region: 'שער הנגב' }), row({ name: 'ארכיון', archived_at: 'x' })];

  it('requires a name', () => {
    const v = validateKibbutz(row({ name: '   ' }), all);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('שם חובה');
  });

  it('rejects a duplicate name', () => {
    expect(validateKibbutz(row({ name: 'גבים' }), all).errors).toContain('קיבוץ בשם הזה כבר קיים');
    // editing the same row is not a duplicate of itself
    const same = validateKibbutz({ ...row({ name: 'גבים' }), id: 'ID' }, [{ ...all[0], id: 'ID' }]);
    expect(same.ok).toBe(true);
    // an archived row does not block the name
    expect(validateKibbutz(row({ name: 'ארכיון' }), all).ok).toBe(true);
  });

  it('requires an איזור — a row without one only exists because a field was skipped', () => {
    const v = validateKibbutz(row({ name: 'חדש', region: '' }), all);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('חובה לבחור איזור');
    // whitespace is not a region
    expect(validateKibbutz(row({ name: 'חדש', region: '   ' }), all).errors).toContain('חובה לבחור איזור');
    // ...and a valid one is trimmed on the way through
    expect(validateKibbutz(row({ name: 'חדש', region: '  העמקים ' }), all).row.region).toBe('העמקים');
  });

  it('a SUB-SITE is exempt — it inherits its parent region', () => {
    const v = validateKibbutz(row({ name: 'גבים — שכונה', kind: 'subsite', parent: 'גבים', region: '' }), all);
    expect(v.ok).toBe(true);
    expect(v.errors).not.toContain('חובה לבחור איזור');
  });

  it('requires at least one energy type and a valid section', () => {
    expect(validateKibbutz(row({ name: 'חדש', energy: [] }), all).errors).toContain('יש לבחור לפחות סוג אנרגיה אחד');
    expect(validateKibbutz(row({ name: 'חדש', section: 'nope' }), all).errors).toContain('מדור לא תקין');
  });

  it('accepts a clean row', () => {
    const v = validateKibbutz(row({ name: ' דפנה ', section: 'new', region: 'גליל וגולן' }), all);
    expect(v).toMatchObject({ ok: true, errors: [] });
    expect(v.row.name).toBe('דפנה');
    expect(v.row.kind).toBe('kibbutz');
  });

  it('a sub-site needs a live parent and inherits its section + region', () => {
    const bad = validateKibbutz(row({ name: 'גבים — שכונה', kind: 'subsite', parent: 'לא קיים' }), all);
    expect(bad.ok).toBe(false);
    expect(bad.errors).toContain('קיבוץ-אב לא נמצא');

    const archivedParent = validateKibbutz(row({ name: 'תת', kind: 'subsite', parent: 'ארכיון' }), all);
    expect(archivedParent.errors).toContain('קיבוץ-אב לא נמצא');

    const good = validateKibbutz(
      row({ name: 'גבים — שכונה חדשה', kind: 'subsite', parent: 'גבים', section: 'new', region: 'כלום' }), all);
    expect(good.ok).toBe(true);
    expect(good.row.section).toBe('active');            // inherited, not what the form said
    expect(good.row.region).toBe('שער הנגב');
  });
});

describe('kibbutzimSaveBody', () => {
  const r = row({ name: ' גבים ', section: 'new', energy: ['electric', 'gas'], marketing: true, region: 'שער הנגב' });

  it('keeps energy for עידן', () => {
    const body = kibbutzimSaveBody(r, 'עידן');
    expect(body.energy).toEqual(['electric', 'gas']);
    expect(body).toMatchObject({ name: 'גבים', section: 'new', marketing: true, region: 'שער הנגב', kind: 'kibbutz', parent: null });
  });

  it('DROPS the energy key for everyone else, so the server keeps the old value', () => {
    const body = kibbutzimSaveBody(r, 'עמיחי');
    expect('energy' in body).toBe(false);
    expect(body.region).toBe('שער הנגב');               // region stays editable for עמיחי
  });

  it('carries parent + ems fields for a sub-site', () => {
    const body = kibbutzimSaveBody(
      { ...r, kind: 'subsite', parent: 'גבים', ems_site_ids: ['S1'], ems_params: { site: { id: 'S1', name: 'x' } } as any },
      'עידן');
    expect(body).toMatchObject({ kind: 'subsite', parent: 'גבים', ems_site_ids: ['S1'] });
  });
});

describe('emsChainPlan', () => {
  it('is 5 ordered steps for a sub-site', () => {
    const plan = emsChainPlan('גבים — שכונה', row({ name: 'גבים' }), []);
    expect(plan.map(s => s.id)).toEqual(['site', 'meters', 'tasks', 'contacts', 'parent']);
    expect(plan.every(s => s.state === 'pending')).toBe(true);
    expect(plan[0].label).toBe('אתר ב-EMS');
  });

  it('drops the parent step when re-checking a normal kibbutz', () => {
    expect(emsChainPlan('גבים', null, []).map(s => s.id)).toEqual(['site', 'meters', 'tasks', 'contacts']);
  });
});

describe('emsChainReduce', () => {
  const NOW = '2026-09-17T10:00:00.000Z';
  const parent = row({ name: 'גבים', section: 'active', region: 'שער הנגב' });

  it('all-pass → canSave, energy from the meter counts, ems_params filled', () => {
    const res = emsChainReduce({
      site: { found: true, id: 'S1', name: 'גבים — שכונה חדשה' },
      meters: { counts: { 1: 12, 2: 3 } },
      tasks: { count: 2, titles: ['התקנת מונים', 'מאזן אנרגיה'] },
      contacts: { contacts: [{ name: 'יוסי', phone: '050' }] },
      parent: { row: parent },
    }, NOW);

    expect(res.canSave).toBe(true);
    expect(res.energy).toEqual(['electric', 'water']);
    expect(res.ems_site_ids).toEqual(['S1']);
    expect(res.ems_params!.meters.total).toBe(15);
    expect(res.ems_params!.meters).toEqual({ electric: 12, water: 3, gas: 0, total: 15 });
    expect(res.ems_params!.openTasks).toBe(2);
    expect(res.ems_params!.checkedAt).toBe(NOW);
    expect(res.warnings).toEqual([]);
    expect(res.steps.map(s => s.state)).toEqual(['ok', 'ok', 'ok', 'ok', 'ok']);
  });

  it('site not found → cannot save, one warning, every other step skipped', () => {
    const res = emsChainReduce({ site: { found: false }, parent: { row: parent } }, NOW);
    expect(res.canSave).toBe(false);
    expect(res.warnings).toEqual(['לא נמצא אתר ב-EMS']);
    expect(res.ems_params).toBe(null);
    expect(res.ems_site_ids).toEqual([]);
    expect(res.energy).toEqual(['electric']);
    expect(res.steps[0].state).toBe('bad');
    expect(res.steps.slice(1, 4).map(s => s.state)).toEqual(['skipped', 'skipped', 'skipped']);
  });

  it('site not found + "שמור בלי קישור" → savable, still unlinked', () => {
    const res = emsChainReduce({ site: { found: false }, allowUnlinked: true }, NOW);
    expect(res.canSave).toBe(true);
    expect(res.ems_site_ids).toEqual([]);
  });

  it('meters call skipped → ⚡ חשמל default + a warning', () => {
    const res = emsChainReduce({
      site: { found: true, id: 'S1', name: 'x' },
      meters: { skipped: true },
      tasks: { count: 0, titles: [] },
      contacts: { contacts: [{ name: 'יוסי' }] },
    }, NOW);
    expect(res.energy).toEqual(['electric']);
    expect(res.warnings).toContain('לא ניתן לספור מונים');
    expect(res.steps[1].state).toBe('warn');
    expect(res.canSave).toBe(true);
  });

  it('a site already linked to another row → duplicate warning, still savable', () => {
    const res = emsChainReduce({
      site: { found: true, id: 'S1', name: 'x' },
      meters: { counts: { 1: 4 } },
      tasks: { count: 0, titles: [] },
      contacts: { contacts: [] },
      parent: { row: parent, duplicateOf: 'יגור' },
    }, NOW);
    expect(res.warnings).toContain('האתר כבר מקושר ל-יגור');
    expect(res.steps[4].state).toBe('warn');
    expect(res.canSave).toBe(true);
  });

  it('no contacts → warn row, no block', () => {
    const res = emsChainReduce({
      site: { found: true, id: 'S1', name: 'x' },
      meters: { counts: { 3: 7 } },
      tasks: { count: 1, titles: ['גז'] },
      contacts: { contacts: [] },
    }, NOW);
    expect(res.energy).toEqual(['gas']);
    expect(res.steps[3].state).toBe('warn');
    expect(res.warnings).toContain('אין אנשי קשר');
    expect(res.canSave).toBe(true);
  });

  it('an archived parent fails the parent step', () => {
    const res = emsChainReduce({
      site: { found: true, id: 'S1', name: 'x' },
      meters: { counts: { 1: 1 } },
      tasks: { count: 0, titles: [] },
      contacts: { contacts: [{ name: 'a' }] },
      parent: { row: { ...parent, archived_at: '2026-01-01' } },
    }, NOW);
    expect(res.warnings).toContain('קיבוץ-אב לא נמצא');
    expect(res.steps[4].state).toBe('bad');
  });
});

describe('REGION_ORDER (spec §2 — the regions the table actually holds)', () => {
  it('is exactly the five real regions, north → south', () => {
    expect(REGION_ORDER).toEqual([
      'גליל וגולן', 'העמקים', 'מישור החוף והשרון', 'שפלה ומרכז', 'דרום, עוטף עזה והנגב',
    ]);
  });

  it('carries none of the old sub-region names — the data was consolidated in prod', () => {
    for (const gone of ['גליל תחתון', 'עמק הירדן', 'שער הנגב', 'נגב', 'יהודה ושומרון', 'בקעת בית שאן']) {
      expect(REGION_ORDER).not.toContain(gone);
    }
  });
});

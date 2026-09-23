// Goldens for the kibbutz card home (Task 1b). Grouping cases are the same fixtures the
// legacy runner (test-kibbutzim.mjs) asserts on js/src/24-kibbutzim.js — both renderers must
// agree, so the goldens are deliberately duplicated rather than shared.
import { describe, it, expect } from 'vitest';
import {
  groupBySection, filterRows, countRows, matchesQuery, draftsAtTop,
  validateKibbutz, kibbutzimSaveBody, canEditEnergy, canManageKibbutzim, cardActionsFor,
  emsLinkedLabel, isUnlinked, energyText, REGION_ORDER,
  customerCodeOf, subsitesOf, isMissingCustomerCodeColumn, withoutCustomerCode,
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

  it('cardActionsFor — 📍 only; the viewer gets no action row (22.9)', () => {
    expect(cardActionsFor('viewer')).toEqual([]);
    expect(cardActionsFor('idan')).toEqual(['visit']);
    expect(cardActionsFor('team')).toEqual(['visit']);
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

// ───────────── QA round 4 Package Y (22.9): the chain is gone; isUnlinked is the one rule ─────────────
// left behind for "the most broken thing in the system" (עידן) — the card chip, the alerts
// bell (alerts.ts emsUnlinkedGroup) and health.ts all ask THIS function, not a copy of it.

describe('isUnlinked', () => {
  it('a live row with no ems_site_ids is unlinked', () => {
    expect(isUnlinked(row({ name: 'x', ems_site_ids: [] }))).toBe(true);
    expect(isUnlinked(row({ name: 'x' }))).toBe(true);           // never set at all
  });

  it('a row with a site id is linked', () => {
    expect(isUnlinked(row({ name: 'x', ems_site_ids: ['S1'] }))).toBe(false);
  });

  it('an archived row is never flagged — it left the fleet, not the integration', () => {
    expect(isUnlinked(row({ name: 'x', ems_site_ids: [], archived_at: '2026-01-01' }))).toBe(false);
  });

  it('same rule as the legacy card chip (01-data.js emsIdsUnlinked): blanks and a JSON string', () => {
    expect(isUnlinked(row({ name: 'x', ems_site_ids: [''] as any }))).toBe(true);
    expect(isUnlinked(row({ name: 'x', ems_site_ids: '["S1"]' as any }))).toBe(false);
    expect(isUnlinked(row({ name: 'x', ems_site_ids: '[]' as any }))).toBe(true);
  });

  it('a sub-site follows the same rule as a kibbutz', () => {
    expect(isUnlinked(row({ name: 'x', kind: 'subsite', parent: 'y', ems_site_ids: [] }))).toBe(true);
  });
});

describe('emsLinkedLabel', () => {
  it('reads ✓ מקושר / ⚠️ לא מקושר, and null (create mode) as unlinked', () => {
    expect(emsLinkedLabel(row({ name: 'x', ems_site_ids: ['S1'] }))).toBe('✓ מקושר');
    expect(emsLinkedLabel(row({ name: 'x', ems_site_ids: [] }))).toBe('⚠️ לא מקושר');
    expect(emsLinkedLabel(null)).toBe('⚠️ לא מקושר');
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

describe('draftsAtTop — home order (QA round 2, Package A §4)', () => {
  it('pulls rows with open work to the top, preserving order within each bucket', () => {
    const rows = [
      row({ name: 'אפיקים' }),
      row({ name: 'חוקוק' }),
      row({ name: 'יגור' }),
      row({ name: 'דפנה' }),
    ];
    const open = new Set(['יגור', 'אפיקים']);
    const { top, rest } = draftsAtTop(rows, n => open.has(n));
    expect(top.map(r => r.name)).toEqual(['אפיקים', 'יגור']);
    expect(rest.map(r => r.name)).toEqual(['חוקוק', 'דפנה']);
  });

  it('no open work → everything stays in rest, in order', () => {
    const rows = [row({ name: 'א' }), row({ name: 'ב' })];
    const { top, rest } = draftsAtTop(rows, () => false);
    expect(top).toEqual([]);
    expect(rest.map(r => r.name)).toEqual(['א', 'ב']);
  });

  it('everything open → everything lands in top, nothing in rest', () => {
    const rows = [row({ name: 'א' }), row({ name: 'ב' })];
    const { top, rest } = draftsAtTop(rows, () => true);
    expect(top.map(r => r.name)).toEqual(['א', 'ב']);
    expect(rest).toEqual([]);
  });

  it('a running/paused work timer pulls its kibbutz to the top too, even without a draft', () => {
    const rows = [
      row({ name: 'אפיקים' }),
      row({ name: 'חוקוק' }),
      row({ name: 'יגור' }),
    ];
    const { top, rest } = draftsAtTop(rows, () => false, 'חוקוק');
    expect(top.map(r => r.name)).toEqual(['חוקוק']);
    expect(rest.map(r => r.name)).toEqual(['אפיקים', 'יגור']);
  });

  it('a timer kibbutz already pulled up by an open draft is not duplicated', () => {
    const rows = [row({ name: 'אפיקים' }), row({ name: 'חוקוק' })];
    const { top, rest } = draftsAtTop(rows, n => n === 'אפיקים', 'אפיקים');
    expect(top.map(r => r.name)).toEqual(['אפיקים']);
    expect(rest.map(r => r.name)).toEqual(['חוקוק']);
  });

  it('null activeTimerKibbutz (default) behaves exactly as before', () => {
    const rows = [row({ name: 'א' }), row({ name: 'ב' })];
    const { top, rest } = draftsAtTop(rows, () => false);
    expect(top).toEqual([]);
    expect(rest.map(r => r.name)).toEqual(['א', 'ב']);
  });
});

// ───────────── QA round 3 (D2): קוד לקוח · תתי-אתרים · קטגוריה ─────────────

describe('customerCodeOf', () => {
  it('the row column wins over the legacy CUSTOMER_CODES fallback', () => {
    expect(customerCodeOf(row({ name: 'חוקוק', customer_code: 1234 }), 966)).toBe('1234');
  });

  it('falls back to the map only when the row has no code of its own', () => {
    expect(customerCodeOf(row({ name: 'חוקוק' }), 966)).toBe('966');
    expect(customerCodeOf(row({ name: 'חוקוק', customer_code: null }), 966)).toBe('966');
  });

  it('is empty when neither side has one, and never renders "0" from a missing row', () => {
    expect(customerCodeOf(row({ name: 'חוקוק' }))).toBe('');
    expect(customerCodeOf(null, '')).toBe('');
  });

  it('a real zero-ish code is still a code, not a blank', () => {
    expect(customerCodeOf(row({ name: 'x', customer_code: 0 }), 966)).toBe('0');
  });
});

describe('subsitesOf', () => {
  const rows = [
    row({ name: 'חוקוק' }),
    row({ name: 'חוקוק צפון', kind: 'subsite', parent: 'חוקוק' }),
    row({ name: 'חוקוק אלון', kind: 'subsite', parent: 'חוקוק' }),
    row({ name: 'חוקוק ישן', kind: 'subsite', parent: 'חוקוק', archived_at: '2026-01-01' }),
    row({ name: 'גבים', kind: 'subsite', parent: 'אפיקים' }),
  ];

  it('lists only the live sub-sites of that kibbutz, alphabetical he', () => {
    expect(subsitesOf(rows, 'חוקוק').map(r => r.name)).toEqual(['חוקוק אלון', 'חוקוק צפון']);
  });

  it('an archived sub-site is not listed', () => {
    expect(subsitesOf(rows, 'חוקוק').map(r => r.name)).not.toContain('חוקוק ישן');
  });

  it('a kibbutz with none, and a missing name, both give []', () => {
    expect(subsitesOf(rows, 'יגור')).toEqual([]);
    expect(subsitesOf(rows, '')).toEqual([]);
    expect(subsitesOf(null, 'חוקוק')).toEqual([]);
  });
});

describe('validateKibbutz · customer_code', () => {
  it('is optional — an empty code saves as null', () => {
    const v = validateKibbutz(row({ name: 'חדש', customer_code: null }), []);
    expect(v.ok).toBe(true);
    expect(v.row.customer_code).toBeNull();
  });

  it('a typed code is normalized to a number', () => {
    const v = validateKibbutz(row({ name: 'חדש', customer_code: '966' as any }), []);
    expect(v.ok).toBe(true);
    expect(v.row.customer_code).toBe(966);
  });

  it('rejects a non-integer or a negative code', () => {
    expect(validateKibbutz(row({ name: 'א', customer_code: 'אבג' as any }), []).errors)
      .toContain('קוד לקוח חייב להיות מספר שלם חיובי');
    expect(validateKibbutz(row({ name: 'א', customer_code: -3 }), []).ok).toBe(false);
  });

  it('rejects a code another live kibbutz already holds', () => {
    const all = [row({ name: 'חוקוק', id: 'a', customer_code: 966 })];
    const v = validateKibbutz(row({ name: 'יגור', id: 'b', customer_code: 966 }), all);
    expect(v.ok).toBe(false);
    expect(v.errors[0]).toContain('כבר משויך');
  });

  it('keeping your OWN code is not a clash', () => {
    const all = [row({ name: 'חוקוק', id: 'a', customer_code: 966 })];
    expect(validateKibbutz(row({ name: 'חוקוק', id: 'a', customer_code: 966 }), all).ok).toBe(true);
  });

  it('an ARCHIVED row does not hold a code hostage', () => {
    const all = [row({ name: 'ישן', id: 'a', customer_code: 966, archived_at: '2026-01-01' })];
    expect(validateKibbutz(row({ name: 'חדש', id: 'b', customer_code: 966 }), all).ok).toBe(true);
  });
});

describe('kibbutzimSaveBody · customer_code', () => {
  it('sends the code as a number', () => {
    const body = kibbutzimSaveBody(validateKibbutz(row({ name: 'חוקוק', customer_code: '966' as any }), []).row, 'עידן');
    expect(body.customer_code).toBe(966);
  });

  it('sends an explicit null when there is no code, so a wrong one can be cleared', () => {
    const body = kibbutzimSaveBody(validateKibbutz(row({ name: 'חוקוק' }), []).row, 'עמיחי');
    expect('customer_code' in body).toBe(true);
    expect(body.customer_code).toBeNull();
  });

  it('the code is NOT an עידן-only field — עמיחי saves it too (unlike energy)', () => {
    const body = kibbutzimSaveBody(validateKibbutz(row({ name: 'ח', customer_code: 12 }), []).row, 'עמיחי');
    expect(body.customer_code).toBe(12);
    expect('energy' in body).toBe(false);
  });
});

describe('tolerating a database without customer_code', () => {
  it('recognizes the PostgREST "no such column" answer', () => {
    expect(isMissingCustomerCodeColumn(
      { code: 'PGRST204', message: "Could not find the 'customer_code' column of 'kibbutzim'" })).toBe(true);
    expect(isMissingCustomerCodeColumn(
      { code: '42703', message: 'column "customer_code" does not exist' })).toBe(true);
  });

  it('does NOT swallow an unrelated failure', () => {
    expect(isMissingCustomerCodeColumn({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isMissingCustomerCodeColumn(new Error('Failed to fetch'))).toBe(false);
    expect(isMissingCustomerCodeColumn({ code: 'PGRST204', message: "no 'region' column" })).toBe(false);
  });

  it('the retry body is the same body minus the one key', () => {
    const body = kibbutzimSaveBody(validateKibbutz(row({ name: 'ח', customer_code: 5 }), []).row, 'עידן');
    const retry = withoutCustomerCode(body);
    expect('customer_code' in retry).toBe(false);
    expect(retry.name).toBe('ח');
    expect(body.customer_code).toBe(5);   // the original is not mutated
  });
});

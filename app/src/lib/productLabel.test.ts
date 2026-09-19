// Role × forReport matrix for productLabel (spec §3, Task 9). The contract this file proves:
// technical name everywhere in the working app, display name only in a report/export or for a
// viewer, and only when a display name was actually set.
import { describe, expect, it } from 'vitest';
import { canEditDisplayName, productLabel, reportPreview, reportWiringOk } from '@/lib/productLabel';
import { VIEWER_NAME } from '@/lib/people';

const METER = { name: 'E360CT-3P', display_name: 'מונה חשמל תלת-פאזי' };
const NO_DISPLAY = { name: 'SIM-XYZ' };
const BLANK_DISPLAY = { name: 'SIM-ABC', display_name: '   ' };

describe('productLabel — role × forReport matrix', () => {
  it('staff, in-app (no forReport, no role) → technical name, even when a display name exists', () => {
    expect(productLabel(METER)).toBe('E360CT-3P');
    expect(productLabel(METER, {})).toBe('E360CT-3P');
    expect(productLabel(METER, { role: 'עידן' })).toBe('E360CT-3P');
    expect(productLabel(METER, { role: 'אביאם' })).toBe('E360CT-3P');
  });

  it('forReport:true → display name', () => {
    expect(productLabel(METER, { forReport: true })).toBe('מונה חשמל תלת-פאזי');
  });

  it('viewer role → display name, without forReport', () => {
    expect(productLabel(METER, { role: 'viewer' })).toBe('מונה חשמל תלת-פאזי');
    // The STORED viewer name, which is the only one the app ever writes (audit A · A5).
    expect(productLabel(METER, { role: VIEWER_NAME })).toBe('מונה חשמל תלת-פאזי');
  });

  it("the dead spelling 'צופה' is NOT the viewer — it is just a name", () => {
    // It was never stored, so anything that matched on it was dead code pretending to work.
    expect(productLabel(METER, { role: 'צופה' })).toBe('E360CT-3P');
  });

  it('no display_name set → technical name, even forReport or viewer', () => {
    expect(productLabel(NO_DISPLAY, { forReport: true })).toBe('SIM-XYZ');
    expect(productLabel(NO_DISPLAY, { role: 'viewer' })).toBe('SIM-XYZ');
  });

  it('blank/whitespace display_name → falls back to technical name', () => {
    expect(productLabel(BLANK_DISPLAY, { forReport: true })).toBe('SIM-ABC');
  });

  it('accepts a plain string too (no display name to offer)', () => {
    expect(productLabel('E360PP', { forReport: true })).toBe('E360PP');
  });

  it('reportPreview === productLabel(p, {forReport:true})', () => {
    expect(reportPreview(METER)).toBe('מונה חשמל תלת-פאזי');
    expect(reportPreview(NO_DISPLAY)).toBe('SIM-XYZ');
  });
});

describe('canEditDisplayName — עידן only', () => {
  it('true only when isIdan()', () => {
    expect(canEditDisplayName(true)).toBe(true);
    expect(canEditDisplayName(false)).toBe(false);
  });
});

describe('reportWiringOk — the products-page 🔗 status', () => {
  it('true when every active product has a non-blank display_name', () => {
    expect(reportWiringOk([METER])).toBe(true);
  });
  it('false when any product is missing one (or it is blank)', () => {
    expect(reportWiringOk([METER, NO_DISPLAY])).toBe(false);
    expect(reportWiringOk([METER, BLANK_DISPLAY])).toBe(false);
  });
  it('empty catalog is vacuously ok', () => {
    expect(reportWiringOk([])).toBe(true);
  });
});

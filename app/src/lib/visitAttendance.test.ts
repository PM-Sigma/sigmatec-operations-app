// Goldens for the round-5 attendance rule engine (V-L3). See app/src/lib/visitAttendance.ts.
import { describe, expect, it } from 'vitest';
import { autoRowId, planVisitAttendance, resolveConflict, ymdOf } from './visitAttendance';

const V = (id: string, date: string, visitor: string) => ({ id, date: date + 'T09:00:00.000Z', visitor });
const R = (id: string, person: string, date: string, dayType: string, source = 'manual') =>
  ({ id, person, date: date + 'T09:00:00.000Z', dayType, source });

describe('rule 1: save a visit', () => {
  it('G1 אביאם visits, empty day → one visit_auto field row', () => {
    const p = planVisitAttendance({ before: null, after: V('v1', '2026-09-10', 'אביאם'), rows: [], visits: [] });
    expect(p.ops).toEqual([{ kind: 'upsert', row: expect.objectContaining({
      id: autoRowId('אביאם', '2026-09-10'), person: 'אביאם', dayType: 'field', source: 'visit_auto' }) }]);
    expect(ymdOf((p.ops[0] as any).row.date)).toBe('2026-09-10');
    expect(p.autoDays).toEqual([{ person: 'אביאם', ymd: '2026-09-10' }]);
  });
  it('G2 עמיחי (or anyone else) saving gets nothing', () => {
    for (const who of ['עמיחי', 'עידן', 'מתניה', 'אבצן', 'אליה']) {
      expect(planVisitAttendance({ before: null, after: V('v1', '2026-09-10', who), rows: [], visits: [] }).ops).toEqual([]);
    }
  });
  it('G3 both filers in מי ביקר → two rows; a third name adds nothing', () => {
    const p = planVisitAttendance({ before: null, after: V('v1', '2026-09-10', 'עמיחי, אביאם, ניתאי'), rows: [], visits: [] });
    expect(p.ops.map((o: any) => o.row.person)).toEqual(['אביאם', 'ניתאי']);
  });
  it('G4 already a visit_auto row that day → no op (idempotent re-save)', () => {
    const rows = [R(autoRowId('אביאם', '2026-09-10'), 'אביאם', '2026-09-10', 'field', 'visit_auto')];
    expect(planVisitAttendance({ before: null, after: V('v2', '2026-09-10', 'אביאם'), rows, visits: [] }).ops).toEqual([]);
  });
});

describe('rule 2: the day already has a manual row', () => {
  it('G5 same type (שטח) → no prompt, stays manual', () => {
    const p = planVisitAttendance({ before: null, after: V('v1', '2026-09-10', 'אביאם'),
      rows: [R('a1', 'אביאם', '2026-09-10', 'field')], visits: [] });
    expect(p).toEqual({ ops: [], asks: [], notices: [], autoDays: [] });
  });
  it('G6 different type → one question, no write', () => {
    const p = planVisitAttendance({ before: null, after: V('v1', '2026-09-10', 'ניתאי'),
      rows: [R('a1', 'ניתאי', '2026-09-10', 'office')], visits: [] });
    expect(p.ops).toEqual([]);
    expect(p.asks).toEqual([{ kind: 'conflict', person: 'ניתאי', ymd: '2026-09-10', rowId: 'a1',
      rowDate: '2026-09-10T09:00:00.000Z', existingType: 'office' }]);
  });
  it('G6b yes → the row becomes שטח (visit_auto); no → nothing', () => {
    const ask = { kind: 'conflict' as const, person: 'ניתאי', ymd: '2026-09-10', rowId: 'a1', rowDate: '2026-09-10T09:00:00.000Z', existingType: 'office' };
    expect(resolveConflict(ask, true)).toEqual([{ kind: 'upsert', row: { id: 'a1', person: 'ניתאי',
      date: '2026-09-10T09:00:00.000Z', dayType: 'field', note: '', source: 'visit_auto' } }]);
    expect(resolveConflict(ask, false)).toEqual([]);
  });
  it('G6c a calendar absence counts as manual', () => {
    const p = planVisitAttendance({ before: null, after: V('v1', '2026-09-10', 'אביאם'),
      rows: [R('abs_1', 'אביאם', '2026-09-10', 'vacation', 'calendar')], visits: [] });
    expect(p.asks[0]?.existingType).toBe('vacation');
  });
});

describe('rule 3: the date moves', () => {
  const before = V('v1', '2026-09-10', 'אביאם');
  const after = V('v1', '2026-09-12', 'אביאם');
  const auto10 = R(autoRowId('אביאם', '2026-09-10'), 'אביאם', '2026-09-10', 'field', 'visit_auto');
  it('G7 original is visit_auto, no other visit → delete it, popup for 10.9, new row on 12.9', () => {
    const p = planVisitAttendance({ before, after, rows: [auto10], visits: [after] });
    expect(p.ops).toContainEqual({ kind: 'delete', id: auto10.id });
    expect(p.ops).toContainEqual({ kind: 'upsert', row: expect.objectContaining({ id: autoRowId('אביאם', '2026-09-12') }) });
    expect(p.notices).toEqual([{ kind: 'needsEntry', person: 'אביאם', ymd: '2026-09-10' }]);
  });
  it('G8 original is manual → left alone, no popup', () => {
    const p = planVisitAttendance({ before, after, rows: [R('m1', 'אביאם', '2026-09-10', 'field')], visits: [after] });
    expect(p.ops.some(o => o.kind === 'delete')).toBe(false);
    expect(p.notices).toEqual([]);
  });
  it('G8b another visit of his on the original day → stays שטח', () => {
    const other = V('v9', '2026-09-10', 'אביאם');
    const p = planVisitAttendance({ before, after, rows: [auto10], visits: [after, other] });
    expect(p.ops.some(o => o.kind === 'delete')).toBe(false);
    expect(p.notices).toEqual([]);
  });
  it('G8c another person\'s visit that day does not keep his row', () => {
    const p = planVisitAttendance({ before, after, rows: [auto10], visits: [after, V('v9', '2026-09-10', 'ניתאי')] });
    expect(p.ops).toContainEqual({ kind: 'delete', id: auto10.id });
  });
  it('G9 a person removed from מי ביקר is treated like a moved date', () => {
    const b = V('v1', '2026-09-10', 'אביאם, ניתאי');
    const a = V('v1', '2026-09-10', 'אביאם');
    const autoN = R(autoRowId('ניתאי', '2026-09-10'), 'ניתאי', '2026-09-10', 'field', 'visit_auto');
    const p = planVisitAttendance({ before: b, after: a, rows: [autoN,
      R(autoRowId('אביאם', '2026-09-10'), 'אביאם', '2026-09-10', 'field', 'visit_auto')], visits: [a] });
    expect(p.ops).toEqual([{ kind: 'delete', id: autoN.id }]);
    expect(p.notices).toEqual([{ kind: 'needsEntry', person: 'ניתאי', ymd: '2026-09-10' }]);
  });
  it('G10 same date, same people → nothing at all', () => {
    const p = planVisitAttendance({ before, after: before, rows: [auto10], visits: [before] });
    expect(p).toEqual({ ops: [], asks: [], notices: [], autoDays: [] });
  });
});

import { describe, expect, it, vi } from 'vitest';
import { conflictQuestion, saveMessages, saveVisit } from './visitSave';

const deps = (over: Partial<any> = {}) => ({
  save: vi.fn().mockResolvedValue({ ok: true, id: 'v1', edited: false }),
  visits: vi.fn(() => []),
  rows: vi.fn(() => []),
  apply: vi.fn().mockResolvedValue({ ok: true, failed: 0 }),
  me: 'אביאם', ...over,
});
const input = { id: 'v1', kibbutz: 'חוקוק', visitor: 'אביאם', date: '2026-09-10', duration: 2 };

describe('saveVisit', () => {
  it('S1 new visit by אביאם → one upsert, the auto toast', async () => {
    const d = deps();
    const r: any = await saveVisit(input as any, d);
    expect(d.apply).toHaveBeenCalledWith([expect.objectContaining({ kind: 'upsert' })]);
    expect(r.toast).toBe('הסיכום נשמר · הוזנה נוכחות שטח אוטומטית ל-10.9');
    expect(r.attendanceOk).toBe(true);
  });
  it('S2 עמיחי saves → no attendance, plain toast', async () => {
    const d = deps({ me: 'עמיחי' });
    const r: any = await saveVisit({ ...input, visitor: 'עמיחי' } as any, d);
    expect(d.apply).not.toHaveBeenCalled();
    expect(r.toast).toBe('הסיכום נשמר');
  });
  it('S3 date moved off an auto day → delete + popup', async () => {
    const d = deps({
      visits: vi.fn(() => [{ id: 'v1', kibbutz: 'חוקוק', visitor: 'אביאם', date: '2026-09-08T09:00:00.000Z' }]),
      rows: vi.fn(() => [{ id: 'att_v_20260908_אביאם', person: 'אביאם', date: '2026-09-08T09:00:00.000Z', dayType: 'field', source: 'visit_auto' }]),
      save: vi.fn().mockResolvedValue({ ok: true, id: 'v1', edited: true }),
    });
    const r: any = await saveVisit(input as any, d);
    expect(d.apply.mock.calls[0][0]).toContainEqual({ kind: 'delete', id: 'att_v_20260908_אביאם' });
    expect(r.popups).toEqual(['נדרשת הזנת נוכחות ל-8.9']);
  });
  it('S3b date moved BACKWARDS off an auto day → the same delete + popup (direction does not matter)', async () => {
    const d = deps({
      visits: vi.fn(() => [{ id: 'v1', kibbutz: 'חוקוק', visitor: 'אביאם', date: '2026-09-15T09:00:00.000Z' }]),
      rows: vi.fn(() => [{ id: 'att_v_20260915_אביאם', person: 'אביאם', date: '2026-09-15T09:00:00.000Z', dayType: 'field', source: 'visit_auto' }]),
      save: vi.fn().mockResolvedValue({ ok: true, id: 'v1', edited: true }),
    });
    const r: any = await saveVisit(input as any, d);   // input moves the visit back to the 10th
    expect(d.apply.mock.calls[0][0]).toContainEqual({ kind: 'delete', id: 'att_v_20260915_אביאם' });
    expect(r.popups).toEqual(['נדרשת הזנת נוכחות ל-15.9']);
  });
  it('S4 a failed save applies nothing and returns the error', async () => {
    const d = deps({ save: vi.fn().mockResolvedValue({ ok: false, error: 'השמירה נכשלה, הסיכום נשמר במכשיר, נסה שוב' }) });
    const r = await saveVisit(input as any, d);
    expect(r.ok).toBe(false);
    expect(d.apply).not.toHaveBeenCalled();
  });
  it('S4b a locked save applies nothing and returns locked', async () => {
    const d = deps({ save: vi.fn().mockResolvedValue({ ok: false, error: 'הביקור נעול לעריכה', locked: true }) });
    const r: any = await saveVisit(input as any, d);
    expect(r.ok).toBe(false);
    expect(r.locked).toBe(true);
    expect(d.apply).not.toHaveBeenCalled();
    expect(d.rows).not.toHaveBeenCalled();
  });
  it('S5 a conflict is returned as a question, nothing written for it', async () => {
    const d = deps({ rows: vi.fn(() => [{ id: 'a1', person: 'אביאם', date: '2026-09-10T09:00:00.000Z', dayType: 'office', source: 'manual' }]) });
    const r: any = await saveVisit(input as any, d);
    expect(d.apply).not.toHaveBeenCalled();
    expect(conflictQuestion(r.asks[0])).toBe('הוזן משרד, לשנות לשטח?');
  });
  it('S5b moving the date ONTO a day that already has a manual row of another type also asks, never overwrites', async () => {
    const d = deps({
      visits: vi.fn(() => [{ id: 'v1', kibbutz: 'חוקוק', visitor: 'אביאם', date: '2026-09-01T09:00:00.000Z' }]),
      rows: vi.fn(() => [{ id: 'm1', person: 'אביאם', date: '2026-09-10T09:00:00.000Z', dayType: 'vacation', source: 'manual' }]),
      save: vi.fn().mockResolvedValue({ ok: true, id: 'v1', edited: true }),
    });
    const r: any = await saveVisit(input as any, d);   // moves onto 2026-09-10, which already has a vacation row
    expect(d.apply).not.toHaveBeenCalled();
    expect(r.asks).toEqual([{ kind: 'conflict', person: 'אביאם', ymd: '2026-09-10', rowId: 'm1', rowDate: '2026-09-10T09:00:00.000Z', existingType: 'vacation' }]);
  });
  it('S6 the attendance write fails: the visit still saved (ok), but the toast is plain and attendanceOk is false', async () => {
    const d = deps({ apply: vi.fn().mockResolvedValue({ ok: false, failed: 1 }) });
    const r: any = await saveVisit(input as any, d);
    expect(r.ok).toBe(true);
    expect(r.attendanceOk).toBe(false);
    expect(r.toast).toBe('הסיכום נשמר');
    expect(r.popups).toEqual([]);
  });
});

describe('saveMessages', () => {
  it('names the other person on a popup that is not the saver\'s', () => {
    expect(saveMessages({ ops: [], asks: [], autoDays: [], notices: [{ kind: 'needsEntry', person: 'ניתאי', ymd: '2026-09-08' }] }, 'אביאם').popups)
      .toEqual(['נדרשת הזנת נוכחות ל-8.9 · ניתאי']);
  });
});

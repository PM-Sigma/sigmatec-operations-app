// @vitest-environment jsdom
// 🔥 צריבות data layer (G-L2). The write/query plumbing is exercised through Burns.test.tsx
// already (the surfaces that call it); what is pinned HERE is the two rules a golden over pure
// functions cannot reach: the EMS refresh pages/throttles/stamps correctly (review focus #2),
// and undo restores the EXACT prior patch rather than "me, now" (review focus #3).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { writes, upserts } = vi.hoisted(() => ({
  writes: { calls: [] as Array<{ table: string; patch: any; ids: string[] }> },
  upserts: { calls: [] as Array<{ table: string; rows: any[] }> },
}));

vi.mock('@/bridge', () => ({ sigmaBus: new EventTarget() }));

// A supabase-js double: records every update()/upsert() the way Burns.test.tsx's does.
vi.mock('@/lib/supabase', () => {
  const table = (name: string) => {
    const api: any = {
      _patch: null as any,
      _ids: [] as string[],
      select: () => api,
      order: () => api,
      update(patch: any) { api._patch = patch; return api; },
      in(_col: string, ids: string[]) { api._ids = ids; return api; },
      eq(_col: string, id: string) { api._ids = [id]; return api; },
      upsert(rows: any[]) { upserts.calls.push({ table: name, rows }); return api; },
      then(res: any) {
        if (api._patch) writes.calls.push({ table: name, patch: api._patch, ids: api._ids });
        return Promise.resolve({ data: [], error: null }).then(res);
      },
    };
    return api;
  };
  return {
    getSupabase: async () => ({ from: (n: string) => table(n) }),
    sbWrite: async (run: (sb: any) => any) => run({ from: (n: string) => table(n) }),
  };
});

const listMetersByRole = vi.fn();
const listSolars = vi.fn(async () => []);
const searchMeters = vi.fn();
vi.mock('@/lib/ems/gateway', () => ({ emsGateway: () => ({ listMetersByRole, listSolars, searchMeters }) }));

const { refreshBurnsFromEms, unburnWithUndo, saveGeneratorSerial, searchEmsMeters } = await import('./burnsData');

beforeEach(() => {
  localStorage.clear();
  writes.calls.length = 0;
  upserts.calls.length = 0;
  listMetersByRole.mockReset();
  searchMeters.mockReset();
});

describe('refreshBurnsFromEms', () => {
  it('pages until a short page, upserts on meter_id, stamps the 12 h key', async () => {
    listMetersByRole
      .mockResolvedValueOnce(Array.from({ length: 200 }, (_, i) => ({ id: 'm' + i, serialNumber: i + 1, site: { name: 'גבים' }, type: { key: 'landis_e360pp' } })))
      .mockResolvedValueOnce([{ id: 'x', serialNumber: 7, site: { name: 'גבים' }, type: { key: 'landis_e360ct' } }]);
    const r = await refreshBurnsFromEms({ now: 1_000 });
    expect(listMetersByRole).toHaveBeenCalledTimes(2);
    expect(listMetersByRole).toHaveBeenCalledWith([20, 21, 22, 23, 24], 0, 200);
    expect(r).toEqual({ ran: true, upserted: 201, skipped: 0 });
    expect(localStorage.getItem('burn_ems_synced_v1')).toBe('1000');
    expect(upserts.calls[0].table).toBe('meter_burns');
    expect(upserts.calls[0].rows.length).toBe(201);
  });

  it('skips inside 12 h, runs again after', async () => {
    localStorage.setItem('burn_ems_synced_v1', String(1_000));
    expect((await refreshBurnsFromEms({ now: 1_000 + 11 * 3600e3 })).ran).toBe(false);
    expect(listMetersByRole).not.toHaveBeenCalled();
    listMetersByRole.mockResolvedValueOnce([]);
    expect((await refreshBurnsFromEms({ now: 1_000 + 13 * 3600e3 })).ran).toBe(true);
  });

  it('stops at 25 pages', async () => {
    listMetersByRole.mockResolvedValue(Array.from({ length: 200 }, (_, i) => ({ id: 'p' + i })));
    await refreshBurnsFromEms({ force: true, now: 5 });
    expect(listMetersByRole).toHaveBeenCalledTimes(25);
  });
});

describe('unburnWithUndo — review focus #3', () => {
  it('the undo restores who burned it and when, not "me, now"', async () => {
    const row: any = { meter_id: 'b', status: 'burned', burned_by: 'אביאם', burned_at: '2026-09-20T08:00:00Z' };
    const { undo } = await unburnWithUndo([row]);
    expect(writes.calls[0]).toMatchObject({ table: 'meter_burns', ids: ['b'], patch: expect.objectContaining({ status: 'pending', burned_by: null, burned_at: null }) });
    writes.calls.length = 0;
    await undo();
    expect(writes.calls[0]).toMatchObject({
      table: 'meter_burns', ids: ['b'],
      patch: expect.objectContaining({ status: 'burned', burned_by: 'אביאם', burned_at: '2026-09-20T08:00:00Z' }),
    });
  });
});

describe('saveGeneratorSerial', () => {
  it('PATCHes generators.device_serial for one row', async () => {
    await saveGeneratorSerial('g1', '999');
    expect(writes.calls[0]).toMatchObject({ table: 'generators', ids: ['g1'], patch: expect.objectContaining({ device_serial: '999' }) });
  });
  it('an empty serial clears the column', async () => {
    await saveGeneratorSerial('g1', '  ');
    expect(writes.calls[0].patch.device_serial).toBeNull();
  });
});

describe('searchEmsMeters', () => {
  it('maps EMS search hits through emsHitLines', async () => {
    searchMeters.mockResolvedValueOnce([{ serialNumber: 555, address: 'גנרטור רפת', site: { name: 'אור הנר' }, type: { name: 'Landis E360PP' } }]);
    const hits = await searchEmsMeters('555');
    expect(searchMeters).toHaveBeenCalledWith('555', 5);
    expect(hits).toEqual([{ serial: '555', label: '555 · גנרטור רפת · אור הנר · Landis E360PP' }]);
  });
});

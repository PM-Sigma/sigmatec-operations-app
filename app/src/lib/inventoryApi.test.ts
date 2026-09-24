// The React data layer (package I, task L8) over a fake supabase client — no network, no DOM.
// Mapper parity with js/src/01-data.js is checked against the LIVE current source (liftOrderUpdateRow
// below), the same lift-and-compare technique L2/L3/L4/L5 use, upgraded from test-order-patch.mjs's
// hand-copy so the two can never silently drift (a hand-copy already had — see the extra
// order_type/kibbutz/assignee columns 01-data.js grew since that file was last touched).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OrderDraft } from './inventory';

const { calls, state } = vi.hoisted(() => ({
  calls: { inserted: [] as Array<{ table: string; row: any }>, updated: [] as Array<{ table: string; id: string; patch: any }>, rpc: [] as Array<{ name: string; args: any }> },
  state: { insertFail: false, rpcResult: null as any, tables: {} as Record<string, any[]> },
}));

function chainable(resolve: () => { data: any; error: any }): any {
  const self: any = {
    eq: () => self, gte: () => self, lte: () => self, order: () => self, limit: () => self, select: () => self,
    single: async () => resolve(),
    then: (res: any, rej: any) => Promise.resolve(resolve()).then(res, rej),
  };
  return self;
}

const fakeSb = {
  from: (table: string) => ({
    select: () => chainable(() => ({ data: state.tables[table] || [], error: null })),
    insert: (row: any) => {
      calls.inserted.push({ table, row });
      const withId = Array.isArray(row)
        ? row.map((r: any, i: number) => ({ id: `${table}-${calls.inserted.length}-${i}`, cert_number: 2001, ...r }))
        : { id: `${table}-${calls.inserted.length}`, cert_number: 2001, ...row };
      return chainable(() => (state.insertFail ? { data: null, error: { message: 'insert failed' } } : { data: withId, error: null }));
    },
    update: (patch: any) => ({
      eq: async (_col: string, id: string) => { calls.updated.push({ table, id, patch }); return { data: null, error: null }; },
    }),
    upsert: async (row: any) => { calls.inserted.push({ table, row }); return { data: row, error: null }; },
  }),
  rpc: (name: string, args: any) => { calls.rpc.push({ name, args }); return chainable(() => ({ data: state.rpcResult, error: null })); },
};

vi.mock('@/bridge', () => ({ sigma: mockSigma }));
const mockSigma: Record<string, any> = {};

vi.mock('./track', () => ({ track: vi.fn() }));
vi.mock('./query', () => ({ queryClient: { invalidateQueries: vi.fn() } }));
vi.mock('./certLogo', () => ({ CERT_LOGO: 'data:logo' }));
vi.mock('./session', () => ({ notifySessionExpired: vi.fn() }));
vi.mock('./supabase', () => ({
  SB_URL: 'https://sb.test', SB_ANON: 'anon-key',
  getSupabase: async () => fakeSb,
  sbWrite: async (run: (sb: any) => Promise<any>) => {
    const res = await run(fakeSb);
    if (res && res.error) throw new Error(res.error.message);
    return res ? res.data : null;
  },
}));

const {
  movementRow, orderInsertRow, orderPatchRow, saveOrder, approveOrder, setOrderStatus,
  restockReturn, markDefective, saveProduct, setProductActive, deletePreview, deleteProduct,
  issueCert, cancelCert,
} = await import('./inventoryApi');
const { track } = await import('./track');

beforeEach(() => {
  calls.inserted.length = 0; calls.updated.length = 0; calls.rpc.length = 0;
  state.insertFail = false; state.rpcResult = null; state.tables = {};
  for (const k of Object.keys(mockSigma)) delete mockSigma[k];
  (track as any).mockClear?.();
});

// ───────────────────────── mapper parity with 01-data.js ─────────────────────────

/** Slices one top-level `function name(...) { ... }` out of the given source, brace-matched —
 * a live lift, not a hand copy, so this test fails the moment 01-data.js's mapper changes shape
 * out from under it (which is exactly what happened to test-order-patch.mjs's own hand copy:
 * it is missing order_type/kibbutz/assignee, all three added to 01-data.js since). */
function liftFunction(src: string, name: string): (b: Record<string, unknown>) => Record<string, unknown> {
  const marker = `function ${name}(b)`;
  const at = src.indexOf(marker);
  if (at === -1) throw new Error(`${name} not found in js/src/01-data.js — mapper parity check is stale`);
  const braceStart = src.indexOf('{', at);
  let depth = 0, i = braceStart;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) break; }
  }
  const body = src.slice(braceStart + 1, i);
  // eslint-disable-next-line no-new-func
  return new Function('b', body) as any;
}

const dataJsSrc = readFileSync(join(__dirname, '../../../js/src/01-data.js'), 'utf8');
const legacyOrderUpdateRow = liftFunction(dataJsSrc, 'orderUpdateRow');

describe('orderPatchRow = today (live-lifted from js/src/01-data.js orderUpdateRow)', () => {
  const bodies: Array<Record<string, unknown>> = [
    { status: 'pending' },
    { status: 'in_transit' },
    { status: 'pending', items: [{ name: 'Landis+Gyr E360PP', qty: 700 }], supplier: 'X', notes: 'n' },
    { status: 'delivered', deliveredAt: '2026-09-24T10:00:00.000Z' },
    { orderType: 'customer', kibbutz: 'חוקוק', assignee: 'עידן' },
    { distribution: { 'חוקוק': 3 }, createdBy: 'אביאם', expectedDate: '2026-10-01' },
  ];
  for (const [i, b] of bodies.entries()) {
    it(`body #${i + 1}: ${JSON.stringify(b)}`, () => {
      expect(orderPatchRow(b)).toEqual(legacyOrderUpdateRow(b));
    });
  }
  it('a status-only patch never carries items (would wipe them)', () => {
    expect(Object.keys(orderPatchRow({ status: 'pending' }))).toEqual(['status']);
  });
});

describe('movementRow / orderInsertRow: shape parity with W.movement / writeOrder (01-data.js)', () => {
  it('movementRow: same columns as W.movement, id/date defaulted when absent', () => {
    const row = movementRow({ product: 'מונה E360PP', fromLocation: 'ספק', toLocation: 'חברה', quantity: 5, reason: 'order_delivery', refId: 'ord-1', createdBy: 'עידן' });
    expect(row).toMatchObject({
      product: 'מונה E360PP', from_location: 'ספק', to_location: 'חברה', quantity: 5,
      reason: 'order_delivery', ref_id: 'ord-1', created_by: 'עידן',
    });
    expect(typeof row.id).toBe('string');
    expect(typeof row.date).toBe('string');
  });
  it('orderInsertRow: full row, delivered_at stamped only when status is delivered', () => {
    const now = '2026-09-24T10:00:00.000Z';
    const inserted = orderInsertRow({ status: 'pending', items: [], supplier: 'ABC', createdBy: 'עידן', orderType: 'supplier' }, 'ord-9', now);
    expect(inserted).toMatchObject({ id: 'ord-9', created_at: now, last_updated: now, delivered_at: '', supplier: 'ABC', order_type: 'supplier' });
    const delivered = orderInsertRow({ status: 'delivered', items: [], createdBy: 'עידן', orderType: 'supplier' }, 'ord-10', now);
    expect(delivered.delivered_at).toBe(now);
  });
  it('orderInsertRow omits assignee when unset (keeps inserts working pre-migration)', () => {
    expect('assignee' in orderInsertRow({ status: 'pending', items: [] }, 'ord-1', '2026-01-01')).toBe(false);
  });
});

// ───────────────────────── orders ─────────────────────────

const baseData = () => ({
  products: [{ name: 'מונה E360PP', category: 'מונה', active: true }],
  orders: [{ id: 'ord-3', status: 'arrived', items: [{ name: 'מונה E360PP', qty: 4 }], orderType: 'supplier' } as any],
  movements: [] as any[],
  requirements: [] as any[],
  returns: [{ id: 'ret-1', kibbutz: 'חוקוק', product: 'מונה E360PP', qty: 2, status: 'open' } as any],
});

describe('saveOrder (O16-O19)', () => {
  it('a fresh delivery inserts the delivery movements once, and patches the linked requirement', async () => {
    const data = baseData();
    data.requirements = [{ id: 'req-1', linkedOrderId: undefined, status: 'open' } as any];
    // an EXISTING order (id set): a brand new order is always force-saved as pending_approval
    // (orderSavePlan's O18b rule) and can never itself trigger the delivery movements.
    const draft: OrderDraft = {
      id: 'ord-3', orderType: 'supplier', supplier: 'ABC', createdBy: 'עידן', status: 'delivered', origStatus: 'arrived',
      items: [{ name: 'מונה E360PP', qty: 3 }],
    };
    const res = await saveOrder(draft, data as any, 'עידן');
    expect(res.id).toBeTruthy();
    const movInserts = calls.inserted.filter(c => c.table === 'movements');
    expect(movInserts).toHaveLength(1);
    expect(movInserts[0].row).toHaveLength(1);
    expect(movInserts[0].row[0]).toMatchObject({ product: 'מונה E360PP', from_location: 'ספק', to_location: 'חברה', quantity: 3, reason: 'order_delivery' });
  });

  it('rejects with the Hebrew error list when items are empty', async () => {
    const draft: OrderDraft = { orderType: 'supplier', createdBy: 'עידן', items: [] };
    await expect(saveOrder(draft, baseData() as any, 'עידן')).rejects.toThrow('צריך לפחות פריט אחד');
    expect(calls.inserted).toHaveLength(0);
  });
});

describe('setOrderStatus (D6 fix)', () => {
  it("'delivered' inserts 1 movement; called again with the refreshed data inserts 0", async () => {
    const data = baseData();
    const plan1 = await setOrderStatus('ord-3', 'delivered', data as any, 'עידן');
    expect(plan1.movements).toHaveLength(1);
    expect(calls.inserted.filter(c => c.table === 'movements')).toHaveLength(1);

    // refresh: the client now sees the movement it just posted
    const posted = calls.inserted.find(c => c.table === 'movements')!.row[0];
    data.movements = [{ ...posted, fromLocation: posted.from_location, toLocation: posted.to_location, refId: posted.ref_id, createdBy: posted.created_by }];
    calls.inserted.length = 0;
    const plan2 = await setOrderStatus('ord-3', 'delivered', data as any, 'עידן');
    expect(plan2.movements).toHaveLength(0);
    expect(calls.inserted.filter(c => c.table === 'movements')).toHaveLength(0);
  });
});

describe('approveOrder (O10-O13)', () => {
  it('customer approval calls sigma.emsWrite with the EmsTaskPlan and sigma.pushNotify, and tracks it', async () => {
    mockSigma.emsWrite = vi.fn(async () => ({ sent: true }));
    mockSigma.emsAfterWrite = vi.fn(async () => {});
    mockSigma.pushNotify = vi.fn();
    const data = baseData();
    data.orders = [{ id: 'ord-c', status: 'pending_approval', orderType: 'customer', kibbutz: 'חוקוק', items: [{ name: 'מונה E360PP', qty: 2 }] } as any];
    await approveOrder('ord-c', data as any, 'אביאם');
    expect(mockSigma.emsWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'createTask', kibbutz: 'חוקוק' }));
    expect(mockSigma.pushNotify).toHaveBeenCalledWith('approved', 'ord-c', 'אביאם');
    // the legacy customer-with-EMS-task branch never called sigmaTrack — only supplier/drop-ship do.
    expect(track).not.toHaveBeenCalled();
  });

  it('supplier approval tracks order-approved (sigma.track parity)', async () => {
    mockSigma.pushNotify = vi.fn();
    const data = baseData();
    await approveOrder('ord-3', data as any, 'אביאם');
    expect(track).toHaveBeenCalledWith('order-approved', 'ord-3');
  });
});

// ───────────────────────── returns (S18) ─────────────────────────

describe('restockReturn / markDefective', () => {
  it('restockReturn posts <kibbutz> → חברה once and marks restocked', async () => {
    await restockReturn('ret-1', baseData() as any, 'עידן');
    const mov = calls.inserted.find(c => c.table === 'movements');
    expect(mov?.row[0]).toMatchObject({ from_location: 'חוקוק', to_location: 'חברה', quantity: 2, reason: 'return_restock' });
    expect(calls.updated).toContainEqual({ table: 'returns', id: 'ret-1', patch: { status: 'restocked' } });
  });
  it('markDefective sends {status:"defective"} only', async () => {
    await markDefective('ret-1');
    expect(calls.updated).toContainEqual({ table: 'returns', id: 'ret-1', patch: { status: 'defective' } });
  });
});

// ───────────────────────── products (P12-P15) ─────────────────────────

describe('saveProduct / setProductActive (P13 fix)', () => {
  it('setProductActive sends update({active}) only — never touches name/category', async () => {
    await setProductActive('p-1', false);
    expect(calls.updated).toEqual([{ table: 'products', id: 'p-1', patch: { active: false } }]);
  });
  it('a non-עידן save never sends display_name', async () => {
    await saveProduct({ id: 'p-1', name: 'מונה E360PP', category: 'מונה', active: true, displayName: 'שם אחר' }, false);
    const row = calls.inserted[0].row;
    expect('display_name' in row).toBe(false);
  });
  it("עידן's save sends display_name (falls back to name when blank)", async () => {
    await saveProduct({ name: 'מונה E360PP' }, true);
    expect(calls.inserted[0].row.display_name).toBe('מונה E360PP');
  });
});

// ───────────────────────── delete cascade (L7) ─────────────────────────

describe('deletePreview / deleteProduct', () => {
  it('deletePreview calls the RPC and returns its preview', async () => {
    state.rpcResult = { product: '__DEL__', exists: 1, fingerprint: 'abc' };
    const r = await deletePreview('__DEL__');
    expect(calls.rpc).toEqual([{ name: 'inventory_delete_preview', args: { p_name: '__DEL__' } }]);
    expect(r.fingerprint).toBe('abc');
  });
  it('deleteProduct passes the fingerprint through to the RPC', async () => {
    state.rpcResult = { product: '__DEL__', fingerprint: 'abc' };
    await deleteProduct('__DEL__', 'abc');
    expect(calls.rpc).toEqual([{ name: 'inventory_delete_product', args: { p_name: '__DEL__', p_fingerprint: 'abc' } }]);
  });
});

// ───────────────────────── certificates ─────────────────────────

const certDraft = () => ({
  customer: { name: 'לקוח בדיקה' }, date: '2026-09-24', items: [{ name: 'מונה E360PP', qty: 2 }],
  notes: '', kibbutz: 'חוקוק', source: 'manual', refId: '', noPrint: false,
});

describe('issueCert / cancelCert', () => {
  it('an insert failure returns {number:null,id:null} and makes no doc-html patch', async () => {
    state.insertFail = true;
    const win = { document: { write: vi.fn(), open: vi.fn(), close: vi.fn() }, close: vi.fn() } as any;
    const res = await issueCert(certDraft() as any, 'עידן', win);
    expect(res).toEqual({ number: null, id: null });
    expect(calls.updated.find(c => c.table === 'delivery_certs' && 'doc_html' in c.patch)).toBeUndefined();
    expect(win.document.write).toHaveBeenCalled();   // still prints as a draft
  });

  it('a reissue calls cancelCert(old, newNumber)', async () => {
    const win = { document: { write: vi.fn(), open: vi.fn(), close: vi.fn() } } as any;
    const res = await issueCert({ ...certDraft(), reissueOf: { id: 'old-cert', certNumber: 1040 } } as any, 'עידן', win);
    expect(calls.updated).toContainEqual({ table: 'delivery_certs', id: 'old-cert', patch: { status: 'cancelled', replaced_by: res.number } });
  });

  it('a cert issued for source ems calls sigma.emsWrite with the view link', async () => {
    mockSigma.emsWrite = vi.fn(async () => ({ sent: true }));
    mockSigma.emsAfterWrite = vi.fn(async () => {});
    const win = { document: { write: vi.fn(), open: vi.fn(), close: vi.fn() } } as any;
    await issueCert({ ...certDraft(), source: 'ems', refId: 'task-1' } as any, 'עידן', win);
    expect(mockSigma.emsWrite).toHaveBeenCalledWith(expect.objectContaining({ kind: 'comment', taskId: 'task-1' }));
    expect((mockSigma.emsWrite as any).mock.calls[0][0].message).toContain('לצפייה');
  });

  it('cancelCert patches status + replaced_by', async () => {
    await cancelCert('c-1', 1043);
    expect(calls.updated).toEqual([{ table: 'delivery_certs', id: 'c-1', patch: { status: 'cancelled', replaced_by: 1043 } }]);
  });
});

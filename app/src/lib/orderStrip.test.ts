// 🧾 goldens for the orders strip on the inventory page (inventory spec §4a — a note per state).
import { describe, expect, it } from 'vitest';
import {
  canSetMinQty, isOpenOrder, orderNote, orderQty, orderStage, orderStripRows, type OrderLike,
} from './orderStrip';

const TODAY = '2026-09-19';
const ord = (o: Partial<OrderLike> = {}): OrderLike => ({
  id: 'ord-1', status: 'ממתין לאישור', supplier: 'לנדיס', createdAt: '2026-09-16',
  items: [{ name: 'בקר 504', qty: 20 }], ...o,
});
const CATALOG = ['בקר 504', 'מונה E360CT', 'סים 1NCE'];

describe('orderStage — the four decisive dots (§4a)', () => {
  it('maps every status', () => {
    expect(orderStage(ord())).toBe(0);
    expect(orderStage(ord({ status: 'הוזמן' }))).toBe(1);
    expect(orderStage(ord({ status: 'הגיעה' }))).toBe(2);
    expect(orderStage(ord({ status: 'סופקה' }))).toBe(3);
    expect(orderStage(ord({ status: 'arrived' }))).toBe(2);
    expect(orderStage(ord({ status: 'משהו אחר' }))).toBe(0);
  });
  it('a delivered or cancelled order has left the strip', () => {
    expect(isOpenOrder(ord({ status: 'סופקה' }))).toBe(false);
    expect(isOpenOrder(ord({ status: 'בוטלה' }))).toBe(false);
    expect(isOpenOrder(ord({ status: 'הוזמן' }))).toBe(true);
  });
});

describe('orderNote — one computed note per state (§4a)', () => {
  it('⏳ waiting for עמיחי, with the age', () =>
    expect(orderNote(ord(), TODAY, CATALOG)).toEqual({ icon: '⏳', text: 'ממתין לאישור עמיחי 3 ימים', level: 'waiting' }));

  it('🚚 ordered, with the expected date', () =>
    expect(orderNote(ord({ status: 'הוזמן', expectedDate: '2026-09-24' }), TODAY, CATALOG))
      .toEqual({ icon: '🚚', text: 'הוזמן, צפוי 24.9', level: 'transit' }));

  it('⚠️ late against the expected date', () =>
    expect(orderNote(ord({ status: 'הוזמן', expectedDate: '2026-09-14' }), TODAY, CATALOG))
      .toEqual({ icon: '⚠️', text: 'באיחור 5 ימים מהתאריך הצפוי', level: 'late' }));

  it('📦 arrived — someone has to mark it supplied', () =>
    expect(orderNote(ord({ status: 'הגיעה' }), TODAY, CATALOG))
      .toEqual({ icon: '📦', text: 'הגיע. לסמן סופק כדי שייכנס למלאי', level: 'action' }));

  it('🔗 a customer order with an open EMS task', () =>
    expect(orderNote(ord({ orderType: 'customer', kibbutz: 'גבים', emsTaskId: 't-1' }), TODAY, CATALOG))
      .toEqual({ icon: '🔗', text: 'לקוח: משימת EMS פתוחה', level: 'waiting' }));

  it('⚠️ an item nobody stocks beats every other note', () =>
    expect(orderNote(ord({ status: 'הוזמן', expectedDate: '2026-09-01', items: [{ name: 'בקר 999', qty: 1 }] }), TODAY, CATALOG))
      .toEqual({ icon: '⚠️', text: 'פריט לא בקטלוג: בקר 999', level: 'late' }));

  it('no catalog loaded → no catalog complaint', () =>
    expect(orderNote(ord({ items: [{ name: 'בקר 999', qty: 1 }] }), TODAY, []).icon).toBe('⏳'));

  it('counts the items', () => expect(orderQty(ord({ items: [{ qty: 2 }, { qty: '3' }] }))).toBe(5));
});

describe('orderStripRows — urgency order (§4a)', () => {
  const rows = orderStripRows([
    ord({ id: 'a', status: 'הוזמן', expectedDate: '2026-09-25' }),                       // transit
    ord({ id: 'b', status: 'הגיעה' }),                                                    // action
    ord({ id: 'c', status: 'הוזמן', expectedDate: '2026-09-10' }),                        // late
    ord({ id: 'd' }),                                                                     // waiting
    ord({ id: 'e', status: 'סופקה' }),                                                    // gone
    ord({ id: 'f', orderType: 'customer', kibbutz: 'יגור', dropShip: true }),             // drop-ship
  ], TODAY, CATALOG);

  it('closed orders are not on this page', () => expect(rows.map(r => r.id)).not.toContain('e'));
  it('late → needs action → waiting → in transit', () =>
    expect(rows.map(r => r.note.level)).toEqual(['late', 'action', 'waiting', 'waiting', 'transit']));
  it('a drop-ship has no stages', () => {
    const f = rows.find(r => r.id === 'f')!;
    expect(f.stage).toBe(-1);
    expect(f.dropShip).toBe(true);
    expect(f.title).toBe('יגור');
  });
});

describe('canSetMinQty (§5, decision I3)', () => {
  it('only the two who buy', () => {
    expect(canSetMinQty('עידן', false)).toBe(true);
    expect(canSetMinQty('עמיחי', false)).toBe(true);
    expect(canSetMinQty('אביאם', false)).toBe(false);
    expect(canSetMinQty('עידן', true)).toBe(false);
  });
});

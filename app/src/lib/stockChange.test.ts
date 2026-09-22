// Goldens for §4b — every one the spec names, plus the two direction contradictions.
import { describe, expect, it } from 'vitest';
import { POOL, RECOUNT_LOC } from './inventory';
import { stockChangePlan } from './stockChange';

const base = { product: 'E360CT', pool: 38, actor: 'עמיחי', recountId: 'rc-1' };

describe('stockChangePlan — §4b', () => {
  it('decrease via recount 38 → 35 writes ONE חברה → ספירה row of 3, plus the recount', () => {
    const plan = stockChangePlan({ ...base, direction: 'decrease', source: 'recount', counted: 35, note: 'נספר במחסן' });
    expect(plan.errors).toEqual([]);
    expect(plan.requires).toBeNull();
    expect(plan.movements).toEqual([
      { product: 'E360CT', fromLocation: POOL, toLocation: RECOUNT_LOC, quantity: 3, reason: 'recount', refId: 'rc-1', createdBy: 'עמיחי' },
    ]);
    expect(plan.recount).toEqual({ id: 'rc-1', product: 'E360CT', counted: 35, before: 38, delta: -3, note: 'נספר במחסן', actor: 'עמיחי' });
  });

  it('increase via recount 38 → 40 writes ספירה → חברה of 2', () => {
    const plan = stockChangePlan({ ...base, direction: 'increase', source: 'recount', counted: 40, note: 'נמצאו בארגז' });
    expect(plan.movements).toEqual([
      { product: 'E360CT', fromLocation: RECOUNT_LOC, toLocation: POOL, quantity: 2, reason: 'recount', refId: 'rc-1', createdBy: 'עמיחי' },
    ]);
    expect(plan.recount?.delta).toBe(2);
  });

  it('increase via order routes to the order flow and writes nothing', () => {
    const plan = stockChangePlan({ ...base, direction: 'increase', source: 'order', orderId: 'ord-7' });
    expect(plan).toEqual({ movements: [], requires: 'order', errors: [] });
  });

  it('increase via order with no order picked still routes there, with the error', () => {
    const plan = stockChangePlan({ ...base, direction: 'increase', source: 'order' });
    expect(plan.requires).toBe('order');
    expect(plan.movements).toEqual([]);
    expect(plan.errors).toEqual(['בחר הזמנת ספק פתוחה']);
  });

  it('decrease via visit routes to the visit form and writes nothing', () => {
    const plan = stockChangePlan({ ...base, direction: 'decrease', source: 'visit' });
    expect(plan).toEqual({ movements: [], requires: 'visit', errors: [] });
  });

  it('recount without a note is refused', () => {
    const plan = stockChangePlan({ ...base, direction: 'decrease', source: 'recount', counted: 35 });
    expect(plan.errors).toEqual(['חובה להזין הערה לספירה']);
    expect(plan.movements).toEqual([]);
  });

  it('recount equal to the pool is refused', () => {
    const plan = stockChangePlan({ ...base, direction: 'decrease', source: 'recount', counted: 38, note: 'נספר' });
    expect(plan.errors).toEqual(['הספירה זהה למלאי, אין שינוי']);
  });

  it('refuses a count that contradicts the chosen direction', () => {
    expect(stockChangePlan({ ...base, direction: 'decrease', source: 'recount', counted: 41, note: 'נספר' }).errors)
      .toEqual(['בחרת ירידה אבל הספירה גבוהה מהמלאי']);
    expect(stockChangePlan({ ...base, direction: 'increase', source: 'recount', counted: 30, note: 'נספר' }).errors)
      .toEqual(['בחרת עלייה אבל הספירה נמוכה מהמלאי']);
  });

  it('refuses a missing or negative count', () => {
    expect(stockChangePlan({ ...base, direction: 'decrease', source: 'recount', counted: '', note: 'נספר' }).errors)
      .toEqual(['הזן את הכמות שנספרה']);
    expect(stockChangePlan({ ...base, direction: 'decrease', source: 'recount', counted: -2, note: 'נספר' }).errors)
      .toEqual(['הכמות שנספרה לא יכולה להיות שלילית']);
  });

  it('counts 0 as a real count (everything is gone), not as "nothing entered"', () => {
    const plan = stockChangePlan({ ...base, direction: 'decrease', source: 'recount', counted: 0, note: 'המדף ריק' });
    expect(plan.movements[0].quantity).toBe(38);
    expect(plan.recount?.counted).toBe(0);
  });

  it('refuses the impossible direction/source pairs, and the empty sheet', () => {
    expect(stockChangePlan({ ...base, direction: 'decrease', source: 'order' }).errors).toEqual(['הזמנה מעלה מלאי, לא מורידה']);
    expect(stockChangePlan({ ...base, direction: 'increase', source: 'visit' }).errors).toEqual(['ביקור מוריד מלאי, לא מעלה']);
    expect(stockChangePlan({}).errors).toEqual(['בחר פריט', 'בחר אם המלאי ירד או עלה', 'בחר מה קרה']);
    expect(stockChangePlan(null).movements).toEqual([]);
  });
});

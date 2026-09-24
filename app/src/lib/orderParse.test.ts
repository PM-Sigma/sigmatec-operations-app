// Goldens for the order text parser (package I, task L4). The corpus results are recorded from
// the CURRENT js/src/07-orders.js parseLocalToItems (scripts/inventory-goldens-record.mjs), the
// same legacy-goldens.json task L2 already uses.
import { describe, expect, it } from 'vitest';
import {
  accessoryPlan, accessoryQuestions, ambiguousSatecQuestion, ctrlLabel, intakeNormalize,
  intakeQtyNear, parseLocalToItems, parseSourceLabel, psLabel,
} from './orderParse';
import goldens from './__fixtures__/inventory/legacy-goldens.json';
import corpus from './__fixtures__/inventory/parse-corpus.json';

describe('parseLocalToItems = today (recorded from js/src/07-orders.js)', () => {
  for (const text of corpus.texts) {
    it(JSON.stringify(text), () => {
      expect(parseLocalToItems(text, corpus.catalog)).toEqual((goldens as any).parse[text]);
    });
  }
});

describe('accessoryPlan (test-autoadd.mjs cases A-G — round 5 Phase 1, no SIM)', () => {
  it('A — all Landis: no controller, no accessories', () => {
    expect(accessoryPlan([{ name: 'Landis+Gyr E360PP', qty: 3 }, { name: 'Landis+Gyr E360CT', qty: 5 }]))
      .toMatchObject({ landisQty: 8, totalControllers: 0, antennaQty: 0, psQty: 0 });
  });
  it('B — 10 explicit PUSR + 4 Satec → +4 controllers → 14 total', () => {
    expect(accessoryPlan([{ name: 'PUSR Controller', qty: 10 }, { name: 'Satec EM133', qty: 4 }]))
      .toMatchObject({ controllersToAdd: 4, totalControllers: 14, antennaQty: 14, psQty: 14 });
  });
  it('C — 2 Satec, no explicit controller → 2 controllers', () => {
    expect(accessoryPlan([{ name: 'Satec PM135', qty: 2 }]))
      .toMatchObject({ controllersToAdd: 2, totalControllers: 2, antennaQty: 2, psQty: 2 });
  });
  it('D — Landis E570 needs no controller', () => {
    expect(accessoryPlan([{ name: 'Landis+Gyr E570', qty: 5 }])).toMatchObject({ landisQty: 5, totalControllers: 0, antennaQty: 0 });
  });
  it('E — physical משנ"ז is not a meter → no accessories', () => {
    expect(accessoryPlan([{ name: 'משנ"ז 400', qty: 5 }])).toMatchObject({ totalControllers: 0, antennaQty: 0 });
  });
  it('F — Carlo + EM133 → 7 controllers', () => {
    expect(accessoryPlan([{ name: 'Carlo Gavazzi E341', qty: 5 }, { name: 'Satec EM133', qty: 2 }]))
      .toMatchObject({ controllersToAdd: 7, totalControllers: 7, antennaQty: 7, psQty: 7 });
  });
  it('G — full mixed order', () => {
    expect(accessoryPlan([
      { name: 'Landis+Gyr E360PP', qty: 5 }, { name: 'Satec EM133', qty: 2 },
      { name: 'משנ"ז 400', qty: 1 }, { name: 'Carlo Gavazzi E341', qty: 5 },
    ])).toMatchObject({ landisQty: 5, nonLandisMeterQty: 7, totalControllers: 7, antennaQty: 7, psQty: 7 });
  });
  it('SIM is retired — never part of the model', () => {
    expect(accessoryPlan([{ name: 'Partner Sim', qty: 5 }])).not.toHaveProperty('simQty');
  });
});

describe('accessoryQuestions asks controller then power supply, with pool hints', () => {
  it('two catalog options each → two questions, in order', () => {
    const q = accessoryQuestions([{ name: 'Satec EM133', qty: 2 }], corpus.catalog, { 'Robustel Controller': 4 });
    expect(q.map(x => x.title)).toEqual(['בחירת בקר', 'בחירת ספק כוח']);
    expect(q[0].options.find(o => o.value === 'Robustel Controller')?.hint).toBe('Robustel Controller · במלאי: 4');
  });
  it('a single catalog option auto-resolves — no question', () => {
    const q = accessoryQuestions([{ name: 'Satec EM133', qty: 1 }], ['Satec EM133', 'Robustel Controller'], {});
    expect(q).toEqual([]);   // only one controller option and no ספק כוח products in this mini-catalog
  });
});

describe('ambiguousSatecQuestion (O26)', () => {
  it('"סאטק" with no model asks between every satec/em133/pm135 catalog product', () => {
    const q = ambiguousSatecQuestion('2 סאטק', [{ name: 'Satec EM133', qty: 2 }], corpus.catalog, {});
    expect(q?.title).toBe('איזה סאטק?');
    // the corpus catalog carries three: EM133, PM135, and the EM133-משנ"ז variant.
    expect(q?.options.map(o => o.value)).toEqual(['Satec EM133', 'Satec PM135', 'Satec EM133 משנ"ז']);
  });
  it('a qualifier (133/135/שנאי/...) means no ambiguity — null', () => {
    expect(ambiguousSatecQuestion('5 סאטק 133', [{ name: 'Satec EM133', qty: 5 }], corpus.catalog, {})).toBeNull();
  });
});

describe('psLabel / ctrlLabel / parseSourceLabel', () => {
  it('psLabel', () => {
    expect(psLabel('ספק כוח פס-דין')).toBe('📥 פס-דין');
    expect(psLabel('ספק כוח שקע')).toBe('🔌 שקע');
  });
  it('ctrlLabel', () => {
    expect(ctrlLabel('Robustel Controller')).toBe('🛰️ Robustel');
    expect(ctrlLabel('PUSR Controller')).toBe('📟 PUSR');
  });
  it('parseSourceLabel', () => {
    expect(parseSourceLabel('gemini:2.0-flash')).toEqual({ kind: 'gemini', model: '2.0-flash' });
    expect(parseSourceLabel('groq:llama')).toEqual({ kind: 'groq', model: 'llama' });
    expect(parseSourceLabel('local')).toEqual({ kind: 'offline', model: '' });
    expect(parseSourceLabel('')).toEqual({ kind: '', model: '' });
  });
});

describe('intakeNormalize / intakeQtyNear', () => {
  it('strips niqqud/quotes, collapses whitespace, lowercases', () => {
    expect(intakeNormalize('  שָׁלוֹם  "world"  ')).toBe('שלום world');
  });
  it('reads the nearest LEADING number, else a Hebrew number word, else uncertain 1', () => {
    const norm = intakeNormalize('5 מונים');
    expect(intakeQtyNear(norm, norm.indexOf('מונים'))).toEqual({ value: 5, uncertain: false });
    expect(intakeQtyNear('שלושה מונים', 'שלושה מונים'.indexOf('מונים'))).toEqual({ value: 3, uncertain: false });
    expect(intakeQtyNear('מונים', 0)).toEqual({ value: 1, uncertain: true });
  });
});

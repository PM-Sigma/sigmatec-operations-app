import { describe, expect, it } from 'vitest';
import {
  ALIASES, MISSPELLINGS, isSimProduct, misspellingsFor, normalizeTerm,
  pickableProducts, productGroups, searchProducts,
} from './productSearch';

/** The live Sheet catalog (js/src/09-visits.js PRODUCT_LIST) plus the בקר 504 row. */
const CATALOG = [
  'Satec EM133', 'Satec PM135', 'מונה Landis+Gyr E360PP', 'מונה Landis+Gyr E360SP',
  'Landis+Gyr E360CT', 'Landis+Gyr E570', 'Robustel Controller', 'PUSR Controller',
  'Partner Sim', 'Cellcom Sim', 'כרטיס תקשורת צרוב(E350)', 'אנטנה',
  'ספק כוח פס-דין', 'ספק כוח שקע', 'משנ"ז 250', 'משנ"ז 400', 'בקר 504',
];

describe('normalizeTerm', () => {
  it('folds case, spaces, hyphens and the gershayim variants', () => {
    expect(normalizeTerm('E-360 PP')).toBe('e360pp');
    expect(normalizeTerm('e360pp')).toBe('e360pp');
    expect(normalizeTerm('משנ"ז 250')).toBe('משנז250');
    expect(normalizeTerm('משנ״ז 250')).toBe('משנז250');
    expect(normalizeTerm('כרטיס תקשורת צרוב(E350)')).toBe('כרטיסתקשורתצרובe350');
  });

  it('folds Arabic-Indic digits to Latin ones (a phone keyboard must not hide a model number)', () => {
    expect(normalizeTerm('E٣٦٠PP')).toBe('e360pp');
    expect(normalizeTerm('۵۷۰')).toBe('570');
  });

  it('is total — nothing throws on rubbish', () => {
    expect(normalizeTerm(null)).toBe('');
    expect(normalizeTerm(undefined)).toBe('');
    expect(normalizeTerm(42)).toBe('42');
  });
});

describe('SIM rows are hidden, never deleted', () => {
  it('recognises both spellings', () => {
    expect(isSimProduct('Partner Sim')).toBe(true);
    expect(isSimProduct('Cellcom Sim')).toBe(true);
    expect(isSimProduct('סים סלקום')).toBe(true);
    expect(isSimProduct('Satec EM133')).toBe(false);
  });

  it('pickableProducts drops them and keeps everything else in order', () => {
    const out = pickableProducts(CATALOG);
    expect(out).not.toContain('Partner Sim');
    expect(out).not.toContain('Cellcom Sim');
    expect(out).toHaveLength(CATALOG.length - 2);
    expect(out[0]).toBe('Satec EM133');
  });

  it('a SIM can never be searched up', () => {
    expect(searchProducts('partner sim', CATALOG).hits).toEqual([]);
    expect(searchProducts('סים', CATALOG).hits).toEqual([]);
  });
});

describe('the alias table — how the two of them actually say it', () => {
  it('לנדיס / landis / 360 open the E360 family as a follow-up pick', () => {
    for (const q of ['לנדיס', 'landis', '360', 'e360']) {
      const r = searchProducts(q, CATALOG);
      expect(r.needsPick, q).toBe(true);
      expect(r.hits.sort(), q).toEqual([
        'Landis+Gyr E360CT', 'מונה Landis+Gyr E360PP', 'מונה Landis+Gyr E360SP',
      ].sort());
      expect(r.picked, q).toBeNull();
    }
  });

  it('picking the variant narrows the family to exactly one', () => {
    expect(searchProducts('e360ct', CATALOG).picked).toBe('Landis+Gyr E360CT');
    expect(searchProducts('e360pp', CATALOG).picked).toBe('מונה Landis+Gyr E360PP');
    expect(searchProducts('e360sp', CATALOG).picked).toBe('מונה Landis+Gyr E360SP');
  });

  it('570 / e570 → E570, em133 / 133 → EM133, pm135 / 135 → PM135', () => {
    expect(searchProducts('570', CATALOG).picked).toBe('Landis+Gyr E570');
    expect(searchProducts('e570', CATALOG).picked).toBe('Landis+Gyr E570');
    expect(searchProducts('em133', CATALOG).picked).toBe('Satec EM133');
    expect(searchProducts('133', CATALOG).picked).toBe('Satec EM133');
    expect(searchProducts('pm135', CATALOG).picked).toBe('Satec PM135');
    expect(searchProducts('135', CATALOG).picked).toBe('Satec PM135');
  });

  it('בקר / 504 → בקר 504 when the catalog has it', () => {
    expect(searchProducts('בקר', CATALOG).picked).toBe('בקר 504');
    expect(searchProducts('504', CATALOG).picked).toBe('בקר 504');
  });

  it('… and falls back to the controllers when it does not', () => {
    const noBakar = CATALOG.filter(n => n !== 'בקר 504');
    const r = searchProducts('בקר', noBakar);
    expect(r.hits.sort()).toEqual(['PUSR Controller', 'Robustel Controller']);
    expect(r.needsPick).toBe(true);
  });

  it('every alias resolves to something in this catalog', () => {
    for (const key of Object.keys(ALIASES)) {
      expect(searchProducts(key, CATALOG).hits.length, key).toBeGreaterThan(0);
    }
  });
});

describe('every catalog product carries 3–6 misspellings that find it and nothing else', () => {
  const pickable = pickableProducts(CATALOG);

  it('the table covers every pickable product with at least three spellings', () => {
    for (const name of pickable) {
      expect(misspellingsFor(name).length, name).toBeGreaterThanOrEqual(3);
      expect(misspellingsFor(name).length, name).toBeLessThanOrEqual(6);
    }
  });

  it('each misspelling resolves to its own product', () => {
    for (const name of pickable) {
      for (const m of misspellingsFor(name)) {
        const r = searchProducts(m, CATALOG);
        expect(r.hits, `${name} ← "${m}"`).toContain(name);
      }
    }
  });

  it('SIM rows keep their misspellings in the table but stay unreachable', () => {
    expect(MISSPELLINGS['Partner Sim'].length).toBeGreaterThan(0);
    expect(searchProducts(MISSPELLINGS['Partner Sim'][0], CATALOG).hits).toEqual([]);
  });

  it('an unknown product still gets generated spellings', () => {
    const gen = misspellingsFor('Acme Widget 900X');
    expect(gen.length).toBeGreaterThanOrEqual(3);
    expect(searchProducts('900', [...CATALOG, 'Acme Widget 900X']).hits).toContain('Acme Widget 900X');
  });
});

describe('the escape hatches', () => {
  it('an empty query answers nothing, not everything', () => {
    const r = searchProducts('', CATALOG);
    expect(r.hits).toEqual([]);
    expect(r.picked).toBeNull();
    expect(r.needsPick).toBe(false);
  });

  it('a word that means nothing here answers nothing, and the query comes back untouched', () => {
    const r = searchProducts('  מקרר  ', CATALOG);
    expect(r.hits).toEqual([]);
    expect(r.query).toBe('  מקרר  ');
  });

  it('an exact catalog name always wins outright', () => {
    for (const name of pickableProducts(CATALOG)) {
      expect(searchProducts(name, CATALOG).picked, name).toBe(name);
    }
  });

  it('an empty catalog is an answer, not a crash', () => {
    expect(searchProducts('לנדיס', []).hits).toEqual([]);
    expect(searchProducts('לנדיס', null).hits).toEqual([]);
  });
});

// ───────────── the tile grid inside ציוד שסופק (QA round 3, J2) ─────────────

describe('productGroups', () => {
  const catOf = (n: string) => ({
    'מונה E570': 'מונים', 'מונה EM133': 'מונים',
    'בקר 504': 'בקרים', 'אנטנה': 'תקשורת',
  } as Record<string, string>)[n] || '';

  it('מונים comes first, אחר last, the rest alphabetical he', () => {
    const g = productGroups(['אנטנה', 'כבל', 'בקר 504', 'מונה E570'], catOf);
    expect(g.map(x => x.category)).toEqual(['מונים', 'בקרים', 'תקשורת', 'אחר']);
  });

  it('a product with no category lands under אחר', () => {
    const g = productGroups(['כבל'], catOf);
    expect(g).toEqual([{ category: 'אחר', names: ['כבל'] }]);
  });

  it('names inside a group are a-b-c (he), not input order', () => {
    const g = productGroups(['מונה EM133', 'מונה E570'], () => 'מונים');
    expect(g[0].names).toEqual(['מונה E570', 'מונה EM133']);
  });

  it('nothing in, nothing out', () => {
    expect(productGroups([], catOf)).toEqual([]);
    expect(productGroups(null, catOf)).toEqual([]);
  });
});

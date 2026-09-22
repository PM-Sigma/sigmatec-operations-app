// 🔎 מוצרים נוספים — keyword search over the product catalog (QA round 2, Package C item 4).
//
// The old field was a `<datalist>`: it matched a PREFIX of the exact catalog spelling, so a
// technician standing in a meter cabinet typing "לנדיס" or "360" got nothing, and typed the
// product as free text instead — which never reaches the stock ledger. This module is the
// rule that fixes it, and it is pure on purpose: the chapters sheet, the legacy form and the
// goldens all evaluate the same answer.
//
// Three ideas, no more:
//   1. NORMALIZE both sides — lowercase, no spaces/hyphens/quotes/parens, Arabic-Indic digits
//      folded to Latin ones — so "E-360 PP", "e360pp" and "‎E٣٦٠PP" are one string.
//   2. An ALIAS table for how people actually say these things ("לנדיס", "landis", "360").
//      An alias resolves to a TOKEN that is looked for inside the normalized catalog name, so
//      a catalog rename cannot silently empty it.
//   3. Every catalog product carries 3–6 plausible MISSPELLINGS, and each one must resolve to
//      that product and nothing else (goldens: productSearch.test.ts).
//
// Exactly one hit → picked. Several → the caller shows chips (the E360 family's CT/PP/SP pick
// is just "several hits"; there is no second concept for it).
//
// Keep this module import-free.

/** SIM cards are hidden from the pickable list for now (עידן 22.9) — hidden, never deleted. */
const SIM_WORDS = ['סים', 'sim'];

/** Arabic-Indic and Eastern-Arabic digits → Latin, so a phone keyboard cannot hide a model number. */
const DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * One comparable string. Everything that is not a letter or a digit goes, including the
 * Hebrew gershayim variants that make `משנ"ז` and `משנ׳׳ז` look like different products.
 */
export function normalizeTerm(s: unknown): string {
  let out = String(s ?? '').toLowerCase();
  out = out.replace(/[٠-٩۰-۹]/g, ch => DIGIT_MAP[ch] || ch);
  out = out.normalize ? out.normalize('NFKD').replace(/[֑-ׇ]/g, '') : out;
  // Keep Hebrew letters, Latin letters and digits. Everything else is punctuation to us.
  return out.replace(/[^0-9a-zא-ת]/g, '');
}

/** Is this row a SIM card? Those are hidden from the pickable list (item 4). */
export function isSimProduct(name: unknown): boolean {
  const n = String(name ?? '').toLowerCase();
  return SIM_WORDS.some(w => n.includes(w));
}

/** The catalog a person may actually pick from: everything except the SIM rows. */
export function pickableProducts(names: ReadonlyArray<string> | null | undefined): string[] {
  return (names || []).map(n => String(n || '')).filter(n => n && !isSimProduct(n));
}

/**
 * How people say it → the token that must appear in the normalized catalog name.
 * `fallback` is tried only when the primary token matches nothing in THIS catalog, which is
 * what lets "בקר" mean the בקר 504 row where it exists and the controllers where it does not.
 */
export interface Alias { token: string; fallback?: string; label?: string }

export const ALIASES: Record<string, Alias> = {
  // Landis+Gyr E360 — the family. Three hits (CT/PP/SP) is the follow-up pick.
  'לנדיס': { token: 'e360', label: 'Landis+Gyr E360' },
  'לאנדיס': { token: 'e360', label: 'Landis+Gyr E360' },
  'landis': { token: 'e360', label: 'Landis+Gyr E360' },
  'landisgyr': { token: 'e360', label: 'Landis+Gyr E360' },
  '360': { token: 'e360', label: 'Landis+Gyr E360' },
  'e360': { token: 'e360', label: 'Landis+Gyr E360' },
  'א360': { token: 'e360', label: 'Landis+Gyr E360' },
  // E570
  '570': { token: 'e570' },
  'e570': { token: 'e570' },
  'א570': { token: 'e570' },
  // Satec
  'em133': { token: 'em133' },
  '133': { token: 'em133' },
  'אמ133': { token: 'em133' },
  'pm135': { token: 'pm135' },
  '135': { token: 'pm135' },
  'פמ135': { token: 'pm135' },
  'סאטק': { token: 'satec' },
  'satec': { token: 'satec' },
  // בקר 504 where the catalog has it; the controllers otherwise.
  'בקר': { token: '504', fallback: 'controller' },
  '504': { token: '504', fallback: 'controller' },
  'controller': { token: 'controller' },
  'בקרים': { token: '504', fallback: 'controller' },
  // the rest of the shelf
  'אנטנה': { token: 'אנטנה' },
  'antenna': { token: 'אנטנה' },
  'ספק': { token: 'ספקכוח' },
  'ספקכוח': { token: 'ספקכוח' },
  'משנז': { token: 'משנז' },
  'e350': { token: 'e350' },
  '350': { token: 'e350' },
};

/**
 * 3–6 plausible misspellings per catalog product — what the goldens sweep. These are how the
 * two of them actually type on a phone, not typo theory: a dropped vendor, a run-together
 * model, a Hebrew transliteration, a bare number.
 */
export const MISSPELLINGS: Record<string, string[]> = {
  'Satec EM133': ['em133', 'em 133', '133', 'satek em133', 'אמ133', 'satec133'],
  'Satec PM135': ['pm135', 'pm 135', '135', 'satek pm135', 'פמ135', 'satec135'],
  'מונה Landis+Gyr E360PP': ['e360pp', 'e-360 pp', '360pp', 'לנדיס pp', 'landis pp', 'e360 p p'],
  'מונה Landis+Gyr E360SP': ['e360sp', 'e-360 sp', '360sp', 'לנדיס sp', 'landis sp', 'e360 s p'],
  'Landis+Gyr E360CT': ['e360ct', 'e-360 ct', '360ct', 'לנדיס ct', 'landis ct', 'e360 c t'],
  'Landis+Gyr E570': ['e570', 'e-570', '570', 'לנדיס 570', 'landis 570'],
  'Robustel Controller': ['robustel', 'רובסטל', 'robustell', 'robustel controler', 'בקר רובסטל'],
  'PUSR Controller': ['pusr', 'פיו אס אר', 'pusr controler', 'בקר pusr', 'push controller'],
  'Partner Sim': ['partner sim', 'סים פרטנר', 'פרטנר sim'],
  'Cellcom Sim': ['cellcom sim', 'סים סלקום', 'סלקום sim'],
  'כרטיס תקשורת צרוב(E350)': ['e350', '350', 'כרטיס צרוב', 'כרטיס תקשורת', 'כרטיס תקשורת צרוב'],
  'אנטנה': ['אנטנה', 'אנטנא', 'antenna', 'antena'],
  'ספק כוח פס-דין': ['ספק כוח פס דין', 'ספק פס דין', 'ספק כח פס-דין', 'ספקכוח פסדין'],
  'ספק כוח שקע': ['ספק כוח שקע', 'ספק שקע', 'ספק כח שקע', 'ספקכוח שקע'],
  'משנ"ז 250': ['משנז 250', 'משנ״ז 250', 'משנז250', 'משנ"ז250'],
  'משנ"ז 400': ['משנז 400', 'משנ״ז 400', 'משנז400', 'משנ"ז400'],
  'בקר 504': ['בקר 504', '504', 'בקר504', 'בקר 504 ', 'בקר'],
};

/** The misspellings we know for a product; an unknown product gets a small generated set. */
export function misspellingsFor(name: string): string[] {
  const known = MISSPELLINGS[name];
  if (known) return known;
  const n = String(name || '').trim();
  if (!n) return [];
  const out = new Set<string>();
  out.add(n.toLowerCase());
  out.add(n.replace(/\s+/g, ''));
  const model = (n.match(/[A-Za-z]*\d{2,}[A-Za-z]*/) || [])[0];
  if (model) { out.add(model.toLowerCase()); out.add(model.replace(/\D/g, '')); }
  const words = n.split(/\s+/).filter(Boolean);
  if (words.length > 1) out.add(words[words.length - 1].toLowerCase());
  return [...out].filter(Boolean);
}

export interface ProductSearchResult {
  /** What was typed, untouched — for the "add as free text" escape hatch. */
  query: string;
  /** Catalog names that match, in catalog order. */
  hits: string[];
  /** Exactly one hit → the caller may pick it outright. */
  picked: string | null;
  /** Several hits → the caller shows chips (the E360 CT/PP/SP follow-up is this). */
  needsPick: boolean;
  /** The alias family the query resolved through, when it did. */
  family?: string;
}

const EMPTY: ProductSearchResult = { query: '', hits: [], picked: null, needsPick: false };

/** Everything the query could mean, given this catalog. SIM rows are never returned. */
export function searchProducts(
  query: unknown,
  catalog: ReadonlyArray<string> | null | undefined,
): ProductSearchResult {
  const raw = String(query ?? '');
  const q = normalizeTerm(raw);
  const names = pickableProducts(catalog);
  if (!q || !names.length) return { ...EMPTY, query: raw };

  const norm = names.map(n => ({ name: n, key: normalizeTerm(n) }));
  const by = (token: string) => norm.filter(x => x.key.includes(token)).map(x => x.name);

  // 1. an exact normalized name wins outright — nothing beats typing it right.
  const exact = norm.filter(x => x.key === q).map(x => x.name);
  if (exact.length) return { query: raw, hits: exact, picked: exact[0], needsPick: false };

  // 2. the alias table — the whole query, or its longest matching prefix/word.
  const alias = ALIASES[q];
  let hits: string[] = [];
  let family: string | undefined;
  if (alias) {
    hits = by(alias.token);
    if (!hits.length && alias.fallback) hits = by(alias.fallback);
    family = alias.label || alias.token;
  }

  // 3. a known misspelling of a specific product.
  if (!hits.length) {
    hits = names.filter(n => misspellingsFor(n).some(m => normalizeTerm(m) === q));
  }

  // 4. plain substring, both directions — "לנדיסgyr" still finds the row, and a typed
  //    catalog name that is LONGER than the row (a pasted line) still finds it too.
  if (!hits.length) hits = by(q);
  if (!hits.length) hits = norm.filter(x => x.key.length >= 3 && q.includes(x.key)).map(x => x.name);

  return { query: raw, hits, picked: hits.length === 1 ? hits[0] : null, needsPick: hits.length > 1, family };
}

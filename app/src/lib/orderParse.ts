// The order text parser and the customer accessory questions (package I, task L4) — ported 1:1
// from js/src/07-orders.js (INTAKE_ALIASES/HE_NUMWORDS/intakeNormalize/intakeQtyNear/
// accessoryPlan/parseLocalToItems/psLabel/ctrlLabel/finalizeCustomerAccessories/
// resolveAmbiguousSatec), with the DOM/askChoice() interaction turned into plain data: a
// `Question` is what the app used to show as a popup, now just a value the caller decides what
// to do with (an inline sheet step in React; askChoice()'s modal in the legacy bundle once L6
// wires SigmaInv in). `parseLocalToItems` takes the catalog ARRAY instead of calling
// getActiveProducts() — the DOM/SHEET_DATA coupling is the only thing that changes.

// ───────────────────────────── the deterministic keyword matcher ─────────────────────────────

export const INTAKE_ALIASES: Record<string, string> = {
  '360sp': '360sp', '360pp': '360pp', '360ct': '360ct', 'e570': '570', '570': '570',
  'em133': 'em133', '133': 'em133', 'satec': 'em133', 'סאטק': 'em133',
  'לנדיס ישיר': 'e360pp', 'ישיר לקו': 'e360pp', 'חד פאזי': 'e360sp', 'לנדיס חד': 'e360sp', 'לנדיס תלת': 'e360pp',
  'מונה משנה זרם': 'e360ct', 'מונה משנז': 'e360ct', 'משנה זרם': 'e360ct',
  'carlo': 'carlo', 'קרלו': 'carlo', 'e341': 'carlo', 'gavazzi': 'carlo',
  'pm135': 'pm135', 'מונה שנאי': 'pm135', 'מונה מקביל': 'pm135',
  'purs': 'purs',
  'בקר': 'בקר', 'בקרים': 'בקר', 'robustel': 'robustel',
  'רובסטל': 'robustel',
};
export const HE_NUMWORDS: Record<string, number> = {
  'אחד': 1, 'אחת': 1, 'שני': 2, 'שתי': 2, 'שניים': 2, 'שתיים': 2, 'שלוש': 3, 'שלושה': 3,
  'ארבע': 4, 'ארבעה': 4, 'חמש': 5, 'חמישה': 5, 'שש': 6, 'שישה': 6, 'שבע': 7, 'שבעה': 7, 'שמונה': 8, 'תשע': 9, 'תשעה': 9, 'עשר': 10, 'עשרה': 10,
};
/** Generic category words that appear in MANY product names — never a match token on their own. */
export const INTAKE_STOP = ['מונה', 'מונים'];

export function intakeNormalize(s: string | null | undefined): string {
  return (s || '')
    .replace(/[֑-ׇ]/g, '')
    .replace(/['"`׳״]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase().trim();
}

export function intakeQtyNear(norm: string, idx: number): { value: number; uncertain: boolean } {
  const before = norm.slice(Math.max(0, idx - 14), idx);
  const mb = /(\d{1,3})\D*$/.exec(before);
  if (mb) return { value: parseInt(mb[1], 10), uncertain: false };
  for (const [w, n] of Object.entries(HE_NUMWORDS)) {
    if (before.indexOf(intakeNormalize(w)) !== -1) return { value: n, uncertain: false };
  }
  return { value: 1, uncertain: true };
}

export interface ParsedItem { name: string; qty: number; uncertain: boolean }

/** parseLocalToItems: the deterministic keyword/alias matcher against the catalog. */
export function parseLocalToItems(raw: string, catalog: ReadonlyArray<string>): ParsedItem[] {
  const norm = intakeNormalize(raw);
  const items: ParsedItem[] = [];
  for (const prodName of catalog) {
    const normProd = intakeNormalize(prodName);
    const tokens = normProd.split(' ').filter(t => t.length >= 2 && INTAKE_STOP.indexOf(t) === -1);
    const numToks = tokens.filter(t => /^\d{2,4}$/.test(t));
    if (numToks.length && !numToks.some(n => norm.indexOf(n) !== -1)) continue;
    let idx = -1;
    for (const t of tokens) { const at = norm.indexOf(t); if (at !== -1) { idx = at; break; } }
    if (idx === -1) {
      for (const [alias, hint] of Object.entries(INTAKE_ALIASES)) {
        if (normProd.indexOf(intakeNormalize(hint)) !== -1) {
          const at = norm.indexOf(alias);
          if (at !== -1) { idx = at; break; }
        }
      }
    }
    if (idx !== -1) {
      const q = intakeQtyNear(norm, idx);
      if (!q.uncertain && /^(133|135|250|400|485|360)$/.test(String(q.value)) && normProd.replace(/[^0-9]/g, '').indexOf(String(q.value)) !== -1) {
        q.value = 1; q.uncertain = true;
      }
      items.push({ name: prodName, qty: q.value, uncertain: q.uncertain });
    }
  }
  const _genericMeterAsk = /לנדיס/.test(norm) ||
    (/מונ/.test(norm) && !/סאטק|satec|133|קרלו|carlo|pm135|e341|חד פאזי|חד פזי/.test(norm));
  if (_genericMeterAsk && !items.some(it => /E360PP|E360SP|E570|EM133|PM135|E341/i.test(it.name))) {
    const def = catalog.find(n => /E360PP/i.test(n));
    if (def) {
      let firstAny = -1, firstNum = -1, totalNum = -1, at = -1;
      const totalAt = norm.indexOf('סהכ');
      while ((at = norm.indexOf('מונ', at + 1)) !== -1) {
        if (firstAny === -1) firstAny = at;
        if (!intakeQtyNear(norm, at).uncertain) {
          if (firstNum === -1) firstNum = at;
          if (totalAt !== -1 && at > totalAt && totalNum === -1) totalNum = at;
        }
      }
      const anchor = totalNum !== -1 ? totalNum : (firstNum !== -1 ? firstNum : (firstAny !== -1 ? firstAny : norm.indexOf('לנדיס')));
      const q = intakeQtyNear(norm, anchor);
      items.push({ name: def, qty: q.value, uncertain: q.uncertain });
    }
  }
  if (/מונה\s*משנ/.test(norm)) {
    for (let i = items.length - 1; i >= 0; i--) if (/^משנ/.test(intakeNormalize(items[i].name))) items.splice(i, 1);
  }
  if (/pm135|סאטק.*(משני.?זרם|שנאי)|מונה שנאי/.test(norm) && items.some(it => /pm135/i.test(it.name))) {
    for (let i = items.length - 1; i >= 0; i--) if (/em133/i.test(intakeNormalize(items[i].name))) items.splice(i, 1);
  }
  if (/משנז/.test(norm) && !/משני\s*זרם/.test(norm) && /em133|133/.test(norm)) {
    for (let i = items.length - 1; i >= 0; i--) if (intakeNormalize(items[i].name) === intakeNormalize('Satec EM133')) items.splice(i, 1);
  }
  if (!(/em133|133|סאטק|satec/.test(norm) && /משנז|משנה זרם/.test(norm))) {
    for (let i = items.length - 1; i >= 0; i--) {
      const nk = intakeNormalize(items[i].name);
      if (/em133/.test(nk) && /משנז/.test(nk)) items.splice(i, 1);
    }
  }
  const seen = new Set<string>();
  return items.filter(it => { if (seen.has(it.name)) return false; seen.add(it.name); return true; });
}

// ───────────────────────────── the customer accessory model ─────────────────────────────

export interface AccessoryPlan {
  landisQty: number; nonLandisMeterQty: number; controllersToAdd: number;
  totalControllers: number; antennaQty: number; psQty: number;
}
export interface CountItem { name: string; qty: number | string }

/** accessoryPlan: pure counts (test-autoadd.mjs cases A-G). SIM is retired — never counted. */
export function accessoryPlan(items: ReadonlyArray<CountItem>): AccessoryPlan {
  const sumQty = (pred: (n: string) => boolean) =>
    items.filter(it => pred(it.name)).reduce((s, it) => s + (parseInt(String(it.qty), 10) || 0), 0);
  const isLandis = (n: string) => /landis|e360|e570/i.test(n);
  const isMeter = (n: string) => isLandis(n) || /satec|em133|pm135|carlo|e341/i.test(n);
  const isCtrl = (n: string) => /robustel|pusr|purs/i.test(n);
  const landisQty = sumQty(isLandis);
  const nonLandisMeterQty = sumQty(n => isMeter(n) && !isLandis(n));
  const explicitControllers = sumQty(isCtrl);
  const controllersToAdd = nonLandisMeterQty;
  const totalControllers = explicitControllers + controllersToAdd;
  return { landisQty, nonLandisMeterQty, controllersToAdd, totalControllers, antennaQty: totalControllers, psQty: totalControllers };
}

/** Short button label for a power-supply candidate. */
export function psLabel(name: string): string {
  if (/פס.?דין/.test(name)) return '📥 פס-דין';
  if (/שקע/.test(name)) return '🔌 שקע';
  return name.replace(/^ספק כוח\s*/, '') || name;
}
export function ctrlLabel(name: string): string {
  if (/robustel/i.test(name)) return '🛰️ Robustel';
  if (/pusr|purs/i.test(name)) return '📟 PUSR';
  return name;
}

export interface QuestionOption { label: string; value: string; hint: string }
export interface Question { title: string; progress: string; text: string; options: QuestionOption[]; apply: 'controller' | 'ps' | 'satec'; qty: number }

/** accessoryQuestions (finalizeCustomerAccessories, minus the DOM): one question per accessory
 * kind that has ≥2 catalog options to choose between (askChoice only fired when there was a
 * real choice — a single option auto-added silently, so it isn't a question here either). */
export function accessoryQuestions(
  items: ReadonlyArray<CountItem>, catalog: ReadonlyArray<string>, pool: Record<string, number>,
): Question[] {
  const plan = accessoryPlan(items);
  const qs: Question[] = [];
  if (plan.controllersToAdd > 0) {
    const ctrlOpts = catalog.filter(n => /robustel|pusr|purs/i.test(n));
    if (ctrlOpts.length >= 2) {
      qs.push({
        title: 'בחירת בקר', progress: 'שאלה 1 מ-2',
        text: 'יש ' + plan.nonLandisMeterQty + ' מונים שאינם לנדיס, לכל אחד נדרש בקר. איזה בקר להוסיף?',
        options: ctrlOpts.map(c => ({ label: ctrlLabel(c), value: c, hint: c + ' · במלאי: ' + (pool[c] || 0) })),
        apply: 'controller', qty: plan.controllersToAdd,
      });
    }
  }
  if (plan.psQty > 0) {
    const psOpts = catalog.filter(n => /ספק כוח/.test(n));
    if (psOpts.length >= 2) {
      qs.push({
        title: 'בחירת ספק כוח', progress: 'שאלה 2 מ-2',
        text: 'נדרש ספק כוח ל-' + plan.totalControllers + ' בקרים. איזה סוג?',
        options: psOpts.map(p => ({ label: psLabel(p), value: p, hint: p })),
        apply: 'ps', qty: plan.psQty,
      });
    }
  }
  return qs;
}

/** ambiguousSatecQuestion (resolveAmbiguousSatec, minus the DOM): "סאטק" with no model given. */
export function ambiguousSatecQuestion(
  raw: string, items: ReadonlyArray<CountItem>, catalog: ReadonlyArray<string>, pool: Record<string, number>,
): Question | null {
  const norm = intakeNormalize(raw);
  if (!/סאטק|satec/.test(norm)) return null;
  if (/133|135|em133|pm135|שנאי|מקביל|רגיל|תלת|חד/.test(norm)) return null;
  const satecItem = items.find(it => /satec|em133|pm135/i.test(it.name));
  if (!satecItem) return null;
  const opts = catalog.filter(n => /satec|em133|pm135/i.test(n));
  if (opts.length < 2) return null;
  return {
    title: 'איזה סאטק?', progress: 'הבהרה',
    text: 'ביקשת "סאטק" בלי לציין דגם. איזה מונה התכוונת?',
    options: opts.map(o => ({
      label: o, value: o,
      hint: (/pm135/i.test(o) ? 'מונה שנאי / משני-זרם' : 'תלת-פאזי רגיל') + ' · במלאי: ' + (pool[o] || 0),
    })),
    apply: 'satec', qty: 0,
  };
}

// ───────────────────────────── the AI-vs-local source badge ─────────────────────────────

export interface ParseSourceLabel { kind: 'gemini' | 'groq' | 'offline' | ''; model: string }

/** parseSourceLabel: which engine answered (window._lastParseSource: 'gemini:model' / 'groq:model' / 'local' / ''). */
export function parseSourceLabel(src: string | null | undefined): ParseSourceLabel {
  const s = src || '';
  const model = s.indexOf(':') !== -1 ? s.split(':')[1] : '';
  if (/^gemini/i.test(s)) return { kind: 'gemini', model };
  if (/^groq/i.test(s)) return { kind: 'groq', model };
  if (!s) return { kind: '', model: '' };
  return { kind: 'offline', model };
}

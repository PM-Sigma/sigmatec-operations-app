// בריאות קיבוץ v1 — עמיחי's four signals (company-process spec §5), as a FIRST DRAFT.
//
// Ruling §8b: build the shape, leave the numbers open (reminder `sigma-health-v1-thresholds`,
// Tue 22.9 09:00). Everything tunable therefore lives in ONE exported const — Tuesday's answer
// is a one-line diff, not a hunt through four scorers.
//
// PURE, like field.ts / onboarding.ts: no React, no DOM, no network. The only import is
// `audienceFor` from field.ts, because who may look at a management signal is decided there
// once for the whole app and must not be re-decided here.
//
// Two invariants the goldens defend:
//   1. A missing source is NOT a zero. `null` in → `{score: null, why: 'אין נתונים'}`, and a
//      null signal is EXCLUDED from the average. A source nobody wired up must never paint a
//      kibbutz red.
//   2. No scorer contains a number. Every threshold comes from `HEALTH_CONFIG_DRAFT`, and the
//      0–3 scale itself is the named `SCORE` table below — a source sweep in health.test.ts
//      fails the build on any digit inside a scorer body.
import { audienceFor } from '@/lib/field';

// ───────────────────────────── the whole tuning surface ─────────────────────────────

/**
 * DRAFT — placeholder thresholds, pending עידן 22.9 (sigma-health-v1-thresholds).
 * Not to be read as truth.
 */
export const HEALTH_CONFIG_DRAFT = {
  draft: true,
  /** §5: "start equal". */
  weights: { finance: 1, energy: 1, alerts: 1, recurring: 1 },
  finance: { lossIsRed: true, marginBandPct: 10, missingBillDays: 5 },
  /** גבים's 15–20% loss is the red case. */
  energy: { lossWarnPct: 8, lossRedPct: 15 },
  alerts: { silentMeterWarn: 1, silentMeterRed: 3, staleTaskDays: 7 },
  recurring: { windowDays: 60, clusterWarn: 2, clusterRed: 4 },
  /** Where the weighted average turns amber and green (0–3 scale). */
  bands: { amberMin: 1.5, greenMin: 2.5 },
  /** Which `HealthSource` implementation healthSources.ts hands back. */
  source: 'ems' as 'ems' | 'none',
} as const;

export type HealthConfig = typeof HEALTH_CONFIG_DRAFT;

/** The 0–3 scale, named — so a scorer body can stay free of numeric literals. */
export const SCORE = { bad: 0, warn: 1, ok: 2, good: 3 } as const;

/** Used by the scorers for the "is this a loss" comparison; not a threshold. */
const ZERO = 0;

// ───────────────────────────── shapes ─────────────────────────────

/**
 * Every input field is independently nullable: EMS exposes some of a signal's raw material
 * today and none of the rest, and half a signal is still worth showing. A field that is
 * `null` is skipped; a signal with nothing left to look at scores `null`.
 */
export interface FinanceInput {
  /** Last bill's margin, in percent. Negative = הפסד. */
  marginPct: number | null;
  /** How many days late the last bill is. */
  billDaysLate: number | null;
}

export interface EnergyInput {
  /** Supplier main meter vs the sum of the distribution centers, in percent. */
  lossPct: number | null;
}

export interface AlertsInput {
  /** Meters that stopped transmitting. */
  silentMeters: number | null;
  /** Age, in days, of the oldest client request still without an answer. */
  oldestOpenTaskDays: number | null;
}

export interface RecurringInput {
  /** How many requests fell into the same subject inside the window. */
  clusterCount: number | null;
}

export interface Signal {
  /** 0–3, higher is better. `null` = nothing to look at. */
  score: number | null;
  why: string;
}

export interface Signals {
  finance: Signal;
  energy: Signal;
  alerts: Signal;
  recurring: Signal;
}

export type Band = 'green' | 'amber' | 'red';

export interface Health {
  /** Weighted average of the signals that have a score; `null` when none has one. */
  score: number | null;
  band: Band | null;
  signals: Signals;
  draft: true;
}

export const NO_DATA = 'אין נתונים';

/** The Hebrew label of each signal, in the order the strip shows them. */
export const SIGNAL_LABELS: Array<{ key: keyof Signals; label: string }> = [
  { key: 'finance', label: 'מאזן כספי' },
  { key: 'energy', label: 'מאזן אנרגיה' },
  { key: 'alerts', label: 'פניות ללא מענה' },
  { key: 'recurring', label: 'בעיות חוזרות' },
];

// ───────────────────────────── the scorers ─────────────────────────────

/** A sub-check that had nothing to look at. */
const skip: { score: null; why: null } = { score: null, why: null };

interface Part { score: number | null; why: string | null }

/**
 * The worst sub-check wins, and the `why` explains that one — the dot has to say what is
 * actually wrong, not the average of what is wrong.
 */
function worst(parts: Part[]): Signal {
  const real = parts.filter(p => p.score !== null) as Array<{ score: number; why: string }>;
  if (!real.length) return { score: null, why: NO_DATA };
  let hit = real[ZERO];
  for (const p of real) if (p.score < hit.score) hit = p;
  return { score: hit.score, why: hit.why };
}

export function scoreFinance(input: FinanceInput | null, cfg: HealthConfig = HEALTH_CONFIG_DRAFT): Signal {
  if (!input) return { score: null, why: NO_DATA };
  const parts: Part[] = [];

  if (input.billDaysLate === null) parts.push(skip);
  else if (input.billDaysLate >= cfg.finance.missingBillDays) {
    parts.push({ score: SCORE.bad, why: `החשבון מתעכב ${input.billDaysLate} ימים` });
  } else parts.push({ score: SCORE.good, why: 'החשבון האחרון הגיע בזמן' });

  if (input.marginPct === null) parts.push(skip);
  else if (input.marginPct < ZERO) {
    parts.push({
      score: cfg.finance.lossIsRed ? SCORE.bad : SCORE.warn,
      why: `החשבון האחרון בהפסד של ${Math.abs(input.marginPct)}%`,
    });
  } else if (input.marginPct < cfg.finance.marginBandPct) {
    parts.push({ score: SCORE.warn, why: `רווח נמוך מהרגיל — ${input.marginPct}%` });
  } else parts.push({ score: SCORE.good, why: `רווח ${input.marginPct}% בחשבון האחרון` });

  return worst(parts);
}

export function scoreEnergy(input: EnergyInput | null, cfg: HealthConfig = HEALTH_CONFIG_DRAFT): Signal {
  if (!input || input.lossPct === null) return { score: null, why: NO_DATA };
  const loss = input.lossPct;
  if (loss >= cfg.energy.lossRedPct) return { score: SCORE.bad, why: `פער של ${loss}% בין המונה הראשי למרכזיות` };
  if (loss >= cfg.energy.lossWarnPct) return { score: SCORE.warn, why: `פער של ${loss}% בין המונה הראשי למרכזיות` };
  return { score: SCORE.good, why: `פער של ${loss}% — בתחום הסביר` };
}

export function scoreAlerts(input: AlertsInput | null, cfg: HealthConfig = HEALTH_CONFIG_DRAFT): Signal {
  if (!input) return { score: null, why: NO_DATA };
  const parts: Part[] = [];

  if (input.silentMeters === null) parts.push(skip);
  else if (input.silentMeters >= cfg.alerts.silentMeterRed) {
    parts.push({ score: SCORE.bad, why: `${input.silentMeters} מונים לא משדרים` });
  } else if (input.silentMeters >= cfg.alerts.silentMeterWarn) {
    parts.push({ score: SCORE.warn, why: `${input.silentMeters} מונים לא משדרים` });
  } else parts.push({ score: SCORE.good, why: 'כל המונים משדרים' });

  if (input.oldestOpenTaskDays === null) parts.push(skip);
  else if (input.oldestOpenTaskDays >= cfg.alerts.staleTaskDays) {
    parts.push({ score: SCORE.warn, why: `פנייה פתוחה כבר ${input.oldestOpenTaskDays} ימים` });
  } else parts.push({ score: SCORE.good, why: 'אין פניות שנשארו בלי מענה' });

  return worst(parts);
}

export function scoreRecurring(input: RecurringInput | null, cfg: HealthConfig = HEALTH_CONFIG_DRAFT): Signal {
  if (!input || input.clusterCount === null) return { score: null, why: NO_DATA };
  const n = input.clusterCount;
  const window = cfg.recurring.windowDays;
  if (n >= cfg.recurring.clusterRed) return { score: SCORE.bad, why: `${n} פניות באותו נושא ב-${window} הימים האחרונים` };
  if (n >= cfg.recurring.clusterWarn) return { score: SCORE.warn, why: `${n} פניות באותו נושא ב-${window} הימים האחרונים` };
  return { score: SCORE.good, why: 'אין נושא שחוזר על עצמו' };
}

// ───────────────────────────── the roll-up ─────────────────────────────

/**
 * Weighted average over the signals that HAVE a score. A `null` signal is left out of both the
 * numerator and the denominator — counting it as 0 would turn "we never wired this up" into
 * "this kibbutz is in trouble", which is the one mistake this draft must not make.
 */
export function healthOf(signals: Signals, cfg: HealthConfig = HEALTH_CONFIG_DRAFT): Health {
  let sum = 0;
  let weight = 0;
  for (const { key } of SIGNAL_LABELS) {
    const s = signals[key];
    if (!s || s.score === null) continue;
    const w = cfg.weights[key];
    sum += s.score * w;
    weight += w;
  }
  const score = weight > 0 ? sum / weight : null;
  return { score, band: bandOf(score, cfg), signals, draft: true };
}

/** `null` in → `null` out: no data is its own state, never a red one. */
export function bandOf(score: number | null, cfg: HealthConfig = HEALTH_CONFIG_DRAFT): Band | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= cfg.bands.greenMin) return 'green';
  if (score >= cfg.bands.amberMin) return 'amber';
  return 'red';
}

/** All four empty — what a kibbutz looks like before any source is wired up. */
export function emptySignals(): Signals {
  return {
    finance: { score: null, why: NO_DATA },
    energy: { score: null, why: NO_DATA },
    alerts: { score: null, why: NO_DATA },
    recurring: { score: null, why: NO_DATA },
  };
}

// ───────────────────────────── who may look ─────────────────────────────

/** The two people this overview is for (spec §5 — it is עמיחי's view, and עידן's). */
export const HEALTH_PEOPLE = ['עידן', 'עמיחי'];

/**
 * A management signal: never for the field role (`audienceFor(role).health`, spec §5.1b), and
 * otherwise עמיחי, עידן, and a read-only viewer.
 */
export function canSeeHealth(user: string | null | undefined, role: string | null | undefined): boolean {
  const r = String(role || '');
  if (!audienceFor(r).health) return false;
  if (r === 'viewer') return true;
  return HEALTH_PEOPLE.includes(String(user || '').trim());
}

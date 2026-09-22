// Goldens for the health draft (Task 28, company-process spec §5 + the §8b ruling).
//
// The numbers here are the DRAFT numbers; they are expected to change on 22.9. What must NOT
// change is the shape: null is excluded, all-null is not red, weights are applied, and the
// band edges are the config's.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EMS_UNLINKED_NOTE, HEALTH_CONFIG_DRAFT, NO_DATA, SCORE, bandOf, canSeeHealth, emptySignals,
  emsUnlinkedHealthNote, healthOf, scoreAlerts, scoreEnergy, scoreFinance, scoreRecurring,
  type Signals,
} from './health';

const cfg = HEALTH_CONFIG_DRAFT;
const sig = (over: Partial<Signals> = {}): Signals => ({ ...emptySignals(), ...over });
const good = { score: SCORE.good, why: 'x' };

describe('the config is the whole tuning surface', () => {
  it('is marked as a draft', () => {
    expect(cfg.draft).toBe(true);
  });

  it('starts with equal weights (§5)', () => {
    expect(Object.values(cfg.weights)).toEqual([1, 1, 1, 1]);
  });

  /**
   * The contract sweep: no scorer may carry a number of its own. Same trick as the
   * internal-tasks no-`due` sweep — the source is read and the scorer bodies are scanned, so
   * a threshold typed inline on 22.9 fails here instead of drifting away from the config.
   */
  it('no scorer body contains a numeric literal — every threshold comes from the config', () => {
    const src = readFileSync(fileURLToPath(new URL('./health.ts', import.meta.url)), 'utf8');
    const names = ['scoreFinance', 'scoreEnergy', 'scoreAlerts', 'scoreRecurring'];
    for (const name of names) {
      const start = src.indexOf('export function ' + name);
      expect(start, name + ' not found').toBeGreaterThan(-1);
      const after = src.slice(start);
      const end = after.indexOf('\n}\n');
      const body = after.slice(0, end === -1 ? after.length : end);
      expect(body.match(/\d/g), name + ' carries a number of its own: ' + body).toBeNull();
    }
  });
});

describe('scoreFinance', () => {
  it('null input → no data, never a zero', () => {
    expect(scoreFinance(null)).toEqual({ score: null, why: NO_DATA });
  });

  it('every field null → no data', () => {
    expect(scoreFinance({ marginPct: null, billDaysLate: null })).toEqual({ score: null, why: NO_DATA });
  });

  it('a late bill is red', () => {
    const s = scoreFinance({ marginPct: 30, billDaysLate: cfg.finance.missingBillDays });
    expect(s.score).toBe(SCORE.bad);
    expect(s.why).toContain('מתעכב');
  });

  it('a loss is red while lossIsRed holds', () => {
    const s = scoreFinance({ marginPct: -4, billDaysLate: 0 });
    expect(s.score).toBe(SCORE.bad);
    expect(s.why).toContain('הפסד');
  });

  it('a thin margin is amber-level, a healthy one is good', () => {
    expect(scoreFinance({ marginPct: cfg.finance.marginBandPct - 1, billDaysLate: 0 }).score).toBe(SCORE.warn);
    expect(scoreFinance({ marginPct: cfg.finance.marginBandPct, billDaysLate: 0 }).score).toBe(SCORE.good);
  });

  it('the worst sub-check owns the explanation', () => {
    const s = scoreFinance({ marginPct: 40, billDaysLate: cfg.finance.missingBillDays + 3 });
    expect(s.why).toContain('מתעכב');
  });

  it('a half-known input still scores on the field it has', () => {
    expect(scoreFinance({ marginPct: null, billDaysLate: 0 }).score).toBe(SCORE.good);
  });
});

describe('scoreEnergy', () => {
  it('null → no data', () => {
    expect(scoreEnergy(null).score).toBeNull();
    expect(scoreEnergy({ lossPct: null }).why).toBe(NO_DATA);
  });

  it('the band edges are the config values', () => {
    expect(scoreEnergy({ lossPct: cfg.energy.lossWarnPct - 1 }).score).toBe(SCORE.good);
    expect(scoreEnergy({ lossPct: cfg.energy.lossWarnPct }).score).toBe(SCORE.warn);
    expect(scoreEnergy({ lossPct: cfg.energy.lossRedPct }).score).toBe(SCORE.bad);
  });
});

describe('scoreAlerts', () => {
  it('null → no data', () => {
    expect(scoreAlerts(null).score).toBeNull();
    expect(scoreAlerts({ silentMeters: null, oldestOpenTaskDays: null }).score).toBeNull();
  });

  it('silent meters cross warn then red', () => {
    expect(scoreAlerts({ silentMeters: 0, oldestOpenTaskDays: null }).score).toBe(SCORE.good);
    expect(scoreAlerts({ silentMeters: cfg.alerts.silentMeterWarn, oldestOpenTaskDays: null }).score).toBe(SCORE.warn);
    expect(scoreAlerts({ silentMeters: cfg.alerts.silentMeterRed, oldestOpenTaskDays: null }).score).toBe(SCORE.bad);
  });

  it('an old unanswered request is a warning on its own', () => {
    const s = scoreAlerts({ silentMeters: null, oldestOpenTaskDays: cfg.alerts.staleTaskDays });
    expect(s.score).toBe(SCORE.warn);
    expect(s.why).toContain('פנייה פתוחה');
  });
});

describe('scoreRecurring', () => {
  it('null → no data', () => {
    expect(scoreRecurring({ clusterCount: null }).why).toBe(NO_DATA);
  });

  it('clusters cross warn then red, and the window is named', () => {
    expect(scoreRecurring({ clusterCount: 0 }).score).toBe(SCORE.good);
    expect(scoreRecurring({ clusterCount: cfg.recurring.clusterWarn }).score).toBe(SCORE.warn);
    const red = scoreRecurring({ clusterCount: cfg.recurring.clusterRed });
    expect(red.score).toBe(SCORE.bad);
    expect(red.why).toContain(String(cfg.recurring.windowDays));
  });
});

describe('healthOf', () => {
  it('all four unknown → no score, no band, and NOT red', () => {
    const h = healthOf(emptySignals());
    expect(h.score).toBeNull();
    expect(h.band).toBeNull();
    expect(h.draft).toBe(true);
  });

  it('a null signal is excluded from the average, not counted as a zero', () => {
    const h = healthOf(sig({ finance: good, energy: good }));
    expect(h.score).toBe(SCORE.good);
    expect(h.band).toBe('green');
  });

  it('averages the signals that do have a score', () => {
    const h = healthOf(sig({ finance: { score: SCORE.good, why: 'a' }, energy: { score: SCORE.bad, why: 'b' } }));
    expect(h.score).toBe(1.5);
  });

  it('applies the weights', () => {
    const weighted = { ...HEALTH_CONFIG_DRAFT, weights: { ...HEALTH_CONFIG_DRAFT.weights, finance: 3 } };
    const signals = sig({ finance: { score: SCORE.good, why: 'a' }, energy: { score: SCORE.bad, why: 'b' } });
    expect(healthOf(signals, weighted as typeof HEALTH_CONFIG_DRAFT).score).toBe(2.25);
  });

  it('keeps the signals it was given, so the tooltip can explain each dot', () => {
    const h = healthOf(sig({ energy: { score: SCORE.warn, why: 'פער' } }));
    expect(h.signals.energy.why).toBe('פער');
    expect(h.signals.finance.why).toBe(NO_DATA);
  });
});

describe('bandOf', () => {
  it('honours the config edges exactly', () => {
    expect(bandOf(cfg.bands.greenMin)).toBe('green');
    expect(bandOf(cfg.bands.greenMin - 0.01)).toBe('amber');
    expect(bandOf(cfg.bands.amberMin)).toBe('amber');
    expect(bandOf(cfg.bands.amberMin - 0.01)).toBe('red');
  });

  it('no score is its own state', () => {
    expect(bandOf(null)).toBeNull();
    expect(bandOf(Number.NaN)).toBeNull();
  });
});

describe('canSeeHealth', () => {
  it('עידן and עמיחי see it', () => {
    expect(canSeeHealth('עידן', 'idan')).toBe(true);
    expect(canSeeHealth('עמיחי', 'team')).toBe(true);
  });

  it('a viewer sees it read-only', () => {
    expect(canSeeHealth('צפייה', 'viewer')).toBe(true);
  });

  it('a technician does not — on the role, and on the person', () => {
    expect(canSeeHealth('אביאם', 'team')).toBe(false);
    expect(canSeeHealth('אביאם', 'field')).toBe(false);
    expect(canSeeHealth('עידן', 'field')).toBe(false);
  });

  it('nothing signed in → nothing shown', () => {
    expect(canSeeHealth('', '')).toBe(false);
    expect(canSeeHealth(null, null)).toBe(false);
  });
});

// ───────────── QA round 4 Package Y (22.9): a fixed line, not a fifth scored signal ─────────────

describe('emsUnlinkedHealthNote', () => {
  it('a site with no ems_site_ids gets the note', () => {
    expect(emsUnlinkedHealthNote({ ems_site_ids: [] })).toBe(EMS_UNLINKED_NOTE);
    expect(emsUnlinkedHealthNote({ ems_site_ids: null })).toBe(EMS_UNLINKED_NOTE);
    expect(emsUnlinkedHealthNote({})).toBe(EMS_UNLINKED_NOTE);
  });

  it('a linked site, or an unknown row, has nothing to say', () => {
    expect(emsUnlinkedHealthNote({ ems_site_ids: ['S1'] })).toBe(null);
    expect(emsUnlinkedHealthNote(null)).toBe(null);
    expect(emsUnlinkedHealthNote(undefined)).toBe(null);
  });
});

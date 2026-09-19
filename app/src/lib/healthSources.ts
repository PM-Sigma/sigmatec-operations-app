// Where the four health signals come from — ONE interface, implementations chosen by config.
//
// The open question in spec §9 is "does billing/energy-balance data come from the EMS API or
// from a read-only Postgres session?". That question must never reach the strip, so it is
// answered behind `HealthSource`: the UI asks for a kibbutz's four inputs and gets them, or
// gets `null`, and the day a `pgReadOnlySource` is written nothing above this file changes.
//
// WHAT EMS ACTUALLY EXPOSES TODAY (read off js/src/13-ems.js, 14-calendar.js, 24-meter-burns.js
// and app/src/lib/emsChain.ts — the only callers of `sigma.emsApi`):
//   /sites                 · the site list, and the id every other call needs
//   /meters                · `?siteId=…&take=…`, and `?search=…`
//   /employee-tasks        · list `?siteId=&statuses=&take=`, one task, PATCH, POST, /comments
//   /users                 · admins, for the assignee picker
// There is NO billing endpoint, NO energy-balance report and NO alerts feed. So:
//   מאזן כספי     → null   (no billing endpoint)
//   מאזן אנרגיה   → null   (no energy-balance report; the numbers behind גבים's 15–20% are
//                           not reachable from the client)
//   פניות ללא מענה → PARTLY REAL: the age of the oldest open `/employee-tasks` row is real;
//                           "מונים לא משדרים" needs an alerts feed → null
//   בעיות חוזרות  → null   (the keyword bucket needs the mail/task history, §5's v1 proxy)
// A signal whose fields are all null scores `null`, and the strip says אין נתונים — which the
// task's DoD explicitly allows.
import {
  HEALTH_CONFIG_DRAFT, emptySignals, healthOf, scoreAlerts, scoreEnergy, scoreFinance,
  scoreRecurring,
  type AlertsInput, type EnergyInput, type FinanceInput, type Health, type HealthConfig,
  type RecurringInput, type Signals,
} from '@/lib/health';

export interface HealthSource {
  finance(kibbutz: string): Promise<FinanceInput | null>;
  energy(kibbutz: string): Promise<EnergyInput | null>;
  alerts(kibbutz: string): Promise<AlertsInput | null>;
  recurring(kibbutz: string): Promise<RecurringInput | null>;
}

/** Everything empty — tests, mock mode, and any config that has not chosen a source. */
export const nullSource: HealthSource = {
  finance: async () => null,
  energy: async () => null,
  alerts: async () => null,
  recurring: async () => null,
};

/** The slice of the legacy bridge this file needs, injected so the source is testable. */
export interface EmsDeps {
  emsApi(path: string, options?: RequestInit): Promise<any>;
  getEmsSites(): Promise<Array<{ id: string; name: string }>>;
}

/** EMS wraps a list in `{items|data|results}` or returns it bare (same unwrap as emsChain.ts). */
function unwrap(res: any): any[] {
  if (Array.isArray(res)) return res;
  for (const key of ['items', 'data', 'results', 'rows']) {
    if (Array.isArray(res?.[key])) return res[key];
  }
  return [];
}

function siteMatches(site: { name?: string }, kibbutz: string): boolean {
  const a = String(site?.name || '').trim();
  const b = String(kibbutz || '').trim();
  return !!a && !!b && (a === b || a.includes(b) || b.includes(a));
}

const DAY_MS = 86400000;

/** Whole days between an ISO instant and `now`, or null when the instant is unusable. */
export function ageInDays(iso: string | null | undefined, now: number): number | null {
  const t = Date.parse(String(iso || ''));
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now - t) / DAY_MS);
  return days >= 0 ? days : 0;
}

const OPEN_STATUSES = 'open,in_progress,pending';

/**
 * The age of the oldest open EMS request for this site. Pure over the rows so the scoring of a
 * real payload is a golden rather than a network test.
 */
export function oldestOpenTaskDays(rows: any[], now: number): number | null {
  let oldest: number | null = null;
  for (const r of rows || []) {
    const age = ageInDays(r?.updatedAt || r?.updated_at || r?.createdAt || r?.created_at, now);
    if (age === null) continue;
    if (oldest === null || age > oldest) oldest = age;
  }
  return oldest;
}

/**
 * Over `sigma.emsApi`. Every call is wrapped: an EMS that is not signed in, a filter the API
 * rejects, or a site that does not resolve all mean "nothing to show", never a thrown error on
 * a screen that is only an overview.
 */
export function emsApiSource(deps: EmsDeps, now: () => number = Date.now): HealthSource {
  const siteIdFor = async (kibbutz: string): Promise<string | null> => {
    try {
      const hit = ((await deps.getEmsSites()) || []).find(s => siteMatches(s, kibbutz));
      return hit ? String(hit.id) : null;
    } catch { return null; }
  };

  return {
    // No billing endpoint in EMS — §9 is still open on where this lives.
    finance: async () => null,
    // No energy-balance report reachable from the client.
    energy: async () => null,
    alerts: async (kibbutz: string) => {
      const siteId = await siteIdFor(kibbutz);
      if (!siteId) return null;
      try {
        const res = await deps.emsApi(
          '/employee-tasks?siteId=' + encodeURIComponent(siteId) + '&statuses=' + OPEN_STATUSES + '&take=100');
        return { silentMeters: null, oldestOpenTaskDays: oldestOpenTaskDays(unwrap(res), now()) };
      } catch { return null; }
    },
    // The keyword bucket needs the task + mail history; not available from here yet.
    recurring: async () => null,
  };
}

/** Which implementation the config asks for. Unknown value → `nullSource`, never a throw. */
export function sourceFor(cfg: HealthConfig, deps?: EmsDeps | null): HealthSource {
  if (cfg.source === 'ems' && deps) return emsApiSource(deps);
  return nullSource;
}

/** Ask a source for all four inputs and score them. One call per kibbutz, never partial. */
export async function loadHealth(
  source: HealthSource, kibbutz: string, cfg: HealthConfig = HEALTH_CONFIG_DRAFT,
): Promise<Health> {
  const safe = async <T>(p: Promise<T | null>): Promise<T | null> => {
    try { return await p; } catch { return null; }
  };
  const [finance, energy, alerts, recurring] = await Promise.all([
    safe(source.finance(kibbutz)), safe(source.energy(kibbutz)),
    safe(source.alerts(kibbutz)), safe(source.recurring(kibbutz)),
  ]);
  const signals: Signals = {
    ...emptySignals(),
    finance: scoreFinance(finance, cfg),
    energy: scoreEnergy(energy, cfg),
    alerts: scoreAlerts(alerts, cfg),
    recurring: scoreRecurring(recurring, cfg),
  };
  return healthOf(signals, cfg);
}

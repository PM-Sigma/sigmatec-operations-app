// בריאות הקיבוץ — the small strip inside the kibbutz modal (Task 28, company-process spec §5).
//
// Four dots, one per signal, each carrying its own one-line explanation, plus a טיוטה marker
// that never leaves the screen: the thresholds behind these dots are a first draft (ruling
// §8b, עידן 22.9), and nobody should act on them yet. No dot on the card face in v1.
//
// Every decision is in lib/health.ts and lib/healthSources.ts; this file only renders, and
// keeps the last answer per kibbutz so `sigma.presenterStrip` can hand ▶ מצב ישיבה the same
// four lines without a second fetch.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { sigma, useCurrentUser } from '@/bridge';
import {
  HEALTH_CONFIG_DRAFT, NO_DATA, SIGNAL_LABELS, canSeeHealth, type Band, type Health,
} from '@/lib/health';
import { loadHealth, sourceFor, type EmsDeps } from '@/lib/healthSources';

export const HEALTH_QUERY_KEY = 'kibbutzHealth';

/** The bridge, as the source's dependency — absent (tests, a bare page) → the null source. */
function bridgeDeps(): EmsDeps | null {
  if (!sigma || typeof sigma.emsApi !== 'function') return null;
  return {
    emsApi: (path, options) => sigma.emsApi(path, options),
    getEmsSites: () => Promise.resolve(sigma.getEmsSites?.() as any).then(v => (v as any) || []),
  };
}

/** The last answer per kibbutz — read by `presenterStripFor`, written by the query below. */
const lastKnown = new Map<string, Health>();

export function useKibbutzHealth(kibbutz: string) {
  return useQuery({
    queryKey: [HEALTH_QUERY_KEY, kibbutz],
    enabled: !!kibbutz,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const health = await loadHealth(sourceFor(HEALTH_CONFIG_DRAFT, bridgeDeps()), kibbutz);
      lastKnown.set(kibbutz, health);
      return health;
    },
  });
}

/**
 * ▶ מצב ישיבה reads this through `sigma.presenterStrip` instead of importing it, so that
 * screen keeps working whether or not this file is on the page. Nothing known yet → an empty
 * list, which the presenter renders as nothing at all.
 */
export function presenterStripFor(kibbutz: string): Array<{ label: string; value: string }> {
  const health = lastKnown.get(kibbutz);
  if (!health) return [];
  return SIGNAL_LABELS.map(({ key, label }) => ({ label, value: health.signals[key].why || NO_DATA }));
}

/**
 * Every band known so far, `kibbutz → 'green'|'amber'|'red'`. ▶ ישיבת פיתוח (Task 30) reads it
 * through `sigma.healthBands` — never by importing this file — so a card that fixes a red
 * signal can outrank one that does not. Nothing known yet → an empty map, which that screen
 * treats as "no bonus" rather than as an error.
 */
export function healthBandsKnown(): Record<string, Band> {
  const out: Record<string, Band> = {};
  lastKnown.forEach((health, kibbutz) => { if (health?.band) out[kibbutz] = health.band; });
  return out;
}

const DOT_COLOR: Record<Band, string> = {
  green: 'var(--brand-2)',
  amber: 'var(--sigma-warn)',
  red: 'hsl(var(--destructive))',
};

function dotStyle(band: Band | null): React.CSSProperties {
  return band
    ? { background: DOT_COLOR[band] }
    : { background: 'transparent', boxShadow: 'inset 0 0 0 2px hsl(var(--muted-foreground) / .45)' };
}

const BAND_WORD: Record<Band, string> = { green: 'תקין', amber: 'דורש מבט', red: 'בעייתי' };

function bandWord(band: Band | null): string {
  return band ? BAND_WORD[band] : NO_DATA;
}

/** A signal's own band, so one dot can be amber while the kibbutz as a whole is green. */
function bandOfScore(score: number | null): Band | null {
  if (score === null) return null;
  if (score >= HEALTH_CONFIG_DRAFT.bands.greenMin) return 'green';
  if (score >= HEALTH_CONFIG_DRAFT.bands.amberMin) return 'amber';
  return 'red';
}

export function HealthStrip({ kibbutz }: { kibbutz: string }) {
  const { name, role } = useCurrentUser();
  const allowed = canSeeHealth(name, role);
  const { data } = useKibbutzHealth(allowed ? kibbutz : '');

  if (!kibbutz || !allowed) return null;
  const health = data || null;

  return (
    <div
      data-testid="health-strip"
      data-band={health?.band || 'none'}
      className="mb-3.5 rounded-xl border border-border bg-muted/40 p-3"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-extrabold text-foreground">מצב הקיבוץ</span>
        {/* The marker is permanent for v1: the numbers are a first draft, not a verdict. */}
        <span
          data-testid="health-draft-badge"
          className="rounded-full bg-[color:var(--sigma-warn)]/15 px-2 py-0.5 text-[11px] font-bold text-[color:var(--sigma-warn-ink)]"
        >
          טיוטה
        </span>
        <span className="text-[12px] text-muted-foreground">עדיין לא לפעול לפי המספרים</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {SIGNAL_LABELS.map(({ key, label }) => {
          const signal = health?.signals[key];
          const band = bandOfScore(signal?.score ?? null);
          const why = signal?.why || NO_DATA;
          return (
            <span
              key={key}
              data-testid={'health-dot-' + key}
              data-band={band || 'none'}
              title={label + ' — ' + why}
              aria-label={label + ' — ' + why}
              className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"
            >
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full" style={dotStyle(band)} />
              {label}
            </span>
          );
        })}
      </div>

      <div className="mt-2 text-[12.5px] text-muted-foreground">
        {health && health.band
          ? bandWord(health.band)
          : NO_DATA}
      </div>
    </div>
  );
}

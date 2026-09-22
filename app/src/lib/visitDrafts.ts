// Visit drafts, React side (spec §5.1c). The legacy module (js/src/09-visits.js) is the ONLY
// writer — it owns the form, the debounce and both stores — so this file only ever asks
// "is there one, and what does the person see because of it?".
import * as React from 'react';
import { sigma, useSigmaEvent } from '@/bridge';

export interface VisitDraft {
  id: string;
  person: string;
  kibbutz: string;
  /** yyyy-mm-dd */
  date: string;
  updated_at: string;
  payload?: Record<string, unknown>;
}

/** Today in the local calendar, as the draft rows store it. */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type DraftState = 'none' | 'draft' | 'filed';

/**
 * Pure (spec §5.1c): where does this kibbutz stand for this person TODAY?
 *   'filed' — a visit is already saved: there is nothing to chase.
 *   'draft' — something is typed and not filed: the gaps list counts it on its own line,
 *             the card shows "סיכום ביקור בהתהוות", and the 2 h nudge changes its words.
 *   'none'  — nothing happened yet.
 * `filed` wins over `draft`: a leftover draft beside a saved visit is noise, not work.
 */
export function draftState(
  kibbutz: string,
  person: string,
  today: string,
  drafts: VisitDraft[] | null | undefined,
  filedVisits: Array<{ kibbutz?: string; visitor?: string; date?: string }> | null | undefined = [],
): DraftState {
  const sameDay = (d?: string) => !!d && String(d).slice(0, 10) === today;
  const filed = (filedVisits || []).some(v => v && v.kibbutz === kibbutz && v.visitor === person && sameDay(v.date));
  if (filed) return 'filed';
  const has = (drafts || []).some(d => d && d.kibbutz === kibbutz && d.person === person && sameDay(d.date));
  return has ? 'draft' : 'none';
}

/** "המשך טיוטה מ-14:02" — the time the person reads, in his own clock. */
export function draftTimeLabel(updatedAt: string | null | undefined): string {
  if (!updatedAt) return '';
  const t = new Date(updatedAt);
  if (isNaN(t.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getHours())}:${p(t.getMinutes())}`;
}

/**
 * The names, among `kibbutzim`, that have an open visit draft for the current person TODAY
 * (spec §5.1c / QA round 2 Package A §4 — the home list sorts these to the top). Same source
 * as `useVisitDraft`, just asked once per name instead of one hook per card.
 */
export function useDraftKibbutzNames(kibbutzim: string[]): Set<string> {
  const key = kibbutzim.join('');
  const read = React.useCallback((): Set<string> => {
    const out = new Set<string>();
    try {
      const me = sigma?.getCurrentUser?.() || '';
      const today = todayISO();
      kibbutzim.forEach(name => {
        try { if (sigma?.visitDraftFor?.(name, me, today)) out.add(name); } catch { /* no bridge */ }
      });
    } catch { /* no bridge */ }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const [names, setNames] = React.useState<Set<string>>(read);
  React.useEffect(() => { setNames(read()); }, [read]);
  useSigmaEvent('visit-draft-changed', () => setNames(read()));
  useSigmaEvent('visit-saved', () => setNames(read()));
  return names;
}

/** Ask the legacy module for this kibbutz's draft; re-asked whenever one is written. */
export function useVisitDraft(kibbutz: string): VisitDraft | null {
  const read = React.useCallback((): VisitDraft | null => {
    try {
      const me = sigma?.getCurrentUser?.() || '';
      return (sigma?.visitDraftFor?.(kibbutz, me, todayISO()) as VisitDraft) || null;
    } catch { return null; }
  }, [kibbutz]);
  const [draft, setDraft] = React.useState<VisitDraft | null>(read);
  React.useEffect(() => { setDraft(read()); }, [read]);
  useSigmaEvent('visit-draft-changed', () => setDraft(read()));
  useSigmaEvent('visit-saved', () => setDraft(read()));
  return draft;
}

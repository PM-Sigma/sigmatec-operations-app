// 📥 משיכת קריאות — the ONE network path for the page and the watcher.
//   reads : supabase-js, SELECT only, named columns (never '*': reading_runs.raw is not granted
//           to clients — a `select *` would fail outright).
//   writes: none from here. Every write is a mode of the `readings-fetch` Edge Function,
//           called with the bridge pass as Bearer (the same way devBoard.ts calls `github`).
import { SB_ANON, SB_URL, getSupabase } from './supabase';
import { sigma } from '@/bridge';
import type { ReadingRun } from './readingsLogic';

export interface ReadingSite { id: string; kibbutz: string; ems_site_id: string | null; active: boolean | null }

/** Explicit column list — must stay inside the column grant in db/readings_pull.sql. */
export const RUN_COLS =
  'id,site_id,reading_date,trigger,started_by,started_at,finished_at,status,progress,n_ok,n_blocked,n_warn,' +
  'summary,exceptions,error,readings_file,exceptions_file,ems_checked,ems_checked_by,ems_checked_at,' +
  'uploaded,uploaded_by,uploaded_at,uploaded_source,seen_by';

export const emsToken = (): string => { try { return sigma?.emsToken?.() || ''; } catch { return ''; } };
export const currentUser = (): string => { try { return sigma?.getCurrentUser?.() || ''; } catch { return ''; } };

/** A Hebrew-message error from the function ({error, message}). */
export class ReadingsError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

async function bridgePass(): Promise<string> {
  try { await (sigma as any)?.ensurePass?.(); } catch { /* fall through to whatever pass exists */ }
  try { return sigma?.sbPass?.()?.token || ''; } catch { return ''; }
}

/** POST readings-fetch. The EMS token travels in the body only for the modes that need it. */
export async function callReadings<T = any>(payload: Record<string, unknown>): Promise<T> {
  const pass = await bridgePass();
  const r = await fetch(SB_URL + '/functions/v1/readings-fetch', {
    method: 'POST',
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + (pass || SB_ANON), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new ReadingsError(String(d?.error || r.status), String(d?.message || 'הפעולה נכשלה. נסה שוב'));
  return d as T;
}

export const startRun = (kibbutz: string, date: string) =>
  callReadings<{ run_id: string }>({ mode: 'run', kibbutz, date, trigger: 'manual' });
export const emsCheck = (run_id: string) => callReadings({ mode: 'emsCheck', run_id, ems_token: emsToken() });
export const signFile = (run_id: string, kind: 'readings' | 'exceptions') =>
  callReadings<{ url: string }>({ mode: 'sign', run_id, kind });
export const retrySource = (run_id: string, source_id: string) => callReadings({ mode: 'retrySource', run_id, source_id });
export const markUploaded = (run_id: string, uploaded: boolean) => callReadings({ mode: 'markUploaded', run_id, uploaded });
export const emsSync = (kibbutz: string) => callReadings({ mode: 'emsSync', kibbutz, ems_token: emsToken() });
export const markSeen = (run_id: string) => callReadings({ mode: 'seen', run_id });

export async function fetchSites(): Promise<ReadingSite[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('reading_sites').select('id,kibbutz,ems_site_id,active').eq('active', true).order('kibbutz');
  if (error) throw error;
  return (data || []) as ReadingSite[];
}

/** A source of a site — `retrySource` needs its id. */
export async function fetchSources(siteId: string): Promise<Array<{ id: string; name: string }>> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('reading_sources').select('id,name').eq('site_id', siteId).order('sort');
  if (error) throw error;
  return (data || []) as Array<{ id: string; name: string }>;
}

/** Runs of a site whose day is at or after `sinceDate`, newest first. */
export async function fetchRuns(siteId: string, sinceDate: string): Promise<ReadingRun[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('reading_runs').select(RUN_COLS).eq('site_id', siteId)
    .gte('reading_date', sinceDate).order('reading_date', { ascending: false }).order('started_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data || []) as unknown as ReadingRun[];
}

export async function fetchRun(id: string): Promise<ReadingRun | null> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('reading_runs').select(RUN_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as ReadingRun) || null;
}

/** The slim row the watcher polls every 5 s (no exceptions jsonb). */
export async function fetchRunStatus(id: string): Promise<ReadingRun | null> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('reading_runs').select('id,site_id,reading_date,trigger,status,progress,error').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as unknown as ReadingRun) || null;
}

/** The most recent cron runs across sites (the badge picks the newest per site). */
export async function fetchRecentCronRuns(): Promise<ReadingRun[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('reading_runs').select('id,site_id,reading_date,trigger,started_at,status,seen_by')
    .eq('trigger', 'cron').order('reading_date', { ascending: false }).order('started_at', { ascending: false }).limit(20);
  if (error) throw error;
  return (data || []) as unknown as ReadingRun[];
}

/** Open a signed URL as a download. A plain <a href> click — no blob, no JS fetch — so it
 *  works in an installed PWA on iOS and Android (the Hebrew file name comes from the URL). */
export function openDownload(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

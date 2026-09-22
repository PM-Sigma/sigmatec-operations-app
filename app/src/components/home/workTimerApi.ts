// Shared by the button and its (lazily loaded) stop sheet — Task 29.
// The bundle never holds a Clockify credential: it sends the EMS pass and an action to the
// `clockify` edge function, which is the only holder.
import { sigma } from '@/bridge';
import { SB_ANON, SB_URL, getSupabase, sbWrite } from '@/lib/supabase';
import type { ClockifyProject } from '@/lib/clockify';

function emsToken(): string {
  try { return sigma?.emsToken?.() || ''; } catch { return ''; }
}

export async function clockifyCall(payload: Record<string, unknown>): Promise<any> {
  const r = await fetch(SB_URL + '/functions/v1/clockify', {
    method: 'POST',
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: emsToken(), ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('clockify ' + r.status));
  return d;
}

/** Projects are only needed at confirm time, and only once per page. */
let projectsMemo: Promise<ClockifyProject[]> | null = null;
export function fetchProjects(): Promise<ClockifyProject[]> {
  if (!projectsMemo) {
    projectsMemo = clockifyCall({ action: 'projects' })
      .then(d => (d.projects || []) as ClockifyProject[])
      .catch(() => { projectsMemo = null; return [] as ClockifyProject[]; });
  }
  return projectsMemo;
}

export interface Contact { id?: string; name: string; role?: string | null }

export async function fetchContacts(kibbutz: string): Promise<Contact[]> {
  try {
    const sb = await getSupabase();
    const { data } = await sb.from('site_contacts').select('*').eq('kibbutz', kibbutz);
    return (data || [])
      .map((c: any) => ({ id: c.id, name: String(c.name || c.full_name || '').trim(), role: c.role }))
      .filter((c: Contact) => !!c.name);
  } catch { return []; }
}

// ───────────────────────────── the open `work_sessions` row ─────────────────────────────
//
// ▶ opens the row (`ended_at = null`) instead of waiting for ■ (עידן 22.9). That row is the
// ONLY thing that lets the two-hour "עדכן את השעון" reminder reach a phone that stayed in a
// pocket: push-send's `timerStale` cron reads it from Supabase, with no screen and no PC in
// the path (db/cron_timer_5min.sql).
//
// Every one of these is BEST EFFORT and returns instead of throwing. A refused write must
// never stop the clock — the timer keeps running in storage exactly as it did before, and the
// stop sheet falls back to an INSERT when there is no row id to update.

/** ▶ — open the row. Returns its id, or null when the write was refused. */
export async function openSessionRow(
  person: string, kibbutz: string, startedAt: string,
): Promise<string | null> {
  try {
    const row = await sbWrite<{ id: string }>(async sb => await sb.from('work_sessions').insert({
      person, kibbutz, kind: 'session', started_at: startedAt, ended_at: null, paused_ms: 0,
    }).select().single());
    return row?.id ? String(row.id) : null;
  } catch { return null; }
}

/** ⏸ / ▶ / retime / ■ — change the open row in place. */
export async function patchSessionRow(id: string, patch: Record<string, unknown>): Promise<boolean> {
  if (!id) return false;
  try {
    await sbWrite(async sb => await sb.from('work_sessions').update(patch).eq('id', id));
    return true;
  } catch { return false; }
}

/** 🗑 — the session was thrown away, so the row goes with it (and stops being nudged). */
export async function dropSessionRow(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    await sbWrite(async sb => await sb.from('work_sessions').delete().eq('id', id));
    return true;
  } catch { return false; }
}

// Shared by the button and its (lazily loaded) stop sheet — Task 29.
// The bundle never holds a Clockify credential: it sends the EMS pass and an action to the
// `clockify` edge function, which is the only holder.
import { sigma } from '@/bridge';
import { SB_ANON, SB_URL, getSupabase } from '@/lib/supabase';
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

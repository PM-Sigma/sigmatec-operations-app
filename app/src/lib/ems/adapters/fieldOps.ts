// The transport for פעולות שטח: POST to the `field-ops` Edge Function, which proxies EMS
// meter-operations (modbus_read / modbus_ping / history) plus the Modbus meter lists. It lives
// in adapters/ because it carries the EMS token — features only ever see `emsGateway()`.
//
// Why not `sigma.emsApi`: the Apps-Script proxy aborts at 20 s and a Modbus read takes up to
// 2 minutes (spec §8.2).
import { sigma } from '@/bridge';
import { SB_ANON, SB_URL } from '@/lib/supabase';
import { sessionLost } from '@/lib/session';

/** A failed field-ops call, with the function's error code (ems-session, ems-forbidden, timeout, …). */
export class FieldOpsError extends Error {
  constructor(public code: string, public status: number, public detail = '') {
    super(detail || code);
    this.name = 'FieldOpsError';
  }
}

export async function fieldOpsCall(payload: Record<string, unknown>, timeoutMs: number): Promise<any> {
  const token = (() => { try { return sigma?.emsToken?.() || ''; } catch { return ''; } })();
  if (!token) throw sessionLost('field-ops-no-token');
  const pass = (() => { try { return sigma?.sbPass?.()?.token || ''; } catch { return ''; } })();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let r: Response;
  try {
    r = await fetch(SB_URL + '/functions/v1/field-ops', {
      method: 'POST',
      headers: { apikey: SB_ANON, Authorization: 'Bearer ' + (pass || SB_ANON), 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...payload }),
      signal: ac.signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw new FieldOpsError('timeout', 0);
    throw new FieldOpsError('network', 0, String((e as Error)?.message || e));
  } finally {
    clearTimeout(timer);
  }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const code = typeof d?.error === 'string' ? d.error : 'http-' + r.status;
    if (code === 'ems-session') throw sessionLost('field-ops-401');
    // `message` is the function's own fixed Hebrew sentence — EMS text never reaches the browser.
    throw new FieldOpsError(code, r.status, typeof d?.message === 'string' ? d.message : '');
  }
  return d;
}

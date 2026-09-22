// The day-log ANALYSIS CHAIN, shared (QA round 2, Package C item 8).
//
// 📝 יומן היום has run this chain since §7i: the three grounding lists off the bridge, one POST
// to the `parse-daylog` Edge Function, and a fire-and-forget `mode:'correction'` row so the next
// parse is better. C8 puts the same 🎙 at the top of the visit-summary sheet, and the ruling is
// explicit: REUSE this chain, add no provider. So the three functions moved out of the island
// into here, unchanged, and both screens import them.
//
// That also means one place carries the cost: every call is still one `parse-daylog` invocation
// billed exactly as יומן היום's, with the same 30 s deadline and the same EMS-token precondition.
import { sigma } from '@/bridge';
import { SB_ANON, SB_URL } from '@/lib/supabase';
import type { DayLogCatalog, DayLogResult, GroundingTask } from '@/lib/daylog';

/** yyyy-mm-dd in the phone's own calendar — what the client stores. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The three grounding lists, read live off the bridge. Empty is fine; wrong is not. */
export function readCatalog(): DayLogCatalog {
  const kibbutzim = (() => { try { return sigma.kibbutzNames?.() || []; } catch { return []; } })();
  const products = (() => { try { return sigma.productNames?.() || []; } catch { return []; } })();
  const tasks: GroundingTask[] = (() => {
    try {
      const closed = ['done', 'cancelled', 'closed'];
      return (sigma.emsCacheData?.()?.tasks || [])
        .filter((t: any) => t && t.id && t.title && !closed.includes(String(t.status || '')))
        .slice(0, 60)
        .map((t: any) => ({ id: String(t.id), title: String(t.title), kibbutz: t.site?.name ? String(t.site.name) : undefined }));
    } catch { return []; }
  })();
  return { kibbutzim, products, tasks };
}

/** Ask `parse-daylog`. Throws with a sentence the person can act on — never a status code. */
export async function parseDayLog(text: string, catalog: DayLogCatalog, external?: AbortController): Promise<any> {
  const token = (() => { try { return sigma.emsToken?.() || ''; } catch { return ''; } })();
  if (!token) throw new Error('יש להתחבר כדי לנתח את היום — אפשר לכתוב סיכום ביקור ידנית');
  // F19: the caller may hand in its own controller so a בטל button can end the wait. The
  // 30 s deadline still fires on top of it.
  const ac = external || new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const r = await fetch(`${SB_URL}/functions/v1/parse-daylog`, {
      method: 'POST', signal: ac.signal,
      headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token, text, today: today(),
        kibbutzim: catalog.kibbutzim, products: catalog.products, tasks: catalog.tasks,
      }),
    });
    const res = await r.json().catch(() => ({}));
    if (!r.ok || res?.error) throw new Error(r.status === 401 ? 'יש להתחבר שוב כדי לנתח את היום' : 'הניתוח לא הצליח — נסה שוב או כתוב סיכום ידנית');
    return res;
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(external && external.signal.aborted && !(e as any).__deadline
        ? 'CANCELLED'
        : 'הניתוח לוקח יותר מדי זמן — נסה שוב');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Record the person's edits so the next parse is better. Fire-and-forget, by design. */
export function recordCorrection(person: string, rawLen: number, before: DayLogResult, after: DayLogResult): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return;
  const token = (() => { try { return sigma.emsToken?.() || ''; } catch { return ''; } })();
  const pass = (() => { try { return sigma.sbPass?.()?.token || ''; } catch { return ''; } })();
  if (!token) return;
  void fetch(`${SB_URL}/functions/v1/parse-daylog`, {
    method: 'POST',
    headers: { apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'correction', token, sbToken: pass, person, raw_len: rawLen, json_before: before, json_after: after }),
  }).catch(() => { /* the learning loop is a nicety; a lost row costs nothing */ });
}

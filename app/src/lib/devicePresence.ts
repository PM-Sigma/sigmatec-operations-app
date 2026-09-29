// Device presence (Q7-C 7.1): "does this staff device run the installed app, and may it show
// notifications" — one upserted row per (person, device) in `staff_devices` (db/staff_devices.sql,
// written but NOT applied until עידן says so). Feeds the "מצב הצוות" list in the gear sheet.
//
// PII-light on purpose: a random per-install id, a coarse label, two facts, a timestamp. Never the
// push endpoint, never the raw user-agent. Best-effort like usage tracking: a missing table, no
// EMS pass or no network drops the write silently — analytics-grade, never a user-visible error.

export const DEVICE_KEY = 'sigma_device_v1';
const SIG_KEY = 'sigma_device_sig_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Presence {
  device_id: string;
  label: string;
  is_standalone: boolean;
  notif_permission: string;
}

/** Pure: a coarse "system · browser" label from a user-agent string. */
export function deviceLabel(ua: string): string {
  const s = String(ua || '');
  const os = /iPhone|iPad|iPod/.test(s) ? 'iPhone' : /Android/.test(s) ? 'Android'
    : /Windows/.test(s) ? 'Windows' : /Mac OS X|Macintosh/.test(s) ? 'Mac' : /Linux/.test(s) ? 'Linux' : 'מכשיר';
  const br = /Edg\//.test(s) ? 'Edge' : /SamsungBrowser/.test(s) ? 'Samsung' : /Firefox|FxiOS/.test(s) ? 'Firefox'
    : /Chrome|CriOS/.test(s) ? 'Chrome' : /Safari/.test(s) ? 'Safari' : '';
  return br ? os + ' · ' + br : os;
}

/** Pure: re-report when the state changed or the last report is a day old. */
export function shouldReport(sig: string, last: { sig: string; at: number } | null, now: number): boolean {
  return !last || last.sig !== sig || now - last.at >= DAY_MS;
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = (crypto as any)?.randomUUID?.() || 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id as string);
    }
    return id as string;
  } catch { return ''; }
}

export function readPresence(): Presence | null {
  const id = deviceId();
  if (!id) return null;
  let standalone = false;
  try {
    standalone = !!window.matchMedia?.('(display-mode: standalone)').matches || !!(navigator as any).standalone;
  } catch { /* old webview */ }
  let perm = 'unsupported';
  try { if ('Notification' in window) perm = Notification.permission; } catch { /* locked down */ }
  return { device_id: id, label: deviceLabel(navigator.userAgent), is_standalone: standalone, notif_permission: perm };
}

/** One report, if it is due. Never throws. */
export async function reportDevicePresence(person: string): Promise<boolean> {
  try {
    if (!person || (window as any).__SIGMA_MOCK) return false;
    const p = readPresence();
    if (!p) return false;
    const sig = person + '|' + p.is_standalone + '|' + p.notif_permission;
    let last: { sig: string; at: number } | null = null;
    try { last = JSON.parse(localStorage.getItem(SIG_KEY) || 'null'); } catch { /* corrupt */ }
    if (!shouldReport(sig, last, Date.now())) return false;
    const { sbWrite } = await import('@/lib/supabase');
    await sbWrite(sb => sb.from('staff_devices').upsert(
      { person, ...p, last_seen: new Date().toISOString() },
      { onConflict: 'person,device_id' },
    ));
    try { localStorage.setItem(SIG_KEY, JSON.stringify({ sig, at: Date.now() })); } catch { /* private mode */ }
    return true;
  } catch { return false; }
}

/** Boot hook (called from the lazy Settings island): report shortly after start, and again when
 *  the app comes back to the foreground. */
export function startDevicePresence(): void {
  const run = () => {
    let who = '';
    try { who = String((window as any).sigma?.getCurrentUser?.() || ''); } catch { /* no bridge yet */ }
    void reportDevicePresence(who);
  };
  setTimeout(run, 5000);
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
  } catch { /* no DOM */ }
}

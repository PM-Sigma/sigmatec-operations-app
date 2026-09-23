// 📜 יומן התראות — the push-send log, for עידן only (G-L3). Every push-send mode is named in
// Hebrew here so a phone screen never shows a raw event key; an unrecognised mode (one added to
// push-send after this file was last touched) falls back to its own raw name rather than an
// empty cell (review focus #4).
import { dm, israelParts } from '@/lib/field';

export interface PushLogRow {
  sent_at: string;
  event: string;
  status: string;
  where_txt: string | null;
  qty: number | null;
  recipient: string;
  error: string | null;
  actor: string | null;
  title?: string | null;
}

/** Every mode push-send emits, in words. An unknown key is simply absent — `pushLogLine` falls
 *  back to the raw event name rather than throwing or showing blank. */
export const PUSH_EVENT_LABEL: Record<string, string> = {
  pending: 'הזמנה ממתינה',
  approved: 'הזמנה אושרה',
  attendanceCron: 'תזכורת נוכחות',
  attendanceReminder: 'בקשת נוכחות',
  gapReminder: 'פערים',
  timerStale: 'שעון פתוח',
  visitCron: 'סיכום ביקור',
  usageDigest: 'סיכום שימוש',
  inventoryAlert: 'מלאי נמוך',
  inventoryDigest: 'תנועות מלאי',
  feedbackNew: 'רעיון או באג',
};

export const PUSH_STATUS: Record<string, { label: string; role: 'ok' | 'danger' | 'neutral' }> = {
  sent: { label: 'נשלחה', role: 'ok' },
  failed: { label: 'נכשלה', role: 'danger' },
  expired: { label: 'מנוי לא פעיל', role: 'neutral' },
};

/** יומן התראות is עידן's alone — the log names names, not for the general team. */
export function pushLogCanSee(user: string, isIdan: boolean): boolean {
  return !!String(user ?? '').trim() && isIdan;
}

export function pushLogTiles(rows: PushLogRow[]): { total: number; sent: number; failed: number; expired: number } {
  const t = { total: 0, sent: 0, failed: 0, expired: 0 };
  for (const r of rows || []) {
    t.total++;
    if (r.status === 'sent') t.sent++;
    else if (r.status === 'failed') t.failed++;
    else if (r.status === 'expired') t.expired++;
  }
  return t;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function pushLogLine(r: PushLogRow): {
  when: string; what: string; where: string; who: string;
  status: { label: string; role: string }; error: string; actor: string;
} {
  const p = israelParts(r.sent_at);
  const what = PUSH_EVENT_LABEL[r.event] || r.event;
  const where = [r.where_txt || '', r.qty != null && r.qty > 1 ? String(r.qty) : ''].filter(Boolean).join(' · ');
  const status = PUSH_STATUS[r.status] || { label: r.status, role: 'neutral' as const };
  return {
    when: `${dm(p.date)} ${pad2(p.hh)}:${pad2(p.mm)}`,
    what, where, who: r.recipient || '',
    status, error: r.error || '', actor: r.actor || '',
  };
}

export const PUSH_LOG_QUERY_KEY = ['pushLog'] as const;

export async function fetchPushLog(limit = 200): Promise<PushLogRow[]> {
  const { getSupabase } = await import('@/lib/supabase');
  const sb = await getSupabase();
  const { data, error } = await sb
    .from('push_log')
    .select('sent_at,event,status,where_txt,qty,recipient,error,actor,title')
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as PushLogRow[];
}

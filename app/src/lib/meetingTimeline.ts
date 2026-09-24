// The per-kibbutz meeting timeline (package M, M-R1/M-R2): everything since the previous
// meeting, one list, newest first — an EMS task at its latest change, an internal task at its
// open date, a meeting note at its meeting date, a visit at its visit date. Pure: fed by
// whatever the data hook (useMeetingTimeline, M-L7) already fetched, so every placement rule is
// covered by a golden instead of by a screenshot.
import type { EmsComment, EmsTask } from '@/lib/ems/types';
import type { InternalTaskRow } from '@/lib/internalTasks';
import type { NoteRow } from '@/lib/meetingNotes';
import { EMS_CLOSED } from '@/lib/emsTasks';
import { israelAt } from '@/lib/field';

export type TimelineKind = 'ems' | 'internal' | 'note' | 'visit';
export type EmsReason = 'created' | 'comment' | 'updated';

export interface TimelineItem {
  key: string;              // 'ems:<id>' | 'internal:<id>' | 'note:<id>' | 'visit:<kibbutz>|<date>|<visitor>'
  kind: TimelineKind;
  at: string;               // ISO instant (dates become Israel noon, so a d.m label never slides)
  title: string;
  meta: string;             // e.g. 'תגובה · אביאם' | 'נפתחה' | 'עמיחי' | 'ביקור · ניתאי'
  reason?: EmsReason;       // ems only
  taskId?: string;          // ems only — the id the close buttons act on
  status?: string;          // ems only
}

export interface VisitRow {
  id?: string;
  kibbutz: string;
  date: string;
  visitor?: string;
  visitors?: string[];
  summary?: string;
}

export interface TimelineInput {
  kibbutz: string;
  emsTasks: EmsTask[];
  comments: Record<string, EmsComment[]>;   // by task id; missing = none fetched yet
  internal: InternalTaskRow[];
  notes: NoteRow[];
  visits: VisitRow[];
}

/** `/^נסגר בישיבת צוות /` — the one-click close comment (M-L3's `closeComment`) never counts
 *  as "the latest change" of a still-open task; review focus #3. */
export function isClosingComment(c: EmsComment): boolean {
  return /^נסגר בישיבת צוות /.test(String(c?.message || ''));
}

/**
 * The instant + reason an EMS task last moved: the later of its creation and its newest
 * non-closing comment, UNLESS `updatedAt` sits more than 2 minutes past that — a due date set
 * from the calendar (or any other EMS edit) is then its own event, labelled "עודכנה". Within
 * the 2-minute window `updatedAt` is treated as the same edit as the comment/creation, since
 * EMS stamps `updatedAt` on a comment too.
 */
export function emsLatestChange(t: EmsTask, comments: EmsComment[]): { at: string; reason: EmsReason; by?: string } {
  let best: { at: string; reason: EmsReason; by?: string } = { at: t.createdAt, reason: 'created' };
  for (const c of comments || []) {
    if (isClosingComment(c)) continue;
    if (new Date(c.createdAt).getTime() > new Date(best.at).getTime()) {
      best = { at: c.createdAt, reason: 'comment', by: c.author };
    }
  }
  const updated = new Date(t.updatedAt).getTime();
  if (Number.isFinite(updated) && updated > new Date(best.at).getTime() + 2 * 60_000) {
    return { at: t.updatedAt, reason: 'updated' };
  }
  return best;
}

const REASON_LABEL: Record<EmsReason, string> = { created: 'נפתחה', comment: 'תגובה', updated: 'עודכנה' };

const emsMeta = (r: { reason: EmsReason; by?: string }): string =>
  r.reason === 'comment' && r.by ? `תגובה · ${r.by}` : REASON_LABEL[r.reason];

/** Israel noon of a date-only value (yyyy-mm-dd), so a d.m label never slides a day either way. */
const noonOf = (dateOnly: string): string => new Date(israelAt(dateOnly, 12)).toISOString();

const byAtDesc = (a: TimelineItem, b: TimelineItem): number =>
  a.at < b.at ? 1 : a.at > b.at ? -1 : (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/**
 * `windowStart`: the Israel-midnight instant of the previous-meeting date (or 30 days back).
 * EMS_CLOSED tasks never appear at all. An open EMS task older than the window still needs a
 * close button in the meeting, so it goes to `olderOpen` instead of being dropped (open
 * question 2) — every other kind older than the window is simply left off.
 */
export function timelineFor(i: TimelineInput, windowStart: string): { items: TimelineItem[]; olderOpen: TimelineItem[] } {
  const items: TimelineItem[] = [];
  const olderOpen: TimelineItem[] = [];
  const windowMs = new Date(windowStart).getTime();
  const inWindow = (at: string) => new Date(at).getTime() >= windowMs;

  for (const t of i.emsTasks || []) {
    if (EMS_CLOSED.includes(t.status)) continue;
    const change = emsLatestChange(t, (i.comments && i.comments[t.id]) || []);
    // No usable date at all (createdAt/updatedAt both missing/empty) — same convention the data
    // hook uses for the offline cache fallback: undated, no reason, straight to olderOpen rather
    // than guessed at or silently dropped (a task with no dates is still an open task).
    const hasDate = !!change.at && Number.isFinite(new Date(change.at).getTime());
    if (!hasDate) {
      olderOpen.push({ key: `ems:${t.id}`, kind: 'ems', at: '', title: t.title, meta: '', taskId: t.id, status: t.status });
      continue;
    }
    const item: TimelineItem = {
      key: `ems:${t.id}`, kind: 'ems', at: change.at, title: t.title, meta: emsMeta(change),
      reason: change.reason, taskId: t.id, status: t.status,
    };
    (inWindow(change.at) ? items : olderOpen).push(item);
  }

  // Exact match only — a company-wide row (`kibbutz` null/undefined) belongs to no ONE
  // kibbutz's timeline and must not appear on every one of them (it used to: a falsy
  // `it.kibbutz` skipped the `!==` check below entirely, so company-wide rows leaked onto
  // every kibbutz's screen).
  for (const it of i.internal || []) {
    if (it.kibbutz !== i.kibbutz) continue;
    const at = it.created_at || '';
    if (!at || !inWindow(at)) continue;
    items.push({ key: `internal:${it.id}`, kind: 'internal', at, title: it.title, meta: it.owner || '' });
  }

  for (const n of i.notes || []) {
    if (n.kibbutz !== i.kibbutz) continue;
    const at = noonOf(n.meeting_date);
    if (!inWindow(at)) continue;
    items.push({ key: `note:${n.id}`, kind: 'note', at, title: n.text, meta: (n.owners || []).join(', ') });
  }

  for (const v of i.visits || []) {
    if (v.kibbutz !== i.kibbutz) continue;
    const at = noonOf(v.date);
    if (!inWindow(at)) continue;
    const names = v.visitors && v.visitors.length ? v.visitors : [v.visitor].filter(Boolean) as string[];
    const first = names[0] || '';
    items.push({
      key: `visit:${i.kibbutz}|${v.date}|${first}`, kind: 'visit', at,
      title: v.summary || 'ביקור', meta: `ביקור · ${names.join(', ')}`,
    });
  }

  items.sort(byAtDesc);
  olderOpen.sort(byAtDesc);
  return { items, olderOpen };
}

/**
 * The window's start instant: Israel midnight of the previous-meeting date when there is one,
 * else 30 days back from `now` (also Israel midnight of that day) — the same fallback the
 * "30 יום" toggle offers explicitly.
 */
export function windowStartFor(mode: 'since' | '30d', previousMeeting: string | null, now: Date): string {
  if (mode === 'since' && previousMeeting) return new Date(israelAt(previousMeeting, 0)).toISOString();
  const thirtyAgo = new Date(now.getTime() - 30 * 86_400_000);
  return new Date(israelAt(thirtyAgo, 0)).toISOString();
}

// The meeting-timeline data hook (package M, M-L7): reads live EMS tasks through the gateway
// (dates only exist live, not in the shared cache), merges them across a kibbutz's EMS sites,
// paces comment fetches, and feeds it all to the pure `timelineFor` (M-L1). Offline/signed-out
// falls back to the shared cache's task titles — no dates, so they land in `olderOpen` with no
// reason, exactly like an open task whose latest change is older than the window.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { sigma, useEmsConnected } from '@/bridge';
import { getSupabase } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import { emsGateway } from '@/lib/ems/gateway';
import { OPEN_STATUSES } from '@/lib/ems/adapters/rest';
import type { EmsComment, EmsTask } from '@/lib/ems/types';
import { EMS_CLOSED } from '@/lib/emsTasks';
import { dayOf } from '@/lib/field';
import { fetchKibbutzRows } from '@/lib/kibbutzRows';
import type { KibbutzRow } from '@/lib/kibbutzim';
import { useInternalTasks } from '@/components/home/InternalTasks';
import { NOTES_QUERY_KEY } from '@/components/home/MeetingNotes';
import type { NoteRow } from '@/lib/meetingNotes';
import { fetchPreviousMeetingDate } from '@/lib/meetingSession';
import { timelineFor, windowStartFor, type TimelineItem, type VisitRow } from '@/lib/meetingTimeline';

const fetchKibbutzim = () => fetchKibbutzRows<KibbutzRow>();

/** The same plain select Presenter.tsx's own (private) `fetchNotes` runs — every meeting-mode
 *  reader of `kibbutz_meeting_notes` shares the `NOTES_QUERY_KEY` cache, not this function. */
async function fetchNotes(): Promise<NoteRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('kibbutz_meeting_notes')
    .select('id,kibbutz,meeting_date,meeting_kind,seq,text,owners,ems_task_id,done_at');
  if (error) throw error;
  return (data || []) as NoteRow[];
}

const MAX_CONCURRENT_COMMENT_FETCHES = 4;

/**
 * Comments for these open tasks, at most 4 requests in flight at once — a busy kibbutz has
 * ~5 open tasks, 41 kibbutzim have far more, so this is paced per screen rather than fetched
 * all at once. Goes through `queryClient` with the SAME `['meeting-comments', taskId]` key
 * M-L7 declares (5-minute cache), so a comment list fetched here is reused everywhere else
 * that ever asks for that task's comments.
 */
async function fetchCommentsPaced(ids: string[]): Promise<Record<string, EmsComment[]>> {
  const out: Record<string, EmsComment[]> = {};
  let next = 0;
  async function worker(): Promise<void> {
    while (next < ids.length) {
      const id = ids[next++];
      out[id] = await queryClient.fetchQuery({
        queryKey: ['meeting-comments', id],
        queryFn: () => emsGateway().listComments(id),
        staleTime: 5 * 60_000,
      });
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_COMMENT_FETCHES, ids.length) }, worker));
  return out;
}

export interface UseMeetingTimeline {
  items: TimelineItem[];
  olderOpen: TimelineItem[];
  previousMeeting: string | null;
  isLoading: boolean;
  isError: boolean;
  refetch(): void;
  emsLive: boolean;
}

export function useMeetingTimeline(kibbutz: string, mode: 'since' | '30d'): UseMeetingTimeline {
  const emsLive = useEmsConnected();
  const today = React.useMemo(() => dayOf(new Date()), []);

  const kibbutzimQ = useQuery({ queryKey: ['kibbutzim'], queryFn: fetchKibbutzim });
  const siteIds = React.useMemo(() => {
    const row = (kibbutzimQ.data || []).find(r => r.name === kibbutz) || null;
    return (row?.ems_site_ids || []).filter(Boolean) as string[];
  }, [kibbutzimQ.data, kibbutz]);

  const emsTasksQ = useQuery({
    queryKey: ['meeting-ems', ...siteIds],
    queryFn: async () => {
      const lists = await Promise.all(
        siteIds.map(siteId => emsGateway().listOpenTasks({ siteId, statuses: OPEN_STATUSES, take: 100 })));
      const byId = new Map<string, EmsTask>();
      for (const list of lists) for (const t of list) byId.set(t.id, t);
      return [...byId.values()];
    },
    staleTime: 60_000,
    enabled: emsLive && siteIds.length > 0,
  });
  const emsTasks = emsTasksQ.data || [];
  const taskIds = React.useMemo(() => emsTasks.map(t => t.id), [emsTasks]);

  const commentsQ = useQuery({
    queryKey: ['meeting-comments-for', kibbutz, ...taskIds],
    queryFn: () => fetchCommentsPaced(taskIds),
    staleTime: 5 * 60_000,
    enabled: emsLive && taskIds.length > 0,
  });

  const internalQ = useInternalTasks();
  const notesQ = useQuery({ queryKey: NOTES_QUERY_KEY, queryFn: fetchNotes });

  const prevMeetingQ = useQuery({
    queryKey: ['meeting-prev', 'company', today],
    queryFn: () => fetchPreviousMeetingDate('company', today),
  });

  // A legacy synchronous cache read — re-derived only when the kibbutz on screen changes, so it
  // doesn't defeat the `timeline` memo below on every unrelated re-render (a fresh array from
  // `loadAllVisitsCombined()` would otherwise have a new identity each time).
  const visits = React.useMemo<VisitRow[]>(() => {
    try { return (sigma.loadAllVisitsCombined?.() || []) as VisitRow[]; } catch { return []; }
  }, [kibbutz]);

  const windowStart = windowStartFor(mode, prevMeetingQ.data ?? null, new Date());

  // Fall back to the shared cache not only offline/signed-out, but ALSO when EMS is connected
  // and the live fetch itself failed — a flaky request shouldn't blank the timeline when the
  // cache still has last-known titles to show.
  const useCache = !emsLive || emsTasksQ.isError;

  const timeline = React.useMemo(() => {
    const input = {
      kibbutz,
      emsTasks: useCache ? [] : emsTasks,
      comments: useCache ? {} : (commentsQ.data || {}),
      internal: internalQ.data || [],
      notes: notesQ.data || [],
      visits,
    };
    return timelineFor(input, windowStart);
  }, [kibbutz, useCache, emsTasks, commentsQ.data, internalQ.data, notesQ.data, visits, windowStart]);

  // Offline/signed-out/failed: the shared legacy cache has titles and statuses but no dates, so
  // these never get a place ON the timeline — only in "משימות פתוחות ותיקות", undated, reason
  // omitted.
  const cacheOlderOpen = React.useMemo<TimelineItem[]>(() => {
    if (!useCache) return [];
    let cached: Array<{ id: string; title: string; status: string }> = [];
    try { cached = (sigma.emsCacheTasksForKibbutz?.(kibbutz) || []) as typeof cached; } catch { cached = []; }
    return cached
      .filter(t => !EMS_CLOSED.includes(t.status))
      .map(t => ({ key: `ems:${t.id}`, kind: 'ems' as const, at: '', title: t.title, meta: '', taskId: t.id, status: t.status }));
  }, [useCache, kibbutz]);

  const refetch = React.useCallback(() => {
    void kibbutzimQ.refetch();
    void internalQ.refetch?.();
    void notesQ.refetch();
    void prevMeetingQ.refetch();
    if (emsLive) { void emsTasksQ.refetch(); void commentsQ.refetch(); }
  }, [kibbutzimQ, internalQ, notesQ, prevMeetingQ, emsTasksQ, commentsQ, emsLive]);

  return {
    items: timeline.items,
    olderOpen: useCache ? cacheOlderOpen : timeline.olderOpen,
    previousMeeting: prevMeetingQ.data ?? null,
    isLoading: kibbutzimQ.isLoading || internalQ.isLoading || notesQ.isLoading || (emsLive && emsTasksQ.isLoading),
    isError: kibbutzimQ.isError || internalQ.isError || notesQ.isError,
    refetch,
    emsLive,
  };
}

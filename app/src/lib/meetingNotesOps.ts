// Row actions on a kibbutz_meeting_notes bullet: delete (with undo), move to another kibbutz,
// link to an internal task. Each write ends with `notes-changed` so every surface refetches.
import { sigmaBus } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { internalLinkValue, nextSeq, type NoteRow } from '@/lib/meetingNotes';

const T = 'kibbutz_meeting_notes';
const emit = (detail?: Record<string, unknown>) => {
  try { sigmaBus?.dispatchEvent(new CustomEvent('notes-changed', { detail })); } catch { /* no bus */ }
};

/** Delete the row. `undo` puts back the exact row (same id, seq, links) so nothing is lost. */
export async function deleteNote(row: NoteRow): Promise<{ undo: () => Promise<void> }> {
  if (!row.id) throw new Error('השורה עוד לא נשמרה');
  const sb = await getSupabase();
  await sbWrite(() => sb.from(T).delete().eq('id', row.id!).select('id').single());
  emit({ id: row.id, deleted: true });
  return {
    undo: async () => {
      const sb2 = await getSupabase();
      await sbWrite(() => sb2.from(T).insert({ ...row }).select('id').single());
      emit({ id: row.id, restored: true });
    },
  };
}

/** Move the row to another kibbutz (wrong transcript attribution). It lands last in that meeting. */
export async function moveNote(row: NoteRow, target: string): Promise<{ undo: () => Promise<void> }> {
  if (!row.id) throw new Error('השורה עוד לא נשמרה');
  if (!target || target === row.kibbutz) throw new Error('בחר קיבוץ אחר');
  const sb = await getSupabase();
  const { data, error } = await sb.from(T).select('seq')
    .eq('kibbutz', target).eq('meeting_date', row.meeting_date).eq('meeting_kind', row.meeting_kind);
  if (error) throw error;
  const seq = nextSeq(((data || []) as Array<{ seq: number }>).map(r => r.seq));
  await sbWrite(() => sb.from(T).update({ kibbutz: target, seq }).eq('id', row.id!).select('id').single());
  emit({ id: row.id, moved: target });
  return {
    undo: async () => {
      const sb2 = await getSupabase();
      await sbWrite(() => sb2.from(T).update({ kibbutz: row.kibbutz, seq: row.seq }).eq('id', row.id!).select('id').single());
      emit({ id: row.id, moved: row.kibbutz });
    },
  };
}

/** Remember which internal task a bullet became. */
export async function linkNoteToInternalTask(row: NoteRow, taskId: string): Promise<void> {
  if (!row.id || !taskId) return;
  const sb = await getSupabase();
  await sbWrite(() => sb.from(T).update({ ems_task_id: internalLinkValue(taskId) }).eq('id', row.id!).select('id').single());
  emit({ id: row.id, ems_task_id: internalLinkValue(taskId) });
}

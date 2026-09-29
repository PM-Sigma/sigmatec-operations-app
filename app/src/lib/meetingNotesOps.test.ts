// @vitest-environment jsdom
// Row actions on a meeting bullet: delete+undo, move (+seq), link to an internal task.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { log, seqRows } = vi.hoisted(() => ({
  log: [] as Array<{ op: string; table: string; payload?: any; eq: Record<string, any> }>,
  seqRows: { rows: [] as Array<{ seq: number }> },
}));
vi.mock('@/bridge', () => ({ sigmaBus: new EventTarget() }));
vi.mock('@/lib/supabase', () => {
  const table = (name: string) => {
    const st: any = { op: 'select', payload: undefined, eq: {} };
    const api: any = {
      select: () => api,
      single: () => api,
      delete() { st.op = 'delete'; return api; },
      insert(p: any) { st.op = 'insert'; st.payload = p; return api; },
      update(p: any) { st.op = 'update'; st.payload = p; return api; },
      eq(c: string, v: any) { st.eq[c] = v; return api; },
      then(res: any) {
        if (st.op !== 'select') log.push({ op: st.op, table: name, payload: st.payload, eq: st.eq });
        return Promise.resolve({ data: st.op === 'select' ? seqRows.rows : [{}], error: null }).then(res);
      },
    };
    return api;
  };
  const sb = { from: (n: string) => table(n) };
  return { getSupabase: async () => sb, sbWrite: async (run: (s: any) => any) => (await run(sb)).data };
});

const { deleteNote, moveNote, linkNoteToInternalTask } = await import('./meetingNotesOps');
const { nextSeq, moveTargets, internalLinkValue, isInternalLink } = await import('./meetingNotes');

const row = { id: 'n1', kibbutz: 'חוקוק', meeting_date: '2026-09-17', meeting_kind: 'company', seq: 2, text: 'להשלים החלפת מונה', owners: ['עידן'], ems_task_id: null, done_at: null };
beforeEach(() => { log.length = 0; seqRows.rows = []; });

describe('pure helpers', () => {
  it('nextSeq is max+1, 1 when empty', () => {
    expect(nextSeq([])).toBe(1);
    expect(nextSeq([1, 4, 2])).toBe(5);
  });
  it('moveTargets drops the current kibbutz', () => {
    expect(moveTargets(['א', 'ב', 'ג'], 'ב')).toEqual(['א', 'ג']);
  });
  it('internal link value round-trips', () => {
    expect(isInternalLink(internalLinkValue('it-1'))).toBe(true);
    expect(isInternalLink('123')).toBe(false);
    expect(isInternalLink(null)).toBe(false);
  });
});

describe('deleteNote', () => {
  it('deletes by id, and undo re-inserts the exact row', async () => {
    const { undo } = await deleteNote(row);
    expect(log[0]).toMatchObject({ op: 'delete', table: 'kibbutz_meeting_notes', eq: { id: 'n1' } });
    await undo();
    expect(log[1]).toMatchObject({ op: 'insert', payload: row });
  });
  it('refuses an unsaved row', async () => {
    await expect(deleteNote({ ...row, id: undefined })).rejects.toThrow();
  });
});

describe('moveNote', () => {
  it('moves to the target, landing after its last seq', async () => {
    seqRows.rows = [{ seq: 1 }, { seq: 3 }];
    await moveNote(row, 'דפנה');
    expect(log[0]).toMatchObject({ op: 'update', payload: { kibbutz: 'דפנה', seq: 4 }, eq: { id: 'n1' } });
  });
  it('undo restores kibbutz and seq', async () => {
    const { undo } = await moveNote(row, 'דפנה');
    await undo();
    expect(log[1]).toMatchObject({ op: 'update', payload: { kibbutz: 'חוקוק', seq: 2 } });
  });
  it('rejects the same kibbutz or none', async () => {
    await expect(moveNote(row, 'חוקוק')).rejects.toThrow();
    await expect(moveNote(row, '')).rejects.toThrow();
  });
});

describe('linkNoteToInternalTask', () => {
  it('stamps internal:<id> on the note', async () => {
    await linkNoteToInternalTask(row, 'it-9');
    expect(log[0]).toMatchObject({ op: 'update', payload: { ems_task_id: 'internal:it-9' }, eq: { id: 'n1' } });
  });
});

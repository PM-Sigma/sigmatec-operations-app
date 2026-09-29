// @vitest-environment jsdom
// The ✏️ kibbutz sheet. Two kibbutzim were archived by accident on 22.9 (round 3, N1), so the
// invariant worth a render test is the archive lock: no write until the exact name is typed.
// Plus the read-only EMS link line that replaced the chain (round 4, Y).
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

afterEach(cleanup);

const { writes, sonner, rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async () => ({ error: null })),
  writes: [] as Array<{ op: string; body: any; key: string; val: any }>,
  sonner: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: sonner }));
vi.mock('@/components/home/OnboardingProgress', () => ({ spawnOnboardingForNewKibbutz: async () => {} }));
vi.mock('@/lib/supabase', () => ({
  getSupabase: async () => ({ rpc: rpcMock }),
  sbWrite: async (fn: (sb: any) => any) => {
    const chain = (op: string, body: any) => ({
      eq: (key: string, val: any) => { writes.push({ op, body, key, val }); return { select: () => ({ single: async () => body }) }; },
    });
    return fn({ from: () => ({ update: (b: any) => chain('update', b), insert: (b: any) => ({ select: () => ({ single: async () => b }) }) }) });
  },
}));

import { KibbutzSheet } from '@/components/home/KibbutzSheet';

const ROW = { id: 7, name: 'גבת', section: 'active', region: 'צפון', energy: ['electric'], kind: 'kibbutz', ems_site_ids: [] } as any;

function renderSheet(row = ROW, onArchived = vi.fn(), user = 'עידן') {
  render(
    <KibbutzSheet open onOpenChange={() => {}} row={row} allRows={[row]} user={user}
                  onSaved={() => {}} onArchived={onArchived} />,
  );
  return onArchived;
}

beforeEach(() => { writes.length = 0; });

describe('KibbutzSheet — archive is type-to-confirm', () => {
  it('the first tap only opens the confirm step; nothing is written', () => {
    renderSheet();
    fireEvent.click(screen.getByText('🗄 ארכב קיבוץ'));
    expect(writes).toEqual([]);
    const confirm = screen.getByText(/כן, ארכב את/).closest('button')!;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(writes).toEqual([]);
  });

  it('a wrong name keeps it locked; the exact name unlocks and archives by name', async () => {
    const onArchived = renderSheet();
    fireEvent.click(screen.getByText('🗄 ארכב קיבוץ'));
    const input = document.getElementById('kibArchiveConfirm') as HTMLInputElement;
    const confirm = () => screen.getByText(/כן, ארכב את/).closest('button')!;
    fireEvent.change(input, { target: { value: 'גב' } });
    expect(confirm().disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'גבת' } });
    expect(confirm().disabled).toBe(false);
    fireEvent.click(confirm());
    await waitFor(() => expect(onArchived).toHaveBeenCalledWith('גבת'));
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ op: 'update', key: 'name', val: 'גבת' });
    expect(Object.keys(writes[0].body)).toEqual(['archived_at']);
  });
});

describe('KibbutzSheet — EMS link is read-only', () => {
  it('an unlinked kibbutz says so', () => {
    renderSheet();
    expect(screen.getByTestId('kib-ems-link').textContent).toContain('⚠️ לא מקושר');
  });
  it('a linked kibbutz says ✓', () => {
    renderSheet({ ...ROW, ems_site_ids: ['s1'] });
    expect(screen.getByTestId('kib-ems-link').textContent).toContain('✓ מקושר');
  });
});

describe('KibbutzSheet — region fixed, section locked (עידן 29.9)', () => {
  beforeEach(() => rpcMock.mockClear());
  it('edit: region is read-only text, no region input', () => {
    renderSheet();
    expect(screen.getByTestId('kib-region-readonly').textContent).toContain('צפון');
    expect(document.getElementById('kibRegion')).toBeNull();
  });
  it.each(['עידן', 'עמיחי'])('%s: changing section goes through the RPC, the UPDATE never carries region/section', async (u) => {
    renderSheet(ROW, vi.fn(), u);
    fireEvent.click(screen.getByText('🆕 לקוח חדש'));
    fireEvent.click(screen.getByText('שמור קיבוץ'));
    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith('set_kibbutz_section', { p_kibbutz: 'גבת', p_section: 'new' }));
    expect(writes.length).toBe(1);
    expect(writes[0].body).not.toHaveProperty('region');
    expect(writes[0].body).not.toHaveProperty('section');
  });
  it('a non-editor sees no section control and never calls the RPC', async () => {
    renderSheet(ROW, vi.fn(), 'אביאם');
    expect(screen.queryByText('🆕 לקוח חדש')).toBeNull();
    fireEvent.click(screen.getByText('שמור קיבוץ'));
    await waitFor(() => expect(writes.length).toBe(1));
    expect(rpcMock).not.toHaveBeenCalled();
  });
  it('a missing RPC shows the Hebrew toast', async () => {
    rpcMock.mockResolvedValueOnce({ error: { code: 'PGRST202', message: 'Could not find the function' } } as any);
    renderSheet();
    fireEvent.click(screen.getByText('🆕 לקוח חדש'));
    fireEvent.click(screen.getByText('שמור קיבוץ'));
    await waitFor(() => expect(sonner.error).toHaveBeenCalledWith(expect.stringContaining('עדיין לא זמין')));
  });
});

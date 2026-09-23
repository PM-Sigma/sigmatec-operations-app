// @vitest-environment jsdom
// The ✏️ kibbutz sheet. Two kibbutzim were archived by accident on 22.9 (round 3, N1), so the
// invariant worth a render test is the archive lock: no write until the exact name is typed.
// Plus the read-only EMS link line that replaced the chain (round 4, Y).
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

afterEach(cleanup);

const { writes, sonner } = vi.hoisted(() => ({
  writes: [] as Array<{ op: string; body: any; key: string; val: any }>,
  sonner: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('sonner', () => ({ toast: sonner }));
vi.mock('@/components/home/OnboardingProgress', () => ({ spawnOnboardingForNewKibbutz: async () => {} }));
vi.mock('@/lib/supabase', () => ({
  sbWrite: async (fn: (sb: any) => any) => {
    const chain = (op: string, body: any) => ({
      eq: (key: string, val: any) => { writes.push({ op, body, key, val }); return { select: () => ({ single: async () => body }) }; },
    });
    return fn({ from: () => ({ update: (b: any) => chain('update', b), insert: (b: any) => ({ select: () => ({ single: async () => b }) }) }) });
  },
}));

import { KibbutzSheet } from '@/components/home/KibbutzSheet';

const ROW = { id: 7, name: 'גבת', section: 'active', region: 'צפון', energy: ['electric'], kind: 'kibbutz', ems_site_ids: [] } as any;

function renderSheet(row = ROW, onArchived = vi.fn()) {
  render(
    <KibbutzSheet open onOpenChange={() => {}} row={row} allRows={[row]} user="עידן"
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

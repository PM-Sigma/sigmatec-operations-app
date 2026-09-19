// @vitest-environment jsdom
// Render goldens for the 🆕 onboarding strip (Task 27): shows only on a 🆕 card, a toggle
// emits `onboarding-changed` exactly once, and a completed checklist offers — never forces —
// the move to active.
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { rows, updated, busEvents } = vi.hoisted(() => ({
  rows: [] as any[],
  updated: [] as Array<{ table: string; row: any }>,
  busEvents: [] as string[],
}));

class FakeBus extends EventTarget {
  dispatchEvent(e: Event) { busEvents.push(e.type); return super.dispatchEvent(e); }
}
const bus = new FakeBus();

vi.mock('@/bridge', () => ({ sigmaBus: bus }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/lib/supabase', () => {
  const table = (name: string) => ({
    select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }),
    update: (row: any) => {
      updated.push({ table: name, row });
      return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'x' }, error: null }) }) }) };
    },
  });
  return {
    getSupabase: async () => ({ from: table }),
    sbWrite: (fn: () => Promise<any>) => fn(),
  };
});

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
vi.mock('@/lib/query', () => ({ queryClient: qc }));

const { OnboardingProgress } = await import('./OnboardingProgress');

function withClient(node: React.ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const step = (over: Partial<any> = {}) => ({
  id: 's1', kibbutz: 'גבת', step_key: 'ems_site', label: 'הקמת אתר ב-EMS', seq: 0,
  state: 'open', created_at: '2026-09-01T00:00:00Z', ...over,
});

beforeEach(() => {
  rows.length = 0; updated.length = 0; busEvents.length = 0;
  qc.clear();
});

describe('OnboardingProgress', () => {
  it('no spawned rows for this kibbutz → renders nothing (a ✅ card never has any)', async () => {
    const { container } = render(withClient(<OnboardingProgress kibbutz="חוקוק" canAct={true} />));
    await waitFor(() => expect(container.querySelector('[data-testid="onboarding-strip"]')).toBeNull());
  });

  it('a 🆕 card shows the strip: progress label + next step', async () => {
    for (let i = 0; i < 9; i++) rows.push(step({ id: 's' + i, step_key: 'k' + i, seq: i, state: i < 3 ? 'done' : 'open' }));
    render(withClient(<OnboardingProgress kibbutz="גבת" canAct={true} />));
    await waitFor(() => expect(screen.getByTestId('onboarding-strip')).toBeTruthy());
    expect(screen.getByText('3/9')).toBeTruthy();
  });

  it('only this kibbutz\'s rows count', async () => {
    rows.push(step({ id: 'a', kibbutz: 'גבת' }));
    rows.push(step({ id: 'b', kibbutz: 'שדה אליהו', state: 'done' }));
    render(withClient(<OnboardingProgress kibbutz="גבת" canAct={true} />));
    await waitFor(() => expect(screen.getByTestId('onboarding-strip')).toBeTruthy());
    expect(screen.getByText('0/1')).toBeTruthy();
  });

  it('tapping the next step cycles it and emits onboarding-changed exactly once', async () => {
    rows.push(step({ id: 'a', step_key: 'ems_site' }));
    render(withClient(<OnboardingProgress kibbutz="גבת" canAct={true} />));
    await waitFor(() => expect(screen.getByText('הקמת אתר ב-EMS')).toBeTruthy());
    const btn = document.querySelector('.onboarding-next-step') as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(updated).toHaveLength(1));
    // ems_site never waits — open goes straight to done
    expect(updated[0].table).toBe('onboarding_steps');
    expect(updated[0].row.state).toBe('done');
    expect(busEvents.filter(e => e === 'onboarding-changed')).toHaveLength(1);
  });

  it('a waits step goes to waiting, not done, on the first tap', async () => {
    rows.push(step({ id: 'a', step_key: 'customer_list', label: 'קבלת רשימת לקוחות מהקיבוץ (ממתין למייל)' }));
    render(withClient(<OnboardingProgress kibbutz="גבת" canAct={true} />));
    await waitFor(() => expect(document.querySelector('.onboarding-next-step')).toBeTruthy());
    const btn = document.querySelector('.onboarding-next-step') as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    await waitFor(() => expect(updated).toHaveLength(1));
    expect(updated[0].row.state).toBe('waiting');
  });

  it('canAct=false never writes on tap', async () => {
    rows.push(step({ id: 'a' }));
    render(withClient(<OnboardingProgress kibbutz="גבת" canAct={false} />));
    await waitFor(() => expect(document.querySelector('.onboarding-next-step')).toBeTruthy());
    const btn = document.querySelector('.onboarding-next-step') as HTMLButtonElement;
    await act(async () => { fireEvent.click(btn); });
    expect(updated).toHaveLength(0);
  });

  it('all nine done → offers the move to active, does not flip anything itself', async () => {
    for (let i = 0; i < 9; i++) rows.push(step({ id: 's' + i, step_key: 'k' + i, seq: i, state: 'done' }));
    render(withClient(<OnboardingProgress kibbutz="גבת" canAct={true} />));
    await waitFor(() => expect(screen.getByText(/להעביר לפעילים/)).toBeTruthy());
    expect(updated).toHaveLength(0);
  });
});

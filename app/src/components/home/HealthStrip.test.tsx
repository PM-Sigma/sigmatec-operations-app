// @vitest-environment jsdom
// Render goldens for the health strip (Task 28): the role matrix, the permanent טיוטה marker,
// the אין נתונים state, and the four explanations behind the dots.
import * as React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

afterEach(cleanup);

const { who } = vi.hoisted(() => ({ who: { name: 'עידן', role: 'idan' } }));

vi.mock('@/bridge', () => ({
  sigma: undefined,
  useCurrentUser: () => ({ ...who, isViewer: who.role === 'viewer' }),
}));

const { HealthStrip, presenterStripFor } = await import('./HealthStrip');

let qc: QueryClient;
function withClient(node: React.ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

beforeEach(() => {
  who.name = 'עידן'; who.role = 'idan';
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe('HealthStrip — who sees it', () => {
  it('עידן sees it', async () => {
    render(withClient(<HealthStrip kibbutz="דפנה" />));
    expect(await screen.findByTestId('health-strip')).toBeTruthy();
  });

  it('עמיחי sees it', async () => {
    who.name = 'עמיחי'; who.role = 'team';
    render(withClient(<HealthStrip kibbutz="דפנה" />));
    expect(await screen.findByTestId('health-strip')).toBeTruthy();
  });

  it('a viewer sees it', async () => {
    who.name = 'צפייה'; who.role = 'viewer';
    render(withClient(<HealthStrip kibbutz="דפנה" />));
    expect(await screen.findByTestId('health-strip')).toBeTruthy();
  });

  it('a technician does not', () => {
    who.name = 'אביאם'; who.role = 'team';
    const { container } = render(withClient(<HealthStrip kibbutz="דפנה" />));
    expect(container.innerHTML).toBe('');
  });

  it('the field role never does, whoever is signed in', () => {
    who.name = 'עידן'; who.role = 'field';
    const { container } = render(withClient(<HealthStrip kibbutz="דפנה" />));
    expect(container.innerHTML).toBe('');
  });

  it('no kibbutz in the modal → nothing at all', () => {
    const { container } = render(withClient(<HealthStrip kibbutz="" />));
    expect(container.innerHTML).toBe('');
  });
});

describe('HealthStrip — what it says', () => {
  it('the טיוטה marker is on screen', async () => {
    render(withClient(<HealthStrip kibbutz="דפנה" />));
    const badge = await screen.findByTestId('health-draft-badge');
    expect(badge.textContent).toContain('טיוטה');
  });

  it('with no source wired up: four hollow dots and אין נתונים, never a red kibbutz', async () => {
    render(withClient(<HealthStrip kibbutz="דפנה" />));
    const strip = await screen.findByTestId('health-strip');
    await waitFor(() => expect(screen.getByTestId('health-dot-finance').getAttribute('data-band')).toBe('none'));
    expect(strip.getAttribute('data-band')).toBe('none');
    expect(strip.textContent).toContain('אין נתונים');
    for (const key of ['finance', 'energy', 'alerts', 'recurring']) {
      expect(screen.getByTestId('health-dot-' + key).getAttribute('data-band')).toBe('none');
    }
  });

  it('each dot carries its own explanation', async () => {
    render(withClient(<HealthStrip kibbutz="דפנה" />));
    const dot = await screen.findByTestId('health-dot-energy');
    await waitFor(() => expect(dot.getAttribute('title')).toContain('אין נתונים'));
    expect(dot.getAttribute('title')).toContain('מאזן אנרגיה');
  });
});

describe('presenterStripFor', () => {
  it('a kibbutz nobody has looked at yet → nothing for the presenter to render', () => {
    expect(presenterStripFor('קיבוץ שלא נפתח')).toEqual([]);
  });

  it('after the strip has an answer, the presenter gets the same four lines', async () => {
    render(withClient(<HealthStrip kibbutz="חוקוק" />));
    await screen.findByTestId('health-strip');
    await waitFor(() => expect(presenterStripFor('חוקוק')).toHaveLength(4));
    expect(presenterStripFor('חוקוק')[0]).toEqual({ label: 'מאזן כספי', value: 'אין נתונים' });
  });
});

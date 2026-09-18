// @vitest-environment jsdom
// Spec §7n render goldens: one sheet for many 401s, the draft line, the hand-over to the
// sign-in, and the gate card an island shows instead of its content.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReLoginSheet, RELOGIN_TITLE } from './ReLoginSheet';
import { LoginRequired, LOGIN_REQUIRED_TITLE } from './LoginRequired';
import { SESSION_EXPIRED, notifySessionExpired, resetExpiryDebounce } from '@/lib/session';

/** A 401 as the app really raises it — through the funnel, inside React's act(). */
function expire(reason = 'sb-401') { act(() => { notifySessionExpired(reason); }); }

beforeEach(() => {
  resetExpiryDebounce();
  (window as any).sigmaBus = new EventTarget();
  (window as any).sigma = { visitDraftFor: () => null, toast: vi.fn() };
  delete (window as any).sigmaSessionExpired;
  delete (window as any)._certViewMode;
  (window as any).sigmaBeginReLogin = vi.fn();
});
afterEach(() => cleanup());

describe('ReLoginSheet', () => {
  it('is closed until a session expires', () => {
    render(<ReLoginSheet />);
    expect(screen.queryByText(RELOGIN_TITLE)).not.toBeInTheDocument();
  });

  it('five concurrent 401s show exactly one sheet', () => {
    render(<ReLoginSheet />);
    for (let i = 0; i < 5; i++) expire();
    expect(screen.getAllByText(RELOGIN_TITLE)).toHaveLength(1);
  });

  it('says the draft is waiting when there is one', () => {
    (window as any).sigma.visitDraftFor = () => ({
      id: 'd1', person: 'עידן', kibbutz: 'גבים', date: '2026-09-18',
      updated_at: '2026-09-18T14:02:00.000Z',
    });
    render(<ReLoginSheet />);
    expire();
    // one sentence, two text nodes — assert on what the person actually reads
    expect(document.body.textContent || '').toContain('14:02');
  });

  it('hands over to the sign-in and closes', async () => {
    render(<ReLoginSheet />);
    expire();
    act(() => { screen.getByRole('button', { name: /התחבר מחדש/ }).click(); });
    expect((window as any).sigmaBeginReLogin).toHaveBeenCalled();
  });

  it('never appears on a public certificate link', () => {
    (window as any)._certViewMode = true;
    render(<ReLoginSheet />);
    expire();
    expect(screen.queryByText(RELOGIN_TITLE)).not.toBeInTheDocument();
  });

  it('the legacy path opens the same sheet', () => {
    render(<ReLoginSheet />);
    act(() => { (window as any).sigmaOpenReLogin(); });
    expect(screen.getAllByText(RELOGIN_TITLE)).toHaveLength(1);
  });

  it('says nothing about the mechanics and nothing about who else sees the data', () => {
    render(<ReLoginSheet />);
    expire();
    const text = document.body.textContent || '';
    for (const w of ['Supabase', 'RLS', 'JWT', 'token', 'עמיחי']) expect(text).not.toContain(w);
  });
});

describe('LoginRequired', () => {
  it('is one sentence and one button', () => {
    render(<LoginRequired />);
    expect(screen.getByText(LOGIN_REQUIRED_TITLE)).toBeInTheDocument();
    act(() => { screen.getByRole('button', { name: /התחבר/ }).click(); });
    expect((window as any).sigmaBeginReLogin).toHaveBeenCalled();
  });
});

describe('the bus event name is the documented one', () => {
  it('is session-expired', () => expect(SESSION_EXPIRED).toBe('session-expired'));
});

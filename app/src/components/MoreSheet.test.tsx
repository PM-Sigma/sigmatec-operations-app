// @vitest-environment jsdom
// F9: the ⋯ sheet's ניהול PAGE rows (פיתוח, סטטיסטיקה) are exactly what canShowPage allows — no
// second name list. Registered ניהול items stay עידן-only.
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

let who = 'עידן';
let allowed: string[] = [];
vi.mock('@/bridge', () => ({
  useCurrentUser: () => ({ name: who, role: 'team', isViewer: false }),
  sigma: { showPage: () => {} },
}));
vi.mock('@/lib/canShowPage', () => ({ canShowPage: (p: string) => allowed.includes(p) }));
vi.mock('@/lib/landing', () => ({ moreLeadsWithInventory: () => false }));
vi.mock('@/lib/track', () => ({ track: () => {} }));
vi.mock('@/shell/IdentityRow', () => ({ IdentityRow: () => null }));

import { MoreSheet } from '@/components/MoreSheet';

function rows(user: string, ok: string[]) {
  who = user; allowed = ok;
  render(<MoreSheet role="team" user={user} openSignal={1} />);
  return screen.queryAllByRole('button').map(b => (b.textContent || '').trim());
}

describe('MoreSheet ניהול rows follow canShowPage', () => {
  it('shows פיתוח + סטטיסטיקה when canShowPage allows them (עמיחי)', () => {
    const r = rows('עמיחי', ['dev', 'emsstats']);
    expect(r).toContain('פיתוח'); expect(r).toContain('סטטיסטיקה');
  });
  it('shows only פיתוח when only dev is allowed (מתניה/אליה)', () => {
    const r = rows('מתניה', ['dev']);
    expect(r).toContain('פיתוח'); expect(r).not.toContain('סטטיסטיקה');
  });
  it('hides both when neither is allowed', () => {
    const r = rows('אבצן', []);
    expect(r).not.toContain('פיתוח'); expect(r).not.toContain('סטטיסטיקה');
  });
  it('shows התראות only when canShowPage(pushlog) allows it', () => {
    expect(rows('עידן', ['pushlog'])).toContain('התראות');
    cleanup();
    expect(rows('עמיחי', ['dev'])).not.toContain('התראות');
  });
});

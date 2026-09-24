// @vitest-environment jsdom
// PageBar (round 5, U3/S-5/S-6): title from lib/shell, back chevron only on level-2 pages, the
// primary action rendered as a bubble in its own row — the thing that used to live inline in
// the header and collide with the page title at 360px.
import * as React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

const { st } = vi.hoisted(() => ({ st: { name: 'עידן', role: 'idan', isViewer: false, page: 'kibbutz' } }));

vi.mock('@/bridge', () => ({ useCurrentUser: () => ({ name: st.name, role: st.role, isViewer: st.isViewer }) }));
vi.mock('@/lib/currentPage', () => ({ useCurrentPage: () => st.page }));
vi.mock('@/lib/kibbutzim', () => ({ canManageKibbutzim: () => true }));
vi.mock('@/lib/navigate', () => ({ goBack: vi.fn() }));
vi.mock('@/lib/track', () => ({ track: vi.fn() }));
vi.mock('@/islands', () => ({ mount: () => true }));

import { goBack } from '@/lib/navigate';
import { PageBar } from '@/shell/PageBar';

beforeEach(() => { Object.assign(st, { name: 'עידן', role: 'idan', isViewer: false, page: 'kibbutz' }); });

describe('PageBar', () => {
  it('kibbutz (level 1): title, primary bubble, no back chevron', () => {
    render(<PageBar />);
    expect(screen.getByText('קיבוצים')).toBeTruthy();
    expect(screen.getByText('קיבוץ חדש')).toBeTruthy();
    expect(screen.queryByLabelText('חזרה')).toBeNull();
  });

  it('a level-2 page (burns) gets the back chevron', () => {
    st.page = 'burns';
    render(<PageBar />);
    const back = screen.getByLabelText('חזרה');
    fireEvent.click(back);
    expect(goBack).toHaveBeenCalledOnce();
  });
});

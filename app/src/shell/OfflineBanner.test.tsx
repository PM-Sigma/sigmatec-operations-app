// @vitest-environment jsdom
// OfflineBanner (S-14): visible the instant `navigator.onLine` reads false, gone once it reads
// true, styled with tokens that hold contrast in both themes (dark-mode visibility, round 5).
import * as React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(cleanup);
vi.mock('@/islands', () => ({ mount: () => true }));

import { OfflineBanner } from '@/shell/OfflineBanner';

describe('OfflineBanner', () => {
  it('shows the offline copy when navigator.onLine is false', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<OfflineBanner />);
    expect(screen.getByText('אין חיבור. השינויים יישמרו במכשיר.')).toBeTruthy();
  });

  it('renders nothing when online', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    const { container } = render(<OfflineBanner />);
    expect(container.textContent).toBe('');
  });
});

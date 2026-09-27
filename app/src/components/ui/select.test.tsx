// @vitest-environment jsdom
// U8 finding (round 5 R-U9 "stock-change-sheet"): SelectContent portalled to document.body
// with no `.sigma-root` wrapper — unlike sheet.tsx's own SheetPortal — so nested one level
// inside a Sheet its options rendered unstyled/unpositioned under the sheet's own overlay
// (Tailwind's `important: '.sigma-root'` only emits utilities under that selector). This
// guards the fix directly on SelectPortal — not through the full interactive <Select> open
// flow, which drives Radix's real popper/ResizeObserver machinery that jsdom has nothing to
// back, and hangs the test worker instead of ever failing cleanly.
import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SelectPortal } from './select';

afterEach(cleanup);

describe('SelectPortal', () => {
  it('wraps its children in a .sigma-root/[data-sigma-portal] element, same contract as SheetPortal', () => {
    render(
      <SelectPortal>
        <div data-testid="option">אפשרות א׳</div>
      </SelectPortal>,
    );
    const option = document.querySelector('[data-testid="option"]')!;
    const sigmaRoot = option.closest('[data-sigma-portal]');
    expect(sigmaRoot).not.toBeNull();
    expect(sigmaRoot).toHaveClass('sigma-root');
  });
});

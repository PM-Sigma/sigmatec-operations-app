// @vitest-environment jsdom
// U8 finding (round 5 R-U9 "stock-change-sheet"): SelectContent portalled to document.body
// with no `.sigma-root` wrapper — unlike sheet.tsx's own SheetPortal — so nested one level
// inside a Sheet its options rendered unstyled/unpositioned under the sheet's own overlay
// (Tailwind's `important: '.sigma-root'` only emits utilities under that selector). This
// guards the fix: SelectContent must portal inside a `.sigma-root` wrapper, same as Sheet.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

// jsdom has no layout engine, so Radix's own scrollIntoView-on-open effect has nothing real
// to call — stub it the same way the DS's other Radix-heavy suites do.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

describe('Select — portal wrapper', () => {
  it('portals SelectContent inside a .sigma-root wrapper (same contract as SheetPortal)', () => {
    render(
      <Select open value="a" onValueChange={() => {}}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="a">אפשרות א׳</SelectItem>
        </SelectContent>
      </Select>,
    );
    const option = screen.getByRole('option', { name: 'אפשרות א׳' });
    const sigmaRoot = option.closest('[data-sigma-portal]');
    expect(sigmaRoot).not.toBeNull();
    expect(sigmaRoot).toHaveClass('sigma-root');
  });
});

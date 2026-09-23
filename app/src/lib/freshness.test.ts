// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { freshnessLine, useFreshness } from '@/lib/freshness';

const NOW = new Date(2026, 8, 23, 18, 0);
describe('freshness', () => {
  it('formats with lib/format', () => {
    expect(freshnessLine(new Date(2026, 8, 23, 17, 22).toISOString(), NOW)).toBe('עודכן היום 17:22');
    expect(freshnessLine(new Date(2026, 8, 22, 9, 5).toISOString(), NOW)).toBe('עודכן אתמול 09:05');
  });
  it('no pass, no line', () => { expect(freshnessLine(null, NOW)).toBeNull(); });
  it('reads the value published before mount, then follows the event', () => {
    (window as any).__sigmaLastUpdated = new Date().toISOString();
    const { result } = renderHook(() => useFreshness());
    expect(result.current).toMatch(/^עודכן היום \d\d:\d\d$/);
    act(() => { (window as any).__sigmaLastUpdated = null; window.dispatchEvent(new CustomEvent('sigma-last-updated', { detail: null })); });
    expect(result.current).toBeNull();
  });
});

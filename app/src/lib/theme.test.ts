import { describe, it, expect } from 'vitest';
import { themeResolve } from './theme';

describe('themeResolve', () => {
  it('honors an explicit stored choice over the OS preference', () => {
    expect(themeResolve('dark', false)).toBe('dark');
    expect(themeResolve('light', true)).toBe('light');
  });

  it("follows the OS preference when the stored value is 'system'", () => {
    expect(themeResolve('system', true)).toBe('dark');
    expect(themeResolve('system', false)).toBe('light');
  });

  it('defaults to the OS preference when nothing is stored (or the value is junk)', () => {
    expect(themeResolve(null, true)).toBe('dark');
    expect(themeResolve(null, false)).toBe('light');
    expect(themeResolve('purple' as any, true)).toBe('dark');
  });
});

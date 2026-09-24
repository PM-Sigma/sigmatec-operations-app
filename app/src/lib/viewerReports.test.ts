import { describe, expect, it } from 'vitest';
import { monthOf, presetRange } from './viewerReports';

describe('presetRange (round 5, L5)', () => {
  it('presets', () => {
    expect(presetRange('this-month', '2026-09-23')).toEqual({ from: '2026-09-01', to: '2026-09-23' });
    expect(presetRange('last-month', '2026-09-23')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(presetRange('last-30', '2026-09-23')).toEqual({ from: '2026-08-25', to: '2026-09-23' });
    expect(presetRange('last-month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(monthOf('last-month', '2026-09-23')).toBe('2026-08');
  });
});

import { describe, expect, it } from 'vitest';
import { fmtDay, fmtDuration, fmtNumber, fmtTime, fmtUnit } from '@/lib/format';

const NOW = new Date(2026, 8, 23, 17, 22); // Wed 23.9.2026

describe('format (tools-and-motion §3.2)', () => {
  it('numbers use he-IL grouping', () => { expect(fmtNumber(12345)).toBe('12,345'); });
  it('units follow a no-break space', () => { expect(fmtUnit(37, 'יח׳')).toBe('37 יח׳'); });
  it('durations read "4 ש׳ 30 ד׳"', () => {
    expect(fmtDuration(270)).toBe('4 ש׳ 30 ד׳');
    expect(fmtDuration(45)).toBe('45 ד׳');
    expect(fmtDuration(120)).toBe('2 ש׳');
    expect(fmtDuration(0)).toBe('0 ד׳');
  });
  it('times are 24-hour', () => { expect(fmtTime(new Date(2026, 8, 23, 7, 5))).toBe('07:05'); });
  it('days: היום, אתמול, weekday within 6 days, d.m, d.m.yy for another year', () => {
    expect(fmtDay(new Date(2026, 8, 23, 1), NOW)).toBe('היום');
    expect(fmtDay(new Date(2026, 8, 22), NOW)).toBe('אתמול');
    expect(fmtDay(new Date(2026, 8, 18), NOW)).toBe('יום ו׳');
    expect(fmtDay(new Date(2026, 8, 17), NOW)).toBe('17.9');
    expect(fmtDay(new Date(2025, 11, 31), NOW)).toBe('31.12.25');
    expect(fmtDay(new Date(2026, 8, 25), NOW)).toBe('25.9');   // future: plain d.m
  });
});

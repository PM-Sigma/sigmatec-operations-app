// @vitest-environment jsdom
// Goldens for D-L3 — local ישיבת פיתוח marks (D-R4: never touches GitHub). Keyed by the meeting
// DATE (Israel), not the session id, so a reopen the same day sees the same marks.
import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import {
  marksKey, loadMarks, setMark, pruneOldMarks, marksSummary, marksText, type MarkEntry,
} from './devMarks';
import type { DevCard } from './sprintPrep';

beforeEach(() => { localStorage.clear(); });

describe('marksKey', () => {
  it('is the date-scoped key', () => {
    expect(marksKey('2026-09-23')).toBe('dev_meeting_marks_v1:2026-09-23');
  });
});

describe('set / replace / clear', () => {
  it('sets, replaces and clears a mark; a reload sees the same map', () => {
    setMark('2026-09-23', { number: 12, mark: 'sprint', at: '2026-09-23T10:00:00Z' });
    expect(loadMarks('2026-09-23')[12].mark).toBe('sprint');

    setMark('2026-09-23', { number: 12, mark: 'clarify', note: 'x', at: '2026-09-23T10:05:00Z' });
    expect(loadMarks('2026-09-23')[12]).toEqual({ number: 12, mark: 'clarify', note: 'x', at: '2026-09-23T10:05:00Z' });

    setMark('2026-09-23', { number: 12, mark: null });
    expect(loadMarks('2026-09-23')[12]).toBeUndefined();
  });

  it('a different date starts empty', () => {
    setMark('2026-09-23', { number: 12, mark: 'sprint', at: '2026-09-23T10:00:00Z' });
    expect(loadMarks('2026-09-24')).toEqual({});
  });
});

describe('pruneOldMarks', () => {
  it('removes a key older than keepDays and keeps a newer one', () => {
    setMark('2026-09-15', { number: 1, mark: 'sprint', at: '2026-09-15T00:00:00Z' });
    setMark('2026-09-17', { number: 2, mark: 'sprint', at: '2026-09-17T00:00:00Z' });
    pruneOldMarks('2026-09-23');
    expect(localStorage.getItem(marksKey('2026-09-15'))).toBeNull();
    expect(localStorage.getItem(marksKey('2026-09-17'))).not.toBeNull();
  });
});

describe('marksText', () => {
  it('formats the "העתקה" payload, grouped by mark', () => {
    const cards: DevCard[] = [
      { number: 12, title: 'טופס ביקור: שדה חתימה' } as DevCard,
      { number: 31, title: 'ייצוא מלאי' } as DevCard,
    ];
    const marks: Record<number, MarkEntry> = {
      12: { number: 12, mark: 'sprint', at: '2026-09-23T10:00:00Z' },
      31: { number: 31, mark: 'clarify', note: 'לשאול את עמיחי על העמודות', at: '2026-09-23T10:01:00Z' },
    };
    const summary = marksSummary(marks, cards);
    const text = marksText(summary, '2026-09-23');
    expect(text).toBe(
      'ישיבת פיתוח 23.9\n' +
      'לספרינט\n' +
      '· #12 טופס ביקור: שדה חתימה\n' +
      'לבירור\n' +
      '· #31 ייצוא מלאי (לשאול את עמיחי על העמודות)'
    );
  });
});

describe('private mode', () => {
  it('setMark returns the in-memory map and never throws when localStorage.setItem throws', () => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    try {
      let m: Record<number, MarkEntry> = {};
      expect(() => { m = setMark('2026-09-23', { number: 1, mark: 'sprint', at: '2026-09-23T00:00:00Z' }); }).not.toThrow();
      expect(m[1].mark).toBe('sprint');
    } finally { Storage.prototype.setItem = orig; }
  });
});

describe('D-R4 pin', () => {
  it('devMarks.ts imports nothing from devBoard.ts / ghCall', () => {
    const src = fs.readFileSync(fileURLToPath(new NodeURL('./devMarks.ts', import.meta.url)), 'utf8');
    expect(src).not.toMatch(/ghCall|devBoard/);
  });
});

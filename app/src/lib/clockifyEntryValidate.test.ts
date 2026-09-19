// Goldens for the clockify `entry` action's server-side validation (Task 29 fix round 1).
// Mirrors supabase/functions/clockify/index.ts — see clockifyEntryValidate.ts header.
import { describe, it, expect } from 'vitest';
import { validateEntryInput, ALLOWED_ENTRY_PERSONS } from './clockifyEntryValidate';

const TAGS = [{ id: 't1', name: 'a' }, { id: 't2', name: 'b' }];
const PROJECTS = [{ id: 'p1', name: 'proj' }];
const NOW = Date.parse('2026-09-19T10:00:00.000Z');

function base(overrides: Record<string, unknown> = {}) {
  return {
    start: '2026-09-19T08:00:00.000Z',
    end: '2026-09-19T09:00:00.000Z',
    description: 'note',
    tagIds: ['t1'],
    projectId: 'p1',
    billable: false,
    ...overrides,
  };
}

function opts(overrides: Record<string, unknown> = {}) {
  return { tags: TAGS, projects: PROJECTS, person: 'עידן', now: NOW, ...overrides };
}

describe('validateEntryInput', () => {
  it('accepts a well-formed entry from an allowed person', () => {
    const r = validateEntryInput(base(), opts());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.tagIds).toEqual(['t1']);
      expect(r.entry.projectId).toBe('p1');
    }
  });

  it.each(ALLOWED_ENTRY_PERSONS)('allows person=%s', (person) => {
    expect(validateEntryInput(base(), opts({ person })).ok).toBe(true);
  });

  it('rejects a person outside the allowlist (defence-in-depth, no identity claim)', () => {
    const r = validateEntryInput(base(), opts({ person: 'אביאם' }));
    expect(r).toEqual({ ok: false, error: 'forbidden_person' });
  });

  it('rejects missing/blank person', () => {
    expect(validateEntryInput(base(), opts({ person: '' }))).toEqual({ ok: false, error: 'forbidden_person' });
    expect(validateEntryInput(base(), opts({ person: undefined }))).toEqual({ ok: false, error: 'forbidden_person' });
  });

  it('rejects unparsable start/end', () => {
    expect(validateEntryInput(base({ start: 'not-a-date' }), opts())).toEqual({ ok: false, error: 'invalid_start' });
    expect(validateEntryInput(base({ end: 'nope' }), opts())).toEqual({ ok: false, error: 'invalid_end' });
    expect(validateEntryInput(base({ start: undefined }), opts())).toEqual({ ok: false, error: 'invalid_start' });
  });

  it('rejects end <= start', () => {
    const r = validateEntryInput(base({ start: '2026-09-19T09:00:00.000Z', end: '2026-09-19T09:00:00.000Z' }), opts());
    expect(r).toEqual({ ok: false, error: 'end_before_start' });
    const r2 = validateEntryInput(base({ start: '2026-09-19T09:00:00.000Z', end: '2026-09-19T08:00:00.000Z' }), opts());
    expect(r2).toEqual({ ok: false, error: 'end_before_start' });
  });

  it('rejects duration over 16h', () => {
    const r = validateEntryInput(base({ start: '2026-09-19T00:00:00.000Z', end: '2026-09-19T17:00:00.000Z' }), opts({ now: Date.parse('2026-09-19T18:00:00.000Z') }));
    expect(r).toEqual({ ok: false, error: 'duration_too_long' });
  });

  it('accepts exactly 16h duration', () => {
    const r = validateEntryInput(base({ start: '2026-09-19T00:00:00.000Z', end: '2026-09-19T16:00:00.000Z' }), opts({ now: Date.parse('2026-09-19T17:00:00.000Z') }));
    expect(r.ok).toBe(true);
  });

  it('rejects an end more than 5 minutes in the future', () => {
    const r = validateEntryInput(base({ end: '2026-09-19T10:06:00.000Z' }), opts());
    expect(r).toEqual({ ok: false, error: 'entry_in_future' });
  });

  it('allows end within the 5-minute clock-skew slack', () => {
    const r = validateEntryInput(base({ end: '2026-09-19T10:04:00.000Z' }), opts());
    expect(r.ok).toBe(true);
  });

  it('trims description and rejects over 300 chars', () => {
    const r = validateEntryInput(base({ description: '  hi  ' }), opts());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry.description).toBe('hi');
    const long = 'x'.repeat(301);
    expect(validateEntryInput(base({ description: long }), opts())).toEqual({ ok: false, error: 'description_too_long' });
  });

  it('accepts exactly 300 chars', () => {
    const exact = 'x'.repeat(300);
    expect(validateEntryInput(base({ description: exact }), opts()).ok).toBe(true);
  });

  it('rejects a tagId not in the server tag list', () => {
    const r = validateEntryInput(base({ tagIds: ['t1', 'unknown'] }), opts());
    expect(r).toEqual({ ok: false, error: 'invalid_tag' });
  });

  it('rejects a projectId not in the server project list', () => {
    const r = validateEntryInput(base({ projectId: 'unknown' }), opts());
    expect(r).toEqual({ ok: false, error: 'invalid_project' });
  });

  it('allows null/absent projectId and empty tagIds', () => {
    const r = validateEntryInput(base({ projectId: null, tagIds: [] }), opts());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.entry.projectId).toBeNull();
      expect(r.entry.tagIds).toEqual([]);
    }
  });

  it('caps tagIds at 50 entries before validating (still rejects if any unknown)', () => {
    const many = Array.from({ length: 60 }, (_, i) => 't1');
    const r = validateEntryInput(base({ tagIds: many }), opts());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entry.tagIds.length).toBe(50);
  });
});

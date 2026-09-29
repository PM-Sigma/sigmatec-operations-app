// Goldens for the error → Hebrew mapper (round 6, QA 2.3). Every code the app is known to
// raise gets its own plain-Hebrew sentence — never a raw "VALIDATION ERROR" / PostgREST code
// on screen — and an unmapped error still gets a Hebrew fallback with the raw text kept for
// the bug report.
import { describe, it, expect } from 'vitest';
import { classifyError } from './errorMessages';

describe('classifyError', () => {
  it('maps a unique-violation (23505) to a plain Hebrew sentence', () => {
    const info = classifyError({ code: '23505', message: 'duplicate key value violates unique constraint' });
    expect(info.code).toBe('23505');
    expect(info.hebrew).toMatch(/כבר קיימת/);
    expect(info.raw).toMatch(/duplicate key/);
  });

  it('maps a not-null violation (23502)', () => {
    expect(classifyError({ code: '23502', message: 'null value in column "kibbutz"' }).hebrew).toMatch(/חסר שדה חובה/);
  });

  it('maps a foreign-key violation (23503)', () => {
    expect(classifyError({ code: '23503' }).hebrew).toMatch(/רשומה שכבר לא קיימת/);
  });

  it('maps invalid text representation (22P02) — the literal "VALIDATION ERROR" case', () => {
    const info = classifyError(new Error('invalid input syntax for type numeric: "VALIDATION ERROR" (22P02)'));
    expect(info.code).toBe('22P02');
    expect(info.hebrew).toMatch(/לא בפורמט הנכון/);
    expect(info.hebrew).not.toMatch(/VALIDATION ERROR/);
  });

  it('maps a permission-denied RLS failure (42501)', () => {
    expect(classifyError({ code: '42501' }).hebrew).toMatch(/אין לך הרשאה/);
  });

  it('maps a bare 401/403 status to a re-login / permission message', () => {
    expect(classifyError({ status: 401 }).hebrew).toMatch(/ההתחברות פגה/);
    expect(classifyError({ status: 403 }).hebrew).toMatch(/אין לך הרשאה/);
  });

  it('maps a network failure', () => {
    const info = classifyError(new TypeError('Failed to fetch'));
    expect(info.code).toBe('network');
    expect(info.hebrew).toMatch(/אין חיבור לאינטרנט/);
  });

  it('maps a timeout', () => {
    const e = new Error('תם הזמן. נסה שוב'); e.name = 'TimeoutError';
    const info = classifyError(e);
    expect(info.code).toBe('timeout');
    expect(info.hebrew).toBe('תם הזמן. נסה שוב');
  });

  it('keeps an already-Hebrew server message as-is instead of overwriting it', () => {
    const info = classifyError(new Error('אין מונים פנויים לשיבוץ'));
    expect(info.hebrew).toBe('אין מונים פנויים לשיבוץ');
  });

  it('falls back to one generic Hebrew sentence for an unmapped English error, keeping raw for the report', () => {
    const info = classifyError(new Error('unexpected token in JSON'));
    expect(info.hebrew).toMatch(/הפעולה נכשלה/);
    expect(info.hebrew).not.toMatch(/unexpected token/);
    expect(info.raw).toMatch(/unexpected token/);
  });

  it('never returns an empty hebrew message for a nullish/empty error', () => {
    expect(classifyError(undefined).hebrew).toMatch(/הפעולה נכשלה/);
    expect(classifyError('').hebrew).toMatch(/הפעולה נכשלה/);
  });
});

import { userMessage, errorRef } from './errorMessages';

describe('classifyError — HTTP/EMS codes (Q7-A 3)', () => {
  it('maps the EMS "(422) …" throw to a report-to-Idan message, never raw', () => {
    const info = classifyError(new Error('(422) The selected priority is invalid'));
    expect(info.code).toBe('422');
    expect(info.action).toBe('report');
    const msg = userMessage(info);
    expect(msg).toMatch(/אל תחזרו על הפעולה, דווחו לעידן/);
    expect(msg).toContain('E422');
    expect(msg).not.toMatch(/priority is invalid/);
  });
  it.each(['400', '422', 'P0002', '42501', '403'])('%s = report (do not repeat)', c => {
    expect(classifyError({ code: c }).action).toBe('report');
  });
  it.each([['429'], ['500'], ['503'], ['504'], ['599']])('%s = retry', c => {
    const info = classifyError({ status: Number(c) });
    expect(info.action).toBe('retry');
    expect(userMessage(info)).not.toMatch(/דווחו לעידן/);
  });
  it.each(['401', '404', '409', '23505', '23503'])('%s = fix (refresh / change, then retry)', c => {
    expect(classifyError({ code: c }).action).toBe('fix');
  });
  it('network and timeout are retry', () => {
    expect(classifyError(new TypeError('Failed to fetch')).action).toBe('retry');
    const e = new Error('x'); e.name = 'TimeoutError';
    expect(classifyError(e).action).toBe('retry');
  });
  it('technical detail is appended for עידן only', () => {
    const info = classifyError(new Error('(422) priority invalid'));
    expect(userMessage(info, false)).not.toMatch(/priority invalid/);
    expect(userMessage(info, true)).toMatch(/priority invalid/);
  });
  it('errorRef is a short E-code', () => {
    expect(errorRef(classifyError({ code: '23505' }))).toBe('E23505');
    expect(errorRef(classifyError(new TypeError('Failed to fetch')))).toBe('Enetwork');
  });
});

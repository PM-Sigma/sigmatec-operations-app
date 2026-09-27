// @vitest-environment jsdom
// Round 6, QA 2.3: every write goes through `runMutation`/`toastFailure` (the ONE mutation
// path), so this is where "no more raw VALIDATION ERROR toasts" + "every toast offers דווח
// כבאג" is proven once instead of per island.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const errorCalls: any[] = [];
const promiseCalls: any[] = [];
vi.mock('sonner', () => ({
  toast: Object.assign(
    (msg: string, opts?: any) => { errorCalls.push({ kind: 'plain', msg, opts }); },
    {
      error: (msg: string, opts?: any) => { errorCalls.push({ kind: 'error', msg, opts }); },
      promise: (p: Promise<any>, opts: any) => { promiseCalls.push(opts); return p.catch(() => {}); },
    },
  ),
}));

import { toastFailure, runMutation, REPORT_BUG_LABEL, RETRY_LABEL } from './pending';
import { FEEDBACK_OPEN_EVENT } from './feedback';

beforeEach(() => { errorCalls.length = 0; promiseCalls.length = 0; });

describe('toastFailure', () => {
  it('never shows a raw PostgREST code — a 22P02 becomes the mapped Hebrew sentence', () => {
    toastFailure(new Error('invalid input syntax for type numeric: "VALIDATION ERROR" (22P02)'));
    expect(errorCalls).toHaveLength(1);
    expect(errorCalls[0].msg).not.toMatch(/VALIDATION ERROR/);
    expect(errorCalls[0].msg).toMatch(/לא בפורמט הנכון/);
  });

  it('always offers "דווח כבאג", even with no retry', () => {
    toastFailure(new Error('boom'));
    expect(errorCalls[0].opts.action.label).toBe(REPORT_BUG_LABEL);
    expect(errorCalls[0].opts.cancel).toBeUndefined();
  });

  it('offers retry as the cancel-slot button alongside the report action', () => {
    const retry = vi.fn();
    toastFailure(new Error('boom'), retry);
    expect(errorCalls[0].opts.cancel.label).toBe(RETRY_LABEL);
    errorCalls[0].opts.cancel.onClick();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('the report action dispatches FEEDBACK_OPEN_EVENT prefilled as a bug, with page/action/timestamp/version and no secrets', () => {
    const events: CustomEvent[] = [];
    const onOpen = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    try {
      toastFailure({ code: '42501', message: 'permission denied for table kibbutzim' }, undefined, 'נכשל', 'שמירת ביקור');
      errorCalls[0].opts.action.onClick();
      expect(events).toHaveLength(1);
      const detail = events[0].detail as { kind: string; text: string };
      expect(detail.kind).toBe('bug');
      expect(detail.text).toMatch(/אין לך הרשאה/);       // the mapped Hebrew message
      expect(detail.text).toMatch(/42501/);                // the raw code
      expect(detail.text).toMatch(/שמירת ביקור/);          // the action
      expect(detail.text).not.toMatch(/Bearer |token|apikey/i);
    } finally {
      window.removeEventListener(FEEDBACK_OPEN_EVENT, onOpen);
    }
  });
});

describe('runMutation', () => {
  it('maps the failure through the same Hebrew mapper and always attaches the report action', async () => {
    const p = Promise.reject({ code: '23505', message: 'duplicate key' });
    runMutation(p, { loading: 'שומר…', success: 'נשמר' });
    await new Promise(r => setTimeout(r, 0));
    expect(promiseCalls).toHaveLength(1);
    const built = promiseCalls[0].error({ code: '23505', message: 'duplicate key' });
    expect(built.message).toMatch(/כבר קיימת/);
    expect(built.action.label).toBe(REPORT_BUG_LABEL);
  });

  it('offers retry as cancel when the caller supplied one', async () => {
    const retry = vi.fn();
    const p = Promise.reject(new Error('boom'));
    runMutation(p, { loading: 'שומר…', success: 'נשמר', retry });
    await new Promise(r => setTimeout(r, 0));
    const built = promiseCalls[0].error(new Error('boom'));
    expect(built.cancel.label).toBe(RETRY_LABEL);
  });
});

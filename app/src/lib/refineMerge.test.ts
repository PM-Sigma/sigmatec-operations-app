// Task 6b, spec §7i: the refine merge rule for the "fast + refine" voice flow.
// untouched → replace (chip shown); edited or sent → discard (chip never shown).
import { describe, it, expect } from 'vitest';
import { refineMerge } from './feedback';

describe('refineMerge', () => {
  it('replaces the text and shows the chip when the field is untouched', () => {
    const r = refineMerge({ fieldState: 'untouched', text: 'טקסט מהיר' }, 'טקסט מתוקן');
    expect(r).toEqual({ text: 'טקסט מתוקן', chip: true });
  });

  it('discards the refinement when the user edited the field', () => {
    const r = refineMerge({ fieldState: 'edited', text: 'מה שהמשתמש כתב' }, 'טקסט מתוקן');
    expect(r).toEqual({ text: 'מה שהמשתמש כתב', chip: false });
  });

  it('discards the refinement when the field was already sent', () => {
    const r = refineMerge({ fieldState: 'sent', text: 'נשלח כבר' }, 'טקסט מתוקן');
    expect(r).toEqual({ text: 'נשלח כבר', chip: false });
  });

  it('is a no-op replacement when the refined text equals the fast text', () => {
    const r = refineMerge({ fieldState: 'untouched', text: 'זהה' }, 'זהה');
    expect(r).toEqual({ text: 'זהה', chip: true });   // still "refined": the server said so
  });
});

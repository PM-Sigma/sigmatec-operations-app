import { describe, expect, it } from 'vitest';
import { promptCopy } from './pushPrompt';

describe('promptCopy (round 5, L6)', () => {
  it('prompt copy per mode, calm and without "!"', () => {
    for (const m of ['default', 'denied'] as const) {
      const c = promptCopy(m);
      expect(`${c.title} ${c.body} ${c.primary} ${c.secondary}`).not.toMatch(/!|\p{Extended_Pictographic}/u);
    }
    expect(promptCopy('default').primary).toBe('הפעלת התראות');
    expect(promptCopy('denied').primary).toBe('רענון');
  });
});

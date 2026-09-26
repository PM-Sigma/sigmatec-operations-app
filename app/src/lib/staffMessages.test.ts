import { describe, expect, it } from 'vitest';
import { MESSAGE_MAX, recipientsFor, unreadTitle, validateMessage } from './staffMessages';

describe('staff messages (round 5, L4)', () => {
  it('recipients exclude me and the viewer', () => {
    const r = recipientsFor('עידן');
    expect(r).not.toContain('עידן');
    expect(r).not.toContain('צפייה');
    expect(r).toContain('אביאם');
  });

  it('validation', () => {
    expect(validateMessage('', '')).toEqual(['יש לבחור נמען', 'ההודעה ריקה']);
    expect(validateMessage('אביאם', 'x'.repeat(MESSAGE_MAX + 1))).toEqual(['ההודעה ארוכה מ-500 תווים']);
    expect(validateMessage('אביאם', 'שלום')).toEqual([]);
  });

  it('title', () => {
    expect(unreadTitle(1)).toBe('הודעה חדשה אחת');
    expect(unreadTitle(2)).toBe('2 הודעות חדשות');
  });
});

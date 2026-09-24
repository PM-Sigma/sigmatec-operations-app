import { describe, expect, it } from 'vitest';
import { contactChoices } from './visitContacts';

describe('contactChoices', () => {
  it('chips are the kibbutz contacts, deduped and trimmed', () =>
    expect(contactChoices([' רוני ', 'דנה', 'רוני'], '').chips).toEqual(['רוני', 'דנה']));
  it('typed text that matches a chip is not new', () => expect(contactChoices(['רוני'], ' רוני ').isNew).toBe(false));
  it('a new name is new', () => expect(contactChoices(['רוני'], 'אבי').isNew).toBe(true));
  it('empty typed text is not new', () => expect(contactChoices(['רוני'], '  ').isNew).toBe(false));
});

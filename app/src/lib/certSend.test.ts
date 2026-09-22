import { describe, expect, it } from 'vitest';
import { certMailto, certSendPlan, isEmail, waNumber } from './certSend';

const ROWS = [
  { name: 'יוסי', role: 'site_manager', email: 'yossi@kibbutz.co.il', phone: '050-123-4567', active: true },
  { name: 'רונית', role: 'operations_manager', email: '', phone: '0521234567', active: true },
  { name: 'ותיק', role: 'site_manager', email: 'old@kibbutz.co.il', phone: null, active: false },
  { name: 'בלי כלום', role: null, email: null, phone: null },
];

describe('isEmail', () => {
  it('accepts what people actually have', () => {
    expect(isEmail('yossi@kibbutz.co.il')).toBe(true);
    expect(isEmail('  a@b.co  ')).toBe(true);
  });
  it('rejects the empties and the half-typed', () => {
    for (const v of ['', null, undefined, 'yossi', 'yossi@', '@kibbutz.co.il', 'a b@c.co']) {
      expect(isEmail(v as unknown), String(v)).toBe(false);
    }
  });
});

describe('waNumber', () => {
  it('keeps digits only and refuses anything too short to dial', () => {
    expect(waNumber('050-123-4567')).toBe('0501234567');
    expect(waNumber('+972 52 123 4567')).toBe('972521234567');
    expect(waNumber('1234')).toBe('');
    expect(waNumber(null)).toBe('');
  });
});

describe('certSendPlan', () => {
  it('emails only the active contacts that have one, and ticks all of them', () => {
    const p = certSendPlan(ROWS);
    expect(p.emailable.map(c => c.name)).toEqual(['יוסי']);
    expect(p.selected).toEqual(['yossi@kibbutz.co.il']);
    expect(p.canEmail).toBe(true);
    expect(p.needsContact).toBe(false);
  });

  it('an inactive contact is never emailed, whatever address it carries', () => {
    expect(certSendPlan(ROWS).selected).not.toContain('old@kibbutz.co.il');
  });

  it('a missing active flag means active — legacy rows predate the column', () => {
    const p = certSendPlan([{ name: 'ותיק', email: 'v@k.co.il' }]);
    expect(p.canEmail).toBe(true);
  });

  it('WhatsApp is per row and independent of the email', () => {
    expect(certSendPlan(ROWS).whatsapp.map(c => c.name)).toEqual(['יוסי', 'רונית']);
  });

  it('nobody to email → the panel must offer to add a contact, not a warning', () => {
    for (const rows of [[], null, undefined, [{ name: 'רונית', phone: '0521234567' }]]) {
      const p = certSendPlan(rows as never);
      expect(p.needsContact, JSON.stringify(rows)).toBe(true);
      expect(p.canEmail).toBe(false);
      expect(p.selected).toEqual([]);
    }
  });
});

describe('certMailto', () => {
  it('joins the recipients and encodes subject and body', () => {
    const url = certMailto(['a@b.co', 'c@d.co'], 'תעודת משלוח 120', 'שלום, מצורפת תעודה');
    expect(url.startsWith('mailto:a@b.co,c@d.co?')).toBe(true);
    expect(url).toContain('subject=' + encodeURIComponent('תעודת משלוח 120'));
    expect(url).toContain('body=' + encodeURIComponent('שלום, מצורפת תעודה'));
  });

  it('drops anything that is not an address, so a half-typed row cannot poison the link', () => {
    expect(certMailto(['a@b.co', 'nope', ''], 's', 'b').startsWith('mailto:a@b.co?')).toBe(true);
  });
});

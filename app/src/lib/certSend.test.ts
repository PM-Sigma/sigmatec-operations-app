import { describe, expect, it } from 'vitest';
import { canvasPoint, certMailto, certRoleLabel, certSendPlan, isEmail, waLink, waNumber } from './certSend';
import { certSentLabel } from './certDoc';

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

describe('waLink / certRoleLabel / canvasPoint / certSentLabel', () => {
  it('waLink turns a local number into wa.me/972…, empty when not dialable', () => {
    expect(waLink('050-123-4567')).toBe('https://wa.me/972501234567');
    expect(waLink('+972 52 123 4567', 'hi')).toBe('https://wa.me/972521234567?text=hi');
    expect(waLink('12')).toBe('');
  });
  it('roles read in Hebrew, unknown roles pass through', () => {
    expect(certRoleLabel('site_manager')).toBe('מנהל אתר');
    expect(certRoleLabel('operations_manager')).toBe('מנהל תפעול');
    expect(certRoleLabel('חשב')).toBe('חשב');
    expect(certRoleLabel(null)).toBe('');
  });
  it('canvasPoint scales by bitmap/displayed size (phone: 600px bitmap shown 300px wide, whatever the DPR)', () => {
    const rect = { x: 10, y: 100, width: 300, height: 110 };
    expect(canvasPoint(160, 155, rect, 600, 220)).toEqual({ x: 300, y: 110 });
    expect(canvasPoint(10, 100, rect, 600, 220)).toEqual({ x: 0, y: 0 });
    expect(canvasPoint(5, 5, { x: 0, y: 0, width: 0, height: 0 }, 600, 220)).toEqual({ x: 5, y: 5 });
  });
  it('certSentLabel: sent / not sent / column missing', () => {
    expect(certSentLabel({ sent_at: '2026-11-23T10:00:00Z' })).toBe('נשלחה ✓ 23/11/2026');
    expect(certSentLabel({ sent_at: null })).toBe('לא נשלחה');
    expect(certSentLabel({})).toBeNull();
  });
});

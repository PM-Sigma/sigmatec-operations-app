// 📤 שליחת תעודת משלוח — the DECISION behind the send panel (QA round 2, Package C item 7).
//
// The panel itself is legacy vanilla (js/src/20-delivery-cert.js `certSendOpen`, which Package E
// calls too). What is pure here is the only part with a rule in it: given the site's contacts,
// who can actually be emailed, who is ticked when the panel opens, whether the person has to
// add a contact before anything can be sent at all, and who can be reached on WhatsApp.
//
// Why it matters: round 1 shipped a panel that said "אין אנשי קשר שמורים לאתר הזה" and left the
// technician holding an issued certificate with nowhere to send it. The rule below is what turns
// that dead end into the inline "add a contact" form.
//
// Keep this module import-free. The legacy mirror is `certSendPlan()` in 20-delivery-cert.js;
// test-delivery-cert.mjs holds the two in lockstep.

export interface CertContact {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  active?: boolean | null;
}

export interface CertSendPlan {
  /** Active contacts with a usable email, in the order given. */
  emailable: CertContact[];
  /** The emails ticked when the panel opens — all of them, because sending to one is the odd case. */
  selected: string[];
  /** Is 📧 מייל offered at all? */
  canEmail: boolean;
  /** Nobody to email → the panel opens its inline "הוסף איש קשר" form instead of a warning. */
  needsContact: boolean;
  /** Active contacts with a phone — 💬 is a per-row link, never a bulk action. */
  whatsapp: CertContact[];
}

/** Deliberately permissive: `a@b.c`. A stricter pattern rejects real addresses, which is worse. */
export function isEmail(s: unknown): boolean {
  const v = String(s ?? '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

/** Digits only — what `wa.me/` wants. Empty when there is nothing dialable. */
export function waNumber(phone: unknown): string {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d : '';
}

/** A row counts only when it was not explicitly deactivated (a missing flag means active). */
const isActive = (c: CertContact): boolean => c?.active !== false;

/** Who can be sent to, and what the panel must show. */
export function certSendPlan(contacts: ReadonlyArray<CertContact> | null | undefined): CertSendPlan {
  const rows = (contacts || []).filter(c => !!c && isActive(c));
  const emailable = rows.filter(c => isEmail(c.email));
  const selected = emailable.map(c => String(c.email).trim());
  const whatsapp = rows.filter(c => !!waNumber(c.phone));
  return {
    emailable,
    selected,
    canEmail: emailable.length > 0,
    needsContact: emailable.length === 0,
    whatsapp,
  };
}

/** The `mailto:` the panel opens. Kept here so the goldens can assert the encoding. */
export function certMailto(to: ReadonlyArray<string>, subject: string, body: string): string {
  const list = (to || []).map(t => String(t || '').trim()).filter(isEmail);
  return 'mailto:' + list.join(',') +
    '?subject=' + encodeURIComponent(String(subject || '')) +
    '&body=' + encodeURIComponent(String(body || ''));
}

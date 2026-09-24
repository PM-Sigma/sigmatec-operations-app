// The printed delivery certificate + the periodic range report (package I, task L5) — ported
// 1:1 from js/src/20-delivery-cert.js (certDocHtml, certRangeReportRange's report body,
// certSetRange, certGroupName, certSendPlan's neighbours). certDocHtml is BYTE-IDENTICAL to the
// legacy output apart from two parameterizations (opts.logo instead of the CERT_LOGO global,
// opts.year instead of `new Date().getFullYear()`) — the printed record a customer already
// signed must never change shape.
import { productLabel, type ProductLike } from './productLabel';

export const CERT_COMPANY = {
  name: 'סיגמאטק התייעלות אנרגטית בע"מ',
  sub: 'מיקרוגריד - מערכות מניית חשמל',
  reg: 'עוסק מורשה/ח.פ.: 515923084',
  address: 'עמק איילון 30, גבעת זאב 9093030, ישראל',
  email: 'office@sigmatec-energy.com',
  web: 'www.sigmatec-energy.com',
};

export const certEsc = (s: unknown): string =>
  String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const certFmtDate = (ymd: string | null | undefined): string => {
  if (!ymd) return '—';
  const d = new Date(ymd + 'T12:00:00');
  return isNaN(d.getTime()) ? certEsc(ymd) : d.toLocaleDateString('he-IL');
};

export interface CertCustomer { name: string; company_id?: string; address?: string; contact?: string }
export interface CertItem { name: string; qty: number }
export interface CertLike {
  number?: number | string | null; date?: string; kibbutz?: string; customer: CertCustomer; items: CertItem[];
  notes?: string; source?: string; refId?: string; recipient?: string; signature?: string;
  cancelled?: boolean; replacedBy?: number | string;
}
export interface CertDocOpts { screen?: boolean; logo: string; year?: number }

/** certDocHtml: the printed document. ONE generator for the print window, the in-app overlay,
 * and the public `?cert=` view — preview ≡ output by construction. */
export function certDocHtml(cert: CertLike, opts: CertDocOpts): string {
  const num = cert.number ? String(cert.number) : 'טיוטה';
  const rows = cert.items.map(i => `<tr><td>${certEsc(i.name)}</td><td class="qty">${i.qty}</td></tr>`).join('');
  const totalQty = cert.items.reduce((s, i) => s + i.qty, 0);
  const c = cert.customer;
  return `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>תעודת משלוח ${certEsc(num)}: ${certEsc(c.name)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body { font-family: 'Assistant','Segoe UI',Arial,sans-serif; color: #1b2a4a; width: 210mm; height: 296mm; padding: 14mm 14mm 30mm; position: relative; overflow: hidden; }
  .bg { position: absolute; inset: 0; overflow: hidden; z-index: 0; }
  .circ { position: absolute; border-radius: 50%; }
  .ring { position: absolute; border-radius: 50%; background: none !important; }
  .strip { position: absolute; left: 0; right: 0; background: linear-gradient(90deg, #175860 0%, #3fb4c4 45%, #a9c938 100%); }
  .grad { background: linear-gradient(135deg, #2fb0c9 0%, #7fc93e 100%); }
  .content { position: relative; z-index: 1; }
  .logo { display: block; margin: 0 auto 4mm; width: 62mm; }
  h1 { font-size: 24px; margin: 8mm 0 1mm; }
  .computed { font-size: 11px; color: #64748b; margin-bottom: 8mm; }
  .blocks { display: flex; justify-content: space-between; gap: 10mm; font-size: 12.5px; line-height: 1.8; }
  .blocks b { font-size: 13.5px; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 10mm; font-size: 13px; }
  table.items th { text-align: right; border-top: 2px solid #1b2a4a; border-bottom: 2px solid #1b2a4a; padding: 6px 4px; }
  table.items td { padding: 8px 4px; border-bottom: 1px solid #e2e8f0; }
  table.items .qty { width: 70px; text-align: center; }
  .total { display: inline-block; margin-top: 6mm; background: #8fbe3f; color: #fff; font-weight: 700; font-size: 13px; padding: 6px 16px; border-radius: 2px; }
  .notes { margin-top: 10mm; font-size: 12.5px; }
  .notes b { display: block; margin-bottom: 1mm; }
  .sig { position: absolute; bottom: 22mm; right: 14mm; left: 14mm; font-size: 13px; display: flex; gap: 18mm; }
  .sig span { border-bottom: 1px solid #1b2a4a; min-width: 45mm; display: inline-block; padding: 0 2mm 2px; }
  .foot { position: absolute; bottom: 8mm; right: 14mm; left: 14mm; font-size: 9.5px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 2mm; display: flex; justify-content: space-between; }
</style></head><body>
  <div class="bg">
    <div class="strip" style="top:0;height:3.5mm;"></div>
    <div class="strip" style="bottom:0;height:2mm;"></div>
    <div class="ring" style="width:34mm;height:34mm;border:1.4mm solid #a9c938;top:9mm;left:7mm;opacity:.55;"></div>
    <div class="circ grad" style="width:19mm;height:19mm;top:17mm;left:22mm;opacity:.92;"></div>
    <div class="circ" style="width:6.5mm;height:6.5mm;background:#175860;top:37mm;left:15mm;"></div>
    <div class="ring" style="width:11mm;height:11mm;border:1mm solid #3fb4c4;top:11mm;right:10mm;opacity:.5;"></div>
    <div class="circ grad" style="width:8mm;height:8mm;bottom:16mm;left:10mm;opacity:.8;"></div>
    <div class="ring" style="width:5.5mm;height:5.5mm;border:.8mm solid #a9c938;bottom:23mm;left:21mm;opacity:.7;"></div>
  </div>
  ${cert.cancelled ? '<div style="position:absolute;top:38%;left:0;right:0;text-align:center;transform:rotate(-16deg);font-size:58px;font-weight:900;color:rgba(220,38,38,.30);z-index:3;letter-spacing:10px;">מבוטלת</div>' : ''}
  <div class="content">
    <img class="logo" src="${opts.logo}" alt="Sigmatec">
    <h1>תעודת משלוח ${certEsc(num)}</h1>
    <div class="computed">מסמך ממוחשב${cert.number ? '' : ': טיוטה (ללא מספר)'}${cert.cancelled ? ' · <b style="color:#dc2626;">תעודה מבוטלת' + (cert.replacedBy ? ', הוחלפה בתעודה מס\' ' + certEsc(cert.replacedBy) : '') + '</b>' : ''}</div>
    <div class="blocks">
      <div>
        שם הלקוח: <b>${certEsc(c.name)}</b><br>
        ${c.company_id ? 'ת.ז./ע.מ.: ' + certEsc(c.company_id) + '<br>' : ''}
        ${c.address ? 'כתובת: ' + certEsc(c.address) + '<br>' : ''}
        ${c.contact ? 'איש קשר: ' + certEsc(c.contact) + '<br>' : ''}
        תאריך: ${certFmtDate(cert.date)}
      </div>
      <div style="text-align:left;">
        <b>${certEsc(CERT_COMPANY.name)}</b><br>
        ${certEsc(CERT_COMPANY.sub)}<br>
        ${certEsc(CERT_COMPANY.reg)}<br>
        כתובת: ${certEsc(CERT_COMPANY.address)}<br>
        דוא"ל: ${certEsc(CERT_COMPANY.email)}<br>
        אתר: ${certEsc(CERT_COMPANY.web)}
      </div>
    </div>
    <table class="items">
      <thead><tr><th>פירוט</th><th class="qty">כמות</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="total">סה"כ פריטים: ${totalQty}</div>
    ${cert.notes ? '<div class="notes"><b>הערות</b>' + certEsc(cert.notes).replace(/\n/g, '<br>') + '</div>' : ''}
  </div>
  <div class="sig">
    <div>שם המקבל: ${cert.recipient ? '<b>' + certEsc(cert.recipient) + '</b>' : '<span>&nbsp;</span>'}</div>
    <div>חתימה: ${(cert.signature && /^data:image\//.test(cert.signature)) ? '<span style="border-bottom:1px solid #1b2a4a;"><img src="' + cert.signature + '" style="height:15mm;vertical-align:bottom;"></span>' : '<span>&nbsp;</span>'}</div>
  </div>
  <div class="foot">
    <span>תעודת משלוח ${certEsc(num)} · הופקה באפליקציית התפעול של סיגמאטק${cert.refId ? ' · ' + certEsc(cert.source) + ':' + certEsc(cert.refId) : ''}</span>
    <span>© ${opts.year ?? new Date().getFullYear()} ${certEsc(CERT_COMPANY.name)}</span>
  </div>
  ${(opts && opts.screen)
    ? '<button class="print-fab" onclick="window.print()" style="position:fixed;bottom:18px;left:18px;z-index:9;background:#1b2a4a;color:#fff;border:none;border-radius:12px;padding:14px 20px;font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);">🖨️ הדפס / שמור PDF</button><style>@media print { .print-fab { display:none; } }</style>'
    : '<scr' + 'ipt>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</scr' + 'ipt>'}
</body></html>`;
}

// ───────────────────────────── cert lifecycle rules ─────────────────────────────

const CERT_VIEW_BASE = 'https://pm-sigma.github.io/sigmatec-operations-app/';
export const certViewUrl = (id: string): string => CERT_VIEW_BASE + '?cert=' + encodeURIComponent(id);

export interface CertRow extends CertLike {
  id: string; cert_number: number; status?: string; cert_date?: string;
  created_by?: string; replaced_by?: number;
}

export const certShareText = (c: CertRow): string =>
  'שלום, מצורפת תעודת משלוח מס\' ' + c.cert_number + ' מסיגמאטק עבור ' + (c.customer?.name || c.kibbutz) +
  ' מתאריך ' + certFmtDate(c.cert_date) + '.\nלצפייה והדפסה: ' + certViewUrl(c.id);

export const CERT_SOURCE_LABEL: Record<string, string> = { visit: '📍 ביקור', order: '🧾 הזמנה', ems: '🔧 משימת EMS', manual: '✍️ ידני' };

/** certRange: the range-chip date math (certSetRange). "all" is an explicit wide window — the
 * caller (invRenderCerts) defaults an EMPTY from/to to the current month instead. */
export function certRange(range: 'all' | 'thisMonth' | 'lastMonth' | 'last7' | 'last30', todayYmd: string): { from: string; to: string } {
  const today = new Date(todayYmd + 'T12:00:00');
  const fmt = (d: Date) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (range === 'thisMonth') return { from: fmt(new Date(today.getFullYear(), today.getMonth(), 1)), to: fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)) };
  if (range === 'lastMonth') return { from: fmt(new Date(today.getFullYear(), today.getMonth() - 1, 1)), to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)) };
  if (range === 'last7') { const start = new Date(today); start.setDate(start.getDate() - 6); return { from: fmt(start), to: fmt(today) }; }
  if (range === 'last30') { const start = new Date(today); start.setDate(start.getDate() - 29); return { from: fmt(start), to: fmt(today) }; }
  return { from: '2000-01-01', to: '2099-01-01' };
}

/** certSearch: the registry's free-text filter over kibbutz / customer name / cert number. */
export function certSearch<T extends { kibbutz?: string; customer?: { name?: string }; cert_number: number }>(rows: T[], q: string): T[] {
  const query = q.trim();
  if (!query) return rows;
  return rows.filter(c => (c.kibbutz || '').includes(query) || (c.customer?.name || '').includes(query) || String(c.cert_number).includes(query));
}

export const certGroupName = (c: { customer?: { name?: string }; kibbutz?: string }): string => c.customer?.name || c.kibbutz || '';

export interface CertRangeGroup { name: string; certs: CertRow[]; totals: Array<[string, number]> }

/** certRangeGroups: grouped by customer/kibbutz name, he-sorted; totals EXCLUDE cancelled certs
 * (they stay listed, struck through, never counted — C24). */
export function certRangeGroups(certs: ReadonlyArray<CertRow>, label: (name: string) => string): CertRangeGroup[] {
  const byK = new Map<string, CertRow[]>();
  for (const c of certs) { const k = certGroupName(c) || '—'; (byK.get(k) || byK.set(k, []).get(k)!).push(c); }
  return [...byK.keys()].sort((a, b) => a.localeCompare(b, 'he')).map(name => {
    const list = byK.get(name)!;
    const totals: Record<string, number> = {};
    for (const cr of list) if (cr.status !== 'cancelled') for (const i of cr.items) totals[i.name] = (totals[i.name] || 0) + (parseInt(String(i.qty), 10) || 0);
    return {
      name, certs: list,
      totals: Object.keys(totals).sort((a, b) => a.localeCompare(b, 'he')).map(n => [label(n), totals[n]] as [string, number]),
    };
  });
}

export interface CertRangeReportOpts { logo: string; label: (name: string) => string; now: string }

/** certRangeReportHtml (C24): the accounting range report — grouped by kibbutz/customer, a
 * table of certs (cancelled ones struck through, never dropped) plus a per-item total table.
 * The window handling (open/write/print) stays with the caller (popup-blocker rule); this only
 * builds the document string. */
export function certRangeReportHtml(certs: ReadonlyArray<CertRow>, from: string, to: string, opts: CertRangeReportOpts): string {
  const groups = certRangeGroups(certs, opts.label);
  const groupsHtml = groups.map(g => {
    const rows = g.certs.map(cr => {
      const cancelled = cr.status === 'cancelled';
      return `<tr${cancelled ? ' style="opacity:.55;text-decoration:line-through;"' : ''}>
        <td>${cr.cert_number}${cancelled ? ' 🚫' + (cr.replaced_by ? '→' + cr.replaced_by : '') : ''}</td><td>${certFmtDate(cr.cert_date)}</td>
        <td>${(cr.items || []).map(i => certEsc(opts.label(i.name)) + ' ×' + i.qty).join('<br>')}</td>
        <td>${certEsc(cr.created_by)}</td><td>${certEsc(cr.notes)}</td></tr>`;
    }).join('');
    const totalRows = g.totals.map(([label, qty]) => `<tr><td>${certEsc(label)}</td><td class="c">${qty}</td></tr>`).join('');
    return `<h2>${certEsc(g.name)} <small>(${g.certs.length} תעודות)</small></h2>
        <table><thead><tr><th>מס' תעודה</th><th>תאריך</th><th>פריטים</th><th>הופק ע"י</th><th>הערות</th></tr></thead><tbody>${rows}</tbody></table>
        <table class="tot"><thead><tr><th>סה"כ לפי פריט</th><th class="c">כמות</th></tr></thead><tbody>${totalRows}</tbody></table>`;
  }).join('');
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=swap" rel="stylesheet">
<title>דוח תעודות משלוח ${from} — ${to}</title>
<style>
  body { font-family:'Assistant','Segoe UI',Arial,sans-serif; color:#1b2a4a; padding:14mm; font-size:12.5px; }
  h1 { font-size:20px; margin-bottom:2mm; } .sub { color:#64748b; font-size:11px; margin-bottom:8mm; }
  h2 { font-size:15px; border-bottom:2px solid #a9c938; padding-bottom:2px; margin:8mm 0 3mm; }
  h2 small { color:#64748b; font-weight:400; font-size:11px; }
  table { width:100%; border-collapse:collapse; margin-bottom:4mm; }
  th { text-align:right; background:#f1f5f9; padding:5px 6px; border-bottom:2px solid #1b2a4a; font-size:11.5px; }
  td { padding:5px 6px; border-bottom:1px solid #e2e8f0; vertical-align:top; }
  .tot { width:60%; } .c { text-align:center; width:60px; }
  img.logo { width:40mm; float:left; }
</style></head><body>
<img class="logo" src="${opts.logo}">
<h1>דוח תעודות משלוח לפי קיבוץ</h1>
<div class="sub">טווח: ${certFmtDate(from)} — ${certFmtDate(to)} · ${certs.length} תעודות · הופק ${opts.now}</div>
${groupsHtml || '<div style="color:#94a3b8;">אין תעודות בטווח הזה</div>'}
<scr` + `ipt>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</scr` + `ipt>
</body></html>`;
}

/** certItemsForView (C11): a viewer sees display names in the in-app VIEW only — print/reissue
 * keep the technical name (what the recipient actually signed for). */
export function certItemsForView(items: ReadonlyArray<CertItem>, isViewer: boolean, map: Record<string, ProductLike>): CertItem[] {
  if (!isViewer) return items.slice();
  return items.map(i => ({ name: productLabel(map[i.name] || i.name, { forReport: true }), qty: i.qty }));
}

/** certIssueErrors (C5): viewer blocked; items required; customer name required. */
export function certIssueErrors(draft: { items: CertItem[]; customer: { name?: string } }, isViewer: boolean): string[] {
  if (isViewer) return ['משתמש צפייה לא מפיק תעודות.'];
  const errors: string[] = [];
  if (!draft.items.length) errors.push('אין פריטים בתעודה. צריך לפחות פריט אחד.');
  if (!draft.customer?.name) errors.push('חסר שם לקוח.');
  return errors;
}

export interface CertPrefillPre {
  kibbutz?: string; date?: string; contact?: string; items?: CertItem[]; notes?: string;
  source?: string; refId?: string; noPrint?: boolean; customer?: CertCustomer; reissueOf?: { id: string; certNumber: number };
}
export interface KibbutzDetailsRow { legal_name?: string; company_id?: string; address?: string; contact?: string }
export interface CertPrefillResult {
  customer: CertCustomer; date: string; items: CertItem[]; notes: string; kibbutz: string; source: string; refId: string; noPrint: boolean; reissueOf?: { id: string; certNumber: number };
}

/** certPrefill (C2): openDeliveryCert's field-population rule. */
export function certPrefill(pre: CertPrefillPre, details: KibbutzDetailsRow | undefined, todayYmd: string): CertPrefillResult {
  const det = pre.customer
    ? { legal_name: pre.customer.name, company_id: pre.customer.company_id, address: pre.customer.address, contact: pre.customer.contact }
    : (details || {});
  const items = (pre.items || []).filter(i => i && i.name);
  return {
    customer: {
      name: det.legal_name || pre.kibbutz || '',
      company_id: det.company_id || '',
      address: det.address || pre.kibbutz || '',
      contact: pre.contact || det.contact || '',
    },
    date: pre.date || todayYmd,
    items: items.length ? items : [{ name: '', qty: 1 }],
    notes: pre.notes || '',
    kibbutz: pre.kibbutz || '',
    source: pre.source || 'manual',
    refId: pre.refId || '',
    noPrint: !!pre.noPrint,
    reissueOf: pre.reissueOf,
  };
}

/** certReissuePrefill (C19): open the stored cert for editing; issuing the new one auto-cancels this one. */
export function certReissuePrefill(c: CertRow, todayYmd: string): CertPrefillPre {
  return {
    kibbutz: c.kibbutz, date: todayYmd, customer: c.customer,
    items: c.items.map(i => ({ name: i.name, qty: i.qty })),
    notes: c.notes || '', source: c.source, refId: c.refId,
    reissueOf: { id: c.id, certNumber: c.cert_number },
  };
}

/** certCollect (C4): lines with a name and qty>0; kibbutz falls back to the customer name. */
export function certCollect(form: { kibbutz?: string; date?: string; customer: CertCustomer; items: CertItem[]; notes?: string; source?: string; refId?: string; recipient?: string; signature?: string }, todayYmd: string) {
  const items = form.items.filter(i => i && i.name && i.qty > 0);
  return {
    kibbutz: form.kibbutz || form.customer.name.trim(),
    date: form.date || todayYmd,
    customer: form.customer,
    items,
    notes: form.notes || '',
    source: form.source || 'manual',
    refId: form.refId || '',
    recipient: form.recipient || '',
    signature: form.signature || '',
  };
}

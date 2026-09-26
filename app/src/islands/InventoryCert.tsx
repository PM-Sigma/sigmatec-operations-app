// 🚚 תעודת משלוח — the always-listening cert island (spec task U4, C1-C25). One Sheet at a
// time with pushed views (form → signature; or viewer; or send), reached from anywhere via the
// `sigma-inv-open` event ({kind:'cert'|'cert-view'|'cert-send', pre?|id?|row?}) — the same latch
// StockChange.tsx uses, queued in window.__sigmaInvQueue until this chunk mounts. The rules live
// in app/src/lib/inventory.ts (certPrefill/certCollect/certIssueErrors/certDocHtml/certSendPlan);
// the writes in app/src/lib/inventoryApi.ts (issueCert/cancelCert/fetchContacts/addContact).
import * as React from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { sigma, useCurrentUser } from '@/bridge';
import {
  certPrefill, certCollect, certIssueErrors, certDocHtml, certItemsForView,
  certSendPlan, certMailto, certViewUrl, activeProducts,
  type CertPrefillPre, type CertPrefillResult, type CertItem, type CertContact,
} from '@/lib/inventory';
import { CERT_LOGO } from '@/lib/certLogo';
import {
  useInventory, issueCert, cancelCert, fetchContacts, addContact, kibbutzDetails, fetchCertById,
  type CertRow,
} from '@/lib/inventoryApi';

export const CERT_OPEN_EVENT = 'sigma-inv-open';

type Screen = null | 'sheet' | 'signature' | 'viewer' | 'send';

interface Draft extends CertPrefillResult {
  recipient?: string;
  signature?: string;
}

function drainQueueForCert(): { kind: string; pre?: CertPrefillPre; id?: string; row?: CertRow } | null {
  try {
    const q = (window as any).__sigmaInvQueue as Array<any> | undefined;
    if (!q || !q.length) return null;
    for (let i = q.length - 1; i >= 0; i--) {
      if (String(q[i]?.kind || '').indexOf('cert') === 0) return q[i];
    }
  } catch { /* no queue */ }
  return null;
}

/** rowToCertLike: the raw `delivery_certs` row (snake_case) → CertDocHtml's shape (camelCase) —
 * the same ad hoc mapping the legacy certView()/certReissue() do at the call site. */
function rowToCertLike(c: CertRow, isViewer: boolean) {
  const anyc = c as any;
  return {
    number: anyc.cert_number, date: anyc.cert_date, kibbutz: anyc.kibbutz,
    customer: anyc.customer || {}, items: certItemsForView(anyc.items || [], isViewer, {}),
    notes: anyc.notes || '', source: anyc.source, refId: anyc.ref_id,
    recipient: anyc.recipient || '', signature: anyc.signature || '',
    cancelled: anyc.status === 'cancelled', replacedBy: anyc.replaced_by || 0,
  };
}

function CertIsland() {
  const user = useCurrentUser();
  const invQ = useInventory();
  const [screen, setScreen] = React.useState<Screen>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [reissueOf, setReissueOf] = React.useState<{ id: string; certNumber: number } | undefined>(undefined);
  const [viewHtml, setViewHtml] = React.useState('');
  const [viewId, setViewId] = React.useState<string | null>(null);
  const [viewDrive, setViewDrive] = React.useState('');
  const [sendCert, setSendCert] = React.useState<CertRow | null>(null);
  const [contacts, setContacts] = React.useState<CertContact[]>([]);
  const [selectedEmails, setSelectedEmails] = React.useState<string[]>([]);
  const [newContact, setNewContact] = React.useState<{ name: string; email: string; phone: string } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const drawingRef = React.useRef(false);
  const sigDataRef = React.useRef('');
  const [sigName, setSigName] = React.useState('');
  const [sigStatus, setSigStatus] = React.useState<'none' | 'signed'>('none');

  const catalog = React.useMemo(
    () => activeProducts(invQ.data?.products || [], [] as any).map((p: any) => p.name),
    [invQ.data],
  );

  async function openCertPre(pre: CertPrefillPre) {
    let details: Record<string, any> = {};
    try { details = await kibbutzDetails(); } catch { /* best-effort */ }
    const result = certPrefill(pre, details[pre.kibbutz || ''], new Date().toISOString().slice(0, 10));
    setDraft({ ...result });
    setReissueOf(pre.reissueOf);
    sigDataRef.current = ''; setSigName(''); setSigStatus('none');
    setScreen('sheet');
  }

  async function openCertView(row: CertRow) {
    const like = rowToCertLike(row, user.isViewer);
    setViewHtml(certDocHtml(like as any, { logo: CERT_LOGO }));
    setViewId(row.id);
    setViewDrive((row as any).drive_url || '');
    setScreen('viewer');
  }

  async function openCertSend(row: CertRow) {
    setSendCert(row);
    setNewContact(null);
    try {
      const rows = await fetchContacts((row as any).kibbutz || '');
      setContacts(rows);
      setSelectedEmails(certSendPlan(rows).selected);
    } catch { setContacts([]); setSelectedEmails([]); }
    setScreen('send');
  }

  React.useEffect(() => {
    const queued = drainQueueForCert();
    if (queued) void handleDetail(queued);
    async function handleDetail(detail: any) {
      if (detail.kind === 'cert') { void openCertPre(detail.pre || {}); return; }
      if (detail.kind === 'cert-view') {
        const row = detail.row || (detail.id ? await fetchCertById(detail.id).catch(() => null) : null);
        if (row) void openCertView(row);
        return;
      }
      if (detail.kind === 'cert-send') {
        const row = detail.row || (detail.id ? await fetchCertById(detail.id).catch(() => null) : null);
        if (row) void openCertSend(row);
        return;
      }
    }
    const onOpen = (e: Event) => { void handleDetail((e as CustomEvent)?.detail || {}); };
    window.addEventListener(CERT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CERT_OPEN_EVENT, onOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.isViewer]);

  function close() {
    setScreen(null); setDraft(null); setReissueOf(undefined); setSendCert(null); setViewId(null);
  }

  function updateItem(i: number, patch: Partial<CertItem>) {
    setDraft(d => d && { ...d, items: d.items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)) });
  }
  function addRow() { setDraft(d => d && { ...d, items: [...d.items, { name: '', qty: 1 }] }); }

  // ── signature canvas ──────────────────────────────────────────────────────
  function canvasPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }
  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const p = canvasPos(e);
    if (ctx) { ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const p = canvasPos(e);
    if (ctx) { ctx.lineTo(p.x, p.y); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke(); }
  }
  function onPointerUp() { drawingRef.current = false; }
  function clearSignature() {
    const c = canvasRef.current; const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    sigDataRef.current = ''; setSigStatus('none');
  }
  function confirmSignature() {
    const c = canvasRef.current;
    if (!c) return;
    // an all-transparent canvas has no ink — a naive toDataURL check would accept a blank pad
    const ctx = c.getContext('2d');
    const ink = ctx && Array.from(ctx.getImageData(0, 0, c.width, c.height).data).some((v, i) => i % 4 === 3 && v > 0);
    if (!ink) { toast.error('נא לחתום לפני האישור'); return; }
    sigDataRef.current = c.toDataURL('image/png');
    setSigStatus('signed');
    setScreen('sheet');
  }

  async function doIssue(preview: boolean) {
    if (!draft) return;
    const cert = certCollect({ ...draft, recipient: sigName, signature: sigDataRef.current }, new Date().toISOString().slice(0, 10));
    const errors = certIssueErrors(cert, user.isViewer);
    if (errors.length) { toast.error(errors.join('\n')); return; }
    if (preview) {
      const html = certDocHtml({ ...cert, number: null } as any, { logo: CERT_LOGO });
      setViewHtml(html); setViewId(null); setViewDrive(''); setScreen('viewer');
      return;
    }
    // C5: the print window opens SYNCHRONOUSLY on the tap (popup-blocker rule), before the await.
    const win = draft.noPrint ? null : window.open('', '_blank');
    setBusy(true);
    try {
      const res = await issueCert({ ...draft, recipient: sigName, signature: sigDataRef.current, reissueOf }, user.name, win);
      if (res.number) toast.success('תעודה מס\' ' + res.number + ' הופקה');
      else toast('התעודה הופקה כטיוטה (ללא מספר)');
      // C5: the overlay shows the issued document even with noPrint (the print window is the
      // separate, optional artifact) — same as the legacy `certOverlayShow` call after issue.
      const html = certDocHtml({ ...cert, number: res.number } as any, { logo: CERT_LOGO });
      setDraft(null); setReissueOf(undefined);
      setViewHtml(html); setViewId(res.id); setViewDrive(''); setScreen('viewer');
    } catch (e: any) {
      toast.error(e?.message || 'הפקת התעודה נכשלה');
    } finally { setBusy(false); }
  }

  async function doAddContact() {
    if (!newContact || !sendCert) return;
    const kibbutz = (sendCert as any).kibbutz || '';
    if (!newContact.name.trim() || (!newContact.email.trim() && !newContact.phone.trim())) {
      toast.error('נא למלא שם ולפחות אימייל או טלפון'); return;
    }
    try {
      await addContact({ ...newContact, kibbutz, active: true } as any);
      const rows = await fetchContacts(kibbutz);
      setContacts(rows);
      setSelectedEmails(certSendPlan(rows).selected);
      setNewContact(null);
      toast.success('איש קשר נוסף');
    } catch { toast.error('הוספת איש הקשר נכשלה'); }
  }

  function copyLink() {
    if (!viewId && !sendCert) return;
    const id = viewId || sendCert?.id;
    if (!id) return;
    try { navigator.clipboard?.writeText(certViewUrl(id)); toast.success('הקישור הועתק'); }
    catch { toast.error('העתקה נכשלה'); }
  }
  function emailSelected() {
    if (!sendCert || !selectedEmails.length) return;
    const subject = 'תעודת משלוח מס\' ' + (sendCert as any).cert_number;
    const body = 'שלום,\nמצורף קישור לתעודת המשלוח: ' + certViewUrl(sendCert.id);
    window.location.href = certMailto(selectedEmails, subject, body);
  }

  const plan = certSendPlan(contacts);

  return (
    <>
      <Sheet open={screen === 'sheet'} onOpenChange={o => !o && close()}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto" data-testid="cert-sheet">
          <SheetHeader>
            <SheetTitle>{reissueOf ? 'הפקה מתוקנת' : 'תעודת משלוח חדשה'}</SheetTitle>
          </SheetHeader>
          {draft && (
            <div className="mt-3 flex flex-col gap-3">
              {/* Designer C-round I fix: the customer-name and contact-person fields both default
                  from the kibbutz name (e.g. two identical "דגניה" inputs with only a placeholder
                  each — a placeholder that VANISHES the moment the field has a value, which it
                  always does here). Labelled exactly like InventoryOrderSheet.tsx's own fields
                  so the two never look interchangeable. */}
              <div>
                <label className="text-[13px] font-bold" htmlFor="certCustName">שם לקוח</label>
                <input id="certCustName" data-testid="cert-cust-name" value={draft.customer.name}
                  onChange={e => setDraft(d => d && { ...d, customer: { ...d.customer, name: e.target.value } })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              </div>
              <div>
                <label className="text-[13px] font-bold" htmlFor="certCustCompanyId">ח.פ.</label>
                <input id="certCustCompanyId" value={draft.customer.company_id || ''}
                  onChange={e => setDraft(d => d && { ...d, customer: { ...d.customer, company_id: e.target.value } })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              </div>
              <div>
                <label className="text-[13px] font-bold" htmlFor="certCustAddress">כתובת</label>
                <input id="certCustAddress" value={draft.customer.address || ''}
                  onChange={e => setDraft(d => d && { ...d, customer: { ...d.customer, address: e.target.value } })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              </div>
              <div>
                <label className="text-[13px] font-bold" htmlFor="certCustContact">איש קשר</label>
                <input id="certCustContact" value={draft.customer.contact || ''}
                  onChange={e => setDraft(d => d && { ...d, customer: { ...d.customer, contact: e.target.value } })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              </div>
              <div>
                <label className="text-[13px] font-bold" htmlFor="certDate">תאריך</label>
                <input id="certDate" type="date" value={draft.date} onChange={e => setDraft(d => d && { ...d, date: e.target.value })}
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
              </div>

              <div className="flex flex-col gap-2">
                {draft.items.map((it, i) => (
                  <div key={i} className="flex gap-2">
                    <input data-testid={`cert-item-${i}-name`} list="cert-catalog" value={it.name}
                      onChange={e => updateItem(i, { name: e.target.value })}
                      className="min-h-[44px] flex-1 rounded-xl border border-border bg-card px-2 text-[15px]" />
                    <input data-testid={`cert-item-${i}-qty`} type="number" min={1} value={it.qty}
                      onChange={e => updateItem(i, { qty: Number(e.target.value) || 0 })}
                      className="min-h-[44px] w-20 rounded-xl border border-border bg-card px-2 text-[15px]" />
                  </div>
                ))}
                <datalist id="cert-catalog">{catalog.map((n: string) => <option key={n} value={n} />)}</datalist>
                <button type="button" data-testid="cert-add-row" onClick={addRow} className="self-start text-[13px] font-bold text-[var(--sigma-ink)]">
                  הוספת פריט
                </button>
                <span className="text-[12px] text-muted-foreground">{draft.items.length} שורות · <bdi>{draft.items.reduce((s, it) => s + (it.qty || 0), 0)}</bdi> יח׳</span>
              </div>

              <textarea placeholder="למשל: לא לחיוב" rows={2} value={draft.notes}
                onChange={e => setDraft(d => d && { ...d, notes: e.target.value })}
                className="w-full rounded-xl border border-border bg-card p-2 text-[15px]" />

              <button type="button" data-testid="cert-sign-open" onClick={() => setScreen('signature')}
                className="min-h-[44px] rounded-xl border border-border text-[15px] font-bold">
                {sigStatus === 'signed' ? `נחתם ע״י ${sigName || ''}` : 'לא נחתם — הוספת חתימה'}
              </button>

              <SheetFooter>
                <button type="button" data-testid="cert-preview" onClick={() => void doIssue(true)} disabled={busy}
                  className="min-h-[48px] flex-1 rounded-xl border border-border text-[15px] font-bold disabled:opacity-40">
                  תצוגה מקדימה
                </button>
                <button type="button" data-testid="cert-issue" onClick={() => void doIssue(false)} disabled={busy}
                  className="min-h-[48px] flex-1 rounded-xl s-brand text-[15px] font-bold disabled:opacity-40">
                  {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'הפקת תעודה'}
                </button>
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={screen === 'signature'} onOpenChange={o => !o && setScreen('sheet')}>
        <SheetContent side="bottom" data-testid="cert-signature">
          <SheetHeader><SheetTitle>חתימה</SheetTitle></SheetHeader>
          <input placeholder="שם החותם" value={sigName} onChange={e => setSigName(e.target.value)}
            className="mt-2 min-h-[44px] w-full rounded-xl border border-border bg-card px-3 text-[15px]" />
          <canvas
            ref={canvasRef} data-testid="cert-sign-canvas" width={600} height={220}
            className="mt-2 w-full touch-none rounded-xl border border-border bg-white"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          />
          <SheetFooter>
            <button type="button" onClick={clearSignature} className="min-h-[44px] flex-1 rounded-xl border border-border font-bold">ניקוי</button>
            <button type="button" data-testid="cert-sign-ok" onClick={confirmSignature} className="min-h-[44px] flex-1 rounded-xl s-brand font-bold">אישור חתימה</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={screen === 'viewer'} onOpenChange={o => !o && close()}>
        <SheetContent side="bottom" className="h-[92vh]" data-testid="cert-viewer">
          <SheetHeader><SheetTitle>תעודת משלוח</SheetTitle></SheetHeader>
          <iframe title="תעודת משלוח" srcDoc={viewHtml} className="mt-2 h-[calc(92vh-96px)] w-full rounded-xl border border-border bg-white" />
          {!user.isViewer && (
            <SheetFooter>
              <button type="button" onClick={() => window.print()} className="min-h-[44px] flex-1 rounded-xl border border-border font-bold">הדפסה</button>
              {viewId && (
                <button type="button" onClick={() => { const row = { id: viewId } as CertRow; void openCertSend(row); }}
                  className="min-h-[44px] flex-1 rounded-xl border border-border font-bold">
                  שליחה
                </button>
              )}
              {viewDrive && (
                <a href={viewDrive} target="_blank" rel="noreferrer" className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-border font-bold">
                  הקובץ בדרייב
                </a>
              )}
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={screen === 'send'} onOpenChange={o => !o && close()}>
        <SheetContent side="bottom" data-testid="cert-send-panel">
          <SheetHeader><SheetTitle>שליחת תעודה</SheetTitle></SheetHeader>
          <div className="mt-2 flex flex-col gap-2">
            {contacts.map((c, i) => (
              <div key={i} data-testid={`cert-send-row-${i}`} className="flex items-center gap-2 rounded-xl border border-border p-2">
                {c.email && (
                  <input type="checkbox" checked={selectedEmails.includes(String(c.email))}
                    onChange={e => setSelectedEmails(s => e.target.checked ? [...s, String(c.email)] : s.filter(x => x !== c.email))} />
                )}
                <span className="min-w-0 flex-1 truncate text-[14px]">{c.name} {c.role ? `· ${c.role}` : ''} {c.email ? `· ${c.email}` : ''} {c.phone ? `· ${c.phone}` : ''}</span>
              </div>
            ))}
            {plan.needsContact && !newContact && (
              <button type="button" data-testid="cert-add-contact" onClick={() => setNewContact({ name: '', email: '', phone: '' })}
                className="min-h-[44px] rounded-xl border border-border font-bold">
                הוספת איש קשר
              </button>
            )}
            {newContact && (
              <div className="flex flex-col gap-2 rounded-xl border border-border p-2">
                <input placeholder="שם" value={newContact.name} onChange={e => setNewContact(c => c && { ...c, name: e.target.value })}
                  className="min-h-[40px] rounded-lg border border-border px-2 text-[14px]" />
                <input placeholder="אימייל" value={newContact.email} onChange={e => setNewContact(c => c && { ...c, email: e.target.value })}
                  className="min-h-[40px] rounded-lg border border-border px-2 text-[14px]" />
                <input placeholder="טלפון" value={newContact.phone} onChange={e => setNewContact(c => c && { ...c, phone: e.target.value })}
                  className="min-h-[40px] rounded-lg border border-border px-2 text-[14px]" />
                <button type="button" onClick={() => void doAddContact()} className="min-h-[40px] rounded-lg s-brand font-bold">שמירה</button>
              </div>
            )}
          </div>
          <SheetFooter>
            <button type="button" data-testid="cert-copy-link" onClick={copyLink} className="min-h-[44px] flex-1 rounded-xl border border-border font-bold">העתקת קישור</button>
            <button type="button" data-testid="cert-email" disabled={!selectedEmails.length} onClick={emailSelected}
              className="min-h-[44px] flex-1 rounded-xl s-brand font-bold disabled:opacity-40">
              מייל לנבחרים
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function InventoryCert() {
  return (
    <SigmaProviders>
      <CertIsland />
    </SigmaProviders>
  );
}

export function mountInventoryCert(): boolean {
  return mount('sigma-cert', InventoryCert);
}

// exported for InventoryCerts.tsx (the tab) to open the same sheets without a round-trip
// through the window event — same data, same component, no duplicate write path.
export function openCertEvent(detail: { kind: 'cert' | 'cert-view' | 'cert-send'; pre?: CertPrefillPre; row?: CertRow }) {
  try {
    (window as any).__sigmaInvQueue = (window as any).__sigmaInvQueue || [];
    (window as any).__sigmaInvQueue.push(detail);
    window.dispatchEvent(new CustomEvent(CERT_OPEN_EVENT, { detail }));
  } catch { /* no window */ }
}

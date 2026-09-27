// פעולות שטח — #sigma-fieldops (r9). A hub page for field operations; its first card is
// קריאת מודבוס, the old SigmatecOps "פעולות מתקדמות → קריאת מודבוס" rebuilt on the design system.
// Spec: docs/superpowers/specs/2026-09-23-field-ops-modbus-design.md.
//
// Data: emsGateway() only (sites, the site's Modbus meters, the IP lookup, read/ping/history
// through the field-ops Edge Function). Numbers: lib/fieldops/modbusScale.ts only. Decisions
// (manual status, circuits, error text): lib/fieldops/fieldOpsView.ts only.
import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';
import { canShowPage } from '@/lib/canShowPage';
import { emsGateway } from '@/lib/ems/gateway';
import type { EmsModbusMeter, ModbusOpLog, ModbusOpResult, ModbusTarget } from '@/lib/ems/types';
import {
  LEGACY_MODBUS_TYPE, MODBUS_TYPES, buildRows, israelTime, outcome, parsePing, responseMs, serialCheck,
} from '@/lib/fieldops/modbusScale';
import {
  circuitsOf, errorText, isIPv4, listEligible, manualStatus, matchSearch, meterLabel, pairEntries, parseUnit, planManualRead,
} from '@/lib/fieldops/fieldOpsView';

const TITLE = 'פעולות שטח';
// 48px floor (design-review.md's 360–430 update — the same floor scanOverlap's rule 3 checks),
// not the DS default 44: עידן's real-phone report (27.9) named this page's own controls, so it
// gets its own floor rather than a `data-min-tap="44"` exception carved out for it.
const box = 'w-full min-h-[48px] rounded-xl border border-border bg-muted px-3 text-base outline-none focus:border-[color:var(--brand-1)] disabled:opacity-70';
const btn48 = 'min-h-[48px]';
const typeName = (c: number | null) => MODBUS_TYPES.find(t => t.code === c)?.name || (c == null ? '—' : 'סוג ' + c);

type Mode = 'list' | 'manual';
type Busy = null | { op: 'read' | 'ping'; started: number };
type Result =
  | { op: 'read'; res: ModbusOpResult; circuits: Array<EmsModbusMeter | null>; ip: string; unit: number; typeCode: number | null }
  | { op: 'ping'; res: ModbusOpResult; ip: string };

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[length:var(--fs-body)]">
      <span className="text-muted-foreground">{k}</span>
      <span className="min-w-0 text-end font-medium">{v}</span>
    </div>
  );
}

function useElapsed(busy: Busy): number {
  const [, tick] = React.useState(0);
  React.useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);
  return busy ? Math.floor((Date.now() - busy.started) / 1000) : 0;
}

// ───────────────────────────── result cards ─────────────────────────────

function PingCard({ res, ip }: { res: ModbusOpResult; ip: string }) {
  const log = res.log;
  const p = log?.status === 'completed' ? parsePing(log.responseData) : null;
  return (
    <SectionBlock title="תוצאות PING" flush>
      <div data-testid="fieldops-ping" className="px-4">
        {!p ? (
          <ErrorBox text={log?.errorMessage || 'לא התקבלה תשובת PING'} />
        ) : (
          <>
            <KV k="כתובת IP" v={<bdi>{p.ip || ip}</bdi>} />
            <KV k="הצלחות" v={<bdi>{p.successCount} / {p.totalAttempts}</bdi>} />
            <KV k="זמן תגובה ממוצע" v={p.avgMs != null ? <bdi>{p.avgMs}ms</bdi> : 'לא זמין'} />
            <div className="mt-2 border-t border-border pt-2">
              {p.attempts.map(a => (
                <KV key={a.attempt} k={`ניסיון ${a.attempt}:`} v={
                  <span className={a.ok ? 'text-[var(--ok-ink)]' : 'text-[var(--danger-ink)]'}>
                    <bdi>{a.status}{a.ms != null && a.ok ? ` (${a.ms}ms)` : ''}</bdi>
                  </span>
                } />
              ))}
            </div>
            {p.successCount === 0 && (
              <div role="alert" className="mt-2 rounded-xl bg-[var(--danger-fill)] p-3 text-[var(--danger-ink)]">
                <b>כל הניסיונות נכשלו</b>
                <div>המכשיר לא זמין או לא מגיב לפינג. בדוק את כתובת IP וחיבור הרשת.</div>
              </div>
            )}
          </>
        )}
      </div>
    </SectionBlock>
  );
}

function ErrorBox({ text, hint }: { text: string; hint?: string }) {
  return (
    <div role="alert" data-testid="fieldops-error" className="rounded-xl bg-[var(--danger-fill)] p-3 text-[var(--danger-ink)]">
      <b>שגיאה בתקשורת: </b><span>{text}</span>
      {hint && <div className="mt-1 text-[13px]">{hint}</div>}
    </div>
  );
}

function ReadCards({ r }: { r: Extract<Result, { op: 'read' }> }) {
  const log = r.res.log;
  const o = outcome(log);
  const ms = responseMs(log);
  const comms = (
    <div className="mt-2 border-t border-border pt-2">
      <KV k="זמן תגובה" v={ms != null ? <bdi>{ms}ms</bdi> : '—'} />
      <KV k="תאריך קריאה" v={<bdi>{israelTime(log?.completedAt || log?.createdAt)}</bdi>} />
    </div>
  );
  const circuits = r.circuits.length ? r.circuits : [null];
  if (o.kind === 'fail') {
    const m = circuits[0];
    return (
      <SectionBlock title="תוצאות קריאה" flush>
        <div data-testid="fieldops-read" className="flex flex-col gap-2 px-4">
          <KV k="כתובת IP" v={<bdi>{r.ip}</bdi>} />
          <KV k="מספר ID" v={<bdi>{r.unit}</bdi>} />
          <KV k="סוג מונה" v={typeName(m?.typeCode ?? r.typeCode)} />
          <KV k="סטטוס חיבור" v={<Tag role="danger">נכשל</Tag>} />
          <ErrorBox text={o.message} hint={o.hint} />
          {comms}
        </div>
      </SectionBlock>
    );
  }
  const pairs = pairEntries(o.entries, circuits);
  return (
    <>
      {pairs.map(({ meter, entry }, i) => {
        const legacy = (meter?.typeCode ?? r.typeCode) != null ? LEGACY_MODBUS_TYPE[(meter?.typeCode ?? r.typeCode)!] ?? null : null;
        const b = buildRows(entry, meter, legacy);
        const sc = serialCheck(entry.counterNumber, meter?.serial ?? null);
        const chips = meter ? [
          b.mult.cm !== 1 && `כופל זרם ×${b.mult.cm}`,
          b.mult.vm !== 1 && `כופל מתח ×${b.mult.vm}`,
          b.mult.energy !== 1 && `כופל אנרגיה ×${Number(b.mult.energy.toPrecision(6))}`,
        ].filter(Boolean) as string[] : [];
        return (
          <SectionBlock key={meter?.id || i} title={pairs.length > 1 ? `תוצאות קריאה · ${meter?.serial || 'מעגל ' + (i + 1)}` : 'תוצאות קריאה'} flush>
            <div data-testid="fieldops-read" className="flex flex-col gap-2 px-4">
              <div>
                <KV k="כתובת IP" v={<bdi>{r.ip}</bdi>} />
                <KV k="מספר מונה (CounterNumber)" v={<bdi>{entry.counterNumber || 'לא זמין'}</bdi>} />
                {meter && <KV k="מונה ב-EMS" v={
                  // `flex flex-wrap` (not `inline-flex`, no wrap): a real serial+long-address+
                  // mismatch-tag combination (עידן, real-phone report 27.9: "long meter names…
                  // wrap or stack instead of overflow") doesn't fit one line at 360px — forcing
                  // it onto one squeezed it until the warn tag was unreadably narrow. Wrapping
                  // the tag onto its own line keeps every word fully visible instead.
                  <span className="flex flex-wrap items-center justify-end gap-1">
                    <bdi>{meter.serial}</bdi>{meter.address ? ' · ' + meter.address : ''}
                    {sc === 'match' && <Tag role="ok">✓</Tag>}
                    {sc === 'mismatch' && <Tag role="warn">המונה שענה אינו המונה ב-EMS</Tag>}
                  </span>
                } />}
                <KV k="מספר ID" v={<bdi>{r.unit || 'לא מוגדר'}</bdi>} />
                <KV k="סוג מונה" v={typeName(meter?.typeCode ?? r.typeCode)} />
                <KV k="סטטוס חיבור" v={<Tag role="ok">הצלחה</Tag>} />
              </div>
              {!meter && <Tag role="warn" className="self-start">לא רשום ב-EMS — מוצג בלי כופלי EMS</Tag>}
              {chips.length > 0 && <div className="flex flex-wrap gap-1">{chips.map(c => <Tag key={c} role="info">{c}</Tag>)}</div>}
              {b.notes.map(n => <div key={n} className="text-[13px] text-[var(--warn-ink)]">⚠ {n}</div>)}
              {b.rows.length === 0 ? (
                <div className="text-muted-foreground">לא נמצאו נתוני קריאה</div>
              ) : (
                // A declared horizontal-scroll container (`data-scroll-x`), not a wrapper that
                // silently clips — 3 short columns fit every phone width in practice, but a long
                // serial/address (or a translated unit label) now scrolls instead of being cut.
                <div className="overflow-x-auto" data-scroll-x>
                <table className="w-full min-w-[280px] text-[length:var(--fs-body)]" data-testid="fieldops-rows">
                  <thead>
                    <tr className="text-start text-[13px] text-muted-foreground">
                      <th className="py-1 text-start font-semibold">נתון</th>
                      <th className="py-1 text-end font-semibold">מהמונה</th>
                      <th className="py-1 text-end font-semibold">{meter ? 'אחרי כופל EMS' : 'מוצג'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map(row => (
                      <tr key={row.key} data-row={row.key} className="border-t border-border">
                        <td className="py-1.5">{row.label}</td>
                        <td className="py-1.5 text-end text-muted-foreground"><bdi>{row.device}</bdi></td>
                        <td className="py-1.5 text-end font-semibold">
                          <bdi>{row.shown}{row.unit && row.shown !== '—' ? ' ' + row.unit : ''}</bdi>
                          {row.unverified && <Tag role="warn" className="ms-1">לא מאומת</Tag>}
                          {row.corrected && <Tag role="info" className="ms-1">תוקן</Tag>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
              {meter?.lastCallDate && <div className="text-[13px] text-muted-foreground">שידור אחרון ל-EMS: <bdi>{israelTime(meter.lastCallDate)}</bdi></div>}
              {comms}
            </div>
          </SectionBlock>
        );
      })}
    </>
  );
}

function History({ meterId, refreshKey }: { meterId: string; refreshKey: number }) {
  const q = useQuery({
    queryKey: ['fieldops', 'history', meterId, refreshKey],
    queryFn: () => emsGateway().meterOpsHistory(meterId),
    staleTime: 0,
  });
  const logs = q.data || [];
  const label = (l: ModbusOpLog) => {
    const op = l.operationCode === 'modbus_ping' ? 'PING' : l.operationCode === 'modbus_read' ? 'קריאה' : l.operationCode;
    const o = l.operationCode === 'modbus_read' ? outcome(l) : null;
    const ok = l.operationCode === 'modbus_read' ? o?.kind === 'ok' : l.status === 'completed';
    return { op, ok };
  };
  return (
    <SectionBlock title="היסטוריה" count={logs.length || undefined} flush>
      <div data-testid="fieldops-history" className="flex flex-col px-4">
        {q.isLoading ? <div className="text-muted-foreground">טוען…</div>
          : q.isError ? <div className="text-muted-foreground">לא הצלחנו לטעון את ההיסטוריה</div>
          : logs.length === 0 ? <div className="text-muted-foreground">אין עדיין פעולות על המונה הזה</div>
          : logs.map(l => {
            const x = label(l);
            return (
              <div key={l.id} className="flex items-center justify-between gap-2 border-t border-border py-1.5 first:border-t-0">
                <span>{x.op} · <bdi>{israelTime(l.createdAt)}</bdi>{l.executedBy ? ' · ' + l.executedBy : ''}</span>
                <Tag role={x.ok ? 'ok' : 'danger'}>{x.ok ? 'הצליח' : 'נכשל'}</Tag>
              </div>
            );
          })}
      </div>
    </SectionBlock>
  );
}

// ───────────────────────────── the reader card ─────────────────────────────

function ModbusReader() {
  const gw = emsGateway();
  const qc = useQueryClient();
  const [mode, setMode] = React.useState<Mode>('list');
  const [siteId, setSiteId] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [meterId, setMeterId] = React.useState('');
  const [ip, setIp] = React.useState('');
  const [unit, setUnit] = React.useState('');
  const [typeCode, setTypeCode] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [result, setResult] = React.useState<Result | null>(null);
  const [error, setError] = React.useState('');
  const [histKey, setHistKey] = React.useState(0);
  const reqId = React.useRef(0);
  const elapsed = useElapsed(busy);

  const sites = useQuery({ queryKey: ['fieldops', 'sites'], queryFn: () => gw.listSites(), staleTime: 10 * 60_000 });
  const meters = useQuery({
    queryKey: ['fieldops', 'meters', siteId],
    queryFn: () => gw.modbusMeters(siteId),
    enabled: mode === 'list' && !!siteId,
    staleTime: 5 * 60_000,
  });
  const eligible = React.useMemo(() => listEligible(meters.data || []), [meters.data]);
  const shown = eligible.filter(m => matchSearch(m, search));
  const picked = eligible.find(m => m.id === meterId) || null;

  // Manual mode: every EMS meter on the typed IP, looked up in the background (debounced).
  const [lookupIp, setLookupIp] = React.useState('');
  React.useEffect(() => {
    const t = setTimeout(() => setLookupIp(isIPv4(ip) ? ip.trim() : ''), 400);
    return () => clearTimeout(t);
  }, [ip]);
  const lookup = useQuery({
    queryKey: ['fieldops', 'lookup', lookupIp],
    queryFn: () => gw.modbusLookup(lookupIp),
    enabled: mode === 'manual' && !!lookupIp,
    staleTime: 5 * 60_000,
  });
  const unitParsed = parseUnit(unit);
  const status = lookup.data && lookupIp === ip.trim() ? manualStatus(lookup.data, Number.isNaN(unitParsed) ? null : unitParsed) : null;

  const clear = () => {
    reqId.current++;
    setBusy(null); setResult(null); setError('');
    setMeterId(''); setSearch(''); setIp(''); setUnit(''); setTypeCode(null);
  };

  async function run(op: 'read' | 'ping') {
    if (busy) return;
    setError(''); setResult(null);
    let target: ModbusTarget;
    let circuits: Array<EmsModbusMeter | null> = [];
    let shownIp = '', shownUnit = 1, shownType: number | null = null;
    if (mode === 'list') {
      if (!picked) { setError(op === 'read' ? 'נא לבחור קיבוץ ומונה' : 'נא לבחור מונה'); return; }
      target = { meterId: picked.id };
      circuits = circuitsOf(picked, eligible);
      shownIp = picked.ip; shownUnit = picked.unit; shownType = picked.typeCode;
    } else {
      let matches: EmsModbusMeter[] = [];
      if (isIPv4(ip)) {
        try {
          matches = await qc.fetchQuery({ queryKey: ['fieldops', 'lookup', ip.trim()], queryFn: () => gw.modbusLookup(ip.trim()), staleTime: 5 * 60_000 });
        } catch (e) { setError('לא הצלחנו לבדוק את ה-IP מול EMS — ' + errorText(e)); return; }
      }
      if (op === 'ping') {
        if (!ip.trim()) { setError('נא למלא כתובת IP'); return; }
        if (!isIPv4(ip)) { setError('כתובת IP לא תקינה (למשל 192.0.2.10)'); return; }
        target = { ip: ip.trim(), ...(matches[0] ? { meterId: matches[0].id } : {}) };
        shownIp = ip.trim();
      } else {
        const plan = planManualRead(ip, unit, typeCode, matches, typeName);
        if (plan.error) { setError(plan.error); return; }
        if (plan.typeNote) setError(plan.typeNote);
        target = plan.target;
        circuits = plan.circuits;
        shownIp = ip.trim(); shownUnit = plan.target.unit ?? 1;
        shownType = plan.circuits[0]?.typeCode ?? typeCode;
      }
    }
    const id = ++reqId.current;
    setBusy({ op, started: Date.now() });
    try {
      const res = op === 'read' ? await gw.modbusRead(target) : await gw.modbusPing(target);
      if (id !== reqId.current) return;
      // The function returns the EMS meter only when the device read IS that meter.
      if (op === 'read') {
        const cs = circuits.length ? circuits : (res.meter ? [res.meter] : []);
        setResult({ op, res, circuits: cs, ip: shownIp, unit: shownUnit, typeCode: shownType });
      } else setResult({ op, res, ip: shownIp });
      setHistKey(k => k + 1);
    } catch (e) {
      if (id !== reqId.current) return;
      setError(errorText(e));
    } finally {
      if (id === reqId.current) setBusy(null);
    }
  }

  const historyMeter = mode === 'list' ? picked?.id : status?.sameDevice[0]?.id;

  return (
    <div className="flex flex-col gap-3">
      {/* `flush` (own px-4, no SectionBlock body padding) — the plain non-flush body wraps its
          children in a `-mx-4` (negative margin) div to cancel the section's own padding; under
          this page's own RTL grid layout that div's negative margins expand its computed width
          correctly but anchor the box at the padded content edge instead of the section's outer
          edge (עידן, real-phone report 27.9: "cut off... in the selection/navigation part"), so
          every row's right ~32px silently fell outside the section's own clip and was invisible.
          `flush` sidesteps the whole mechanism instead of fighting it. */}
      <SectionBlock title="קריאת מודבוס" flush>
        <div className="flex flex-col gap-3 px-4" data-testid="fieldops-modbus">
          <SegmentedControl<Mode>
            ariaLabel="מקור המונה"
            options={[{ value: 'list', label: 'בחר מונה מהרשימה' }, { value: 'manual', label: 'הזנה ידנית' }]}
            value={mode}
            onChange={m => { setMode(m); setResult(null); setError(''); }}
          />

          {mode === 'list' ? (
            <>
              <Field label="בחר קיבוץ *" htmlFor="foSite">
                <select id="foSite" className={box} value={siteId} onChange={e => { setSiteId(e.target.value); setMeterId(''); setSearch(''); }}>
                  <option value="">{sites.isLoading ? 'טוען קיבוצים…' : 'בחר קיבוץ'}</option>
                  {(sites.data || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
              {siteId && (
                <>
                  <Field label="חיפוש מונה" htmlFor="foSearch">
                    <input id="foSearch" className={box} value={search} onChange={e => setSearch(e.target.value)} placeholder="מספר מונה, כתובת או IP" autoComplete="off" />
                  </Field>
                  <Field label="בחר מונה" htmlFor="foMeter">
                    <select id="foMeter" className={box} value={meterId} onChange={e => { setMeterId(e.target.value); setResult(null); }} disabled={meters.isLoading}>
                      <option value="">{meters.isLoading ? 'טוען מונים…' : meters.isError ? 'לא הצלחנו לטעון מונים' : `בחר מונה (${shown.length})`}</option>
                      {shown.map(m => <option key={m.id} value={m.id}>{meterLabel(m)}</option>)}
                    </select>
                  </Field>
                  {meters.isSuccess && eligible.length === 0 && <div className="text-muted-foreground">אין בקיבוץ הזה מוני מודבוס עם כתובת IP ב-EMS</div>}
                </>
              )}
              {picked && (
                <div className="rounded-xl bg-muted p-3" data-testid="fieldops-picked">
                  <div className="mb-1 flex items-center gap-2 text-[13px] text-muted-foreground">פרטי המונה <Tag role="neutral">מ-EMS</Tag></div>
                  <KV k="כתובת IP" v={<bdi>{picked.ip}</bdi>} />
                  <KV k="מספר ID" v={<bdi>{picked.unit}</bdi>} />
                  <KV k="סוג מונה" v={typeName(picked.typeCode)} />
                  <div className="text-[13px] text-muted-foreground">לשינוי IP או ID — עבור להזנה ידנית</div>
                </div>
              )}
            </>
          ) : (
            <>
              <Field label="כתובת IP *" htmlFor="foIp">
                <input id="foIp" className={box} dir="ltr" inputMode="decimal" value={ip} onChange={e => setIp(e.target.value)} placeholder="192.0.2.10" autoComplete="off" />
              </Field>
              <Field label="מספר ID" htmlFor="foUnit">
                <input id="foUnit" className={box} dir="ltr" inputMode="numeric" value={unit} onChange={e => setUnit(e.target.value)} placeholder="1" autoComplete="off" />
              </Field>
              <Field label="סוג מונה" htmlFor="foType">
                <select id="foType" className={box} value={typeCode ?? ''} onChange={e => setTypeCode(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">לפי EMS</option>
                  {MODBUS_TYPES.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </Field>
              {mode === 'manual' && lookupIp && lookup.isFetching && <div className="text-muted-foreground" data-testid="fieldops-lookup-loading">בודקים את ה-IP מול EMS…</div>}
              {lookup.isError && lookupIp && <div className="text-[var(--danger-ink)]">לא הצלחנו לבדוק את ה-IP מול EMS — {errorText(lookup.error)}</div>}
              {status && (
                <div data-testid="fieldops-ip-status" className={'rounded-xl p-3 ' + (status.tone === 'warn' ? 'bg-[var(--warn-fill)] text-[var(--warn-ink)]' : 'bg-[var(--ok-fill)] text-[var(--ok-ink)]')}>
                  <div className="font-semibold">{status.ipLine}</div>
                  {status.unitLine && <div data-testid="fieldops-unit-status">{status.unitLine}</div>}
                </div>
              )}
              {status && lookup.data && lookup.data.length > 0 && (
                <div className="overflow-x-auto" data-scroll-x>
                <table className="w-full min-w-[280px] text-[length:var(--fs-body)]" data-testid="fieldops-ip-table">
                  <thead>
                    <tr className="text-[13px] text-muted-foreground">
                      <th className="py-1 text-start font-semibold">קיבוץ</th>
                      <th className="py-1 text-start font-semibold">מונה</th>
                      <th className="py-1 text-start font-semibold">כתובת</th>
                      <th className="py-1 text-end font-semibold">ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lookup.data.map(m => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="py-1.5">{m.siteName || '—'}</td>
                        <td className="py-1.5"><bdi>{m.serial}</bdi></td>
                        <td className="py-1.5">{m.address || '—'}</td>
                        <td className="py-1.5 text-end"><bdi>{m.unit}</bdi></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button className={btn48} onClick={() => void run('read')} loading={busy?.op === 'read'} disabled={!!busy}>
              {busy?.op === 'read' ? `קורא... ${elapsed} ש׳` : 'בדוק חיבור וקרא נתונים'}
            </Button>
            <Button className={btn48} variant="outline" onClick={() => void run('ping')} loading={busy?.op === 'ping'} disabled={!!busy}>
              {busy?.op === 'ping' ? 'בודק...' : 'PING'}
            </Button>
            <Button className={btn48} variant="ghost" onClick={clear}>נקה</Button>
          </div>
          {busy && (
            <div className="text-[13px] text-muted-foreground">
              קריאה יכולה לקחת עד 2 דקות.{' '}
              <button type="button" className="underline" onClick={() => { reqId.current++; setBusy(null); }}>הפסק להמתין</button>
              {' '}(EMS ימשיך ויתעד את התוצאה)
            </div>
          )}
          {error && <div role="status" data-testid="fieldops-message" className="text-[var(--warn-ink)]"><AlertTriangle className="inline h-4 w-4" /> {error}</div>}
        </div>
      </SectionBlock>

      {result?.op === 'ping' && <PingCard res={result.res} ip={result.ip} />}
      {result?.op === 'read' && <ReadCards r={result} />}
      {historyMeter && <History meterId={historyMeter} refreshKey={histKey} />}
    </div>
  );
}

function FieldOpsInner() {
  const [allowed, setAllowed] = React.useState(() => canShowPage('fieldops'));
  React.useEffect(() => {
    const on = () => setAllowed(canShowPage('fieldops'));
    window.addEventListener('user-changed' as any, on);
    return () => window.removeEventListener('user-changed' as any, on);
  }, []);
  if (!allowed) return null;
  return (
    <div className="flex flex-col gap-3 p-2 pb-24" data-testid="fieldops-page">
      <PageActionRow title={TITLE} onBack={() => (window as any).pageBack?.()} />
      <ModbusReader />
    </div>
  );
}

export function FieldOps() {
  return (
    <SigmaProviders>
      <EmsGate>
        <FieldOpsInner />
      </EmsGate>
    </SigmaProviders>
  );
}

export function mountFieldOps(): boolean {
  return mount('sigma-fieldops', FieldOps);
}

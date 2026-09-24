// KibbutzDetail — the open card (round 5, package K). ONE React sheet with two tabs (מצב
// הקיבוץ / ביקורים) that replaces the legacy kibbutz modal (index.html #tab-meetings +
// js/src/10-activity.js openEditModal). Opened through the ONE door, sigma.openKibbutzModal,
// which every legacy caller already uses (00-bridge.js, K-L3).
//
// The door queues an early tap in `window._kibbutzDoorQueue` while this chunk is still
// landing (K-L3's D5); mountKibbutzDetail drains it once, here.
import * as React from 'react';
import { X, Pencil, Handshake } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { IconBubble } from '@/components/ui/icon-bubble';
import { Tag } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { EmsGate } from '@/components/EmsGate';
import { sigma, useCurrentUser } from '@/bridge';
import { presenterStripFor, healthBandsKnown } from '@/components/home/HealthStrip';
import { detailTabKey, type DetailTab } from '@/lib/kibbutzDetail';
import { fetchKibbutzRows } from '@/lib/kibbutzRows';
import type { KibbutzRow } from '@/lib/kibbutzim';
import { useQuery } from '@tanstack/react-query';
import { StatusTab } from '@/components/kibbutz/StatusTab';
import { VisitsTab } from '@/components/kibbutz/VisitsTab';

const SLOT_ID = 'sigma-kibbutz-detail';

export interface KibbutzDetailApi {
  open(name: string, tab?: DetailTab): void;
  close(): void;
}

const fetchKibbutzim = () => fetchKibbutzRows<KibbutzRow>();

function Header({
  row, name, canEdit, onClose,
}: { row: KibbutzRow | null; name: string; canEdit: boolean; onClose: () => void }) {
  const code = row?.customer_code;
  const openEdit = () => {
    const home = (window as any).sigmaHome;
    if (home?.openSheet) { home.openSheet(name); return; }
    toast('פרטי הקיבוץ עוד נטענים. אפשר לנסות שוב בעוד רגע.');
  };
  return (
    <div
      data-testid="kibbutz-detail-header"
      className="grid grid-cols-[1fr_auto_auto] items-start gap-2 px-4 pb-2"
    >
      <div className="min-w-0">
        <h2 className="line-clamp-2 text-[20px] font-extrabold tracking-[-.01em] text-foreground">{name}</h2>
        {code != null && (
          <p className="mt-0.5 text-[12px] font-medium text-muted-foreground">
            <bdi>#{code}</bdi>
          </p>
        )}
      </div>
      {row?.marketing ? (
        <Tag role="info" dot={false} className="mt-1">
          <Handshake className="me-1 inline h-3 w-3" /> בתהליך שיווקי
        </Tag>
      ) : <span />}
      <div className="flex shrink-0 items-center gap-1">
        {canEdit && (
          <IconBubble icon={<Pencil className="h-[18px] w-[18px]" />} label="פרטי קיבוץ" size={40} onClick={openEdit} />
        )}
        <IconBubble icon={<X className="h-[18px] w-[18px]" />} label="סגירה" size={40} onClick={onClose} />
      </div>
    </div>
  );
}

function Body({ name, tab, onTab }: { name: string; tab: DetailTab; onTab: (t: DetailTab) => void }) {
  const { isViewer, role } = useCurrentUser();
  const canAct = !isViewer;
  const { data: rows } = useQuery({ queryKey: ['kibbutzim'], queryFn: fetchKibbutzim, staleTime: 60_000 });
  const row = React.useMemo(() => (rows || []).find(r => r.name === name) || null, [rows, name]);
  const canEdit = !!sigma?.isIdan?.();

  return (
    <div data-testid="kibbutz-detail" className="flex max-h-[85vh] flex-col">
      <Header row={row} name={name} canEdit={canEdit} onClose={() => (window as any).sigmaKibbutzDetail?.close?.()} />
      <div className="px-4 pb-2">
        <SegmentedControl<DetailTab>
          options={[{ value: 'status', label: 'מצב הקיבוץ' }, { value: 'visits', label: 'ביקורים' }]}
          value={tab}
          onChange={onTab}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
        {tab === 'status'
          ? (row ? <StatusTab kibbutz={name} row={row} canAct={canAct} role={String(role || '')} /> : (
            <EmptyState icon={<Pencil />} title="טוען את הקיבוץ…" />
          ))
          : <VisitsTab kibbutz={name} canAct={canAct} />}
      </div>
    </div>
  );
}

function KibbutzDetailIsland() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [tab, setTab] = React.useState<DetailTab>('status');

  const openIt = React.useCallback((n: string, t?: DetailTab) => {
    setName(n);
    setTab(detailTabKey(t));
    setOpen(true);
  }, []);
  const closeIt = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    (window as any).sigmaKibbutzDetail = { open: openIt, close: closeIt } as KibbutzDetailApi;
    // Publish the presenter strip / health bands exactly as Health.tsx did (K-U1 replaces it).
    try {
      (sigma as any).presenterStrip = presenterStripFor;
      (sigma as any).healthBands = healthBandsKnown;
    } catch { /* no bridge on this page */ }
    // Drain a queued early open (K-L3's door queue), once.
    const q = (window as any)._kibbutzDoorQueue as { name: string; tab: DetailTab } | undefined;
    if (q?.name) { openIt(q.name, q.tab); (window as any)._kibbutzDoorQueue = undefined; }
    return () => { delete (window as any).sigmaKibbutzDetail; };
  }, [openIt, closeIt]);

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) closeIt(); }}>
      <SheetContent
        side="bottom"
        className="max-h-[90vh] p-0 pt-2.5"
        // Radix's default auto-focus lands on the first focusable element — the header's ✏️
        // IconBubble — which drew a heavy focus ring on a button nobody asked to interact with
        // (designer round 5). Focus the sheet's own container instead: still announced to a
        // screen reader, no visible ring on an unrelated control.
        onOpenAutoFocus={e => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}
      >
        {name && <Body key={name} name={name} tab={tab} onTab={setTab} />}
      </SheetContent>
    </Sheet>
  );
}

export function KibbutzDetail() {
  return (
    <SigmaProviders>
      <EmsGate>
        <KibbutzDetailIsland />
      </EmsGate>
    </SigmaProviders>
  );
}

/** Called from main.tsx's lazy import. */
export function mountKibbutzDetail(): boolean {
  return mount(SLOT_ID, KibbutzDetail);
}

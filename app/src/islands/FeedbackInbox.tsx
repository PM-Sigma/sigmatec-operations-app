// #sigma-feedback-inbox — 📥 תיבה נכנסת for the 📣 box (spec §7 Part F). Admins only
// (canManageStaff = עידן + עמיחי), checked with a LIVE predicate so a changeUser() can never
// leave an admin surface open for a non-admin.
//
// Redesigned onto the design system (round 5, Task U6): a `Sheet`, one `FilterChip` per status
// with its own count, `ListRow`s for the list, and a pushed detail (close-then-open) that
// carries the full text, the status `SegmentedControl` and the GitHub card creation — instead
// of every row carrying all three inline.
//
// Newest first, status buttons (חדש → נראה → טופל), and for a `bug` row a card on the dev
// board through the `github` function's createIssue mode — always a CHILD of a Main Fields
// parent עידן picks here, titled `[מודול] | [תת-תחום] | [תיאור]`, into Backlog (the Git Ticket
// System rules). The issue number is stored on the row, which then links to the card.
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { ChevronLeft, ExternalLink, Github, Inbox, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { FilterChip, Tag } from '@/components/ui/chip';
import { ListRow } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/empty-state';
import { BubbleButton } from '@/components/ui/bubble-button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite, SB_ANON, SB_URL } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import {
  KIND_LABEL, STATUS_LABEL, canSeeFeedbackInbox, feedbackPreview, issueBody, issueTitle,
  type FeedbackKind, type FeedbackStatus,
} from '@/lib/feedback';
import { FEEDBACK_QUERY_KEY } from '@/islands/Feedback';
import { EmsGate } from '@/components/EmsGate';
import { sessionLost } from '@/lib/session';
import { toastFailure } from '@/lib/pending';

export interface FeedbackItem {
  id: string;
  author: string | null;
  kind: FeedbackKind;
  text: string;
  audio_path: string | null;
  status: FeedbackStatus;
  github_issue: number | null;
  created_at: string;
}

export interface Parent { number: number; title: string; url?: string }

const GH_REPO_URL = 'https://github.com/Sigmatec-Energy/tasks/issues/';
const STATUSES: FeedbackStatus[] = ['new', 'seen', 'done'];

// ───────────────────────── the opener ─────────────────────────

let opener: (() => void) | null = null;

export function openFeedbackInbox(): void {
  if (!canSeeFeedbackInbox(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.())) {
    toast.error('התיבה הנכנסת מוגבלת למנהלים');
    return;
  }
  if (opener) opener();
  else toast.error('התיבה עוד לא נטענה. רענן את העמוד');
}

// ───────────────────────── data ─────────────────────────

async function fetchFeedback(): Promise<FeedbackItem[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('feedback').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  return (data || []) as FeedbackItem[];
}

/** The `github` function needs a valid EMS login — it gates every mode on it. */
function emsToken(): string {
  try { return sigma?.emsToken?.() || ''; } catch { return ''; }
}

async function ghCall(payload: Record<string, unknown>): Promise<any> {
  const token = emsToken();
  if (!token) throw sessionLost('gh-no-token');
  // X-L8 audit fix: createIssue is a write mode, gated by WHO the caller is — the anon key
  // alone now 403s. Send the same Supabase-minted pass every authenticated table read already
  // uses (sigma.sbPass(); app/src/lib/devBoard.ts's ghCall is the same pattern).
  const pass = (() => { try { return sigma?.sbPass?.()?.token || ''; } catch { return ''; } })();
  const r = await fetch(SB_URL + '/functions/v1/github', {
    method: 'POST',
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + (pass || SB_ANON), 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, ...payload }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ('github ' + r.status));
  return d;
}

const dmy = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(+d) ? iso
    : `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ───────────────────────── the parent picker ─────────────────────────

/**
 * The parent list comes from the board's Main Fields column. When the bug is about ALERTS the
 * ruling is to pre-select "#104 התראות | הגדרות וסינון"; anything else, עידן picks — the app
 * never invents a Main Fields parent.
 */
const ALERTS_PARENT = 104;
const ALERTS_RE = /התרא|נוטיפ|פוש|push|notification/i;

function ParentPicker({
  value, onChange, parents, loading,
}: { value: number | ''; onChange: (n: number | '') => void; parents: Parent[]; loading: boolean }) {
  return (
    <Select value={value ? String(value) : undefined} onValueChange={v => onChange(v ? Number(v) : '')}>
      <SelectTrigger aria-label="תחום אב">
        <SelectValue placeholder={loading ? 'טוען תחומים…' : 'בחירת תחום אב (חובה)'} />
      </SelectTrigger>
      <SelectContent>
        {parents.map(p => (
          <SelectItem key={p.number} value={String(p.number)}>#{p.number} {p.title}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ───────────────────────── the list row ─────────────────────────

function FeedbackRow({ item, onOpen }: { item: FeedbackItem; onOpen: (item: FeedbackItem) => void }) {
  return (
    <ListRow
      title={<bdi>{feedbackPreview(item.text)}</bdi>}
      meta={(
        <span className="flex flex-wrap items-center gap-1.5">
          <Tag role="neutral">{KIND_LABEL[item.kind]}</Tag>
          <bdi>{dmy(item.created_at)}</bdi>
          <span>· <span>{item.author || 'בלי שם'}</span></span>
        </span>
      )}
      onClick={() => onOpen(item)}
    />
  );
}

// ───────────────────────── the pushed detail ─────────────────────────

function DetailView({
  item, parents, parentsLoading, onStatus, onIssue, onBack,
}: {
  item: FeedbackItem;
  parents: Parent[];
  parentsLoading: boolean;
  onStatus: (id: string, status: FeedbackStatus) => void;
  onIssue: (item: FeedbackItem, parent: number) => Promise<void>;
  onBack: () => void;
}) {
  const [parent, setParent] = React.useState<number | ''>(ALERTS_RE.test(item.text) ? ALERTS_PARENT : '');
  const [busy, setBusy] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const canCreateCard = item.kind === 'bug' && !item.github_issue;

  const create = async () => {
    if (!parent) { toast.error('יש לבחור תחום אב, כרטיס תמיד נתלה תחת תחום קיים'); return; }
    setBusy(true);
    try { await onIssue(item, parent); setShowCreate(false); }
    finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-3" data-testid="feedback-inbox-detail">
      <button
        type="button"
        onClick={onBack}
        className="s-hit flex w-fit items-center gap-1 text-sm font-semibold text-muted-foreground"
        data-hit-slop
      >
        <ChevronLeft aria-hidden className="h-4 w-4 rotate-180" /> חזרה לרשימה
      </button>

      <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
        <Tag role="neutral">{KIND_LABEL[item.kind]}</Tag>
        <span className="text-muted-foreground"><bdi>{dmy(item.created_at)}</bdi> · {item.author || 'בלי שם'}</span>
        {item.github_issue && (
          <a href={GH_REPO_URL + item.github_issue} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px font-bold text-primary">
            <Github aria-hidden className="h-3.5 w-3.5" /> <bdi>#{item.github_issue}</bdi> <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>

      <p className="whitespace-pre-wrap text-[15px] leading-snug"><bdi>{item.text}</bdi></p>

      <SegmentedControl
        ariaLabel="סטטוס"
        options={STATUSES.map(s => ({ value: s, label: STATUS_LABEL[s] }))}
        value={item.status}
        onChange={s => onStatus(item.id, s)}
      />

      {canCreateCard && !showCreate && (
        <BubbleButton
          variant="tonal"
          onClick={() => setShowCreate(true)}
          icon={<Github aria-hidden className="h-4 w-4" />}
        >
          פתיחת כרטיס בלוח הפיתוח
        </BubbleButton>
      )}

      {canCreateCard && showCreate && (
        <div className="flex flex-col gap-2 rounded-[var(--r-lg)] bg-secondary/60 p-3">
          <ParentPicker value={parent} onChange={setParent} parents={parents} loading={parentsLoading} />
          <p className="text-[12px] text-muted-foreground">
            כותרת: <bdi>{issueTitle(item.kind, item.text, parents.find(p => p.number === parent)?.title)}</bdi>
          </p>
          <div className="flex gap-2">
            <BubbleButton
              variant="primary"
              className="flex-1"
              onClick={() => void create()}
              disabled={busy || !parent}
              icon={<Github aria-hidden className="h-4 w-4" />}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'יצירת כרטיס ב-Backlog'}
            </BubbleButton>
            <BubbleButton variant="neutral" onClick={() => setShowCreate(false)}>ביטול</BubbleButton>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── the sheet ─────────────────────────

function InboxSheet() {
  const qc = useQueryClient();
  const { name: actor, isViewer } = useCurrentUser();
  const admin = canSeeFeedbackInbox(!!sigma?.isAdmin?.(), isViewer);
  const [open, setOpen] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<FeedbackStatus | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    opener = () => setOpen(true);
    return () => { opener = null; };
  }, []);

  // Someone switched to a non-admin while the inbox was open → close it.
  React.useEffect(() => { if (open && !admin) setOpen(false); }, [open, admin]);

  // The push action opens the app at #feedback-inbox. The island mounts BEFORE the user has
  // picked who they are, so the check runs again on every user-changed — otherwise the deep
  // link would be swallowed by the admin gate it is supposed to pass.
  const checkHash = React.useCallback(() => {
    if (location.hash !== '#feedback-inbox') return;
    if (!canSeeFeedbackInbox(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.())) return;
    setOpen(true);
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* private mode */ }
  }, []);
  React.useEffect(() => {
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [checkHash]);
  useSigmaEvent('user-changed', checkHash);

  const { data, isLoading, error } = useQuery({
    queryKey: FEEDBACK_QUERY_KEY, queryFn: fetchFeedback, enabled: open && admin,
  });

  // A new feedback sent from this device (or a status flip) refetches the list.
  useSigmaEvent('feedback-changed', () => { void qc.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEY }); });

  const { data: parents, isLoading: parentsLoading } = useQuery({
    queryKey: ['gh-parents'],
    queryFn: async () => ((await ghCall({ mode: 'listParents' })).parents || []) as Parent[],
    enabled: open && admin,
    staleTime: 10 * 60_000,
    retry: 0,
  });

  // A feedback row is NEVER updated directly (fix round 1): `feedback` has no UPDATE policy and
  // the privilege is revoked, so the only way through is `feedback_admin_update`, which checks
  // the actor against the `app_admins` table server-side. The client gate stays as the first
  // door; this is the second one.
  const status = useMutation({
    mutationFn: async (v: { id: string; status: FeedbackStatus }) => {
      const sb = await getSupabase();
      await sbWrite(() => sb.rpc('feedback_admin_update', {
        p_id: v.id, p_actor: actor, p_status: v.status, p_github_issue: null,
      }) as any);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEY }); },
    onError: (e: any) => toastFailure(e, undefined, 'העדכון נכשל'),
  });

  const makeIssue = async (item: FeedbackItem, parent: number) => {
    const parentTitle = (parents || []).find(p => p.number === parent)?.title;
    try {
      const res = await ghCall({
        mode: 'createIssue',
        title: issueTitle(item.kind, item.text, parentTitle),
        body: issueBody({ kind: item.kind, text: item.text, author: item.author, createdAt: item.created_at }),
        labels: ['bug'],
        parent,
      });
      const sb = await getSupabase();
      await sbWrite(() => sb.rpc('feedback_admin_update', {
        p_id: item.id, p_actor: actor, p_status: 'seen', p_github_issue: res.number,
      }) as any);
      await qc.invalidateQueries({ queryKey: FEEDBACK_QUERY_KEY });
      if (res.warnings?.length) toast.warning('נוצר כרטיס #' + res.number + ' עם אזהרות: ' + res.warnings.join(' · '));
      else toast.success('נוצר כרטיס #' + res.number + ' ב-Backlog');
    } catch (e: any) {
      toastFailure(e, undefined, 'יצירת הכרטיס נכשלה');
    }
  };

  const items = data || [];
  const counts: Record<FeedbackStatus, number> = { new: 0, seen: 0, done: 0 };
  for (const i of items) counts[i.status] = (counts[i.status] || 0) + 1;
  const shown = statusFilter ? items.filter(i => i.status === statusFilter) : items;
  const selected = selectedId ? items.find(i => i.id === selectedId) || null : null;

  // A row's own status flip (from the pushed detail) invalidates the query, which can drop the
  // selected id out of `items` for a beat — closing the detail rather than rendering a ghost.
  React.useEffect(() => { if (selectedId && !selected) setSelectedId(null); }, [selectedId, selected]);

  return (
    <Sheet open={open} onOpenChange={o => { setOpen(o); if (!o) setSelectedId(null); }}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto" data-testid="feedback-inbox">
        <SheetHeader className="text-start">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Inbox aria-hidden className="h-5 w-5" /> תיבה נכנסת
          </SheetTitle>
          <SheetDescription>רעיונות, באגים ותלונות</SheetDescription>
        </SheetHeader>
      <EmsGate>

        {selected ? (
          <DetailView
            item={selected}
            parents={parents || []}
            parentsLoading={parentsLoading}
            onStatus={(id, s) => status.mutate({ id, status: s })}
            onIssue={makeIssue}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5 pb-2">
              {STATUSES.map(s => (
                <FilterChip
                  key={s}
                  selected={statusFilter === s}
                  count={counts[s]}
                  onClick={() => setStatusFilter(f => (f === s ? null : s))}
                >
                  {STATUS_LABEL[s]}
                </FilterChip>
              ))}
            </div>

            {isLoading && (
              <div className="flex flex-col gap-2" aria-busy="true">
                {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            )}
            {error && <p className="text-[13px] text-destructive">{(error as any)?.message || 'הטעינה נכשלה'}</p>}
            {!isLoading && !shown.length && <EmptyState icon={<Inbox />} title="אין עדיין פניות." />}

            <ul className="-mx-4 divide-y divide-border">
              {shown.map(i => <FeedbackRow key={i.id} item={i} onOpen={item => setSelectedId(item.id)} />)}
            </ul>
          </>
        )}
      </EmsGate>
      </SheetContent>
    </Sheet>
  );
}

export function FeedbackInbox() {
  return (
    <SigmaProviders>
      <InboxSheet />
    </SigmaProviders>
  );
}

export function mountFeedbackInbox(): boolean {
  const ok = mount('sigma-feedback-inbox', FeedbackInbox);
  if (!ok) return false;
  registerMoreItem({
    id: 'feedback-inbox',
    group: 'admin',
    label: 'תיבה נכנסת (רעיונות ובאגים)',
    icon: 'Inbox',
    roles: ['idan', 'team'],
    visible: () => canSeeFeedbackInbox(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.()),
    onSelect: () => openFeedbackInbox(),
  });
  return ok;
}

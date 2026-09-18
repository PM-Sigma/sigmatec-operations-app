// #sigma-feedback-inbox — 📥 תיבה נכנסת for the 📣 box (spec §7 Part F). Admins only
// (canManageStaff = עידן + עמיחי), checked with a LIVE predicate so a changeUser() can never
// leave an admin surface open for a non-admin.
//
// Newest first, status buttons (חדש → נראה → טופל), and for a `bug` row the 🐙 button that
// turns it into a card on the dev board through the `github` function's createIssue mode —
// always a CHILD of a Main Fields parent עידן picks here, titled `[מודול] | [תת-תחום] |
// [תיאור]`, into Backlog (the Git Ticket System rules). The issue number is stored on the row,
// which then links to the card.
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { getSupabase, sbWrite, SB_ANON, SB_URL } from '@/lib/supabase';
import { registerMoreItem } from '@/lib/registry';
import { sigma, useCurrentUser, useSigmaEvent } from '@/bridge';
import {
  KIND_LABEL, STATUS_LABEL, canSeeFeedbackInbox, issueBody, issueTitle,
  type FeedbackKind, type FeedbackStatus,
} from '@/lib/feedback';
import { FEEDBACK_QUERY_KEY } from '@/islands/Feedback';

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

// ───────────────────────── the opener ─────────────────────────

let opener: (() => void) | null = null;

export function openFeedbackInbox(): void {
  if (!canSeeFeedbackInbox(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.())) {
    toast.error('התיבה הנכנסת מוגבלת למנהלים');
    return;
  }
  if (opener) opener();
  else toast.error('התיבה עוד לא נטענה — רענן את העמוד');
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
  if (!token) throw new Error('יש להתחבר ל-EMS כדי לכתוב ללוח הפיתוח');
  const r = await fetch(SB_URL + '/functions/v1/github', {
    method: 'POST',
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json' },
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
    <select
      value={value}
      onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
      className="min-h-[38px] w-full rounded-xl border border-border bg-muted px-2 text-[13px]"
    >
      <option value="">{loading ? 'טוען תחומים…' : 'בחר תחום אב (חובה)'}</option>
      {parents.map(p => (
        <option key={p.number} value={p.number}>#{p.number} {p.title}</option>
      ))}
    </select>
  );
}

// ───────────────────────── one row ─────────────────────────

function Row({
  item, parents, parentsLoading, onStatus, onIssue,
}: {
  item: FeedbackItem;
  parents: Parent[];
  parentsLoading: boolean;
  onStatus: (id: string, status: FeedbackStatus) => void;
  onIssue: (item: FeedbackItem, parent: number) => Promise<void>;
}) {
  const [openCard, setOpenCard] = React.useState(false);
  const [parent, setParent] = React.useState<number | ''>(ALERTS_RE.test(item.text) ? ALERTS_PARENT : '');
  const [busy, setBusy] = React.useState(false);

  const create = async () => {
    if (!parent) { toast.error('בחר תחום אב — כרטיס תמיד נתלה תחת תחום קיים'); return; }
    setBusy(true);
    try { await onIssue(item, parent); setOpenCard(false); }
    finally { setBusy(false); }
  };

  return (
    <div className={'rounded-xl border border-border p-2.5 ' + (item.status === 'done' ? 'opacity-50' : '')}>
      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="rounded-full bg-primary/10 px-2 py-px font-bold">{KIND_LABEL[item.kind]}</span>
        <span className="font-semibold text-muted-foreground">{item.author || 'אנונימי'}</span>
        <span className="text-muted-foreground">· <bdi>{dmy(item.created_at)}</bdi></span>
        {item.status !== 'new' && (
          <span className="rounded-full bg-muted px-2 py-px font-semibold">{STATUS_LABEL[item.status]}</span>
        )}
        {item.github_issue && (
          <a href={GH_REPO_URL + item.github_issue} target="_blank" rel="noreferrer"
             className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-px font-bold text-primary">
            🐙 <bdi>#{item.github_issue}</bdi> <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <p className="whitespace-pre-wrap text-[13px] leading-snug">{item.text}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(['new', 'seen', 'done'] as FeedbackStatus[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onStatus(item.id, s)}
            disabled={item.status === s}
            className={'min-h-[32px] rounded-lg border px-2 text-[12px] font-bold '
              + (item.status === s ? 'border-transparent bg-brand-grad text-white' : 'border-border hover:bg-muted')}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
        {item.kind === 'bug' && !item.github_issue && (
          <button type="button" onClick={() => setOpenCard(v => !v)}
                  className="min-h-[32px] rounded-lg border border-border px-2 text-[12px] font-bold hover:bg-muted">
            🐙 פתח כרטיס בלוח הפיתוח
          </button>
        )}
      </div>

      {openCard && (
        <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-muted/60 p-2">
          <ParentPicker value={parent} onChange={setParent} parents={parents} loading={parentsLoading} />
          <p className="text-[11px] text-muted-foreground">
            כותרת: <bdi>{issueTitle(item.kind, item.text, parents.find(p => p.number === parent)?.title)}</bdi>
          </p>
          <div className="flex gap-1.5">
            <button type="button" onClick={() => void create()} disabled={busy || !parent}
                    className="min-h-[36px] flex-1 rounded-xl bg-brand-grad text-[13px] font-bold text-white disabled:opacity-40">
              {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'צור כרטיס ב-Backlog'}
            </button>
            <button type="button" onClick={() => setOpenCard(false)}
                    className="min-h-[36px] rounded-xl border border-border px-3 text-[13px] font-bold">ביטול</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── the dialog ─────────────────────────

function InboxDialog() {
  const qc = useQueryClient();
  const { name: actor, isViewer } = useCurrentUser();
  const admin = canSeeFeedbackInbox(!!sigma?.isAdmin?.(), isViewer);
  const [open, setOpen] = React.useState(false);

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
    onError: (e: any) => toast.error(e?.message || 'העדכון נכשל'),
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
      toast.error(e?.message || 'יצירת הכרטיס נכשלה');
    }
  };

  const items = data || [];
  const fresh = items.filter(i => i.status === 'new').length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>📥 תיבה נכנסת — רעיונות, באגים ותלונות</DialogTitle>
          <DialogDescription>
            {fresh ? <><bdi>{fresh}</bdi> חדשים · </> : null}סה״כ <bdi>{items.length}</bdi>. באג אפשר להפוך לכרטיס בלוח הפיתוח.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="py-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></div>}
        {error && <p className="text-[13px] text-destructive">{(error as any)?.message || 'הטעינה נכשלה'}</p>}
        {!isLoading && !items.length && <p className="py-4 text-center text-[13px] text-muted-foreground">אין עדיין פניות</p>}

        <div className="flex flex-col gap-2">
          {items.map(i => (
            <Row
              key={i.id}
              item={i}
              parents={parents || []}
              parentsLoading={parentsLoading}
              onStatus={(id, s) => status.mutate({ id, status: s })}
              onIssue={makeIssue}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackInbox() {
  return (
    <SigmaProviders>
      <InboxDialog />
    </SigmaProviders>
  );
}

export function mountFeedbackInbox(): boolean {
  const ok = mount('sigma-feedback-inbox', FeedbackInbox);
  if (!ok) return false;
  registerMoreItem({
    id: 'feedback-inbox',
    label: '📥 תיבה נכנסת (רעיונות ובאגים)',
    icon: 'Inbox',
    roles: ['idan', 'team'],
    visible: () => canSeeFeedbackInbox(!!sigma?.isAdmin?.(), !!sigma?.isViewer?.()),
    onSelect: () => openFeedbackInbox(),
  });
  return ok;
}

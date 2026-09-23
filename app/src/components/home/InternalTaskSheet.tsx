// ➕ משימה פנימית — the one form that creates a 🔒 row (עידן 22.9, D3). It asks for the same
// parts an EMS task has: a title, who owns it, a due date (may stay empty), a priority and a
// kind. The owner is picked from the roster; the person adding is the default.
import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { APP_PEOPLE } from '@/lib/people';
import { useCurrentUser } from '@/bridge';
import { createInternalTask } from '@/components/home/InternalTasks';
import { INTERNAL_KINDS, INTERNAL_PRIORITIES } from '@/lib/internalTasks';

const chip = (on: boolean) =>
  'min-h-[36px] rounded-full border px-3 text-[13px] font-semibold ' +
  (on ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-muted-foreground');

export default function InternalTaskSheet({
  kibbutz, open, onOpenChange,
}: { kibbutz: string | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { name: me } = useCurrentUser();
  const [title, setTitle] = React.useState('');
  const [owner, setOwner] = React.useState<string>(me);
  const [due, setDue] = React.useState('');
  const [priority, setPriority] = React.useState('normal');
  const [kind, setKind] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(''); setOwner(me); setDue(''); setPriority('normal'); setKind(''); setSaving(false);
  }, [open, me]);

  const save = async () => {
    const t = title.trim();
    if (!t) { toast.error('כתוב מה המשימה'); return; }
    if (!owner) { toast.error('בחר אחראי'); return; }
    setSaving(true);
    try {
      await createInternalTask(t, kibbutz, owner, me, { due_date: due || null, priority, kind: kind || null });
      toast.success('נוספה משימה פנימית' + (owner !== me ? ' ל' + owner : ''));
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'ההוספה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const guard = useUnsavedGuard({
    dirty: () => title.trim() !== '' || due !== '' || kind !== '',
    onSave: () => save(),
    onDiscard: () => onOpenChange(false),
    onClose: () => onOpenChange(false),
  });

  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(onOpenChange)}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto p-4 pb-7" data-testid="internal-task-sheet" {...guard.contentProps}>
        <SheetHeader className="text-start">
          <SheetTitle className="text-[20px] font-extrabold">משימה פנימית{kibbutz ? ' · ' + kibbutz : ''}</SheetTitle>
          <SheetDescription>נראית לצוות בלבד</SheetDescription>
        </SheetHeader>

        <label className="mb-1 mt-3 block text-xs font-bold text-muted-foreground" htmlFor="itTitle">מה צריך לעשות</label>
        <input
          id="itTitle"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void save(); } }}
          autoComplete="off"
          className="w-full min-h-[48px] rounded-xl border border-border bg-muted px-3 py-2.5 text-base outline-none focus:border-[color:var(--brand-1)]"
        />

        <div className="mb-1 mt-3 text-xs font-bold text-muted-foreground">אחראי</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="אחראי">
          {APP_PEOPLE.map(p => (
            <button key={p} type="button" role="radio" aria-checked={owner === p} onClick={() => setOwner(p)} className={chip(owner === p)}>
              <span aria-hidden className={'me-1 inline-block h-2 w-2 rounded-full ' + (owner === p ? 'bg-background' : 'bg-muted-foreground/50')} />
              {p}
            </button>
          ))}
        </div>

        <label className="mb-1 mt-3 block text-xs font-bold text-muted-foreground" htmlFor="itDue">תאריך יעד <span className="font-medium">· לא חובה</span></label>
        <input
          id="itDue"
          type="date"
          value={due}
          onChange={e => setDue(e.target.value)}
          className="w-full min-h-[48px] rounded-xl border border-border bg-muted px-3 py-2.5 text-base outline-none focus:border-[color:var(--brand-1)]"
        />

        <div className="mb-1 mt-3 text-xs font-bold text-muted-foreground">עדיפות</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="עדיפות">
          {INTERNAL_PRIORITIES.map(p => (
            <button key={p.value} type="button" role="radio" aria-checked={priority === p.value} onClick={() => setPriority(p.value)} className={chip(priority === p.value)}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="mb-1 mt-3 text-xs font-bold text-muted-foreground">סוג</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סוג">
          {INTERNAL_KINDS.map(k => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(kind === k ? '' : k)} className={chip(kind === k)}>
              {k}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl s-brand text-base font-bold disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          הוסף משימה
        </button>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

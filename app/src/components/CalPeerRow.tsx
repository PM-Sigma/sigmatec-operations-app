// ⚙️ — אביאם's calendar setting (round 5 · C2). Owned by package C; Settings.tsx (package G)
// only mounts it, so the rule of who sees it stays in lib/calendar.ts.
import { Switch } from '@/components/ui/switch';
import { canTogglePeerTasks } from '@/lib/calendar';
import { saveSettings, useSettings } from '@/lib/settings';

export function CalPeerRow({ user }: { user: string }) {
  const s = useSettings();
  if (!canTogglePeerTasks(user)) return null;
  return (
    <label className="mt-2 flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-border bg-card px-3">
      <span className="min-w-0 text-[13px] font-semibold">לראות גם את המשימות של ניתאי ביומן</span>
      <Switch
        data-testid="set-cal-peer"
        checked={s.cal_peer_tasks}
        onCheckedChange={v => { void saveSettings(user, { cal_peer_tasks: v }).catch(() => { /* offline: the mirror is right */ }); }}
        aria-label="לראות גם את המשימות של ניתאי ביומן"
      />
    </label>
  );
}

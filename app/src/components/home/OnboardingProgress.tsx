// 🆕 onboarding progress strip — Task 27, company-process spec §4. Renders on a 🆕 לקוח חדש
// card only (KibbutzCard.tsx gates it by section) and never on a ✅ active one.
//
// Same shape as InternalTasks.tsx: one shared TanStack query (['onboardingSteps']), ONE
// module-scope bus listener for `onboarding-changed` so every 🆕 card invalidates together
// instead of one listener each, and every write funnels through the pure decisions in
// lib/onboarding.ts.
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sigmaBus } from '@/bridge';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { queryClient } from '@/lib/query';
import {
  daysInOnboarding, isComplete, nextState, nextStep, progressOf, stepsFromTemplate, waitAge,
  type OnboardingStepRow, type OnboardingTemplate,
} from '@/lib/onboarding';

export const ONBOARDING_QUERY_KEY = ['onboardingSteps'] as const;
export const ONBOARDING_CHANGED = 'onboarding-changed' as const;

export async function fetchOnboardingSteps(): Promise<OnboardingStepRow[]> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('onboarding_steps').select('*').order('seq', { ascending: true });
  if (error) throw error;
  return (data || []) as OnboardingStepRow[];
}

let listening = false;
function listenForOnboardingChanges(): void {
  if (listening || !sigmaBus) return;
  listening = true;
  sigmaBus.addEventListener(ONBOARDING_CHANGED, () => {
    void queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
  });
}

export function useOnboardingSteps() {
  React.useEffect(listenForOnboardingChanges, []);
  return useQuery({ queryKey: ONBOARDING_QUERY_KEY, queryFn: fetchOnboardingSteps });
}

export function emitOnboardingChanged(detail?: Record<string, unknown>): void {
  try { sigmaBus?.dispatchEvent(new CustomEvent(ONBOARDING_CHANGED, { detail })); } catch { /* no bus */ }
}

export function stepsForKibbutz(rows: OnboardingStepRow[] | null | undefined, kibbutz: string): OnboardingStepRow[] {
  return (rows || []).filter(r => r.kibbutz === kibbutz).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
}

// ───────────────────────────── writes ─────────────────────────────

/** Tapping a step cycles it — the caller is always exactly one `onboarding-changed` emit. */
export async function tapStep(step: OnboardingStepRow, waits: boolean): Promise<void> {
  const patch = nextState(step, waits);
  const sb = await getSupabase();
  await sbWrite(() => sb.from('onboarding_steps').update(patch).eq('id', step.id).select('id').single());
  emitOnboardingChanged({ id: step.id, state: patch.state });
}

/**
 * Wired into the create-kibbutz sheet (Task 1b): a fresh 🆕 לקוח חדש row spawns this
 * kibbutz's checklist off the active `onboarding_templates` row, right after the insert
 * succeeds. `upsert` with `ignoreDuplicates` makes a double-fire (e.g. a retried save) a
 * no-op instead of a unique-constraint error, since `(kibbutz, step_key)` is unique.
 */
export async function spawnOnboardingForNewKibbutz(kibbutz: string): Promise<void> {
  const sb = await getSupabase();
  const { data: tpl, error } = await sb.from('onboarding_templates').select('*').limit(1).maybeSingle();
  if (error || !tpl) return;   // no template configured yet — nothing to spawn
  const rows = stepsFromTemplate(tpl as OnboardingTemplate, kibbutz);
  if (!rows.length) return;
  await sb.from('onboarding_steps').upsert(rows, { onConflict: 'kibbutz,step_key', ignoreDuplicates: true });
  emitOnboardingChanged({ kibbutz, spawned: true });
}

// ───────────────────────────── template (⚙️ הגדרות, עידן only) ─────────────────────────────

export async function fetchOnboardingTemplate(): Promise<OnboardingTemplate | null> {
  const sb = await getSupabase();
  const { data, error } = await sb.from('onboarding_templates').select('*').limit(1).maybeSingle();
  if (error) throw error;
  return (data as OnboardingTemplate) || null;
}

/**
 * Saves the ORDER + LABELS + waits flags only. This never touches `onboarding_steps` —
 * already-spawned checklists are a frozen copy taken at create time (spec §4).
 */
export async function saveOnboardingTemplate(tpl: OnboardingTemplate, updatedBy: string): Promise<void> {
  const sb = await getSupabase();
  await sbWrite(() => sb.from('onboarding_templates')
    .update({ steps: tpl.steps, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq('id', tpl.id)
    .select('id').single());
}

// ───────────────────────────── UI ─────────────────────────────

/** A default `waits` guess per key when the spawned row's own `waits` flag isn't carried —
 *  the two "ממתין למייל" steps by their frozen `step_key`, everything else does not wait. */
const WAITS_KEYS = new Set(['customer_list', 'meter_login']);

export function OnboardingProgress({ kibbutz, canAct }: { kibbutz: string; canAct: boolean }) {
  const { data, isLoading } = useOnboardingSteps();
  const [busy, setBusy] = React.useState<string | null>(null);
  if (isLoading && !data) return null;
  const steps = stepsForKibbutz(data, kibbutz);
  if (!steps.length) return null;   // no template was spawned for this kibbutz — nothing to show

  const progress = progressOf(steps);
  const next = nextStep(steps);
  const days = daysInOnboarding(steps, new Date());
  const complete = isComplete(steps);

  const tap = async (step: OnboardingStepRow) => {
    if (!canAct || busy) return;
    setBusy(step.id || step.step_key);
    try { await tapStep(step, WAITS_KEYS.has(step.step_key)); }
    catch (e: any) { toast.error(e?.message || 'העדכון נכשל'); }
    finally { setBusy(null); }
  };

  return (
    <div className="card-onboarding mt-2.5 border-t border-dashed border-border pt-2" data-testid="onboarding-strip">
      <div className="mb-1 flex items-center gap-2 text-[12px]">
        <span className="font-bold text-muted-foreground">🆕 קליטה</span>
        <span className="onboarding-progress-label font-semibold text-foreground"><bdi>{progress.label}</bdi></span>
        <span className="text-muted-foreground">· <bdi>{days}</bdi> ימים בקליטה</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand-grad transition-[width]" style={{ width: progress.pct + '%' }} />
      </div>
      {next && (
        <button
          type="button"
          disabled={!canAct || !!busy}
          onClick={e => { e.stopPropagation(); void tap(next); }}
          className="onboarding-next-step mt-1.5 flex w-full items-center justify-between rounded-md px-1 py-0.5 text-[12.5px] text-foreground hover:bg-muted disabled:opacity-60"
          title={waitAge(next, new Date()) != null ? `ממתין ${waitAge(next, new Date())} ימים` : undefined}
        >
          <span>{next.label}</span>
          <span className="text-[11px] text-muted-foreground">
            {next.state === 'waiting' ? `⏳ ${waitAge(next, new Date())} ימים` : '○'}
          </span>
        </button>
      )}
      {complete && (
        <div className="mt-1 rounded-md bg-[color:var(--sigma-warn)]/10 px-2 py-1 text-[12px] font-semibold text-foreground">
          כל שלבי הקליטה הושלמו — להעביר לפעילים? (מתבצע בעריכת פרטי הקיבוץ ✏️)
        </div>
      )}
    </div>
  );
}

// Onboarding checklist — Task 27, company-process spec §4. Creating a kibbutz as 🆕 לקוח חדש
// spawns this checklist as `onboarding_steps`, frozen off the active `onboarding_templates`
// row. PURE — no DOM, no network, no React — same shape as internalTasks.ts / taskList.ts, so
// every decision here is a vitest golden instead of a click-through.
//
// Wait-states are a display state only for P4 (spec §3b: the Gmail label flow that would close
// them automatically is excluded) — a waiting step is closed manually, by tapping it again.

export interface TemplateStep {
  key: string;
  label: string;
  waits: boolean;
}

export interface OnboardingTemplate {
  id?: string;
  name: string;
  steps: TemplateStep[];
}

export type StepState = 'open' | 'waiting' | 'done';

export interface OnboardingStepRow {
  id?: string;
  kibbutz: string;
  step_key: string;
  label?: string | null;
  seq?: number | null;
  waits?: boolean;
  state: StepState;
  sent_at?: string | null;
  done_at?: string | null;
  created_at?: string | null;
}

/**
 * The insert rows for a freshly-created 🆕 kibbutz. `waits: true` on a step does NOT start it
 * in `waiting` — nobody has actually sent the request yet — it stays `open` until the step is
 * tapped (or a future Gmail hook sets `sent_at`). `waits` only changes what tapping the step
 * cycles through (see `nextState`).
 */
export function stepsFromTemplate(tpl: OnboardingTemplate, kibbutz: string): OnboardingStepRow[] {
  const steps = tpl?.steps || [];
  return steps.map((s, i) => ({
    kibbutz,
    step_key: s.key,
    label: s.label,
    seq: i,
    waits: !!s.waits,
    state: 'open' as StepState,
    sent_at: null,
    done_at: null,
  }));
}

export interface Progress {
  done: number;
  total: number;
  pct: number;
  label: string;
}

/** `5/9` — done count over total, plus a percentage for the bar's width. */
export function progressOf(steps: OnboardingStepRow[] | null | undefined): Progress {
  const list = steps || [];
  const total = list.length;
  const done = list.filter(s => s.state === 'done').length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { done, total, pct, label: `${done}/${total}` };
}

/** Whole days since the earliest `created_at` among the steps (the spawn moment). Built from
 *  Y/M/D parts (methodology): UTC-midnight diff, immune to a DST boundary shifting local time. */
export function daysInOnboarding(steps: OnboardingStepRow[] | null | undefined, now: Date): number {
  const list = (steps || []).filter(s => s.created_at);
  if (!list.length) return 0;
  const earliest = list.reduce((min, s) => (String(s.created_at) < min ? String(s.created_at) : min), String(list[0].created_at));
  const start = utcMidnight(earliest);
  const today = utcMidnight(now.toISOString());
  return Math.max(0, Math.round((today - start) / 86400000));
}

/** Days since `sent_at` for a waiting step — null when the step isn't `waiting`. */
export function waitAge(step: OnboardingStepRow | null | undefined, now: Date): number | null {
  if (!step || step.state !== 'waiting' || !step.sent_at) return null;
  const start = utcMidnight(step.sent_at);
  const today = utcMidnight(now.toISOString());
  return Math.max(0, Math.round((today - start) / 86400000));
}

function utcMidnight(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Date.UTC(y, m - 1, d);
}

/** The first non-done step, in `seq` order — the card's one-line hint. Null when complete. */
export function nextStep(steps: OnboardingStepRow[] | null | undefined): OnboardingStepRow | null {
  const list = (steps || []).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return list.find(s => s.state !== 'done') || null;
}

/** All nine done → the card OFFERS "העבר לפעילים". Never auto-flips the section itself. */
export function isComplete(steps: OnboardingStepRow[] | null | undefined): boolean {
  const list = steps || [];
  return list.length > 0 && list.every(s => s.state === 'done');
}

/**
 * Tapping a step cycles its state. A `waits` step (sent_at now stamped on the way into
 * 'waiting') goes open → waiting → done → open; a step that never waits skips 'waiting'
 * entirely (open → done → open), since there is nothing to wait on.
 */
export function nextState(step: OnboardingStepRow, waits: boolean): { state: StepState; sent_at?: string | null; done_at?: string | null } {
  const now = new Date().toISOString();
  if (step.state === 'open') {
    if (waits) return { state: 'waiting', sent_at: now };
    return { state: 'done', done_at: now };
  }
  if (step.state === 'waiting') return { state: 'done', done_at: now };
  // 'done' → back to 'open' (undo a mistaken tap).
  return { state: 'open', sent_at: null, done_at: null };
}

/** Every employee reads; only עידן edits the template (spec §4: "template editable by עידן"). */
export function canEditTemplate(user: string): boolean {
  return String(user || '').trim() === 'עידן';
}

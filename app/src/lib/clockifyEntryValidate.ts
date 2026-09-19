// Pure validator for the clockify `entry` action's server-side input checks
// (supabase/functions/clockify/index.ts `createEntry`). Kept here — instead of only inline in the
// Deno function — so the validation rules are node-testable with vitest (Deno edge functions
// aren't runnable under vitest). The Deno function mirrors this exact logic; if you change the
// rules here, change them there too (see task-29-review.md Important #1).
//
// Error strings are ASCII codes (no Hebrew), matching the `{error}` shape used by
// supabase/functions/github/index.ts — never user-facing prose, just a stable code.

export type ClockifyTag = { id: string; name?: string };
export type ClockifyProject = { id: string; name?: string };

export type ClockifyEntryInput = {
  start?: unknown;
  end?: unknown;
  description?: unknown;
  tagIds?: unknown;
  projectId?: unknown;
  billable?: unknown;
};

export type ValidateEntryOptions = {
  tags: ClockifyTag[];
  projects: ClockifyProject[];
  person: unknown;
  now?: number; // ms epoch, defaults to Date.now() — injectable for tests
};

export type ValidatedEntry = {
  start: string;
  end: string;
  description: string;
  billable: boolean;
  projectId: string | null;
  tagIds: string[];
};

export type ValidateEntryResult =
  | { ok: true; entry: ValidatedEntry }
  | { ok: false; error: string };

/** Allowed callers of the `entry` action — defence-in-depth alongside the EMS gate (the
 * function cannot otherwise prove which EMS user is calling: the pass is a shared "valid EMS
 * login" token, not a per-user identity claim — see task-29-review.md Important #2). */
export const ALLOWED_ENTRY_PERSONS = ["עידן", "מתניה"];

export const MAX_DESCRIPTION_LEN = 300;
export const MAX_DURATION_MS = 16 * 60 * 60 * 1000; // 16h
export const FUTURE_SLACK_MS = 5 * 60 * 1000; // 5min clock-skew allowance

export function validateEntryInput(entry: ClockifyEntryInput, opts: ValidateEntryOptions): ValidateEntryResult {
  const now = opts.now ?? Date.now();

  if (!ALLOWED_ENTRY_PERSONS.includes(String(opts.person || ""))) {
    return { ok: false, error: "forbidden_person" };
  }

  const startMs = Date.parse(String(entry?.start ?? ""));
  if (!Number.isFinite(startMs)) return { ok: false, error: "invalid_start" };
  const endMs = Date.parse(String(entry?.end ?? ""));
  if (!Number.isFinite(endMs)) return { ok: false, error: "invalid_end" };

  if (!(startMs < endMs)) return { ok: false, error: "end_before_start" };
  if (endMs - startMs > MAX_DURATION_MS) return { ok: false, error: "duration_too_long" };
  if (endMs > now + FUTURE_SLACK_MS) return { ok: false, error: "entry_in_future" };

  const description = String(entry?.description ?? "").trim();
  if (description.length > MAX_DESCRIPTION_LEN) return { ok: false, error: "description_too_long" };

  let projectId: string | null = null;
  if (entry?.projectId != null && entry.projectId !== "") {
    const pid = String(entry.projectId);
    if (!opts.projects.some((p) => p.id === pid)) return { ok: false, error: "invalid_project" };
    projectId = pid;
  }

  let tagIds: string[] = [];
  if (Array.isArray(entry?.tagIds) && entry.tagIds.length) {
    const known = new Set(opts.tags.map((t) => t.id));
    tagIds = (entry.tagIds as unknown[]).map(String).slice(0, 50);
    for (const id of tagIds) {
      if (!known.has(id)) return { ok: false, error: "invalid_tag" };
    }
  }

  return {
    ok: true,
    entry: {
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      description,
      billable: !!entry?.billable,
      projectId,
      tagIds,
    },
  };
}

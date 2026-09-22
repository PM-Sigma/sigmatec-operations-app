// ▶ / ■ hours per kibbutz (Task 29 — spec §6 + the closed §8b ruling).
//
// Everything here is a plain function over plain values: no React, no network, no secrets.
// The credentials live ONLY in the `clockify` edge function; this file decides who may track
// time, how long a session has been running, what the entry text is and which ids it carries.
// That is why the rules are all goldens (clockify.test.ts) and WorkTimer.tsx stays a shell.
//
// COPY RULE: this module is ALSO the Edge Function's — supabase/functions/push-send/clockify.ts
// is a BYTE-IDENTICAL copy (Deno cannot import out of app/src), because the server push that
// says "the clock is still running" must apply the SAME two-hour rule the screen applies.
// test-timer-push.mjs fails the build on any drift: edit this file and copy it over. That is
// also why the module stays IMPORT-FREE.
//
// SECRETS: there is deliberately no `CLOCKIFY_` string in this bundle — the sweep in
// clockify.test.ts / the QA gate asserts it. The app sends `{action}` to the function and the
// function holds the key.

export const TAGS_KEY = 'sigma_clockify_tags_v1';
export const RUNNING_KEY = 'sigma_clockify_running_v1';

export interface ClockifyTag { id: string; name: string }
export interface ClockifyProject { id: string; name: string; billable?: boolean }

/** A timer that is ticking right now. All it needs to survive a reload is the first three
 *  fields; the rest arrived on 22.9 (עידן, E1) and are optional. */
export interface RunningSession {
  person: string;
  kibbutz: string;
  /** ISO — the ONLY source of the elapsed time, so a reload never restarts the clock. */
  started_at: string;
  /** ISO while paused; absent while running. */
  paused_at?: string;
  /** Milliseconds spent paused so far (closed pauses only). */
  paused_ms?: number;
  /** Filled while the clock runs (the running-timer sheet); the stop sheet starts from them. */
  attendees?: string[];
  tags?: string[];
  note?: string;
  /** Set once the 2 h auto-stop fired, so it fires once. */
  auto_stopped?: boolean;
  /**
   * The `work_sessions` row this clock has had since ▶ (22.9, the server-push ruling).
   * The row is opened with `ended_at = null` the moment the timer starts, so the nudge can
   * reach a phone that has been in a pocket for two hours — a screen that is never opened
   * cannot remind anybody. ■ UPDATEs this row, 🗑 deletes it.
   *
   * Absent = the insert was refused (no pass, no network). The clock still runs and the stop
   * sheet falls back to an INSERT; hours are never lost because a write blinked.
   */
  row_id?: string;
}

/** A clock left open this long is paused by itself and the person is told (עידן 22.9, E1). */
export const AUTO_STOP_MS = 2 * 60 * 60_000;

/** Seconds actually worked: since the start, minus the closed pauses, minus the open one. */
export function elapsedFor(s: RunningSession, now: number = Date.now()): number {
  const t = Date.parse(s.started_at);
  if (!Number.isFinite(t)) return 0;
  const end = s.paused_at && Number.isFinite(Date.parse(s.paused_at)) ? Date.parse(s.paused_at) : now;
  return Math.max(0, Math.floor((end - t - (s.paused_ms || 0)) / 1000));
}

export function pauseSession(s: RunningSession, now: number = Date.now()): RunningSession {
  if (s.paused_at) return s;
  return { ...s, paused_at: new Date(now).toISOString() };
}

export function resumeSession(s: RunningSession, now: number = Date.now()): RunningSession {
  if (!s.paused_at) return s;
  const p = Date.parse(s.paused_at);
  const add = Number.isFinite(p) ? Math.max(0, now - p) : 0;
  const { paused_at: _drop, ...rest } = s;
  return { ...rest, paused_ms: (s.paused_ms || 0) + add };
}

/** Has the clock worked AUTO_STOP_MS without being stopped? (paused clocks never fire) */
export function autoStopDue(s: RunningSession, now: number = Date.now()): boolean {
  if (s.paused_at || s.auto_stopped) return false;
  return elapsedFor(s, now) * 1000 >= AUTO_STOP_MS;
}

/** The pause that the auto-stop applies: paused at exactly start + 2 h of work, flagged. */
export function autoStop(s: RunningSession): RunningSession {
  const t = Date.parse(s.started_at) + (s.paused_ms || 0) + AUTO_STOP_MS;
  return { ...s, paused_at: new Date(t).toISOString(), auto_stopped: true };
}

/** The end of a session for the row: start + the seconds worked, so pauses are not billed. */
export function endedAtFor(s: RunningSession, now: number = Date.now()): string {
  return new Date(Date.parse(s.started_at) + elapsedFor(s, now) * 1000).toISOString();
}

// ─────────────────── the server nudge: a clock nobody stopped (22.9) ───────────────────
//
// The in-app auto-stop only fires while a screen is open. The row opened at ▶ is what makes
// the SAME promise keepable with the phone closed: `push-send` mode `timerStale` runs every
// five minutes (db/cron_timer_5min.sql), reads the open rows and hands them to the selector
// below. The rules live HERE, as one pure function with goldens, exactly the way the visit
// nudge's `visitCronSelect` does — never spread through the handler.

/** An open `work_sessions` row, as the cron reads it. */
export interface TimerRow {
  id: string;
  person: string;
  kibbutz: string | null;
  started_at: string;
  /** Milliseconds this clock spent paused — NOT worked, so never counted toward the 2 h. */
  paused_ms?: number | null;
  /** Set while the clock is ⏸. A paused clock never buzzes — the same rule `autoStopDue` keeps. */
  paused_at?: string | null;
  /** Set once the nudge went out, so a row buzzes at most once. */
  reminded_at?: string | null;
  ended_at?: string | null;
}

export interface TimerStalePick {
  id: string;
  person: string;
  kibbutz: string;
  started_at: string;
}

/**
 * The clocks that have now been running for two hours and have not been told about yet.
 *
 * A row qualifies when: it is still open (`ended_at` null), nothing was sent for it
 * (`reminded_at` null), it is not ⏸ paused, its start parses, and the time actually WORKED —
 * wall clock minus the closed pauses — has reached `AUTO_STOP_MS`. Same arithmetic as
 * `elapsedFor` / `autoStopDue`, so the phone and the server never disagree about when two
 * hours have passed.
 *
 * Oldest first: the person who has been running longest hears about it first.
 */
export function timerStaleSelect(rows: TimerRow[], now: number = Date.now()): TimerStalePick[] {
  const out: TimerStalePick[] = [];
  for (const r of rows || []) {
    if (!r || !r.id || !r.person) continue;
    if (r.ended_at) continue;
    if (r.reminded_at) continue;
    // ⏸ — he already knows about this clock; it is stopped on purpose.
    if (r.paused_at) continue;
    const t = Date.parse(String(r.started_at));
    if (!Number.isFinite(t)) continue;
    const worked = now - t - (Number(r.paused_ms) || 0);
    if (worked < AUTO_STOP_MS) continue;
    out.push({ id: r.id, person: r.person, kibbutz: String(r.kibbutz || '').trim(), started_at: r.started_at });
  }
  return out.sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
}

/** `HH:MM` in Israel — the only clock face either side of this feature may quote. */
export function israelHHMM(iso: string): string {
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(t));
  } catch { return ''; }
}

/**
 * The words the phone shows. Deliberately the same sentence the in-app toast uses ("עדכן את
 * השעון של …"), so the notification and the screen are one voice, and the body says since
 * when — the one fact he needs before deciding to close it or keep going.
 */
export function timerNudgeFor(kibbutz: string, startedAt: string): { title: string; body: string } {
  const where = String(kibbutz || '').trim();
  const since = israelHHMM(startedAt);
  return {
    title: 'עדכן את השעון של ' + (where || 'הקיבוץ'),
    body: since ? ('רץ מאז ' + since + ' — סגור אותו או המשך') : 'רץ כבר שעתיים — סגור אותו או המשך',
  };
}

/** Tags whose name contains the query (case-insensitive); all of them for an empty query. */
export function tagsMatching(tags: ClockifyTag[], query: string): ClockifyTag[] {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return tags || [];
  return (tags || []).filter(t => String(t.name).toLowerCase().includes(q));
}

/** What the stop sheet hands to the writer. Mirrors the `work_sessions` row. */
export interface SessionDraft {
  person: string;
  kibbutz: string;
  started_at: string;
  ended_at: string;
  tags: string[];
  attendees: string[];
  billable: boolean;
  note?: string;
}

export interface EntryPayload {
  description: string;
  start: string;
  end: string;
  billable: boolean;
  projectId: string | null;
  tagIds: string[];
}

// ───────────────────────────── who ─────────────────────────────

/**
 * The two people who bill hours against kibbutzim (עידן 18.9, spec §8b "Clockify (closed)").
 * The field technicians log arrivals and visits, not Clockify entries, and a viewer never
 * writes anything — so everyone else sees no control at all, not a disabled one.
 */
export const TIME_TRACKERS = ['עידן', 'מתניה'];

export function canTrackTime(user: string, isViewer: boolean): boolean {
  if (isViewer) return false;
  return TIME_TRACKERS.includes(String(user ?? '').trim());
}

// ───────────────────────────── the clock ─────────────────────────────

/** Seconds since `startedAt`. Never negative: a device whose clock jumped shows 00:00. */
export function elapsed(startedAt: string, now: number = Date.now()): number {
  const t = Date.parse(startedAt);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 1000));
}

/** `MM:SS` under an hour, `HH:MM:SS` above it — hours uncapped (a timer left on overnight). */
export function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// ───────────────────────────── the entry ─────────────────────────────

const norm = (s: string) => String(s ?? '').trim().toLowerCase();

/** Kibbutz → project, by NAME (creating a project is out of scope). No match → null. */
export function projectIdFor(kibbutz: string, projects: ClockifyProject[]): string | null {
  const want = norm(kibbutz);
  if (!want) return null;
  const hit = (projects || []).find(p => norm(p.name) === want);
  return hit ? hit.id : null;
}

/** Picked tag names → workspace ids, in the picked order. An unknown name is dropped. */
export function tagIdsFor(names: string[], tags: ClockifyTag[]): string[] {
  const byName = new Map((tags || []).map(t => [norm(t.name), t.id]));
  return (names || []).map(n => byName.get(norm(n))).filter((v): v is string => !!v);
}

/**
 * THE golden. `description = '<kibbutz> — <tags joined by ", ">'` (spec §8b), with an optional
 * note after a `·`. Empty tags must NOT leave a dangling `— `, and no kibbutz and no tags must
 * not leave a lone separator either — a Clockify report full of "— " is unreadable.
 */
export function entryPayload(
  s: SessionDraft,
  ctx: { projects: ClockifyProject[]; tags: ClockifyTag[] },
): EntryPayload {
  const kibbutz = String(s.kibbutz ?? '').trim();
  const tagNames = (s.tags || []).map(t => String(t ?? '').trim()).filter(Boolean);
  const head = [kibbutz, tagNames.join(', ')].filter(Boolean).join(' — ');
  const note = String(s.note ?? '').trim();
  const description = [head, note].filter(Boolean).join(' · ');
  return {
    description,
    start: new Date(s.started_at).toISOString(),
    end: new Date(s.ended_at).toISOString(),
    billable: !!s.billable,
    projectId: projectIdFor(kibbutz, ctx.projects || []),
    tagIds: tagIdsFor(tagNames, ctx.tags || []),
  };
}

// ───────────────────────────── the tag cache ─────────────────────────────

function readStore<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
function writeStore(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

/**
 * The workspace tag vocabulary, cached for an hour. The list is THEIRS — 87 tags in
 * Hebrew — and is never hard-coded here.
 *
 * Failure semantics matter more than freshness: if the fetch fails we serve the STALE list
 * rather than an empty picker, because "the API blinked" must not turn into "you cannot tag
 * your hours". With nothing cached at all it answers `[]` — the sheet then still saves the
 * session, just without tags.
 */
export async function tagsCached(
  fetcher: () => Promise<ClockifyTag[]>,
  now: number = Date.now(),
  ttlMin = 60,
): Promise<ClockifyTag[]> {
  const cached = readStore<{ at: number; tags: ClockifyTag[] }>(TAGS_KEY);
  const fresh = cached && Array.isArray(cached.tags) && now - (cached.at || 0) < ttlMin * 60_000;
  if (fresh) return cached!.tags;
  try {
    const tags = await fetcher();
    if (Array.isArray(tags)) {
      writeStore(TAGS_KEY, { at: now, tags });
      return tags;
    }
  } catch { /* fall through to the stale list */ }
  return (cached && Array.isArray(cached.tags)) ? cached.tags : [];
}

// ───────────────────────────── the running session ─────────────────────────────

type RunningMap = Record<string, RunningSession>;

/** The running session for this person, or null. Survives a reload — that IS the point. */
export function loadRunning(person: string): RunningSession | null {
  const all = readStore<RunningMap>(RUNNING_KEY) || {};
  const hit = all[String(person ?? '').trim()];
  return hit && hit.started_at ? hit : null;
}

export function saveRunning(s: RunningSession): void {
  const all = readStore<RunningMap>(RUNNING_KEY) || {};
  all[String(s.person ?? '').trim()] = s;
  writeStore(RUNNING_KEY, all);
}

export function clearRunning(person: string): void {
  const all = readStore<RunningMap>(RUNNING_KEY) || {};
  delete all[String(person ?? '').trim()];
  writeStore(RUNNING_KEY, all);
}

/**
 * The duplicate-start guard: one running session per person. Returns the kibbutz that is
 * already running (so the UI can offer to stop it) or null when starting here is fine.
 */
export function startBlockedBy(running: RunningSession | null, kibbutz: string): string | null {
  if (!running) return null;
  if (norm(running.kibbutz) === norm(kibbutz)) return null;
  return running.kibbutz;
}

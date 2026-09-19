// Typed access to the legacy app (window.sigma, defined in js/src/00-bridge.js).
// React NEVER touches any other global — every legacy call goes through here.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

export type SigmaRole = 'idan' | 'team' | 'viewer' | '';
// The pages that still exist. `ems`, `mytasks` and `staff` were retired in Task 14 (§7m
// R1/R2/R5): the EMS task list and "המשימות שלי" became the calendar's רשימה view, and עובדים
// is gone. Historic usage events still carry those page keys — that is data about the past,
// which is why app/src/lib/usageNarrative.ts keeps their labels.
// `burns` is the 🔥 צריבות full table (Task 23). It is a TEMPORARY project page with no
// nav tab — reached from the landing strip, the card-modal section and ⋯ עוד only — and it
// disappears with the rest of the project when BURNS_PROJECT_ACTIVE goes false.
export type SigmaPage =
  | 'kibbutz' | 'inventory' | 'attendance' | 'calendar' | 'dev' | 'pushlog' | 'burns';

export interface EmsTask {
  id: string;
  title: string;
  status: string;
  priority?: string;
  type?: string;
  site?: { id: string; name: string } | null;
  expectedCompletionDate?: string;
  /** Full task description — added to the shared cache slim row for the card widget (spec §4). */
  description?: string;
  assignee?: { id: string; firstName: string; lastName?: string } | null;
  linkCount?: number;
}

/** One day of a person's month, as the bridge hands it over (ISO date, merged). */
export interface AttendanceRow {
  date: string;
  type: string;
  kibbutz?: string;
  hours?: number;
  note?: string;
  source?: 'visit' | 'manual' | 'calendar';
}

/** A row of `company_holidays` (spec §7e). `required=false` → the day is never "missing". */
/** One office Google-Calendar event, as the `calendar` Edge Function returns it. */
export interface OfficeCalEvent {
  id: string;
  title: string;
  start: string | null;
  end?: string | null;
  allDay?: boolean;
  location?: string;
  description?: string;
  /** Google's Meet link — absent when the event has no conference data. */
  hangoutLink?: string | null;
}

export interface CompanyHoliday {
  date: string;
  name: string;
  kind: 'holiday' | 'chol_hamoed' | 'company_closure';
  required: boolean;
}

export interface Sigma {
  getCurrentUser(): string;
  getRole(): SigmaRole;
  isViewer(): boolean;
  isIdan(): boolean;
  isAdmin(): boolean;
  changeUser(): void;
  readonly ATT_PEOPLE: string[];

  showPage(page: SigmaPage): void;
  canShowPage(page: SigmaPage): boolean;

  /**
   * Usage analytics (spec §7j). Stamps person + current page and parks the event in the
   * shared queue; app/src/lib/track.ts drains it and owns the insert. Islands should call
   * `track()` from lib/track, which routes here when legacy is loaded.
   */
  track?(action: string, target?: string | null, page?: string | null): void;

  /** Live kibbutz names (not archived) — the day log's grounding list. */
  kibbutzNames?(): string[];
  /** Live product catalog names — the day log's grounding list. */
  productNames?(): string[];

  /**
   * The raw EMS proxy call. RESERVED for app/src/lib/ems/adapters/* — every feature goes
   * through `emsGateway()` (spec §7o) and a contract test in test-integration.mjs fails the
   * build if a new `sigma.emsApi(` shows up anywhere else.
   */
  emsApi(path: string, options?: RequestInit): Promise<any>;
  /** Queue-aware EMS write (`emsWriteOrQueue`). Also adapter-only — see `emsApi`. */
  emsWrite?(item: Record<string, unknown>): Promise<{ sent: boolean; id?: string | null; queued?: boolean; queueId?: string; error?: string }>;
  /**
   * The typed EMS gateway, installed on boot by the React bundle (lib/ems/gateway.ts
   * `installEmsBridge`). Legacy reaches EMS through this; undefined until ui/sigma.js runs.
   */
  ems?: import('@/lib/ems/gateway').EmsGateway;
  isEmsConnected(): boolean;
  emsCacheData(): { tasks: EmsTask[]; syncedAt?: string; syncedBy?: string };
  /** Open tasks for one kibbutz card, from the shared cache (site aggregation included). */
  emsCacheTasksForKibbutz(name: string): EmsTask[];
  /** The legacy EMS_STATUS/EMS_PRIORITY label maps (js/src/14-calendar.js) — display-text source of truth. */
  emsLabels(): { status: Record<string, string>; priority: Record<string, string> };
  emsSiteIdForKibbutz(name: string): Promise<string>;
  getEmsSites(): Promise<Array<{ id: string; name: string }>>;
  kibbutzHasSite(name: string): Promise<boolean>;
  openKibbutzEmsTask(id: string): void;
  /**
   * Refresh the SHARED EMS snapshot (spec §7k #10). `force` skips the 5-minute background
   * throttle — pull-to-refresh passes it; a bare call is a nudge the throttle may decline.
   * Resolves false when nothing happened, and never rejects. Islands reach it through
   * `refreshAll()` in app/src/lib/query.ts, not directly.
   */
  emsSync?(force?: boolean): Promise<boolean>;
  /** The raw EMS bearer — only for the `github` Edge Function, which gates on a valid EMS login. */
  emsToken?(): string;
  /** Open the legacy kibbutz modal for a card, optionally on a given tab ('meetings' | 'visit'). */
  openKibbutzModal(name: string, tab?: string): void;
  /** Re-run the legacy card-decorating passes after React re-rendered the cards. */
  decorateCards?(): void;

  /** The EMS-minted Supabase write pass as it stands now (no minting), or null. */
  sbPass?(): { token: string; exp: number } | null;
  /** Mint / re-mint that pass (force = discard the current one first). */
  sbAuthPass?(force?: boolean): Promise<{ token: string; exp: number } | null>;
  createTask(item: Record<string, unknown>): Promise<unknown>;

  openVisitQuick(kibbutz?: string): void;
  /**
   * Visit drafts (spec §5.1c). js/src/09-visits.js owns the draft — the form, the debounce
   * and both stores — so React only ever ASKS. Any argument may be omitted to widen the
   * match ("a draft for anyone, on any day").
   */
  visitDraftFor?(kibbutz?: string | null, person?: string | null, date?: string | null): {
    id: string; person: string; kibbutz: string; date: string; updated_at: string;
    payload?: Record<string, unknown>;
  } | null;
  visitDraftDiscard?(id?: string | null): void;
  getLastVisit(kibbutz: string): any;
  /**
   * 📝 יומן היום (spec §7i) — one confirmed card → one visit, through the form's OWN save path
   * (delivery-cert gate, stock movement, `visit-saved`). Never rejects; a refused card comes
   * back as `{ ok:false, error }` so the other cards still save.
   */
  saveVisitFromData?(visit: Record<string, unknown>):
    Promise<{ ok: boolean; id?: string; error?: string; needsCert?: boolean; visitId?: string }>;
  /** Comment on an EMS task — queued when offline, so a comment written in the field survives. */
  emsAddComment?(taskId: string, text: string, meta?: Record<string, unknown>):
    Promise<{ ok: boolean; queued?: boolean; error?: string }>;
  /**
   * The briefing's "לפני שיוצאים" leftovers (spec §5.1b, Task 5). React hands over the text
   * and the legacy form writes it into `#visitOpenItems` the moment the form is on screen —
   * and only while that field is still empty, so it can never overwrite what he typed.
   */
  prefillOpenItems?(kibbutz: string, text: string): void;
  loadAllVisitsCombined(): any[];
  openDeliveryCert(pre?: Record<string, unknown>): void;
  certFromVisitForm(): void;
  certFromVisit(visitId: string): void;

  toast(msg: string, opts?: Record<string, unknown>): void;

  /**
   * Session & access (spec §7n). `sessionExpired` is the ONE funnel every 401 goes through
   * (debounced in the legacy bundle, so a legacy 401 and an island 401 arriving together
   * still produce one `session-expired`); `beginReLogin` hands over to the sign-in, keeping
   * the page, the scroll position and the saved draft. Islands use app/src/lib/session.ts,
   * never these directly.
   */
  sessionExpired?(reason?: string): boolean;
  beginReLogin?(): void;
  /**
   * The ONE memoized mint promise (review fix 1), shared with every legacy read and write: an
   * island awaits it before its first request, so a cold boot never reads anon against the
   * authenticated-only tables and never mistakes that 401 for an expiry. `remintOnce` forces a
   * fresh pass for the single retry a 401 is allowed; `passPending` says a mint is in flight.
   */
  ensurePass?(): Promise<boolean>;
  remintOnce?(): Promise<boolean>;
  passPending?(): boolean;

  // ── attendance + holidays (spec §7e) ──────────────────────────────────────
  /** Save one day. The SAME write the legacy form makes (js/src/04-attendance-daily.js). */
  attSave?(entry: { person: string; date: string; dayType: string; note?: string }): Promise<unknown>;
  /** One merged row per day for (person, year, month). `month` is 1-12 here. */
  attRows?(person: string, year: number, month: number): AttendanceRow[];
  /** The session's holiday list as it stands, and the promise that loads it. */
  attHolidays?(): CompanyHoliday[];
  attHolidaysLoad?(): Promise<CompanyHoliday[]>;
  /** Who the report is about, and switching that (עידן / the viewer only). */
  attPerson?(): string;
  setAttPerson?(name: string): void;
  canSeeAttendance?(): boolean;
  /** Re-render the (hidden) legacy report — what the two export buttons read. */
  attRefresh?(): void;
  attExportPdf?(): void;
  attExportExcel?(): void;

  // ── ⚙️ הגדרות: install + notifications (spec §7h) ─────────────────────────
  // Both are BROWSER state, not app state: the install prompt is an event the page had to
  // capture before React existed, and the push subscription belongs to the service worker the
  // legacy boot registered. The settings island only asks and renders.
  /** Already running as an installed app. */
  isInstalled?(): boolean;
  /** The browser can actually install — a captured prompt, or iOS where the steps are it. */
  canInstall?(): boolean;
  appInstall?(): Promise<void> | void;
  /** One word for the 🔔 row. `ios-needs-install` = Safari, not on the home screen yet. */
  pushState?(): 'granted' | 'denied' | 'default' | 'ios-needs-install' | 'unsupported';
  /** Ask + subscribe. FROM A USER GESTURE ONLY. Resolves with the state after the answer. */
  pushEnable?(): Promise<'granted' | 'denied' | 'default' | 'unsupported' | 'error'>;
  /** 🔔 בדיקה — one notification to this device, through the service worker. */
  pushTest?(): Promise<boolean>;
  /** How many devices this person has registered for notifications. */
  pushDeviceCount?(): Promise<number>;
  /** 📋 הפערים — 🔔 on someone's row. The count only; the server owns the words and the cap. */
  gapNag?(person: string, count: number): Promise<boolean>;

  // ── 🗓️ calendar (spec §7f) ────────────────────────────────────────────────
  /** Office events in a day range, through the `calendar` Edge Function. Never throws. */
  calFetchEvents?(range: { from: string; to: string; force?: boolean }): Promise<OfficeCalEvent[]>;
  /** ➕ אירוע משרד. */
  calAddEvent?(ev: { title: string; start: string; end?: string | null; allDay?: boolean; description?: string; location?: string }): Promise<{ ok?: boolean; id?: string; error?: string }>;
  /** PATCH one EMS task (the scheduler + its undo). The ONE EMS write path. */
  emsPatchTask?(id: string, body: Record<string, unknown>): Promise<any>;
  /** A whole batch of PATCHes with ONE cache resync at the end. */
  emsPatchTasks?(patches: Array<{ id: string; body: Record<string, unknown> }>): Promise<{ ok: number; failed: Array<{ id: string; error: string }> }>;
  /** Told once, when the island mounts: the legacy month grid folds away. */
  calIslandMounted?(): void;

  // ── רשימה — the calendar's third view (spec §7g, Task 14) ─────────────────
  /**
   * Who may act on EMS at all (`EMS_USERS`, js/src/11-search-login.js). The retired EMS page
   * was gated on this; the Ctrl+K actions that replaced its two header buttons ask the same
   * question, so the retirement widens nobody's reach.
   */
  canUseEms?(): boolean;
  /**
   * ✓ סיים and any other status change from a row. Queue-aware (js/src/14-calendar.js
   * `changeEmsStatus`): offline it is parked and applied on the next connect, which is the
   * same promise the visit form makes. One writer, and it is the legacy one.
   */
  emsSetStatus?(id: string, status: string): Promise<void> | void;
  /** ➕ משימה חדשה — the surviving create modal, optionally scoped to a site. */
  emsCreateTask?(siteId?: string): Promise<void> | void;
  /** ניתוק EMS (was the retired EMS page's header button; now a Ctrl+K action). */
  emsDisconnect?(): void;
  /** 📍 דוח ביקורים / 📊 פעילות היום — the two launchers the retired משימות page carried. */
  openVisitsReport?(): void;
  openActivity?(): void;
  /** One person's WhatsApp number, from the legacy CONTACTS map (js/src/12-reports.js). */
  contactPhone?(person: string): string;
  /**
   * The retired home block's three lists, straight from the settings snapshot. Read ONLY as
   * the fallback for the "חברה" group until the `internal_tasks` rows exist (§7m R3).
   */
  companyTasks?(): { orders?: string[]; info?: string[]; guidelines?: string[] } | null;
  /** ✉️ הודעה לעובד — the `messages` table (js/src/17-messages.js). */
  staffSendMessage?(toPerson: string, text: string): Promise<void>;
  /** The people a message can be left for. */
  readonly STAFF_PEOPLE?: string[];

  /**
   * Ctrl+K (§7k.1). ASSIGNED BY React (islands/CommandBar.tsx), not by the legacy bridge —
   * it is the one entry that travels the other way, so the legacy header search and the
   * phone search field can open the merged list instead of carrying their own result UI.
   * Optional: with no island mounted, the callers simply do nothing.
   */
  openCommandBar?(): void;

  /**
   * The first screen per role (§7l) calls this hook once it has chosen, for every role.
   * Task 5 attaches the field arrival sheet to it — nothing in Task 4 assigns it.
   */
  onLanding?(target: { page: SigmaPage; scrollTo?: string }, role: string): void;
}

export const sigma = (globalThis as any).sigma as Sigma;
export const sigmaBus: EventTarget = (globalThis as any).sigmaBus;

export type SigmaEvent =
  | 'user-changed' | 'ems-cache-synced' | 'visit-saved' | 'theme-changed'
  // fired by switchTab('visit') — the moment the legacy visit form is on screen, which is
  // what the 🚚 quick action waits for before asking for a delivery certificate.
  | 'visit-form-open'
  // a meeting note was imported / linked to an EMS task / marked done — every surface that
  // shows bullets refetches ['meetingNotes'] (docs/integration-map.md)
  | 'notes-changed'
  // the outbound EMS queue drained. `detail.created = [{queueId, taskId}]` for every
  // createTask that went out, so a note stamped `pending:<queueId>` can pick up its real id.
  | 'ems-queue-flushed'
  // a feedback was sent, its status flipped, or a bug became a dev-board card — the 📣 inbox
  // refetches ['feedback'] (docs/integration-map.md)
  | 'feedback-changed'
  // a field worker checked in at a kibbutz (islands/Field.tsx). Consumers: the "היום" strip
  // and anything that wants to know he is on site (docs/integration-map.md)
  | 'checkin-created'
  // js/src/09-visits.js wrote / restored / discarded a draft (spec §5.1c)
  | 'visit-draft-changed'
  // a day was saved on the attendance page, from either half (spec §7e). Consumers: the
  // attendance island's month + KPIs (docs/integration-map.md)
  | 'attendance-saved'
  // the session's 🕎 holiday list landed in SHEET_DATA.holidays (js/src/04-attendance-daily.js)
  | 'holidays-loaded'
  // the route for one (person, date) was reordered in the calendar (spec §7f). Consumer:
  // the arrival sheet + the "היום" strip, which order by the same day_plans row
  | 'dayplan-changed'
  // a 401 anywhere (EMS, supabase-js, the legacy reads) — ONE per expiry, debounced by
  // js/src/00-bridge.js. Consumer: components/ReLoginSheet.tsx (docs/integration-map.md)
  | 'session-expired'
  // islands/Home.tsx wrote the kibbutz list to `window.KIBBUTZIM` + `localStorage.kibbutzim_v1`
  // (Task 20). Neither store notifies anyone, so a reader that SNAPSHOTS them — Ctrl+K builds
  // its source list once per open — needs telling when the list finally lands. Consumer:
  // islands/CommandBar.tsx (docs/integration-map.md)
  | 'kibbutzim-published'
  // ── added by the Task 18 sweep ───────────────────────────────────────────────
  // All four were already being emitted with the union never updated, so TypeScript could not
  // spell-check them and docs/integration-map.md never listed them.
  // 🔥 a burn was marked נצרב / בעיה / גנרטור (components/home/Burns.tsx). Consumer: the legacy
  // 🔥 צריבות table (js/src/24-meter-burns.js) re-renders.
  | 'burns-changed'
  // 🔒 an internal task was added, closed or reassigned (components/home/InternalTasks.tsx)
  | 'internal-tasks-changed'
  // a kibbutz onboarding step was ticked (components/home/OnboardingProgress.tsx)
  | 'onboarding-changed'
  // ▶/■ שעות: a work session was stopped and written (components/home/WorkTimerStopSheet.tsx).
  // ANNOUNCE-ONLY, like `checkin-created`: the island that emits invalidates its own query, and
  // the event exists so a surface added later hears about the write without that island having
  // to learn who its readers are. test-integration.mjs holds the announce-only list — an event
  // that is neither consumed nor on that list fails the build, so the choice stays deliberate.
  | 'work-session-saved';

/** Subscribe to a legacy → React event for the lifetime of the component. */
export function useSigmaEvent(name: SigmaEvent, handler: (e: CustomEvent) => void): void {
  // The handler is kept in a ref so callers can pass an inline arrow: the listener is
  // attached once per event name, not detached and re-attached on every render.
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!sigmaBus) return;
    const fn = (e: Event) => ref.current(e as CustomEvent);
    sigmaBus.addEventListener(name, fn);
    return () => sigmaBus.removeEventListener(name, fn);
  }, [name]);
}

function subscribeUser(cb: () => void) {
  sigmaBus?.addEventListener('user-changed', cb);
  return () => sigmaBus?.removeEventListener('user-changed', cb);
}

/** Current user + role, re-rendered whenever legacy announces 'user-changed'. */
export function useCurrentUser(): { name: string; role: SigmaRole; isViewer: boolean } {
  const name = useSyncExternalStore(subscribeUser, () => sigma?.getCurrentUser() ?? '', () => '');
  const role = useSyncExternalStore(subscribeUser, () => sigma?.getRole() ?? '', () => '' as SigmaRole);
  return { name, role, isViewer: role === 'viewer' };
}

/**
 * EMS connection state, refreshed on every cache sync and on a sign-in / sign-out (the moments
 * it can flip mid-session) — and on `session-expired`, since an expiry IS the connection
 * flipping off (spec §7n).
 *
 * Read off `window.sigma` rather than the captured const: the §7n gate asks this on the first
 * render of every island, which can be before the legacy bundle finished defining the bridge.
 */
function emsConnectedNow(): boolean {
  try { return !!(window as any).sigma?.isEmsConnected?.(); } catch { return false; }
}

export function useEmsConnected(): boolean {
  const [on, setOn] = useState(emsConnectedNow);
  useSigmaEvent('ems-cache-synced', () => setOn(emsConnectedNow()));
  useSigmaEvent('user-changed', () => setOn(emsConnectedNow()));
  useSigmaEvent('session-expired', () => setOn(emsConnectedNow()));
  return on;
}

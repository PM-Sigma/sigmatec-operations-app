// `ems-rest` — the ONLY place in app/src that may build an EMS URL or read raw EMS JSON.
//
// Transport: `sigma.emsApi`, the legacy Apps-Script proxy (js/src/12-reports.js). It already
// owns the per-request EMS bearer, the 20 s abort, the `(NNN) message` error shape and the ONE
// debounced `session-expired` funnel on 401 — so the adapter deliberately does NOT re-implement
// any of that. Writes go through `sigma.emsWrite` = the legacy `emsWriteOrQueue`, which keeps
// the offline queue semantics byte-identical (queue on connectivity/expiry, surface a 4xx).
//
// Every URL below is the URL the pre-gateway call site used, character for character; the
// builders are exported so `rest.test.ts` can pin them as goldens.
import { sigma } from '@/bridge';
import type {
  CreateTaskInput, EmsCapabilities, EmsComment, EmsMeter, EmsSite, EmsTask, EmsUser,
  ListTasksQuery, TaskPatch, WriteResult,
} from '../types';
import type { EmsGateway } from '../gateway';

// ───────────────────────────── response unwrapping ─────────────────────────────

/** EMS wraps a list in `{items|data|results|rows}` or returns it bare (the legacy unwrap). */
export function unwrapList(res: any): any[] {
  if (Array.isArray(res)) return res;
  for (const key of ['items', 'data', 'results', 'rows']) {
    if (Array.isArray(res?.[key])) return res[key];
  }
  return [];
}

/** A single resource sits at the top level or under `data` (legacy `emsCreatedId`). */
export function unwrapOne(res: any): any { return (res && res.data) || res || null; }

const str = (v: unknown) => (v == null ? '' : String(v));

// ───────────────────────────── raw JSON → app types ─────────────────────────────

export function mapSite(r: any): EmsSite { return { id: str(r?.id), name: str(r?.name) }; }

export function mapMeter(r: any): EmsMeter {
  return {
    id: str(r?.id),
    name: str(r?.name),
    serial: str(r?.serialNumber ?? r?.serial_number ?? r?.serial),
    energyCode: str(r?.energy_type_code ?? r?.energyTypeCode ?? r?.energyType?.code),
    siteId: str(r?.siteId ?? r?.site_id ?? r?.site?.id),
  };
}

export function mapTask(r: any): EmsTask {
  return {
    id: str(r?.id),
    title: str(r?.title),
    description: str(r?.description),
    status: str(r?.status),
    priority: str(r?.priority),
    type: str(r?.type),
    site: r?.site ? mapSite(r.site) : null,
    assignee: r?.assignee
      ? { id: str(r.assignee.id), firstName: str(r.assignee.firstName), lastName: str(r.assignee.lastName) }
      : null,
    expectedCompletionDate: str(r?.expectedCompletionDate),
    // The legacy readers tried both casings in this order; keeping it here means
    // `oldestOpenTaskDays` sees exactly what it saw before the gateway.
    createdAt: str(r?.createdAt ?? r?.created_at),
    updatedAt: str(r?.updatedAt ?? r?.updated_at),
  };
}

export function mapComment(r: any): EmsComment {
  const a = r?.author || r?.user || r?.createdBy;
  return {
    id: str(r?.id),
    message: str(r?.message ?? r?.text ?? r?.body),
    createdAt: str(r?.createdAt ?? r?.created_at),
    author: typeof a === 'string' ? a : [str(a?.firstName), str(a?.lastName)].filter(Boolean).join(' '),
  };
}

export function mapUser(r: any): EmsUser {
  const first = str(r?.firstName), last = str(r?.lastName);
  return { id: str(r?.id), firstName: first, lastName: last, name: [first, last].filter(Boolean).join(' ') };
}

// ───────────────────────────── URL builders (the goldens) ─────────────────────────────

export const OPEN_STATUSES = ['open', 'in_progress', 'pending'];

export const URLS = {
  sites: () => '/sites',
  meters: (siteId: string, take = 500) => '/meters?siteId=' + encodeURIComponent(siteId) + '&take=' + take,
  meter: (id: string) => '/meters/' + id,
  tasks: (q: ListTasksQuery = {}) => {
    const statuses = (q.statuses && q.statuses.length ? q.statuses : OPEN_STATUSES).join(',');
    const take = q.take == null ? 100 : q.take;
    return '/employee-tasks?'
      + (q.siteId ? 'siteId=' + encodeURIComponent(q.siteId) + '&' : '')
      + 'statuses=' + statuses + '&take=' + take;
  },
  task: (id: string) => '/employee-tasks/' + id,
  comments: (id: string) => '/employee-tasks/' + id + '/comments',
  users: () => '/users?roles=admin&statuses=active&take=200&sortBy=firstName&sortOrder=ASC',
};

/** What the REST transport can do. The three `false`s are operations the EMS REST API
 *  simply does not expose — the UI hides those buttons instead of showing a dead one. */
export const REST_CAPABILITIES: EmsCapabilities = {
  listSites: true, listMeters: true, getMeter: true,
  listOpenTasks: true, getTask: true, createTask: true, updateTask: true,
  listComments: true, addComment: true, listUsers: true,
  listAlerts: false, energyBalance: false, billingSummary: false,
};

// ───────────────────────────── the adapter ─────────────────────────────

/** The transport primitives the adapter needs. Injected so every operation is testable
 *  without a browser, a bridge or a network. */
export interface RestTransport {
  emsApi(path: string, options?: RequestInit): Promise<any>;
  emsWrite(item: Record<string, unknown>): Promise<WriteResult>;
  isConnected(): boolean;
  getSites(): Promise<Array<{ id: string; name: string }>>;
}

function bridgeTransport(): RestTransport {
  return {
    emsApi: (path, options) => sigma.emsApi(path, options),
    emsWrite: (item) => (sigma as any).emsWrite(item),
    isConnected: () => { try { return !!sigma.isEmsConnected(); } catch { return false; } },
    // `getEmsSites` is the legacy cached site list — the same one emsChain used, so the
    // gateway does not double the /sites traffic.
    getSites: () => sigma.getEmsSites(),
  };
}

export function restAdapter(t: RestTransport = bridgeTransport()): EmsGateway {
  const caps = { ...REST_CAPABILITIES };
  return {
    transport: 'rest',
    capabilities: () => ({ ...caps }),
    isConnected: () => t.isConnected(),

    async listSites() { return ((await t.getSites()) || []).map(mapSite); },

    async listMeters(siteId, opts) {
      return unwrapList(await t.emsApi(URLS.meters(siteId, opts?.take ?? 500))).map(mapMeter);
    },
    async getMeter(id) {
      const one = unwrapOne(await t.emsApi(URLS.meter(id)));
      return one && one.id != null ? mapMeter(one) : null;
    },

    async listOpenTasks(q) { return unwrapList(await t.emsApi(URLS.tasks(q))).map(mapTask); },
    async getTask(id) {
      const one = unwrapOne(await t.emsApi(URLS.task(id)));
      return one && one.id != null ? mapTask(one) : null;
    },
    createTask(input: CreateTaskInput) { return t.emsWrite({ kind: 'createTask', ...input }); },
    updateTask(id, patch: TaskPatch) { return t.emsWrite({ kind: 'patch', taskId: id, patch }); },

    async listComments(taskId) { return unwrapList(await t.emsApi(URLS.comments(taskId))).map(mapComment); },
    addComment(taskId, text) { return t.emsWrite({ kind: 'comment', taskId, message: text }); },

    async listUsers() { return unwrapList(await t.emsApi(URLS.users())).map(mapUser); },

    // Unsupported by REST. They resolve `null` (= "no answer"), never throw: the callers are
    // overview surfaces, and `capabilities()` is what a BUTTON is supposed to consult.
    async listAlerts() { return null; },
    async energyBalance() { return null; },
    async billingSummary() { return null; },
  };
}

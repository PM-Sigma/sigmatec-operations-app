// App-owned EMS types (spec §7o). NOTHING here is raw API JSON: the REST shapes are mapped in
// `adapters/rest.ts` and only these types cross into features, so an `ems-mcp` adapter can be
// dropped in later without a single feature file changing.

/** An EMS site (a kibbutz's installation). */
export interface EmsSite { id: string; name: string }

/** One meter. `energyCode` is the EMS energy_type_code: 1 חשמל · 2 מים · 3 גז. */
export interface EmsMeter {
  id: string;
  name: string;
  serial: string;
  energyCode: string;
  siteId: string;
}

export interface EmsPerson { id: string; firstName: string; lastName: string }

/** One employee task ("פנייה"). */
export interface EmsTask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  type: string;
  site: EmsSite | null;
  assignee: EmsPerson | null;
  expectedCompletionDate: string;
  /** ISO instants, '' when the API did not send them. */
  createdAt: string;
  updatedAt: string;
}

export interface EmsComment { id: string; message: string; createdAt: string; author: string }

export interface EmsUser { id: string; firstName: string; lastName: string; name: string }

/** Filter for `listOpenTasks`. Omitted fields are simply not sent. */
export interface ListTasksQuery {
  siteId?: string;
  /** EMS status slugs. Defaults to the open set (open,in_progress,pending). */
  statuses?: string[];
  take?: number;
}

/** What a feature may ask the gateway to create. Resolution of kibbutz → siteId and of an
 *  assignee NAME → id happens inside the adapter at send time, exactly as the legacy queue did. */
export interface CreateTaskInput {
  title: string;
  description?: string;
  taskType?: string;
  priority?: string;
  siteId?: string;
  kibbutz?: string;
  assigneeName?: string;
}

/** A partial update. Only the keys present are sent. */
export interface TaskPatch {
  status?: string;
  expectedCompletionDate?: string;
  assigneeUserId?: string;
  title?: string;
  description?: string;
  priority?: string;
}

/**
 * The result of a WRITE. Byte-identical to what `emsWriteOrQueue` has always returned, because
 * writes keep going through the same offline queue — the queue is a gateway concern (§7o) but
 * its semantics do not change with this task.
 */
export interface WriteResult { sent: boolean; id?: string | null; queued?: boolean; queueId?: string; error?: string }

/**
 * One item for `EmsGateway.queueOffline` — the exact shape 13-ems.js's own offline queue has
 * always stored (`{kind, taskId, message?|status?}`), pushed straight in with no network and
 * no re-shaping, so `emsQueueFlush`'s replay (13-ems.js, on the next connect) treats it exactly
 * like an item `emsQueueAdd` parked locally on its own.
 */
export interface OfflineQueueItem {
  kind: 'comment' | 'status';
  taskId: string;
  message?: string;
  status?: string;
}

/**
 * Which operations the ACTIVE transport can actually perform. The UI asks before it draws a
 * button (§7o: "no purposeless buttons"). REST answers false for the three operations the EMS
 * REST API does not expose today; an MCP adapter will answer from the tool list it is given.
 */
export interface EmsCapabilities {
  listSites: boolean;
  listMeters: boolean;
  getMeter: boolean;
  listOpenTasks: boolean;
  getTask: boolean;
  createTask: boolean;
  updateTask: boolean;
  listComments: boolean;
  addComment: boolean;
  listUsers: boolean;
  listAlerts: boolean;
  energyBalance: boolean;
  billingSummary: boolean;
}

export type EmsOperation = keyof EmsCapabilities;

/** Raised by an operation the active transport does not support. */
export class EmsUnsupported extends Error {
  constructor(public operation: EmsOperation, transport: string) {
    super(`EMS ${transport}: operation "${operation}" is not supported`);
    this.name = 'EmsUnsupported';
  }
}

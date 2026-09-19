// The ONE door to the EMS (spec §7o). Features import `emsGateway()` and call typed
// operations; they never build a URL, never touch `sigma.emsApi` and never see raw API JSON.
// A future `ems-mcp` adapter implements this same interface and the features do not change.
//
// Contract enforced by test-integration.mjs: no `emsApi(` / EMS `fetch(` anywhere in app/src
// except `lib/ems/adapters/*` (plus a shrinking legacy allowlist).
import { sigma } from '@/bridge';
import type {
  CreateTaskInput, EmsCapabilities, EmsComment, EmsMeter, EmsSite, EmsTask, EmsUser,
  ListTasksQuery, TaskPatch, WriteResult,
} from './types';
import { restAdapter } from './adapters/rest';

export interface EmsGateway {
  /** `rest` today; `mcp` once the EMS MCP server exists. */
  readonly transport: string;
  /** What this transport can do — ask before drawing a button (§7o). */
  capabilities(): EmsCapabilities;
  /** Is there a live EMS session right now? Every read below returns empty without one. */
  isConnected(): boolean;

  listSites(): Promise<EmsSite[]>;
  listMeters(siteId: string, opts?: { take?: number }): Promise<EmsMeter[]>;
  getMeter(id: string): Promise<EmsMeter | null>;

  listOpenTasks(q?: ListTasksQuery): Promise<EmsTask[]>;
  getTask(id: string): Promise<EmsTask | null>;
  createTask(input: CreateTaskInput): Promise<WriteResult>;
  updateTask(id: string, patch: TaskPatch): Promise<WriteResult>;

  listComments(taskId: string): Promise<EmsComment[]>;
  addComment(taskId: string, text: string): Promise<WriteResult>;

  listUsers(): Promise<EmsUser[]>;

  /** Not in REST — present so the MCP adapter can light them up without an interface change. */
  listAlerts(siteId?: string): Promise<null>;
  energyBalance(siteId: string, period: string): Promise<null>;
  billingSummary(siteId: string, period: string): Promise<null>;
}

/** `EMS_TRANSPORT` (build-time) — `rest` until the MCP server exists. */
export function emsTransport(): string {
  const v = (import.meta as any).env?.VITE_EMS_TRANSPORT;
  return v === 'mcp' ? 'mcp' : 'rest';
}

let _gw: EmsGateway | null = null;

/** The active gateway. One instance per page — cheap, stateless, safe to hold. */
export function emsGateway(): EmsGateway {
  if (!_gw) _gw = restAdapter();   // `mcp` lands here behind emsTransport() when it exists
  return _gw;
}

/** Tests only — inject a fake gateway (and `setEmsGateway(null)` to restore). */
export function setEmsGateway(gw: EmsGateway | null): void { _gw = gw; }

/** True when the active transport supports `op`; the wiring behind capability-gated buttons. */
export function emsCan(op: keyof EmsCapabilities): boolean {
  try { return !!emsGateway().capabilities()[op]; } catch { return false; }
}

/**
 * Publish the gateway on the legacy bridge as `sigma.ems.*` (spec §7o: "mirrored for legacy by
 * the bridge"). ONE implementation, so legacy and React can never drift: the bridge object in
 * js/src/00-bridge.js deliberately does NOT re-implement these operations.
 */
export function installEmsBridge(): void {
  try { (sigma as any).ems = emsGateway(); } catch { /* no legacy bundle — React-only test page */ }
}

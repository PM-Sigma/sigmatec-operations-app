// ═══════════════════════════════════════════════════════════════════════════
// The ONE mutation wrapper (task 31 fix round 3, F5/F10).
//
// `docs/ux-loading-patterns.md` rule 2 and 3 in code: no wait is open-ended, every failure
// is Hebrew and offers a way to try again. Everything that writes goes through `runMutation`
// so the timeout, the message and the retry action are written once instead of per screen.
// ═══════════════════════════════════════════════════════════════════════════
import { toast } from 'sonner';

/** Supabase writes (`sbWrite`). A PostgREST round trip that has not answered in 15 s is hung. */
export const SB_TIMEOUT_MS = 15_000;
/** Edge functions that talk to GitHub — the API itself is the slow part. */
export const GH_TIMEOUT_MS = 20_000;
/** EMS gateway ops (the Apps Script proxy) — the existing legacy budget. */
export const EMS_TIMEOUT_MS = 25_000;

export const TIMEOUT_MSG = 'תם הזמן. נסה שוב';
export const RETRY_LABEL = 'נסה שוב';

/** A timeout this module raised, not a server error — worth a different message. */
export class TimeoutError extends Error {
  constructor(message = TIMEOUT_MSG) { super(message); this.name = 'TimeoutError'; }
}

export function isTimeout(e: unknown): boolean {
  const s = String((e as any)?.name || '') + ' ' + String((e as any)?.message || e || '');
  return /TimeoutError|AbortError|תם הזמן/i.test(s);
}

/**
 * Race a promise against a deadline. The underlying request is NOT cancelled when the caller
 * has no `AbortController` to give us (a PostgREST builder does not expose one through
 * `sbWrite`'s callback shape) — what the deadline buys is that the UI stops waiting, says so
 * in Hebrew and offers the retry, instead of spinning forever (F5).
 */
export function withTimeout<T>(p: PromiseLike<T>, ms: number, msg = TIMEOUT_MSG): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TimeoutError(msg)), ms);
    Promise.resolve(p).then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); },
    );
  });
}

export interface MutationToast {
  loading: string;
  success: string | ((v: unknown) => string);
  /** Prefix for a failure; the thrown message is appended when it is a real one. */
  error?: string;
  /** Offered as "נסה שוב" on failure. Usually the same call again. */
  retry?: () => void;
}

/**
 * Pattern 4's outcome half: ONE `toast.promise` for every mutation. Returns the same promise,
 * so the caller still awaits it and still owns its own button `loading` flag.
 */
export function runMutation<T>(p: Promise<T>, t: MutationToast): Promise<T> {
  toast.promise(p, {
    loading: t.loading,
    success: v => (typeof t.success === 'function' ? t.success(v) : t.success),
    error: (e: any) => {
      const msg = isTimeout(e) ? TIMEOUT_MSG : (e?.message || t.error || 'הפעולה נכשלה');
      return {
        message: msg,
        ...(t.retry ? { action: { label: RETRY_LABEL, onClick: t.retry } } : {}),
      } as any;
    },
  });
  return p;
}

/**
 * Rule 3, in one place: a failure the person sees is in Hebrew and offers a way to try again.
 *
 * The `hasHebrew` test is the part that matters. A dropped connection surfaces as
 * "Failed to fetch" and a PostgREST fault as an English sentence with a code in it — neither
 * is a message, and putting one on screen is the anti-pattern this rule exists for. Anything
 * without a Hebrew letter in it is replaced by the caller's own Hebrew fallback; the original
 * goes to the console, where it belongs.
 */
const hasHebrew = (s: string) => /[\u0590-\u05FF]/.test(s);

export function toastFailure(e: unknown, retry?: () => void, fallback = 'הפעולה נכשלה'): void {
  const raw = String((e as any)?.message || e || '');
  const msg = isTimeout(e) ? TIMEOUT_MSG : (hasHebrew(raw) ? raw : fallback);
  if (raw && !hasHebrew(raw)) console.warn('[sigma] ' + raw);
  toast.error(msg, retry ? { action: { label: RETRY_LABEL, onClick: retry } } : undefined);
}

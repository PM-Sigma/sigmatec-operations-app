// Error → Hebrew mapper (round 6, QA 2.3 — עידן's phone QA: "sometimes gets raw 'VALIDATION
// ERROR' toasts"). Pure and golden-tested: every code the app is known to throw at a person
// gets a plain Hebrew sentence saying what went wrong and what to do, instead of a PostgREST
// code or an English fetch error landing on screen. Unknown errors fall back to one generic
// Hebrew line, with the raw detail kept (never shown by default) for the "דווח כבאג" report.
//
// Feeds BOTH `runMutation` and `toastFailure` (lib/pending.ts) — the ONE mutation path every
// island writes through — so this is the single place a new PostgREST code needs mapping.

/** What we show, plus what we keep around for a bug report — never displayed unless asked. */
export interface ErrorInfo {
  /** The Hebrew sentence a person reads on the toast. */
  hebrew: string;
  /** The short code, when we found one ('23505', '42501', '401', 'timeout', 'network', …) */
  code: string | null;
  /** The raw message/detail as the server or the browser phrased it — for the bug report only. */
  raw: string;
  /** What the person should do: 'retry' (transient), 'fix' (change the input / refresh), 'report' (do NOT repeat — tell עידן). */
  action: ErrorAction;
}

export type ErrorAction = 'retry' | 'fix' | 'report';

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/** Pull whatever a PostgREST/Supabase error carries as its code — `{code}`, `{error: {code}}`,
 *  a bare 4-5 digit HTTP status, or a `PGRST…`/EMS-style string baked into the message. */
function extractCode(e: any): string | null {
  const direct = e?.code || e?.error?.code || e?.details?.code;
  if (direct) return String(direct);
  const status = e?.status || e?.statusCode;
  if (status) return String(status);
  const msg = String(e?.message || '');
  const m = msg.match(/\b(23\d{3}|22P02|42501|PGRST\d+)\b/);
  if (m) return m[1];
  const paren = msg.match(/^\s*\((\d{3})\)/);           // emsApi throws "(422) …"
  if (paren) return paren[1];
  const httpM = msg.match(/\b(400|401|403|404|408|409|422|429|500|502|503|504)\b/);
  if (httpM) return httpM[1];
  return null;
}

/** PostgreSQL/PostgREST family codes → one shared Hebrew explanation per family. */
const CODE_MESSAGES: Record<string, string> = {
  '400': 'הבקשה לא הובנה על ידי המערכת.',
  '422': 'המערכת לא קיבלה את הנתונים שנשלחו (ערך לא חוקי).',
  'P0002': 'הרשומה שהפעולה מחפשת לא נמצאה.',
  '408': 'תם הזמן. נסה שוב',
  '504': 'הפעולה לקחה יותר מדי זמן. נסה שוב בעוד רגע',
  // 23xxx — constraint violations (spec family, not a full enumeration of every 23xxx code).
  '23505': 'הרשומה הזו כבר קיימת. בדוק אם היא כבר נשמרה קודם',
  '23503': 'הפעולה מתייחסת לרשומה שכבר לא קיימת. רענן את המסך ונסה שוב',
  '23502': 'חסר שדה חובה. מלא את כל השדות המסומנים ונסה שוב',
  '23514': 'הערך שהוזן לא תקין עבור השדה הזה. בדוק ונסה שוב',
  '22P02': 'אחד הערכים שהוזנו לא בפורמט הנכון (מספר/תאריך). בדוק ונסה שוב',
  '42501': 'אין לך הרשאה לפעולה הזו.',
  '401': 'ההתחברות פגה. התחבר מחדש ונסה שוב',
  '403': 'אין לך הרשאה לפעולה הזו.',
  '404': 'הרשומה לא נמצאה. יכול להיות שהיא נמחקה או שהמסך לא מעודכן',
  '409': 'מישהו אחר כבר שינה את זה במקביל. רענן ונסה שוב',
  '429': 'יותר מדי בקשות בזמן קצר. חכה רגע ונסה שוב',
  '500': 'משהו השתבש. נסה שוב בעוד רגע',
  '502': 'משהו השתבש. נסה שוב בעוד רגע',
  '503': 'זה לא זמין כרגע. נסה שוב בעוד רגע',
};

/** Codes where repeating the action cannot help — the person is told to stop and report. */
const REPORT_CODES = new Set(['400', '422', 'P0002', '42501', '403']);
/** Codes where the person must change something (input / refresh / log in) before retrying. */
const FIX_CODES = new Set(['23505', '23503', '23502', '23514', '22P02', '401', '404', '409']);

const GENERIC_FALLBACK = 'הפעולה נכשלה. נסה שוב, ואם זה חוזר — דווח על זה';
const NETWORK_MSG = 'אין חיבור לאינטרנט. בדוק את החיבור ונסה שוב';
const TIMEOUT_MSG = 'תם הזמן. נסה שוב';

function isNetworkError(msg: string): boolean {
  return /Failed to fetch|NetworkError|Load failed|ERR_INTERNET|ERR_NETWORK|offline/i.test(msg);
}
function isTimeoutError(e: any, msg: string): boolean {
  return /TimeoutError|AbortError/i.test(String(e?.name || '')) || /תם הזמן/i.test(msg);
}

/**
 * The whole classification, pure. `raw` is ALWAYS the untouched original text (for the bug
 * report), independent of whether `hebrew` is the mapped sentence, the server's own Hebrew
 * text (already fine to show as-is), or the generic fallback.
 */
export function classifyError(e: unknown): ErrorInfo {
  const raw = String((e as any)?.message ?? (e as any) ?? '') || '';
  if (isTimeoutError(e, raw)) return { hebrew: TIMEOUT_MSG, code: 'timeout', raw, action: 'retry' };
  if (isNetworkError(raw)) return { hebrew: NETWORK_MSG, code: 'network', raw, action: 'retry' };

  const code = extractCode(e);
  if (code && CODE_MESSAGES[code]) {
    const action: ErrorAction = REPORT_CODES.has(code) ? 'report' : FIX_CODES.has(code) ? 'fix' : 'retry';
    return { hebrew: CODE_MESSAGES[code], code, raw, action };
  }
  // Any other 5xx is the server's fault, never the person's — same as 500.
  if (code && /^5\d\d$/.test(code)) return { hebrew: CODE_MESSAGES['500'], code, raw, action: 'retry' };

  // The server already answered in Hebrew (a hand-written EMS/edge-function message) — show it
  // as-is rather than replacing a perfectly good sentence with the generic fallback.
  if (raw && hasHebrew(raw)) return { hebrew: raw, code, raw, action: 'fix' };

  return { hebrew: GENERIC_FALLBACK, code, raw, action: 'retry' };
}

/** Short code a person can read out when reporting: 'E422', 'E23505', 'Enetwork'. */
export const errorRef = (info: ErrorInfo): string => 'E' + (info.code || '0');

/**
 * The FINAL toast sentence: what happened (the mapped Hebrew) + what to do. A 'report' error
 * tells the person NOT to repeat the action and to report to עידן with the short code; for
 * עידן himself the raw technical detail is appended (never shown to anyone else).
 */
export function userMessage(info: ErrorInfo, isIdan = false): string {
  let msg = info.hebrew;
  if (info.action === 'report') msg += ' אל תחזרו על הפעולה, דווחו לעידן (קוד ' + errorRef(info) + ').';
  if (isIdan && info.raw && info.raw !== info.hebrew) msg += ' · ' + info.raw.slice(0, 200);
  return msg;
}

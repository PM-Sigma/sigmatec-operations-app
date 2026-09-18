// Does the EMS have a token refresh, and how long does its token really live? (spec §7n)
//
//   EMS_TOKEN=<a token from a real sign-in> node scripts/ems-auth-probe.mjs
//   EMS_TOKEN=… EMS_API_BASE=https://api.sigmatec-ems.com node scripts/ems-auth-probe.mjs
//
// The token comes from the ENVIRONMENT ONLY — never a literal in this file, never a file in
// the repo, and it is never printed back (the report shows the claim NAMES and the lifetime,
// not the value). With no token the script still reports what it can and exits 0, so it is
// safe to run in CI.
//
// What it does:
//   1. decodes the token's own claims (exp / iat / iss) → the real TTL, no request needed;
//   2. probes the endpoints an EMS of this shape would expose for a refresh, with the token
//      in the Authorization header, and reports each status;
//   3. prints a summary for docs/ems-session.md.
//
// Findings live in docs/ems-session.md. If nothing answers, the app keeps the OTP re-login as
// the fallback and a dev-board card asks the EMS team for a refresh / a longer TTL.
const BASE = (process.env.EMS_API_BASE || 'https://api.sigmatec-ems.com').replace(/\/$/, '');
const TOKEN = process.env.EMS_TOKEN || '';

const PROBES = [
  { method: 'POST', path: '/v1/auth/refresh' },
  { method: 'POST', path: '/v1/auth/refresh-token' },
  { method: 'POST', path: '/v1/auth/token/refresh' },
  { method: 'GET', path: '/v1/auth/me' },
  { method: 'GET', path: '/v1/auth/session' },
  // the endpoint the bridge already uses to prove a token is alive — the control
  { method: 'GET', path: '/v1/employee-tasks?take=1' },
];

function decodeClaims(token) {
  try {
    const part = token.split('.')[1];
    const payload = JSON.parse(
      Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    const out = { claims: Object.keys(payload).sort() };
    if (payload.exp) {
      out.exp = new Date(payload.exp * 1000).toISOString();
      if (payload.iat) out.ttlMinutes = Math.round((payload.exp - payload.iat) / 60);
      out.minutesLeft = Math.round((payload.exp * 1000 - Date.now()) / 60000);
    }
    if (payload.iss) out.iss = String(payload.iss);
    return out;
  } catch (e) {
    return { error: 'could not decode the token payload (not a JWT?)' };
  }
}

async function probe(p) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10_000);
  try {
    const res = await fetch(BASE + p.path, {
      method: p.method,
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: p.method === 'POST' ? '{}' : undefined,
      signal: ac.signal,
    });
    let hasToken = false;
    try {
      const body = await res.json();
      hasToken = !!(body && (body.accessToken || body.token || body.access_token));
    } catch { /* not json */ }
    return { ...p, status: res.status, returnsToken: hasToken };
  } catch (e) {
    return { ...p, status: 'error', detail: e.name === 'AbortError' ? 'timeout' : String(e.message || e) };
  } finally { clearTimeout(t); }
}

const report = { base: BASE, at: new Date().toISOString(), token: TOKEN ? decodeClaims(TOKEN) : 'not provided' };

if (!TOKEN) {
  report.probes = 'skipped — set EMS_TOKEN (from a real sign-in) to probe';
} else {
  report.probes = [];
  for (const p of PROBES) report.probes.push(await probe(p));
  const refresh = report.probes.filter(r => r.returnsToken && r.path.includes('refresh'));
  report.refreshEndpoint = refresh.length ? refresh[0].method + ' ' + refresh[0].path : null;
  report.conclusion = refresh.length
    ? 'A refresh exists → silent refresh 10 min before expiry (spec §7n).'
    : 'No refresh answered → keep the OTP re-login as the fallback and ask the EMS team for one.';
}

console.log(JSON.stringify(report, null, 2));

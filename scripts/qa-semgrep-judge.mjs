// The semgrep gate's VERDICT, as a pure function — `scripts/qa.mjs` runs semgrep and hands the
// result here, `scripts/qa.selftest.mjs` hands it fakes.
//
// It lives in its own module for exactly one reason: the ways this gate can pass WITHOUT having
// scanned anything are the interesting ones, and they can only be tested if the judgement does
// not need semgrep, a network or 45 s. Task 22b hit two of them for real — a semgrep that died
// writing its JSON (cp1255 vs an emoji) left a 0-byte file that read as "0 findings, PASS", and
// a minified js/app.js silently stopped contributing findings.

/** semgrep's own exit codes: 0 = clean, 1 = findings were reported. Anything else is an error. */
export const SEMGREP_OK_CODES = [0, 1];

/**
 * @param {object} o
 * @param {number} o.code              semgrep's exit code (-1 = could not spawn)
 * @param {string} o.out               its combined stdout+stderr, for the report
 * @param {unknown} o.parsed           the parsed findings JSON, or null when unreadable
 * @param {string[]} o.excludeRules    accepted rule ids from qa/semgrep/config.yml
 * @param {string} [o.fetchedNote]     appended to the summary on a first (fetching) run
 * @returns {{status:'PASS'|'FAIL', summary:string, detail:string}}
 */
export function judgeSemgrep({ code, out = '', parsed, excludeRules = [], fetchedNote = '' }) {
  const tail = String(out).slice(-4000);

  // 1. no readable JSON → the scan did not complete. Never "0 findings".
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.results)) {
    return {
      status: 'FAIL',
      summary: `semgrep produced no readable JSON (exit ${code}) — the scan did not complete`,
      detail: tail,
    };
  }

  // 2. an exit code that is neither "clean" nor "findings" is a crash, whatever the JSON says.
  if (!SEMGREP_OK_CODES.includes(code)) {
    return {
      status: 'FAIL',
      summary: `semgrep exited ${code} — the scan did not complete`,
      detail: tail,
    };
  }

  // 3. semgrep reports its own errors (unparseable file, missing target, a rule that blew up) in
  //    the JSON while still exiting 0/1. A gate that ignores them reports on a partial scan.
  const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  if (errors.length) {
    const lines = errors.slice(0, 20).map(e => {
      const where = e.path || (e.location && e.location.path) || '';
      const msg = e.long_msg || e.message || e.short_msg || e.type || JSON.stringify(e);
      return `· ${e.level || 'error'} · ${where}${where ? ' · ' : ''}${String(msg).split('\n')[0].slice(0, 300)}`;
    });
    return {
      status: 'FAIL',
      summary: `semgrep reported ${errors.length} scan error(s) — the scan is not trustworthy`,
      detail: lines.join('\n') + (errors.length > 20 ? `\n… ${errors.length - 20} more` : '') +
        (tail ? '\n\n' + tail : ''),
    };
  }

  // 4. a scan that touched no files passes trivially — that is how a wrong `include` list, a
  //    typo in a path or an over-eager exclude would hide EVERYTHING.
  const scanned = (parsed.paths && Array.isArray(parsed.paths.scanned)) ? parsed.paths.scanned.length : null;
  if (scanned === 0) {
    return {
      status: 'FAIL',
      summary: 'semgrep scanned 0 files — check `include` / `exclude` in qa/semgrep/config.yml',
      detail: tail,
    };
  }

  // 5. the normal path: accepted rules are subtracted, anything left blocks. The match is on the
  //    check_id SUFFIX — semgrep prefixes ids with the config path when the packs come from a
  //    local directory, so the suffix is the stable part.
  const isExcluded = id => excludeRules.some(x => String(id).endsWith(x));
  const live = parsed.results.filter(f => !isExcluded(f.check_id));
  const accepted = parsed.results.length - live.length;
  const detail = live.map(f => `${f.extra?.severity} · ${f.check_id} · ${f.path}:${f.start?.line}`).join('\n');
  return {
    status: live.length ? 'FAIL' : 'PASS',
    summary: `${live.length} blocking · ${accepted} accepted by config.yml`
      + (scanned === null ? '' : ` · ${scanned} file(s) scanned`)
      + fetchedNote,
    detail: detail || (code === -1 ? tail : ''),
  };
}

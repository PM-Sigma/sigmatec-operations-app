// The visible footer version ("גרסה YYYY-MM-DD·M.mm") is stamped into index.html by build.mjs.
// 8.10: a merge-conflict marker once landed inside that <bdi> (27.9) and the old stamp regex
// (`[\d.]+`) could never match past it, so the garbage survived every later build. The stamp now
// replaces the WHOLE <bdi> content, and a malformed VERSION fails the build instead of spreading.
export const VERSION_RE = /^\d+(\.\d+)?$/;
export const isValidVersion = v => typeof v === 'string' && VERSION_RE.test(v.trim());
export function stampVersion(html, today, ver) {
  if (!isValidVersion(ver)) throw new Error('refusing to stamp malformed version: ' + JSON.stringify(ver));
  const re = /(<bdi>)גרסה[\s\S]*?(<\/bdi>)/;
  if (!re.test(html)) throw new Error('footer <bdi>גרסה …</bdi> not found in index.html');
  return html.replace(re, '$1גרסה ' + today + '·' + ver + '$2');
}

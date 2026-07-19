// Asserts the corrected kibbutz→EMS-site UUIDs (js/src/01-data.js KIBBUTZ_SITE_MAP).
// Run: node test-site-map.mjs
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, 'js/src/01-data.js'), 'utf8');
const body = src.substring(src.indexOf('const KIBBUTZ_SITE_MAP'), src.indexOf('function kibbutzSiteIds'));
const MAP = new Function(body + '\nreturn KIBBUTZ_SITE_MAP;')();
let failures = 0;
const eq = (n, a, b) => { try { assert.deepStrictEqual(a, b); console.log('  ok - ' + n); } catch (e) { failures++; console.log('  FAIL - ' + n + ': ' + e.message); } };
eq('שלוחות → correct UUID', MAP['שלוחות'], ['9a0ba3d3-b7f2-4597-b3ee-3537e4f8d75e']);
eq('דפנה mapped', MAP['דפנה'], ['490a865d-c4f4-4a4a-96da-14a273e7f03b']);
eq('ניצנים mapped', MAP['ניצנים'], ['ae9ac4c6-119e-496c-9aad-331e95a2551d']);
eq('שלוחות no longer points at the stale UUID', MAP['שלוחות'].includes('07ab3dee-7192-4f19-a004-0fae7c09d3fd'), false);
console.log(failures ? `\n${failures} FAILED` : '\nmap checks passed');
process.exit(failures ? 1 : 0);

// The bug bot's pure logic (scripts/bugbot/lib.mjs + push-send/bugbot.js).
// The point of the whole design: the MERGE decision comes from the real diff + our gates,
// never from the model's label. Run: node test-bugbot.mjs
import assert from 'node:assert/strict';
import {
  LIMITS, branchName, capReached, changelogInsert, claimRequest, claimWon, classifyPath, decideOutcome, noteFor,
  parseEnv, parseNumstat, parseVerdict, pushRequest, redact, runsInLast24h, sanitizedEnv, staleWorkingPath,
} from './scripts/bugbot/lib.mjs';
import { bugbotPush, BUGBOT_RECIPIENTS, BUGBOT_TITLES } from './supabase/functions/push-send/bugbot.js';

const ID = '3f2b6c1e-9d4a-4e8b-8a57-0c1d2e3f4a5b';
let n = 0; const ok = m => { n++; console.log('ok - ' + m); };

// -- claim: atomic (WHERE bot_state IS NULL ... RETURNING) --
{
  const c = claimRequest('https://x.supabase.co', ID, '2026-10-08T10:00:00Z');
  assert.equal(c.method, 'PATCH');
  assert.ok(c.url.includes(`id=eq.${ID}`) && c.url.includes('bot_state=is.null') && c.url.includes('status=eq.new') && c.url.includes('kind=eq.bug'));
  assert.equal(c.headers.Prefer, 'return=representation');
  assert.deepEqual(c.body, { bot_state: 'working', bot_at: '2026-10-08T10:00:00Z' });
  assert.equal(claimWon([{ id: ID }]), true);
  assert.equal(claimWon([]), false, 'empty RETURNING = someone else won');
  assert.equal(claimWon(null), false);
  assert.throws(() => claimRequest('https://x', 'x; drop table', 'now'), /bad id/);
  assert.ok(staleWorkingPath(Date.UTC(2026, 9, 8, 12)).includes('bot_state=eq.working'));
  ok('claim is atomic and injection-safe');
}

// -- daily cap --
{
  const now = Date.parse('2026-10-08T12:00:00Z');
  const log = Array.from({ length: 10 }, (_, i) => new Date(now - i * 3600e3).toISOString());
  assert.equal(runsInLast24h(log, now), 10);
  assert.equal(capReached(log, now), true);
  assert.equal(capReached(log.slice(1), now), false);
  assert.equal(capReached([new Date(now - 25 * 3600e3).toISOString()], now), false, 'older than 24h does not count');
  ok('daily cap');
}

// -- verdict parser --
{
  const good = JSON.stringify({ cause: 'null ברשימה', fix_summary: 'בדיקת null', class: 'small', gates_green: true, files_changed: ['a.tsx'], lines_changed: 4 });
  const r = parseVerdict(good);
  assert.ok(r.ok); assert.equal(r.verdict.class, 'small'); assert.equal(r.verdict.gates_green, true);
  assert.equal(parseVerdict('{nope').ok, false);
  assert.equal(parseVerdict('[]').ok, false);
  assert.equal(parseVerdict(JSON.stringify({ cause: 'x', class: 'merge_it' })).ok, false, 'unknown class rejected');
  assert.equal(parseVerdict(JSON.stringify({ cause: '', class: 'small' })).ok, false, 'empty cause rejected');
  assert.equal(parseVerdict('﻿' + good).ok, true, 'BOM tolerated');
  assert.equal(parseVerdict(JSON.stringify({ cause: 'x'.repeat(2000), class: 'needs_approval' })).verdict.cause.length, 400);
  ok('verdict parser');
}

// -- path classes --
{
  assert.equal(classifyPath('app/src/islands/Foo.tsx'), 'source');
  assert.equal(classifyPath('app/src/islands/Foo.test.tsx'), 'test');
  assert.equal(classifyPath('test-bugbot.mjs'), 'test');
  assert.equal(classifyPath('js/src/22-push.js'), 'source');
  assert.equal(classifyPath('js/app.js'), 'generated');
  assert.equal(classifyPath('ui/sigma-Foo.js'), 'generated');
  assert.equal(classifyPath('index.html', { added: 3, deleted: 3 }), 'generated');
  assert.equal(classifyPath('index.html', { added: 40, deleted: 2 }), 'other');
  for (const p of ['db/x.sql', 'supabase/functions/push-send/index.ts', 'x/y/migration.sql', 'app/src/lib/session.ts',
    'app/src/components/EmsGate.tsx', 'js/src/01-auth.js', 'app/src/lib/roles.ts', 'app/src/lib/permissions.ts', 'scripts/bugbot/lib.mjs', 'package.json', '.github/workflows/a.yml']) {
    assert.equal(classifyPath(p), 'forbidden', p);
  }
  assert.equal(classifyPath('scripts/foo.mjs'), 'other');
  ok('path classification');
}

// -- the merge decision --
{
  const f = (path, added, deleted = 0) => ({ path, added, deleted });
  const base = {
    modelClass: 'small', gatesGreen: true, addedLines: ['if (!row) return null;'],
    files: [f('app/src/islands/Foo.tsx', 8, 2), f('app/src/islands/Foo.test.tsx', 30), f('js/app.js', 500, 400), f('ui/sigma.js', 9, 9), f('VERSION', 1, 1), f('docs/CHANGELOG.md', 4)],
  };
  assert.equal(decideOutcome(base).outcome, 'merge', 'small, green, source only -> merge');
  assert.equal(decideOutcome(base).lines, 10, 'only SOURCE lines count (not tests/generated)');
  assert.equal(decideOutcome({ ...base, gatesGreen: false }).outcome, 'needs_approval', 'red gates never merge');
  assert.equal(decideOutcome({ ...base, modelClass: 'needs_approval' }).outcome, 'needs_approval', 'the model can only be stricter');
  assert.equal(decideOutcome({ ...base, files: [...base.files, f('db/fix.sql', 3)] }).outcome, 'needs_approval', 'db/ path');
  assert.equal(decideOutcome({ ...base, files: [...base.files, f('supabase/functions/push-send/index.ts', 1)] }).outcome, 'needs_approval', 'supabase/ path');
  assert.equal(decideOutcome({ ...base, files: [...base.files, f('app/src/lib/session.ts', 1)] }).outcome, 'needs_approval', 'auth/session file');
  assert.equal(decideOutcome({ ...base, files: [f('app/src/islands/Foo.tsx', 40, 21)] }).outcome, 'needs_approval', '61 lines > 60');
  assert.equal(decideOutcome({ ...base, files: [f('app/src/islands/Foo.tsx', 40, 20)] }).outcome, 'merge', '60 lines is allowed');
  assert.equal(decideOutcome({ ...base, files: [f('app/src/islands/Foo.tsx', 2), f('scripts/other.mjs', 2)] }).outcome, 'needs_approval', 'unknown path');
  assert.equal(decideOutcome({ ...base, files: [f('js/app.js', 3)] }).outcome, 'needs_approval', 'generated-only (no source) is not a fix');
  for (const bad of ['await sb.from("x").insert(r)', 'sbWrite(() => x)', 'sb.rpc("fn")', 'if (isAdmin) show()', 'fetch(SB_URL + "/functions/v1/x")']) {
    assert.equal(decideOutcome({ ...base, addedLines: [bad] }).outcome, 'needs_approval', bad);
  }
  assert.equal(decideOutcome({ modelClass: 'not_reproduced', files: [], gatesGreen: true }).outcome, 'not_reproduced');
  assert.equal(decideOutcome({ modelClass: 'not_reproduced', files: [f('app/src/a.tsx', 5)], gatesGreen: true }).outcome, 'needs_approval', 'not_reproduced but code changed: a human looks');
  assert.equal(LIMITS.maxSourceLines, 60);
  ok('merge decision (paths, lines, gates, content, model label)');
}

// -- numstat / branch / env / redact / changelog --
{
  assert.deepEqual(parseNumstat('3\t1\ta/b.tsx\n-\t-\timg.png\n'), [{ path: 'a/b.tsx', added: 3, deleted: 1 }, { path: 'img.png', added: 1000, deleted: 1000 }]);
  assert.equal(branchName(ID), 'bugbot-3f2b6c1e');
  assert.deepEqual(parseEnv('# c\nA=1\nB = "two"\nC=\n'), { A: '1', B: 'two', C: '' });
  assert.equal(redact('key abcdef123 and eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0NTY3.SflKxwRJSMeKKF2QT4', ['abcdef123']), 'key *** and ***jwt***');
  const env = sanitizedEnv({ PATH: 'p', BUGBOT_SB_SERVICE_KEY: 'secret', BUGBOT_CRON_SECRET: 's2', USERPROFILE: 'u' });
  assert.deepEqual(env, { PATH: 'p', USERPROFILE: 'u' }, 'the model process gets none of the bot keys');
  const cl = changelogInsert('# Changelog\n\nintro\n\n## [old] 2026-01-01\n- x\n', { version: '2.149', date: '2026-10-08', summary: 's', cause: 'c', id8: '3f2b6c1e' });
  assert.ok(cl.indexOf('[bugbot 2.149]') < cl.indexOf('[old]') && cl.startsWith('# Changelog'));
  ok('numstat, branch, env, redact, changelog');
}

// -- notes + the push payload --
{
  assert.ok(noteFor('merged', { cause: 'c', fix_summary: 'f' }, { version: '2.149' }).includes('2.149'));
  assert.ok(noteFor('needs_approval', { cause: 'c', fix_summary: 'f' }, { reasons: ['gates not green'], preview: 'https://p' }).includes('https://p'));
  assert.ok(noteFor('not_reproduced', { cause: 'c', fix_summary: 'tried a' }).startsWith('לא הצלחתי'));
  const req = pushRequest('https://x.supabase.co', 'sec', { id: ID, state: 'merged', note: 'a\n b ' + 'x'.repeat(300) });
  assert.equal(req.url, 'https://x.supabase.co/functions/v1/push-send');
  assert.equal(req.headers['x-cron-key'], 'sec');
  assert.equal(req.body.mode, 'bugbot');
  assert.ok(req.body.note.length <= 160 && !req.body.note.includes('\n'));
  assert.ok(!('to' in req.body) && !('recipients' in req.body), 'the caller never names recipients');

  assert.deepEqual(BUGBOT_RECIPIENTS, ['עידן'], 'עידן only');
  for (const [state, emoji] of [['merged', '✅'], ['needs_approval', '🟡'], ['not_reproduced', '❓']]) {
    const m = bugbotPush({ id: ID, state, note: '  קצר  ' });
    assert.ok(m.title.startsWith(emoji), state);
    assert.equal(m.title, BUGBOT_TITLES[state]);
    assert.equal(m.body, 'קצר');
    assert.equal(m.path, '#feedback-inbox?id=' + ID);
    assert.equal(m.tag, 'bugbot-' + ID);
  }
  assert.equal(bugbotPush({ id: ID, state: 'working', note: 'x' }), null, 'no push for working');
  assert.equal(bugbotPush({ id: 'not-a-uuid', state: 'merged' }), null);
  assert.equal(bugbotPush({ id: ID, state: 'merged', note: '' }).body, 'פתח את התיבה לפרטים');
  assert.equal(bugbotPush({ id: ID, state: 'merged', note: 'y'.repeat(500) }).body.length, 160);
  ok('push payload (עידן only, status emoji, deep link)');
}

console.log(`\nPASS test-bugbot (${n} groups)`);

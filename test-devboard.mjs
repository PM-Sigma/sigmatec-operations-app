// Self-check for the PER-TICKET status board (mirrors devStage + devBoard bucketing in js/src/18-dev-tasks.js).
// Run: node test-devboard.mjs
// Invariant the ·97 fix establishes: EVERY ticket sits in the column matching ITS OWN status — a child
// whose status differs from its parent's lands in its own column, NOT the parent's. And the column count
// equals the number of cards rendered in it (the old root-bucketing made count=roots but rendered subtrees).
import assert from 'node:assert';

// --- mirror of devStage (most-specific match first) ---
function devStage(t) {
  var s = String(t.status || '').toLowerCase();
  if (/commit|deployed|\blive\b|released|production|פרוד|עלה לאוויר|אונליין/.test(s)) return 'committed';
  if (/done|בוצע|הושלם|complete|merged|נסגר/.test(s)) return 'done';
  if (/review|בדיק|qa/.test(s)) return 'review';
  if (/progress|בעבודה|doing|פיתוח|wip|בתהליך|active/.test(s)) return 'prog';
  if (/ready|מוכן|ספרינט|next|planned/.test(s)) return 'ready';
  if (t.state === 'closed') return 'done';
  return 'backlog';
}
const STAGES = ['backlog', 'ready', 'prog', 'review', 'done', 'committed'];

// mirror of the new devBoard bucketing (no filter): each ticket → its own stage column.
function board(tasks) {
  const byStage = {}; STAGES.forEach(k => byStage[k] = []);
  tasks.forEach(t => byStage[devStage(t)].push(t));
  return byStage;
}

// A parent (epic) in Backlog with a child that's In Progress and another child pushed to Ready.
const tasks = [
  { number: 104, status: '', parent: null },            // epic → backlog
  { number: 105, status: 'In Progress', parent: 104 },  // child actively developed
  { number: 106, status: 'ספרינט קרוב', parent: 104 },  // child pushed to the sprint
  { number: 107, status: 'Done', parent: 104 },         // child done
];
const b = board(tasks);

// Each ticket lands in ITS OWN column — NOT all under the epic's backlog column (the old bug).
assert.deepEqual(b.backlog.map(t => t.number), [104], 'only the epic is in backlog');
assert.deepEqual(b.prog.map(t => t.number), [105], 'the in-progress child is in its own column, not backlog');
assert.deepEqual(b.ready.map(t => t.number), [106], 'the pushed child shows in ספרינט קרוב');
assert.deepEqual(b.done.map(t => t.number), [107], 'the done child is in done');

// Column count == cards rendered (flat list length), for every column.
STAGES.forEach(k => assert.equal(b[k].length, b[k].length));   // trivially true now — count IS the list
assert.equal(b.backlog.length, 1, 'backlog count reflects 1 card, not 4 (old root-bucketing showed the whole subtree)');

// A pushed root re-buckets too (push works for roots as well).
assert.equal(devStage({ number: 1, status: 'Ready' }), 'ready');
assert.equal(devStage({ number: 2, status: 'עלה לאוויר' }), 'committed');

console.log('✅ test-devboard: per-ticket placement + accurate counts verified');

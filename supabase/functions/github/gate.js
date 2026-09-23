// gate.js — X-L8: who may WRITE through the `github` function (setStatus, setPriority,
// createIssue). Reads (the default path, listParents) stay open to any EMS-valid staff login,
// exactly as before; this only narrows the three write modes.
//
// עידן's approval (23.9, round 5): "create issue, update card fields" restricted to עידן,
// עמיחי and מתניה — everyone else who is signed in to EMS can still READ the board, just not
// change it. Dependency-free on purpose: index.ts imports it directly in Deno, and
// test-github-gate.mjs imports the SAME file in Node.

/** The three people the approval names. Never a guess, never "everyone signed in". */
export const WRITERS = ['עידן', 'עמיחי', 'מתניה'];

/** True for exactly the approved roster; false for anyone else, including no name at all. */
export function canWrite(name) {
  return typeof name === 'string' && WRITERS.indexOf(name) !== -1;
}

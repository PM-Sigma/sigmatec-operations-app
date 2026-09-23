// caps.ts holds build flags that more than one screen must agree on. The contract: the flag is
// true (the internal-task write path exists) and no island keeps a private copy of it.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { INTERNAL_TASKS_WRITABLE } from '@/lib/caps';

const SRC = path.resolve(__dirname, '..');
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(d.name) && !/\.test\.tsx?$/.test(d.name) ? [p] : [];
  });
}

describe('caps', () => {
  it('internal tasks are writable (the write path ships)', () => {
    expect(INTERNAL_TASKS_WRITABLE).toBe(true);
  });

  it('every screen that gates on it imports it from lib/caps, none defines its own', () => {
    const users: string[] = [];
    for (const f of walk(SRC)) {
      if (f.endsWith(path.join('lib', 'caps.ts'))) continue;
      // code only: a comment that names the flag is documentation, not a consumer
      const text = fs.readFileSync(f, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (!text.includes('INTERNAL_TASKS_WRITABLE')) continue;
      expect(text, f).not.toMatch(/(const|let|var)\s+INTERNAL_TASKS_WRITABLE\b/);
      expect(text, f).toMatch(/import\s*\{[^}]*INTERNAL_TASKS_WRITABLE[^}]*\}\s*from\s*'@\/lib\/caps'/);
      users.push(path.basename(f));
    }
    expect(users.sort()).toEqual(expect.arrayContaining(['MeetingReview.tsx', 'Presenter.tsx']));
  });
});

// The footer version can never show garbage (8.10: "גרסה 2026-09-27·<<<<<<< HEAD\n2.93" reached prod).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { isValidVersion, stampVersion } from './scripts/version-stamp.mjs';

assert.ok(isValidVersion('2.148') && isValidVersion('99') && isValidVersion('2.148\n'));
for (const bad of ['<<<<<<< HEAD\n2.93', '', '2.', 'x', '2.9.3', null, undefined]) assert.ok(!isValidVersion(bad), String(bad));

const garbage = '<span><bdi>גרסה 2026-09-27·<<<<<<< HEAD\n2.93</bdi></span>';
assert.equal(stampVersion(garbage, '2026-10-08', '2.149'), '<span><bdi>גרסה 2026-10-08·2.149</bdi></span>');
assert.equal(stampVersion('<bdi>גרסה 2026-10-08·2.149</bdi>', '2026-10-09', '2.150'), '<bdi>גרסה 2026-10-09·2.150</bdi>');
assert.throws(() => stampVersion(garbage, '2026-10-08', '<<<<<<< HEAD'), /malformed/);
assert.throws(() => stampVersion('<p>no footer</p>', '2026-10-08', '2.1'), /not found/);

// What is committed right now must be clean too.
const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const m = html.match(/<bdi>(גרסה [^<]*)<\/bdi>/);
assert.ok(m && /^גרסה \d{4}-\d{2}-\d{2}·\d+(\.\d+)?$/.test(m[1]), 'index.html footer version malformed: ' + (m && m[1]));
assert.ok(isValidVersion(fs.readFileSync(new URL('./VERSION', import.meta.url), 'utf8')), 'VERSION malformed');
console.log('test-version-stamp: ok');

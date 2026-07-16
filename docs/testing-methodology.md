# Testing methodology — Sigmatec Operations App

_QA-agent-derived methodology (2026-07-16), binding for all new features. Plain node `test-*.mjs`
scripts with asserts; no browser framework. Run in a **loop until green**._

## Principles

1. **Design for testability first:** every feature splits into **pure builders** (data in →
   structured data out; no DOM/Supabase/download) and a **thin writer/UI layer**. Only builders +
   writers are unit-tested; the final click is one manual smoke.
2. **Golden fixtures:** each builder gets a realistic-Hebrew fixture input and a hard-coded
   expected output, compared with `assert.deepStrictEqual`. A fixture changes **only in the same
   commit** as an intentional spec change, with a one-line why.
3. **Contract sweeps, not eyeballs:** requirements become programmatic assertions over ALL output
   (e.g. exports: no `\n` in any cell, row arity = column count, cell type matches declared type).
4. **Edge-case set (minimum, every data feature):** empty dataset · Hebrew with `ח"פ`/geresh/
   quotes/commas · embedded RTL marks (`‏‎‫`) · null/undefined → `''` (never
   `"undefined"`) · numbers-as-strings from the DB · date timezone slide (build from Y/M/D parts).
5. **Round-trip file outputs:** any generated file (xlsx/csv/pdf-html) is parsed back in the test
   and asserted on — values AND types — plus a mojibake canary on Hebrew strings.
6. **Role-gating matrix:** gate functions tested as pure functions against an explicit
   role×feature expected matrix; every new feature re-asserts that **existing viewer write-blocks
   are unchanged** (regression).
7. **Loop discipline:** one runner per feature area (e.g. `test-exports.mjs`) that execs its whole
   suite and exits non-zero on first failure. The loop always runs the **full suite**, never a
   subset. Never loosen an assertion to pass — fix the code or (intentionally) the fixture.
8. **Manual smoke per release:** the one thing Node can't prove (real Excel locale behavior, real
   phone rendering) — 2 minutes, recorded in the CHANGELOG entry.

## Current runners

| Runner | Covers |
|--------|--------|
| `test-delivery-cert.mjs`, `test-cert-pdf.mjs`, `test-viewer-gate.mjs` | cert flow, PDF doc, viewer PIN gate |
| `test-order-patch.mjs`, `test-devboard.mjs` | partial-PATCH safety, dev board |
| `test-exports.mjs` (planned — Excel exports spec 2026-07-16) | export builders, file round-trip, export gating |

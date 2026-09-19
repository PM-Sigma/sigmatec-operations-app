# Task 30 review — ▶ ישיבת פיתוח + 📋 sprint prep

(Independently verified via direct diff/read/test review; supersedes any prior draft of this file.)

## Verdict: Pass

The diff (`f7ebd79..bd83b46`) matches the plan (docs/superpowers/plans/2026-09-17-kibbutz-cards-redesign.md
Task 30 section), spec §7 and master-spec §7d. All ten checklist items were verified:

1. **No duplicate fetch path** — `app/src/lib/devBoard.ts` is the only React-side caller of the
   `github` edge function for board data; `DEV_BOARD_QUERY_KEY('open')` is shared by the walk and
   the prep card (one `useQuery` in `DevPresenter.tsx`).
2. **No ticket creation** — `grep createIssue` across the diff finds it only in the pre-existing,
   unrelated `FeedbackInbox.tsx`. `devBoard.ts:moveToSprint` calls `mode:'setStatus'` only; test
   `DevPresenter.test.tsx:120` asserts `createIssue` is never called.
3. **📌 writes exactly one `meeting_events` row** — `marker()` (`DevPresenter.tsx`) calls `log('issue', …)` once
   per click; test at `DevPresenter.test.tsx:163-167` asserts `events().length` grows by exactly 1.
4. **`rankCard` deterministic** — pure function of `(card, opts)`, ties broken by ascending issue
   number in `proposeSprint`; no `Math.random`, no external mutable state.
5. **`proposeSprint` capped + no parents** — `cap` defaults to 8, `isParentCard` filtered out before
   ranking (`sprintPrep.ts`).
6. **Empty board handled** — `devPrep([])` returns 0/0/0% burndown and empty lists, no crash path;
   golden-tested in `sprintPrep.test.ts`.
7. **Role gating** — `DEV_MEETING_PEOPLE = ['עידן','מתניה','אליה']`; `canRunDevMeeting` returns
   false for `isViewer`, true only for those three or an admin. Covered by role-matrix tests in
   `DevPresenter.test.tsx`.
8. **Copy/text rules** — Hebrew-only UI strings, no app-mechanics text, matches spec wording
   ("📋 הכן ישיבת פיתוח", "העבר לספרינט הקרוב", etc.).
9. **DevPresenter vs `mode` prop** — separate island, decision documented in the file header and
   `docs/integration-map.md`; consistent with the plan's "the implementer picks and records why."
10. **`sigma.healthBands` null-safe** — `useRedKibbutzim()` wraps the call in try/catch and checks
    truthiness before `Object.keys`; `rankCard`/`touchesRed` treat an absent/empty list as no bonus.

Tests: `sprintPrep.test.ts` (34 cases) + `DevPresenter.test.tsx` all green. `qa/reports/2026-09-19-task-30.md`
is green (playwright 446/0, lighthouse 93/85, gitleaks/semgrep/npm test pass) with ZAP skipped
(no Docker) — acceptable per policy.

## Critical
None.

## Important
None.

## Minor
- `DevPresenter.tsx` `isAdminNow()` fallback (used only when `sigma.isAdmin?.()` is unavailable)
  hardcodes `user === 'עידן' || user === 'עמיחי'` and does not include `'מתניה'`/`'אליה'`
  (`DevPresenter.tsx:465`). Verified this is NOT a live gating bug: `canRunDevMeeting`
  (`sprintPrep.ts:396-403`) is `opts.isAdmin || DEV_MEETING_PEOPLE.includes(me)`, and
  `DEV_MEETING_PEOPLE` already contains מתניה/אליה directly, so they pass the gate on the
  `DEV_MEETING_PEOPLE.includes(me)` branch regardless of what `isAdminNow` returns. Flagging only
  as a naming/consistency nit — `isAdminNow`'s fallback name suggests "is this person an admin"
  but its hardcoded list overlaps confusingly with the separate dev-meeting roster; worth aligning
  or renaming so a future reader doesn't assume it's the (sole) gate.
- `rankCard`'s age term calls `Date.now()` independently per invocation when `opts.now` is omitted;
  `devPrep`/`proposeSprint` are called from a single `useMemo` with no explicit `now`, so all cards
  in one ranking pass share the same tick in practice, but this relies on call-site discipline
  rather than the function itself pinning `now` once per batch. No observed instability in tests;
  flagged only as a latent footgun if `rankCard` is ever called ad-hoc outside `proposeSprint`.

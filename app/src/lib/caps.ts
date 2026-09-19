// Build capability flags — the few places where a screen must NOT offer something because
// the write path behind it does not exist yet.
//
// A flag lives here, not inside one island, the moment a SECOND screen has to agree with it:
// two islands each holding their own `const` is how one of them ends up offering a chip that
// silently does nothing.

/**
 * 🔒 פנימי is offered only where an internal-task WRITE path exists. `internal_tasks` is in
 * the database (db/internal_tasks.sql, Task 14) but the client only READS it today — Task 26
 * ships the screen that writes. A chip that silently does nothing in the middle of a meeting,
 * or in the summary review, is worse than no chip, so until then it is not offered.
 *
 * Flipping this to `true` is the whole change on the client side, for BOTH
 * `islands/Presenter.tsx` (the live ✏️ chips) and `islands/MeetingReview.tsx` (the review
 * chips) — which is exactly why it is not a `const` inside either of them.
 */
export const INTERNAL_TASKS_WRITABLE = false;

// Build capability flags — the few places where a screen must NOT offer something because
// the write path behind it does not exist yet.
//
// A flag lives here, not inside one island, the moment a SECOND screen has to agree with it:
// two islands each holding their own `const` is how one of them ends up offering a chip that
// silently does nothing.

/**
 * 🔒 פנימי is offered wherever an internal-task WRITE path exists. `internal_tasks` is in the
 * database (db/internal_tasks.sql, Task 14) and Task 26 ships the screen that writes —
 * `components/home/InternalTasks.tsx` (the card section + "היום שלי") and the two chips this
 * flag already gated, `islands/Presenter.tsx`'s live ✏️ chip and `islands/MeetingReview.tsx`'s
 * review chip + `saveReview`'s internal-task insert. All four agree because none of them holds
 * its own copy of this flag.
 */
export const INTERNAL_TASKS_WRITABLE = true;

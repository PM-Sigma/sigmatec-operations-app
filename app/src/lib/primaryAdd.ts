// The ONE context-aware header ➕ (spec §7k.2, decision #13 — "accepted with care: must be
// fully modeled and never ambiguous").
//
// Two rules make it safe:
//  1. the button's LABEL always says what it does ("➕ קיבוץ", "➕ שבץ ליום", "➕ דיווח מלאי") —
//     never a bare plus, because a plus whose meaning depends on the screen is a trap;
//  2. when a page has nothing to add, the button is NOT RENDERED. No purposeless buttons.
//
// The same function feeds Ctrl+K's actions list, so the command bar can never offer an action
// the header would refuse, and one page × role matrix test covers both surfaces.
import type { PersonRole } from '@/lib/landing';
import type { SigmaPage } from '@/bridge';

/** Every page the ➕ is asked about — the legacy pages plus the card home. */
export type AddPage = SigmaPage;

export type AddAction =
  | 'kibbutz'       // ➕ קיבוץ — the card home, admins only (§7b)
  | 'schedule'      // ➕ שבץ ליום — the calendar WITH a day selected
  | 'event'         // ➕ פגישה — the calendar with no day selected
  | 'stockChange'   // ➕ דיווח מלאי — inventory
  | 'visit'         // ➕ סיכום ביקור — my tasks / attendance (opens the visit form)
  | 'feedback'      // ➕ רעיון או תלונה — the viewer's one write, anywhere (§7 Part F)
  | 'none';         // the page has nothing to add → render nothing

export interface AddContext {
  /** The calendar's selected day, when there is one (§7k.2: "schedule when a day is selected"). */
  daySelected?: boolean;
  /** May this person create kibbutzim? `canManageKibbutzim(user, isViewer)` — עידן + עמיחי. */
  canManageKibbutzim?: boolean;
}

export const ADD_LABEL: Record<Exclude<AddAction, 'none'>, string> = {
  kibbutz: '➕ קיבוץ',
  schedule: '➕ שבץ ליום',
  event: '➕ פגישה',
  stockChange: '➕ דיווח מלאי',
  visit: '➕ סיכום ביקור',
  feedback: '➕ רעיון או תלונה',
};

/** The label for the header button; `null` when nothing should be rendered. */
export function primaryAddLabel(action: AddAction): string | null {
  return action === 'none' ? null : ADD_LABEL[action];
}

/**
 * THE decision. Exactly one action per (page, role, context) — §7k.2's model, literally.
 *
 * The viewer is answered FIRST and identically everywhere: 📣 is his only write (§7 Part F
 * says the feedback box is allowed for him), so a viewer never sees a ➕ that would be blocked
 * the moment he pressed it.
 */
export function primaryAdd(page: AddPage, role: PersonRole, context: AddContext = {}): AddAction {
  if (role === 'viewer') return 'feedback';

  switch (page) {
    case 'kibbutz':
      // Only the people who may actually create one (§7b). Everyone else has no add here —
      // the card's own actions (📍 ביקור, 🚚 תעודה) are not "add", they are the work.
      return context.canManageKibbutzim ? 'kibbutz' : 'none';
    case 'calendar':
      return context.daySelected ? 'schedule' : 'event';
    case 'inventory':
      return 'stockChange';
    case 'mytasks':
    case 'attendance':
      return 'visit';
    // Read-only or externally owned screens: EMS tasks are created from a kibbutz card or in
    // EMS itself, the dev board has its own per-column add, עובדים and התראות are lists.
    case 'ems':
    case 'dev':
    case 'staff':
    case 'pushlog':
    default:
      return 'none';
  }
}

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
  | 'feedback'      // ➕ רעיון / באג — the viewer's one write, anywhere (§7 Part F)
  | 'none';         // the page has nothing to add → render nothing

export interface AddContext {
  /** The calendar's selected day, when there is one (§7k.2: "schedule when a day is selected"). */
  daySelected?: boolean;
  /** May this person create kibbutzim? `canManageKibbutzim(user, isViewer)` — עידן + עמיחי. */
  canManageKibbutzim?: boolean;
}

/**
 * Which actions OPEN A FORM here and now. A ➕ label is a promise that something gets created
 * on the spot; `stockChange` and the two calendar actions only NAVIGATE until Tasks 8 and 13
 * ship their forms, so they say "עבור ל…" instead (review fix 5). When those tasks land they
 * flip to true and take a ➕ label — the matrix §7k.2 fixes does not change.
 */
export const ADD_OPENS_FORM: Record<Exclude<AddAction, 'none'>, boolean> = {
  kibbutz: true,
  visit: true,
  feedback: true,
  schedule: false,
  event: false,
  stockChange: true,     // 🔢 דיווח שינוי במלאי is a real form now (islands/StockChange.tsx)
};

export const ADD_LABEL: Record<Exclude<AddAction, 'none'>, string> = {
  kibbutz: '➕ קיבוץ',
  visit: '➕ סיכום ביקור',
  feedback: '➕ רעיון / באג',
  // Navigation, and the words say so — never "➕ דיווח מלאי" on a button that just changes page.
  schedule: 'עבור ליומן',
  event: 'עבור ליומן',
  stockChange: '➕ דיווח מלאי',
};

/** The label for the header button; `null` when nothing should be rendered. */
export function primaryAddLabel(action: AddAction): string | null {
  return action === 'none' ? null : ADD_LABEL[action];
}

/** Does this action create something (➕) or merely go somewhere? Drives the header's icon. */
export function primaryAddOpensForm(action: AddAction): boolean {
  return action !== 'none' && ADD_OPENS_FORM[action];
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
      // The calendar's own ➕ lives inside the calendar island; a header button that only
      // said "עבור ליומן" while ON the calendar was the bug עידן reported for מלאי (22.9, B4).
      return 'none';
    case 'inventory':
      return 'stockChange';
    case 'attendance':
      return 'visit';
    // Read-only or externally owned screens: the dev board has its own per-column add,
    // התראות is a list, and 🔥 צריבות is a fixed set of meters nobody adds to by hand
    // (the list is refreshed from the EMS). (The משימות / EMS / עובדים pages retired in
    // Task 14 — §7m R1/R2/R5.)
    case 'dev':
    case 'pushlog':
    case 'burns':
    default:
      return 'none';
  }
}

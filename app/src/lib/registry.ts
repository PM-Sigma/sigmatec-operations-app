// "⋯ עוד" sheet registry. Task 0 ships the nav; later tasks (feedback box, import, field flow)
// add their own entries without editing Nav.tsx: registerMoreItem({id,label,icon,onSelect,roles}).
// `roles` omitted = visible to everyone; otherwise only to the listed roles (viewer included
// explicitly, per spec §6 — the viewer sees 🏘 · 📊 דוחות · ⋯ with theme + viewer-safe items).
export type SigmaRole = 'idan' | 'team' | 'viewer';

export interface MoreItem {
  id: string;
  label: string;
  /** lucide-react icon name, e.g. 'MessageSquarePlus' */
  icon: string;
  onSelect: () => void;
  roles?: SigmaRole[];
  /**
   * Which block of the ⋯ sheet the row belongs to (§7k #3): 'app' = the everyday rows every
   * role sees, 'admin' = the management block that is separated by a rule and a label.
   * Defaults to 'app'.
   */
  group?: 'app' | 'admin';
  /**
   * An ATTENTION count — how many things here need the person to act (§7k #3: "attention
   * badges only for action-needed items"). Anything else (a total, a "new since" number) does
   * not belong on a nav badge. Asked live, like `visible`; 0 / undefined = no badge.
   */
  badge?: () => number;
  /**
   * An extra gate, asked EVERY time the sheet is listed. `roles` cannot express the app's
   * finer permissions — "admin" is `canManageStaff()` (עידן + עמיחי), a subset of the `idan`
   * + `team` roles — and a role read once at registration goes stale the moment someone uses
   * changeUser(). A predicate is evaluated live, so it can never be stale.
   */
  visible?: () => boolean;
  /**
   * A short neutral label next to the row (round 5 G-L6), e.g. "ניסיוני" on "יומן היום" while
   * the feature is still being tried out. S renders it as a `Tag` in MoreSheet; unset = none.
   */
  tag?: string;
}

const items: MoreItem[] = [];
const listeners = new Set<() => void>();

export function registerMoreItem(item: MoreItem): void {
  const at = items.findIndex(i => i.id === item.id);
  if (at === -1) items.push(item); else items[at] = item;      // re-register replaces, never duplicates
  listeners.forEach(fn => fn());
}

export function listMoreItems(role: SigmaRole): MoreItem[] {
  // A throwing predicate hides the item rather than taking the whole sheet down with it.
  const allowed = (i: MoreItem) => {
    if (!i.visible) return true;
    try { return !!i.visible(); } catch { return false; }
  };
  return items.filter(i => (!i.roles || i.roles.includes(role)) && allowed(i));
}

/** The attention count for one row, never throwing and never negative. */
export function itemBadge(item: MoreItem): number {
  if (!item.badge) return 0;
  try { const n = Number(item.badge()); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; }
  catch { return 0; }
}

/** Subscribe to registry changes (used by Nav so a late registration still shows up). */
export function onMoreItemsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Test-only: wipe the registry between cases. */
export function _resetRegistry(): void {
  items.length = 0;
  listeners.clear();
}

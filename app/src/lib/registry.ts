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
}

const items: MoreItem[] = [];
const listeners = new Set<() => void>();

export function registerMoreItem(item: MoreItem): void {
  const at = items.findIndex(i => i.id === item.id);
  if (at === -1) items.push(item); else items[at] = item;      // re-register replaces, never duplicates
  listeners.forEach(fn => fn());
}

export function listMoreItems(role: SigmaRole): MoreItem[] {
  return items.filter(i => !i.roles || i.roles.includes(role));
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

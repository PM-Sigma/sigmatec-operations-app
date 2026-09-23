import type { SigmaPage } from '@/bridge';
import type { PersonRole } from '@/lib/landing';
import { primaryAdd, primaryAddLabel, primaryAddOpensForm, type AddContext } from '@/lib/primaryAdd';
import { runAdd } from '@/lib/runAdd';

export interface PageAction {
  id: string; label: string; icon: string; primary?: boolean;
  onSelect: () => void; visible?: () => boolean;
}

const byPage = new Map<SigmaPage, PageAction[]>();
const listeners = new Set<() => void>();

export function registerPageAction(page: SigmaPage, action: PageAction): void {
  const list = byPage.get(page) ?? [];
  const at = list.findIndex(x => x.id === action.id);
  if (at === -1) list.push(action); else list[at] = action;
  byPage.set(page, list);
  listeners.forEach(fn => fn());
}

export function onPageActionsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function pageActionsFor(page: SigmaPage, role: PersonRole, ctx: AddContext = {}) {
  const add = primaryAdd(page, role, ctx);
  const label = primaryAddLabel(add);
  const all: PageAction[] = [];
  if (label) {
    all.push({ id: `add:${add}`, label, icon: primaryAddOpensForm(add) ? 'Plus' : 'ArrowLeft', primary: true, onSelect: () => runAdd(add) });
  }
  for (const x of byPage.get(page) ?? []) {
    let ok = true;
    try { ok = !x.visible || !!x.visible(); } catch { ok = false; }
    if (ok) all.push(x);
  }
  return { shown: all.slice(0, 2), overflow: all.slice(2) };
}

export function _resetPageActions(): void { byPage.clear(); listeners.clear(); }

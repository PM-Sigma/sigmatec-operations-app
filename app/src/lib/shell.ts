// What the shell knows about each page: the title in the page-action row, whether it is a nav
// peer (level 1) or a page reached from a menu (level 2, gets the back chevron).
import type { SigmaPage } from '@/bridge';

export type PageLevel = 1 | 2;
export interface PageMeta {
  title: string;
  level: PageLevel;
  titleLines: 1 | 2;
  /**
   * S-U merge fallout (26.9): Attendance (A), BurnsPage/PushLog (G-U2/G-U3) and DevBoard (D-U1)
   * each draw their OWN `<PageActionRow>` — a richer title (person switch, live counts) or
   * actions the shared row has no slot for. They predate the shell's global `#sigma-page-bar`
   * (this file), so once it merged in every one of those pages got TWO `<h1>` rows on screen —
   * caught by attendance.spec.ts's `getByRole('heading', { name: /נוכחות/ })` strict-mode
   * violation. `ownHeader: true` tells PageBar to render nothing for that page instead of a
   * competing title (spec: one page title per screen) — the island's own row is still driven by
   * this same title text where it can be, so the two never drift apart by accident.
   */
  ownHeader?: true;
}

export const PAGE_META: Record<SigmaPage, PageMeta> = {
  kibbutz: { title: 'קיבוצים', level: 1, titleLines: 1 },
  calendar: { title: 'יומן', level: 1, titleLines: 1 },
  attendance: { title: 'נוכחות', level: 1, titleLines: 1, ownHeader: true },
  inventory: { title: 'מלאי', level: 1, titleLines: 1 },
  hours: { title: 'שעות מול לקוחות', level: 2, titleLines: 1 },
  dev: { title: 'פיתוח', level: 2, titleLines: 1, ownHeader: true },
  pushlog: { title: 'התראות שנשלחו', level: 2, titleLines: 1, ownHeader: true },
  fieldops: { title: 'פעולות שטח', level: 2, titleLines: 1, ownHeader: true },
  emsstats: { title: 'סטטיסטיקת משימות EMS', level: 2, titleLines: 1, ownHeader: true },
  burns: { title: 'צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק', level: 2, titleLines: 2, ownHeader: true },
};

export const pageMeta = (page: SigmaPage): PageMeta => PAGE_META[page] ?? PAGE_META.kibbutz;

export const HEADER_LABELS = { home: 'מסך הבית', settings: 'הגדרות' } as const;

export function bellLabel(unseen: number): string {
  if (!unseen) return 'התראות';
  return unseen === 1 ? 'התראות, 1 חדשה' : `התראות, ${unseen} חדשות`;
}

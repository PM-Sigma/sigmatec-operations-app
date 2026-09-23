// What the shell knows about each page: the title in the page-action row, whether it is a nav
// peer (level 1) or a page reached from a menu (level 2, gets the back chevron).
import type { SigmaPage } from '@/bridge';

export type PageLevel = 1 | 2;
export interface PageMeta { title: string; level: PageLevel; titleLines: 1 | 2 }

export const PAGE_META: Record<SigmaPage, PageMeta> = {
  kibbutz: { title: 'קיבוצים', level: 1, titleLines: 1 },
  calendar: { title: 'יומן', level: 1, titleLines: 1 },
  attendance: { title: 'נוכחות', level: 1, titleLines: 1 },
  inventory: { title: 'מלאי', level: 1, titleLines: 1 },
  hours: { title: 'שעות מול לקוחות', level: 2, titleLines: 1 },
  dev: { title: 'פיתוח', level: 2, titleLines: 1 },
  pushlog: { title: 'התראות שנשלחו', level: 2, titleLines: 1 },
  burns: { title: 'צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק', level: 2, titleLines: 2 },
};

export const pageMeta = (page: SigmaPage): PageMeta => PAGE_META[page] ?? PAGE_META.kibbutz;

export const HEADER_LABELS = { home: 'מסך הבית', settings: 'הגדרות' } as const;

export function bellLabel(unseen: number): string {
  if (!unseen) return 'התראות';
  return unseen === 1 ? 'התראות, 1 חדשה' : `התראות, ${unseen} חדשות`;
}

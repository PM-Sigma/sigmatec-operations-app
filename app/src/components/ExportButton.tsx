import * as React from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

// One look for every export button (עידן 8.10): a GREEN spreadsheet "Excel" and a RED document
// "PDF", each with its small label, so the two can never be mistaken for plain document icons.
// Colours are the theme-tuned ink tokens (--s-ok-ink / --s-danger-ink), readable in light + dark.
export type ExportKind = 'excel' | 'pdf';

const KIND = {
  excel: { Icon: FileSpreadsheet, label: 'Excel', aria: 'ייצוא ל-Excel', tone: 'text-[color:var(--s-ok-ink)] border-[color:var(--s-ok-ink)]/40' },
  pdf: { Icon: FileText, label: 'PDF', aria: 'ייצוא ל-PDF', tone: 'text-[color:var(--s-danger-ink)] border-[color:var(--s-danger-ink)]/40' },
} as const;

export function ExportButton({ kind, onClick, className, ...rest }: {
  kind: ExportKind; onClick: () => void; className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
  const { Icon, label, aria, tone } = KIND[kind];
  return (
    <button
      type="button"
      aria-label={aria}
      data-export={kind}
      onClick={onClick}
      className={cn('flex h-11 min-w-11 flex-col items-center justify-center gap-px rounded-xl border bg-card px-2', tone, className)}
      {...rest}
    >
      <Icon aria-hidden className="h-[18px] w-[18px]" />
      <span aria-hidden className="text-[10px] font-extrabold leading-none">{label}</span>
    </button>
  );
}

// IdentityRow — avatar initial · name · role, shared by GearSheet and MoreSheet. Its own tiny
// module (not exported from GearSheet.tsx) on purpose: MoreSheet.tsx is a boot-eager file
// (imported from main.tsx, not lazy), and GearSheet.tsx pulls in the whole Settings/Sheet/
// lucide-icon tree behind it — importing IdentityRow FROM GearSheet dragged that entire tree
// into the boot chunk and blew the byte ceiling (round-5 S-U, designer re-review). A read-only
// row with no actions of its own belongs in a leaf module both sides can import cheaply.
import * as React from 'react';
import { roleOf, type PersonRole } from '@/lib/landing';

export const ROLE_LABEL: Record<PersonRole, string> = {
  field: 'שטח', pm: 'ניהול מוצר', dev: 'פיתוח', ceo: 'הנהלה', viewer: 'צפייה',
};

/** Identity header (avatar initial · name · role) — a static row, no menu of its own:
 * MoreSheet used to nest UserChip's whole dropdown-with-a-dot inside the sheet ("• עידן"),
 * which read as an unrelated control floating in someone else's sheet. Both sheets now show
 * the same read-only identity block; the gear/settings/switch-user actions live in GearSheet's
 * own rows. */
export function IdentityRow({ name, role, isViewer }: { name: string; role: string; isViewer: boolean }) {
  const personRole = roleOf(name, role);
  const label = isViewer ? ROLE_LABEL.viewer : ROLE_LABEL[personRole];
  return (
    <div className="mb-2 flex items-center gap-3 border-b border-border pb-3">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-bold text-foreground">
        {(name || '?').slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-foreground">{name || 'לא מחובר'}</div>
        <div className="text-[13px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

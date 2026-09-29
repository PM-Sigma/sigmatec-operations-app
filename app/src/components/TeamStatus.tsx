// "מצב הצוות" (Q7-C 7.1) — עידן only: per staff member, is the app installed and are
// notifications on. A lazy piece: it is imported by the settings island and the gear sheet's
// lazy extras, never by the boot chunk. Sources and the "table not live yet" rule live in
// lib/teamStatus.ts.
import * as React from 'react';
import { SectionBlock } from '@/components/ui/section-block';
import { ListRow } from '@/components/ui/list-row';
import { Tag } from '@/components/ui/chip';
import { canSeeTeamStatus, fetchTeamStatus, type StaffRow } from '@/lib/teamStatus';

export function TeamStatus({ user }: { user: string }) {
  const allowed = canSeeTeamStatus(user);
  const [rows, setRows] = React.useState<StaffRow[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!allowed) return;
    let live = true;
    void fetchTeamStatus(user).then(r => { if (live) setRows(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [allowed, user]);

  if (!allowed) return null;

  return (
    <SectionBlock title="מצב הצוות">
      <div data-testid="team-status">
        {failed && <ListRow title="לא הצלחתי לטעון את מצב הצוות" trailing={null} />}
        {!failed && !rows && <ListRow title="טוען..." trailing={null} />}
        {rows?.map(r => (
          <ListRow
            key={r.person}
            title={r.person}
            trailing={
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                <Tag role={r.installed === null ? 'neutral' : r.installed ? 'ok' : 'warn'}>
                  {r.installed === null ? 'התקנה: לא פעיל עדיין' : r.installed ? 'מותקנת' : 'לא מותקנת'}
                </Tag>
                <Tag role={r.notif ? 'ok' : 'warn'}>{r.notif ? 'התראות פעילות' : 'התראות כבויות'}</Tag>
              </span>
            }
          />
        ))}
      </div>
    </SectionBlock>
  );
}

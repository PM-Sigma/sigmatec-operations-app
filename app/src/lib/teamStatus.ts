// "מצב הצוות" (Q7-C 7.1, עידן only): per staff member — is the app installed on a device, and is
// a notification subscription registered. Notifications come from `push_subscriptions` (exists
// today); "installed" comes from `staff_devices` (db/staff_devices.sql, NOT applied yet) — when
// that table/RPC is missing the installed column is `null`, which the UI shows as "לא פעיל עדיין".

export const STAFF = ['עידן', 'עמיחי', 'אביאם', 'ניתאי', 'אבצן', 'מתניה', 'אליה'] as const;

/** The panel is עידן's alone (the SQL reader refuses anyone else too). */
export function canSeeTeamStatus(user: string): boolean {
  return String(user ?? '').trim() === 'עידן';
}

export interface StaffRow {
  person: string;
  /** a push subscription exists for this person */
  notif: boolean;
  /** true / false, or null = the device table is not live so it is unknown */
  installed: boolean | null;
  devices: number;
}

export interface DeviceRow { person: string; is_standalone?: boolean | null }

/** Pure: join the two sources onto the roster. `devs === null` means "device table missing". */
export function buildTeamStatus(
  staff: readonly string[], subs: Array<{ owner: string }>, devs: DeviceRow[] | null,
): StaffRow[] {
  return staff.map(person => {
    const mine = devs ? devs.filter(d => d.person === person) : [];
    return {
      person,
      notif: subs.some(s => s.owner === person),
      installed: devs === null ? null : mine.some(d => !!d.is_standalone),
      devices: mine.length,
    };
  });
}

export async function fetchTeamStatus(actor: string): Promise<StaffRow[]> {
  const { getSupabase } = await import('@/lib/supabase');
  const sb = await getSupabase();
  const [subsRes, devRes] = await Promise.all([
    sb.from('push_subscriptions').select('owner'),
    sb.rpc('staff_devices_report', { p_actor: actor }),
  ]);
  const subs = subsRes.error ? [] : ((subsRes.data as Array<{ owner: string }>) || []);
  const devs = devRes.error ? null : ((devRes.data as DeviceRow[]) || []);
  return buildTeamStatus(STAFF, subs, devs);
}

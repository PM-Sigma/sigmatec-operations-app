// #sigma-holidays — 🕎 חגים וסגירות (spec §7e), a ⋯ עוד row for עידן and עמיחי.
//
// Small on purpose. The calendar itself is seeded from Hebcal (db/holidays_seed.mjs); what
// the two of them need from a screen is exactly two things:
//   • flip a date between "לא נדרשת נוכחות" and "יום עבודה רגיל"  (the `required` column)
//   • declare a company closure that no calendar knows about      (a new row)
// Everything else about a holiday is a fact, not a preference, so there is nothing to edit.
import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionBlock } from '@/components/ui/section-block';
import { SectionError } from '@/components/ui/section-error';
import { EmptyState } from '@/components/ui/empty-state';
import { ListRow } from '@/components/ui/list-row';
import { BubbleButton } from '@/components/ui/bubble-button';
import { mount } from '@/islands';
import { SigmaProviders } from '@/lib/query';
import { registerMoreItem } from '@/lib/registry';
import { getSupabase, sbWrite } from '@/lib/supabase';
import { track } from '@/lib/track';
import { sigma } from '@/bridge';
import { dayChip, HE_MONTHS, holidayShort, isHolidayEve, ymd, type Holiday } from '@/lib/attendance';
import { toastFailure } from '@/lib/pending';

const OPEN_EVENT = 'sigma-holidays-open';

/** From today on. A past holiday is history — there is nothing to decide about it. */
async function fetchHolidays(): Promise<Holiday[]> {
  const sb = await getSupabase();
  const from = ymd(new Date());
  const { data, error } = await sb.from('company_holidays')
    .select('date,name,kind,required').gte('date', from).order('date').limit(60);
  if (error) throw error;
  return (data || []).map(h => ({ ...h, date: String(h.date).slice(0, 10), required: !!h.required })) as Holiday[];
}

function HolidaysIsland() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState('');
  const [name, setName] = React.useState('');

  React.useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);

  const q = useQuery({ queryKey: ['companyHolidays'], queryFn: fetchHolidays, enabled: open });

  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: ['companyHolidays'] });
    // The session's cached list (SHEET_DATA.holidays) has to follow, or the report and the
    // grid keep the old answer until a reload.
    try {
      (window as any).attHolidaysLoaded = null;
      void sigma.attHolidaysLoad?.();
    } catch { /* legacy report not on this page */ }
  };

  const toggle = useMutation({
    mutationFn: async (v: { date: string; required: boolean }) =>
      sbWrite(sb => sb.from('company_holidays').update({ required: v.required }).eq('date', v.date).select()),
    onSuccess: (_d, v) => { track('holiday-required', String(v.required)); done(v.required ? 'סומן כיום עבודה' : 'סומן כיום חופשי'); },
    onError: (e: Error) => toastFailure(e),
  });

  const add = useMutation({
    mutationFn: async () => sbWrite(sb => sb.from('company_holidays').upsert({
      date, name: name.trim(), kind: 'company_closure', required: false,
      created_by: sigma.getCurrentUser?.() || '',
    }).select()),
    onSuccess: () => { track('holiday-add'); setDate(''); setName(''); done('הסגירה נוספה ללוח'); },
    onError: (e: Error) => toastFailure(e),
  });

  const rows = q.data || [];

  // One SectionBlock per month, oldest-first inside a month (already sorted by the query).
  const byMonth = React.useMemo(() => {
    const groups: { key: string; title: string; rows: Holiday[] }[] = [];
    for (const h of rows) {
      const [y, m] = h.date.split('-').map(Number);
      const key = h.date.slice(0, 7);
      let g = groups.find(x => x.key === key);
      if (!g) { g = { key, title: HE_MONTHS[m - 1] + ' ' + y, rows: [] }; groups.push(g); }
      g.rows.push(h);
    }
    return groups;
  }, [rows]);

  // §7p: a half-entered closure (date + name) is not thrown away by a stray tap.
  const guard = useUnsavedGuard({
    dirty: () => date !== '' || name.trim() !== '',
    onDiscard: () => { setDate(''); setName(''); },
    onClose: () => setOpen(false),
  });

  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(setOpen)}>
      <SheetContent side="bottom" data-testid="holidays-sheet" className="max-h-[88svh] overflow-y-auto" {...guard.contentProps}>
        <SheetHeader className="text-start">
          <SheetTitle>חגים וסגירות</SheetTitle>
          <SheetDescription>בימים האלה לא נדרשת נוכחות. אפשר להזין נוכחות בכל זאת, היא נספרת כיום עבודה.</SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex flex-col gap-3">
          {q.isLoading && <Skeleton className="h-40 w-full rounded-[12px]" />}
          {q.isError && (
            <SectionError text="לא הצלחנו לטעון את החגים." onRetry={() => void qc.invalidateQueries({ queryKey: ['companyHolidays'] })} />
          )}
          {!q.isLoading && !q.isError && !rows.length && (
            <EmptyState icon={<CalendarDays />} title="אין חגים ברשימה." />
          )}
          {byMonth.map(g => (
            <SectionBlock key={g.key} title={g.title} titleRole="holiday">
              {g.rows.map(h => {
                const eve = isHolidayEve(h);
                return (
                  <ListRow
                    key={h.date}
                    data-holiday={h.date}
                    leading={<span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--holiday-ink)]" />}
                    title={h.name}
                    meta={<><bdi>{dayChip(h.date)}</bdi>{eve ? ' · ערב חג' : h.kind !== 'holiday' ? ' · ' + holidayShort(h) : ''}</>}
                    trailing={
                      <Switch
                        checked={!h.required}
                        aria-label={'המשרד סגור ב' + h.name}
                        disabled={toggle.isPending}
                        onCheckedChange={v => toggle.mutate({ date: h.date, required: !v })}
                      />
                    }
                  />
                );
              })}
            </SectionBlock>
          ))}
        </div>

        <form
          className="mt-4 flex flex-wrap gap-2 rounded-[var(--r-lg)] bg-muted p-3"
          onSubmit={e => { e.preventDefault(); if (date && name.trim()) add.mutate(); }}
        >
          <input
            type="date" value={date} onChange={e => setDate(e.target.value)} required aria-label="תאריך"
            className="h-12 flex-none rounded-[10px] border border-border bg-background px-2.5 text-[13px]"
          />
          <input
            value={name} onChange={e => setName(e.target.value)} required aria-label="שם הסגירה"
            placeholder="יום גיבוש, סגירת משרד…"
            className="h-12 min-w-0 flex-1 rounded-[10px] border border-border bg-background px-3 text-[13px]"
          />
          <BubbleButton
            type="submit" variant="tonal" data-testid="holiday-add"
            disabled={add.isPending || !date || !name.trim()} aria-busy={add.isPending || undefined}
          >
            הוספה
          </BubbleButton>
        </form>
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

export function Holidays() {
  return <SigmaProviders><HolidaysIsland /></SigmaProviders>;
}

export function mountHolidays(): boolean {
  const ok = mount('sigma-holidays', Holidays);
  if (!ok) return false;
  // `visible` is asked live, so a changeUser() can never leave the row behind for someone
  // who may not set company closures (registry.ts).
  registerMoreItem({
    id: 'holidays',
    label: 'חגים וסגירות',
    icon: 'CalendarCheck',
    group: 'admin',
    visible: () => { try { return !!sigma.isAdmin?.(); } catch { return false; } },
    onSelect: () => window.dispatchEvent(new CustomEvent(OPEN_EVENT)),
  });
  return true;
}

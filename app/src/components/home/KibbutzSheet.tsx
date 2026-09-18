// ➕ קיבוץ חדש / ✏️ פרטי קיבוץ (spec §7b). One bottom sheet, two modes:
//   🏘 קיבוץ חדש (לקוח חדש)   — name · section · region · energy · 🤝
//   ↳ תת-אתר של קיבוץ קיים    — parent picker; section + region are INHERITED (hidden), and
//                               the 5-step EMS verification chain runs against the typed name.
// Energy chips are עידן's alone (spec §7b); for everyone else they render disabled and the
// save body drops the `energy` key entirely, so the server keeps whatever it had.
import * as React from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EmsChain } from '@/components/home/EmsChain';
import { sigma } from '@/bridge';
import { sbWrite } from '@/lib/supabase';
import { emsChainRun } from '@/lib/emsChain';
import {
  ENERGY_LABEL, ENERGY_LOCK_TITLE, canEditEnergy, emsChainPlan, emsChainReduce,
  energyOf, kibbutzimSaveBody, labelOf, regionOrder, sectionOf, validateKibbutz,
  type ChainInput, type ChainStep, type Energy, type KibbutzRow, type Section,
} from '@/lib/kibbutzim';

const ENERGIES: Energy[] = ['electric', 'water', 'gas'];

const fieldLabel = 'mb-1 mt-2.5 block text-xs font-bold text-muted-foreground';
const fieldBox =
  'w-full min-h-[48px] rounded-xl border border-border bg-muted px-3 py-2.5 text-base outline-none focus:border-[color:var(--brand-1)]';

export function KibbutzSheet({
  open, onOpenChange, row, allRows, user, onSaved, onArchived, prefillName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null → create mode. */
  row: KibbutzRow | null;
  /** Create mode only: the name to start from (the import preview's "צור קיבוץ"). */
  prefillName?: string;
  allRows: KibbutzRow[];
  user: string;
  onSaved: (row: KibbutzRow) => void;
  onArchived: (name: string) => void;
}) {
  const editing = !!row;
  const mayEditEnergy = canEditEnergy(user);

  const [kind, setKind] = React.useState<'kibbutz' | 'subsite'>('kibbutz');
  const [name, setName] = React.useState('');
  const [parent, setParent] = React.useState('');
  const [section, setSection] = React.useState<Section>('new');
  const [region, setRegion] = React.useState('');
  const [energy, setEnergy] = React.useState<Energy[]>(['electric']);
  const [marketing, setMarketing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [steps, setSteps] = React.useState<ChainStep[]>([]);
  const [chain, setChain] = React.useState<ChainInput | null>(null);
  const [allowUnlinked, setAllowUnlinked] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);

  // Reset the form every time the sheet opens, so a previous edit can never bleed into a create.
  React.useEffect(() => {
    if (!open) return;
    setKind(row?.kind === 'subsite' ? 'subsite' : 'kibbutz');
    setName(row?.name || prefillName || '');
    setParent(row?.parent || '');
    setSection(row ? sectionOf(row) : 'new');
    setRegion(row?.region || '');
    setEnergy(row ? energyOf(row) : ['electric']);
    setMarketing(!!row?.marketing);
    setSteps([]); setChain(null); setAllowUnlinked(false); setConfirmArchive(false); setSaving(false);
  }, [open, row, prefillName]);

  const parents = React.useMemo(
    () => allRows.filter(r => !r.archived_at && r.kind !== 'subsite' && r.name !== row?.name)
      .slice().sort((a, b) => labelOf(a).localeCompare(labelOf(b), 'he')),
    [allRows, row],
  );
  const parentRow = React.useMemo(() => parents.find(p => p.name === parent) || null, [parents, parent]);

  const regions = React.useMemo(() => {
    const seen = new Set<string>(regionOrder());
    allRows.forEach(r => { if (r.region) seen.add(r.region); });
    return Array.from(seen);
  }, [allRows]);

  const reduced = React.useMemo(
    () => (chain ? emsChainReduce({ ...chain, allowUnlinked }) : null),
    [chain, allowUnlinked],
  );

  const runChain = React.useCallback(async () => {
    const target = name.trim();
    if (!target) { toast.error('הזן שם קודם'); return; }
    if (!sigma.isEmsConnected()) toast.warning('אין חיבור ל-EMS — הבדיקה תסתמך על מה שזמין');
    setRunning(true);
    const plan = emsChainPlan(target, kind === 'subsite' ? parentRow : null, allRows);
    setSteps(plan);
    try {
      const res = await emsChainRun(target, kind === 'subsite' ? parentRow : null, allRows, partial => {
        setSteps(emsChainReduce({ ...partial, allowUnlinked }).steps);
      });
      setChain(res);
      setSteps(emsChainReduce({ ...res, allowUnlinked }).steps);
    } catch (e: any) {
      toast.error('בדיקת EMS נכשלה: ' + (e?.message || e));
    } finally {
      setRunning(false);
    }
  }, [name, kind, parentRow, allRows, allowUnlinked]);

  // Sub-site mode runs the chain as soon as there is a name + parent (spec §7b: "runs when
  // the name is typed"), debounced so every keystroke does not hit EMS.
  React.useEffect(() => {
    if (!open || kind !== 'subsite' || !name.trim() || !parentRow) return;
    const t = setTimeout(() => { void runChain(); }, 700);
    return () => clearTimeout(t);
    // runChain is intentionally out of the deps: it changes on every keystroke via `name`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, name, parent]);

  const toggleEnergy = (e: Energy) => {
    if (!mayEditEnergy) return;
    setEnergy(cur => (cur.indexOf(e) === -1 ? [...ENERGIES.filter(x => cur.indexOf(x) !== -1 || x === e)] : cur.filter(x => x !== e)));
  };

  async function save() {
    const draft: KibbutzRow = {
      id: row?.id,
      name,
      display_name: row?.display_name ?? null,
      section,
      region,
      // Chain-derived energy wins for a sub-site (spec §7b: "for non-עידן this proposal is
      // what gets saved"); עידן's manual pick wins when he touched the chips.
      energy: mayEditEnergy ? energy : (reduced?.energy || energy),
      marketing,
      kind,
      parent: kind === 'subsite' ? parent : null,
      ems_site_ids: reduced?.ems_site_ids?.length ? reduced.ems_site_ids : row?.ems_site_ids,
      ems_params: reduced?.ems_params || row?.ems_params,
      created_by: row?.created_by || user,
    };
    const v = validateKibbutz(draft, allRows);
    if (!v.ok) { toast.error(v.errors[0]); return; }
    // A sub-site exists to be linked to an EMS site. Saving one is allowed only when the
    // chain actually ran and found the site, or when the user explicitly said "unlinked" —
    // `reduced === null` (the chain never ran, e.g. the name was pasted and saved at once)
    // must not slip through as if it had passed.
    if (kind === 'subsite' && !allowUnlinked && !(reduced && reduced.canSave)) {
      toast.error(reduced
        ? 'לא נמצא אתר ב-EMS — סמן "שמור בלי קישור" כדי לשמור בכל זאת'
        : 'הרץ "בדוק מול EMS" לפני שמירת תת-אתר, או סמן "שמור בלי קישור"');
      return;
    }
    setSaving(true);
    try {
      const body = kibbutzimSaveBody(v.row, user);
      // Editing is an UPDATE BY ID, never an upsert on `name`: renaming a kibbutz through an
      // on_conflict=name upsert would insert a second row (new name) or trip the primary key.
      const data = await sbWrite<KibbutzRow>(sb => (row?.id
        ? sb.from('kibbutzim').update(body).eq('id', row.id).select().single()
        : sb.from('kibbutzim').insert(body).select().single()) as any);
      toast.success('נשמר: ' + v.row.name);
      onSaved(data || v.row);
      onOpenChange(false);
    } catch (e: any) {
      toast.error('שמירה נכשלה: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!row) return;
    setSaving(true);
    try {
      await sbWrite(sb => sb.from('kibbutzim')
        .update({ archived_at: new Date().toISOString() })
        .eq('name', row.name) as any);
      toast.success('אורכב: ' + row.name);
      onArchived(row.name);
      onOpenChange(false);
    } catch (e: any) {
      toast.error('ארכוב נכשל: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const isSub = kind === 'subsite';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-[26px] p-4 pb-7">
        <SheetHeader className="text-start">
          <SheetTitle className="text-[22px] font-extrabold">
            {editing ? '✏️ פרטי קיבוץ' : '➕ קיבוץ חדש'}
          </SheetTitle>
          <SheetDescription>
            {editing ? 'עדכון פרטים · ארכוב במקום מחיקה' : 'קיבוץ חדש או תת-אתר של קיבוץ קיים'}
          </SheetDescription>
        </SheetHeader>

        {!editing && (
          <ToggleGroup
            type="single"
            value={kind}
            onValueChange={v => v && setKind(v as 'kibbutz' | 'subsite')}
            className="mt-3 grid grid-cols-2 gap-2"
          >
            <ToggleGroupItem value="kibbutz" className="h-auto min-h-[56px] rounded-2xl border border-border bg-muted px-2 text-[15px] font-bold data-[state=on]:border-[color:var(--brand-1)] data-[state=on]:bg-primary/10">
              🏘 קיבוץ חדש
            </ToggleGroupItem>
            <ToggleGroupItem value="subsite" className="h-auto min-h-[56px] rounded-2xl border border-border bg-muted px-2 text-[15px] font-bold data-[state=on]:border-[color:var(--brand-1)] data-[state=on]:bg-primary/10">
              ↳ תת-אתר של קיבוץ קיים
            </ToggleGroupItem>
          </ToggleGroup>
        )}

        {isSub && (
          <>
            <label className={fieldLabel} htmlFor="kibParent">קיבוץ-אב</label>
            <select id="kibParent" className={fieldBox} value={parent} onChange={e => setParent(e.target.value)}>
              <option value="">-- בחר קיבוץ --</option>
              {parents.map(p => <option key={p.name} value={p.name}>{labelOf(p)}</option>)}
            </select>
          </>
        )}

        <label className={fieldLabel} htmlFor="kibName">{isSub ? 'שם תת-האתר' : 'שם הקיבוץ'}</label>
        <input
          id="kibName"
          className={fieldBox}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={isSub ? 'גבים — שכונה חדשה' : 'שם כפי שיופיע על הכרטיס'}
          autoComplete="off"
        />

        {!isSub && (
          <>
            <label className={fieldLabel} htmlFor="kibRegion">איזור</label>
            <input id="kibRegion" className={fieldBox} value={region} list="kibRegions"
                   onChange={e => setRegion(e.target.value)} placeholder="עמק הירדן" autoComplete="off" />
            <datalist id="kibRegions">{regions.map(r => <option key={r} value={r} />)}</datalist>

            <label className={fieldLabel}>מדור</label>
            <ToggleGroup type="single" value={section} onValueChange={v => v && setSection(v as Section)}
                         className="grid grid-cols-2 gap-2">
              <ToggleGroupItem value="new" className="h-auto min-h-[48px] rounded-xl border border-border bg-muted font-bold data-[state=on]:border-[color:var(--brand-1)] data-[state=on]:bg-primary/10">🆕 לקוח חדש</ToggleGroupItem>
              <ToggleGroupItem value="active" className="h-auto min-h-[48px] rounded-xl border border-border bg-muted font-bold data-[state=on]:border-[color:var(--brand-1)] data-[state=on]:bg-primary/10">✅ פעיל</ToggleGroupItem>
            </ToggleGroup>
          </>
        )}
        {isSub && parentRow && (
          <p className="mt-2 text-xs text-muted-foreground">
            מדור ואיזור יורשים מ<bdi>{labelOf(parentRow)}</bdi>: {sectionOf(parentRow) === 'new' ? '🆕 חדש' : '✅ פעיל'}
            {parentRow.region ? ' · ' + parentRow.region : ''}
          </p>
        )}

        <label className={fieldLabel}>
          סוגי אנרגיה{!mayEditEnergy && <span className="font-medium"> · {ENERGY_LOCK_TITLE}</span>}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ENERGIES.map(e => {
            const on = energy.indexOf(e) !== -1;
            return (
              <button
                key={e}
                type="button"
                disabled={!mayEditEnergy}
                title={mayEditEnergy ? undefined : ENERGY_LOCK_TITLE}
                onClick={() => toggleEnergy(e)}
                className={
                  'min-h-[40px] rounded-full border px-3 text-[13px] font-semibold disabled:opacity-50 ' +
                  (on ? 'border-transparent bg-foreground text-background' : 'border-border bg-card text-muted-foreground')
                }
              >
                {ENERGY_LABEL[e]}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Switch id="kibMkt" checked={marketing} onCheckedChange={setMarketing} />
          <label htmlFor="kibMkt" className="text-sm font-semibold">🤝 בתהליך שיווקי</label>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs font-bold text-muted-foreground">
            שרשרת בדיקה מול EMS{isSub ? ' · רצה אוטומטית' : ''}
          </span>
          <button
            type="button"
            onClick={() => void runChain()}
            disabled={running}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-border bg-muted px-3 text-[13px] font-semibold disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            בדוק מול EMS
          </button>
        </div>
        <EmsChain steps={steps} running={running} />

        {(isSub || !!reduced) && !(reduced && reduced.ems_site_ids.length) && (
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-muted px-2.5 py-2 text-xs">
            <Switch id="kibUnlinked" checked={allowUnlinked} onCheckedChange={setAllowUnlinked} />
            <label htmlFor="kibUnlinked">שמור בלי קישור — הכרטיס יסומן ⚠️ עד שיקושר</label>
          </div>
        )}

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-4 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl bg-brand-grad text-base font-bold text-white disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSub ? 'שמור תת-אתר' : 'שמור קיבוץ'}
        </button>

        {editing && (
          confirmArchive ? (
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void archive()} disabled={saving}
                      className="min-h-[48px] flex-1 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground">
                כן, ארכב את <bdi>{row!.name}</bdi>
              </button>
              <button type="button" onClick={() => setConfirmArchive(false)}
                      className="min-h-[48px] flex-1 rounded-xl border border-border text-sm font-bold">
                ביטול
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmArchive(true)}
                    className="mt-2 min-h-[48px] w-full rounded-xl border border-border text-sm font-bold text-destructive">
              🗄 ארכב קיבוץ
            </button>
          )
        )}
      </SheetContent>
    </Sheet>
  );
}

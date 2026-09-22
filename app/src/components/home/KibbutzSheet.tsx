// ➕ קיבוץ חדש / ✏️ פרטי קיבוץ (spec §7b). One bottom sheet, two modes:
//   🏘 קיבוץ חדש (לקוח חדש)   — name · section · region · energy · 🤝
//   ↳ תת-אתר של קיבוץ קיים    — parent picker; section + region are INHERITED (hidden).
// 22.9, QA round 4 Package Y (עידן): the 5-step EMS verification chain is GONE. The sheet
// writes the row exactly as typed; `ems_site_ids` is shown read-only ("✓ מקושר" / "⚠️ לא
// מקושר") and never derived here — see app/src/lib/kibbutzim.ts `isUnlinked` for where the
// missing-link error actually lives (card chip, alerts bell, health.ts).
// Energy chips are עידן's alone (spec §7b); for everyone else they render disabled and the
// save body drops the `energy` key entirely, so the server keeps whatever it had. Energy is a
// multi-select (עידן, Package Y): a site can carry more than one energy type at once.
import * as React from 'react';
import { toast } from 'sonner';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { spawnOnboardingForNewKibbutz } from '@/components/home/OnboardingProgress';
import { sbWrite } from '@/lib/supabase';
import {
  ENERGY_LABEL, ENERGY_LOCK_TITLE, canEditEnergy, customerCodeOf, emsLinkedLabel,
  energyOf, isMissingCustomerCodeColumn, isUnlinked, kibbutzimSaveBody, labelOf, regionOrder,
  sectionOf, subsitesOf, validateKibbutz, withoutCustomerCode,
  type Energy, type KibbutzRow, type Section,
} from '@/lib/kibbutzim';

const ENERGIES: Energy[] = ['electric', 'water', 'gas'];

/** The hard-coded CUSTOMER_CODES map in the legacy bundle — the fallback for a row with no
 *  `customer_code` of its own (db/kibbutzim_code.sql not applied, or a code never typed). */
function legacyCode(name: string): string {
  try { return String((window as any).customerCodeFor?.(name) || ''); } catch { return ''; }
}

const fieldLabel = 'mb-1 mt-2.5 block text-xs font-bold text-muted-foreground';
const fieldBox =
  'w-full min-h-[48px] rounded-xl border border-border bg-muted px-3 py-2.5 text-base outline-none focus:border-[color:var(--brand-1)]';

export function KibbutzSheet({
  open, onOpenChange, row, allRows, user, onSaved, onArchived, prefillName, prefillParent,
  onAddSubsite,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** null → create mode. */
  row: KibbutzRow | null;
  /** Create mode only: the name to start from (the import preview's "צור קיבוץ"). */
  prefillName?: string;
  /** Create mode only: open straight in ↳ תת-אתר mode with this kibbutz as the parent (D2). */
  prefillParent?: string;
  /** ➕ next to תתי-אתרים — the host re-opens this sheet in sub-site mode with the parent preset. */
  onAddSubsite?: (parentName: string) => void;
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
  const [code, setCode] = React.useState('');
  const [marketing, setMarketing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  // Archiving is TYPE-TO-CONFIRM (22.9): two kibbutzim were archived by accident when the
  // confirm button rendered under the finger that had just tapped 🗄. A second tap can never
  // archive anything now — only the exact name, typed, unlocks it.
  const [archiveTyped, setArchiveTyped] = React.useState('');

  // Reset the form every time the sheet opens, so a previous edit can never bleed into a create.
  React.useEffect(() => {
    if (!open) return;
    setKind(row?.kind === 'subsite' || (!row && prefillParent) ? 'subsite' : 'kibbutz');
    setName(row?.name || prefillName || '');
    setParent(row?.parent || (!row ? (prefillParent || '') : ''));
    setCode(customerCodeOf(row, row ? legacyCode(row.name) : ''));
    setSection(row ? sectionOf(row) : 'new');
    setRegion(row?.region || '');
    setEnergy(row ? energyOf(row) : ['electric']);
    setMarketing(!!row?.marketing);
    setConfirmArchive(false); setSaving(false);
    setArchiveTyped('');
  }, [open, row, prefillName, prefillParent]);

  // The sub-sites filed under THIS kibbutz (D2). Edit mode only: a kibbutz that does not
  // exist yet cannot have any.
  const subsites = React.useMemo(
    () => (row && row.kind !== 'subsite' ? subsitesOf(allRows, row.name) : []),
    [allRows, row],
  );

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

  // The chain used to force at least one energy type ON via the meter counts it found; with
  // it gone the toggle must never empty out entirely, so the last chip standing refuses to
  // turn itself off (a kibbutz always has some energy).
  const onEnergyChange = (vals: string[]) => {
    if (!mayEditEnergy) return;
    if (!vals.length) return;
    setEnergy(ENERGIES.filter(e => vals.indexOf(e) !== -1));
  };

  async function save() {
    const draft: KibbutzRow = {
      id: row?.id,
      name,
      display_name: row?.display_name ?? null,
      section,
      region,
      energy: mayEditEnergy ? energy : (row?.energy || energy),
      marketing,
      kind,
      parent: kind === 'subsite' ? parent : null,
      // No chain any more (Package Y) — the row is written exactly as it already stood.
      // `ems_site_ids` is edited elsewhere (or not at all); this sheet never touches it.
      ems_site_ids: row?.ems_site_ids,
      ems_params: row?.ems_params,
      customer_code: code.trim() === '' ? null : (Number(code.trim()) as number),
      created_by: row?.created_by || user,
    };
    const v = validateKibbutz(draft, allRows);
    if (!v.ok) { toast.error(v.errors[0]); return; }
    setSaving(true);
    try {
      const body = kibbutzimSaveBody(v.row, user);
      // Editing is an UPDATE BY ID, never an upsert on `name`: renaming a kibbutz through an
      // on_conflict=name upsert would insert a second row (new name) or trip the primary key.
      const isCreate = !row?.id;
      const write = (b: Record<string, unknown>) => sbWrite<KibbutzRow>(sb => (row?.id
        ? sb.from('kibbutzim').update(b).eq('id', row.id).select().single()
        : sb.from('kibbutzim').insert(b).select().single()) as any);
      // db/kibbutzim_code.sql may not be applied on this database yet — a PGRST204 about
      // `customer_code` is a missing migration, not a bad save, so retry without the key.
      let data: KibbutzRow | null = null;
      try {
        data = await write(body);
      } catch (e) {
        if (!isMissingCustomerCodeColumn(e)) throw e;
        data = await write(withoutCustomerCode(body));
        toast.warning('קוד הלקוח לא נשמר. חסרה העמודה customer_code בבסיס הנתונים');
      }
      // 🆕 לקוח חדש — spawn the onboarding checklist (Task 27, spec §4). Best-effort: a
      // template hiccup must never block the kibbutz itself from being created.
      if (isCreate && section === 'new') {
        void spawnOnboardingForNewKibbutz(v.row.name).catch(() => { /* card shows nothing to spawn from */ });
      }
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
    // Belt and braces: the button is disabled without the typed name, but a programmatic
    // click (or a stale render) must not slip through either.
    if (archiveTyped.trim() !== row.name.trim()) return;
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

  // §7p: a half-typed new kibbutz (name / region / parent) survives a stray backdrop tap.
  const guard = useUnsavedGuard({
    dirty: () => !editing && (name.trim() !== '' || region.trim() !== '' || parent.trim() !== ''),
    onDiscard: () => onOpenChange(false),
    onClose: () => onOpenChange(false),
  });

  const isSub = kind === 'subsite';

  return (
    <Sheet open={open} onOpenChange={guard.onOpenChange(onOpenChange)}>
      <SheetContent side="bottom" className="max-h-[88svh] overflow-y-auto rounded-t-[26px] p-4 pb-7" {...guard.contentProps}>
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
          placeholder={isSub ? 'גבים, שכונה חדשה' : 'שם כפי שיופיע על הכרטיס'}
          autoComplete="off"
        />

        {/* קוד לקוח (D2) — the internal customer number, editable at last. Optional: a brand
            new customer gets his number later, and an empty field clears a wrong one. */}
        <label className={fieldLabel} htmlFor="kibCode">קוד לקוח</label>
        <input
          id="kibCode"
          className={fieldBox}
          value={code}
          inputMode="numeric"
          onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="לדוגמה 966. אפשר להשאיר ריק"
          autoComplete="off"
        />

        {!isSub && (
          <>
            {/* An איזור is required (spec §2) — the cards are GROUPED by it, so skipping the
                field puts a customer in a bucket that exists only because of the skip. */}
            <label className={fieldLabel} htmlFor="kibRegion">
              איזור <span className="text-destructive">*</span>
            </label>
            <input id="kibRegion" className={fieldBox} value={region} list="kibRegions" required
                   onChange={e => setRegion(e.target.value)} placeholder="בחר איזור" autoComplete="off" />
            <datalist id="kibRegions">{regions.map(r => <option key={r} value={r} />)}</datalist>

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
        <ToggleGroup
          type="multiple"
          value={energy}
          onValueChange={onEnergyChange}
          disabled={!mayEditEnergy}
          className="flex flex-wrap justify-start gap-1.5"
        >
          {ENERGIES.map(e => (
            <ToggleGroupItem
              key={e}
              value={e}
              title={mayEditEnergy ? undefined : ENERGY_LOCK_TITLE}
              className={
                'min-h-[40px] rounded-full border border-border bg-card px-3 text-[13px] font-semibold text-muted-foreground ' +
                'disabled:opacity-50 data-[state=on]:border-transparent data-[state=on]:bg-foreground data-[state=on]:text-background'
              }
            >
              {ENERGY_LABEL[e]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>


        {/* קטגוריה (D2) — מדור and 🤝 שיווקי are one question ("what kind of customer is this"),
            so they sit under one heading instead of two unrelated controls. */}
        <label className={fieldLabel}>קטגוריה</label>
        <div id="kibCategory" className="rounded-xl border border-border bg-muted/50 p-2.5">
          {!isSub && (
            <ToggleGroup type="single" value={section} onValueChange={v => v && setSection(v as Section)}
                         className="grid grid-cols-2 gap-2">
              <ToggleGroupItem value="new" className="h-auto min-h-[48px] rounded-xl border border-border bg-muted font-bold data-[state=on]:border-[color:var(--brand-1)] data-[state=on]:bg-primary/10">🆕 לקוח חדש</ToggleGroupItem>
              <ToggleGroupItem value="active" className="h-auto min-h-[48px] rounded-xl border border-border bg-muted font-bold data-[state=on]:border-[color:var(--brand-1)] data-[state=on]:bg-primary/10">✅ פעיל</ToggleGroupItem>
            </ToggleGroup>
          )}
          <div className={'flex items-center gap-2' + (isSub ? '' : ' mt-2.5')}>
            <Switch id="kibMkt" checked={marketing} onCheckedChange={setMarketing} />
            <label htmlFor="kibMkt" className="text-sm font-semibold">🤝 בתהליך שיווקי</label>
          </div>
        </div>

        {/* תתי-אתרים (D2) — every row filed under this kibbutz, and a ➕ that opens this same
            sheet in sub-site mode with the parent already picked. */}
        {editing && !isSub && (
          <>
            <div className="mb-1 mt-2.5 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-muted-foreground">
                תתי-אתרים{subsites.length ? ' · ' + subsites.length : ''}
              </span>
              {!!onAddSubsite && (
                <button
                  type="button"
                  data-testid="kib-add-subsite"
                  onClick={() => onAddSubsite(row!.name)}
                  className="min-h-[36px] rounded-xl border border-border bg-muted px-3 text-[13px] font-semibold"
                >
                  ➕ תת-אתר
                </button>
              )}
            </div>
            <div id="kibSubsites" className="flex flex-col gap-1.5">
              {subsites.length
                ? subsites.map(sub => (
                    <div key={sub.name} data-subsite={sub.name}
                         className="flex min-h-[40px] items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13.5px] font-semibold">
                      <span>↳</span><bdi className="min-w-0 flex-1 truncate">{labelOf(sub)}</bdi>
                    </div>
                  ))
                : <p className="text-xs text-muted-foreground">אין תתי-אתרים. ➕ מוסיף אחד תחת הקיבוץ הזה.</p>}
            </div>
          </>
        )}

        {/* No chain any more (22.9, Package Y — עידן: "להעיף את השרשרת בדיקה מול ה-EMS").
            `ems_site_ids` is read-only here; the real error lives on the card, in the bell and
            in מצב הקיבוץ (kibbutzim.ts isUnlinked). Create mode has no row yet, so nothing to
            show — the status appears once the kibbutz is saved and reopened for edit. */}
        {editing && (
          <div
            data-testid="kib-ems-link"
            className={
              'mt-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold ' +
              (isUnlinked(row!)
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-border bg-muted text-muted-foreground')
            }
          >
            <span>אתר EMS</span>
            <span>{emsLinkedLabel(row)}</span>
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
            <div className="mt-2 rounded-xl border border-destructive/40 p-2.5">
              <div className="text-xs font-bold text-destructive">
                ארכוב מוציא את <bdi>{row!.name}</bdi> מכל המסכים. כדי לאשר, הקלד את שם הקיבוץ:
              </div>
              <input
                id="kibArchiveConfirm"
                className={fieldBox + ' mt-2'}
                value={archiveTyped}
                onChange={e => setArchiveTyped(e.target.value)}
                placeholder={row!.name}
                autoComplete="off"
              />
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => void archive()}
                        disabled={saving || archiveTyped.trim() !== row!.name.trim()}
                        className="min-h-[48px] flex-1 rounded-xl bg-destructive text-sm font-bold text-destructive-foreground disabled:opacity-40">
                  כן, ארכב את <bdi>{row!.name}</bdi>
                </button>
                <button type="button" onClick={() => { setConfirmArchive(false); setArchiveTyped(''); }}
                        className="min-h-[48px] flex-1 rounded-xl border border-border text-sm font-bold">
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setConfirmArchive(true); setArchiveTyped(''); }}
                    className="mt-2 min-h-[48px] w-full rounded-xl border border-border text-sm font-bold text-destructive">
              🗄 ארכב קיבוץ
            </button>
          )
        )}
        {guard.prompt}
      </SheetContent>
    </Sheet>
  );
}

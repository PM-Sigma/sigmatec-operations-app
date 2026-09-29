// פעולות שטח — the hub shell (spec 2026-09-29-field-ops-hub-design.md §1/§2): the page heading
// (with ← back) and a sticky jump-nav over the sections that live below it in #fieldops-view.
// Provider-free (no data) so it stays a tiny chunk; the sections are separate islands/containers.
import * as React from 'react';
import { mount } from '@/islands';
import { sigma, useCurrentUser } from '@/bridge';
import { canShowPage } from '@/lib/canShowPage';
import { useCurrentPage } from '@/lib/currentPage';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { hubSections, HUB_SECTION_ID, HUB_SECTION_LABEL, type HubSection } from '@/lib/fieldHub';

function FieldHub() {
  const { isViewer } = useCurrentUser();
  const page = useCurrentPage();
  const sections = React.useMemo(
    () => hubSections(isViewer, g => canShowPage(g)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isViewer, page],
  );
  const [active, setActive] = React.useState<HubSection>('attendance');

  // The active item follows scroll: the last section whose top has passed under the sticky nav
  // (the bottom of the page counts as the last section, so a short final section can be active).
  React.useEffect(() => {
    if (page !== 'fieldops') return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const line = (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--header-h'), 10) || 56) + 90;
      const doc = document.scrollingElement || document.documentElement;
      const atEnd = doc.scrollTop + window.innerHeight >= doc.scrollHeight - 4 && doc.scrollTop > 0;
      let cur: HubSection | null = sections[0] ?? null;
      for (const s of sections) {
        const el = document.getElementById(HUB_SECTION_ID[s]);
        if (el && el.offsetParent !== null && el.getBoundingClientRect().top <= line) cur = s;
      }
      if (atEnd) cur = sections[sections.length - 1];
      if (cur) setActive(cur);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); if (raf) cancelAnimationFrame(raf); };
  }, [sections, page]);

  if (page !== 'fieldops' || !sections.length) return null;
  const value = sections.includes(active) ? active : sections[0];
  const go = (s: HubSection) => {
    setActive(s);
    document.getElementById(HUB_SECTION_ID[s])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  return (
    <>
      <PageActionRow title="פעולות שטח" onBack={() => (window as any).pageBack?.() ?? sigma?.showPage('kibbutz')} />
      {sections.length > 1 && (
        <div
          data-testid="fieldhub-nav"
          className="sticky z-[var(--z-sticky,10)] -mx-1 mb-2 bg-background px-1 py-1.5"
          style={{ insetBlockStart: 'var(--header-h, 56px)' }}
        >
          <SegmentedControl
            ariaLabel="מעבר בין חלקי פעולות שטח"
            options={sections.map(s => ({ value: s, label: HUB_SECTION_LABEL[s] }))}
            value={value}
            onChange={go}
          />
        </div>
      )}
    </>
  );
}

export function mountFieldHub(): boolean {
  return mount('sigma-fieldhub', FieldHub);
}

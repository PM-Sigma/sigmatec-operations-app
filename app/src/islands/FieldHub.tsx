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

  // The active item follows scroll: the section whose top is the last one above the sticky nav.
  React.useEffect(() => {
    const els = sections.map(s => [s, document.getElementById(HUB_SECTION_ID[s])] as const)
      .filter((p): p is readonly [HubSection, HTMLElement] => !!p[1]);
    if (!els.length || !('IntersectionObserver' in window)) return;
    const seen = new Map<HubSection, boolean>();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const s = els.find(p => p[1] === e.target)?.[0];
        if (s) seen.set(s, e.isIntersecting);
      }
      const first = sections.find(s => seen.get(s));
      if (first) setActive(first);
    }, { rootMargin: '-120px 0px -55% 0px' });
    els.forEach(p => io.observe(p[1]));
    return () => io.disconnect();
  }, [sections]);

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

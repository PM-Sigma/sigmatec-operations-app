// /?gallery=1 — a mock-only screen showing every design-system primitive in every documented
// state (designer sign-off E2 / Opus audit item 4): "the main evidence for a foundation
// package, and it's missing." Reuses the #sigma-home mount point (main.tsx swaps Home for this
// when the query flag is set), so it gets the real header/nav chrome for free and the no-overlap
// sweep scans it exactly like any other screen — with NO allow-list entry, unlike every other
// screen in this package (foundation only, no page rewrites yet).
//
// A plain vertical Stack of SectionBlocks, one per primitive: the safest layout for "prove every
// state is overlap-free" is the one with the fewest ways to overlap in the first place.
import {
  Bell, Bug, Cog, Lightbulb, MapPin, User,
} from 'lucide-react';
import { BubbleButton } from '@/components/ui/bubble-button';
import { Tag, FilterChip } from '@/components/ui/chip';
import { DayCell } from '@/components/ui/day-cell';
import { EmptyState } from '@/components/ui/empty-state';
import { IconBubble } from '@/components/ui/icon-bubble';
import { ListRow } from '@/components/ui/list-row';
import { PageActionRow } from '@/components/ui/page-action-row';
import { SectionBlock } from '@/components/ui/section-block';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatTile, StatTileGrid } from '@/components/ui/stat-tile';
import { mount } from '@/islands';
import * as React from 'react';

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 py-2">{children}</div>;
}

function Gallery() {
  const [seg, setSeg] = React.useState<'a' | 'b' | 'c'>('a');
  const [filterOn, setFilterOn] = React.useState(false);
  const [chipSel, setChipSel] = React.useState(false);

  return (
    <div className="flex flex-col gap-4 px-[var(--page-gutter)] py-4" data-testid="gallery-root">
      <PageActionRow title="גלריית רכיבים" />
      <PageActionRow title="עם חזרה" onBack={() => {}} actions={<BubbleButton variant="icon" icon={<Cog className="h-5 w-5" />} aria-label="הגדרות" />} />

      <SectionBlock title="IconBubble">
        <div className="px-4 py-2">
          <Row>
            <IconBubble icon={<Bell className="h-5 w-5" />} label="התראות" />
            <IconBubble icon={<Bell className="h-5 w-5" />} label="התראות · 3" badge={3} />
            <IconBubble icon={<Bell className="h-5 w-5" />} label="התראות · 12" badge={12} />
            <IconBubble icon={<User className="h-5 w-5" />} label="פרופיל" badge />
            <IconBubble icon={<Cog className="h-5 w-5" />} label="פעיל" active />
            <IconBubble icon={<MapPin className="h-4 w-4" />} label="קטן" size={32} />
          </Row>
        </div>
      </SectionBlock>

      <SectionBlock title="BubbleButton">
        <div className="px-4 py-2">
          <Row>
            <BubbleButton variant="primary">ראשי</BubbleButton>
            <BubbleButton variant="tonal">משני עדין</BubbleButton>
            <BubbleButton variant="neutral">ניטרלי</BubbleButton>
            <BubbleButton variant="danger">מחיקה</BubbleButton>
            <BubbleButton variant="icon" icon={<Bug className="h-4 w-4" />} aria-label="דיווח" />
          </Row>
          <Row>
            <BubbleButton variant="primary" size="sm">קטן</BubbleButton>
            <BubbleButton variant="primary" size="md">בינוני</BubbleButton>
          </Row>
          <BubbleButton variant="primary" size="lg">מלא רוחב</BubbleButton>
        </div>
      </SectionBlock>

      <SectionBlock title="Chip / Tag">
        <div className="px-4 py-2">
          <Row>
            <Tag role="info">חדשה</Tag>
            <Tag role="danger">באיחור</Tag>
            <Tag role="warn">ללא אחראי</Tag>
            <Tag role="ok" dot>בוצע</Tag>
            <Tag role="holiday">חג</Tag>
            <Tag role="neutral">ממתין ללקוח</Tag>
          </Row>
          <Row>
            <FilterChip selected={chipSel} count={5} onClick={() => setChipSel(v => !v)}>פעילים</FilterChip>
            <FilterChip count={0} onClick={() => {}}>חדשים</FilterChip>
          </Row>
        </div>
      </SectionBlock>

      <SectionBlock title="ListRow">
        <ListRow
          leading={<span aria-hidden className="h-2 w-2 rounded-full bg-[var(--ok-ink)]" />}
          title="קיבוץ לדוגמה"
          meta="2 משימות · חדשה"
          onClick={() => {}}
        />
        <ListRow
          leading={<span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-secondary"><Bell className="h-4 w-4" /></span>}
          title="שורה ללא לחיצה"
          meta="שורה סטטית, ללא פעולה"
          trailing={null}
        />
      </SectionBlock>

      <SectionBlock title="SectionBlock מתקפל" count={3} collapsible action={{ label: 'הכול', onClick: () => {} }}>
        <ListRow title="פריט 1" onClick={() => {}} />
        <ListRow title="פריט 2" onClick={() => {}} />
      </SectionBlock>

      <SectionBlock title="SegmentedControl">
        <div className="px-4 py-2">
          <SegmentedControl
            options={[{ value: 'a', label: 'חודש' }, { value: 'b', label: 'שבוע' }, { value: 'c', label: 'רשימה' }]}
            value={seg}
            onChange={setSeg}
          />
        </div>
      </SectionBlock>

      <SectionBlock title="StatTile">
        <div className="px-4 py-2">
          <StatTileGrid>
            <StatTile value={12} label="פעילים" role="ok" />
            <StatTile value={3} label="דחופים" role="danger" selected={filterOn} onClick={() => setFilterOn(v => !v)} />
            <StatTile value={0} label="ללא אחראי" role="warn" />
            <StatTile value={7} label="חדשים" role="info" />
          </StatTileGrid>
        </div>
      </SectionBlock>

      <SectionBlock title="DayCell">
        {/* No horizontal px-4 here (unlike the other demos): SectionBlock's body already gives
            children the section's full width, and DayCell needs every spare pixel to clear its
            44px floor at 360 — the double gutter (an outer px-4 stacked on the section's own
            padding) was exactly what pushed real cells down to ~37px (Opus audit round 4).
            `-mx-[var(--page-gutter)]` bleeds past the page's OWN outer gutter too: a real month
            grid is a full-bleed block on its own page, not nested inside a card's padding — the
            364px this gallery card sits in was never the budget the 44px-floor comment (day-
            cell.tsx: "seven columns only fit 45px cells at 360") was written against, only the
            single page-gutter was. Without this the cells land at ~41px — still under. */}
        <div className="-mx-[var(--page-gutter)] py-2">
          <div className="s-day-grid">
            <DayCell day={1} label="יום א׳, 1 בספטמבר" />
            <DayCell day={2} label="יום ב׳, 2 בספטמבר · היום" today />
            <DayCell day={3} label="יום ג׳, 3 בספטמבר · נבחר" selected />
            <DayCell day={4} label="יום ד׳, 4 בספטמבר · יום שטח" fill="field" />
            <DayCell day={5} label="יום ה׳, 5 בספטמבר · משרד" fill="office" />
            <DayCell day={6} label="יום ו׳, 6 בספטמבר · חופש" fill="away" />
            <DayCell day={7} label="שבת, 7 בספטמבר · חג" fill="holiday" />
            <DayCell day={8} label="יום א׳, 8 בספטמבר · ערב חג" eve />
            <DayCell day={9} label="יום ב׳, 9 בספטמבר · לא דווחה נוכחות" missing />
            <DayCell day={10} label="יום ג׳, 10 בספטמבר · 2 אירועים" eventCount={2} />
            <DayCell day={11} label="יום ד׳, 11 בספטמבר, מחוץ לחודש" outside />
          </div>
        </div>
      </SectionBlock>

      <SectionBlock title="EmptyState">
        <div className="px-4 py-2">
          <EmptyState
            icon={<Lightbulb />}
            title="אין משימות פתוחות לקיבוץ הזה."
            hint="משימה חדשה תופיע כאן."
            action={{ label: 'משימה חדשה', onClick: () => {} }}
          />
        </div>
      </SectionBlock>
    </div>
  );
}

// Named to match Home.tsx's `mountScreen` — see its comment (main.tsx dynamically imports
// exactly one of the two modules and calls whichever loaded through one shared name).
export function mountScreen(): boolean {
  return mount('sigma-home', Gallery);
}

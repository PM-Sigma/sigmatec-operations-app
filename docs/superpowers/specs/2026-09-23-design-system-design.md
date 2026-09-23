# Design system (round 5, Phase 2)

STATUS: 🟡 OPEN, approved by עידן 23.9. Source: the independent consultant's review, below verbatim.

## עידן's rulings on the review
- Design system approved as the basis for the rewrite.
- Missing-day red: only אביאם and ניתאי. Others see green and purple only.
- Burns title: the full sentence "צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק" as the title, wrapping to two lines.
- "חזרה" buttons stay, next to Σ-home and the phone's Back.
- Week numbers in חודש מלא: a small label beside each week row, not a column (fits at 360). Hidden in חודש עבודה.
- Copy: gender-neutral button labels (שמירה, שליחה, סגירה…), no "!", and no emoji in UI text (lucide icons instead). Enforced by `test-copy-rules.mjs`.
- Tools and motion: `תוצרים/2026-09-23 — ייעוץ עיצוב/tools-and-motion.md` is binding. Phones 360–430; foldables in a later package.
- Freeze text: as shipped in 2.28 ("המערכת בשדרוג · נעדכן כשהיא חוזרת.").

---

# ייעוץ עיצוב: Sigmatec Operations, 23.9.26

Independent review for עידן (round 5, phase 2). Inputs: every page at 390 light and dark, the header crops, inventory at 1440 (it never rendered at 390), `overlap-findings.md` (462 overlaps on 158 screens), and the tokens and `components/ui/*`. The `impeccable` CLI isn't installed and I didn't download it, so I applied its checklist by hand, together with `frontend-design`. File names below leave out `__mobile__light.png`. A day sheet and a stale toast leaked into some captures (`attendance`, `hours`, `burns`, `settings`), so the sweep must reset state (§3).

---

## 1. אבחנה: why it feels like "legacy + a new layer"

1. **Two primary colors.** Legacy `--primary` is navy `#1b2a4a` and the islands are teal: see the navy tiles in `dev-board`, the navy segmented control in `burns`, and the navy tab and "ערוך" in `inventory-orders__1440`. `css/app.css` holds 144 raw hex values.
2. **Purple means four things:** legacy `--danger` (`#7c5cdb`), holidays, the "+" on משימת EMS, and the dev "בפיתוח" stage. So it tells the user nothing.
3. **The header shrinks with no policy.** The wordmark gets an 8 px width (`h1 clientWidth=8`), leaving "tec / ons" behind the bell. Both badges are `absolute`, and the alerts badge uses the physical `-left-1.5` in RTL, so "2" and "3" collide (`home-aviam--header`). The biggest thing in the header is "התקן אפליקציה".
4. **The close control is the shadcn default:** a 16 px ✕ at `absolute end-4 top-4`, no bubble, and "Close" in English for screen readers. It overlaps the title in every sheet (`settings`, `more-sheet`, `alerts-bell`, `feedback-box`) and covers "+ הוספה ליום" in `calendar-day-future`. The legacy modal adds a 36 px `.modal-x` and a "סגור" bar, so there are three ways to close.
5. **Three popup systems stack:** the legacy centered modal (`kibbutz-card-*`), the Radix sheet (`visit-summary-sheet`) and JS-built overlays, on z-index 1000 / 1160 / 1200 / 100001 / 100002.
6. **Fixed chrome doesn't reserve space.** The bottom nav, the raised "ביקור" FAB and the DEV side tab sit on content, which accounts for most overlaps in `home`, `calendar-list`, `dev-board` and `home-aviam`. The visit sheet's sticky footer covers the product tiles.
7. **Emoji are used as icons** on almost every chip (🆕 · 🔴 · ⚠️ · 📋 · ⏰), next to lucide line icons. Two icon languages share a row and the emoji look different on every OS. On the kibbutz cards this is the strongest legacy signal.
8. **Cards sit inside cards.** Kibbutz card › grey EMS panel › white task cards, plus dashed notes and dashed onboarding boxes (`home_0`). Dashed borders carry four different meanings.
9. **Form controls come from two eras.** Native `<select>` with a black focus border (`settings`, `calendar-list`, `dev-board`) and LTR date inputs "01/09/2026" (`home-viewer`) sit next to pill toggles.
10. **Red is everywhere.** In `calendar-month`, 16 of 22 workdays have a red border for עידן. Red also marks priority, overdue and stock alerts, so the real alarm gets lost.
11. **Dark mode reaches only the React parts.** The mint "דוח ביקור אחרון" card stays light (`kibbutz-card-status`), the inventory stat chips are white (`inventory-stock__1440__dark`), and the active tab almost disappears. Red `#b91c1c` on the dark card measures **2.66:1** (`home`).
12. **Brand contrast fails, and the tokens sprawl.** White on the gradient is **2.2–2.4:1** ("שלח", "התחל ישיבה"). There are 23 font sizes, 15 radii and transitions from 0.15 s to 1.7 s. `home-viewer` scrolls sideways (824 px), and the burns title runs off screen.

---

## 2. Design system

**Concept:** a calm field instrument. Neutral cool surfaces and one teal ink carry the everyday UI. The Σ gradient is the one bold element, and it's saved for the single primary action on each screen: the ביקור FAB, "שלח" in a sheet, and the active nav indicator. It is never used as decoration.

### Color roles (light / dark)
| Role | Light | Dark | Use |
|---|---|---|---|
| bg | `#F3F6F8` | `#0E1316` | page |
| surface | `#FFFFFF` | `#161C20` | SectionBlock, sheet |
| surface-2 | `#EAF0F3` | `#1C2429` | inputs, segmented track, sunken rows |
| border | `#DCE3E8` | `#2A343B` | 1 px dividers only |
| text / text-2 | `#16202A` / `#55626E` (5.8:1) | `#E6EDF2` / `#A3B1BD` (7.9:1) | |
| brand-1 / brand-2 | `#06C2CB` / `#1ABE63` | same | fills only |
| on-brand | `#062B2C` (6.9:1) | same | text on the gradient (**not white**) |
| ink (accent text, icons, focus) | `#076E70` | `#3FD6DD` | links, selected, focus ring |
| ok · field-green | ink `#166534` / fill `#DCFCE7` | `#4ADE80` / `#12301F` | done, יום שטח |
| warn | `#8A5A00` / `#FDF1D8` | `#F0B44C` / `#33270F` | ללא אחראי, low stock |
| danger · missing-red | `#B91C1C` / `#FEE2E2` | `#F87171` / `#3A1618` | overdue, missing, delete |
| info | `#1E40AF` / `#DBEAFE` | `#8FB4FF` / `#172440` | חדשה, משרד |
| holiday-purple | `#5B21B6` / `#EDE9FE` | `#C4B5FD` / `#2A1F47` | holidays and eves **only** |
| neutral | `#475569` / `#E2E8F0` | `#A3B1BD` / `#1C2429` | חופש, ממתין |

Retire the navy primary, the violet `--danger` and the blue `--accent`. Purple means holiday and nothing else. The dev-board stage colors stay, scoped to that page. Every ink/fill pair above passes 4.5:1 in both themes, and a golden test should pin that.

### Type: Assistant (400 / 600 / 700 / 800)
| Token | px / line-height | Weight | Use |
|---|---|---|---|
| caption | 12/16 | 600 | meta, week numbers (the minimum size) |
| body-sm | 14/20 | 400 | secondary lines, tags use 12/600 |
| body | 16/24 | 400 | text, inputs (16 stops zoom) |
| title-sm | 18/26 | 700 | card / row title, sheet title |
| title | 20/28 | 700 | page title in PageActionRow |
| stat | 28/32 | 800 | StatTile number |

Numbers use `tabular-nums`. Dates, counts and versions go in `<bdi>`, with one date format (`d.m`, plus `.yy` only for another year). No letter-spacing and no all caps. Remove the font picker (see §4).

### Space, radius, elevation, z
- **Spacing (4-base):** 4 · 8 · 12 · 16 · 24 · 32 · 48. Page gutter is 16 at 390 and 24 from 768 up. On desktop, content has max-width 1200, and 1440 from 2560 up.
- **Radius:** `sm 8` (tag, DayCell), `md 12` (input, ListRow, segmented), `lg 20` (SectionBlock), `sheet 24` (top corners), `pill` (BubbleButton, FilterChip). Nothing else.
- **Elevation:** `e0` is flat. `e1` (SectionBlock) is `0 1px 2px rgb(16 24 40/.06)`; dark mode uses the border only. `e2` (sheet, popover) is `0 8px 32px rgb(16 24 40/.18)`, and in dark mode the scrim does the work.
- **Z ladder (tokens only):** content 0 · sticky 10 · header 20 · nav 30 · FAB 31 · scrim 40 · sheet 50 · confirm 55 · toast 60.

### Motion
| Token | Duration | Easing | Use |
|---|---|---|---|
| fast | 120 ms | `cubic-bezier(.2,0,0,1)` | press (scale .97), color, hover |
| base | 200 ms | same | tab thumb, collapse, chip select |
| enter | 280 ms | same | sheet up, dialog in |
| exit | 200 ms | `cubic-bezier(.3,0,1,1)` | sheet down, toast out |

No bounce and no entrance animations on page load. Motion only answers a tap. With `prefers-reduced-motion: reduce`, transforms turn off, fades drop to 120 ms, and skeleton shimmer becomes a static tint.

### Density rules at 390
- The content width is 358. Tap targets are at least 44×44, using hit-slop if the visual is 32.
- **One primary (gradient) action per screen.**
- An action row holds at most 3 bubbles. A 4th goes into ⋯.
- A row's meta line holds at most 3 tags, then "+N".
- Titles clamp at 2 lines and meta lines at 2 lines. Names never truncate to fewer than 12 characters.
- No nesting beyond Section › Row.

### Components
**AppHeader** (56 px + `safe-area-top`, sticky, z 20)
- Grid: `grid-template-columns: auto 1fr auto`. From the RTL start: [Σ 40 bubble, which goes to the role's landing page] [empty flexible middle; the wordmark shows only from 768 up, with `min-width:0` and ellipsis] [cluster: 🔔 · המשימות שלי · ⚙️, each a 40 ghost-icon bubble, `gap: 8px`].
- Badge: 18 px pill, `inset-block-start:-4px; inset-inline-end:-4px`, anchored to **its own** bubble, capped at "9+". An overhang of 4 px plus an 8 px gap means two badges can't touch.
- "התקן אפליקציה", "רעיון / באג", the name chip and "צפייה" all leave the header. The gear sheet holds identity, role, install and feedback.
- The viewer gets the same four slots.

**PageActionRow** (48 px, scrolls with the page)
- [optional back chevron bubble, 2nd-level pages only, mirrored] [title 20/700, `min-width:0`, 1 line with ellipsis] [0–2 bubbles, then ⋯].
- It never wraps. Page-level controls (month switcher, view segmented control) go in the row below it.

**SectionBlock**
- Full width between the gutters, surface, `lg` radius, e1, padding 16.
- Title row: a 16/700 title in the role's ink (default ink teal, danger for "חסר לך", holiday for holidays), an optional count Tag and an optional trailing "הכול ›" link.
- Children are ListRows with dividers, not cards.
- The collapsible variant has a chevron at the inline-end, animated at base.

**BubbleButton**
- Sizes: sm 32 (hit area 44), md 40, lg 48 (full width in sheet footers).
- Variants: `primary` (gradient + on-brand ink), `tonal` (ink at 10% + ink), `neutral` (surface-2), `danger` (danger fill + ink), `icon` (40 circle).
- States: rest · hover (desktop, +4% overlay) · pressed (.97) · focus-visible (2 px ink ring, offset 2) · disabled (40% opacity, no pointer) · loading (spinner in the icon slot, width locked).
- RTL: the icon sits at inline-start and directional icons mirror. The label is 1 line, never wraps, and ellipsizes.

**Chip / Tag** (two components, never mixed)
- *Tag* is status and isn't tappable: 24 px, `sm` radius, 12/600, role fill + ink, and an optional 6 px dot instead of an emoji. The vocabulary is fixed: חדשה = info, דחופה / באיחור = danger, ללא אחראי = warn, בטיפול = info, ממתין ללקוח = neutral.
- *FilterChip* is tappable: a 32 px pill with the count inside ("פעילים 5"). When selected it gets an ink fill, surface text and a ✓.

**ListRow** (min 56 px, padding 12/16)
- [leading: status dot, 32 avatar, or icon] [body: 16/600 title (2-line clamp) plus a 14 text-2 meta line (tags · date · person)] [trailing: a chevron or one icon bubble].
- The whole row opens its sheet. Secondary actions (שבץ, סיים) go into ⋯ or into the sheet. In triage lists only, up to 2 sm bubbles can sit under the meta line.
- The divider is inset 16 from the start.

**Sheet** (the only popup)
- Phone: bottom sheet, max-height `92dvh`, top radius 24, 32×4 grab handle.
- Header (sticky inside the sheet, min 56): grid `1fr auto` holding [title 18/700 (2-line clamp) plus an optional subtitle] [✕ as a 40 icon bubble **in the grid column**, never absolute, labelled "סגירה"].
- Body scrolls, with padding-bottom = `--sheet-footer-h + 16 + safe-area`.
- Footer (sticky): up to 2 lg bubbles, primary at the start (right).
- From 768 up it's a centered dialog, max-width 560, `lg` radius.
- It closes by ✕, scrim tap, Esc or back. A dirty form gets the draft prompt.
- At most 1 sheet plus 1 confirm. Opening a sheet from a sheet pushes it, and the header gets a back chevron. There are no stacked scrims.
- When the keyboard is up, the footer collapses to one line (use `visualViewport`).

**Tabs / SegmentedControl**
- *Segmented* is for 2–4 views of the same data (חודש/שבוע/רשימה, מצב הקיבוץ/ביקורים): 40 px surface-2 track, `md` radius. The selected thumb is surface + e1, and it slides at base.
- *Tabs* are for more than 4 items (inventory's 6): a scrollable row with a 3 px gradient underline and an edge fade. The selected tab scrolls into view, and the scroll starts at the right.

**StatTile**
- 2 per row at 390, 4 from 768 up. Stat number, 14 text-2 label, optional role dot. The colored side borders are retired.
- A tile that filters has `aria-pressed`. Selected = a 2 px ring and a fill tint in its role color, and a second tap clears it.
- A tile that doesn't filter is plain: no pointer and no hover.

**DayCell** (square, min 44, `sm` radius, number 14/600 at the top-start)
| State | Treatment |
|---|---|
| today | 2 px ink ring |
| selected | ink fill, surface text |
| holiday / eve | holiday fill + ink. An eve is a holiday ink dot plus a label in the legend |
| filed field / office / away | field-green / info / neutral fill |
| missing | past workdays only, for people who must file: 6 px danger dot + danger ink number. **No red border** |
| outside month | 40% opacity |

Events show as dots with a count at 390 ("•2") and as labelled Tags from 768 up. Labels truncated to "אספ..." help nobody. The legend always shows, and the week-number column is 20 px caption text-2.

**EmptyState:** a 32 text-2 icon, a 16/600 line saying what's missing, one 14 line on how it gets filled, and at most one bubble. Examples: "עוד לא נשלחו התראות." / "אין משימות פתוחות לקיבוץ הזה." + "משימה חדשה".

**Toast**
- Bottom, above the nav (`bottom: nav-h + 12 + safe-area`), max-width 358, `md` radius, inverse surface, 14/600.
- Optional "ביטול" action: 5 s with undo, 4 s without. One toast at a time, the rest queue. `role=status`. Never over the header.
- It uses the verb of the action: "הסיכום נשמר", "נפתח וואטסאפ".

---

## 3. Rules that prevent overlap

1. **Four layout primitives:** `Stack` (vertical, gap), `Row` (a `wrap: none | wrap` prop is required), `Cluster` (wrapping chips) and `Grid`. Every child of a Row gets `min-width:0`. Text comes from `<Text lines={1|2}>`, which applies ellipsis or clamp. Bare text in a flex row fails lint.
2. **`position:absolute` is allowed in 3 places only:** a badge on its own bubble, the grab handle, and a focus ring. The lint (`test-no-absolute`) greps `absolute|position:\s*absolute` outside that allow-list.
3. **Fixed chrome registers its height.** The header, nav, FAB and sheet footer publish `--header-h`, `--nav-h`, `--fab-h` and `--sheet-footer-h`. The scroll container pads by them. The DEV tab goes into ⋯ עוד, and it doesn't ship floating.
4. **The wrap policy is set by element type:**
   - titles clamp at 2 lines;
   - chips wrap (Cluster);
   - action rows never wrap, and overflow goes to ⋯;
   - numbers and dates never break;
   - inputs are `width:100%`.
5. **Logical properties only** (`inset-inline-*`, `margin-inline-*`). Physical `left`/`right` fails lint unless it's marked `rtl-ok`.
6. **Only tokens.** Raw hex, px radii, z-index values and durations fail lint outside `tokens.css`. The legacy CSS reads the same tokens until it's deleted.
7. **The page never scrolls sideways**, and the sweep asserts it.

**Changes to the sweep** (`no-overlap.spec.ts`):
- Assert `scrollingElement.scrollWidth <= innerWidth` on every screen. That catches `home-viewer`.
- Ignore `.sr-only`. The "Close" and the `h2 clientWidth=1` hits are that kind of noise.
- For fixed chrome, don't compare pairwise. Scroll to the bottom and assert that the last content box ends above `innerHeight − nav-h`. Also assert that no interactive element sits under the FAB at any scroll stop.
- Allow `scrollWidth > clientWidth` only on elements marked `data-truncate`, which `<Text>` sets.
- Fail when any interactive hit area is under 44×44.
- Reset state between screens: close sheets, clear toasts. A click that can't find a stable element is a test failure, not a skipped capture (inventory at 390 failed this way).
- Add 360 px and Android font scale 1.15 to the phone runs. Run axe contrast in both themes on every capture.

---

## 4. Review of the fix list

**Unnecessary**
- **The per-person font setting** (Assistant/Rubik/Noto/Heebo) quadruples the QA surface and works against "one uniform design". Lock Assistant and remove the setting.
- **Running 2560 and 3840 on every build.** Only עידן uses desktop. Keep 390 / 1440 / 1920 per build and run 2560 / 3840 nightly.
- **"Every button is a bubble" applied literally to rows and day cells.** Rows and cells are tappable *surfaces*. Making them bubbles puts bubbles inside bubbles and brings the nesting back.

**Conflicts to resolve**
- **The freeze copy.** Phase 0 says "המערכת בשדרוג · נחזור בקרוב", and the grill ruled "המערכת בשדרוג. נעדכן כשהיא חוזרת." Use the grill ruling.
- **The burns title.** "צריבות: מוני ייצור E360 לטובת ניתוק גנרטורים מרחוק" won't fit a 390 PageActionRow. Make the title "צריבות מונים" and put the full line as the subtitle in the first SectionBlock.
- **Holiday purple vs. the existing purples.** It only works if the violet `--danger`, the purple "+" icons and the purple chips all go. Only the dev stage colors stay, and only on that page.
- **Missing red for עידן.** He isn't a daily filer, yet his calendar is almost all red. Show missing only for roles that must file (אביאם, ניתאי), and only for past workdays.
- **Σ = home vs. "→ חזרה".** Burns, the push log and dev each have their own back button. Keep one back chevron in PageActionRow on 2nd-level pages. Android back works everywhere.
- **"Viewer same as today".** The viewer header today has "רעיון / באג" and "צפייה", which breaks the one-header ruling. The viewer gets the same 4 slots.

**Missing (what the team will hit)**
1. **Offline in the field.** A slim banner, "אין חיבור. השינויים יישמרו במכשיר.", and a queued visit save ("נשמר במכשיר, יישלח כשתחזור הקליטה"). Actions that need the network are disabled with a reason.
2. **Loading.** A skeleton per SectionBlock, no full-page spinner. The grey bars in `kibbutz-card-visits` (dark) look broken.
3. **Errors.** An inline error per SectionBlock: "לא הצלחנו לטעון משימות EMS." + "נסה שוב". Today a failure shows an empty list, which reads as "no tasks".
4. **One-hand reach.** Primary actions stay in the bottom third. The 4 selects at the top of calendar-list move into a "סינון" sheet.
5. **The keyboard.** In the visit summary, the keyboard plus the footer leaves about 200 px for text, so collapse the footer while typing.
6. **Contrast.** Every danger, warn and ok text needs its dark ink (red on dark is 2.66:1 today), and white on the gradient fails, so it moves to the on-brand ink.
7. **Safe areas.** Pad the nav and toasts with `env(safe-area-inset-bottom)` for S24 gesture navigation.
8. **Bidi.** Wrap numbers, dates and versions in `<bdi>`. `visit-summary-sheet` shows "2.29·2026-09-23 גרסה".
9. **One confirm pattern.** Delete-item (with its list of what goes) and close-EMS (5 s undo) use one ConfirmSheet plus the undo Toast.
10. **Freshness on the phone.** Desktop shows "עודכן 17:22" and the phone shows nothing. Put it in the bell sheet and add pull-to-refresh on home.
11. **An icon policy.** Lucide in chrome, tags and buttons. Emoji only in text people write. Without the rule, every rewritten page brings emoji back.
12. **Hebrew labels.** "Close" becomes "סגירה", and every icon bubble gets a Hebrew `aria-label`.

---

## 5. Priority order for the rewrite (by visual impact)

| # | Step | Why this order |
|---|---|---|
| 1 | Tokens, dark inks, on-brand ink; retire navy and violet-danger | One change reaches every screen and ends the "two apps" look |
| 2 | AppHeader, PageActionRow, reserved space for nav / FAB / DEV | Every screen; most overlap findings |
| 3 | Sheet, Toast, ConfirmSheet | Every popup; ends the ✕ overlaps and the z-index war |
| 4 | Kibbutz card + KibbutzDetail | The landing screen; worst nesting and emoji |
| 5 | Visit summary sheet | The field team's main flow |
| 6 | Calendar + attendance | Ends the red flood |
| 7 | Inventory | Oldest-looking, used less often |
| 8 | Settings, burns, push log, feedback | Composition of finished parts |
| 9 | Team + dev meeting | Two presenters only |
| 10 | Desktop 1920–3840 | Same parts, nightly sweep |

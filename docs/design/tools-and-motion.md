# כלים, תנועה וגימור: Sigmatec Operations

This is the designer's spec, second engagement, 23.9.26. It builds on `design-review.md` (tokens, components, overlap rules). Every rule here holds from **360 to 430 CSS px**:
- 360×780 (S24, the smallest target)
- 390/393 (iPhone 15, Pixel)
- 412×915 (S24 Ultra)
- 430 (Pro Max)

Foldables come in their own package later. §2.0 says where the layout leaves room for them.

## 1. Tools: one pick per purpose

Measured on `SigmatecOps-r9-P1` (the live code):
- **Boot bundle:** `ui/sigma.js` is 310,122 bytes, which leaves **150 bytes** under the 303 kB ceiling. So the boot chunk can't take a new dependency, and even a small addition to shell code has to be paid for in the same PR.
- **motion:** already lives only in lazy chunks (Field, Calendar, Attendance, KibbutzCard).
- **recharts:** only in `sigma-Usage.js` (400 kB, lazy).

| Purpose | Options considered | Run / checked | **Pick** and why |
|---|---|---|---|
| Tokens / theming | CSS custom properties + Tailwind `theme.extend` (installed); Style Dictionary; Radix Colors; Open Props | Read `styles.css` and `app.css`. Today's tokens are scoped to `.sigma-root` because legacy and shadcn names collide (`--primary`, `--card`). | **One `tokens.css` on `:root` with an `--s-` prefix, mapped into Tailwind.** It adds zero runtime bytes, and legacy CSS reads the same variables until it's deleted. The prefix ends the collision. Style Dictionary would add a build step for a single platform. |
| Components | shadcn / Radix (installed: dialog, tabs, toggle-group, switch, select, collapsible); Vaul; Base UI; Headless UI | Read `ui/sheet.tsx` and `dialog.tsx` | **Radix via shadcn files we own.** They're already in the bundle and accessible. Vaul would break the 150-byte headroom. The sheet's drag-to-dismiss is a small pointer handler inside our Sheet (§2.8), paid for by the Ctrl+K removal in package X. |
| Icons (replacing emoji) | lucide-react (installed, one chunk per icon, about 0.3–0.5 kB each); Phosphor; Tabler; Material Symbols (font) | The lucide chunks already exist (`sigma-check.js`, `sigma-plus.js`…) | **lucide-react, 1.75 px stroke, 20 px in rows and 24 px in the nav.** It's installed and tree-shaken, and its stroke weight matches Assistant 600. Map: 📋→`ClipboardList`, 🔒→`Lock`, 📍→`MapPin`, ⚡→`Zap`, 💧→`Droplet`, 🔥 gas→`Flame`, צריבות→`Cpu`, 🤝→`Handshake`, ✏️→`Pencil`, 🚚→`Truck`, 📗→`FileSpreadsheet`, PDF→`FileText`, ⏰→`Clock`, 📅→`CalendarDays`, 👤→`User`, ⚠️ ללא אחראי→`UserX`, 📣→`Megaphone`, 💡→`Lightbulb`, 🐞→`Bug`. 🆕 and 🔴 become a Tag with a dot, with no icon. |
| Motion | CSS transitions + `tailwindcss-animate` (installed, in boot); `motion` (installed, lazy); View Transitions API (built in, 0 kB); react-spring; GSAP | Grepped every `motion/react` call. There are 4 hard-coded durations (0.16 / 0.18 / 0.22 / 20). | **CSS driven by the `--s-motion-*` tokens is the default**, including the whole shell. **`motion/react`** is used only where CSS can't do the job (exit presence, `layout` reorder, drag), and it reads the same values from `lib/motion.ts`. Page change uses `document.startViewTransition` when it's available (Chrome and Samsung Internet on Android have it) and cuts instantly otherwise. No new dependency. |
| Charts / data-viz | Hand-built SVG/CSS (0 kB); recharts (installed, lazy); uPlot; visx; Chart.js | **Ran the `dataviz` validator** on the dev-board stage palette. Light **FAILED**: two slates below the chroma floor, and slate↔cyan ΔE 9.8, under the normal-vision floor of 15. Dark **FAILED** 3 of 5 checks. | **Plain SVG/CSS parts** (ProgressBar, StackedBar, MiniBars) for everything on the phone, following the dataviz mark specs: 2 px surface gaps, direct labels, a legend for 2+ series, text in text tokens. Recharts stays only in Usage, which is desktop and עידן only. Stage palette fix: merge the two grey stages into one neutral plus texture, re-run the validator in both themes, and keep the in-segment counts. |
| Copy (Hebrew UI) | humanizer (local); `no-ai-slop`; the existing `test-copy-rules.mjs` | Read humanizer §1–25 and the copy-rules test | **humanizer is the rulebook; `test-copy-rules.mjs` is the gate.** Add these mechanical checks: <br>• no `!` in system copy ("נפתח וואטסאפ!" and "ללא סיכום ביקור!" exist today); <br>• no em dash; no emoji in strings; <br>• no "לא X אלא Y"; <br>• buttons in noun form (שמירה, שליחה, סגירה, ביטול), which is gender-neutral, instead of masculine imperatives (שמור, שלח, סגור); <br>• geresh and gershayim (סה״כ, יום ג׳), never `'` or `"`; <br>• aria-labels in Hebrew ("Close" → "סגירה"). |
| Accessibility / contrast | axe-core 4.13 (already in `node_modules`); the existing `contrast.spec.ts`; Lighthouse CI (installed); pa11y | **Ran axe** at 360×780, DPR 3, light and dark, on the mock boot: 0 critical/serious, and 3 moderate issues (`heading-order`, `landmark-one-main`, `region` ×8). With no data routes, the home was **blank, with no empty state**. At 360 the header chip, tasks button and bell **overlap** (the wordmark shows through). | **axe-core injected into the Playwright sweep with `addScriptTag`**, on every screen and in both themes. No new dependency, and it adds landmark, name and role checks that the contrast spec lacks. Lighthouse CI stays for performance only. |
| Anti-pattern detection | impeccable `detect` (local); jscpd (installed, duplicates); custom grep lints | **Ran `detect`** on `index.html css app/src`: 132 findings. <br>• 64 low-contrast, of which 20 are dark-mode hovers at **1.0:1** (`#e6edf3` on `#e5e7eb`) and 3 are navy `#1b2a4a` text on dark at **1.2:1**; <br>• 41 side-tab borders; <br>• 10 dark-glow; <br>• 11 text under 11 px; <br>• 2 violet-palette; 1 `transition: width`; 1 shimmer marquee. <br>URL scan at 390×844: 30 findings, including **white on `#06C2CB` at 2.2:1**. | **impeccable `detect`**: the file scan on changed paths plus a URL scan at `--viewport 360x780` and `412x915`. Add `.impeccable/config.json` with `ignoreFiles: ["css/app.min.css"]` (it doubles every finding). For judgment, use `critique` (two isolated sub-agents, a Nielsen 0–4 score) at package end and `polish` before shipping. |
| Visual regression | Playwright `toHaveScreenshot` (installed); Lost Pixel; Argos; Chromatic | The capture script and `shots/` exist | **Playwright `toHaveScreenshot`**, with goldens at 360 and 412, light and dark, in mock mode. Dates and the timer are masked, and `maxDiffPixelRatio: 0.002`. A PNG becomes a golden only after my PASS. Hosted services add accounts and cost. |

## 2. Motion spec

### 2.0 Fluid layout (360–430) and room for foldables
- **Type is in `rem`** so Android's font-size setting scales it.
  - Body 1rem, body-sm 0.875rem and caption 0.75rem are **fixed**. They never scale with the viewport.
  - Only display roles are fluid, with `S = (100vw - 360px) / 70`, clamped between 0 and 1:
    - page title `clamp(1.25rem, 1.25rem + S*0.125rem, 1.375rem)` (20→22 px)
    - stat `clamp(1.75rem, 1.75rem + S*0.25rem, 2rem)` (28→32 px)
    - sheet title `clamp(1.125rem, 1.125rem + S*0.0625rem, 1.1875rem)` (18→19 px)
- **Space:**
  - gutter `--s-gutter: clamp(16px, calc(16px + (100vw - 360px) * 0.0571), 20px)`
  - section gap `clamp(12px, …, 16px)`
  - every other spacing token is fixed
  - content width = `100vw - 2*gutter` (328 at 360, 390 at 430)
- **Component layout reacts to its container, not the viewport.**
  - Page, SectionBlock and Sheet set `container-type: inline-size`.
  - StatTile goes 2 per row under 480 px, 3 at 480+, 4 at 640+.
  - DayCell shows labels at 560+. Below that it shows dots.
  - Only the shell reads the viewport: the bottom nav below 600, the rail at 600+ (the Fold package).
  - Nothing may assume a phone can't be wider than 430.
- **The 360 checks:**
  - Header: 40 + 3×40 + 3×8 + 2×16 = 216 px, which fits.
  - Month grid: (328 − 6×2) / 7 = 45 px cells. The week-number column needs a 380 px container, so at 360 it moves into the row gutter as a caption. **This conflicts with the ruling "week numbers shown in חודש מלא", and עידן has to choose.**
- **Foldables:** run the sweep at **344** (Fold cover) as a warning only. Content must compress without overflowing, but it isn't designed yet.

### 2.1 Tokens (the only values allowed)
| Token | Value | Use |
|---|---|---|
| `--s-motion-press` | 90 ms | press-in |
| `--s-motion-fast` | 140 ms | color, opacity, press-out, crossfade, exits of small things |
| `--s-motion-base` | 200 ms | tab indicator, segmented thumb, collapse and expand, list items |
| `--s-motion-enter` | 280 ms | sheet and page arrival |
| `--s-motion-exit` | 180 ms | sheet and page leaving |
| `--s-stagger` | 30 ms per item, **max 6 items** (180 ms total) | first render of a list |
| `--s-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | anything arriving |
| `--s-ease-in` | `cubic-bezier(0.4, 0, 1, 1)` | anything leaving |
| `--s-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | in-place change |
| `--s-shift-sm` / `--s-shift-md` | 6 px / 16 px | list entrance / page drill-in |
| `SPRING_SETTLE` (`lib/motion.ts`) | `{ type: 'spring', stiffness: 500, damping: 45 }` | drag release only. It doesn't overshoot. |

Distances are fixed px and never `vw`, so motion feels the same at 360 and at 430.

### 2.2 The moments
1. **Page change, between nav peers:** fade-through. The old page fades out at `fast` with `ease-in`, and the new one fades in at `base` with `ease-out`. No slide, because peers have no direction.
2. **Page change, drill-in to a 2nd-level page:** the new page arrives from the inline-end (from the left in RTL): `translateX(-shift-md)`→0 plus opacity, at `enter`. Back reverses it at `exit`.
3. **Sheet (phone):** `translateY(100%)`→0 at `enter` with `ease-out`, and out at `exit` with `ease-in`. The scrim fades from 0 to **0.48** (today it's `bg-black/80`). Content inside doesn't animate on its own.
4. **Dialog (600 px and up):** opacity plus `scale(0.97)`→1 at `base`, and out at `fast`.
5. **List / card entrance:** only on a list's **first data render** (after the skeleton): opacity 0→1 plus `translateY(shift-sm)`, at `base`, staggered.
   - Never on refetch, filter change, returning to a page, or scroll.
   - A filter change uses `motion` `layout` at `base` for reordering, and removed rows fade out at `fast`.
6. **Tab / segmented switch:** the indicator or thumb slides with `transform` at `base` and `ease-standard`. The content panels crossfade at `fast` without sliding, so the text never moves under the eye.
7. **Toast (sonner):**
   - It rises 12 px with opacity at `base` and `ease-out`, and exits with opacity at `fast`.
   - Duration is 4 s, or 5 s with "ביטול".
   - Position: bottom center, offset `nav-h + 12px + safe-area`. One at a time.
8. **Button press:** `scale(0.97)` at `press`, release at `fast`. No hover lift and no shadow change. While loading, the spinner fades in at `fast` and the width stays locked.
9. **Skeleton → content:**
   - A skeleton appears only if data takes **more than 300 ms**, and then stays for at least 400 ms, so it never flashes.
   - The skeleton is a static tint with an opacity pulse of 0.6↔1 (1.2 s, `ease-in-out`). The shimmer marquee is removed; impeccable flagged it.
   - It swaps to content with a crossfade at `fast`. The skeleton has the real row geometry, so there's zero layout shift.
10. **Drag and swipe (phone):**
    - *Sheet dismiss:* drag starts only from the grab handle or the header. The body always scrolls. The sheet follows the finger 1:1. It dismisses past 30% of its height or 0.5 px/ms, and otherwise snaps back with `SPRING_SETTLE`. Set `overscroll-behavior: contain` on the body.
    - *Pull to refresh (exists):* 64 px threshold, 0.5 resistance, and the spinner's rotation follows the pull.
    - *Calendar month:* a horizontal swipe with a 25% width threshold. Swiping toward the left goes to the next month (RTL reading order).
    - *Reorder:* long-press 300 ms to lift (`scale(1.02)` plus e2), and neighbours shift at `base`.
    - *No swipe actions on rows.* Hidden gestures can't be discovered.
11. **Collapse / expand:** `grid-template-rows: 0fr→1fr` at `base` with `ease-standard`. The chevron rotates on the same timing.

### 2.3 What never animates
- Numbers: no count-up.
- Page load: no choreography.
- The header and the nav bar. Only the nav indicator moves.
- Badges: no pulse or bounce.
- Any property that drives layout (`width`, `height`, `top`, `left`, margins). impeccable flagged `transition: width`.
- Data polling and refetch.
- Scroll position, except `scrollIntoView` for the selected tab.
- Gradients, glows, and anything looping while offscreen.

### 2.4 prefers-reduced-motion (Android's "Remove animations" maps to it)
- One `@media (prefers-reduced-motion: reduce)` block sets `--s-shift-*` to 0 and `--s-stagger` to 0 ms, and turns the skeleton pulse off.
- `useReducedMotion()` in `lib/motion.ts` returns the same values for the `motion` components.
- Opacity and color changes stay at `fast`, so feedback stays legible.
- Drag still tracks the finger, but the release is an instant cut.
- Sheets and pages appear by opacity only.

## 3. Prestige: what makes it feel finished on every phone
1. **Typography rhythm.**
   - Self-host Assistant as a **variable woff2 subset** (Hebrew + Latin + digits) with `font-display: swap` and a `size-adjust` fallback, so the swap doesn't reflow.
   - Weights 400/600/700 only, plus 800 for stats.
   - Line heights on a 4 px grid.
   - Space above a section title is twice the space below it.
   - Correct ״ and ׳ everywhere.
   - Noun-form buttons.
2. **Numbers and dates from one formatter** (`lib/format.ts`):
   - `Intl.NumberFormat('he-IL')`, units after a no-break space ("37 יח׳"), durations as "4 ש׳ 30 ד׳", 24-hour times.
   - Dates: "היום", "אתמול" or "יום ה׳" within 6 days, otherwise `d.m`, plus `.yy` only for another year.
   - All of it goes in `<bdi>` with `tabular-nums`, so columns line up and "0/9" never flips.
3. **Empty states written for the situation.**
   - A lucide icon at 32 px in text-2, one line saying what's missing, one line on how it fills, and at most one bubble.
   - "אין משימות פתוחות לקיבוץ הזה." + "משימה חדשה". "עוד לא נשלחו התראות."
   - Never a blank screen. My axe run found one.
4. **Tactile confirmation.**
   - `navigator.vibrate(10)` on three commits only: שליחה of a visit summary, closing a task, and a drag crossing its dismiss threshold. It's a no-op where unsupported.
   - Closing a task draws its check (`stroke-dashoffset`, `base`), keeps the row during the 5 s undo, then collapses it at `base`.
5. **Dark mode designed as its own theme, not inverted.**
   - Tonal surfaces (`#0E1316` → `#161C20` → `#1C2429`) with no shadows, and text at `#E6EDF2`, never pure white.
   - `meta theme-color` switches per theme, so the Android status bar matches the app.
   - `color-scheme: light dark` so native controls follow.
   - `::selection` and `caret-color` use the ink teal.
6. **First load.**
   - The inline critical CSS paints the header, nav and a home skeleton in their **final** geometry.
   - Returning users get the persisted TanStack cache at once, with a quiet sync hairline, so they never see a skeleton.
   - The manifest `background_color` equals `bg` for each theme, so the splash matches. No spinner screen.
7. **Device edges and browser surfaces.**
   - `viewport-fit=cover`, with safe-area insets on the header, nav, sheet footer and toast.
   - `-webkit-tap-highlight-color: transparent`, with our own pressed state instead.
   - Keyboard-aware sheets through `visualViewport`.
   - 48 px targets with 8 px gaps at every width from 360 to 430. DayCell is the one exception, at 44–45 px.
   - Focus ring: 2 px ink with a 2 px offset.

## 4. Sign-off protocol

**The builder sends, per package:**
1. PNGs at **360×780 and 412×915, light and dark**, for every screen and state the package touches: default, loading, empty, error, offline where relevant, one open sheet, and the longest real content. Captured in mock mode by the capture script and named `<screen>__<width>__<theme>.png`.
2. `impeccable detect --json` on the changed files, plus URL scans at `360x780` and `412x915`.
3. The no-overlap sweep (360 / 390 / 412 / 430, plus 344 as a warning), axe results, `test-copy-rules`, and the boot size in bytes.
4. For packages that add motion: a Playwright video at 360 of the main flow, one normal run and one with reduced motion emulated.
5. The list of tokens and components used, and any token it asks for. It never invents one.

**I return** either **PASS** or a numbered fix list. Each fix names the file, the rule it breaks (a section of this doc or `design-review.md`) and the expected result, with a severity:
- **P0:** broken, hidden or unreadable.
- **P1:** off-system; blocks PASS.
- **P2:** logged to the backlog; doesn't block.

**PASS means every item holds:**
- 0 primary impeccable findings in the changed files. An ignore needs a written reason, and I approve it.
- The sweep is green at every phone width in both themes: no horizontal scroll, and no overlap or clipping outside `data-truncate`.
- axe has 0 serious or critical issues. Text is ≥ 4.5:1 and UI parts ≥ 3:1 in both themes.
- Lint is green: only tokens, `absolute` only in the allow-list, logical properties, no emoji in chrome.
- Every required state exists and uses the shared EmptyState, skeleton and error parts.
- Copy passes the copy gate and a humanizer read.
- Motion uses only §2 tokens, and the reduced-motion video shows no spatial movement.
- The boot chunk stays within 303 kB.
- My read of the PNGs finds no P0/P1: one primary action per screen, edges aligned to the gutter, a clear hierarchy, and consistency with packages that already passed.

At most one fix round plus one confirm round. If the confirm round still fails, I bring עידן two options, not a third round. A PASSed PNG becomes the `toHaveScreenshot` golden.

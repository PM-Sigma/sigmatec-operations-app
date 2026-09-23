import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

// Styling isolation (spec §7c): no preflight (the legacy css/app.css owns the page), and every
// utility is scoped by `important: '.sigma-root'` so island styles never leak into legacy markup
// and legacy cascade never wins inside an island.
export default {
  darkMode: ['class'],
  important: '.sigma-root',
  // Designer sign-off P1-2: Tailwind v3's `hover:` applies after a tap on Android and sticks
  // until the next tap (no real :hover event to clear it) — `hoverOnlyWhenSupported` scopes
  // every `hover:` utility to `@media (hover: hover)`, so a touch device never gets a stuck
  // hover state.
  future: { hoverOnlyWhenSupported: true },
  // `container` is a COMPONENT class, not a utility, so Tailwind emits it WITHOUT the
  // `important: '.sigma-root'` prefix — i.e. unscoped, into the legacy page. The legacy shell's
  // own `<div class="container">` (index.html) then picked up Tailwind's `max-width: 1280px`
  // and capped the whole kibbutz home at 1280 px on a 1440 screen, against spec §6's full-width
  // desktop (audit B · F-12). Nothing in app/src uses `container`; turning it off is the fix.
  corePlugins: { preflight: false, container: false },
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Assistant', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        brand: { 1: 'var(--brand-1)', 2: 'var(--brand-2)' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // The round-5 design-system roles (app/src/tokens.css --s-*), mapped into Tailwind
        // (עידן 23.9: "one tokens.css… mapped into Tailwind"). Additive only — every existing
        // `bg-[var(--ok-fill)]`-style arbitrary-value class still works via the --ok-fill alias;
        // this just gives new code a named utility (`bg-s-ok-fill`, `text-s-ok-ink`) instead.
        's-ok': { ink: 'var(--s-ok-ink)', fill: 'var(--s-ok-fill)' },
        's-warn': { ink: 'var(--s-warn-ink)', fill: 'var(--s-warn-fill)' },
        's-danger': { ink: 'var(--s-danger-ink)', fill: 'var(--s-danger-fill)' },
        's-info': { ink: 'var(--s-info-ink)', fill: 'var(--s-info-fill)' },
        's-holiday': { ink: 'var(--s-holiday-ink)', fill: 'var(--s-holiday-fill)' },
        's-neutral': { ink: 'var(--s-neutral-ink)', fill: 'var(--s-neutral-fill)' },
        's-ink': 'var(--s-ink)', 's-on-brand': 'var(--s-on-brand)',
        's-bg': 'var(--s-bg)', 's-surface': 'var(--s-surface)', 's-surface-2': 'var(--s-surface-2)',
        's-border': 'var(--s-border)', 's-text': 'var(--s-text)', 's-text-2': 'var(--s-text-2)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        's-sm': 'var(--s-radius-sm)', 's-md': 'var(--s-radius-md)', 's-lg': 'var(--s-radius-lg)',
        's-sheet': 'var(--s-radius-sheet)', 's-pill': 'var(--s-radius-pill)',
      },
      spacing: {
        's-4': 'var(--s-space-4)', 's-8': 'var(--s-space-8)', 's-12': 'var(--s-space-12)',
        's-16': 'var(--s-space-16)', 's-24': 'var(--s-space-24)', 's-32': 'var(--s-space-32)', 's-48': 'var(--s-space-48)',
        's-gutter': 'var(--s-gutter)',
      },
      backgroundImage: {
        'brand-grad': 'linear-gradient(135deg, var(--brand-1), var(--brand-2))',
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
        'collapsible-down': { from: { height: '0' }, to: { height: 'var(--radix-collapsible-content-height)' } },
        'collapsible-up': { from: { height: 'var(--radix-collapsible-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'collapsible-down': 'collapsible-down 0.2s ease-out',
        'collapsible-up': 'collapsible-up 0.2s ease-out',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    // Designer sign-off P1-1 / P1-3: two hand-written utilities, added as REAL Tailwind
    // utilities (not plain CSS classes in styles.css) so they stack with variants exactly like
    // any built-in (`data-[state=on]:s-brand`, `hover:s-hit` if a caller ever needs it).
    plugin(({ addUtilities }) => {
      addUtilities({
        // The brand gradient fill ALWAYS pairs with the on-brand ink, never white (audit
        // §1.12). One utility instead of `bg-brand-grad text-white` at every call site, so the
        // pairing can't drift apart again — test-design-tokens.mjs gates the old pair at 0.
        '.s-brand': { backgroundImage: 'var(--s-brand-grad)', color: 'var(--s-on-brand)' },
        // Expands the TAP target to 48×48 without growing the visual box (design-review.md:
        // "at least 48×48, using hit-slop if the visual is 32"). A transparent ::before
        // centred on the element, sized to the larger of 100%/48px on each axis.
        '.s-hit': { position: 'relative' },
        '.s-hit::before': {
          content: '""', position: 'absolute',
          top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 'max(100%, 48px)', height: 'max(100%, 48px)',
        },
      });
    }),
  ],
} satisfies Config;

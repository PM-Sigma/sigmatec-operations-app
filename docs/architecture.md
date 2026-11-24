# Architecture


A no-framework, installable **PWA** (classic scripts in one shared global scope, plus React
islands under `app/`) on **Supabase** only: application data in Postgres (RLS), server logic in
Edge Functions, live operational data from the **EMS API** (called directly with the user's EMS
token). Google Apps Script is retired (29.9.26).

```
  Browser / installed PWA (GitHub Pages, static)
    index.html -> js/app.js (js/src/*.js) + ui/* React islands + css
    sw.js: shell/pages from cache, refreshed behind; other same-origin network-first
          |                                   |
          | REST / supabase-js                | Bearer (user's EMS token)
          | (anon key or the 180-min pass)    v
          v                               EMS API (/v1)
    Supabase: Postgres + RLS
    Edge fns: ems-auth (mints the pass), push-send, readings-fetch, github, calendar, transcribe ...
```

## Data flow

- **Load:** `fetchSheetData()` → snapshot assembled from ~13 Supabase tables (via the
  fetch-router in `01-data.js`). `?sb=0` → mock/offline mode (no Supabase).
- **Render:** snapshot → `enrichCardsWithSheet()` paints kibbutz cards (status, owners,
  region, steppers, EMS widgets). Other tabs (inventory, attendance, visits, calendar,
  my-tasks, EMS) render from the same snapshot + localStorage fallbacks.
- **Writes:** Supabase REST (`sbUpsert/sbInsert/sbDelete`) with a **dynamic auth header**
  (`baseH()`): authenticated bridge token if active & unexpired, else the public anon key.
- **EMS / voice / calendar:** the EMS API is called directly with the user's token; voice and
  calendar go through their Edge Functions (`transcribe`, `calendar`).

## Module model

Classic `<script>`-style files in `js/src/`, concatenated by `build.mjs` into one `js/app.js`.
**Everything shares one global scope** → inline `onclick=` handlers and cross-module calls
work by bare name. No imports/exports, no bundler-of-record, no framework. Sorted by numeric
filename prefix (`01-`…`16-`). See [modules.md](modules.md).

## PWA

- `manifest.webmanifest` + icons → installable; runs **standalone** (no address bar).
- `sw.js`: the page and the stamped shell files (`?v=`) paint from the cache and refresh behind it;
  other same-origin GETs are network-first (cache fallback offline). Cross-origin is bypassed; notification actions only open the app.
- `16-install.js`: captures `beforeinstallprompt`, shows the install button, hides it when
  already standalone (iOS → manual Share-sheet instructions).
- Cache-busting: `build.mjs` stamps `?v=<base36 time>` onto `app.js`/`app.css` each build,
  so a new deploy can never be masked by a stale SW/CDN cache.

## Auth (two layers)

1. **App identity** — EMS **login gate** (`15-login-gate.js`, default ON): email + password
   → 2FA OTP → resolves the EMS profile's first name → app person → roles/permissions.
   Break-glass: `?login=0` reverts to the legacy name-picker + PIN (`11-search-login.js`).
2. **DB access** — the gate trades the EMS token for a short-lived Supabase **authenticated**
   JWT via the `ems-auth` Edge Function (the "bridge"). See [data-and-security.md](data-and-security.md).

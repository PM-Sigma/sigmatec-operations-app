# Architecture

A no-framework, installable **PWA** (classic scripts in one shared global scope) with a
**hybrid backend**: application data in **Supabase**, EMS/voice/calendar bridged through
**Google Apps Script**, live operational data from the **EMS API**.

```
  ┌─────────────────────────────────────────────────────────────┐
  │  Browser / installed PWA  (GitHub Pages, static)             │
  │  index.html → js/app.js (built from js/src/*.js) + css       │
  │  Service worker: network-first, same-origin only             │
  └───────────────┬───────────────────────┬─────────────────────┘
                  │ REST (anon OR              │ POST text/plain
                  │ authenticated bridge JWT)  │ (no CORS preflight)
                  ▼                            ▼
        ┌──────────────────┐        ┌────────────────────────────┐
        │ Supabase          │        │ Apps Script web app (/exec)│
        │ Postgres+PostgREST│        │ • EMS proxy (CORS bridge)  │
        │ RLS policies      │        │ • transcribe / parseRequest│
        │ Edge fn: ems-auth │        │ • office calendar (Opt. B) │
        └──────────────────┘        └───────────────┬────────────┘
                  ▲                                  │ Bearer (caller's EMS token)
                  │ mint authenticated JWT           ▼
                  │ (HS256, role=authenticated)   ┌────────────────┐
                  └───────────────────────────────│  EMS API       │
                       ems-auth validates EMS tok  │ api.sigmatec-  │
                                                   │ ems.com/v1     │
                                                   └────────────────┘
```

## Data flow

- **Load:** `fetchSheetData()` → snapshot assembled from ~13 Supabase tables (via the
  fetch-router in `01-data.js`). `?sb=0` → mock/offline mode (no Supabase).
- **Render:** snapshot → `enrichCardsWithSheet()` paints kibbutz cards (status, owners,
  region, steppers, EMS widgets). Other tabs (inventory, attendance, visits, calendar,
  my-tasks, EMS) render from the same snapshot + localStorage fallbacks.
- **Writes:** Supabase REST (`sbUpsert/sbInsert/sbDelete`) with a **dynamic auth header**
  (`baseH()`): authenticated bridge token if active & unexpired, else the public anon key.
- **EMS / voice / calendar:** still go through Apps Script (`type:'ems'|'transcribe'|'parseRequest'`)
  — the data fetch-router leaves those POSTs on Apps Script untouched.

## Module model

Classic `<script>`-style files in `js/src/`, concatenated by `build.mjs` into one `js/app.js`.
**Everything shares one global scope** → inline `onclick=` handlers and cross-module calls
work by bare name. No imports/exports, no bundler-of-record, no framework. Sorted by numeric
filename prefix (`01-`…`16-`). See [modules.md](modules.md).

## PWA

- `manifest.webmanifest` + icons → installable; runs **standalone** (no address bar).
- `sw.js`: **network-first** for same-origin GETs (APIs always live; offline falls back to
  cache / `index.html`). Cross-origin (Supabase, Apps Script) bypassed entirely.
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

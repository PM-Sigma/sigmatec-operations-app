# Sigmatec Operations App

Operations + kibbutz-onboarding dashboard for Sigmatec. Installable PWA (phone + desktop), backed by Supabase (Postgres).

## What's here
```
index.html              the dashboard (single-file app; data layer routes to Supabase)
stats.html              statistics page (read-only)
manifest.webmanifest    PWA manifest (name, icons, standalone display)
sw.js                   service worker — caches the app shell only; APIs stay live
icons/                  app icon (svg + generated png 192/512)
db/                     Supabase schema + one-time importer + parity checker
```

## Backend
- **Data:** Supabase — project `wwqfcajnxinaxmobrgol` (`https://wwqfcajnxinaxmobrgol.supabase.co`), 13 tables mirroring the old Google Sheet. The anon key is embedded in the client (safe; RLS on every table).
- **Hybrid:** the live EMS proxy + AI (`ems` / `transcribe` / `parseRequest`) still go through Apps Script v5.9.
- **Fallback:** append `?sb=0` to any URL → routes back to Apps Script/Sheets (no redeploy). Set `USE_SUPABASE` back to `indexOf('sb=1') !== -1` to globally revert.

## Hosting
Static files — host anywhere with correct MIME types. Currently GitHub Pages; portable to the company server by copying the files. Supabase is the DB regardless of where the static app is served.

## Develop
Edit `index.html` directly (single file). Syntax-check before deploy:
```
node -e 'const fs=require("fs");const h=fs.readFileSync("index.html","utf8");const re=/<script\b[^>]*>([\s\S]*?)<\/script>/gi;let m,i=0,b=0;while((m=re.exec(h))){i++;try{new Function(m[1]);}catch(e){b++;console.log(e.message);}}console.log("scripts:"+i+" errors:"+b);'
```
Then commit + push (GitHub Pages auto-deploys).

## DB scripts (`db/`)
- `supabase_schema.sql` — run once in the Supabase SQL editor on a fresh project.
- `import_from_appsscript.mjs` — one-time import from the Apps Script snapshot (`SUPABASE_URL`, `SERVICE_KEY`, `SHEET_API` env).
- `verify_read_parity.mjs` — checks Supabase snapshot == Apps Script snapshot (delta detector).

## Roadmap
- Tighten security: per-user login (Supabase Auth) + stricter RLS.
- TWA wrapper for the Play Store + a native home-screen widget.
- Move EMS proxy/AI to Supabase Edge Functions (drop Apps Script).

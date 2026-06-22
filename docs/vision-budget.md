# Vision — what a *budgeted* version unlocks ("drawer plan")

The system today runs on **$0** (GitHub Pages + Supabase free + Apps Script). That's deliberate —
prove it works first. This file is the drawer plan for *when it earns a budget*: what we'd upgrade,
and the concrete advantage of each. Kept as a pitch you can pull out when the time comes.

## Guiding principle (free or funded)
**Stay modular, never become legacy.** Every capability is its own module (`js/src/NN-*.js`) +
its own backend function. Budget buys *reliability and reach* — not a rewrite.

## Where the free tier hurts (today's workarounds)
| Area | Free-tier workaround | What it costs us |
|------|----------------------|------------------|
| Auth | EMS-token → minted Supabase JWT (bridge) | session expires at ~1h; no per-user roles/audit |
| EMS / GitHub / calendar | Apps Script + Edge proxies, **polling** on load | data is seconds-to-minutes stale; no push |
| Hosting | GitHub Pages (static, public repo) | client code is public; no server-side secrets in the app |
| Calendar | blocked by Workspace policy (needs admin) | manual admin steps per integration |
| Alerts | in-app banners only | no phone notifications when away |

## What budget buys — by theme
**1. Reliability & trust**
- **Real auth** (Supabase Auth / SSO with the Workspace) — per-user roles, audit log, no 1h bridge expiry.
- **Monitoring + backups + uptime SLA** (Supabase Pro): nightly backups, alerting, no cold-start lag.

**2. Live data instead of polling**
- **Webhooks** (GitHub → tickets, EMS → alerts, calendar) so the board updates the instant something changes.
- **Auto EMS-alert → task** creation for non-transmitting meters (already specced) running server-side.

**3. Reach**
- **Push notifications** (low-stock, new message, urgent kibbutz, sprint changes) to phones.
- **Native app** in the Play/App stores (the PWA is already installable; budget = store presence + native push).

**4. Product depth**
- **BI / trends**: go-live velocity, field-load forecasting, ticket burndown per sprint.
- **Customer portal**: kibbutzim see their own status; document management; e-sign for requirements.

**5. Scale → SaaS**
- The same operations app, **multi-tenant**, sold to other energy/operations companies — the system becomes a revenue product, not just an internal tool.

**6. Team**
- Dedicated dev time (מתניה) + **CI/CD** (tests, preview deploys per branch) so shipping stays fast and safe as it grows.

## Rough cost tiers
- **Now:** $0.
- **Solid internal tool:** ~Supabase Pro ($25/mo) + a domain → real auth, backups, webhooks, push. Small.
- **Product/SaaS:** dedicated backend + dev time + store accounts — justified once it's company-operational and proven.

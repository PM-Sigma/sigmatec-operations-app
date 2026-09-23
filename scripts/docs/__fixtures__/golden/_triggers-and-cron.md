---
doc_id: table:_triggers-and-cron
doc_type: table
title: Triggers and cron jobs
generated: true
generator: scripts/docs/gen-schema.mjs
introspected_at: 2026-09-23T00:00:00.000Z
introspection_commit: null
---

# Triggers and cron jobs

## Triggers

| Table | Trigger | Timing | Event | Action |
|---|---|---|---|---|
| public.widgets | `widgets_set_updated_at` | BEFORE | UPDATE | EXECUTE FUNCTION widgets_touch_updated_at() |

## Cron jobs

> Target function only — the command body never leaves the DB (§10).

| Job | Schedule | Active | Target |
|---|---|---|---|
| `widgets-nightly-digest` | `0 3 * * *` | yes | `widgets_touch_updated_at` |

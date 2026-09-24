---
doc_id: generated:schema-readme
doc_type: generated
title: Schema
generated: true
generator: scripts/docs/gen-schema.mjs
introspected_at: 2026-09-23T00:00:00Z
introspection_commit: null
---
<!-- GENERATED:body -->
# Schema

3 tables/views across 4 schemas, introspected 2026-09-23T00:00:00Z.

## Tables

- [public.generators](public.generators.md)
- [public.meter_burns](public.meter_burns.md)
- [public.visits](public.visits.md)

## ER diagram

```mermaid
erDiagram
    meter_burns }o--|| generators : "generator_id"
```

## Drift summary

No drift: every live table is declared in `db/*.sql`.
<!-- /GENERATED:body -->

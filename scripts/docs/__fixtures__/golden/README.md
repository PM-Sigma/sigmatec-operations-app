---
doc_id: generated:schema-readme
doc_type: generated
title: Schema
generated: true
generator: scripts/docs/gen-schema.mjs
introspected_at: 2026-09-23T00:00:00.000Z
introspection_commit: null
---
<!-- GENERATED:body -->
# Schema

2 tables/views across 4 schemas, introspected 2026-09-23T00:00:00.000Z.

## Tables

- [public.categories](public.categories.md)
- [public.widgets](public.widgets.md)

## ER diagram

```mermaid
erDiagram
    widgets }o--|| categories : "category_id"
```

## Drift summary

2 table(s) live but not declared in any `db/*.sql` by name: `public.categories`, `public.widgets`.
<!-- /GENERATED:body -->

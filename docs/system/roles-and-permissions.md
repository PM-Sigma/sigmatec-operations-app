---
doc_id: system:roles-and-permissions
doc_type: system
title: Roles and permissions
generated: partial
generator: scripts/docs/gen-roles.mjs
code:
  - app/src/lib/people.ts
  - app/src/lib/caps.ts
  - js/src/00-bridge.js
last_validated: { date: null, branch: main, commit: null }
---

# Roles and permissions

The model in prose, and which layer enforces what (UI gate vs RLS vs edge fn) — written by
DOC-1, not generated.

## Matrices

<!-- GENERATED:matrices -->
### People -> roles

| Person | Notes |
|---|---|
| עידן | |
| עמיחי | |
| אביאם | |
| ניתאי | |
| אבצן | |
| מתניה | |
| אליה | |
| צפייה | the view-only identity (`VIEWER_NAME`, stored as this string) |

### Role x page (`canShowPage()`, `js/src/00-bridge.js`)

| Page | Rule |
|---|---|
| `attendance` | via `canSeeAttendance()` |
| `dev` | via `getCurrentUser()`, `canManageStaff()` · names: מתניה, אליה |
| `pushlog` | via `isIdan()` |
| `inventory` | via `getCurrentUser()` · names: מתניה |
| `kibbutz` | everyone |
| `calendar` | everyone |
| `burns` | via `isViewer()`, `getCurrentUser()` · names: מתניה, אליה, אביאם, ניתאי, עידן, עמיחי · viewer: yes |
| `hours` | via `isViewer()`, `getCurrentUser()` · names: עידן, עמיחי, מתניה · viewer: yes |

### Build capability flags (`app/src/lib/caps.ts`)

| Flag | Value |
|---|---|
| `INTERNAL_TASKS_WRITABLE` | `true` |

### Role x table x command (live `pg_policies`)

*(not yet generated — requires a live `pg_policies` pull via `introspect.sql`)*
<!-- /GENERATED:matrices -->

# OPS GRAPH — knowledge graph of the Sigmatec Operations App

*Lives at `docs/ops-graph/`. Wired into `CLAUDE.md` and `docs/INDEX.md` — every session should reach for it before grepping.*

A queryable map of this app: every module, function, DB table, RLS policy, edge function,
test suite, spec and design rationale, and the relationships between them. Built 2026-09-23
from 446 files at release 2.23 (`origin/main` 5e23a30) with graphify.

**Use it instead of grepping** when the question is "what connects to what": which module
writes which table, what guards a role, which spec explains a decision, what breaks if I
change X.

## Querying it

```bash
python ops_graph.py explain "emsQueueFlush"     # what it is, everything it touches
python ops_graph.py table delivery_certs        # who reads/writes a table + its RLS policies
python ops_graph.py file 20-delivery-cert.js    # what a module contains and connects to
python ops_graph.py path "isViewer" "xlExportVisits"   # how two things relate
python ops_graph.py query "how does push notification routing work"
python ops_graph.py stats
```

`graphify-out/graph.html` is the same graph, interactive, in a browser.

Paths above are relative to this folder; from the repo root prefix them with `docs/ops-graph/`.

## Files

| File | What it is |
|---|---|
| `graphify-out/graph.json` | the graph — 4,714 nodes, 12,523 edges, 157 communities |
| `graphify-out/graph.html` | interactive view, no server needed |
| `graphify-out/GRAPH_REPORT.md` | god nodes, communities, cohesion, suggested questions |
| *(local)* `GRAPH_AUDIT.md` | adversarial audit + re-audit of the graph's honesty |
| *(local)* `BROKEN.md` | **what's broken — human-verified** (repo + live DB). Kept out of this PUBLIC repo in `<project>/תוצרים/…ממצאי OPS GRAPH/`. |
| `graphify-out/GRAPH_GAPS.md` | raw auto-generated gap scan (input to BROKEN.md; contains false positives) |
| `graphify-out/.graphify_chunk_*.json` | raw per-agent extraction (provenance) |
| `ops_graph.py` | the query tool |
| `fix_graph.py` | repair pass applied after the audit |
| `label_and_render.py` | clustering, labelling, report + HTML rendering |
| `find_gaps.py` | regenerates `GRAPH_GAPS.md` |

## Rebuilding

**After code changes — one command, no LLM, ~30s:**

```bash
python docs/ops-graph/rebuild.py
```

It re-parses all code (AST), re-merges the 24 cached semantic chunks, then runs
`fix_graph.py` → `label_and_render.py` → `find_gaps.py`. It asserts on a stunted result rather
than silently writing one.

**After new docs/specs** the Sonnet extraction chunk that covers them must be re-run — their exact per-chunk
file lists are recoverable from `graphify-out/.graphify_chunk_*.json` (`source_file` fields).
Each chunk's file list is in `.chunks/chunk_NN.txt`. A local model (Ollama `qwen3:8b`, CPU-only here) was
benchmarked for this and rejected: ~7.7 tok/s output and it returned the schema placeholder on an 88-line file.

## Honesty

Every edge is tagged `EXTRACTED` (explicit in source), `INFERRED`, or `AMBIGUOUS`.
 An Opus audit hand-verified 34 edges against source and
found 7 false, all since removed or downgraded; it found **zero hallucinated** modules,
tables or functions. Read `GRAPH_AUDIT.md` before trusting any single edge — it names the
failure modes that survive (`confidence_score` is near-constant, `appsscript/*.gs` is not
covered).

## Known blind spots

- `appsscript/*.gs` — a live third of the backend (every `SHEET_API` POST) has no nodes.
- `qa/playwright/` — the e2e suite is not extracted (BROKEN.md used it for coverage checks).
- `css/app.css` — role gating is partly CSS-driven and the stylesheet is not extracted.
- `docs/claude-memory/` — historical decision docs not included.

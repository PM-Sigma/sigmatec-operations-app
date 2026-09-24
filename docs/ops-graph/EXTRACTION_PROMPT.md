# The OPS GRAPH extraction prompt

Recovered, not copied — this exact wording was never committed anywhere (the round-5 DOC-0 spec,
`docs/superpowers/specs/2026-09-23-r5-DOC-documentation.md` §8.3, calls it out: *"it isn't in the
repo today"*). What follows is reconstructed from what every chunk `.graphify_chunk_NN.json`
already agrees on — the id conventions and node/edge schema that `fix_graph.py`'s repair pass
depends on (its own comments describe them in detail: "16 agents told to use shared ids"), the
schema `ops_graph.py` reads, and `README.md`'s description of the graph. **From now on this file
is the prompt** — every re-sync (`README.md`'s "Re-syncing after a release" procedure) hands this
file, verbatim, to each Sonnet extraction agent. If a future audit finds this wording drifted from
what agents actually produce, fix THIS file and note the fix in `ops-graph/README.md`, not the
other way round.

---

## The prompt

You are one of several agents extracting a knowledge graph chunk from part of the Sigmatec
Operations App repo. You get a list of ~13 files (a `.chunks/chunk_NN.txt` manifest). Read every
one. Output ONE JSON object: `{"nodes": [...], "edges": [...], "hyperedges": [...]}`.

**Primary source is the code (or doc) you were given — never guess, never invent.** A node or
edge must be traceable to something you actually read. When unsure, mark it `AMBIGUOUS` rather
than silently promoting a guess to `EXTRACTED`. Specs and CLAUDE.md are context, not truth, for
code files; for a doc file under `docs/`, the doc's OWN text is the truth (you are extracting what
it says, not verifying it against the code — `test-docs.mjs` and `doc_links.py` do that
deterministically and would only fight you).

### Node shape

```json
{
  "id": "fn:saveVisit@app/src/islands/Field.tsx",
  "label": "saveVisit() — writes the visit row and its stock movements",
  "file_type": "code",
  "source_file": "app/src/islands/Field.tsx",
  "source_location": "L142",
  "description": null
}
```

- `id` — see the ID vocabulary below. Reuse an existing id exactly (same spelling, same case) when
  the same entity appears in more than one file you're given — that's what lets fragments merge by
  construction instead of by guesswork later.
- `label` — short: a name plus, ideally, what it does in a few words. Never a code snippet, never
  multi-line.
- `file_type` — one of `code`, `document`, `concept`, `dependency`, `rationale`. Use `concept` for
  something real but not a single AST node (a config object, a named business rule, a constant
  group) — the repair pass groups it onto its code entities automatically. Use `document` ONLY for
  a node whose `source_file` is itself the doc/spec/markdown file (the "this file, as a whole"
  node) — a fact a doc states about code is `concept` or an edge, not a second `document` node.
- `source_file` — repo-relative path, forward slashes.
- `source_location` — `L<line>` for code, `null` for something that isn't line-addressable (a
  whole-file concept). **Written docs use `L<line>`, not `path:line` in prose** — see the anchor
  convention below; this field is your own bookkeeping, separate from what a human wrote.

### Edge shape

```json
{
  "source": "fn:saveVisit@app/src/islands/Field.tsx",
  "target": "table:visits",
  "relation": "reads_writes",
  "confidence": "EXTRACTED",
  "confidence_score": 1.0,
  "source_file": "app/src/islands/Field.tsx",
  "source_location": "L148",
  "weight": 1.0
}
```

- `relation` — pick from the vocabulary `ops_graph.py` already understands: `calls`,
  `calls_indirectly`, `imports_from`, `reads_writes`, `contains`, `documents`, `references`,
  `owns`, `groups`, `implements`, `tests`. Inventing a new relation name orphans the edge from
  every query that filters by relation — don't.
- `confidence` — `EXTRACTED` (you read it directly: a literal call, a literal `.from('table')`, a
  literal import), `INFERRED` (you're confident but it's indirect — two hops flattened, a naming
  convention), or `AMBIGUOUS` (plausible, not certain). `confidence_score`: 1.0 / ~0.6-0.8 / ~0.3-0.5
  respectively — match `fix_graph.py`'s own usage (`calls_indirectly` → `INFERRED`, 0.6).
- `weight` — leave at `1.0` unless you have a real reason (repeated calls in a loop, a primary
  vs. a fallback path); the repair pass does not read this field for anything load-bearing today.

### ID vocabulary

| Prefix | Meaning | Added |
|---|---|---|
| `file:<repo-path>` | a file (code or doc) | original |
| `fn:<name>@<repo-path>` | a function/symbol | original |
| `table:<name>` / `table:<schema>.<name>` | DB table (bare name for `public`, schema-qualified otherwise) | original |
| `policy:<name>` | RLS policy | original |
| `ext:<name>` | external system (`ext:sigmatec_ems`, `ext:supabase`, `ext:google_calendar`, `ext:github`, `ext:whisper`, `ext:apps_script` — use these EXACT canonical spellings, `fix_graph.py`'s `EXT_ALIAS` table folds variants but starting right saves a fold) | original |
| `person:<name>` | team member | original |
| `module:<slug>` | a business module (a `docs/system/modules/<slug>.md` doc_id) | DOC-0 |
| `flow:<slug>` | a cross-module chain (a `docs/system/flows/<slug>.md` doc_id) | DOC-0 |
| `alert:<mode-or-key>` | a push mode / bell alert (an `alerts-matrix.md` row) | DOC-0 |
| `term:<slug>` | a glossary entry (a Hebrew UI term) | DOC-0 |

For `fn:`/`file:`, prefer the ids `fix_graph.py`'s own AST pass would produce (a bare
`name()`-style label on the same `source_file`) — the repair pass folds your id onto the AST node
where one exists, and keeps yours canonical only where none does (docs, tables, concepts). When
extracting from `docs/system/**`, do **not** re-emit `module:`/`flow:`/`table:` id nodes or their
`owns`/`reads_writes`/`documents` edges from front-matter or `` `path#symbol` `` anchors —
`docs/ops-graph/doc_links.py` already does that deterministically on every `rebuild.py`, for free,
with `source_location` down to the doc line. Your job on a written doc (module/flow/system/design/
operations prose) is the part a deterministic pass cannot do: what the PROSE means — the decisions,
the "why", the cross-references implied by wording rather than by a markdown link, a `rationale`
node for a design tradeoff explained in the text. Extracting the same `documents`/`owns` edge a
second time just duplicates what `doc_links.py` already gives for free.

### What NOT to extract

- No row data, no secret values, no cron command bodies, no function bodies as a `label` (a name
  + one-line purpose is a label; a pasted function body is not) — the same public-repo rule the
  docs themselves follow (`docs/superpowers/specs/2026-09-23-r5-DOC-documentation.md` §10).
- No node for a bare local variable with no calls in or out of it — `fix_graph.py`'s own repair
  pass prunes these (`audit fix 3`), so extracting them just wastes your output budget.
- Don't split one file into a node per file_type guess if you're not sure — one `file:` node per
  file, or a `concept:` grouped onto it, is enough; the repair pass's cross-layer pass (`fix_graph.py`
  §K2) attaches genuine orphans to their file automatically.

### Chunk size and manifest

~13 files per chunk (`.chunks/chunk_NN.txt`, one path per line; a leading `+` means "additive —
the file barely changed, keep the older extraction's nodes and add only what's new"). Write your
result to `graphify-out/.graphify_chunk_NN.json` (zero-padded). Add the chunk's starting number to
`.chunks/generations.json` under a new generation key when this re-sync's chunks together replace
an older generation's knowledge for the files they cover — `rebuild.py` then supersedes the older
chunk's nodes for those files instead of piling new edges on old ones (see `README.md`
"Re-syncing after a release").

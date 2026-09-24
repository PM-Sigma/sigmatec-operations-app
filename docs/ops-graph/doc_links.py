#!/usr/bin/env python
"""doc_links.py -- the deterministic docs/system/** -> OPS GRAPH pass (DOC-0, spec
docs/superpowers/specs/2026-09-23-r5-DOC-documentation.md §8.2).

Runs from rebuild.py after step 3 (AST + semantic merge -> .graphify_extract.json) and before
fix_graph.py. No LLM: front-matter + anchors + a live introspection JSON, straight into edges,
so a `rebuild.py` run picks up every doc's declared facts for free even when the Sonnet doc-
writing chunks (DOC-2) are stale.

    python doc_links.py        (from this folder, like fix_graph.py)

What it adds to `.graphify_extract.json` (in place):
  - one node per `doc_id` (module:/flow:/table:/edge_function:/... - the id IS the front-matter
    doc_id) + a `file:<doc path>` node + `documents` edge from the file to the doc_id.
  - `module:` --owns--> each `file:` matched by its `code:` globs.
  - `module:`/`flow:` --reads_writes--> `table:` from `tables:`.
  - `module:` --references--> edge-function `file:` from `edge_functions:`.
  - `flow:` --groups--> `module:` from `modules:`.
  - anchors (`` `path#symbol` `` in the prose) -> `documents` edges, source_location = the doc
    line, confidence EXTRACTED, score 1.0. An anchor that doesn't resolve (file or symbol not
    found) emits NOTHING - test-docs.mjs already fails the build on it, so the graph should not
    show it as if it were fine.
  - table pages (`schema/<schema>.<table>.md`): pre-creates/updates the `table:<name>` node with
    `source_file` = that page, BEFORE fix_graph.py's own table pass runs - fix_graph.py only sets
    `source_file` when it creates a table node fresh, so a pre-existing one (this pass) keeps it.
  - policies, from a live `_introspection.json` if one has been saved: relabels `policy:<name>`
    from the LIVE pg_policies row and marks it `_live: True`, which fix_graph.py §L (the db/*.sql
    guess) is taught to skip.
  - retired docs are handled in fix_graph.py itself (§8.2 point 4: a `document` node whose
    source_file is under docs/ and gone from disk is dropped there, not here).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.resolve().parents[1]
SYSTEM_DIR = ROOT / "docs" / "system"
EXTRACT_PATH = HERE / ".graphify_extract.json"


def load_docs():
    """Every docs/system/**/*.md doc's front-matter + body, as {path, data, body} dicts.

    Parsed by scripts/docs/dump-front-matter.mjs (Node), not a second Python parser here - the
    grammar (scalars, null, inline arrays/objects, block lists) lives in ONE place,
    scripts/docs/matter.mjs, so it cannot quietly drift between the JS and Python sides of the
    docs tooling (ponytail: don't hand-roll the same small parser twice)."""
    r = subprocess.run(
        ["node", str(ROOT / "scripts" / "docs" / "dump-front-matter.mjs")],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8",
    )
    if r.returncode != 0:
        sys.exit(f"dump-front-matter.mjs failed:\n{r.stderr}")
    return json.loads(r.stdout)


def declared_symbol(abs_path, symbol):
    if not abs_path.exists():
        return False
    text = abs_path.read_text(encoding="utf-8", errors="ignore")
    pat = re.compile(
        r"\b(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|const|let|class|interface|type)\s+"
        + re.escape(symbol) + r"\b"
    )
    return bool(pat.search(text))


ANCHOR_RE = re.compile(r"`([\w./-]+\.(?:ts|tsx|js|mjs|sql))#([A-Za-z_$][\w$]*)`")


def edge(src, tgt, relation, sfile, loc, conf="EXTRACTED", score=1.0):
    return {"source": src, "target": tgt, "relation": relation, "confidence": conf,
            "confidence_score": score, "source_file": sfile, "source_location": loc, "weight": 1.0}


def main():
    if not EXTRACT_PATH.exists():
        sys.exit(f"{EXTRACT_PATH} not found - run this from rebuild.py, after the AST+semantic merge step")
    ex = json.loads(EXTRACT_PATH.read_text(encoding="utf-8-sig"))
    nodes = {n["id"]: n for n in ex["nodes"]}
    edges = ex["edges"]

    introspection = None
    intro_path = SYSTEM_DIR / "schema" / "_introspection.json"
    if intro_path.exists():
        introspection = json.loads(intro_path.read_text(encoding="utf-8"))

    docs = load_docs()
    n_doc_nodes = n_owns = n_rw = n_ref = n_groups = n_anchor = n_unresolved = n_table_src = n_policy = 0

    for doc in docs:
        rel = doc["path"]
        data, body = doc["data"], doc["body"]
        doc_id = data.get("doc_id")
        if not doc_id:
            continue  # malformed front-matter - test-docs.mjs already fails the build on this

        file_id = f"file:{rel}"
        if file_id not in nodes:
            nodes[file_id] = {"id": file_id, "label": rel.rsplit("/", 1)[-1], "file_type": "document",
                               "source_file": rel, "source_location": None}
        if doc_id not in nodes:
            nodes[doc_id] = {"id": doc_id, "label": data.get("title") or doc_id, "file_type": "document",
                              "source_file": rel, "source_location": None}
        edges.append(edge(file_id, doc_id, "documents", rel, None))
        n_doc_nodes += 1

        doc_type = data.get("doc_type")
        if doc_type == "module":
            code_globs = data.get("code") or []
            res = [re.compile("^" + re.escape(g).replace(r"\*\*", "\u0000").replace(r"\*", "[^/]*").replace("\u0000", ".*") + "$")
                   for g in code_globs]
            # AST-known files only - a glob matching nothing real just owns nothing, silently.
            for other_id, n in list(nodes.items()):
                if not other_id.startswith("file:"):
                    continue
                sf = (n.get("source_file") or "").replace("\\", "/")
                if sf and any(r.match(sf) for r in res):
                    edges.append(edge(doc_id, other_id, "owns", rel, None))
                    n_owns += 1
            for fn in (data.get("edge_functions") or []):
                tgt = f"file:supabase/functions/{fn}/index.ts"
                edges.append(edge(doc_id, tgt, "references", rel, None))
                n_ref += 1
        if doc_type == "flow":
            for mod in (data.get("modules") or []):
                mid = mod if mod.startswith("module:") else f"module:{mod}"
                edges.append(edge(doc_id, mid, "groups", rel, None))
                n_groups += 1
        for t in (data.get("tables") or []):
            edges.append(edge(doc_id, f"table:{t}", "reads_writes", rel, None))
            n_rw += 1

        # anchors in the prose - line-numbered, unresolved ones emit nothing (see module docstring)
        for i, line in enumerate(body.split("\n"), start=1):
            for m in ANCHOR_RE.finditer(line):
                target_path, symbol = m.group(1), m.group(2)
                abs_p = ROOT / target_path
                if declared_symbol(abs_p, symbol):
                    tgt = f"fn:{symbol}@{target_path}"
                    edges.append(edge(file_id, tgt, "documents", rel, f"L{i}"))
                    n_anchor += 1
                else:
                    n_unresolved += 1

    # table pages: pre-seed table: nodes with source_file = the schema page (fix_graph.py only
    # sets source_file when IT creates the node fresh, so this survives that pass unchanged).
    schema_dir = SYSTEM_DIR / "schema"
    if schema_dir.exists():
        for p in schema_dir.glob("*.md"):
            if p.name in ("README.md", "_functions.md", "_triggers-and-cron.md"):
                continue
            m = re.match(r"^([a-z_]+)\.([a-z_][a-z0-9_]*)\.md$", p.name)
            if not m:
                continue
            schema, table = m.groups()
            cid = f"table:{table}" if schema == "public" else f"table:{schema}.{table}"
            rel = p.relative_to(ROOT).as_posix()
            if cid in nodes:
                nodes[cid]["source_file"] = rel
            else:
                nodes[cid] = {"id": cid, "label": f"{table} (table)", "file_type": "code",
                               "source_file": rel, "source_location": None}
            n_table_src += 1

    # policies, from a live introspection pull - beats fix_graph.py's db/*.sql first/last guess.
    if introspection:
        for pol in introspection.get("policies", []):
            cid = f"policy:{pol['name']}"
            label = f"{pol['name']} on {pol['table']} — {pol['command']} ({pol['permissive']}), live"
            if cid in nodes:
                nodes[cid]["label"] = label
            else:
                nodes[cid] = {"id": cid, "label": label, "file_type": "code",
                              "source_file": str(intro_path.relative_to(ROOT)).replace("\\", "/"),
                              "source_location": None}
            nodes[cid]["_live"] = True
            n_policy += 1

    ex["nodes"] = list(nodes.values())
    ex["edges"] = edges
    EXTRACT_PATH.write_text(json.dumps(ex, ensure_ascii=False), encoding="utf-8")
    print(f"doc_links: {len(docs)} docs -> {n_doc_nodes} documents edges, {n_owns} owns, "
          f"{n_rw} reads_writes, {n_ref} references, {n_groups} groups, {n_anchor} anchor edges "
          f"({n_unresolved} unresolved anchors, silently dropped), {n_table_src} table source_file "
          f"pins, {n_policy} live policy relabels")


if __name__ == "__main__":
    main()

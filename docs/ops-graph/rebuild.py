#!/usr/bin/env python
"""Rebuild the OPS GRAPH from the raw agent extractions + a fresh AST pass.

    python rebuild.py

Re-parses all code (AST, deterministic, free), re-merges the cached
semantic chunks (newest chunk that lists a file owns it) in graphify-out/.graphify_chunk_*.json, then runs
fix_graph -> label_and_render -> find_gaps.

This picks up CODE structure only. Changed files' semantics need a new Sonnet
chunk (list the files in .chunks/chunk_NN.txt) - see README.md.
"""
import glob
import os
import re
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
# graphify caches under <corpus root>/graphify-out unless GRAPHIFY_OUT is ABSOLUTE, and it
# reads the variable at import time. The corpus root is the repo root, so without this a
# stray graphify-out/ (absolute local paths inside) lands at the root and gets committed.
os.environ["GRAPHIFY_OUT"] = str((HERE / "graphify-out").resolve())
# The repo has grown past graphify's default 5000-node HTML-viz ceiling (round 5 + DOC-0's own
# docs/system nodes) — label_and_render.py's to_html() would raise ValueError and fail the WHOLE
# rebuild over an interactive-preview limit, not the graph data itself. Raise it generously
# instead of disabling the viz; graph.json (what ops_graph.py and doc_links.py's next run read)
# is unaffected either way.
os.environ.setdefault("GRAPHIFY_VIZ_NODE_LIMIT", "20000")


def main():
    os.chdir(HERE)   # FIRST: graphify creates ./graphify-out/cache on import, not only on extract
    detect = json.loads((HERE / ".graphify_detect.json").read_text(encoding="utf-8"))

    # 1. AST pass over current code.
    # parallel=False: graphify's process pool needs a __main__ guard on Windows and
    # fails to an EMPTY result rather than an error. 72 files parse fine serially.
    from graphify.extract import extract

    ROOT = HERE.resolve().parents[1]  # repo root
    code = [ROOT / f for f in detect["files"]["code"] if (ROOT / f).exists()]
    # graphify writes its AST cache to ./graphify-out/cache of the CURRENT directory.
    # Run from the repo root, that put a stray graphify-out/ (with absolute local
    # paths) at the root, and it got committed. Pin it inside docs/ops-graph/ (ignored).
    os.chdir(HERE)
    ast = extract(code, parallel=False)
    assert len(ast["nodes"]) > 500, \
        f"AST pass produced only {len(ast['nodes'])} nodes - extraction is broken, refusing to write"
    (HERE / ".graphify_ast.json").write_text(json.dumps(ast, indent=2), encoding="utf-8")
    print(f"AST: {len(ast['nodes'])} nodes, {len(ast['edges'])} edges from {len(code)} files")

    # 2. merge the cached semantic chunks
    nodes, edges, hyper = [], [], []
    chunks = sorted(glob.glob(str(HERE / "graphify-out" / ".graphify_chunk_*.json")))
    assert len(chunks) >= 15, f"expected >=15 extraction chunks, found {len(chunks)}"
    # Supersede rule: a file re-extracted in a newer chunk is owned by that chunk.
    # Older chunks' nodes/edges for it are stale (the code changed) and are dropped,
    # so a re-sync replaces knowledge instead of piling new edges on old ones.
    # Ownership is per GENERATION, not per chunk: a re-sync is several chunks (a focused
    # one + full-coverage ones) and all of them together replace the older generation.
    # .chunks/generations.json maps generation -> first chunk number, e.g. {"1": 1, "2": 25}.
    def num(p):
        return int(re.search(r"chunk_(\d+)", p).group(1))
    gpath = HERE / ".chunks" / "generations.json"
    starts = sorted(json.loads(gpath.read_text(encoding="utf-8")).values()) if gpath.exists() else [1]

    def gen(n):
        return max(i for i, s in enumerate(starts) if s <= n)
    owner, additive = {}, set()
    for p in sorted(chunks, key=num):
        man = HERE / ".chunks" / f"chunk_{num(p):02d}.txt"
        if man.exists():
            for f in man.read_text(encoding="utf-8").split():
                f = f.replace("\\", "/")
                if f.startswith("+"):          # additive: file barely changed - keep the
                    additive.add(f[1:])        # older extraction and add the new nodes
                    continue
                owner[f] = max(owner.get(f, 0), gen(num(p)))
    superseded = 0
    for p in sorted(chunks, key=num):
        d = json.loads(Path(p).read_text(encoding="utf-8-sig"))
        me = gen(num(p))

        def stale(x):
            sf = (x.get("source_file") or "").replace("\\", "/")
            return sf in owner and owner[sf] != me and sf not in additive
        for n in d.get("nodes", []):
            if stale(n):
                superseded += 1
            else:
                nodes.append(n)
        edges += [e for e in d.get("edges", []) if not stale(e)]
        hyper += [h for h in d.get("hyperedges", []) if not stale(h)]
    print(f"superseded: {superseded} stale nodes from files re-extracted in newer chunks")
    seen, sem_nodes = set(), []
    for n in nodes:
        if n["id"] not in seen:
            seen.add(n["id"])
            sem_nodes.append(n)
    (HERE / ".graphify_semantic.json").write_text(
        json.dumps({"nodes": sem_nodes, "edges": edges, "hyperedges": hyper},
                   ensure_ascii=False), encoding="utf-8")

    # 3. merge AST + semantic, dropping edges whose endpoints no chunk defined
    ids = {n["id"] for n in ast["nodes"]}
    merged = list(ast["nodes"])
    for n in sem_nodes:
        if n["id"] not in ids:
            merged.append(n)
            ids.add(n["id"])
    all_edges = [e for e in ast["edges"] + edges if e["source"] in ids and e["target"] in ids]
    (HERE / ".graphify_extract.json").write_text(json.dumps({
        "nodes": merged, "edges": all_edges,
        "hyperedges": [h for h in hyper if all(x in ids for x in h["nodes"])],
        "input_tokens": 1325755, "output_tokens": 0,
    }, ensure_ascii=False), encoding="utf-8")
    print(f"merged: {len(merged)} nodes, {len(all_edges)} edges")

    # 4. docs/system/** -> graph edges (deterministic, DOC-0 spec §8.2) -> repair ->
    #    cluster/label/render -> gaps
    for step in ("doc_links.py", "fix_graph.py", "label_and_render.py", "find_gaps.py"):
        print(f"\n--- {step}")
        if subprocess.run([sys.executable, str(HERE / step)], cwd=HERE).returncode:
            sys.exit(f"{step} failed")

    g = json.loads((HERE / "graphify-out" / "graph.json").read_text(encoding="utf-8"))
    assert len(g["nodes"]) > 1000, f"final graph has only {len(g['nodes'])} nodes - something regressed"
    print(f"\nOPS GRAPH rebuilt: {len(g['nodes'])} nodes, {len(g['links'])} edges.")


if __name__ == "__main__":
    main()

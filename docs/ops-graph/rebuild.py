#!/usr/bin/env python
"""Rebuild the OPS GRAPH from the raw agent extractions + a fresh AST pass.

    python rebuild.py

Re-parses all code (AST, deterministic, free), re-merges the seven cached
semantic chunks in graphify-out/.graphify_chunk_*.json, then runs
fix_graph -> label_and_render -> find_gaps.

This picks up CODE changes only. Extraction of new docs/specs needs the seven
Sonnet agents re-run - see README.md.
"""
import glob
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent


def main():
    detect = json.loads((HERE / ".graphify_detect.json").read_text(encoding="utf-8"))

    # 1. AST pass over current code.
    # parallel=False: graphify's process pool needs a __main__ guard on Windows and
    # fails to an EMPTY result rather than an error. 72 files parse fine serially.
    from graphify.extract import extract

    ROOT = HERE.resolve().parents[1]  # repo root
    code = [ROOT / f for f in detect["files"]["code"] if (ROOT / f).exists()]
    ast = extract(code, parallel=False)
    assert len(ast["nodes"]) > 500, \
        f"AST pass produced only {len(ast['nodes'])} nodes - extraction is broken, refusing to write"
    (HERE / ".graphify_ast.json").write_text(json.dumps(ast, indent=2), encoding="utf-8")
    print(f"AST: {len(ast['nodes'])} nodes, {len(ast['edges'])} edges from {len(code)} files")

    # 2. merge the cached semantic chunks
    nodes, edges, hyper = [], [], []
    chunks = sorted(glob.glob(str(HERE / "graphify-out" / ".graphify_chunk_*.json")))
    assert len(chunks) >= 15, f"expected >=15 extraction chunks, found {len(chunks)}"
    for p in chunks:
        d = json.loads(Path(p).read_text(encoding="utf-8-sig"))
        nodes += d.get("nodes", [])
        edges += d.get("edges", [])
        hyper += d.get("hyperedges", [])
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

    # 4. repair -> cluster/label/render -> gaps
    for step in ("fix_graph.py", "label_and_render.py", "find_gaps.py"):
        print(f"\n--- {step}")
        if subprocess.run([sys.executable, str(HERE / step)], cwd=HERE).returncode:
            sys.exit(f"{step} failed")

    g = json.loads((HERE / "graphify-out" / "graph.json").read_text(encoding="utf-8"))
    assert len(g["nodes"]) > 1000, f"final graph has only {len(g['nodes'])} nodes - something regressed"
    print(f"\nOPS GRAPH rebuilt: {len(g['nodes'])} nodes, {len(g['links'])} edges.")


if __name__ == "__main__":
    main()

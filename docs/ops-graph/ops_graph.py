#!/usr/bin/env python
"""OPS GRAPH query tool — the knowledge graph of this app.

  python ops_graph.py explain <term>          what is it, what touches it
  python ops_graph.py path <a> <b>            shortest path between two things
  python ops_graph.py query <question>        neighbourhood around the question
  python ops_graph.py table <name>            who reads/writes a DB table
  python ops_graph.py file <name.js>          what a file contains and connects to
  python ops_graph.py stats                   size, layers, cross-layer matrix
"""
import json
import re
import sys
from pathlib import Path

import networkx as nx
from networkx.readwrite import json_graph

sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows console is cp1255 here

GRAPH = Path(__file__).parent / "graphify-out" / "graph.json"
if not GRAPH.exists():   # graph.json is derived (gitignored) - build it on first use
    import subprocess
    print("graph.json not built yet - running rebuild.py (~35s)...", file=sys.stderr)
    subprocess.run([sys.executable, str(Path(__file__).parent / "rebuild.py")], check=True,
                   stdout=subprocess.DEVNULL)
G = json_graph.node_link_graph(json.loads(GRAPH.read_text(encoding="utf-8")), edges="links")


def lab(n):
    return G.nodes[n].get("label", n)


def src(n):
    d = G.nodes[n]
    s = d.get("source_file") or ""
    loc = d.get("source_location") or ""
    return f"{s}{':' + loc if loc else ''}"


def find(term, limit=5):
    t = term.lower().strip()
    scored = []
    for n in G:
        l = lab(n).lower()
        if l == t or l == t + "()":
            scored.append((100, n))
        elif t in l:
            scored.append((50 - abs(len(l) - len(t)) / 10, n))
        elif t in str(n).lower():
            scored.append((20, n))
    scored.sort(key=lambda x: (-x[0], -G.degree(x[1])))
    return [n for _, n in scored[:limit]]


def node_flag(nid):
    st = G.nodes[nid].get("status")
    if st == "not_on_disk":
        return " [NOT ON DISK: planned/retired]"
    if st == "retiring":
        grp = G.nodes[nid].get("retiring_group", "")
        return f" [RETIRING: {grp}]" if grp else " [RETIRING]"
    return ""


def show_edges(n, limit=40):
    rows = []
    for v in G.neighbors(n):
        e = G.edges[n, v]
        # bug fixed 2026-09-23: this used to check the LAST `v` from this loop, not
        # the row being printed, so the not_on_disk flag applied to the wrong edge.
        rows.append((e.get("relation", "?"), lab(v), e.get("confidence", ""), src(v), v))
    rows.sort(key=lambda r: r[:4])
    for r, l, c, s, v in rows[:limit]:
        flag = "" if c == "EXTRACTED" else f" [{c}]"
        flag += node_flag(v)
        print(f"    --{r}--> {l}{flag}   ({s})")
    if len(rows) > limit:
        print(f"    ... {len(rows) - limit} more")


def cmd_explain(term):
    hits = find(term)
    if not hits:
        return print(f"nothing matching {term!r}")
    n = hits[0]
    print(f"NODE: {lab(n)}{node_flag(n)}")
    print(f"  source: {src(n) or 'n/a'}")
    print(f"  degree: {G.degree(n)}   community: {G.nodes[n].get('community', '?')}")
    print("  connections:")
    show_edges(n)
    if len(hits) > 1:
        print("\n  other matches: " + ", ".join(lab(h) for h in hits[1:]))


def cmd_path(a, b):
    na, nb = find(a, 1), find(b, 1)
    if not na or not nb:
        return print(f"could not resolve {a!r} or {b!r}")
    try:
        p = nx.shortest_path(G, na[0], nb[0])
    except nx.NetworkXNoPath:
        return print(f"no path between {lab(na[0])} and {lab(nb[0])}")
    print(f"{len(p) - 1} hops:")
    for i, n in enumerate(p):
        if i < len(p) - 1:
            e = G.edges[n, p[i + 1]]
            print(f"  {lab(n)}\n    --{e.get('relation')}-- [{e.get('confidence')}]")
        else:
            print(f"  {lab(n)}")


def cmd_query(question):
    terms = [w for w in re.findall(r"[\w\-\.]+", question) if len(w) > 3]
    starts, seen = [], set()
    for t in terms:
        for n in find(t, 2):
            if n not in seen:
                seen.add(n)
                starts.append(n)
    if not starts:
        return print("no matching nodes")
    starts = starts[:4]
    print("start nodes: " + ", ".join(lab(n) for n in starts) + "\n")
    for n in starts:
        print(f"{lab(n)}   ({src(n)})")
        show_edges(n, 12)
        print()


def cmd_table(name):
    name = name.lower()
    # bug fixed 2026-09-23: .lstrip("table:") strips any of those CHARACTERS from
    # the left, not the literal prefix - "tasks" became "table:sks". Strip the
    # literal prefix instead.
    if name.startswith("table:"):
        name = name[len("table:"):]
    nid = f"table:{name}"
    if nid not in G:
        return print(f"no table node {nid!r}. known: " +
                     ", ".join(sorted(lab(n) for n in G if str(n).startswith("table:"))))
    print(f"TABLE {lab(nid)}{node_flag(nid)}")
    show_edges(nid, 60)


def cmd_file(name):
    hits = [n for n in G if lab(n) == Path(name).name]
    if not hits:
        return print(f"no file node for {name!r}")
    n = hits[0]
    print(f"FILE {lab(n)}{node_flag(n)}  ({src(n)})  degree {G.degree(n)}")
    show_edges(n, 80)


def cmd_stats():
    print(f"{G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
    from collections import Counter

    def layer(n):
        s = (G.nodes[n].get("source_file") or "").replace("\\", "/")
        if s.startswith("db/"):
            return "db"
        if s.startswith("supabase/functions"):
            return "edge-fn"
        if s.startswith("test-"):
            return "tests"
        if s.endswith(".md"):
            return "docs"
        if s.startswith("js/"):
            return "client"
        return "shell"

    print("nodes by layer:", dict(Counter(layer(n) for n in G)))
    print("edge relations:", dict(Counter(
        G.edges[u, v].get("relation") for u, v in G.edges()).most_common(12)))
    print("confidence:", dict(Counter(
        G.edges[u, v].get("confidence") for u, v in G.edges())))


CMDS = {"explain": cmd_explain, "path": cmd_path, "query": cmd_query,
        "table": cmd_table, "file": cmd_file, "stats": cmd_stats}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in CMDS:
        sys.exit(__doc__)
    CMDS[sys.argv[1]](*sys.argv[2:])

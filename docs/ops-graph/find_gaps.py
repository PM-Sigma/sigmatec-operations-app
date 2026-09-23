# Interrogates the OPS GRAPH for structural defects: relationships that SHOULD
# exist and do not, and nodes that are wired wrong.
# Run from this folder: python find_gaps.py
import os as _os; _os.chdir(_os.path.dirname(_os.path.abspath(__file__)))  # runnable from anywhere
import json
import sys
from collections import defaultdict
from pathlib import Path

import networkx as nx
from networkx.readwrite import json_graph

ROOT = Path(__file__).resolve().parents[2]  # repo root: docs/ops-graph/<script>
G = json_graph.node_link_graph(
    json.loads(Path("graphify-out/graph.json").read_text(encoding="utf-8")), edges="links"
)


def sf(n):
    return (G.nodes[n].get("source_file") or "").replace("\\", "/")


def lab(n):
    return G.nodes[n].get("label", n)


def layer(n):
    s = sf(n)
    if not s:
        return "none"          # (D) table/ext/person nodes: never count as a code caller
    if ".test." in s or s.startswith("test-") or s.startswith("qa/"):
        return "tests"         # (B) vitest + node suites
    if s.startswith("app/src/"):
        return "client"        # (B) the React half of the client
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


def live(n):
    return G.nodes[n].get("status") != "not_on_disk"


def rel(u, v):
    return G.edges[u, v].get("relation", "")


out = []
def sec(title):
    out.append("\n## " + title)


def item(s):
    out.append("- " + s)


# ---------------------------------------------------------------- 1. orphans
orphans = sorted([n for n in G if G.degree(n) == 0], key=lab)
sec(f"Orphan nodes — known to the graph, connected to nothing ({len(orphans)})")
for n in orphans[:40]:
    item(f"`{lab(n)}`  ({sf(n) or 'no source'})")

# ------------------------------------------------- 2. tables nobody reads/writes
tables = [n for n in G if str(n).startswith("table:")]
sec("Tables with no code that reads or writes them")
for t in sorted(tables, key=lab):
    writers = [u for u in G.neighbors(t) if layer(u) in ("client", "edge-fn", "shell", "db")
               and rel(t, u) in ("reads_writes", "calls", "references")
               and not str(u).startswith(("policy:", "table:"))]
    if not writers:
        docs = [u for u in G.neighbors(t) if layer(u) == "docs"]
        item(f"`{lab(t)}` — no code edge. Known only from {len(docs)} doc/schema node(s).")

# ------------------------------------------- 3. edge functions nobody calls
sec("Edge functions with no caller in the client")
for n in G:
    if sf(n).startswith("supabase/functions") and lab(n).endswith("index.ts") and live(n):
        callers = [u for u in G.neighbors(n) if layer(u) in ("client", "shell", "db")
                   and rel(n, u) in ("calls", "calls_indirectly")]
        if not callers:
            item(f"`{sf(n)}` — deployed, but no client call site in the graph.")

# ------------------------------------------------- 4. client modules with no doc
sec("Client modules no document describes")
for n in G:
    if live(n) and lab(n) == Path(sf(n)).name and layer(n) == "client"             and sf(n).endswith((".js", ".ts", ".tsx")):
        if not any(layer(u) == "docs" for u in G.neighbors(n)):
            item(f"`{lab(n)}` — no docs edge.")

# ------------------------------------------------ 5. client modules with no test
sec("Client modules no test suite covers")
for n in G:
    if live(n) and lab(n) == Path(sf(n)).name and layer(n) == "client"             and sf(n).endswith((".js", ".ts", ".tsx")):
        if not any(layer(u) == "tests" for u in G.neighbors(n)):
            item(f"`{lab(n)}` — no test edge.")

# ----------------------------------------------------- 6. specs with no code link
sec("Specs and plans that never reach code")
for n in G:
    s = sf(n)
    if ("specs/" in s or "plans/" in s) and (str(n).startswith("file:") or lab(n) == Path(s).name):
        if not any(layer(u) in ("client", "edge-fn", "db", "shell") for u in G.neighbors(n)):
            item(f"`{s}` — design doc with no edge into implementation.")

# --------------------------------------------- 7. nodes naming files not on disk
sec("Nodes naming a file that does not exist on disk (planned or stale)")
for n in sorted((n for n in G if not live(n) and str(n).startswith("file:")), key=str):
    src = sorted({sf(u) for u in G.neighbors(n) if sf(u)})[:3]
    item(f"`{str(n)[5:]}` — referenced by {', '.join(src) or 'nothing'}")

# ------------------------------------------- 8. the graph's own uncertainty list
amb = [(u, v) for u, v in G.edges() if G.edges[u, v].get("confidence") == "AMBIGUOUS"]
sec(f"Relationships the graph itself flagged AMBIGUOUS ({len(amb)}) — verify or delete")
for u, v in amb:
    item(f"`{lab(u)}` --{rel(u, v)}--> `{lab(v)}`  ({sf(u)})")

# ---------------------------------- 9. RLS asymmetry: client access vs policy
sec("Security asymmetry — table touched by client code but no RLS policy node")
# (A) policy nodes are `policy:*` ids; their labels do not contain "rls"/"polic".
policy_tables = {v for n in G if str(n).startswith("policy:")
                 for v in G.neighbors(n) if str(v).startswith("table:")}
for t in tables:
    client_touch = [u for u in G.neighbors(t) if layer(u) == "client"]
    if client_touch and t not in policy_tables:
        item(f"`{lab(t)}` — reached from {len(client_touch)} client node(s), no RLS policy node guards it.")

# ------------------------------------------------ 10. weakly connected fragments
comps = sorted(nx.connected_components(G), key=len, reverse=True)
sec("Disconnected fragments — islands the main graph cannot reach")
item(f"largest component: {len(comps[0])} of {G.number_of_nodes()} nodes "
     f"({100 * len(comps[0]) / G.number_of_nodes():.0f}%)")
for c in comps[1:12]:
    item(f"island of {len(c)}: " + ", ".join(sorted(lab(x) for x in c)[:6]))

text = "# OPS GRAPH — structural gaps\n" + "\n".join(out) + "\n"
Path("graphify-out/GRAPH_GAPS.md").write_text(text, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # console is cp1255 here
print(text[:6000])
print(f"\n[written to graphify-out/GRAPH_GAPS.md - {len(out)} lines]")

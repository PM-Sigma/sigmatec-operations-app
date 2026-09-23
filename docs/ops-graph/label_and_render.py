# Clusters, labels and renders the final graph from the repaired extraction.
# Pipeline order: extract (7 Sonnet agents + AST) -> fix_graph.py -> this.
# Run from this folder: python label_and_render.py
import os as _os; _os.chdir(_os.path.dirname(_os.path.abspath(__file__)))  # runnable from anywhere
import json
from pathlib import Path

from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html

ROOT = str(Path(__file__).resolve().parents[2])
SRC = ".graphify_extract_fixed.json" if Path(".graphify_extract_fixed.json").exists() \
      else ".graphify_extract.json"

extraction = json.loads(Path(SRC).read_text(encoding="utf-8"))
detection = json.loads(Path(".graphify_detect.json").read_text(encoding="utf-8"))

G = build_from_json(extraction)
communities = cluster(G)
cohesion = score_all(G, communities)
gods = god_nodes(G)
surprises = surprising_connections(G, communities)

# Hand-written names for the largest communities; the tail is named after its
# highest-degree member rather than left as "Community 87".
MANUAL = {
    "getCurrentUser": "Identity & Role Gating",
    "showPage": "Page Router & Navigation",
    "refreshData": "Data Layer & Supabase Sync",
    "emsApi": "EMS API Client Layer",
    "emsQueueFlush": "EMS Offline Write Queue",
    "issueDeliveryCert": "Delivery Certificates",
    "invNewOrder": "Orders & Products Flow",
    "computeStock": "Inventory & Requirements",
    "saveVisit": "Visits & Activity Log",
    "devPaint": "Dev Task Board",
    "xlDownload": "Excel Export",
    "computeRecipients": "Push Recipient Routing",
    "callGemini": "AI Order Parser",
    "googleToken": "Google Calendar Edge Function",
    "fetchProjectFields": "GitHub Projects Bridge",
    "attNagDay": "Attendance Push Nagging",
    "resolveIdentity": "Login Gate & Identity",
    "createEmsTaskForKibbutz": "EMS Calendar & Task Creation",
}

labels = {}
for cid, members in communities.items():
    top = max(members, key=lambda n: G.degree(n))
    lab = G.nodes[top].get("label", top)
    name = next((v for k, v in MANUAL.items() if k in lab), None)
    labels[cid] = name or lab[:40]

tokens = {"input": extraction.get("input_tokens", 0), "output": extraction.get("output_tokens", 0)}
questions = suggest_questions(G, communities, labels)

report = generate(
    G, communities, cohesion, labels, gods, surprises, detection, tokens, ROOT,
    suggested_questions=questions,
)
Path("graphify-out/GRAPH_REPORT.md").write_text(report, encoding="utf-8")
to_json(G, communities, "graphify-out/graph.json", force=True)  # node count drops by design (noise pruned)
to_html(G, communities, "graphify-out/graph.html", community_labels=labels)

print(f"{G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities")

# Cross-layer edge matrix - the number the audit said decides usefulness.
def layer(n):
    sf = (G.nodes[n].get("source_file") or "").replace("\\", "/")
    if sf.startswith("db/"):
        return "db"
    if sf.startswith("supabase/functions"):
        return "edge-fn"
    if sf.startswith("test-"):
        return "tests"
    if sf.endswith(".md"):
        return "docs"
    if sf.startswith("js/"):
        return "client"
    return "shell"

LAYERS = ["client", "db", "edge-fn", "tests", "docs", "shell"]
mat = {a: {b: 0 for b in LAYERS} for a in LAYERS}
for u, v in G.edges():
    mat[layer(u)][layer(v)] += 1
print("\ncross-layer edges (row -> col):")
print("            " + "".join(f"{b:>9}" for b in LAYERS))
for a in LAYERS:
    print(f"{a:>11} " + "".join(f"{mat[a][b]:>9}" for b in LAYERS))

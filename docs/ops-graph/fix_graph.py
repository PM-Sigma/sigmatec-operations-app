# Repairs the graph against GRAPH_AUDIT.md findings, then re-clusters and re-renders.
# Deterministic only - no LLM. Run from this folder: python fix_graph.py
import os as _os; _os.chdir(_os.path.dirname(_os.path.abspath(__file__)))  # runnable from anywhere
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repo root: docs/ops-graph/<script>

ex = json.loads(Path(".graphify_extract.json").read_text(encoding="utf-8"))
ast_ids = {n["id"] for n in json.loads(Path(".graphify_ast.json").read_text(encoding="utf-8"))["nodes"]}
nodes = {n["id"]: n for n in ex["nodes"]}
edges = list(ex["edges"])
hyper = list(ex["hyperedges"])
log = []

# ---------------------------------------------------------------- audit fix 9
# Seven edges the Opus audit verified false. Five are two-hop paths flattened
# into a direct call and stamped EXTRACTED 1.0.
FALSE = [
    ("openEditModal", "showPage"),            # fabricated
    ("saveAttendance", "getCurrentUser"),     # none of the six are called
    ("saveAttendance", "getRole"),
    ("saveAttendance", "isIdan"),
    ("saveAttendance", "isViewer"),
    ("saveAttendance", "canUseEms"),
    ("saveAttendance", "canSeeAttendance"),
    ("attNagDay", "attMissingDays"),
    ("kibbutzHasSite", "getEmsSites"),        # inverts the design: uses sync emsSitesCached()
]
# Real but indirect (A->B->C). Kept, downgraded, relation renamed.
INDIRECT = [
    ("gateLogin", "scheduleEmsExpiry"),       # via storeToken()
    ("check", "autoReload"),                  # via onNewVersion()
    ("check", "showBanner"),
    ("xlHubInit", "certRangeReportRange"),    # real caller is xlHubCertsPdf/xlHubSumPdf
]


def fname(nid):
    # LLM labels are often "showPage() page router with role gates" or
    # "window.gateLogin() — EMS password login" - take the first fn token.
    lab = nodes.get(nid, {}).get("label", "").strip()
    m = re.match(r"^(?:window\.)?([A-Za-z_$][\w$]*)\s*\(", lab)
    return m.group(1) if m else None


kept, dropped, downgraded = [], 0, 0
for e in edges:
    pair = (fname(e["source"]), fname(e["target"]))
    if pair in FALSE:
        dropped += 1
        continue
    if pair in INDIRECT:
        e["relation"] = "calls_indirectly"
        e["confidence"] = "INFERRED"
        e["confidence_score"] = 0.6
        downgraded += 1
    kept.append(e)
edges = kept
log.append(f"false edges removed: {dropped}; two-hop edges downgraded to calls_indirectly: {downgraded}")

# ---------------------------------------------------------------- audit fix 3
# Bare local variables promoted to first-class nodes. Drop AST nodes that are a
# plain identifier (no "()" - so not a function) and carry at most one edge.
deg = defaultdict(int)
for e in edges:
    deg[e["source"]] += 1
    deg[e["target"]] += 1

noise = {
    nid for nid, n in nodes.items()
    if nid in ast_ids
    and re.fullmatch(r"[a-z_$][\w$]*", n.get("label", ""))   # lowercase bare identifier
    and "(" not in n.get("label", "")
    and deg[nid] <= 1
}
for nid in noise:
    del nodes[nid]
edges = [e for e in edges if e["source"] not in noise and e["target"] not in noise]
log.append(f"local-variable noise nodes dropped: {len(noise)}")

# --------------------------------------------------------- dropped-edge repair
# The 71 "lost" edges were AST imports_from pointing at Node stdlib / npm targets
# that the extractor never emitted as nodes. Re-add them as dependency nodes.
ast_raw = json.loads(Path(".graphify_ast.json").read_text(encoding="utf-8"))
readded = 0
for e in ast_raw["edges"]:
    if e.get("relation") != "imports_from":
        continue
    if e["source"] not in nodes:
        continue
    if e["target"] not in nodes:
        nodes[e["target"]] = {
            "id": e["target"],
            "label": e["target"].replace("node_", "node:").replace("_", "-"),
            "file_type": "dependency",
            "source_file": nodes[e["source"]].get("source_file"),
            "source_location": None,
        }
    edges.append(e)
    readded += 1
log.append(f"external dependency nodes re-added (the '71 dropped edges'): {readded}")

# ---------------------------------------------------------------- audit fix 1
# Node identity. Canonical id wins.
alias = {}


def canon(nid):
    # Cycle-safe: a self-alias (table:orders -> table:orders) once spun this forever.
    seen = set()
    while nid in alias and nid not in seen:
        seen.add(nid)
        nxt = alias[nid]
        if nxt == nid:
            break
        nid = nxt
    return nid


# (0) Convention ids -> AST ids.
# This build told all 16 agents to use shared ids (`file:<path>`, `fn:<name>@<path>`,
# `table:<name>`) so fragments merge by construction instead of by guesswork. Fold
# those onto the AST node for the same entity where one exists; where none does
# (docs, tables), the convention node itself becomes canonical.
ast_by_file, ast_by_fn = {}, {}
for nid, n in nodes.items():
    if nid not in ast_ids:
        continue
    sfp = (n.get("source_file") or "").replace("\\", "/")
    lab_ = (n.get("label") or "").strip()
    if not sfp:
        continue
    if lab_ == Path(sfp).name:
        ast_by_file.setdefault(sfp, nid)
    m = re.fullmatch(r"([A-Za-z_$][\w$]*)\(\)", lab_)
    if m:
        ast_by_fn.setdefault((m.group(1), sfp), nid)

conv_file = conv_fn = conv_kept = 0
for nid in list(nodes):
    if nid.startswith("file:"):
        path = nid[5:].replace("\\", "/")
        tgt = ast_by_file.get(path)
        if tgt:
            alias[nid] = tgt
            conv_file += 1
        else:
            # file entities are labelled by basename so node_for_file can resolve
            # them; the agent's descriptive label moves to `description`.
            if nodes[nid].get("label") and nodes[nid]["label"] != Path(path).name:
                nodes[nid]["description"] = nodes[nid]["label"]
            nodes[nid]["label"] = Path(path).name
            nodes[nid]["source_file"] = path
            conv_kept += 1
    elif nid.startswith("fn:") and "@" in nid:
        name, _, path = nid[3:].partition("@")
        tgt = ast_by_fn.get((name, path.replace("\\", "/")))
        if tgt:
            alias[nid] = tgt
            conv_fn += 1
log.append(f"convention ids folded onto AST: {conv_file} file:, {conv_fn} fn: "
           f"({conv_kept} file: nodes kept as canonical - docs and non-parsed files)")

# (E) Nodes naming a file that is not on disk describe PLANNED or RETIRED code
# (specs mention js/src/25-*.js, attendance-cron, gmail-intake...). Keep them, but
# never let them pose as live modules.
planned = 0
for nid, n in nodes.items():
    path = None
    if nid.startswith("file:"):
        path = nid[5:]
    elif nid.startswith("fn:") and "@" in nid and nid not in alias:
        path = nid.partition("@")[2]
    if path and not (ROOT / path).exists():
        n["status"] = "not_on_disk"
        n["file_type"] = "planned"
        planned += 1
log.append(f"nodes naming files not on disk, tagged planned: {planned}")

# (H) One id per external service. Agents spelled EMS four ways.
EXT_ALIAS = {
    "ext:ems": "ext:sigmatec_ems", "ext:ems_api": "ext:sigmatec_ems",
    "ext:sigmatec_ems_api": "ext:sigmatec_ems", "ext:ems_sigmatec": "ext:sigmatec_ems",
    "ext:supabase_rest": "ext:supabase", "ext:postgrest": "ext:supabase",
    "ext:google_calendar_api": "ext:google_calendar", "ext:gcal": "ext:google_calendar",
    "ext:whisper_server": "ext:whisper", "ext:whisper_local": "ext:whisper",
    "ext:self_hosted_whisper": "ext:whisper",
    "ext:apps_script": "ext:apps_script", "ext:google_apps_script": "ext:apps_script",
    "ext:appsscript": "ext:apps_script",
    "ext:github_graphql": "ext:github", "ext:github_api": "ext:github",
}
ext_folded = 0
for nid in list(nodes):
    if nid.startswith("ext:"):
        low = nid.lower()
        tgt = EXT_ALIAS.get(low, low)
        if tgt != nid:
            if tgt not in nodes:
                nodes[tgt] = dict(nodes[nid], id=tgt)
            alias[nid] = tgt
            ext_folded += 1
log.append(f"external-service ids folded: {ext_folded}")


# (a) file entities: "07-orders.js", "js/src/07-orders.js", "Module: js/src/07-orders.js"
# Merge on basename ONLY where the basename is unique in the project. Five edge
# functions are all named index.ts; merging them collapsed the whole backend into
# one node, so ambiguous basenames merge on full path instead.
# "07-orders.js", "Module: js/src/07-orders.js", "Supabase edge function: push-send/index.ts"
FILE_RE = re.compile(r"^(?:[\w\s\-]{1,40}:\s*)?([\w\-./]+\.(?:js|mjs|ts|sql|md|html))$")
real_files = defaultdict(set)
for p in ROOT.rglob("*"):
    if p.is_file() and p.suffix in {".js", ".mjs", ".ts", ".sql", ".md", ".html"}:
        rp = p.relative_to(ROOT).as_posix()
        if "node_modules" not in rp and "/תוצרים/" not in "/" + rp:
            real_files[p.name].add(rp)
AMBIGUOUS_BASENAMES = {b for b, paths in real_files.items() if len(paths) > 1}

def resolve_ref(ref, node_src):
    """Map a file reference to the one real project path it means, or None.
    A node's label may carry a partial path ("push-send/index.ts") while its
    source_file points somewhere else entirely (the test that mentions it), so
    both are tried against the real file list."""
    base = Path(ref).name
    cands = real_files.get(base, set())
    if not cands:
        return None
    if len(cands) == 1:
        return next(iter(cands))
    if "/" in ref:
        m = [c for c in cands if c.endswith(ref)]
        if len(m) == 1:
            return m[0]
    ns = (node_src or "").replace("\\", "/")
    return ns if ns in cands else None


by_file = defaultdict(list)
for nid, n in nodes.items():
    m = FILE_RE.match(n.get("label", "").strip())
    if not m:
        continue
    key = resolve_ref(m.group(1), n.get("source_file"))
    if key:
        by_file[key].append(nid)

merged_files = 0
for key, ids in by_file.items():
    if len(ids) < 2:
        continue
    keep = next((i for i in ids if i in ast_ids), ids[0])
    for i in ids:
        if i != keep:
            alias[i] = keep
            merged_files += 1
    # ambiguous basenames keep a path so the five index.ts stay distinguishable
    nodes[keep]["label"] = "/".join(key.split("/")[-2:]) \
        if Path(key).name in AMBIGUOUS_BASENAMES else Path(key).name
    nodes[keep]["source_file"] = key
log.append(f"duplicate file nodes merged: {merged_files} into {sum(1 for v in by_file.values() if len(v) > 1)} canonical files")

# Five nodes all labelled "index.ts" are unreadable - give ambiguous basenames a
# disambiguating path label.
relabelled = 0
for nid, n in nodes.items():
    lab_ = (n.get("label") or "").strip()
    if lab_ in AMBIGUOUS_BASENAMES:
        sfp = (n.get("source_file") or "").replace("\\", "/")
        if sfp.endswith(lab_):
            n["label"] = "/".join(sfp.split("/")[-2:])
            relabelled += 1
log.append(f"ambiguous file labels disambiguated (index.ts -> push-send/index.ts): {relabelled}")

# (b) function twins: identical single "name()" label in the same source file
by_fn = defaultdict(list)
for nid, n in nodes.items():
    m = re.fullmatch(r"([A-Za-z_$][\w$]*)\(\)", n.get("label", "").strip())
    if m:
        by_fn[(m.group(1), n.get("source_file"))].append(nid)

merged_fns = 0
for key, ids in by_fn.items():
    if len(ids) < 2:
        continue
    keep = next((i for i in ids if i in ast_ids), ids[0])
    for i in ids:
        if i != keep:
            alias[i] = keep
            merged_fns += 1
log.append(f"AST/LLM function twins merged: {merged_fns}")

# (c) table entities: canonical table:<name> node, existing table nodes folded in
# Derived, not hardcoded: every `create table` in db/*.sql plus every table:<name>
# an agent emitted. A fixed list silently missed the ~25 tables added in 2.x.
_BASE_TABLES = {
    "tasks", "visits", "orders", "movements", "requirements", "returns", "attendance",
    "settings", "potentials", "regions", "ems_cache", "ems_queue", "delivery_certs",
    "kibbutz_details", "site_contacts", "dev_status_log", "parse_corrections",
    "push_log", "push_subscriptions", "messages", "meter_burns", "generators", "products",
}
# (F) keep the schema: `private.push_config` must not become a table called `private`.
_CREATE = re.compile(r"create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\"?(\w+)\"?\.)?\"?([a-z_][a-z0-9_]*)",
                     re.IGNORECASE)
_schema_tables = set()
_private_alias = {}
for _p in ROOT.glob("db/*.sql"):
    for _schema, _name in _CREATE.findall(_p.read_text(encoding="utf-8", errors="ignore")):
        _schema, _name = _schema.lower(), _name.lower()
        if _schema and _schema != "public":
            _schema_tables.add(f"{_schema}.{_name}")
            _private_alias[_name] = f"{_schema}.{_name}"
        else:
            _schema_tables.add(_name)
for _bare, _full in _private_alias.items():          # agents wrote table:push_config
    if f"table:{_bare}" in nodes and _bare not in _schema_tables:
        alias[f"table:{_bare}"] = f"table:{_full}"
        nodes.setdefault(f"table:{_full}", dict(nodes[f"table:{_bare}"], id=f"table:{_full}"))
nodes.pop("table:private", None)

# (G) An agent-emitted table counts only if the schema defines it or code hits it
# directly. Otherwise it is a migration file name or a column -> demote to concept.
_code_text = "\n".join(p.read_text(encoding="utf-8", errors="ignore")
                       for g in ("js/src/*.js", "app/src/**/*.ts", "app/src/**/*.tsx",
                                 "supabase/functions/**/*.ts")
                       for p in ROOT.glob(g))
_agent_tables, _demoted = set(), 0
for nid in list(nodes):
    if not nid.startswith("table:") or nid in alias:
        continue
    t = nid[6:]
    if t in _schema_tables or t in _BASE_TABLES:
        _agent_tables.add(t)
    elif re.search(r"rest/v1/" + re.escape(t) + r"\b|\.from\(['\"]" + re.escape(t) + r"['\"]", _code_text):
        _agent_tables.add(t)
    else:
        cid = f"concept:{t}@db"
        nodes.setdefault(cid, dict(nodes[nid], id=cid, label=f"{t} (not a real table)"))
        alias[nid] = cid
        _demoted += 1
TABLES = sorted(t for t in (_BASE_TABLES | _schema_tables | _agent_tables) if "." not in t)
log.append(f"tables known: {len(TABLES)} ({len(_schema_tables)} from CREATE TABLE); "
           f"{_demoted} agent 'tables' demoted to concepts (no schema, no code hit)")
TABLE_LABEL = re.compile(
    r"^(?:DB\s+table:\s*)?(" + "|".join(TABLES) + r")(?:\s+table)?(?:\s*\(.*\))?$",
    re.IGNORECASE,
)
by_table = defaultdict(list)
for nid, n in nodes.items():
    m = TABLE_LABEL.match(n.get("label", "").strip())
    if m:
        by_table[m.group(1).lower()].append(nid)

# Create a canonical node for EVERY known table, not only those an agent happened
# to label - otherwise real REST calls to e.g. `messages` have nothing to point at.
for t in TABLES:
    cid = f"table:{t}"
    if cid in nodes:                      # an agent already emitted the canonical id
        nodes[cid]["label"] = f"{t} (table)"
    else:
        nodes[cid] = {
            "id": cid, "label": f"{t} (table)", "file_type": "code",
            "source_file": "db/supabase_schema.sql", "source_location": None,
        }
    for i in by_table.get(t, []):
        if i != cid:                      # never alias a node to itself
            alias[i] = cid
log.append(f"canonical table entities: {len(TABLES)} ({len(by_table)} had existing nodes folded in)")

# apply aliases
for e in edges:
    e["source"] = canon(e["source"])
    e["target"] = canon(e["target"])
for h in hyper:
    h["nodes"] = [canon(x) for x in h["nodes"]]
for old in list(alias):
    nodes.pop(old, None)

# Docs had no file-entity node at all, so nothing could link to them. Create one
# per doc and hang its concept nodes off it.
doc_hosts = 0
by_src = defaultdict(list)
for nid, n in nodes.items():
    sf = n.get("source_file") or ""
    if sf.endswith(".md"):
        by_src[sf].append(nid)
for sf, members in by_src.items():
    base = Path(sf).name
    if any(nodes[m].get("label") == base for m in members):
        continue
    cid = f"file:{sf}"
    nodes[cid] = {"id": cid, "label": base, "file_type": "document",
                  "source_file": sf, "source_location": None}
    for m in members:
        edges.append({"source": cid, "target": m, "relation": "contains",
                      "confidence": "EXTRACTED", "confidence_score": 1.0,
                      "source_file": sf, "source_location": None, "weight": 1.0})
    doc_hosts += 1
log.append(f"doc file-entity nodes created: {doc_hosts}")

# ---------------------------------------------------------------- audit fix 2
# Cross-layer linking pass, deterministic. This is what makes it a graph.
_FILE_IDX = None


def _build_file_index():
    # Built once. The old version rescanned all ~4k nodes on every call (~3k calls),
    # which is what pushed the repair pass past two minutes on the 2.23 corpus.
    by_path, by_base_src, by_base = {}, {}, {}
    for nid, n in nodes.items():
        sfp = (n.get("source_file") or "").replace("\\", "/")
        lab_ = n.get("label") or ""
        if sfp and lab_.endswith(Path(sfp).name):
            by_path.setdefault(sfp, nid)
        if sfp.endswith(lab_) and lab_:
            by_base_src.setdefault(lab_, nid)
        by_base.setdefault(lab_, nid)
    return by_path, by_base_src, by_base


def node_for_file(relpath):
    """Resolve a file to its node. Path-aware: five edge functions share the
    basename index.ts, so a basename-only match would pick an arbitrary one."""
    global _FILE_IDX
    if _FILE_IDX is None:
        _FILE_IDX = _build_file_index()
    by_path, by_base_src, by_base = _FILE_IDX
    relpath = relpath.replace("\\", "/")
    base = Path(relpath).name
    # exact path match first; the label may be "index.ts" or "push-send/index.ts"
    if relpath in by_path:
        return by_path[relpath]
    if base in AMBIGUOUS_BASENAMES:
        return None
    return by_base_src.get(base) or by_base.get(base)


def add(src, tgt, rel, conf, score, sfile, loc):
    if src and tgt and src in nodes and tgt in nodes and src != tgt:
        edges.append({
            "source": src, "target": tgt, "relation": rel, "confidence": conf,
            "confidence_score": score, "source_file": sfile,
            "source_location": loc, "weight": 1.0,
        })
        return 1
    return 0


# (B) the React app is half the client; (C) db/*.sql so pg_cron `net.http_post ...
# functions/v1/<fn>` calls link too; every edge-function file, not just index.ts.
CODE_GLOBS = ["js/src/*.js", "sw.js", "index.html", "maintenance.html",
              "app/src/**/*.ts", "app/src/**/*.tsx",
              "supabase/functions/**/*.ts", "test-*.mjs", "db/*.mjs", "db/*.sql"]
code_files = sorted({p for g in CODE_GLOBS for p in ROOT.glob(g)
                     if "node_modules" not in p.parts})

n_tbl = n_fn = 0
EDGE_FNS = sorted(p.parent.name for p in ROOT.glob("supabase/functions/*/index.ts"))  # (C) was 5 hardcoded
for p in code_files:
    rel = p.relative_to(ROOT).as_posix()
    src = node_for_file(rel)
    if not src:
        continue
    try:
        text = p.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        continue
    lines = text.splitlines()
    # A bare quoted 'orders' also matches UI tab ids, router keys and CSS classes -
    # 12% of these were false. Require a data-access context on the same line.
    ACCESS = re.compile(r"rest/v1|SHEET_API|supabase|\.from\(|sbUpsert|sbInsert|"
                        r"sbSelect|_sb\w*Get|fetch\(|table|sheet=|PostgREST", re.IGNORECASE)
    for t in TABLES:
        # PostgREST calls appear as '<table>?select=...' - the query suffix meant the
        # plain quoted-name pattern missed them entirely (site_contacts, messages).
        hard = re.compile(r"/rest/v1/" + t + r"\b|\.from\(['\"]" + t + r"['\"]"
                          r"|_sb\w*Get\(['\"]" + t + r"[?'\"]|['\"]" + t + r"\?(?:select|id|kibbutz)")
        soft = re.compile(r"['\"]" + t + r"['\"]")
        hit = next((i + 1 for i, l in enumerate(lines) if hard.search(l)), None)
        if hit:
            n_tbl += add(src, f"table:{t}", "reads_writes", "EXTRACTED", 1.0, rel, f"L{hit}")
            continue
        hit = next((i + 1 for i, l in enumerate(lines)
                    if soft.search(l) and ACCESS.search(l)), None)
        if hit:   # heuristic match - not certainty
            n_tbl += add(src, f"table:{t}", "reads_writes", "INFERRED", 0.7, rel, f"L{hit}")
    for fn in EDGE_FNS:
        pat = re.compile(r"functions/v1/" + fn + r"\b")
        hit = next((i + 1 for i, l in enumerate(lines) if pat.search(l)), None)
        if hit:
            tgt = node_for_file(f"supabase/functions/{fn}/index.ts")
            n_fn += add(src, tgt, "calls", "EXTRACTED", 1.0, rel, f"L{hit}")
log.append(f"cross-layer edges added: client/test -> table {n_tbl}, client -> edge-function {n_fn}")

# tests -> code: a suite that names a module covers it. Without this the graph
# reports modules as untested when their suite references them by filename.
n_test = n_tref = 0
FILEREF = re.compile(r"\b([\w\-]+\.(?:js|mjs|ts|tsx|sql))\b")
# (J) a filename in a comment is not coverage. Count `tests` only where the suite
# actually loads the file; any other mention is a plain `references`.
LOADS = re.compile(r"readFileSync|\bread\(|\bimport\b|require\(|new URL\(|loadModule|\bvm\.")
for p in ROOT.glob("test-*.mjs"):
    rel = p.relative_to(ROOT).as_posix()
    src = node_for_file(rel)
    if not src:
        continue
    seen = {}
    for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines()):
        if line.strip().startswith(("//", "*", "/*")):
            continue
        loads = bool(LOADS.search(line))
        for m in FILEREF.finditer(line):
            prev = seen.get(m.group(1))
            if prev is None or (loads and not prev[1]):
                seen[m.group(1)] = (i + 1, loads)
    for base, (ln, loads) in seen.items():
        tgt = node_for_file(base)
        if tgt and tgt != src:
            if loads:
                n_test += add(src, tgt, "tests", "EXTRACTED", 1.0, rel, f"L{ln}")
            else:
                n_tref += add(src, tgt, "references", "INFERRED", 0.6, rel, f"L{ln}")

# vitest suites in the React app: `foo.test.ts` tests its sibling, plus what it imports.
IMPORT = re.compile(r"""from\s+['"](\.{1,2}/[^'"]+)['"]""")
_RROOT = ROOT.resolve()
for p in list(ROOT.glob("app/src/**/*.test.ts")) + list(ROOT.glob("app/src/**/*.test.tsx")):
    rel = p.relative_to(ROOT).as_posix()
    src = node_for_file(rel)
    if not src:
        continue
    targets = {}
    stem = p.name.split(".test.")[0]
    for ext in (".ts", ".tsx"):
        sib = p.with_name(stem + ext)
        if sib.exists():
            targets[sib.relative_to(ROOT).as_posix()] = 1
    for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines()):
        for m in IMPORT.finditer(line):
            base = (p.parent / m.group(1)).resolve()
            for ext in ("", ".ts", ".tsx", "/index.ts", "/index.tsx"):
                cand = Path(str(base) + ext)
                if cand.is_file():
                    targets.setdefault(cand.relative_to(_RROOT).as_posix(), i + 1)
                    break
    for tp, ln in targets.items():
        tgt = node_for_file(tp)
        if tgt and tgt != src:
            n_test += add(src, tgt, "tests", "EXTRACTED", 1.0, rel, f"L{ln}")
log.append(f"test -> module edges added: {n_test} (+{n_tref} mere mentions kept as references)")

# docs -> code: a doc that names a source file documents it
n_doc = 0
doc_files = list(ROOT.glob("docs/**/*.md")) + list(ROOT.glob("superpowers/**/*.md")) + \
            [ROOT / "CLAUDE.md", ROOT / "README.md", ROOT / "UPCOMING.md"]
for p in doc_files:
    if not p.exists():
        continue
    rel = p.relative_to(ROOT).as_posix()
    src = node_for_file(rel)
    if not src:
        continue
    seen = {}
    for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines()):
        for m in FILEREF.finditer(line):
            seen.setdefault(m.group(1), i + 1)
    for base, ln in seen.items():
        tgt = node_for_file(base)
        if tgt and tgt != src:
            n_doc += add(src, tgt, "documents", "EXTRACTED", 1.0, rel, f"L{ln}")
log.append(f"docs -> code edges added: {n_doc}")

# concept -> code entity: an LLM concept node names the functions/constants it
# covers ("approveOrder() approval router", "CATEGORIES card-category config").
# Link it to the AST node for each named entity in the same file, otherwise those
# concept nodes float free.
n_grp = 0
ent_index = {}
for nid, n in nodes.items():
    if nid not in ast_ids:
        continue
    m = re.fullmatch(r"([A-Za-z_$][\w$]*)(?:\(\))?", n.get("label", "").strip())
    if m:
        ent_index[(m.group(1), n.get("source_file"))] = nid
for nid, n in list(nodes.items()):
    if nid in ast_ids:
        continue
    names = set(re.findall(r"([A-Za-z_$][\w$]*)\(\)", n.get("label", "")))
    lead = re.match(r"^(?:window\.)?([A-Za-z_$][\w$]*)\b", n.get("label", "").strip())
    if lead:
        names.add(lead.group(1))
    for nm in names:
        tgt = ent_index.get((nm, n.get("source_file")))
        if tgt and tgt != nid:
            n_grp += add(nid, tgt, "groups", "EXTRACTED", 1.0, n.get("source_file"), None)
log.append(f"concept -> code entity grouping edges added: {n_grp}")

# (K1) window globals fired from inline / generated onclick="fn(...)" are invisible to
# the AST. Link the file that carries the handler to the function it calls.
fn_by_name = {}
for nid, n in nodes.items():
    if nid in ast_ids:
        m = re.fullmatch(r"([A-Za-z_$][\w$]*)\(\)", (n.get("label") or "").strip())
        sfp = (n.get("source_file") or "").replace("\\", "/")
        if m and sfp.startswith("js/src/"):
            fn_by_name.setdefault(m.group(1), nid)
ONCLICK = re.compile(r"""\bon[a-z]+\s*=\s*\\?["']\s*(?:window\.)?([A-Za-z_$][\w$]*)\s*\(""")
n_click = 0
for p in [ROOT / "index.html"] + sorted(ROOT.glob("js/src/*.js")):
    if not p.exists():
        continue
    rel = p.relative_to(ROOT).as_posix()
    src = node_for_file(rel)
    done = set()
    for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines()):
        for m in ONCLICK.finditer(line):
            tgt = fn_by_name.get(m.group(1))
            if tgt and (src, tgt) not in done:
                done.add((src, tgt))
                n_click += add(src, tgt, "calls", "EXTRACTED", 1.0, rel, f"L{i + 1}")
log.append(f"inline-handler calls linked (onclick=\"fn()\"): {n_click}")

# (K2) any node still at degree 0 whose source file has a node gets `contains` from
# it - otherwise index.html modals and doc concepts float as fake orphans.
_deg = defaultdict(int)
for e in edges:
    _deg[canon(e["source"])] += 1
    _deg[canon(e["target"])] += 1
n_host = 0
for nid, n in list(nodes.items()):
    if nid in alias or _deg[nid]:
        continue
    sfp = (n.get("source_file") or "").replace("\\", "/")
    host = node_for_file(sfp) if sfp else None
    if host and host != nid:
        n_host += add(host, nid, "contains", "EXTRACTED", 1.0, sfp, n.get("source_location"))
log.append(f"orphans attached to their source file: {n_host}")

# (L) A policy redefined across migrations kept the label of its FIRST definition,
# so superseded "public read" text read as current. Labels state no permission;
# they list every migration that defines the policy instead.
POLICY_DEF = re.compile(r"""create\s+policy\s+["']?([\w\- ]+?)["']?\s+on\s+(?:public\.)?["']?(\w+)""",
                        re.IGNORECASE)
_pdefs = defaultdict(list)
for _p in sorted(ROOT.glob("db/*.sql")):
    for pname, ptable in POLICY_DEF.findall(_p.read_text(encoding="utf-8", errors="ignore")):
        _pdefs[pname.strip().lower()].append((_p.name, ptable.lower()))
n_pol = 0
for nid, n in nodes.items():
    if nid.startswith("policy:"):
        key = nid[7:].strip().lower()
        defs = _pdefs.get(key)
        if defs:
            files = sorted({f for f, _ in defs})
            n["description"] = n.get("label", "")
            n["label"] = (f"{nid[7:]} on {defs[-1][1]} — defined in {len(files)} "
                          f"migration(s): {', '.join(files)}")
            n_pol += 1
log.append(f"policy labels rebuilt from their definitions (no stale permission claims): {n_pol}")

# ------------------------------------------------------------------- finalise
ids = set(nodes)
edges = [e for e in edges if e["source"] in ids and e["target"] in ids]
hyper = [h for h in hyper if all(x in ids for x in h["nodes"])]
seen = set()
uniq = []
for e in edges:
    k = (e["source"], e["target"], e.get("relation"))
    if k not in seen:
        seen.add(k)
        uniq.append(e)
log.append(f"parallel duplicate edges collapsed: {len(edges) - len(uniq)}")

out = {"nodes": list(nodes.values()), "edges": uniq, "hyperedges": hyper,
       "input_tokens": ex.get("input_tokens", 0), "output_tokens": ex.get("output_tokens", 0)}
Path(".graphify_extract_fixed.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")

for line in log:
    print(" -", line)
print(f"\nFIXED: {len(out['nodes'])} nodes, {len(uniq)} edges (was {len(ex['nodes'])} / {len(ex['edges'])})")

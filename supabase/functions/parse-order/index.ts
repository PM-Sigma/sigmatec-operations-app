// Supabase Edge Function: parse-order
// Free-text (email / WhatsApp) → catalog item list, via Gemini (free tier). EMS-login-gated.
// LEARNS: feeds the most recent rows from `parse_corrections` (real text→items the team accepted)
// as few-shot examples, so accuracy improves with use — no model training.
//
// Secrets to set (Edge Functions → Secrets):
//   GEMINI_API_KEY — required. Free key from https://aistudio.google.com (any Google account).
//   EMS_API_BASE   — optional (defaults to https://api.sigmatec-ems.com) — used to gate by EMS login.
//   GEMINI_MODEL   — optional (defaults to gemini-2.0-flash).
//   APP_ORIGIN     — optional (defaults to https://pm-sigma.github.io).
// GRACEFUL: no key → 503 {error}; any failure → {error} — the client then falls back to its
// deterministic local matcher, so order intake never breaks.
const SB_URL = "https://wwqfcajnxinaxmobrgol.supabase.co";
const SB_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3cWZjYWpueGluYXhtb2JyZ29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwOTM3MTcsImV4cCI6MjA5NzY2OTcxN30.4kaIyZ1WbkHDHCfa-1iXAqDdgJOQqK_cUomvELLT7u4";

const cors = (o: string) => ({
  "Access-Control-Allow-Origin": o,
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const json = (b: unknown, s = 200, o = "*") =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors(o), "Content-Type": "application/json" } });

async function fetchT(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ac.signal }); }
  finally { clearTimeout(id); }
}
async function emsValid(base: string, token: string): Promise<boolean> {
  if (!token) return false;
  try { const r = await fetchT(base + "/v1/employee-tasks?take=1", { headers: { Authorization: "Bearer " + token } }, 8000); return r.ok; }
  catch { return false; }
}

// Curated business aliases — authoritative term→product rules, ALWAYS applied. Add new ones here.
const ALIASES: { when: string; product: string }[] = [
  { when: '"133" / מונה 133 / סאטק', product: "מונה EM133" },
  { when: "מונה לנדיס ללא וריאנט (ברירת מחדל)", product: "מונה E360PP" },
  { when: "מונה לנדיס ישיר לקו", product: "מונה E360PP" },
  { when: "מונה לנדיס חד פאזי", product: "מונה E360SP" },
  { when: 'מונה לנדיס משנה-זרם / מונה משנ"ז', product: "מונה E360CT" },
];

function buildPrompt(catalog: string[], examples: any[], text: string): string {
  const cat = catalog.map((c) => "- " + c).join("\n");
  const glossary = ALIASES.map((a) => "- " + a.when + " ⟵ " + a.product).join("\n");
  let ex = "";
  for (const e of examples) {
    const items = Array.isArray(e?.items) ? e.items : [];
    if (!e?.raw_text || !items.length) continue;
    ex += "\nטקסט: " + String(e.raw_text).replace(/\s+/g, " ").slice(0, 300) +
          "\nפריטים: " + JSON.stringify({ items: items.map((i: any) => ({ name: i.name, qty: i.qty })) }) + "\n";
  }
  return [
    "אתה מנתח בקשות הזמנה לחברת מוני אנרגיה ישראלית. המר את טקסט הבקשה (עברית) לרשימת פריטים מהקטלוג בלבד.",
    "כללים: לכל פריט מבוקש בחר את השם המדויק הקרוב ביותר מהקטלוג (העתק את המחרוזת בדיוק). חלץ כמויות (כולל מילים בעברית כמו \"שלושה\"). אם אין כמות — 1. התעלם מטקסט שאינו מוצר. אל תמציא מוצרים שלא בקטלוג.",
    "מילון מונחים מחייב — כשמופיע הביטוי, מַפֶּה למוצר המדויק (גובר על ניחוש):\n" + glossary +
      "\nלנדיס: 'מונה לנדיס' ללא פירוט וריאנט → ברירת מחדל מונה E360PP. לבקשה גנרית אחת אל תחזיר כמה סוגי מונים — בחר אחד בלבד." +
      "\nמשנ\\\"ז: עם המילה 'מונה' ('מונה משנ\\\"ז' / 'מונה משנה-זרם') → מונה E360CT. בלי המילה 'מונה' ('משנ\\\"ז 250' וכו') → משנ\\\"ז פיזי (מוצר נפרד), לא E360CT.",
    "קטלוג:\n" + cat,
    examples.length ? "דוגמאות (תיקונים קודמים שאושרו — למד מהם את המיפוי):" + ex : "",
    "כעת נתח את הטקסט הבא והחזר JSON בלבד בפורמט {\"items\":[{\"name\":\"<שם מהקטלוג>\",\"qty\":<מספר>}]}:",
    "טקסט: " + text,
  ].filter(Boolean).join("\n\n");
}

const SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, qty: { type: "integer" } }, required: ["name", "qty"] } } },
  required: ["items"],
};

Deno.serve(async (req) => {
  const ORIGIN = Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY not set" }, 503, ORIGIN);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (!(await emsValid(EMS_API_BASE, body.token))) return json({ error: "unauthorized: valid EMS login required" }, 401, ORIGIN);

  const text = String(body.text || "").slice(0, 4000).trim();
  const catalog = Array.isArray(body.catalog) ? body.catalog.map(String).slice(0, 300) : [];
  if (!text) return json({ items: [] }, 200, ORIGIN);

  // few-shot: recent accepted text→items pairs (graceful if the table/policy isn't there yet)
  let examples: any[] = [];
  try {
    const r = await fetchT(SB_URL + "/rest/v1/parse_corrections?select=raw_text,items&order=created_at.desc&limit=15",
      { headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON } }, 6000);
    if (r.ok) examples = await r.json();
  } catch { /* no examples yet */ }

  try {
    const gr = await fetchT(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + GEMINI_API_KEY,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(catalog, examples, text) }] }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA } }) },
      15000,
    );
    const gd = await gr.json();
    if (!gr.ok) return json({ error: "gemini " + gr.status, detail: JSON.stringify(gd).slice(0, 200) }, 502, ORIGIN);
    const out = gd?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = JSON.parse(out);
    const items = (parsed.items || []).filter((it: any) => it && it.name).map((it: any) => ({ name: String(it.name), qty: parseInt(it.qty) || 1 }));
    return json({ items, learned: examples.length }, 200, ORIGIN);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500, ORIGIN);
  }
});

// Supabase Edge Function: parse-order
// Free-text (email / WhatsApp) → catalog item list, via a PROVIDER CHAIN (Gemini → Groq). EMS-login-gated.
// The first provider that returns a valid (non-error) answer wins, so no single provider's quota can block us.
// LEARNS: feeds recent rows from `parse_corrections` (real text→items the team accepted) as few-shot examples.
//
// Secrets (Edge Functions → Secrets) — set at least ONE AI key:
//   GEMINI_API_KEY — free key from https://aistudio.google.com (any Google account).
//   GROQ_API_KEY   — free key from https://console.groq.com.
//   GEMINI_MODEL   — optional (default gemini-2.5-flash-lite — 1.5 is retired/404). GROQ_MODEL — default llama-3.3-70b-versatile.
//   EMS_API_BASE   — optional (defaults to https://api.sigmatec-ems.com) — gate by EMS login.
//   APP_ORIGIN     — optional (defaults to https://pm-sigma.github.io).
// GRACEFUL: no key → 503; all providers fail → 502 {error} — the client then falls back to its local matcher.
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
  { when: '"133" / מונה 133 / EM133 / סאטק תלת-פאזי רגיל', product: "מונה EM133" },
  { when: "מונה לנדיס ללא וריאנט (ברירת מחדל)", product: "מונה E360PP" },
  { when: "מונה לנדיס ישיר לקו", product: "מונה E360PP" },
  { when: "מונה לנדיס חד פאזי", product: "מונה E360SP" },
  { when: 'מונה לנדיס משנה-זרם / מונה משנ"ז', product: "מונה E360CT" },
  { when: "קרלו / Carlo / E341 / קרלו גאווקי / ישיר לקו קרלו", product: "מונה Carlo Gavachi E341" },
  { when: "PM135 / סאטק שנאי / מונה שנאי / מונה מקביל לחשמל / סאטק משני זרם / 135 (שנאי)", product: "מונה PM135" },
  { when: "בקר PURS / PURS / בקר אסיק / בקר למונה ASIC", product: "בקר PURS" },
  { when: "בקר ROBUSTEL / ROBUSTEL / רובסטל / בקר סאטק", product: "בקר ROBUSTEL" },
  { when: "סים פרטנר / SIM פרטנר / סים / כרטיס סים / SIM", product: "סים פרטנר" },
];

function buildPrompt(catalog: string[], examples: any[], text: string, orderType = "supplier"): string {
  const cat = catalog.map((c) => "- " + c).join("\n");
  const glossary = ALIASES.map((a) => "- " + a.when + " ⟵ " + a.product).join("\n");
  let ex = "";
  for (const e of examples) {
    const items = Array.isArray(e?.items) ? e.items : [];
    if (!e?.raw_text || !items.length) continue;
    ex += "\nטקסט: " + String(e.raw_text).replace(/\s+/g, " ").slice(0, 300) +
          "\nפריטים: " + JSON.stringify({ items: items.map((i: any) => ({ name: i.name, qty: i.qty })) }) + "\n";
  }
  const autoAddNote = orderType === "customer"
    ? "הזמנת לקוח — הוסף אוטומטית לפריטים (אלא אם הוזכרו כבר). הכלל: סים אחד לכל נקודת תקשורת; אנטנה אחת לכל בקר.\n" +
      '• מוני לנדיס (E360PP/SP/CT) ומוני קרלו (E341) — תקשורת מובנית → "סים פרטנר" ×1 לכל מונה\n' +
      '• מוני SATEC (EM133 / PM135) — מתקשרים דרך בקר → "בקר Robustel" ×1 לכל מונה\n' +
      '• כל בקר (PUSR למוני ASIC, וגם Robustel) — הוסף "סים פרטנר" ×1 וגם "אנטנה" ×1 לכל בקר\n' +
      '• אל תוסיף סים נפרד למוני SATEC עצמם — הסים שלהם נמצא בבקר ה-Robustel\n' +
      '• משנ"ז פיזי (ללא המילה "מונה", כגון "משנ"ז 250") — ציוד חשמלי, לא מונה → אין סים/אנטנה\n' +
      "• אם המשתמש ציין סים/בקר/אנטנה במפורש — אל תכפיל, עדכן כמות לסכום הנדרש"
    : "הזמנת ספק — אל תוסיף פריטים שלא הוזכרו מפורשות בטקסט.";
  return [
    "אתה מנתח בקשות הזמנה לחברת מוני אנרגיה ישראלית. המר את טקסט הבקשה (עברית) לרשימת פריטים מהקטלוג בלבד.",
    "כללים: לכל פריט מבוקש בחר את השם המדויק הקרוב ביותר מהקטלוג (העתק את המחרוזת בדיוק). חלץ כמויות (כולל מילים בעברית כמו \"שלושה\"). אם אין כמות — 1. התעלם מטקסט שאינו מוצר. אל תמציא מוצרים שלא בקטלוג.",
    "מילון מונחים מחייב — כשמופיע הביטוי, מַפֶּה למוצר המדויק (גובר על ניחוש):\n" + glossary +
      "\nלנדיס: 'מונה לנדיס' ללא פירוט וריאנט → ברירת מחדל מונה E360PP. לבקשה גנרית אחת אל תחזיר כמה סוגי מונים — בחר אחד בלבד." +
      "\nמשנ\\\"ז: עם המילה 'מונה' ('מונה משנ\\\"ז' / 'מונה משנה-זרם') → מונה E360CT. בלי המילה 'מונה' ('משנ\\\"ז 250' וכו') → משנ\\\"ז פיזי (מוצר נפרד), לא E360CT.",
    autoAddNote,
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

function extractItems(text: string): any[] {
  const parsed = JSON.parse(text || "{}");
  return (parsed.items || []).filter((it: any) => it && it.name).map((it: any) => ({ name: String(it.name), qty: parseInt(it.qty) || 1 }));
}

// --- providers: each returns an items[] or throws on error ---
async function callGemini(key: string, model: string, prompt: string): Promise<any[]> {
  const r = await fetchT(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA } }) },
    15000);
  const d = await r.json();
  if (!r.ok) throw new Error("gemini " + r.status + " " + String(d?.error?.message || JSON.stringify(d)).slice(0, 140));
  return extractItems(d?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
}
async function callGroq(key: string, model: string, prompt: string): Promise<any[]> {
  const r = await fetchT(
    "https://api.groq.com/openai/v1/chat/completions",
    { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }] }) },
    15000);
  const d = await r.json();
  if (!r.ok) throw new Error("groq " + r.status + " " + String(d?.error?.message || JSON.stringify(d)).slice(0, 140));
  return extractItems(d?.choices?.[0]?.message?.content || "{}");
}

Deno.serve(async (req) => {
  const ORIGIN = Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash-lite";   // confirmed working for our key
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
  const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  if (!GEMINI_API_KEY && !GROQ_API_KEY) return json({ error: "no AI key set (GEMINI_API_KEY or GROQ_API_KEY)" }, 503, ORIGIN);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (!(await emsValid(EMS_API_BASE, body.token))) return json({ error: "unauthorized: valid EMS login required" }, 401, ORIGIN);

  const text = String(body.text || "").slice(0, 4000).trim();
  const catalog = Array.isArray(body.catalog) ? body.catalog.map(String).slice(0, 300) : [];
  const orderType = String(body.orderType || "supplier");
  if (!text) return json({ items: [] }, 200, ORIGIN);

  // few-shot: recent accepted text→items pairs (graceful if the table/policy isn't there yet)
  let examples: any[] = [];
  try {
    const r = await fetchT(SB_URL + "/rest/v1/parse_corrections?select=raw_text,items&order=created_at.desc&limit=15",
      { headers: { apikey: SB_ANON, Authorization: "Bearer " + SB_ANON } }, 6000);
    if (r.ok) examples = await r.json();
  } catch { /* no examples yet */ }

  const prompt = buildPrompt(catalog, examples, text, orderType);
  const providers: { name: string; run: () => Promise<any[]> }[] = [];
  if (GEMINI_API_KEY) providers.push({ name: "gemini:" + GEMINI_MODEL, run: () => callGemini(GEMINI_API_KEY, GEMINI_MODEL, prompt) });
  if (GROQ_API_KEY) providers.push({ name: "groq:" + GROQ_MODEL, run: () => callGroq(GROQ_API_KEY, GROQ_MODEL, prompt) });

  const errors: string[] = [];
  let emptyOk: { items: any[]; provider: string } | null = null;
  for (const p of providers) {
    try {
      const items = await p.run();
      if (items.length > 0) return json({ items, provider: p.name, learned: examples.length }, 200, ORIGIN);
      if (!emptyOk) emptyOk = { items, provider: p.name };   // valid but empty — keep, try the next for something better
    } catch (e) { errors.push((e as Error).message); }
  }
  if (emptyOk) return json({ items: emptyOk.items, provider: emptyOk.provider, learned: examples.length }, 200, ORIGIN);
  return json({ error: "all AI providers failed", detail: errors.join(" | ") }, 502, ORIGIN);
});

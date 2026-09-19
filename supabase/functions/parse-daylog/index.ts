// Supabase Edge Function: parse-daylog  (spec §7i, Part L)
// A field worker's free-text / dictated day → one visit summary per kibbutz, via the SAME
// PROVIDER CHAIN as `parse-order` (Gemini → Groq, first valid answer wins). EMS-login-gated.
//
// Grounding, sent by the client on every call so the model cannot invent: the kibbutz names,
// the product catalog (technical names), today's open EMS tasks (id + title), and today's date.
//
// NOTHING IS STORED SERVER-SIDE. The day log itself is never written anywhere — it is a
// person's rough notes, and the app's job is to turn them into a visit he confirms, not to
// keep a copy. The single row this feature writes is a `daylog_corrections` row, and only
// when the user EDITED what the model returned: {before, after} plus the raw text's LENGTH,
// never the raw text. Those rows come back as few-shot examples, the way parse-order learns.
//
// Secrets (reused from parse-order — set at least one): GEMINI_API_KEY / GROQ_API_KEY,
//   GEMINI_MODEL (default gemini-2.5-flash-lite) · GROQ_MODEL (default llama-3.1-8b-instant)
//   EMS_API_BASE (default https://api.sigmatec-ems.com) · APP_ORIGIN.
// GRACEFUL: no key → 503; all providers fail → 502 {error} — the island then tells the person
// to write the visit himself rather than pretending it parsed.
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

// ─── the prompt ───────────────────────────────────────────────────────────────
// The body below is the file `supabase/functions/parse-daylog/prompt.md` (everything after its
// `---`). It is INLINED because an Edge Function ships one module and reading the file per
// request would cost a round trip on every call. `test-daylog.mjs` fails if the two drift.
const PROMPT = `אתה מנתח יומן עבודה יומי של טכנאי שטח בחברת מוני אנרגיה ישראלית. העובד כתב או הקליט במילים
שלו מה עשה היום, בלי סדר ובלי מבנה. המשימה שלך: לפצל את הטקסט לביקור אחד לכל קיבוץ, ולהחזיר
JSON בלבד.

כללים מחייבים:

1. **קיבוץ אחד = כרטיס אחד.** אם אותו קיבוץ מוזכר בכמה מקומות בטקסט — אחד ולא שניים.
2. **שמות קיבוצים — רק מהרשימה.** העתק את המחרוזת בדיוק כפי שהיא ברשימה. אם הטקסט מזכיר מקום
   שאינו ברשימה — אל תנחש ואל תבחר את הקרוב ביותר; השאר את מה שנאמר בטקסט כפי שהוא.
3. **מוצרים — רק מהקטלוג**, והעתק את שם המוצר בדיוק. כמות במספר שלם; בלי כמות → 1. מילים
   בעברית ("שלושה", "זוג") → מספר. דבר שאינו בקטלוג — אל תמציא לו שם קטלוגי.
4. summary = מה נעשה בפועל, במשפטים של העובד. open_items = רק מה שנשאר פתוח / דורש חזרה.
   אל תמציא תוכן שלא נאמר, ואל תכתוב "אין" — שדה ריק הוא תשובה תקינה.
5. **משימות EMS:** ברשימה למטה יש משימות פתוחות עם מזהה. אם משפט בטקסט מתייחס בבירור לאחת
   מהן — החזר אותה ב-task_matches עם ה-task_id **המדויק מהרשימה** והמשפט עצמו ב-text.
   לא בטוח → אל תחזיר. מזהה שאינו ברשימה ייזרק.
6. כל משפט שאינו שייך לשום קיבוץ (הערה כללית, תזכורת, בקשה להזמין ציוד) → unmatched.
7. date בפורמט YYYY-MM-DD, רק אם התאריך נאמר מפורשות; "אתמול"/"היום" מחושבים מול היום.
   workday: true רק אם נאמר שזה היה יום עבודה מלא; אחרת duration_hours אם נאמר משך.
8. החזר **JSON בלבד**, ללא טקסט נלווה.

מילון מונחים מחייב — כשמופיע הביטוי, מַפֶּה למוצר המדויק (גובר על ניחוש):

- סאטק / 133 / EM133 ⟵ Satec EM133
- מונה / מונים תלת-פאזי ללא מותג (ברירת המחדל) ⟵ מונה Landis+Gyr E360PP
- מונה לנדיס חד פאזי ⟵ מונה Landis+Gyr E360SP
- מונה משנה-זרם / מונה משנ"ז ⟵ Landis+Gyr E360CT
- קרלו / קרלו גוואצי / E341 ⟵ Carlo Gavazzi E341
- PM135 / מונה שנאי / סאטק משני זרם ⟵ Satec PM135
- בקר PUSR / בקר אסיק ⟵ PUSR Controller
- בקר Robustel / רובסטל ⟵ Robustel Controller
- סים / כרטיס סים / סים פרטנר ⟵ Partner Sim
- בקר 485 / RS485 ⟵ בקר 485
- "משנז" עם מספר (250 / 400) וללא המילה "מונה" ⟵ המוצר הפיזי מהקטלוג, לא מונה

היום: {{TODAY}}

קיבוצים:
{{KIBBUTZIM}}

קטלוג מוצרים:
{{PRODUCTS}}

משימות EMS פתוחות שלי להיום:
{{TASKS}}

{{EXAMPLES}}

פורמט התשובה:
{"visits":[{"kibbutz":"","date":"","workday":false,"duration_hours":0,"summary":"","open_items":"","items":[{"product":"","qty":1}],"task_matches":[{"task_id":"","text":""}]}],"unmatched":[""]}

הטקסט:
{{TEXT}}`;

export interface GroundTask { id: string; title: string; kibbutz?: string }

export function buildPrompt(
  args: { today: string; kibbutzim: string[]; products: string[]; tasks: GroundTask[]; examples: any[]; text: string },
): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => "- " + x).join("\n") : "- (אין)");
  const tasks = args.tasks.length
    ? args.tasks.map((t) => `- [${t.id}] ${t.title}${t.kibbutz ? " · " + t.kibbutz : ""}`).join("\n")
    : "- (אין משימות פתוחות להיום)";
  let ex = "";
  for (const e of args.examples || []) {
    const after = e?.json_after;
    if (!after) continue;
    ex += "\n" + JSON.stringify(after).slice(0, 600) + "\n";
  }
  return PROMPT
    .replace("{{TODAY}}", args.today)
    .replace("{{KIBBUTZIM}}", list(args.kibbutzim))
    .replace("{{PRODUCTS}}", list(args.products))
    .replace("{{TASKS}}", tasks)
    .replace("{{EXAMPLES}}", ex ? "דוגמאות לתשובות שאושרו בעבר (למד מהן את הסגנון והמיפוי):" + ex : "")
    .replace("{{TEXT}}", args.text);
}

// Strict JSON, enforced by the provider where the provider can enforce it (Gemini responseSchema)
// and by our own parse where it cannot (Groq json_object).
const SCHEMA = {
  type: "object",
  properties: {
    visits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kibbutz: { type: "string" },
          date: { type: "string" },
          workday: { type: "boolean" },
          duration_hours: { type: "number" },
          summary: { type: "string" },
          open_items: { type: "string" },
          items: {
            type: "array",
            items: { type: "object", properties: { product: { type: "string" }, qty: { type: "integer" } }, required: ["product", "qty"] },
          },
          task_matches: {
            type: "array",
            items: { type: "object", properties: { task_id: { type: "string" }, text: { type: "string" } }, required: ["task_id", "text"] },
          },
        },
        required: ["kibbutz", "summary"],
      },
    },
    unmatched: { type: "array", items: { type: "string" } },
  },
  required: ["visits"],
};

/** Provider text → the wire shape. Throws on anything that is not parseable JSON. */
export function extractDayLog(text: string): { visits: any[]; unmatched: string[] } {
  const parsed = JSON.parse(text || "{}");
  const visits = Array.isArray(parsed?.visits) ? parsed.visits : [];
  const rawUn = parsed?.unmatched ?? parsed?.unmatched_text ?? [];
  const unmatched = (Array.isArray(rawUn) ? rawUn : [rawUn]).map(String).map((s: string) => s.trim()).filter(Boolean);
  return { visits, unmatched };
}

async function callGemini(key: string, model: string, prompt: string) {
  const r = await fetchT(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
    },
    25000,
  );
  const d = await r.json();
  if (!r.ok) throw new Error("gemini " + r.status + " " + String(d?.error?.message || JSON.stringify(d)).slice(0, 140));
  return extractDayLog(d?.candidates?.[0]?.content?.parts?.[0]?.text || "{}");
}
async function callGroq(key: string, model: string, prompt: string) {
  const r = await fetchT(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({ model, temperature: 0.1, response_format: { type: "json_object" }, messages: [{ role: "user", content: prompt }] }),
    },
    25000,
  );
  const d = await r.json();
  if (!r.ok) throw new Error("groq " + r.status + " " + String(d?.error?.message || JSON.stringify(d)).slice(0, 140));
  return extractDayLog(d?.choices?.[0]?.message?.content || "{}");
}

Deno.serve(async (req) => {
  const APP_ORIGIN = Deno.env.get("APP_ORIGIN") || "https://pm-sigma.github.io";
  const reqO = req.headers.get("origin") || "";
  const okO = reqO === APP_ORIGIN || /^https:\/\/[a-z]+\.githack\.com$/.test(reqO) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(reqO);
  const ORIGIN = okO ? reqO : APP_ORIGIN;
  const EMS_API_BASE = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
  const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash-lite";
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";
  const GROQ_MODEL = Deno.env.get("GROQ_MODEL") || "llama-3.1-8b-instant";

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(ORIGIN) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, ORIGIN);
  if (!GEMINI_API_KEY && !GROQ_API_KEY) return json({ error: "no AI key set (GEMINI_API_KEY or GROQ_API_KEY)" }, 503, ORIGIN);

  let body: any = {};
  try { body = await req.json(); } catch { /* */ }
  if (!(await emsValid(EMS_API_BASE, body.token))) return json({ error: "unauthorized: valid EMS login required" }, 401, ORIGIN);

  // MODE: record a correction. No raw text — only its length, and the two JSON shapes.
  if (body.mode === "correction") {
    try {
      const r = await fetchT(SB_URL + "/rest/v1/daylog_corrections", {
        method: "POST",
        headers: { apikey: SB_ANON, Authorization: "Bearer " + (body.sbToken || SB_ANON), "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          person: String(body.person || "").slice(0, 60),
          raw_len: Math.max(0, parseInt(String(body.raw_len ?? 0), 10) || 0),
          json_before: body.json_before ?? {},
          json_after: body.json_after ?? {},
        }),
      }, 8000);
      return json({ ok: r.ok }, r.ok ? 200 : 502, ORIGIN);
    } catch (e) {
      return json({ ok: false, error: (e as Error).message }, 502, ORIGIN);
    }
  }

  const text = String(body.text || "").slice(0, 6000).trim();
  const kibbutzim = Array.isArray(body.kibbutzim) ? body.kibbutzim.map(String).slice(0, 300) : [];
  const products = Array.isArray(body.products) ? body.products.map(String).slice(0, 300) : [];
  const tasks: GroundTask[] = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, 60).map((t: any) => ({
    id: String(t?.id || ""), title: String(t?.title || ""), kibbutz: t?.kibbutz ? String(t.kibbutz) : undefined,
  })).filter((t: GroundTask) => t.id && t.title);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body.today || "")) ? String(body.today) : new Date().toISOString().slice(0, 10);
  if (!text) return json({ visits: [], unmatched: [] }, 200, ORIGIN);

  // few-shot: recent accepted corrections (graceful if the table isn't there yet)
  let examples: any[] = [];
  try {
    // SERVICE ROLE, not anon: db/rls_corrections_lockdown.sql removes the anon SELECT on
    // daylog_corrections (a public key could enumerate who wrote a day log and how long it was).
    // The key is injected into every edge function by the platform, so this works before and
    // after the lockdown — deploy this function FIRST, then apply the migration. Task 18.
    const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || SB_ANON;
    const r = await fetchT(SB_URL + "/rest/v1/daylog_corrections?select=json_after&order=created_at.desc&limit=8",
      { headers: { apikey: SB_SERVICE, Authorization: "Bearer " + SB_SERVICE } }, 6000);
    if (r.ok) examples = await r.json();
  } catch { /* no examples yet */ }

  const prompt = buildPrompt({ today, kibbutzim, products, tasks, examples, text });
  const providers: { name: string; run: () => Promise<{ visits: any[]; unmatched: string[] }> }[] = [];
  if (GEMINI_API_KEY) providers.push({ name: "gemini:" + GEMINI_MODEL, run: () => callGemini(GEMINI_API_KEY, GEMINI_MODEL, prompt) });
  if (GROQ_API_KEY) providers.push({ name: "groq:" + GROQ_MODEL, run: () => callGroq(GROQ_API_KEY, GROQ_MODEL, prompt) });

  const errors: string[] = [];
  let emptyOk: { out: { visits: any[]; unmatched: string[] }; provider: string } | null = null;
  for (const p of providers) {
    try {
      const out = await p.run();
      if (out.visits.length > 0) return json({ ...out, provider: p.name, learned: examples.length }, 200, ORIGIN);
      if (!emptyOk) emptyOk = { out, provider: p.name };   // valid but empty — try the next for something better
    } catch (e) { errors.push((e as Error).message); }
  }
  if (emptyOk) return json({ ...emptyOk.out, provider: emptyOk.provider, learned: examples.length }, 200, ORIGIN);
  return json({ error: "all AI providers failed", detail: errors.join(" | ") }, 502, ORIGIN);
});

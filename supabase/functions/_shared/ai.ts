// The two model callers `parse-order` and `parse-daylog` both need, in one place
// (task 31 audit D, F14 ③). They were two copies that differed only in their timeout, their
// JSON schema and the function that pulled the answer apart — so all three are arguments now.
//
// Both return the RAW model text; the caller owns the parsing, because what a valid answer
// looks like is the caller's business (an order's items, a day log's visits) and the two
// have different repair rules.
import { fetchT } from "./http.ts";

/** Gemini, with a JSON response schema so the model cannot answer in prose. */
export async function callGeminiText(
  key: string, model: string, prompt: string, schema: unknown, ms = 15000,
): Promise<string> {
  const r = await fetchT(
    "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent?key=" + key,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json", responseSchema: schema },
      }),
    },
    ms,
  );
  const d = await r.json();
  if (!r.ok) throw new Error("gemini " + r.status + " " + String(d?.error?.message || JSON.stringify(d)).slice(0, 140));
  return d?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
}

/** Groq, the fallback rung. Same contract. */
export async function callGroqText(
  key: string, model: string, prompt: string, ms = 15000,
): Promise<string> {
  const r = await fetchT(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model, temperature: 0.1, response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    },
    ms,
  );
  const d = await r.json();
  if (!r.ok) throw new Error("groq " + r.status + " " + String(d?.error?.message || JSON.stringify(d)).slice(0, 140));
  return d?.choices?.[0]?.message?.content || "{}";
}

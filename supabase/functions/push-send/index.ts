// push-send — Web Push sender. Modes:
//   attendanceReminder: viewer asks a field worker to complete missing attendance days.
// Security: recipients + notification text are FIXED server-side; the client only names
// a person from the allowlist and dates. Subscriptions are read with the service role.
// Secrets (Supabase dashboard → Edge Functions → Secrets): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:pm@sigmatec-energy.com";
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const ALLOWED_RECIPIENTS = ["אביאם", "ניתאי", "עמיחי"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  if (body.mode !== "attendanceReminder") return json({ error: "unknown mode" }, 400);
  const person = String(body.person || "");
  if (!ALLOWED_RECIPIENTS.includes(person)) return json({ error: "recipient not allowed" }, 403);
  const dates: string[] = Array.isArray(body.dates) ? body.dates.slice(0, 31).map(String) : [];
  if (!dates.length) return json({ error: "no dates" }, 400);
  // fixed text — client cannot inject content; dates rendered as d.M
  const fmt = dates.map((d) => { const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${+m[2]}.${+m[1]}` : null; }).filter(Boolean);
  if (!fmt.length) return json({ error: "bad dates" }, 400);
  const payload = JSON.stringify({
    title: "📅 חסרה נוכחות — " + person,
    body: "נא לעדכן נוכחות לימים: " + fmt.join(", "),
    tag: "att-reminder-" + person + "-" + dates[0].slice(0, 7),   // resend replaces, no stacking
    requireInteraction: true,
    url: "./index.html#attendance",
    action: "עדכן עכשיו",
  });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: subs, error } = await db.from("push_subscriptions").select("endpoint,keys").eq("owner", person);
  if (error) return json({ error: error.message }, 500);
  let delivered = 0, pruned = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      delivered++;
    } catch (e: any) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        pruned++;
      }
    }
  }
  return json({ delivered, pruned, subscriptions: (subs ?? []).length });
});

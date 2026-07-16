// push-send — Web Push sender. Two modes over one endpoint:
//   (default) order events  : { event: 'pending'|'approved', orderId, actor } → notifies approvers
//   attendanceReminder      : { mode:'attendanceReminder', person, dates }    → nudges a field worker
// Recipients + text are computed/fixed SERVER-SIDE (client can't inject content or pick arbitrary targets).
// Every recipient device gets one push_log row (audit for the admin "התראות" screen); logging is non-fatal.
// Secrets (Supabase dashboard → Edge Functions → Secrets, NEVER in repo): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APPROVE_GROUP = ["אביאם", "ניתאי", "עמיחי"];
const qty = (o: any) => (o.items || []).reduce((s: number, i: any) => s + (parseInt(i.qty) || 0), 0);
const otype = (o: any) => o.order_type || o.orderType || (/בקשת לקוח/.test(o.notes || "") ? "customer" : "supplier");
const needsAmichai = (o: any) => otype(o) === "supplier" && qty(o) > 10;
function pendingApprovers(o: any) {
  if (otype(o) === "customer") return ["אביאם", "ניתאי"];
  return needsAmichai(o) ? ["עמיחי"] : ["אביאם"];
}
function computeRecipients(event: string, order: any, actor: string) {
  let rec: string[];
  if (event === "pending") rec = pendingApprovers(order);
  else if (event === "approved") rec = APPROVE_GROUP.slice();
  else return [];
  const creator = order.created_by || order.createdBy || "";
  return rec.filter((n) => n && n !== actor && n !== creator);
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") || "mailto:pm@sigmatec-energy.com",
  Deno.env.get("VAPID_PUBLIC")!,
  Deno.env.get("VAPID_PRIVATE")!,
);

// Send `payload` to every subscription of `owners`; prune dead endpoints (404/410) and write one
// push_log row per device. `meta` carries the denormalized audit fields (event/order/actor/title/body).
async function sendTo(owners: string[], payload: string, meta: Record<string, unknown>) {
  const { data: subs } = await sb.from("push_subscriptions").select("owner,endpoint,keys").in("owner", owners);
  let delivered = 0, pruned = 0;
  const logRows: any[] = [];
  for (const s of subs ?? []) {
    let status = "sent", err: string | null = null;
    try {
      await webpush.sendNotification({ endpoint: (s as any).endpoint, keys: (s as any).keys }, payload);
      delivered++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        status = "expired";
        await sb.from("push_subscriptions").delete().eq("endpoint", (s as any).endpoint);
        pruned++;
      } else {
        status = "failed";
      }
      err = String(e?.statusCode || "") + " " + String(e?.body || e?.message || e);
    }
    logRows.push({ ...meta, recipient: (s as any).owner, endpoint: (s as any).endpoint, status, error: err });
  }
  // record what was sent (one row per recipient). Non-fatal: logging must never break sending.
  if (logRows.length) { try { await sb.from("push_log").insert(logRows); } catch (_) { /* ignore */ } }
  return { delivered, pruned, subscriptions: (subs ?? []).length };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }

  // ---- attendance reminder ----
  if (body.mode === "attendanceReminder") {
    const person = String(body.person || "");
    if (!APPROVE_GROUP.includes(person)) return json({ error: "recipient not allowed" }, 403);
    const dates: string[] = Array.isArray(body.dates) ? body.dates.slice(0, 31).map(String) : [];
    const fmt = dates.map((d) => { const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${+m[2]}.${+m[1]}` : null; }).filter(Boolean);
    if (!fmt.length) return json({ error: "bad dates" }, 400);
    const title = "📅 חסרה נוכחות — " + person;
    const bodyTxt = "נא לעדכן נוכחות לימים: " + fmt.join(", ");
    const payload = JSON.stringify({
      title, body: bodyTxt,
      tag: "att-reminder-" + person + "-" + dates[0].slice(0, 7),   // resend replaces, no stacking
      requireInteraction: true,
      url: "/sigmatec-operations-app/#attendance",
    });
    const meta = { event: "attendanceReminder", order_id: null, where_txt: person, qty: fmt.length, actor: null, title, body: bodyTxt };
    return json(await sendTo([person], payload, meta));
  }

  // ---- order events ----
  const { event, orderId, actor } = body;
  if (!event || !orderId) return json({ error: "bad request" }, 400);
  const { data: order } = await sb.from("orders").select("*").eq("id", orderId).single();
  if (!order) return json({ ok: true, sent: 0, reason: "order not found" });
  const recipients = computeRecipients(event, order, actor || "");
  if (!recipients.length) return json({ ok: true, sent: 0 });
  const where = otype(order) === "customer" ? "לקיבוץ " + (order.kibbutz || "—") : "מספק " + (order.supplier || "");
  const title = event === "pending" ? "🔔 הזמנה ממתינה לאישור" : "✅ הזמנה אושרה";
  const bodyTxt = event === "pending"
    ? `${where} · ${qty(order)} פריטים${order.created_by ? " · מאת " + order.created_by : ""}`
    : `${where} · ${qty(order)} פריטים${actor ? " · אושר ע״י " + actor : ""}`;
  const payload = JSON.stringify({ title, body: bodyTxt, tag: event + ":" + orderId, url: "/sigmatec-operations-app/#inventory" });
  const meta = { event, order_id: String(orderId), where_txt: where, qty: qty(order), actor: actor || null, title, body: bodyTxt };
  const r = await sendTo(recipients, payload, meta);
  return json({ ok: true, sent: r.delivered, pruned: r.pruned });
});

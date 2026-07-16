// push-send — sends Web Push for order events. Called by the client after a successful
// create/approve with { event: 'pending'|'approved', orderId, actor }.
// Recipients computed here (single source of truth mirrors js/src/07-orders.js approval rules).
// Secrets (set via Supabase dashboard, NEVER in repo): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

Deno.serve(async (req) => {
  try {
    const { event, orderId, actor } = await req.json();
    if (!event || !orderId) return new Response("bad request", { status: 400 });

    const { data: order } = await sb.from("orders").select("*").eq("id", orderId).single();
    if (!order) return new Response(JSON.stringify({ ok: true, sent: 0, reason: "order not found" }), { status: 200 });

    const recipients = computeRecipients(event, order, actor || "");
    if (!recipients.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });

    const { data: subs } = await sb.from("push_subscriptions").select("*").in("owner", recipients);
    if (!subs?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 });

    const where = otype(order) === "customer"
      ? "לקיבוץ " + (order.kibbutz || "—")
      : "מספק " + (order.supplier || "");
    const title = event === "pending" ? "🔔 הזמנה ממתינה לאישור" : "✅ הזמנה אושרה";
    const body = (event === "pending"
      ? `${where} · ${qty(order)} פריטים${order.created_by ? " · מאת " + order.created_by : ""}`
      : `${where} · ${qty(order)} פריטים${actor ? " · אושר ע״י " + actor : ""}`);
    const payload = JSON.stringify({ title, body, tag: event + ":" + orderId, url: "/sigmatec-operations-app/#inventory" });

    let sent = 0;
    const logRows: any[] = [];
    await Promise.all(subs.map(async (s: any) => {
      let status = "sent", err: string | null = null;
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
        sent++;
      } catch (e: any) {
        // 404/410 = subscription dead → prune it
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          status = "expired";
          await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        } else {
          status = "failed";
        }
        err = String(e?.statusCode || "") + " " + String(e?.body || e?.message || e);
      }
      logRows.push({
        event, order_id: String(orderId), where_txt: where, qty: qty(order), actor: actor || null,
        title, body, recipient: s.owner, endpoint: s.endpoint, status, error: err,
      });
    }));
    // record what was sent (one row per recipient). Non-fatal: logging must never break sending.
    if (logRows.length) { try { await sb.from("push_log").insert(logRows); } catch (_) { /* ignore */ } }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 500 });
  }
});

// push-send — Web Push sender. Modes over one endpoint:
//   (default) order events  : { event: 'pending'|'approved', orderId, actor } → notifies approvers
//   attendanceReminder      : { mode:'attendanceReminder', person, dates }    → nudges a field worker
//   approveOrder            : { mode:'approveOrder', orderId, actor }          → one-tap approve (supplier only)
// Recipients + text + action buttons are computed/fixed SERVER-SIDE.
// Every recipient device gets one push_log row (audit). Logging is non-fatal.
// Secrets (Supabase dashboard → Edge Functions → Secrets, NEVER in repo): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const APP = "/sigmatec-operations-app/";   // GitHub Pages base path (openWindow target)
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

const ATT_PEOPLE = ["אביאם", "ניתאי"];   // field workers with a private monthly attendance report

// Current wall-clock in Israel (DST-correct via Intl). Returns date 'YYYY-MM-DD', hour 0-23, dow 0=Sun.
function israelNow() {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value || "";
  const y = +g("year"), m = +g("month"), d = +g("day");
  let hh = +g("hour"); if (hh === 24) hh = 0;
  const date = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();   // 0=Sun … 6=Sat
  return { y, m, d, hh, date, dow };
}
// Set of 'YYYY-MM-DD' the person has an attendance OR visit record for, in the given month.
async function haveDates(person: string, y: number, m: number): Promise<Set<string>> {
  const lo = `${y}-${String(m).padStart(2, "0")}-01`;
  const hi = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const have = new Set<string>();
  const [att, vis] = await Promise.all([
    sb.from("attendance").select("date").eq("person", person).gte("date", lo).lt("date", hi),
    sb.from("visits").select("date").eq("visitor", person).gte("date", lo).lt("date", hi),
  ]);
  for (const r of (att.data ?? [])) if ((r as any).date) have.add(String((r as any).date).slice(0, 10));
  for (const r of (vis.data ?? [])) if ((r as any).date) have.add(String((r as any).date).slice(0, 10));
  return have;
}
// Prior weekdays (Sun–Thu) this month, from the 1st up to yesterday, with no record. Ascending.
function priorMissing(have: Set<string>, t: { y: number; m: number; d: number }): string[] {
  const out: string[] = [];
  for (let day = 1; day < t.d; day++) {   // strictly before today
    const dow = new Date(Date.UTC(t.y, t.m - 1, day)).getUTCDay();
    if (dow > 4) continue;                // Fri/Sat out
    const key = `${t.y}-${String(t.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (!have.has(key)) out.push(key);
  }
  return out;
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
// Lazy VAPID init — setting details at module load with missing secrets crashes the whole function
// (regression fixed once already). Initialise on first send; report cleanly if secrets are absent.
let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = Deno.env.get("VAPID_PUBLIC"), priv = Deno.env.get("VAPID_PRIVATE");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:pm@sigmatec-energy.com", pub, priv);
  vapidReady = true;
  return true;
}

// Send `payload` to every subscription of `owners`; prune dead endpoints (404/410) and write one
// push_log row per device. `meta` carries the denormalized audit fields.
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
      } else { status = "failed"; }
      err = String(e?.statusCode || "") + " " + String(e?.body || e?.message || e);
    }
    logRows.push({ ...meta, recipient: (s as any).owner, endpoint: (s as any).endpoint, status, error: err });
  }
  if (logRows.length) { try { await sb.from("push_log").insert(logRows); } catch (_) { /* ignore */ } }
  return { delivered, pruned, subscriptions: (subs ?? []).length };
}

// Build the order-event payload incl. action buttons. Buttons differ by order type:
//   supplier pending → true one-tap 'approve' (status flip only) + 'view'
//   customer pending → 'approveOpen' (opens the in-app confirm; stock/EMS run there) + 'view'
//   approved         → 'view' only
function orderPayload(event: string, order: any, actor: string) {
  const id = String(order.id);
  const isCust = otype(order) === "customer";
  const where = isCust ? "לקיבוץ " + (order.kibbutz || "—") : "מספק " + (order.supplier || "");
  const title = event === "pending" ? "🔔 הזמנה ממתינה לאישור" : "✅ הזמנה אושרה";
  const bodyTxt = event === "pending"
    ? `${where} · ${qty(order)} פריטים${order.created_by ? " · מאת " + order.created_by : ""}`
    : `${where} · ${qty(order)} פריטים${actor ? " · אושר ע״י " + actor : ""}`;
  const viewUrl = APP + "?pushact=order&oid=" + id + "#inventory";
  let actions: any[] = [];
  const actUrls: Record<string, string> = { view: viewUrl, order: viewUrl };
  if (event === "pending") {
    if (isCust) {
      actions = [{ action: "approveOpen", title: "✅ אשר" }, { action: "view", title: "👁️ צפה" }];
      actUrls.approveOpen = APP + "?pushact=approve&oid=" + id + "#inventory";
    } else {
      actions = [{ action: "approve", title: "✅ אשר עכשיו" }, { action: "view", title: "👁️ צפה" }];
    }
  } else {
    actions = [{ action: "view", title: "👁️ צפה" }];
  }
  const payload = JSON.stringify({
    title, body: bodyTxt, tag: event + ":" + id, url: viewUrl,
    actions, data: { oid: id, otype: otype(order), actUrls },
  });
  const meta = { event, order_id: id, where_txt: where, qty: qty(order), actor: actor || null, title, body: bodyTxt };
  return { payload, meta };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  if (!ensureVapid()) return json({ error: "VAPID secrets not set" }, 503);

  // ---- scheduled attendance reminders (pg_cron hits this hourly; gate on Israel local hour) ----
  if (body.mode === "attendanceCron") {
    const t = israelNow();
    const kind = t.hh === 19 ? "evening" : t.hh === 9 ? "morning" : null;
    if (!kind) return json({ ok: true, skipped: "not a scheduled hour", hour: t.hh });
    const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();   // 12h window → DST-proof idempotency
    const results: any[] = [];
    for (const person of ATT_PEOPLE) {
      const { data: prior } = await sb.from("push_log").select("id")
        .eq("event", "attendanceCron").eq("recipient", person).eq("where_txt", kind).gte("sent_at", since).limit(1);
      if (prior && prior.length) { results.push({ person, kind, skipped: "already sent" }); continue; }
      const have = await haveDates(person, t.y, t.m);
      let dates: string[] = [];
      if (kind === "evening") { if (t.dow >= 0 && t.dow <= 4 && !have.has(t.date)) dates = [t.date]; }
      else dates = priorMissing(have, t);
      if (!dates.length) { results.push({ person, kind, none: true }); continue; }
      const fmt = dates.map((d) => { const mm = d.match(/^\d{4}-(\d{2})-(\d{2})$/); return mm ? `${+mm[2]}.${+mm[1]}` : ""; }).filter(Boolean);
      const title = kind === "evening" ? "📅 עדכן נוכחות להיום" : "📅 חסרה נוכחות — " + person;
      const bodyTxt = kind === "evening" ? "לא עודכנה נוכחות להיום. נא למלא." : "ימים חסרים: " + fmt.join(", ");
      const act = kind === "evening" ? "fillToday" : "fillMissing";
      const fillUrl = APP + "?pushact=" + act + "#attendance";
      const payload = JSON.stringify({
        title, body: bodyTxt, tag: "att-" + kind + "-" + person + "-" + t.date,
        requireInteraction: true, url: fillUrl,
        actions: [{ action: act, title: "✍️ מלא נוכחות" }],
        data: { actUrls: { [act]: fillUrl } },
      });
      const meta = { event: "attendanceCron", order_id: null, where_txt: kind, qty: dates.length, actor: null, title, body: bodyTxt };
      const r = await sendTo([person], payload, meta);
      results.push({ person, kind, dates: dates.length, delivered: r.delivered });
    }
    return json({ ok: true, kind, results });
  }

  // ---- one-tap approve (supplier orders only; customer approval must run in-app) ----
  if (body.mode === "approveOrder") {
    const orderId = String(body.orderId || "");
    if (!orderId) return json({ error: "bad request" }, 400);
    const { data: order } = await sb.from("orders").select("*").eq("id", orderId).single();
    if (!order) return json({ ok: false, error: "order not found" }, 404);
    if (order.status !== "pending_approval") return json({ ok: true, status: order.status, noop: true });
    if (otype(order) === "customer") return json({ ok: false, error: "customer order — approve in app" }, 409);
    await sb.from("orders").update({ status: "pending" }).eq("id", orderId);   // supplier approve = plain status flip
    const actor = String(body.actor || "עמיחי");
    const recips = computeRecipients("approved", order, actor);
    if (recips.length) { const { payload, meta } = orderPayload("approved", order, actor); await sendTo(recips, payload, meta); }
    return json({ ok: true, status: "pending" });
  }

  // ---- attendance reminder (manual viewer nudge; scheduled job uses attendance-cron) ----
  if (body.mode === "attendanceReminder") {
    const person = String(body.person || "");
    if (!APPROVE_GROUP.includes(person)) return json({ error: "recipient not allowed" }, 403);
    const dates: string[] = Array.isArray(body.dates) ? body.dates.slice(0, 31).map(String) : [];
    const fmt = dates.map((d) => { const m = d.match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${+m[2]}.${+m[1]}` : null; }).filter(Boolean);
    if (!fmt.length) return json({ error: "bad dates" }, 400);
    const title = "📅 חסרה נוכחות — " + person;
    const bodyTxt = "נא לעדכן נוכחות לימים: " + fmt.join(", ");
    const fillUrl = APP + "?pushact=fillMissing#attendance";
    const payload = JSON.stringify({
      title, body: bodyTxt, tag: "att-reminder-" + person + "-" + dates[0].slice(0, 7),
      requireInteraction: true, url: fillUrl,
      actions: [{ action: "fillMissing", title: "✍️ מלא נוכחות" }],
      data: { actUrls: { fillMissing: fillUrl } },
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
  const { payload, meta } = orderPayload(event, order, actor || "");
  const r = await sendTo(recipients, payload, meta);
  return json({ ok: true, sent: r.delivered, pruned: r.pruned });
});

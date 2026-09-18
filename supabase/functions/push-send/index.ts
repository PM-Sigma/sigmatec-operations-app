// push-send — Web Push sender. Modes over one endpoint:
//   (default) order events  : { event: 'pending'|'approved', orderId, actor } → notifies approvers
//   attendanceReminder      : { mode:'attendanceReminder', person, dates }    → nudges a field worker
//   attendanceCron          : { mode:'attendanceCron' }  → hourly; 09:00 missing-days, 19:00 today
//                             🕎 skips `company_holidays` rows with required=false (spec §7e)
//   approveOrder            : { mode:'approveOrder', orderId, actor }          → one-tap approve (supplier only)
//   feedbackNew             : { mode:'feedbackNew', kind, preview, token }     → 📣 box → עידן + עמיחי (EMS-gated)
//   usageDigest             : { mode:'usageDigest', force?, token?, actor? }   → weekly narrative → עידן (Sun 08:00)
//   visitCron               : { mode:'visitCron' }                             → "2 h after the check-in, no summary yet"
//                             AUTH: X-Cron-Key header (pg_cron, db/cron_visit_15min.sql) OR a valid EMS login
//                             AUTH: X-Cron-Key header (pg_cron) OR a valid EMS login; only עידן may force
// Recipients + text + action buttons are computed/fixed SERVER-SIDE.
// Every recipient device gets one push_log row (audit). Logging is non-fatal.
// Secrets (Supabase dashboard → Edge Functions → Secrets, NEVER in repo): VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";
// 📈 שימוש (spec §7j). BYTE-IDENTICAL copy of app/src/lib/usageNarrative.ts — Deno cannot
// import out of app/src, and the sentences pushed on Sunday must be the SAME ones the
// 📈 שימוש page shows and the vitest goldens pin. test-usage-track.mjs fails if the two
// files ever drift, so treat this file as generated: edit app/src/lib and copy it over.
import { digestBody, PAGE_KEYS, usageNarrative, weekTag, type UsageEvent } from "./usageNarrative.ts";
// Same copy-and-pin arrangement as the narrative: who may ask for a digest is a PURE
// decision, tested in app/src/lib/usageDigest.test.ts (the four review cases).
import { usageDigestAuth } from "./usageDigest.ts";
// 📍 The field flow (spec §5). Same copy-and-pin arrangement: app/src/lib/field.ts is the
// original, this is a BYTE-IDENTICAL copy, and test-field.mjs fails the build on any drift.
// EVERY decision the visitCron mode makes — the 2 h rule, the 20:00 cap, the quiet hours, the
// daily cap, which words go out — is one of these pure functions, tested in field.test.ts.
import {
  CAP_EXEMPT_EVENTS, israelAt, nudgeFor, visitCronSelect,
  type CheckinRow, type DraftRow, type VisitRow,
} from "./field.ts";

const APP = "/sigmatec-operations-app/";   // GitHub Pages base path (openWindow target)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The EMS-login gate, the same check `github`/`calendar`/`transcribe` apply. Used by the modes
// a BROWSER calls directly with a user's own token (feedbackNew); the order/attendance modes keep
// their existing contract (they are called with ids the server re-reads from the DB).
async function emsValid(token: string): Promise<boolean> {
  if (!token) return false;
  const base = Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com";
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(base + "/v1/employee-tasks?take=1",
      { headers: { Authorization: "Bearer " + token }, signal: ac.signal });
    return r.ok;
  } catch { return false; }
  finally { clearTimeout(id); }
}

const APPROVE_GROUP = ["אביאם", "ניתאי", "עמיחי"];
// 📣 feedback box (spec §7 Part F) — the inbox owners, fixed server-side like every recipient list.
const FEEDBACK_INBOX = ["עידן", "עמיחי"];
// 📈 שימוש (spec §7j) — the weekly narrative goes to עידן and to nobody else, and the
// roster is the five EMS logins (js/src/11-search-login.js EMS_USERS), in display order.
const USAGE_DIGEST_TO = ["עידן"];
const USAGE_ROSTER = ["עידן", "אביאם", "ניתאי", "עמיחי", "מתניה"];
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
// 🕎 The dates in a month that DO NOT require attendance (spec §7e): Israeli public
// holidays and company closures, i.e. `company_holidays` rows with `required = false`.
// A row with `required = true` (חול המועד פסח, until עמיחי rules) is a normal work day and
// is deliberately NOT in this set.
//
// This is the SERVER half of one rule that lives in three places and must not drift:
//   • app/src/lib/attendance.ts  isRequiredDay / missingDays   (the screen)
//   • js/src/22-push.js          attMissingDays                (the legacy report)
//   • here                       priorMissing + the evening gate (the nudges)
// A phone that buzzes "חסרה נוכחות" on יום כיפור is the failure this prevents.
async function holidayOff(y: number, m: number): Promise<Set<string>> {
  const lo = `${y}-${String(m).padStart(2, "0")}-01`;
  const hi = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  const off = new Set<string>();
  try {
    const { data } = await sb.from("company_holidays").select("date,required")
      .eq("required", false).gte("date", lo).lt("date", hi);
    for (const r of (data ?? [])) if ((r as any).date) off.add(String((r as any).date).slice(0, 10));
  } catch {
    // The table not being there yet (or a transient read error) must not stop the nudges —
    // it degrades to the pre-holiday behaviour, which is what this job did for a year.
  }
  return off;
}

// Prior weekdays (Sun–Thu) this month, from the 1st up to yesterday, with no record and not
// a holiday. Ascending.
function priorMissing(have: Set<string>, t: { y: number; m: number; d: number }, off: Set<string> = new Set()): string[] {
  const out: string[] = [];
  for (let day = 1; day < t.d; day++) {   // strictly before today
    const dow = new Date(Date.UTC(t.y, t.m - 1, day)).getUTCDay();
    if (dow > 4) continue;                // Fri/Sat out
    const key = `${t.y}-${String(t.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (off.has(key)) continue;           // 🕎 חג / חול המועד / סגירת חברה
    if (!have.has(key)) out.push(key);
  }
  return out;
}

// ── adoption guard ג (as fix round 1 settled it) ───────────────────────────────────────────
// Counted from push_log, the only record of what actually left the building. One push writes
// ONE ROW PER DEVICE, so the rows are folded by `event|title`: a person with a phone and a
// tablet spent one of his allowance, not two. (Folding by title is a known approximation —
// deferred to Task 18 with a proper per-send id.)
//
// Only the CAPPED modes are counted. Attendance and the weekly digest are exempt in both
// directions (`CAP_EXEMPT_EVENTS`): they are never blocked by the cap, and they never spend
// it — the record of the work day must not be crowded out by nudges.
//
// Returns the total per person and, separately, how many of those were visit nudges, because
// each mode has its own smaller ceiling on top of the global one.
interface CapCounts { total: Record<string, number>; visit: Record<string, number> }

async function sentTodayCounts(people: string[]): Promise<CapCounts> {
  const out: CapCounts = { total: {}, visit: {} };
  if (!people.length) return out;
  const since = new Date(israelAt(new Date(), 0, 0)).toISOString();
  const { data } = await sb.from("push_log").select("recipient,title,event")
    .in("recipient", people).gte("sent_at", since);
  const seen = new Map<string, Set<string>>();
  for (const r of (data ?? []) as Array<{ recipient: string; title: string; event: string }>) {
    if (CAP_EXEMPT_EVENTS.indexOf(String(r.event)) !== -1) continue;
    const key = String(r.event) + "|" + String(r.title);
    const set = seen.get(r.recipient) ?? new Set<string>();
    if (!set.has(key)) {
      set.add(key);
      out.total[r.recipient] = (out.total[r.recipient] ?? 0) + 1;
      if (r.event === "visitCron") out.visit[r.recipient] = (out.visit[r.recipient] ?? 0) + 1;
    }
    seen.set(r.recipient, set);
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
    // 🕎 Read once for the whole run, not per person — the calendar is the same for everyone.
    const off = await holidayOff(t.y, t.m);
    // Nobody is asked to fill in a day the company was closed. The EVENING nudge is about
    // TODAY, so when today is a holiday the job simply has nothing to say — and says nothing,
    // rather than asking someone on his day off to account for it.
    if (kind === "evening" && off.has(t.date)) {
      return json({ ok: true, kind, skipped: "holiday", date: t.date });
    }
    // NOT capped (fix round 1): attendance is the record of the work day, so a day full of
    // visit nudges must never swallow it. It does not spend the cap either — `sentTodayCounts`
    // skips `CAP_EXEMPT_EVENTS`. Its own "already sent" check below is the idempotency.
    for (const person of ATT_PEOPLE) {
      const { data: prior } = await sb.from("push_log").select("id")
        .eq("event", "attendanceCron").eq("recipient", person).eq("where_txt", kind).gte("sent_at", since).limit(1);
      if (prior && prior.length) { results.push({ person, kind, skipped: "already sent" }); continue; }
      const have = await haveDates(person, t.y, t.m);
      let dates: string[] = [];
      if (kind === "evening") { if (t.dow >= 0 && t.dow <= 4 && !have.has(t.date)) dates = [t.date]; }
      else dates = priorMissing(have, t, off);
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

  // ---- 📍 the 2 h visit-summary reminder (spec §5.2, guards §7k ג) --------------------
  // pg_cron hits this every quarter of an hour (db/cron_visit_15min.sql). Everything it
  // decides is `visitCronSelect` in ./field.ts — a pure function with goldens
  // (app/src/lib/field.test.ts), so the rules can be read and changed in one place instead of
  // being spread through this handler.
  if (body.mode === "visitCron") {
    // AUTH, like usageDigest: pg_cron's shared secret, or a live EMS login. The PUBLIC anon
    // key alone must never be able to make two people's phones buzz.
    const cronKey = req.headers.get("x-cron-key");
    const secret = Deno.env.get("CRON_SECRET");
    const byCron = !!secret && !!cronKey && cronKey === secret;
    if (!byCron && !(await emsValid(String(body.token || "")))) {
      return json({ error: "unauthorized: cron key or valid EMS login required" }, 401);
    }

    const nowIso = new Date().toISOString();
    const windowStart = new Date(Date.now() - 14 * 3600 * 1000).toISOString();
    const { data: rows } = await sb.from("field_checkins").select("*")
      .is("reminded_at", null).eq("dismissed", false)
      .gte("checked_in_at", windowStart).order("checked_in_at");
    const checkins = (rows ?? []) as CheckinRow[];
    if (!checkins.length) return json({ ok: true, results: [] });

    const people = [...new Set(checkins.map((c) => c.person))];
    // Two days of visits and drafts: a check-in can be 14 h old, which crosses midnight.
    const fromDay = new Date(Date.now() - 2 * 86400 * 1000).toISOString().slice(0, 10);
    const [vis, dr, sent] = await Promise.all([
      sb.from("visits").select("visitor,kibbutz,date").in("visitor", people).gte("date", fromDay),
      sb.from("visit_drafts").select("id,person,kibbutz,date").in("person", people).gte("date", fromDay),
      sentTodayCounts(people),
    ]);

    const plan = visitCronSelect({
      checkins,
      visits: (vis.data ?? []) as VisitRow[],
      drafts: (dr.data ?? []) as DraftRow[],
      sentToday: sent.total,
      sentTodayVisit: sent.visit,
      nowIso,
    });

    // A row the planner calls FINISHED is stamped so the next 96 runs of the day skip it: the
    // visit is already filed, or the day ran out of sendable time (`late` — no push ever goes
    // out for it; the in-app banner is what carries it, §7k #4).
    const settled = plan.settle.map((x) => x.id);
    if (settled.length) await sb.from("field_checkins").update({ reminded_at: nowIso }).in("id", settled);

    const results: any[] = [];
    for (const pick of plan.remind) {
      const { title, body: bodyTxt } = nudgeFor(pick.id, pick.kibbutz, pick.hasDraft);
      const url = APP + "?pushact=visit&kibbutz=" + encodeURIComponent(pick.kibbutz);
      const dismissUrl = APP + "?pushact=visitDismiss&cid=" + pick.id;
      const payload = JSON.stringify({
        title, body: bodyTxt, tag: "visit-" + pick.id, requireInteraction: true, url,
        actions: [{ action: "visit", title: "✍️ כתוב סיכום" }, { action: "visitDismiss", title: "🙈 לא היום" }],
        data: { cid: pick.id, actUrls: { visit: url, visitDismiss: dismissUrl } },
      });
      const meta = {
        event: "visitCron", order_id: null, where_txt: pick.kibbutz, qty: 1, actor: null, title, body: bodyTxt,
      };
      const r = await sendTo([pick.person], payload, meta);
      // Stamped whatever the delivery said: a person with no subscription must not be
      // re-selected every fifteen minutes for the rest of the day.
      await sb.from("field_checkins").update({ reminded_at: new Date().toISOString() }).eq("id", pick.id);
      results.push({ id: pick.id, kibbutz: pick.kibbutz, draft: pick.hasDraft, delivered: r.delivered });
    }
    return json({ ok: true, results, skipped: plan.skip });
  }

  // ---- 📈 weekly usage digest (spec §7j) ------------------------------------------------
  // pg_cron hits push-send hourly (db/cron_usage_weekly.sql); the GATE is here, on Israel
  // local time, exactly like attendanceCron — one job, no duplicated schedule maths, and DST
  // handled by israelNow().
  //
  // Recipient is FIXED server-side to עידן, like every other mode. The narrative names people,
  // so who may receive it is not something a caller gets to choose (adoption §5.4: this is
  // עידן's tool for noticing, never a performance-review artefact handed around).
  if (body.mode === "usageDigest") {
    // AUTH FIRST (review fix round 1). Before this, anyone holding the PUBLIC anon key could
    // force a send, spam עידן's phone, and read every employee's narrative straight out of the
    // response body. Two callers only: pg_cron with the X-Cron-Key secret (scheduled runs
    // only), or עידן with a live EMS login — the only caller that may skip the Sunday gate, and
    // with force:'resend' the week tag too. The decision itself is pure and tested:
    // app/src/lib/usageDigest.test.ts covers no-auth → 401, cron key → ok, non-עידן force → 403.
    const auth = usageDigestAuth({
      cronKey: req.headers.get("x-cron-key"),
      cronSecret: Deno.env.get("CRON_SECRET"),
      emsValid: body.token ? await emsValid(String(body.token)) : false,
      actor: body.actor == null ? null : String(body.actor),
      force: body.force,
    });
    if (!auth.ok) return json({ error: auth.error }, auth.status);

    const t = israelNow();
    if (!auth.bypassGate && !(t.dow === 0 && t.hh === 8)) {
      return json({ ok: true, skipped: "not Sunday 08:00 Israel", dow: t.dow, hour: t.hh });
    }
    const tag = weekTag(new Date());
    // The week tag still holds for a plain `force` — only an explicit force:'resend' from עידן
    // repeats a week that already went out, so a stuck cron, a retry or a replayed request can
    // never push the same digest twice.
    if (!auth.bypassTag) {
      const { data: prior } = await sb.from("push_log").select("id")
        .eq("event", "usageDigest").eq("where_txt", tag).limit(1);
      if (prior && prior.length) return json({ ok: true, skipped: "already sent", tag });
    }

    // 14 days: the reported week plus the one before it, which is what the "(שבוע שעבר N)"
    // comparison needs. Service role, so no RPC — usage_report() is the CLIENT's door.
    const from = new Date(Date.now() - 14 * 86400 * 1000).toISOString();
    const { data: rows, error } = await sb.from("usage_events")
      .select("person,page,action,target,at,session_id,device").gte("at", from).order("at");
    if (error) return json({ ok: false, error: error.message }, 500);

    const all = (rows ?? []) as UsageEvent[];
    const cut = Date.now() - 7 * 86400 * 1000;
    const week = all.filter((e) => +new Date(e.at) >= cut);
    const prevWeek = all.filter((e) => +new Date(e.at) < cut);
    const sentences = usageNarrative(week, prevWeek, USAGE_ROSTER, PAGE_KEYS);

    const title = "📈 שימוש בשבוע האחרון";
    const bodyTxt = digestBody(sentences);
    const openUrl = APP + "#usage";
    const payload = JSON.stringify({
      title, body: bodyTxt, tag, url: openUrl,
      actions: [{ action: "usage", title: "📈 פתח שימוש" }],
      data: { actUrls: { usage: openUrl } },
    });
    const meta = {
      event: "usageDigest", order_id: null, where_txt: tag, qty: sentences.length,
      actor: null, title, body: bodyTxt,
    };
    const r = await sendTo(USAGE_DIGEST_TO, payload, meta);
    // The narrative NAMES PEOPLE. It reaches עידן's devices and push_log — never the caller,
    // who in the cron case is a SQL job and in the app case reads it from 📈 שימוש anyway.
    // `lines` is a count, deliberately: enough to smoke-test, nothing to harvest.
    return json({ ok: true, tag, sent: r.delivered, lines: sentences.length });
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

  // ---- new feedback from the 📣 box (spec §7 Part F) ----
  // Recipients are FIXED server-side (עידן + עמיחי), exactly like every other mode: the client
  // only says which kind it was and hands over the 80-char preview it already shows in the UI.
  // The author is NEVER sent — a feedback may be anonymous, and a push that named the sender
  // would leak exactly what the anonymous switch promises to hide.
  if (body.mode === "feedbackNew") {
    // EMS-gated (fix round 1): without this, anyone holding the PUBLIC anon key could push
    // arbitrary text to עידן and עמיחי's phones.
    if (!(await emsValid(String(body.token || "")))) {
      return json({ error: "unauthorized: valid EMS login required" }, 401);
    }
    const kind = String(body.kind || "");
    const titles: Record<string, string> = {
      idea: "💡 רעיון חדש", bug: "🐞 באג / שיפור חדש",
    };
    if (!titles[kind]) return json({ error: "bad kind" }, 400);
    const preview = String(body.preview || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const title = titles[kind];
    const bodyTxt = preview || "ללא טקסט";
    const openUrl = APP + "?pushact=feedback#feedback-inbox";
    const payload = JSON.stringify({
      title, body: bodyTxt, tag: "feedback-" + kind + "-" + Date.now(), url: openUrl,
      actions: [{ action: "feedback", title: "📥 פתח תיבה" }],
      data: { actUrls: { feedback: openUrl } },
    });
    const meta = { event: "feedbackNew", order_id: null, where_txt: kind, qty: 1, actor: null, title, body: bodyTxt };
    return json(await sendTo(FEEDBACK_INBOX, payload, meta));
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

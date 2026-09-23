// Supabase Edge Function: backup-export
// Serves the nightly backup.snapshots rows (written by backup.take_snapshot(), a pg_cron job —
// see db/backup_export.sql) to the local Windows backup task, since there is no DB password on
// that machine and the `backup` schema is deliberately not exposed to the API.
//
// GET only, guarded by a header key (this function has verify_jwt=false in config.toml — the key
// IS the auth):
//   x-backup-key: <BACKUP_KEY secret>     required, compared constant-time
//   ?date=YYYY-MM-DD                      optional, defaults to the latest taken_on
//
// Reads via public.backup_export(date), a SECURITY DEFINER SQL function whose EXECUTE is granted
// only to service_role (db/backup_export.sql), called here with the service-role key the platform
// provides automatically as SUPABASE_SERVICE_ROLE_KEY. p_date NULL picks the latest taken_on.
//
// Response: {"taken_on": "YYYY-MM-DD", "tables": {"<tbl>": [...rows], ...}}
// Secrets to set (Edge Functions → Secrets):
//   BACKUP_KEY   a random 48-char key, known only to this function and to the local backup script.
import { createClient } from "jsr:@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Constant-time string compare, so a wrong key takes the same time as a right one. */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  const len = Math.max(bufA.length, bufB.length, 32);
  let diff = bufA.length ^ bufB.length;
  for (let i = 0; i < len; i++) diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const expected = Deno.env.get("BACKUP_KEY") || "";
  const got = req.headers.get("x-backup-key") || "";
  if (!expected || !timingSafeEqual(got, expected)) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !serviceKey) return json({ error: "server misconfigured" }, 500);
  const supabase = createClient(url, serviceKey);

  const p_date = new URL(req.url).searchParams.get("date") || null;

  const { data, error } = await supabase.rpc("backup_export", { p_date });
  if (error) return json({ error: error.message }, 500);
  if (!data || Object.keys(data as Record<string, unknown>).length === 0) {
    return json({ error: "no snapshot" + (p_date ? " for " + p_date : "") }, 404);
  }
  return json(data);
});

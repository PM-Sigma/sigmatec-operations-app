// Supabase Edge Function: field-ops — פעולות שטח → קריאת מודבוס (spec 2026-09-23-field-ops-modbus-design.md).
// All logic lives in handler.ts (pure, injected deps, tested by handler.test.ts); this file only
// wires the real fetch, the bridge-pass verifier and the env.
//
// Secrets: EMS_API_BASE (already set), APP_ORIGIN, JWT_SECRET / EMS_BRIDGE_SECRET (the secret
// ems-auth signs the bridge pass with — the `name` claim is the staff gate).
import { verify } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { appOrigin, fetchT } from "../_shared/http.ts";
import { handle } from "./handler.ts";

async function verifyPass(pass: string): Promise<Record<string, unknown> | null> {
  const secret = Deno.env.get("JWT_SECRET") || Deno.env.get("EMS_BRIDGE_SECRET") || "";
  if (!secret) return null;
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return await verify(pass, key) as Record<string, unknown>;
  } catch { return null; }
}

Deno.serve((req) => handle(req, {
  fetch: fetchT,
  verifyPass,
  emsBase: Deno.env.get("EMS_API_BASE") || "https://api.sigmatec-ems.com",
  appOrigin: appOrigin(),
}));

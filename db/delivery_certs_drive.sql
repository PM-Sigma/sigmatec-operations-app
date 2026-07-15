-- delivery_certs: Drive-archive ETL fields.
-- At issue time the client stores the EXACT rendered document HTML (doc_html — the frozen snapshot
-- that was printed). A time-driven Apps Script (appsscript/archive-certs.gs, runs under the company
-- Google Workspace domain) converts it to PDF, files it in Drive (תעודות משלוח/שנה/חודש), then CLEARS
-- doc_html and stamps drive_url — so the free Supabase tier never accumulates document payloads.
-- Additive + re-runnable. Run once in the Supabase SQL editor.

alter table public.delivery_certs
  add column if not exists doc_html    text not null default '',
  add column if not exists drive_url   text not null default '',
  add column if not exists archived_at timestamptz;

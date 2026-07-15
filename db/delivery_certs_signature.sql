-- delivery_certs: on-the-spot recipient signature (טכנאי מוסר את הטלפון, המקבל חותם על המסך).
-- recipient = typed name; signature = PNG data-URL from the in-app canvas (~5-20KB).
-- Additive + re-runnable. Run once in the Supabase SQL editor.

alter table public.delivery_certs
  add column if not exists recipient text not null default '',
  add column if not exists signature text not null default '';

-- delivery_certs: "sent" record (certs list shows "נשלחה ✓ <date>" / "לא נשלחה").
-- Stamped best-effort by the client when the technician taps mail / WhatsApp in the send panel.
-- Safe + idempotent; additive columns only. Apply order: any (client tolerates the columns missing).
-- BACKUP: none needed (adds nullable columns).
-- ROLLBACK: alter table public.delivery_certs drop column if exists sent_at, drop column if exists sent_to;
alter table public.delivery_certs add column if not exists sent_at timestamptz;
alter table public.delivery_certs add column if not exists sent_to text;

-- Customer-order delivery auto-sync (·65 follow-up).
-- Adds a link from a customer order to the EMS "אספקת ציוד" task it opened, so a future sync can
-- stamp the order's delivery date when that EMS task closes (status in done/rejected/not_relevant/cancelled).
--
-- Run in the Supabase SQL editor. Safe to re-run.
alter table public.orders add column if not exists ems_task_id text default '';

-- After running this, the app side still needs wiring (tracked):
--   1. 01-data.js  — map ems_task_id ⇄ emsTaskId in the order read + write.
--   2. 07-orders.js (approveCustomerOrder) — pass refOrderId on the createTask queue item.
--   3. 13-ems.js   — on createTask success (live OR queue-flush) write the new task id back to the order;
--                    add syncCustomerDeliveries() (called from emsOnConnected): for orders with an
--                    ems_task_id and no delivered_at, fetch the task and stamp delivered_at once it's closed.
-- Build + verify this together while connected to EMS (it can't be tested in mock/offline).

-- orders: persist the two-type order flow fields.
-- Without these columns, orderType/kibbutz were dropped on save → a customer order
-- created in the order modal flipped back to "supplier" after refresh (wrong approval
-- routing, no stock deduction, no EMS task). Run this BEFORE releasing the client build.
alter table public.orders add column if not exists order_type text not null default '';
alter table public.orders add column if not exists kibbutz    text not null default '';

-- Q7 (עידן 29.9): עידן/עמיחי add/edit/delete absences for anyone; everyone else only their own.
-- Viewers are already refused by the calendar_absences_no_viewer_* restrictive policies.
-- A null person is allowed only for kind 'event' (a day marker anyone could already add). BACKUP: none needed (policy only, no data change).
-- ROLLBACK: drop policy calendar_absences_own_only_ins / _upd / _del on public.calendar_absences;
drop policy if exists calendar_absences_own_only_ins on public.calendar_absences;
create policy calendar_absences_own_only_ins on public.calendar_absences as restrictive
  for insert to authenticated
  with check ((auth.jwt() ->> 'name') in ('עידן','עמיחי') or person = (auth.jwt() ->> 'name') or (person is null and kind = 'event'));
drop policy if exists calendar_absences_own_only_upd on public.calendar_absences;
create policy calendar_absences_own_only_upd on public.calendar_absences as restrictive
  for update to authenticated
  using ((auth.jwt() ->> 'name') in ('עידן','עמיחי') or person = (auth.jwt() ->> 'name') or (person is null and kind = 'event'))
  with check ((auth.jwt() ->> 'name') in ('עידן','עמיחי') or person = (auth.jwt() ->> 'name') or (person is null and kind = 'event'));
drop policy if exists calendar_absences_own_only_del on public.calendar_absences;
create policy calendar_absences_own_only_del on public.calendar_absences as restrictive
  for delete to authenticated
  using ((auth.jwt() ->> 'name') in ('עידן','עמיחי') or person = (auth.jwt() ->> 'name') or (person is null and kind = 'event'));

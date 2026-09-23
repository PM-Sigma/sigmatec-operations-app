-- scripts/docs/introspect.sql — the ONE read-only SELECT that feeds gen-schema.mjs.
--
-- Run it through the Supabase MCP `execute_sql` (or paste into the SQL editor) and save the
-- single JSON value it returns as docs/system/schema/_introspection.json. Structure only, no
-- row data, no function bodies, no cron command bodies — see docs/superpowers/specs/
-- 2026-09-23-r5-DOC-documentation.md §6 and §10 for why.
--
--   \o docs/system/schema/_introspection.json
--   \t \a
--   \i scripts/docs/introspect.sql
--
-- or, from an MCP/JS caller: run the query, take the single `introspection` column of the single
-- row back, JSON.stringify it, write it to that path.

select jsonb_build_object(
  'generated_at', now(),
  'schemas', array['public', 'private', 'archive', 'backup'],

  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'kind', c.relkind,
      'rls_enabled', c.relrowsecurity,
      'rls_forced', c.relforcerowsecurity,
      'comment', obj_description(c.oid, 'pg_class')
    ) order by n.nspname, c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p', 'v', 'm')
      and n.nspname = any (array['public', 'private', 'archive', 'backup'])
  ),

  'columns', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', col.table_schema,
      'table', col.table_name,
      'name', col.column_name,
      'position', col.ordinal_position,
      'type', col.data_type,
      'udt', col.udt_name,
      'nullable', col.is_nullable = 'YES',
      'default', col.column_default,
      'comment', col_description(
        (quote_ident(col.table_schema) || '.' || quote_ident(col.table_name))::regclass::oid,
        col.ordinal_position
      )
    ) order by col.table_schema, col.table_name, col.ordinal_position), '[]'::jsonb)
    from information_schema.columns col
    where col.table_schema = any (array['public', 'private', 'archive', 'backup'])
  ),

  -- PK / unique / FK, one row per constraint (FK columns collapsed into an array — a
  -- composite FK is one constraint, not one row per column).
  'constraints', (
    select coalesce(jsonb_agg(row_to_json(x)), '[]'::jsonb) from (
      select tc.table_schema as schema, tc.table_name as "table",
             tc.constraint_name as name, tc.constraint_type as type,
             array_agg(distinct kcu.column_name) as columns,
             max(ccu.table_schema) as fk_schema, max(ccu.table_name) as fk_table,
             array_agg(distinct ccu.column_name) filter (where ccu.column_name is not null) as fk_columns
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.constraint_schema = tc.constraint_schema
      left join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
        and tc.constraint_type = 'FOREIGN KEY'
      where tc.table_schema = any (array['public', 'private', 'archive', 'backup'])
      group by tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type
      order by tc.table_schema, tc.table_name, tc.constraint_name
    ) x
  ),

  'indexes', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', schemaname, 'table', tablename, 'name', indexname, 'definition', indexdef
    ) order by schemaname, tablename, indexname), '[]'::jsonb)
    from pg_indexes
    where schemaname = any (array['public', 'private', 'archive', 'backup'])
  ),

  -- Facts only (§10): the USING/WITH CHECK expressions are already public in db/*.sql.
  -- Never the row data they filter.
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', schemaname, 'table', tablename, 'name', policyname,
      'permissive', permissive, 'roles', roles, 'command', cmd,
      'using', qual, 'with_check', with_check
    ) order by schemaname, tablename, policyname), '[]'::jsonb)
    from pg_policies
    where schemaname = any (array['public', 'private', 'archive', 'backup'])
  ),

  -- Signature + flags only. NEVER prosrc (the function body).
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', n.nspname, 'name', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'returns', pg_get_function_result(p.oid),
      'security_definer', p.prosecdef,
      'config', p.proconfig,
      'language', l.lanname
    ) order by n.nspname, p.proname), '[]'::jsonb)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = any (array['public', 'private', 'archive', 'backup'])
  ),

  'function_grants', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', routine_schema, 'name', routine_name,
      'grantee', grantee, 'privilege', privilege_type
    ) order by routine_schema, routine_name, grantee), '[]'::jsonb)
    from information_schema.role_routine_grants
    where routine_schema = any (array['public', 'private', 'archive', 'backup'])
  ),

  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', event_object_schema, 'table', event_object_table, 'name', trigger_name,
      'timing', action_timing, 'event', event_manipulation, 'action', action_statement
    ) order by event_object_schema, event_object_table, trigger_name), '[]'::jsonb)
    from information_schema.triggers
    where event_object_schema = any (array['public', 'private', 'archive', 'backup'])
  ),

  -- Name + schedule + a best-effort TARGET FUNCTION NAME parsed out of the command.
  -- The command text itself (it carries Authorization headers) never leaves this query.
  'cron_jobs', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'jobid', jobid, 'jobname', jobname, 'schedule', schedule, 'active', active,
      'target', coalesce(
        (regexp_match(command, 'functions/v1/([a-zA-Z0-9_-]+)'))[1],
        (regexp_match(command, 'perform\s+([a-zA-Z_][\w.]*)\s*\(', 'i'))[1],
        (regexp_match(command, 'select\s+([a-zA-Z_][\w.]*)\s*\(', 'i'))[1]
      )
    ) order by jobid), '[]'::jsonb)
    from cron.job
  )
) as introspection;

\ir ../_disposable_guard.sql
-- Failure cleanup for the exact disposable concurrent identity-index phase.
-- A valid or semantically unfamiliar object is never removed automatically.
select to_regclass('public.users_user_id_unique_nonnull_idx') is not null
  as index_exists,
  exists (
    select 1
    from pg_catalog.pg_class idx
    join pg_catalog.pg_namespace n on n.oid = idx.relnamespace
    join pg_catalog.pg_index i on i.indexrelid = idx.oid
    join pg_catalog.pg_class tbl on tbl.oid = i.indrelid
    join pg_catalog.pg_namespace tn on tn.oid = tbl.relnamespace
    join pg_catalog.pg_am am on am.oid = idx.relam
    join pg_catalog.pg_attribute a
      on a.attrelid = tbl.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public'
      and idx.relname = 'users_user_id_unique_nonnull_idx'
      and idx.relkind = 'i'
      and tn.nspname = 'public'
      and tbl.relname = 'users'
      and am.amname = 'btree'
      and i.indisunique
      and not i.indisexclusion
      and (not i.indisvalid or not i.indisready)
      and i.indexprs is null
      and i.indnkeyatts = 1
      and i.indnatts = 1
      and a.attname = 'user_id'
      and pg_catalog.regexp_replace(
        pg_catalog.lower(coalesce(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '')),
        '[[:space:]()]', '', 'g'
      ) = 'user_idisnotnull'
  ) as approved_invalid
\gset

\if :index_exists
  \if :approved_invalid
    drop index concurrently public.users_user_id_unique_nonnull_idx;
  \else
    \echo 'Refusing cleanup: identity index is valid or has unknown semantics.'
    \quit 79
  \endif
\endif

select to_regclass('public.users_user_id_unique_nonnull_idx') is null
  as cleanup_complete
\gset
\if :cleanup_complete
\else
  \echo 'Identity index cleanup did not remove the approved invalid artifact.'
  \quit 79
\endif

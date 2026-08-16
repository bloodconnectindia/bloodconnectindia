\ir ../_disposable_guard.sql
do $$
declare
  valid boolean;
  unique_index boolean;
  predicate text;
begin
  select i.indisvalid, i.indisunique, pg_get_expr(i.indpred, i.indrelid)
    into valid, unique_index, predicate
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'users_user_id_unique_nonnull_idx';

  if valid is distinct from true or unique_index is distinct from true
     or regexp_replace(coalesce(predicate, ''), '[()[:space:]]', '', 'g') <> 'user_idISNOTNULL' then
    raise exception 'Identity index is absent, invalid, non-unique, or has the wrong predicate';
  end if;
end;
$$;

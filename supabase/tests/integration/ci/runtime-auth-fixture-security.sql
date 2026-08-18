\ir ../_disposable_guard.sql
-- Future disposable-only linkage for the credentialed explicit-deny fixture.
-- The Auth user itself is created through the supported runner-local Admin API.
begin;

insert into security.user_permission_overrides
  (user_id, permission_key, effect, reason, granted_by_user_id)
select u.user_id, p.permission_key, 'deny', 'runner-local explicit-deny fixture', null
from public.users u
join auth.users a on a.id::text=u.user_id
cross join lateral (values
  ('system.read_all'), ('blood_requests.restore_submission'), ('demo.seed'), ('demo.reset')
) p(permission_key)
where lower(a.email)='runner-denied-admin@bci.invalid'
on conflict (user_id,permission_key) do update
set effect='deny', reason=excluded.reason, expires_at=null;

do $$ begin
  if (select count(*) from security.user_permission_overrides o join auth.users a on a.id::text=o.user_id where lower(a.email)='runner-denied-admin@bci.invalid' and o.effect='deny')<>4 then
    raise exception 'Disposable explicit-deny fixture linkage failed';
  end if;
end $$;

commit;

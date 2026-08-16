-- Admin-only, audited, demo-only reset. This procedure has an intentionally
-- explicit table list and must be extended when future demo-capable tables are added.

create or replace function public.write_admin_audit(
  audit_action text,
  audit_target_type text,
  audit_target_id uuid default null,
  audit_demo_batch_id uuid default null,
  audit_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_audit_log (
    actor_user_id, action, target_type, target_id, demo_batch_id, metadata
  ) values (
    auth.uid(), audit_action, audit_target_type, audit_target_id, audit_demo_batch_id, audit_metadata
  );
end;
$$;

create or replace function public.request_demo_reset(
  confirmation_phrase text,
  target_demo_batch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_token uuid := gen_random_uuid();
begin
  if not public.current_user_has_role('admin') then
    raise exception 'Admin role required';
  end if;

  if confirmation_phrase <> 'RESET DEMO DATA' then
    raise exception 'Confirmation phrase did not match';
  end if;

  if target_demo_batch_id is not null and not exists (
    select 1 from public.demo_batches where id = target_demo_batch_id and status = 'active'
  ) then
    raise exception 'Only an active demo batch may be reset';
  end if;

  insert into public.demo_reset_confirmations (id, demo_batch_id, requested_by, expires_at)
  values (reset_token, target_demo_batch_id, auth.uid(), now() + interval '5 minutes');

  perform public.write_admin_audit(
    'demo_reset_requested', 'demo_data', null, target_demo_batch_id,
    jsonb_build_object('expires_at', now() + interval '5 minutes')
  );

  return reset_token;
end;
$$;

create or replace function public.reset_demo_data(
  reset_token uuid,
  confirmation_phrase text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_request public.demo_reset_confirmations%rowtype;
  deleted_blood_requests integer := 0;
  deleted_roles integer := 0;
  deleted_profiles integer := 0;
  deleted_auth_users integer := 0;
begin
  if not public.current_user_has_role('admin') then
    raise exception 'Admin role required';
  end if;

  if confirmation_phrase <> 'RESET DEMO DATA' then
    raise exception 'Confirmation phrase did not match';
  end if;

  select * into reset_request
  from public.demo_reset_confirmations
  where id = reset_token
    and requested_by = auth.uid()
    and consumed_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Reset token is invalid, expired, already used, or belongs to another user';
  end if;

  -- A demo profile is reset only when its managed Auth identity has the same
  -- explicit marker. If the markers disagree, fail closed and roll back.
  if exists (
    select 1
    from public.profiles profile
    left join auth.users auth_user on auth_user.id = profile.id
    where profile.is_demo = true
      and (reset_request.demo_batch_id is null or profile.demo_batch_id = reset_request.demo_batch_id)
      and (
        auth_user.id is null
        or coalesce(auth_user.raw_app_meta_data ->> 'is_demo', 'false') <> 'true'
        or coalesce(auth_user.raw_app_meta_data ->> 'demo_batch_id', '') <> profile.demo_batch_id::text
      )
  ) then
    raise exception 'Reset refused because a demo profile does not have matching managed Auth markers';
  end if;

  -- Only explicit demo records are deleted. Production rows never match these predicates.
  delete from public.blood_requests
  where is_demo = true
    and (reset_request.demo_batch_id is null or demo_batch_id = reset_request.demo_batch_id);
  get diagnostics deleted_blood_requests = row_count;

  delete from public.user_roles
  where is_demo = true
    and (reset_request.demo_batch_id is null or demo_batch_id = reset_request.demo_batch_id);
  get diagnostics deleted_roles = row_count;

  delete from auth.users auth_user
  using public.profiles profile
  where auth_user.id = profile.id
    and profile.is_demo = true
    and (reset_request.demo_batch_id is null or profile.demo_batch_id = reset_request.demo_batch_id)
    and auth_user.raw_app_meta_data ->> 'is_demo' = 'true'
    and auth_user.raw_app_meta_data ->> 'demo_batch_id' = profile.demo_batch_id::text;
  get diagnostics deleted_auth_users = row_count;
  deleted_profiles := deleted_auth_users;

  update public.demo_reset_confirmations
  set consumed_at = now()
  where id = reset_token;

  if reset_request.demo_batch_id is not null then
    update public.demo_batches
    set status = 'reset', reset_at = now(), reset_by = auth.uid()
    where id = reset_request.demo_batch_id;
  end if;

  perform public.write_admin_audit(
    'demo_reset_completed', 'demo_data', null, reset_request.demo_batch_id,
    jsonb_build_object(
      'blood_requests', deleted_blood_requests,
      'user_roles', deleted_roles,
      'profiles', deleted_profiles,
      'auth_users', deleted_auth_users
    )
  );

  return jsonb_build_object(
    'blood_requests', deleted_blood_requests,
    'user_roles', deleted_roles,
    'profiles', deleted_profiles,
    'auth_users', deleted_auth_users
  );
end;
$$;

revoke all on function public.write_admin_audit(text, text, uuid, uuid, jsonb) from public;
revoke all on function public.request_demo_reset(text, uuid) from public;
revoke all on function public.reset_demo_data(uuid, text) from public;
-- Legacy evidence only: browsers must not execute destructive SECURITY DEFINER
-- reset functions. The replacement Edge Function uses explicit demo.reset
-- permission checks, a fixed table scope, replay protection, and private audit.
revoke execute on function public.request_demo_reset(text, uuid) from authenticated;
revoke execute on function public.reset_demo_data(uuid, text) from authenticated;

-- TEST HARNESS ONLY. This file makes no connection and must not be run without separate approval.
-- The operator must set both session values after independently verifying the target.
do $$
begin
  if current_setting('bci.test.disposable', true) is distinct from 'approved'
     or current_setting('bci.test.run_id', true) !~ '^bci-local-[a-z0-9-]{8,64}$' then
    raise exception 'Refusing integration harness: disposable target/session guard is not set';
  end if;
end;
$$;

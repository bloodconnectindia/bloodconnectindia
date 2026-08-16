-- MANUAL STAGE 2. Apply only after the preflight script has passed and after
-- a change review confirms nullable user_id remains compatible with Public rows.
-- This does not make user_id NOT NULL or alter its text type.
create unique index concurrently if not exists users_user_id_unique_nonnull_idx
on public.users (user_id)
where user_id is not null;

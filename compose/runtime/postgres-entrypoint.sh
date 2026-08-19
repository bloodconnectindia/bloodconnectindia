#!/bin/sh
set -eu
umask 077

test -r /run/secrets/pgsodium_root_key
test -r /opt/bci/bootstrap/01-schema.sql
test -r /opt/bci/bootstrap/02-webhook.sql
test -r /opt/bci/bootstrap/03-supabase.sql

cat \
  /opt/bci/bootstrap/01-schema.sql \
  /opt/bci/bootstrap/02-webhook.sql \
  /opt/bci/bootstrap/03-supabase.sql \
  > /etc/postgresql.schema.sql
install -m 600 /run/secrets/pgsodium_root_key \
  /etc/postgresql-custom/pgsodium_root.key

exec docker-entrypoint.sh postgres -D /etc/postgresql

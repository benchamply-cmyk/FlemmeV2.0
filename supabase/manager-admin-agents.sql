-- Additive installation script. Requires gestionadmin.sql and Manager V2/V3/V4.
-- No existing data or RPC definitions are replaced. Install before backend/frontend release.
begin;
do $$ begin
  if to_regprocedure('public.est_admin()') is null then
    raise exception 'Install the pinned administrator authority first';
  end if;
end $$;
create function fm_v2.require_agent_admin() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or public.est_admin() is distinct from true then
    raise exception 'Agents restricted to administrators' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function fm_v2.require_agent_admin() from public, anon, authenticated;
do $$
declare target text;
begin
  foreach target in array array['fm_v2.conversations','fm_v2.missions','fm_v2.messages','fm_v2.events',
    'fm_v3.runs','fm_v3.outputs','fm_v3.recoveries','fm_v4.originals'] loop
    execute format('create trigger agent_admin_insert before insert on %s for each row execute function fm_v2.require_agent_admin()',target);
  end loop;
end $$;
commit;

-- Les clients écrivent au Flemme Manager depuis /espace (21/10/2026).
-- Additif et rejouable : aucune donnée ni RPC métier remplacée. Fonctionne avec ou sans
-- manager-admin-agents.sql (déjà installé ou non). Ne pas installer ce dernier après coup :
-- il remettrait la garde administrateur sur les messages des clients.
-- Le client peut créer sa conversation et envoyer ses messages (analyse du Manager comprise).
-- Restent réservés aux administrateurs : événements de mission (statut, action, résultat).
-- Plans d'agents, livrables et acquisitions restent réservés aux administrateurs par le backend.
begin;
do $$ begin
  if to_regprocedure('public.est_admin()') is null then
    raise exception 'Install gestionadmin.sql first';
  end if;
  if to_regprocedure('fm_v2.require_agent_admin()') is null then
    execute $fn$
    create function fm_v2.require_agent_admin() returns trigger
    language plpgsql security invoker set search_path = '' as $body$
    begin
      if auth.uid() is null or public.est_admin() is distinct from true then
        raise exception 'Agents restricted to administrators' using errcode='42501';
      end if;
      return new;
    end $body$;
    $fn$;
    revoke all on function fm_v2.require_agent_admin() from public, anon, authenticated;
  end if;
end $$;
drop trigger if exists agent_admin_insert on fm_v2.conversations;
drop trigger if exists agent_admin_insert on fm_v2.missions;
drop trigger if exists agent_admin_insert on fm_v2.messages;
drop trigger if exists agent_admin_insert on fm_v2.events;
drop trigger if exists mission_admin_insert on fm_v2.events;
create trigger mission_admin_insert before insert on fm_v2.events for each row
  when (new.kind in ('status','action','result')) execute function fm_v2.require_agent_admin();
commit;

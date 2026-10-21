-- Les clients écrivent au Flemme Manager depuis /espace (21/10/2026).
-- À installer après manager-admin-agents.sql. Additif et rejouable : aucune donnée ni RPC remplacée.
-- Le client peut créer sa conversation et envoyer ses messages (analyse du Manager comprise).
-- Restent réservés aux administrateurs : événements de mission (statut, action, résultat),
-- plans d'agents, livrables des spécialistes et documents acquis (fm_v3, fm_v4).
begin;
do $$ begin
  if to_regprocedure('fm_v2.require_agent_admin()') is null then
    raise exception 'Install manager-admin-agents.sql first';
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

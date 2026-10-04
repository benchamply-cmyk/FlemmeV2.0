-- =========================================================================
-- FLEMME — alertes e-mail à l'équipe (à la place des « Database Webhooks »)
-- À chaque nouvelle demande ou nouveau message, la base appelle la fonction
-- Netlify https://www.flemme.org/api/alerte, qui envoie l'e-mail (voir README).
-- Avant de lancer : remplacer COLLE_TON_SECRET_ICI (ligne plus bas) par la
-- valeur de ALERTE_SECRET mise dans Netlify. Rejouable sans risque.
-- =========================================================================
create extension if not exists pg_net;

create or replace function public.alerte_equipe() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url     := 'https://www.flemme.org/api/alerte',
    body    := jsonb_build_object('type', 'INSERT', 'table', tg_table_name, 'record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-alerte-secret', 'COLLE_TON_SECRET_ICI')
  );
  return new;
exception when others then
  return new; -- une alerte ratée ne doit jamais bloquer une demande ou un message
end $$;
revoke all on function public.alerte_equipe() from public, anon, authenticated;

drop trigger if exists alerte_demande on public.demandes;
create trigger alerte_demande after insert on public.demandes
  for each row execute function public.alerte_equipe();

drop trigger if exists alerte_message on public.messages;
create trigger alerte_message after insert on public.messages
  for each row execute function public.alerte_equipe();

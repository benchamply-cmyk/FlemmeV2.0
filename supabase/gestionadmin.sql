-- Gestion admin — migration additive, 11 octobre 2026.
-- Exécuter APRÈS espace.sql. Aucun compte, demande ou message n'est supprimé.
-- Le propriétaire confirmé est ben.champly@gmail.com. L'identité est épinglée
-- à son UUID Supabase ; une recréation du compte exige une intervention SQL.
begin;
create table if not exists public.admin_proprietaire (
  singleton boolean primary key default true check(singleton),
  user_id uuid not null unique references auth.users(id)
);
alter table public.admin_proprietaire enable row level security;
revoke all on public.admin_proprietaire from public, anon, authenticated;
do $$
declare proprietaire uuid;
begin
  select id into proprietaire from auth.users
    where lower(email) = 'ben.champly@gmail.com' and email_confirmed_at is not null;
  if proprietaire is null then raise exception 'Créer et confirmer le compte propriétaire avant cette migration'; end if;
  insert into public.admin_proprietaire(singleton, user_id) values(true, proprietaire) on conflict do nothing;
  if not exists(select 1 from public.admin_proprietaire where user_id = proprietaire) then
    raise exception 'Un autre propriétaire est déjà configuré';
  end if;
end $$;
create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_proprietaire where user_id = auth.uid());
$$;
revoke all on function public.est_admin() from public, anon;
grant execute on function public.est_admin() to authenticated;
-- Conserve les anciens membres et politiques, mais retire leur accès global.
-- Les politiques existantes de demandes, messages et stockage héritent de ce contrôle.
create or replace function public.est_equipe() returns boolean
language sql stable security definer set search_path = '' as $$ select public.est_admin(); $$;

create table if not exists public.admin_journal (
  id bigint generated always as identity primary key,
  sujet text not null check(char_length(sujet) between 1 and 200),
  statut text not null check(char_length(statut) between 1 and 80),
  note text not null check(char_length(note) >= 1),
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.admin_journal enable row level security;
revoke all on public.admin_journal from public, anon, authenticated;
grant select on public.admin_journal to authenticated;
drop policy if exists "admin lit son journal" on public.admin_journal;
create policy "admin lit son journal" on public.admin_journal
for select to authenticated using(public.est_admin());

create or replace function public.admin_noter(sujet text, statut text, note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
  insert into public.admin_journal(sujet, statut, note, user_id) values(sujet, statut, note, auth.uid());
end $$;

create or replace function public.admin_modifier_demande(cible uuid, nouveau_statut text, nouveau_message text) returns void
language plpgsql security definer set search_path = '' as $$
declare ancien jsonb;
begin
  if not public.est_admin() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
  select jsonb_build_object('statut',statut,'message',message) into ancien from public.demandes where id=cible for update;
  if not found then raise exception 'Demande introuvable'; end if;
  update public.demandes set statut=nouveau_statut, message=nouveau_message where id=cible;
  perform public.admin_noter('demande:'||cible, 'suivi', jsonb_build_object('avant',ancien,'apres',jsonb_build_object('statut',nouveau_statut,'message',nouveau_message))::text);
end $$;

create or replace function public.admin_repondre(cible uuid, contenu text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
  insert into public.messages(demande_id,auteur,texte) values(cible,'equipe',contenu);
  perform public.admin_noter('demande:'||cible,'reponse',contenu);
end $$;
revoke all on function public.admin_noter(text,text,text), public.admin_modifier_demande(uuid,text,text), public.admin_repondre(uuid,text) from public, anon;
grant execute on function public.admin_noter(text,text,text), public.admin_modifier_demande(uuid,text,text), public.admin_repondre(uuid,text) to authenticated;
create table if not exists public.admin_missions (
  demande_id uuid not null references public.demandes(id),
  mission_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(demande_id, mission_id)
);
alter table public.admin_missions enable row level security;
revoke all on public.admin_missions from public, anon, authenticated;
grant select on public.admin_missions to authenticated;
drop policy if exists "admin lit les associations" on public.admin_missions;
create policy "admin lit les associations" on public.admin_missions for select to authenticated using(public.est_admin());
create or replace function public.admin_lier_mission(cible uuid, mission uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.est_admin() then raise exception 'Accès administrateur requis' using errcode='42501'; end if;
  insert into public.admin_missions(demande_id,mission_id) values(cible,mission) on conflict do nothing;
  perform public.admin_noter('demande:'||cible,'mission_associee',mission::text);
end $$;
revoke all on function public.admin_lier_mission(uuid,uuid) from public, anon;
grant execute on function public.admin_lier_mission(uuid,uuid) to authenticated;
commit;

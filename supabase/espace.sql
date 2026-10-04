-- =========================================================================
-- FLEMME — base de données de l'espace personnel (Supabase)
-- À coller une seule fois dans Supabase > SQL Editor > New query > Run.
--
-- Une ligne = une demande. Le site l'enregistre en même temps que l'envoi
-- Netlify Forms. L'équipe fait avancer « statut » et écrit « message »
-- depuis Supabase > Table Editor > demandes ; l'utilisateur voit les deux
-- dans son espace (espace.html).
-- =========================================================================

create table if not exists public.demandes (
  id            uuid primary key default gen_random_uuid(),
  ref           text not null unique,                 -- ex. FL-7KQ2M, affichée à l'utilisateur
  user_id       uuid references auth.users (id) on delete set null,
  email         text check (char_length(email) <= 120),
  besoin        text not null check (char_length(besoin) between 1 and 280),
  categorie     text check (char_length(categorie) <= 80),
  echeance      text check (char_length(echeance) <= 40),
  aide_attendue text check (char_length(aide_attendue) <= 600),
  frequence     text check (char_length(frequence) <= 40),
  ambassadeur   boolean not null default false,
  -- recue → en_etude → acceptee → en_cours → terminee, ou refusee
  statut        text not null default 'recue'
                check (statut in ('recue', 'en_etude', 'acceptee', 'en_cours', 'terminee', 'refusee')),
  message       text,                                 -- mot de l'équipe, visible par l'utilisateur
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists demandes_user_id_idx on public.demandes (user_id);
create index if not exists demandes_email_idx on public.demandes (lower(email));

-- Met à jour updated_at à chaque modification (date affichée « mise à jour le »).
create or replace function public.demandes_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists demandes_touch on public.demandes;
create trigger demandes_touch before update on public.demandes
  for each row execute function public.demandes_touch();

-- ---------- Droits ----------
-- Le site (clé publique) peut seulement : déposer une demande, et lire les
-- siennes une fois connecté. Le statut et le message ne se changent que
-- depuis le tableau de bord Supabase (qui n'est pas soumis à ces règles).
alter table public.demandes enable row level security;

revoke all on public.demandes from anon, authenticated;
grant insert (ref, user_id, email, besoin, categorie, echeance, aide_attendue, frequence, ambassadeur)
  on public.demandes to anon, authenticated;
grant select on public.demandes to authenticated;

drop policy if exists "deposer une demande" on public.demandes;
create policy "deposer une demande" on public.demandes
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

-- Une demande est visible par son auteur connecté, ou par la personne dont
-- l'e-mail a servi de contact : se connecter par lien e-mail, Google ou Apple
-- prouve qu'on possède l'adresse (Supabase ne délivre de session qu'à une
-- adresse vérifiée), donc les demandes faites avant l'inscription apparaissent.
drop policy if exists "voir ses demandes" on public.demandes;
create policy "voir ses demandes" on public.demandes
  for select to authenticated
  using (user_id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email'));

-- ---------- Droit à l'effacement (RGPD) ----------
-- Bouton « Supprimer mon compte et mes demandes » de l'espace : supprime les
-- demandes de la personne connectée puis son compte. « security definer » :
-- la fonction a le droit de supprimer le compte, mais uniquement celui de
-- l'appelant (auth.uid()), jamais un autre.
create or replace function public.supprimer_mon_compte() returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid  uuid := auth.uid();
  mail text := lower(auth.jwt() ->> 'email');
begin
  if uid is null then
    raise exception 'Connexion requise';
  end if;
  delete from public.demandes where user_id = uid or (mail is not null and lower(email) = mail);
  delete from auth.users where id = uid;
end $$;

revoke all on function public.supprimer_mon_compte() from public, anon;
grant execute on function public.supprimer_mon_compte() to authenticated;

-- ---------- Discussion par demande ----------
-- Fil de messages entre l'utilisateur et l'équipe, affiché sous chaque demande
-- dans l'espace. L'utilisateur écrit depuis le site (auteur 'client') ;
-- l'équipe répond depuis Supabase > Table Editor > messages > Insert row,
-- avec demande_id, auteur = 'equipe' et texte.
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  demande_id  uuid not null references public.demandes (id) on delete cascade,
  auteur      text not null default 'client' check (auteur in ('client', 'equipe')),
  texte       text not null check (char_length(texte) between 1 and 2000),
  created_at  timestamptz not null default now()
);

create index if not exists messages_demande_idx on public.messages (demande_id, created_at);

alter table public.messages enable row level security;

-- Le site ne choisit ni l'auteur (toujours 'client') ni la date.
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (demande_id, texte) on public.messages to authenticated;

-- Lire et écrire uniquement dans les fils de ses propres demandes : la
-- sous-requête sur demandes applique la règle « voir ses demandes ».
drop policy if exists "lire ses messages" on public.messages;
create policy "lire ses messages" on public.messages
  for select to authenticated
  using (exists (select 1 from public.demandes d where d.id = demande_id));

drop policy if exists "ecrire ses messages" on public.messages;
create policy "ecrire ses messages" on public.messages
  for insert to authenticated
  with check (auteur = 'client' and exists (select 1 from public.demandes d where d.id = demande_id));

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

-- ---------- Pseudo ----------
-- Facultatif : affiché dans l'espace à la place de l'e-mail, et utilisable
-- avec le mot de passe pour se connecter. L'e-mail reste le seul moyen de
-- contact et n'est jamais montré à partir d'un pseudo.
create table if not exists public.profils (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  pseudo      text not null check (pseudo ~ '^[A-Za-z0-9_.-]{3,30}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists profils_pseudo_idx on public.profils (lower(pseudo));

alter table public.profils enable row level security;
revoke all on public.profils from anon, authenticated;
grant select, delete on public.profils to authenticated;
grant insert (user_id, pseudo), update (user_id, pseudo) on public.profils to authenticated; -- upsert du site : la règle ci-dessous empêche de viser un autre compte

drop policy if exists "son profil" on public.profils;
create policy "son profil" on public.profils
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Pseudo choisi à l'inscription (transmis avec le formulaire, avant même la
-- confirmation de l'adresse) : enregistré à la création du compte.
create or replace function public.profil_a_l_inscription() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p text := new.raw_user_meta_data ->> 'pseudo';
begin
  if p ~ '^[A-Za-z0-9_.-]{3,30}$' then
    insert into public.profils (user_id, pseudo) values (new.id, p) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists profil_a_l_inscription on auth.users;
create trigger profil_a_l_inscription after insert on auth.users
  for each row execute function public.profil_a_l_inscription();

-- Le pseudo est-il encore libre ? (vérifié avant l'inscription)
create or replace function public.pseudo_libre(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profils where lower(pseudo) = lower(p));
$$;
revoke all on function public.pseudo_libre(text) from public;
grant execute on function public.pseudo_libre(text) to anon, authenticated;

-- Connexion avec un pseudo : renvoie l'e-mail du compte uniquement si le mot
-- de passe est le bon (le site se connecte ensuite normalement avec), sinon
-- rien. Au-delà de 5 échecs en 15 minutes sur un pseudo, refus temporaire.
create table if not exists public.tentatives_pseudo (
  pseudo  text not null,
  at      timestamptz not null default now()
);
create index if not exists tentatives_pseudo_idx on public.tentatives_pseudo (lower(pseudo), at);
alter table public.tentatives_pseudo enable row level security;
revoke all on public.tentatives_pseudo from anon, authenticated;

create or replace function public.connexion_pseudo(p text, mdp text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  mail text;
  hash text;
begin
  if (select count(*) from public.tentatives_pseudo
      where lower(pseudo) = lower(p) and at > now() - interval '15 minutes') >= 5 then
    raise sqlstate 'PT429' using message = 'Trop de tentatives';
  end if;
  select u.email, u.encrypted_password into mail, hash
    from public.profils pr join auth.users u on u.id = pr.user_id
    where lower(pr.pseudo) = lower(p);
  if hash like '$2%' and hash = extensions.crypt(mdp, hash) then
    delete from public.tentatives_pseudo where lower(pseudo) = lower(p);
    return mail;
  end if;
  insert into public.tentatives_pseudo (pseudo) values (left(p, 60));
  delete from public.tentatives_pseudo where at < now() - interval '1 day';
  return null;
end $$;
revoke all on function public.connexion_pseudo(text, text) from public;
grant execute on function public.connexion_pseudo(text, text) to anon, authenticated;

-- ---------- Équipe Flemme (page equipe.html) ----------
-- Les comptes listés ici voient toutes les demandes, changent leur statut et
-- leur mot, et répondent dans les discussions depuis flemme.org/equipe.html.
-- Ajouter un membre (une fois son compte créé sur l'espace) :
--   insert into public.equipe (user_id)
--   select id from auth.users where email = 'ben.champly@gmail.com'
--   on conflict do nothing;
create table if not exists public.equipe (
  user_id  uuid primary key references auth.users (id) on delete cascade
);
alter table public.equipe enable row level security;
revoke all on public.equipe from anon, authenticated;

create or replace function public.est_equipe() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.equipe where user_id = auth.uid());
$$;
revoke all on function public.est_equipe() from public;
grant execute on function public.est_equipe() to authenticated;

-- L'équipe ne peut modifier que le statut et le mot d'une demande.
grant update (statut, message) on public.demandes to authenticated;

drop policy if exists "equipe voit les demandes" on public.demandes;
create policy "equipe voit les demandes" on public.demandes
  for select to authenticated using (public.est_equipe());

drop policy if exists "equipe suit les demandes" on public.demandes;
create policy "equipe suit les demandes" on public.demandes
  for update to authenticated using (public.est_equipe()) with check (public.est_equipe());

-- Réponses de l'équipe : auteur 'equipe', réservé aux membres. Un client ne
-- peut toujours écrire qu'en 'client' (règle « ecrire ses messages »).
grant insert (auteur) on public.messages to authenticated;

drop policy if exists "equipe lit les messages" on public.messages;
create policy "equipe lit les messages" on public.messages
  for select to authenticated using (public.est_equipe());

drop policy if exists "equipe repond" on public.messages;
create policy "equipe repond" on public.messages
  for insert to authenticated with check (auteur = 'equipe' and public.est_equipe());

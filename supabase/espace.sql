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
-- l'e-mail a servi de contact : se connecter par lien e-mail prouve qu'on
-- possède l'adresse, donc les demandes faites avant l'inscription apparaissent.
drop policy if exists "voir ses demandes" on public.demandes;
create policy "voir ses demandes" on public.demandes
  for select to authenticated
  using (user_id = auth.uid() or lower(email) = lower(auth.jwt() ->> 'email'));

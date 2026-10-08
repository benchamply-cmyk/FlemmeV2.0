-- =========================================================================
-- FLEMME — formulaire enrichi : précisions, pièces jointes, message vocal,
-- et plus de limite de caractères sur la demande.
-- À coller une seule fois dans Supabase > SQL Editor > New query > Run,
-- AVANT de mettre en ligne la version du site qui envoie ces champs.
-- (Sans ce script, l'envoi Netlify fonctionne mais la demande n'apparaît
-- plus dans l'espace personnel ni sur la page équipe.)
--
-- Les fichiers et le message vocal arrivent dans Netlify > Forms > beta-besoins
-- et sont aussi copiés dans Supabase > Storage > pieces-jointes, pour être
-- visibles dans l'espace de l'utilisateur et sur la page équipe.
-- Le script peut être relancé sans risque.
-- =========================================================================

alter table public.demandes add column if not exists precisions text;
alter table public.demandes add column if not exists pieces_jointes smallint not null default 0 check (pieces_jointes between 0 and 3);
alter table public.demandes add column if not exists vocal boolean not null default false;

-- Plus de limite de longueur pour la demande et l'aide attendue.
alter table public.demandes drop constraint if exists demandes_besoin_check;
alter table public.demandes add constraint demandes_besoin_check check (char_length(besoin) >= 1);
alter table public.demandes drop constraint if exists demandes_aide_attendue_check;

grant insert (precisions, pieces_jointes, vocal) on public.demandes to anon, authenticated;

-- ---------- Pièces jointes et message vocal visibles dans l'espace et la page équipe ----------
-- Chemins des fichiers de la demande dans le stockage (ex. FL-7KQ2M/1-devis.pdf).
alter table public.demandes add column if not exists fichiers text[] not null default '{}' check (cardinality(fichiers) <= 4);
grant insert (fichiers) on public.demandes to anon, authenticated;

-- Compartiment privé « pieces-jointes » : 8 Mo par fichier au plus.
insert into storage.buckets (id, name, public, file_size_limit)
values ('pieces-jointes', 'pieces-jointes', false, 8388608)
on conflict (id) do update set public = false, file_size_limit = 8388608;

-- Dépôt : seulement un chemin annoncé dans demandes.fichiers, dans l'heure qui suit
-- la création de la demande. « security definer » : le visiteur n'a pas le droit de lire
-- la table demandes, la fonction vérifie à sa place sans rien lui montrer.
create or replace function public.piece_attendue(chemin text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.demandes d
    where d.ref = split_part(chemin, '/', 1)
      and chemin = any (d.fichiers)
      and d.created_at > now() - interval '1 hour'
  );
$$;
revoke all on function public.piece_attendue(text) from public;
grant execute on function public.piece_attendue(text) to anon, authenticated;

drop policy if exists "deposer une piece jointe" on storage.objects;
create policy "deposer une piece jointe" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'pieces-jointes' and public.piece_attendue(name));

-- Lecture : l'auteur de la demande et l'équipe (la sous-requête applique les règles
-- « voir ses demandes » et « equipe voit les demandes »).
drop policy if exists "voir ses pieces jointes" on storage.objects;
create policy "voir ses pieces jointes" on storage.objects
  for select to authenticated
  using (bucket_id = 'pieces-jointes'
    and exists (select 1 from public.demandes d where d.ref = split_part(name, '/', 1)));

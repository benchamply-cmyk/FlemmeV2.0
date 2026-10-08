-- =========================================================================
-- FLEMME — description détaillée et pièces jointes des demandes
-- À coller une seule fois dans Supabase > SQL Editor > New query > Run,
-- AVANT de mettre en ligne la version du site qui envoie ces champs.
-- (Sans ce script, l'envoi Netlify fonctionne mais la demande n'apparaît
-- plus dans l'espace personnel ni sur la page équipe.)
--
-- Les fichiers eux-mêmes restent dans Netlify > Forms > beta-besoins ;
-- Supabase garde seulement leur nombre.
-- =========================================================================

alter table public.demandes
  add column if not exists details text check (char_length(details) <= 2000);
alter table public.demandes
  add column if not exists pieces_jointes smallint not null default 0 check (pieces_jointes between 0 and 3);

grant insert (details, pieces_jointes) on public.demandes to anon, authenticated;

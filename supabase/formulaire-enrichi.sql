-- =========================================================================
-- FLEMME — formulaire enrichi : précisions, pièces jointes, message vocal,
-- et plus de limite de caractères sur la demande.
-- À coller une seule fois dans Supabase > SQL Editor > New query > Run,
-- AVANT de mettre en ligne la version du site qui envoie ces champs.
-- (Sans ce script, l'envoi Netlify fonctionne mais la demande n'apparaît
-- plus dans l'espace personnel ni sur la page équipe.)
--
-- Les fichiers et le message vocal restent dans Netlify > Forms > beta-besoins ;
-- Supabase garde le texte des précisions, le nombre de fichiers et la
-- présence d'un message vocal.
-- =========================================================================

alter table public.demandes add column if not exists precisions text;
alter table public.demandes add column if not exists pieces_jointes smallint not null default 0 check (pieces_jointes between 0 and 3);
alter table public.demandes add column if not exists vocal boolean not null default false;

-- Plus de limite de longueur pour la demande et l'aide attendue.
alter table public.demandes drop constraint if exists demandes_besoin_check;
alter table public.demandes add constraint demandes_besoin_check check (char_length(besoin) >= 1);
alter table public.demandes drop constraint if exists demandes_aide_attendue_check;

grant insert (precisions, pieces_jointes, vocal) on public.demandes to anon, authenticated;

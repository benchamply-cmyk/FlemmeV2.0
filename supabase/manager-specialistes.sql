-- Spécialistes Netlify, 11 octobre 2026. Après manager-netlify.sql.
-- Ajout uniquement : missions, qualifications et historique conservés.
begin;
alter table public.manager_missions add column if not exists deliveries jsonb not null default '[]';

create or replace function public.manager_livrer(mission uuid, version_attendue integer, requete uuid, donnees jsonb, resultat jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.manager_missions; precedent jsonb; dernier jsonb; a jsonb;
begin
  if not public.est_admin() then raise exception 'Accès admin requis' using errcode='42501'; end if;
  if requete is null or donnees is null or resultat is null or version_attendue is null then
    raise exception 'Commande incomplète' using errcode='22023';
  end if;
  select * into m from public.manager_missions where mission_id=mission for update;
  if not found then raise exception 'Mission introuvable' using errcode='P0002'; end if;
  select value into precedent from jsonb_array_elements(m.deliveries) where value->>'request_id'=requete::text;
  if precedent is not null then
    if precedent->'input' is distinct from donnees then raise exception 'Identifiant réutilisé' using errcode='40001'; end if;
    return to_jsonb(m)||jsonb_build_object('delivery_count',jsonb_array_length(m.deliveries));
  end if;
  if m.revision<>version_attendue or m.job_id is not null or m.state not in ('qualified','in_progress','waiting_information') then
    raise exception 'Mission modifiée ou état incompatible' using errcode='40001';
  end if;
  dernier:=m.turns->-1; a:=dernier->'assessment';
  if (dernier->>'failed') is distinct from 'false' or coalesce(dernier->>'state','') not in ('qualified','waiting_information')
    or (a->>'human_intervention_required') is distinct from 'false'
    or coalesce(a->>'requested_action','') not in ('prepare','compare')
    or coalesce(trim(a->>'objective'),'')=''
    or jsonb_typeof(a->'missing_information') is distinct from 'array'
    or coalesce(a->>'workflow','') not in ('comparer_devis','trouver_prestataire','rechercher_produit','organiser_voyage') then
    raise exception 'Qualification préparatoire complète requise' using errcode='22023';
  end if;
  if (resultat->>'workflow_id') is distinct from (a->>'workflow')
    or (resultat#>>'{quality,passed}') is distinct from 'true'
    or (resultat->'agents') is distinct from '["Search","Compare","Writer","Quality"]'::jsonb
    or (donnees#>>'{facts,immediate_danger}') is distinct from 'false'
    or coalesce(donnees#>>'{facts,requested_action}','') not in ('prepare','compare')
    or coalesce(trim(resultat->>'markdown'),'')='' then
    raise exception 'Livrable invalide' using errcode='22023';
  end if;
  update public.manager_missions set state='in_progress',revision=revision+1,
    turns=case when dernier->>'state'='waiting_information' then turns||jsonb_build_array(jsonb_build_object('state','qualified','failed',false,'created_at',now(),'source','admin_confirmed_constraints','request_text','Contraintes préparatoires confirmées par l’administrateur dans le formulaire des spécialistes','assessment',jsonb_build_object('workflow',a->>'workflow','objective',donnees#>>'{facts,objective}','requested_action',donnees#>>'{facts,requested_action}','human_intervention_required',false,'missing_information','[]'::jsonb,'qualification_questions','[]'::jsonb,'user_response',jsonb_build_object('message','Informations métier obligatoires validées. Les inconnues restantes sont indiquées dans le rapport privé.')))) else turns end,
    deliveries=deliveries||jsonb_build_array(jsonb_build_object('request_id',requete,'created_at',now(),'input',donnees,'result',resultat,'user_id',auth.uid())),
    events=events||jsonb_build_array(jsonb_build_object('kind','specialists_delivery','state','in_progress','note','Search, Compare, Writer et Quality : rapport privé à valider par l’administrateur','created_at',now(),'user_id',auth.uid()))
    where mission_id=mission returning * into m;
  perform public.admin_noter('mission:'||mission,'specialists_delivery','Rapport préparatoire privé enregistré. Aucune action externe.');
  return to_jsonb(m)||jsonb_build_object('delivery_count',jsonb_array_length(m.deliveries));
end $$;
revoke all on function public.manager_livrer(uuid,integer,uuid,jsonb,jsonb) from public, anon;
grant execute on function public.manager_livrer(uuid,integer,uuid,jsonb,jsonb) to authenticated;
commit;

-- Manager Netlify, 11 octobre 2026. Après gestionadmin.sql.
-- Données existantes et Manager Python conservés. Aucun secret requis ici.
begin;
create table if not exists public.manager_missions (
  mission_id uuid primary key default gen_random_uuid(),
  demande_id uuid not null unique references public.demandes(id),
  state text not null default 'waiting_information' check(state in ('waiting_information','qualifying','qualified','human_required','out_of_catalog','in_progress','blocked','completed')),
  revision integer not null default 0,
  job_id uuid,
  started_at timestamptz,
  turns jsonb not null default '[]',
  events jsonb not null default '[]',
  created_at timestamptz not null default now()
);
alter table public.manager_missions enable row level security;
revoke all on public.manager_missions from public, anon, authenticated;
grant select on public.manager_missions to authenticated;
drop policy if exists "proprietaire lit manager" on public.manager_missions;
create policy "proprietaire lit manager" on public.manager_missions for select to authenticated using(public.est_admin());

-- Verrou transactionnel avant l'appel IA : un seul appel actif par demande.
create or replace function public.manager_reserver(cible uuid, travail uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.manager_missions; d public.demandes; brief text;
begin
  if not public.est_admin() then raise exception 'Accès admin requis' using errcode='42501'; end if;
  select * into d from public.demandes where id=cible;
  if not found then raise exception 'Demande introuvable' using errcode='P0002'; end if;
  insert into public.manager_missions(demande_id) values(cible) on conflict(demande_id) do nothing;
  select * into m from public.manager_missions where demande_id=cible for update;
  if m.job_id is not null and m.started_at > now()-interval '15 minutes' then
    raise exception 'Qualification déjà en cours' using errcode='40001';
  end if;
  if m.state in ('in_progress','completed','blocked') then raise exception 'État incompatible avec une qualification' using errcode='40001'; end if;
  brief := concat_ws(E'\n',d.besoin,d.precisions,'Catégorie : '||d.categorie,'Échéance : '||d.echeance,'Aide attendue : '||d.aide_attendue);
  if char_length(brief)>10000 then raise exception 'Brief trop long' using errcode='22023'; end if;
  update public.manager_missions set state='qualifying', job_id=travail,started_at=now(),revision=revision+1,
    events=events||jsonb_build_array(jsonb_build_object('kind','qualification_started','state','qualifying','note','Qualification demandée par l’administrateur','created_at',now(),'user_id',auth.uid()))
    where mission_id=m.mission_id returning * into m;
  insert into public.admin_missions(demande_id,mission_id) values(cible,m.mission_id) on conflict do nothing;
  perform public.admin_noter('demande:'||cible,'qualification_manager','Qualification lancée : '||m.mission_id);
  return jsonb_build_object('mission_id',m.mission_id,'job_id',travail,'request_text',brief);
end $$;

-- Le résultat reste conservé si l'admin bloque pendant l'appel IA.
create or replace function public.manager_terminer(mission uuid, travail uuid, resultat jsonb, erreur boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.manager_missions; nouvel_etat text;
begin
  if not public.est_admin() then raise exception 'Accès admin requis' using errcode='42501'; end if;
  select * into m from public.manager_missions where mission_id=mission for update;
  if not found then raise exception 'Mission introuvable' using errcode='P0002'; end if;
  if m.job_id is distinct from travail then raise exception 'Exécution remplacée' using errcode='40001'; end if;
  nouvel_etat := case when m.state='blocked' then 'blocked' when erreur then 'waiting_information' else resultat->>'state' end;
  if nouvel_etat not in ('blocked','waiting_information','qualified','human_required','out_of_catalog') then raise exception 'Résultat invalide' using errcode='22023'; end if;
  update public.manager_missions set state=nouvel_etat,job_id=null,started_at=null,revision=revision+1,
    turns=turns||jsonb_build_array(resultat||jsonb_build_object('created_at',now(),'failed',erreur)),
    events=events||jsonb_build_array(jsonb_build_object('kind',case when erreur then 'qualification_failed' else 'qualification_saved' end,'state',nouvel_etat,'note',case when erreur then 'Qualification échouée, relance possible' else 'Qualification conservée, aucune action externe effectuée' end,'created_at',now(),'user_id',auth.uid()))
    where mission_id=mission returning * into m;
  perform public.admin_noter('mission:'||mission,'qualification_manager',case when erreur then 'Échec de qualification' else 'Résultat enregistré' end);
  return to_jsonb(m)||jsonb_build_object('deliveries','[]'::jsonb,'delivery_count',0);
end $$;

create or replace function public.manager_commander(mission uuid, nouvel_etat text, motif text, version_attendue integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m public.manager_missions;
begin
  if not public.est_admin() then raise exception 'Accès admin requis' using errcode='42501'; end if;
  if char_length(trim(motif)) not between 1 and 2000 then raise exception 'Motif requis' using errcode='22023'; end if;
  select * into m from public.manager_missions where mission_id=mission for update;
  if not found then raise exception 'Mission introuvable' using errcode='P0002'; end if;
  if m.revision<>version_attendue then raise exception 'Révision modifiée' using errcode='40001'; end if;
  if not ((m.state in ('qualified','human_required','in_progress','qualifying') and nouvel_etat='blocked')
    or (m.state in ('qualified','human_required','blocked') and nouvel_etat='in_progress' and m.job_id is null)
    or (m.state='in_progress' and nouvel_etat='completed')) then raise exception 'Transition refusée' using errcode='22023'; end if;
  update public.manager_missions set state=nouvel_etat,revision=revision+1,
    events=events||jsonb_build_array(jsonb_build_object('kind','admin_state','state',nouvel_etat,'note',motif,'created_at',now(),'user_id',auth.uid()))
    where mission_id=mission returning * into m;
  perform public.admin_noter('mission:'||mission,nouvel_etat,motif);
  return to_jsonb(m)||jsonb_build_object('deliveries','[]'::jsonb,'delivery_count',0);
end $$;
revoke all on function public.manager_reserver(uuid,uuid),public.manager_terminer(uuid,uuid,jsonb,boolean),public.manager_commander(uuid,text,text,integer) from public, anon;
grant execute on function public.manager_reserver(uuid,uuid),public.manager_terminer(uuid,uuid,jsonb,boolean),public.manager_commander(uuid,text,text,integer) to authenticated;
commit;

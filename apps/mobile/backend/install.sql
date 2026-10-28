-- FLEMME mobile, installation additive du 28/10/2026.
-- À appliquer une fois sur un environnement de test. Ne modifie aucune table du site/Manager.
-- Une installation déjà présente échoue et annule la transaction, sans remplacement.
begin;
create schema flemme_mobile_v1;
revoke all on schema flemme_mobile_v1 from public, anon, authenticated;
create table flemme_mobile_v1.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  document jsonb not null,
  created_at timestamptz not null default now()
);
create index mobile_owner on flemme_mobile_v1.tasks(owner_id);
create index mobile_status on flemme_mobile_v1.tasks((document->>'status'));
create table flemme_mobile_v1.requests (
  actor_id uuid not null references auth.users(id), request_id uuid not null,
  action text not null, task_id uuid, payload jsonb not null, result jsonb not null,
  primary key(actor_id, request_id)
);
alter table flemme_mobile_v1.tasks enable row level security;
alter table flemme_mobile_v1.requests enable row level security;
-- Pas de droits directs ni de politiques permissives : seul le service transactionnel ci-dessous écrit.
revoke all on all tables in schema flemme_mobile_v1 from public, anon, authenticated;

create function flemme_mobile_v1.required_text(v jsonb, max_length integer)
returns text language plpgsql immutable set search_path = '' as $$
declare result text;
begin
  if jsonb_typeof(v) is distinct from 'string' then raise exception 'Texte requis'; end if;
  result := btrim(v #>> '{}');
  if length(result) < 1 or length(result) > max_length then raise exception 'Texte invalide'; end if;
  return result;
end $$;
create function flemme_mobile_v1.amount(v jsonb)
returns integer language plpgsql immutable set search_path = '' as $$
declare result numeric;
begin
  if jsonb_typeof(v) is distinct from 'number' then raise exception 'Montant invalide'; end if;
  result := (v #>> '{}')::numeric;
  if result <> trunc(result) or result < 1 or result > 1000000 then raise exception 'Montant invalide'; end if;
  return result::integer;
end $$;
create function flemme_mobile_v1.visible(doc jsonb, actor uuid)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare result jsonb := doc;
begin
  if doc->'owner'->>'id' = actor::text then return doc; end if;
  result := jsonb_set(result, '{offers}', coalesce((select jsonb_agg(o) from jsonb_array_elements(doc->'offers') o where o->'brigadier'->>'id' = actor::text), '[]'::jsonb));
  if doc->'agreement'->'brigadier'->>'id' is distinct from actor::text then
    result := result - 'agreement' - 'acceptedOfferId' - 'paymentDeclared' - 'paymentConfirmed';
    result := jsonb_set(result, '{reports}', '[]'::jsonb);
  end if;
  return result;
end $$;

-- SECURITY DEFINER nécessaire pour des écritures atomiques sans accorder UPDATE sur les documents.
-- Hors des schémas exposés, search_path vide, authentification + propriété vérifiées à chaque action.
create function flemme_mobile_v1.execute(p_action text, p_task uuid, p_data jsonb, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); actor jsonb; doc jsonb; oid uuid; result jsonb; previous record;
  owner boolean; chosen boolean; offer jsonb; offers jsonb; entry jsonb; idx integer; found_idx integer := -1;
  cents integer; fees integer; at text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  event_text text; budget integer; input_name text;
begin
  if uid is null or coalesce((auth.jwt()->>'is_anonymous')::boolean, false) or
    not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'Connexion avec un compte confirmé requise' using errcode='42501';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'Données invalides'; end if;
  input_name := flemme_mobile_v1.required_text(p_data->'actorName',40);
  actor := jsonb_build_object('id',uid,'name',input_name);
  if p_action = 'list' then
    select jsonb_build_object('tasks',coalesce(jsonb_agg(flemme_mobile_v1.visible(t.document,uid) order by t.created_at desc,t.id), '[]'::jsonb)) into result
    from flemme_mobile_v1.tasks t where t.document->>'status'='open' or t.owner_id=uid
      or exists(select 1 from jsonb_array_elements(t.document->'offers') o where o->'brigadier'->>'id'=uid::text);
    return result;
  end if;
  if p_request is null then raise exception 'Identifiant de requête requis'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || p_request::text, 0));
  select * into previous from flemme_mobile_v1.requests where actor_id=uid and request_id=p_request;
  if found then
    if previous.action <> p_action or previous.task_id is distinct from p_task or previous.payload <> p_data then raise exception 'Identifiant déjà utilisé pour une autre action'; end if;
    return previous.result;
  end if;
  if p_action = 'create' then
    if p_data->'budget' is not null and p_data->'budget' <> 'null'::jsonb then budget := flemme_mobile_v1.amount(p_data->'budget'); end if;
    oid := gen_random_uuid();
    doc := jsonb_build_object('id',oid,'owner',actor,'title',flemme_mobile_v1.required_text(p_data->'title',100),
      'details',flemme_mobile_v1.required_text(p_data->'details',1000),'place',flemme_mobile_v1.required_text(p_data->'place',100),
      'budget',budget,'status','open','createdAt',at,'offers','[]'::jsonb,'reports','[]'::jsonb,
      'history',jsonb_build_array(jsonb_build_object('text','Flemme publiée · sans expiration','at',at)));
    insert into flemme_mobile_v1.tasks(id,owner_id,document) values(oid,uid,doc);
  else
    select document into doc from flemme_mobile_v1.tasks where id=p_task for update;
    if not found then raise exception 'Flemme introuvable'; end if;
    owner := doc->'owner'->>'id'=uid::text;
    chosen := coalesce(doc->'agreement'->'brigadier'->>'id'=uid::text,false);
    if p_action in ('accept','decline','message') then
      for entry, idx in select value, (ordinality-1)::integer from jsonb_array_elements(doc->'offers') with ordinality loop
        if entry->>'id' = p_data->>'offerId' then offer := entry; found_idx := idx; end if;
      end loop;
      if found_idx < 0 then raise exception 'Proposition introuvable'; end if;
    end if;
    if p_action = 'offer' then
      if owner or doc->>'status'<>'open' then raise exception 'Flemme indisponible'; end if;
      if exists(select 1 from jsonb_array_elements(doc->'offers') o where o->'brigadier'->>'id'=uid::text and o->>'status'='pending') then raise exception 'Proposition déjà en attente'; end if;
      cents := flemme_mobile_v1.amount(p_data->'amount');
      offer := jsonb_build_object('id',gen_random_uuid(),'brigadier',actor,'amount',cents,
        'slot',flemme_mobile_v1.required_text(p_data->'slot',100),'scope',flemme_mobile_v1.required_text(p_data->'scope',1000),'status','pending','messages','[]'::jsonb);
      doc := jsonb_set(doc,'{offers}',(doc->'offers') || jsonb_build_array(offer)); event_text := 'Proposition reçue';
    elsif p_action = 'message' then
      if not owner and offer->'brigadier'->>'id'<>uid::text then raise exception 'Discussion inaccessible' using errcode='42501'; end if;
      doc := jsonb_set(doc,array['offers',found_idx::text,'messages'],(offer->'messages') || jsonb_build_array(jsonb_build_object('actor',actor,'text',flemme_mobile_v1.required_text(p_data->'text',1000),'at',at)));
      event_text := 'Message ajouté à une discussion';
    elsif p_action in ('accept','decline') then
      if not owner or doc->>'status'<>'open' or offer->>'status'<>'pending' then raise exception 'Offre indisponible' using errcode='42501'; end if;
      if p_action = 'decline' then
        doc := jsonb_set(doc,array['offers',found_idx::text,'status'],'"declined"'::jsonb); event_text := 'Proposition déclinée · historique conservé';
      else
        cents := (offer->>'amount')::integer; fees := round(cents::numeric/10)::integer;
        doc := doc || jsonb_build_object('status','assigned','acceptedOfferId',offer->>'id','agreement',jsonb_build_object('amount',cents,'commission',fees,'total',cents+fees,'slot',offer->>'slot','scope',offer->>'scope','brigadier',offer->'brigadier'));
        select jsonb_agg(case when o->>'status'='pending' then jsonb_set(o,'{status}',to_jsonb(case when o->>'id'=offer->>'id' then 'accepted' else 'not_selected' end)) else o end) into offers from jsonb_array_elements(doc->'offers') o;
        doc := jsonb_set(doc,'{offers}',offers); event_text := 'Accord accepté · forfait et commission de 10 % confirmés';
      end if;
    elsif p_action = 'complete' then
      if not owner or doc->>'status'<>'assigned' then raise exception 'Fin de tâche non autorisée' using errcode='42501'; end if;
      doc := jsonb_set(doc,'{status}','"completed"'::jsonb); event_text := 'Tâche déclarée terminée par le déposant';
    elsif p_action = 'declare_payment' then
      if not owner or doc->>'status'<>'completed' or coalesce((doc->>'paymentDeclared')::boolean,false) then raise exception 'Déclaration non autorisée' using errcode='42501'; end if;
      doc := doc || '{"paymentDeclared":true}'::jsonb; event_text := 'Paiement direct déclaré par le déposant · non vérifié';
    elsif p_action = 'confirm_payment' then
      if not chosen or not coalesce((doc->>'paymentDeclared')::boolean,false) or coalesce((doc->>'paymentConfirmed')::boolean,false) then raise exception 'Confirmation non autorisée' using errcode='42501'; end if;
      doc := doc || '{"paymentConfirmed":true}'::jsonb; event_text := 'Réception du paiement confirmée par le Brigadier · non vérifiée par une banque';
    elsif p_action = 'report' then
      if not owner and not chosen then raise exception 'Signalement inaccessible' using errcode='42501'; end if;
      doc := jsonb_set(doc,'{reports}',(doc->'reports') || jsonb_build_array(jsonb_build_object('actor',actor,'text',flemme_mobile_v1.required_text(p_data->'text',1000),'at',at)));
      event_text := 'Désaccord signalé · examen humain demandé';
    else raise exception 'Action inconnue';
    end if;
    doc := jsonb_set(doc,'{history}',(doc->'history') || jsonb_build_array(jsonb_build_object('text',event_text,'at',at)));
    update flemme_mobile_v1.tasks set document=doc where id=p_task;
  end if;
  result := jsonb_build_object('task',flemme_mobile_v1.visible(doc,uid));
  insert into flemme_mobile_v1.requests(actor_id,request_id,action,task_id,payload,result) values(uid,p_request,p_action,p_task,p_data,result);
  return result;
end $$;
revoke all on all functions in schema flemme_mobile_v1 from public, anon, authenticated;
grant usage on schema flemme_mobile_v1 to authenticated;
grant execute on function flemme_mobile_v1.execute(text,uuid,jsonb,uuid) to authenticated;
-- Seul point d'entrée exposé, invoker : aucune clé privilégiée côté mobile.
create function public.flemme_mobile_api(p_action text,p_task uuid default null,p_data jsonb default '{}',p_request uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select flemme_mobile_v1.execute(p_action,p_task,p_data,p_request);
$$;
revoke all on function public.flemme_mobile_api(text,uuid,jsonb,uuid) from public,anon;
grant execute on function public.flemme_mobile_api(text,uuid,jsonb,uuid) to authenticated;
commit;

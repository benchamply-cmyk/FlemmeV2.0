-- Requires manager-memory-v2-20261014.sql. Additive: V2 RPC and tables unchanged.
begin;
create schema if not exists fm_v3;
revoke all on schema fm_v3 from public,anon,authenticated;
grant usage on schema fm_v3 to authenticated;
create table if not exists fm_v3.runs (
  id uuid primary key,
  conversation_id uuid not null references fm_v2.conversations(id),
  input jsonb not null,
  starting_revision bigint not null,
  workflow_id text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists fm_v3.outputs (
  run_id uuid primary key references fm_v3.runs(id),
  payload jsonb not null,
  stale boolean not null,
  created_at timestamptz not null default clock_timestamp()
);
-- Recovery gets its own immutable outcome so a late result can still be preserved.
create table if not exists fm_v3.recoveries (
  run_id uuid primary key references fm_v3.runs(id),
  note text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists fm_v3_runs_conversation on fm_v3.runs(conversation_id,created_at,id);
do $install$
declare t text;
begin
foreach t in array array['runs','outputs','recoveries'] loop
  execute format('alter table fm_v3.%I enable row level security',t);
  execute format('revoke all on fm_v3.%I from public,anon,authenticated',t);
  execute format('grant select on fm_v3.%I to authenticated',t);
  if not exists(select 1 from pg_trigger where tgrelid=format('fm_v3.%I',t)::regclass and tgname='immutable') then
    execute format('create trigger immutable before update or delete on fm_v3.%I for each row execute function fm_v2.immutable()',t);
    execute format('create trigger no_truncate before truncate on fm_v3.%I for each statement execute function fm_v2.immutable()',t);
  end if;
  if not exists(select 1 from pg_policy where polrelid=format('fm_v3.%I',t)::regclass and polname='owner_read') then
    if t='runs' then
      execute 'create policy owner_read on fm_v3.runs for select to authenticated using (exists('
        'select 1 from fm_v2.conversations c where c.id=conversation_id and c.owner_id=(select auth.uid())))';
    else
      execute format('create policy owner_read on fm_v3.%I for select to authenticated using (exists('
        'select 1 from fm_v3.runs r where r.id=run_id))',t);
    end if;
  end if;
end loop;
end $install$;
do $install$
begin
if to_regprocedure('public.fm_v3_delivery_command(text,uuid,uuid,bigint,jsonb)') is null then
execute $ddl$
create function public.fm_v3_delivery_command(p_operation text,p_conversation_id uuid,
  p_request_id uuid default null,p_expected_revision bigint default null,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
declare uid uuid:=auth.uid(); snap jsonb; attempt fm_v3.runs; outcome fm_v3.outputs;
  rev bigint; state text; qualification jsonb; stale boolean; recovered boolean;
begin
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  perform 1 from fm_v2.conversations where id=p_conversation_id and owner_id=uid for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if p_operation='list' then
    return coalesce((select jsonb_agg(jsonb_build_object('run',to_jsonb(r),'output',to_jsonb(o),
      'recovery',to_jsonb(x)) order by r.created_at,r.id)
      from fm_v3.runs r left join fm_v3.outputs o on o.run_id=r.id
      left join fm_v3.recoveries x on x.run_id=r.id where r.conversation_id=p_conversation_id),'[]'::jsonb);
  end if;
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>500000 then
    raise exception 'Invalid request' using errcode='PT422';
  end if;
  snap:=fm_v2.snapshot(p_conversation_id); rev:=(snap->>'revision')::bigint; state:=snap->'mission'->>'state';
  select * into attempt from fm_v3.runs where id=p_request_id;
  if found and attempt.conversation_id<>p_conversation_id then raise exception 'Id conflict' using errcode='PT409'; end if;
  if p_operation='reserve' then
    if attempt.id is not null then
      if attempt.input<>p_payload then raise exception 'Different input' using errcode='PT409'; end if;
      select * into outcome from fm_v3.outputs where run_id=p_request_id;
      return jsonb_build_object('run',to_jsonb(attempt),'output',case when outcome.run_id is null then null else to_jsonb(outcome) end,
        'replayed',true,'snapshot',snap);
    end if;
    if jsonb_typeof(p_payload->'sources') is distinct from 'array' or jsonb_array_length(p_payload->'sources') not between 1 and 20
       or length(p_payload::text)>200000 then raise exception 'Invalid evidence' using errcode='PT422'; end if;
    if p_expected_revision is distinct from rev or snap->>'pending_request_id' is not null
       or state not in ('qualified','in_progress') then raise exception 'Mission conflict' using errcode='PT409'; end if;
    select assessment into qualification from fm_v2.messages where conversation_id=p_conversation_id and assessment is not null order by revision desc limit 1;
    if qualification->>'mission_status' is distinct from 'ready' or qualification->'selected_workflow'->>'workflow_id' is null then
      raise exception 'Qualified mission required' using errcode='PT409'; end if;
    if exists(select 1 from fm_v3.runs r where r.conversation_id=p_conversation_id
      and not exists(select 1 from fm_v3.outputs o where o.run_id=r.id)
      and not exists(select 1 from fm_v3.recoveries x where x.run_id=r.id))
      or exists(select 1 from fm_v2.events where conversation_id=p_conversation_id and request_id=p_request_id) then
      raise exception 'Execution pending or reused id' using errcode='PT409'; end if;
    insert into fm_v3.runs(id,conversation_id,input,starting_revision,workflow_id)
      values(p_request_id,p_conversation_id,p_payload,rev,qualification->'selected_workflow'->>'workflow_id') returning * into attempt;
    insert into fm_v2.events(conversation_id,request_id,revision,kind,state,payload)
      values(p_conversation_id,p_request_id,rev+1,'action','in_progress',jsonb_build_object('note','Exécution des spécialistes sur sources fournies.','run_id',p_request_id));
    return jsonb_build_object('run',to_jsonb(attempt),'output',null,'replayed',false,'snapshot',fm_v2.snapshot(p_conversation_id));
  end if;
  if attempt.id is null then raise exception 'Run not found' using errcode='PT404'; end if;
  select * into outcome from fm_v3.outputs where run_id=p_request_id;
  if p_operation='finish' then
    if outcome.run_id is not null then
      if outcome.payload<>p_payload then raise exception 'Different output' using errcode='PT409'; end if;
      return jsonb_build_object('run',to_jsonb(attempt),'output',to_jsonb(outcome),'replayed',true,'snapshot',snap);
    end if;
    if p_payload->'result' is not null then
      if p_payload->'result'->>'workflow_id' is distinct from attempt.workflow_id
        or p_payload->'result'->'quality'->>'passed' is distinct from 'true'
        or p_payload->'result'->'agents' is distinct from '["Search","Compare","Writer","Quality"]'::jsonb
        or jsonb_typeof(p_payload->'result'->'markdown') is distinct from 'string' then
        raise exception 'Invalid result' using errcode='PT422'; end if;
    elsif p_payload->>'failure' not in ('insufficient_evidence','quality_or_qualification','execution_error')
       or p_payload->>'failure' is null then raise exception 'Missing outcome' using errcode='PT422'; end if;
    recovered:=exists(select 1 from fm_v3.recoveries where run_id=p_request_id);
    stale:= recovered or rev<>attempt.starting_revision+1 or state<>'in_progress';
    insert into fm_v3.outputs(run_id,payload,stale) values(p_request_id,p_payload,stale) returning * into outcome;
    insert into fm_v2.events(conversation_id,request_id,revision,kind,payload)
      values(p_conversation_id,p_request_id,rev+1,'result',jsonb_build_object('note',
        case when stale then 'Résultat conservé après modification de mission ; validation humaine requise.'
        when p_payload->>'failure' is not null then 'Production non aboutie ; tentative conservée.'
        else 'Livrable des quatre spécialistes conservé.' end,'run_id',p_request_id,'stale',stale));
    return jsonb_build_object('run',to_jsonb(attempt),'output',to_jsonb(outcome),'snapshot',fm_v2.snapshot(p_conversation_id));
  elsif p_operation='recover' then
    if outcome.run_id is not null or exists(select 1 from fm_v3.recoveries where run_id=p_request_id)
      or p_expected_revision is distinct from rev or attempt.created_at>clock_timestamp()-interval '5 minutes' then
      raise exception 'Recovery conflict' using errcode='PT409'; end if;
    if jsonb_typeof(p_payload->'note') is distinct from 'string' or length(trim(p_payload->>'note')) not between 1 and 300 then
      raise exception 'Invalid note' using errcode='PT422'; end if;
    insert into fm_v3.recoveries(run_id,note) values(p_request_id,p_payload->>'note');
    insert into fm_v2.events(conversation_id,request_id,revision,kind,payload)
      values(p_conversation_id,p_request_id,rev+1,'failure',jsonb_build_object('note','Récupération explicite des spécialistes ; sources conservées.','run_id',p_request_id));
    return jsonb_build_object('run',to_jsonb(attempt),'recovered',true,'snapshot',fm_v2.snapshot(p_conversation_id));
  else raise exception 'Unknown operation' using errcode='PT422'; end if;
end;
$fn$;
$ddl$;
end if;
end $install$;
revoke all on function public.fm_v3_delivery_command(text,uuid,uuid,bigint,jsonb) from public,anon;
grant execute on function public.fm_v3_delivery_command(text,uuid,uuid,bigint,jsonb) to authenticated;
commit;

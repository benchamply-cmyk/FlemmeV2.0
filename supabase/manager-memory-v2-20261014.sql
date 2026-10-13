-- Flemme Manager V2, 2026-10-14. Additive, repeatable, no realtime/webhook.
-- No existing Manager/Netlify/SQLite table is altered. No service_role in API.
begin;
create schema if not exists fm_v2;
revoke all on schema fm_v2 from public, anon, authenticated;
grant usage on schema fm_v2 to authenticated;

create table if not exists fm_v2.conversations (
  id uuid primary key,
  owner_id uuid not null, -- deliberately no cascade from auth.users
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists fm_v2.missions (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references fm_v2.conversations(id),
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists fm_v2.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references fm_v2.conversations(id),
  request_id uuid not null,
  revision bigint not null check (revision > 0),
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 50000),
  assessment jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id, request_id, role),
  unique(conversation_id, revision)
);
create table if not exists fm_v2.events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references fm_v2.conversations(id),
  request_id uuid not null,
  revision bigint not null check (revision >= 0),
  kind text not null check (kind in ('created','user','qualification','failure','late_result','status','action','result')),
  state text check (state in ('draft','qualified','waiting_information','human_required','out_of_catalog',
                             'in_progress','blocked','completed','cancelled')),
  payload jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  unique(conversation_id, revision),
  unique(conversation_id, request_id, kind)
);
create index if not exists fm_v2_conversations_owner on fm_v2.conversations(owner_id, created_at, id);

-- Helpers remain private: schema privileges do not imply EXECUTE.
do $install$
begin
if to_regprocedure('fm_v2.immutable()') is null then
execute $ddl$
create function fm_v2.immutable() returns trigger language plpgsql
set search_path = pg_catalog as $fn$
begin raise exception 'Append-only memory' using errcode = '42501'; end;
$fn$;
$ddl$;
end if;
end $install$;

do $policies$
declare t text;
begin
foreach t in array array['conversations','missions','messages','events'] loop
  execute format('alter table fm_v2.%I enable row level security', t);
  execute format('revoke all on fm_v2.%I from public, anon, authenticated', t);
  execute format('grant select on fm_v2.%I to authenticated', t);
  if not exists (select 1 from pg_trigger where tgrelid = format('fm_v2.%I',t)::regclass
                 and tgname = 'fm_v2_immutable') then
    execute format('create trigger fm_v2_immutable before update or delete on fm_v2.%I '
                   'for each row execute function fm_v2.immutable()', t);
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = format('fm_v2.%I',t)::regclass
                 and tgname = 'fm_v2_no_truncate') then
    execute format('create trigger fm_v2_no_truncate before truncate on fm_v2.%I '
                   'for each statement execute function fm_v2.immutable()', t);
  end if;
  if not exists (select 1 from pg_policy where polrelid = format('fm_v2.%I',t)::regclass
                 and polname = 'owner_read') then
    if t = 'conversations' then
      execute 'create policy owner_read on fm_v2.conversations for select to authenticated '
              'using (owner_id = (select auth.uid()))';
    else
      execute format('create policy owner_read on fm_v2.%I for select to authenticated '
                     'using (exists (select 1 from fm_v2.conversations c '
                     'where c.id = conversation_id and c.owner_id = (select auth.uid())))', t);
    end if;
  end if;
end loop;
end $policies$;

do $install$
begin
if to_regprocedure('fm_v2.snapshot(uuid)') is null then
execute $ddl$
create function fm_v2.snapshot(cid uuid) returns jsonb language sql stable
set search_path = pg_catalog as $fn$
select jsonb_build_object(
  'id', c.id, 'created_at', c.created_at,
  'revision', coalesce((select max(revision) from fm_v2.events where conversation_id=c.id),0),
  'mission', (select jsonb_build_object('id', m.id, 'created_at', m.created_at,
    'state', (select state from fm_v2.events where conversation_id=c.id and state is not null
              order by revision desc limit 1)) from fm_v2.missions m where m.conversation_id=c.id),
  'pending_request_id', (select u.request_id from fm_v2.messages u
     where u.conversation_id=c.id and u.role='user'
       and not exists (select 1 from fm_v2.events e where e.conversation_id=c.id
                       and e.request_id=u.request_id and e.kind in ('qualification','failure'))
     order by revision desc limit 1),
  'messages', coalesce((select jsonb_agg(to_jsonb(m) order by m.revision)
                        from fm_v2.messages m where m.conversation_id=c.id),'[]'::jsonb),
  'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.revision)
                      from fm_v2.events e where e.conversation_id=c.id),'[]'::jsonb)
) from fm_v2.conversations c where c.id=cid;
$fn$;
$ddl$;
end if;
end $install$;

do $install$
begin
if to_regprocedure('public.fm_v2_command(text,uuid,uuid,bigint,jsonb)') is null then
execute $ddl$
create function public.fm_v2_command(p_operation text, p_conversation_id uuid default null,
  p_request_id uuid default null, p_expected_revision bigint default null, p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = pg_catalog as $fn$
declare
  uid uuid := auth.uid();
  snap jsonb;
  prior fm_v2.messages;
  old_event fm_v2.events;
  rev bigint;
  current_state text;
  next_state text;
  event_kind text;
  pending uuid;
  allowed boolean;
begin
  if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text)>60000 then
    raise exception 'Invalid payload' using errcode='PT422';
  end if;
  if p_operation='list' then
    if coalesce((p_payload->>'limit')::int,20) not between 1 and 100
       or coalesce((p_payload->>'offset')::int,0)<0 then
      raise exception 'Invalid page' using errcode='PT422';
    end if;
    return coalesce((select jsonb_agg(to_jsonb(q)) from (
      select c.id, c.created_at, m.id as mission_id,
        (select max(revision) from fm_v2.events where conversation_id=c.id) as revision,
        (select state from fm_v2.events where conversation_id=c.id and state is not null
         order by revision desc limit 1) as state
      from fm_v2.conversations c join fm_v2.missions m on m.conversation_id=c.id
      where c.owner_id=uid order by c.created_at desc,c.id
      limit coalesce((p_payload->>'limit')::int,20) offset coalesce((p_payload->>'offset')::int,0)
    ) q),'[]'::jsonb);
  end if;
  if p_conversation_id is null then raise exception 'Missing id' using errcode='PT422'; end if;
  if p_operation='create' then
    -- Conflict waits for any concurrent creator. No update of an existing row.
    insert into fm_v2.conversations(id,owner_id) values(p_conversation_id,uid) on conflict do nothing;
  end if;
  -- One conversation lock serializes message/event writes and snapshots across sessions.
  perform 1 from fm_v2.conversations where id=p_conversation_id and owner_id=uid for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if p_operation='create' then
    insert into fm_v2.missions(conversation_id) values(p_conversation_id) on conflict do nothing;
    insert into fm_v2.events(conversation_id,request_id,revision,kind,state)
      values(p_conversation_id,p_conversation_id,0,'created','draft') on conflict do nothing;
    return fm_v2.snapshot(p_conversation_id);
  end if;
  snap := fm_v2.snapshot(p_conversation_id);
  if p_operation='snapshot' then return snap; end if;
  rev := (snap->>'revision')::bigint;
  current_state := snap->'mission'->>'state';
  pending := (snap->>'pending_request_id')::uuid;
  if p_request_id is null then raise exception 'Missing request id' using errcode='PT422'; end if;

  if p_operation='user' then
    if jsonb_typeof(p_payload->'content') is distinct from 'string'
       or length(trim(p_payload->>'content')) not between 1 and 5000 then
      raise exception 'Invalid message' using errcode='PT422';
    end if;
    select * into prior from fm_v2.messages where conversation_id=p_conversation_id
      and request_id=p_request_id and role='user';
    if found then
      if prior.content<>p_payload->>'content' then raise exception 'Id reused' using errcode='PT409'; end if;
      return snap || jsonb_build_object('replayed',true);
    end if;
    if exists(select 1 from fm_v2.events where conversation_id=p_conversation_id and request_id=p_request_id)
       or pending is not null or p_expected_revision is distinct from rev
       or current_state in ('in_progress','blocked','completed','cancelled') then
      raise exception 'Conflict' using errcode='PT409';
    end if;
    insert into fm_v2.messages(conversation_id,request_id,revision,role,content)
      values(p_conversation_id,p_request_id,rev+1,'user',p_payload->>'content');
    insert into fm_v2.events(conversation_id,request_id,revision,kind,payload)
      values(p_conversation_id,p_request_id,rev+1,'user',p_payload);

  elsif p_operation in ('assessment','failure','recover') then
    event_kind := case when p_operation='assessment' then 'qualification' else 'failure' end;
    select * into old_event from fm_v2.events where conversation_id=p_conversation_id
      and request_id=p_request_id and kind=event_kind;
    if found then
      if old_event.payload<>p_payload then raise exception 'Id reused' using errcode='PT409'; end if;
      return snap || jsonb_build_object('replayed',true);
    end if;
    if pending is distinct from p_request_id then
      -- Preserve a model result arriving after explicit crash recovery without changing state.
      if p_operation='assessment' and exists(select 1 from fm_v2.events
         where conversation_id=p_conversation_id and request_id=p_request_id and kind='failure') then
        event_kind := 'late_result';
        select * into old_event from fm_v2.events where conversation_id=p_conversation_id
          and request_id=p_request_id and kind='late_result';
        if found then
          if old_event.payload<>p_payload then raise exception 'Id reused' using errcode='PT409'; end if;
          return snap || jsonb_build_object('replayed',true);
        end if;
      else raise exception 'No pending turn' using errcode='PT409'; end if;
    end if;
    if p_operation='recover' then
      if p_expected_revision is distinct from rev or exists(select 1 from fm_v2.messages
         where conversation_id=p_conversation_id and request_id=p_request_id and role='user'
           and created_at>clock_timestamp()-interval '5 minutes') then
        raise exception 'Turn still running or stale recovery' using errcode='PT409';
      end if;
    end if;
    if p_operation='assessment' then
      next_state := case p_payload->>'mission_status' when 'ready' then 'qualified'
        when 'needs_information' then 'waiting_information'
        when 'human_intervention_required' then 'human_required' when 'out_of_catalog' then 'out_of_catalog' end;
      if next_state is null or jsonb_typeof(p_payload->'user_response'->'message') is distinct from 'string'
         or length(p_payload->'user_response'->>'message') not between 1 and 1000 then
        raise exception 'Invalid assessment' using errcode='PT422';
      end if;
      insert into fm_v2.messages(conversation_id,request_id,revision,role,content,assessment)
        values(p_conversation_id,p_request_id,rev+1,'assistant',p_payload::text,p_payload);
    else
      if jsonb_typeof(p_payload->'note') is distinct from 'string'
         or length(trim(p_payload->>'note')) not between 1 and 300 then
        raise exception 'Invalid failure note' using errcode='PT422';
      end if;
    end if;
    if event_kind='late_result' then next_state := null; end if;
    insert into fm_v2.events(conversation_id,request_id,revision,kind,state,payload)
      values(p_conversation_id,p_request_id,rev+1,event_kind,next_state,p_payload);

  elsif p_operation='event' then
    event_kind := p_payload->>'kind'; next_state := p_payload->>'state';
    if event_kind is null or event_kind not in ('status','action','result')
       or jsonb_typeof(p_payload->'note') is distinct from 'string'
       or length(trim(p_payload->>'note')) not between 1 and 300
       or (event_kind='result' and (jsonb_typeof(p_payload->'result') is distinct from 'string'
           or length(trim(p_payload->>'result')) not between 1 and 5000))
       or (event_kind<>'status' and next_state is not null)
       or (event_kind='status' and (next_state is null or next_state not in ('in_progress','blocked','completed','cancelled'))) then
      raise exception 'Invalid event' using errcode='PT422';
    end if;
    select * into old_event from fm_v2.events where conversation_id=p_conversation_id and request_id=p_request_id limit 1;
    if found then
      if old_event.kind<>event_kind or old_event.payload<>p_payload then raise exception 'Id reused' using errcode='PT409'; end if;
      return snap || jsonb_build_object('replayed',true);
    end if;
    if pending is not null or p_expected_revision is distinct from rev then
      raise exception 'Stale or pending turn' using errcode='PT409';
    end if;
    if event_kind='status' then
      allowed := case current_state
        when 'qualified' then next_state in ('in_progress','blocked','cancelled')
        when 'waiting_information' then next_state='cancelled'
        when 'human_required' then next_state in ('in_progress','blocked','cancelled')
        when 'out_of_catalog' then next_state='cancelled'
        when 'in_progress' then next_state in ('completed','blocked','cancelled')
        when 'blocked' then next_state in ('in_progress','cancelled') else false end;
      if not allowed then raise exception 'Invalid transition' using errcode='PT409'; end if;
    end if;
    insert into fm_v2.events(conversation_id,request_id,revision,kind,state,payload)
      values(p_conversation_id,p_request_id,rev+1,event_kind,next_state,p_payload);
  else
    raise exception 'Unknown operation' using errcode='PT422';
  end if;
  return fm_v2.snapshot(p_conversation_id);
end;
$fn$;
$ddl$;
end if;
end $install$;
revoke all on all functions in schema fm_v2 from public, anon, authenticated;
revoke all on function public.fm_v2_command(text,uuid,uuid,bigint,jsonb) from public, anon;
grant execute on function public.fm_v2_command(text,uuid,uuid,bigint,jsonb) to authenticated;
commit;

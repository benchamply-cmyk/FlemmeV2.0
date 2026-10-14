-- ADDITIVE. Requires the existing V2 and V3 scripts; never replaces their RPCs.
begin;
create schema if not exists fm_v4;
revoke all on schema fm_v4 from public, anon, authenticated;
grant usage on schema fm_v4 to authenticated;
create table if not exists fm_v4.originals (
  run_id uuid primary key references fm_v3.runs(id),
  documents jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
alter table fm_v4.originals enable row level security;
revoke all on fm_v4.originals from public, anon, authenticated;
grant select on fm_v4.originals to authenticated;
do $install$
begin
  if not exists(select 1 from pg_policy where polrelid='fm_v4.originals'::regclass and polname='owner_read') then
    create policy owner_read on fm_v4.originals for select to authenticated
      using (exists(select 1 from fm_v3.runs r join fm_v2.conversations c on c.id=r.conversation_id
        where r.id=run_id and c.owner_id=(select auth.uid())));
  end if;
  if not exists(select 1 from pg_trigger where tgrelid='fm_v4.originals'::regclass and tgname='immutable') then
    create trigger immutable before update or delete on fm_v4.originals for each row execute function fm_v2.immutable();
    create trigger no_truncate before truncate on fm_v4.originals for each statement execute function fm_v2.immutable();
  end if;
  if to_regprocedure('public.fm_v4_prepare(uuid,uuid,bigint,jsonb,jsonb)') is null then
    execute $ddl$
    create function public.fm_v4_prepare(p_conversation_id uuid,p_request_id uuid,p_expected_revision bigint,
      p_payload jsonb,p_documents jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog as $fn$
    declare uid uuid:=auth.uid(); outcome jsonb; doc jsonb; bytes bytea; metadata jsonb;
    begin
      if uid is null or not exists(select 1 from auth.users where id=uid and email_confirmed_at is not null) then
        raise exception 'Authentication required' using errcode='42501';
      end if;
      if not exists(select 1 from fm_v2.conversations where id=p_conversation_id and owner_id=uid) then
        raise exception 'Not found' using errcode='PT404';
      end if;
      if p_payload is null or length(p_payload::text)>20000 or p_documents is null
         or jsonb_typeof(p_documents)<>'array' or jsonb_array_length(p_documents)>3
         or length(p_documents::text)>4100000
         or p_payload->'acquisition'->>'mode' not in ('web','documents')
         or p_payload->'acquisition'->>'mode' is null then
        raise exception 'Invalid acquisition' using errcode='PT422';
      end if;
      if (p_payload->'acquisition'->>'mode'='web' and jsonb_array_length(p_documents)<>0)
        or (p_payload->'acquisition'->>'mode'='documents' and jsonb_array_length(p_documents) not between 2 and 3) then
        raise exception 'Invalid documents' using errcode='PT422';
      end if;
      metadata:='[]'::jsonb;
      for doc in select value from jsonb_array_elements(p_documents) loop
        if jsonb_typeof(doc->'name') is distinct from 'string' or length(doc->>'name')>105
          or jsonb_typeof(doc->'content_base64') is distinct from 'string'
          or length(doc->>'content_base64')>1333336 then
          raise exception 'Invalid document' using errcode='PT422';
        end if;
        begin bytes:=decode(doc->>'content_base64','base64');
        exception when others then raise exception 'Invalid encoding' using errcode='PT422'; end;
        if octet_length(bytes) not between 1 and 1000000
          or encode(sha256(bytes),'hex') is distinct from doc->>'sha256' then
          raise exception 'Invalid fingerprint' using errcode='PT422';
        end if;
        metadata:=metadata||jsonb_build_array(jsonb_build_object('name',doc->>'name','sha256',doc->>'sha256'));
      end loop;
      if metadata is distinct from p_payload->'acquisition'->'documents' then
        raise exception 'Document metadata mismatch' using errcode='PT422';
      end if;
      -- A global lock makes limits deterministic across accounts and workers.
      perform pg_advisory_xact_lock(7416101401);
      if exists(select 1 from fm_v4.originals where run_id=p_request_id) then
        if not exists(select 1 from fm_v4.originals where run_id=p_request_id and documents=p_documents) then
          raise exception 'Different originals' using errcode='PT409';
        end if;
        return public.fm_v3_delivery_command('reserve',p_conversation_id,p_request_id,p_expected_revision,p_payload);
      end if;
      if exists(select 1 from fm_v3.runs where id=p_request_id) then
        raise exception 'Reused id' using errcode='PT409';
      end if;
      if (select count(*) from fm_v4.originals o
          where not exists(select 1 from fm_v3.outputs x where x.run_id=o.run_id)
            and not exists(select 1 from fm_v3.recoveries x where x.run_id=o.run_id))>=2 then
        raise exception 'Acquisition workers busy' using errcode='PT429';
      end if;
      if (select count(*) from fm_v4.originals o join fm_v3.runs r on r.id=o.run_id
          join fm_v2.conversations c on c.id=r.conversation_id
          where c.owner_id=uid and o.created_at>clock_timestamp()-interval '1 hour')>=5
        or (select count(*) from fm_v4.originals where created_at>clock_timestamp()-interval '1 hour')>=50
        or (select count(*) from fm_v4.originals o join fm_v3.runs r on r.id=o.run_id
          join fm_v2.conversations c on c.id=r.conversation_id
          where c.owner_id=uid and o.created_at>clock_timestamp()-interval '24 hours')>=10
        or (select count(*) from fm_v4.originals where created_at>clock_timestamp()-interval '24 hours')>=100 then
        raise exception 'Acquisition budget limit' using errcode='PT429';
      end if;
      outcome:=public.fm_v3_delivery_command('reserve',p_conversation_id,p_request_id,p_expected_revision,p_payload);
      insert into fm_v4.originals(run_id,documents) values(p_request_id,p_documents);
      return outcome;
    end;
    $fn$;
    $ddl$;
  end if;
  if to_regprocedure('public.fm_v4_originals(uuid,uuid)') is null then
    execute $ddl$
    create function public.fm_v4_originals(p_conversation_id uuid,p_run_id uuid) returns jsonb
      language plpgsql security invoker set search_path=pg_catalog as $fn$
    declare result jsonb;
    begin
      select o.documents into result from fm_v4.originals o join fm_v3.runs r on r.id=o.run_id
        join fm_v2.conversations c on c.id=r.conversation_id
        where r.id=p_run_id and c.id=p_conversation_id and c.owner_id=auth.uid();
      if result is null then raise exception 'Not found' using errcode='PT404'; end if;
      return result;
    end;
    $fn$;
    $ddl$;
  end if;
end $install$;
revoke all on function public.fm_v4_prepare(uuid,uuid,bigint,jsonb,jsonb) from public,anon;
revoke all on function public.fm_v4_originals(uuid,uuid) from public,anon;
grant execute on function public.fm_v4_prepare(uuid,uuid,bigint,jsonb,jsonb) to authenticated;
grant execute on function public.fm_v4_originals(uuid,uuid) to authenticated;
commit;

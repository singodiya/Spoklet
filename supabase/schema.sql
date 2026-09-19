-- Spoklet, initial schema. Run once in a fresh Supabase project's SQL Editor.
-- Application writes go through server-only service-role RPCs. Browser access is
-- restricted to own-row reads and safe profile preference columns.
begin;
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (length(full_name) <= 100),
  native_language text check (length(native_language) <= 100),
  learning_goal text check (length(learning_goal) <= 1000),
  current_cefr_level text not null default 'A1' check (current_cefr_level in ('A1','A2','B1','B2','C1')),
  current_stage_number integer not null default 1 check (current_stage_number between 1 and 6),
  onboarding_complete boolean not null default false,
  preferred_voice text not null default 'shubh' check (preferred_voice in ('shubh','aditya','rahul','priya','ritu','simran')),
  speech_pace numeric(3,2) not null default 1.0 check (speech_pace between 0.5 and 2.0),
  streak_count integer not null default 0 check (streak_count >= 0),
  total_sessions integer not null default 0 check (total_sessions >= 0),
  last_active_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.roadmap_stages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage_number integer not null check (stage_number between 1 and 6),
  title text not null check (length(title) between 3 and 120),
  cefr_level text not null check (cefr_level in ('A1','A2','B1','B2','C1')),
  focus_skills text[] not null,
  description text not null,
  status text not null default 'locked' check (status in ('locked','active','completed')),
  sessions_required integer not null default 3 check (sessions_required > 0),
  unique (user_id, stage_number), unique (id, user_id)
);
create unique index one_active_stage on public.roadmap_stages(user_id) where status = 'active';
create table public.conversation_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage_id uuid,
  mode text not null check (mode in ('onboarding','practice')),
  topic text not null default 'A conversation with Vashu',
  summary text,
  session_score numeric check (session_score between 0 and 100),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  counted boolean not null default false,
  processing_token uuid,
  processing_started_at timestamptz,
  unique (id, user_id),
  foreign key (stage_id, user_id) references public.roadmap_stages(id, user_id),
  check ((mode = 'onboarding' and stage_id is null) or (mode = 'practice' and stage_id is not null))
);
create unique index one_open_session on public.conversation_sessions(user_id, mode) where ended_at is null;
create index sessions_history on public.conversation_sessions(user_id, started_at desc);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  sequence bigint generated always as identity,
  request_id uuid not null,
  structured_result jsonb,
  foreign key (session_id, user_id) references public.conversation_sessions(id, user_id) on delete cascade,
  unique (session_id, request_id, role), unique (id, session_id, user_id)
);
create index messages_session_order on public.messages(session_id, sequence);
create table public.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null,
  message_id uuid not null,
  original_text text not null,
  corrected_text text not null,
  mistake_type text not null check (mistake_type in ('grammar','vocabulary','pronunciation','fluency','word_order')),
  explanation text not null,
  created_at timestamptz not null default now(),
  foreign key (session_id, user_id) references public.conversation_sessions(id, user_id) on delete cascade,
  foreign key (message_id, session_id, user_id) references public.messages(id, session_id, user_id) on delete cascade
);
create index mistakes_review on public.mistakes(user_id, created_at desc);
-- A single row per user/bucket is reset each minute; no unbounded event log.
create table public.api_quotas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (user_id, bucket)
);

alter table public.profiles enable row level security;
alter table public.roadmap_stages enable row level security;
alter table public.conversation_sessions enable row level security;
alter table public.messages enable row level security;
alter table public.mistakes enable row level security;
alter table public.api_quotas enable row level security;
create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy roadmap_read_own on public.roadmap_stages for select to authenticated using ((select auth.uid()) = user_id);
create policy sessions_read_own on public.conversation_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy messages_read_own on public.messages for select to authenticated using ((select auth.uid()) = user_id);
create policy mistakes_read_own on public.mistakes for select to authenticated using ((select auth.uid()) = user_id);
create policy quotas_read_own on public.api_quotas for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.profiles, public.roadmap_stages, public.conversation_sessions, public.messages, public.mistakes, public.api_quotas from anon, authenticated;
grant select on public.profiles, public.roadmap_stages, public.conversation_sessions, public.messages, public.mistakes to authenticated;
grant update(full_name, preferred_voice, speech_pace) on public.profiles to authenticated;
grant all on public.profiles, public.roadmap_stages, public.conversation_sessions, public.messages, public.mistakes, public.api_quotas to service_role;
grant usage, select on sequence public.messages_sequence_seq to service_role;

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name) values (new.id, left(coalesce(new.raw_user_meta_data->>'full_name', ''),100));
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Also cover accounts created before this schema was installed.
insert into public.profiles(id, full_name)
select id, left(coalesce(raw_user_meta_data->>'full_name',''),100) from auth.users on conflict (id) do nothing;

create function public.consume_api_quota(p_user_id uuid, p_bucket text, p_limit integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.api_quotas as q(user_id,bucket,window_start,hits)
  values(p_user_id,p_bucket,date_trunc('minute',now()),1)
  on conflict(user_id,bucket) do update set
    hits = case when q.window_start = date_trunc('minute',now()) then q.hits+1 else 1 end,
    window_start = date_trunc('minute',now()) returning hits into n;
  return n <= p_limit;
end;
$$;

create function public.start_session(p_user_id uuid, p_mode text) returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.profiles; s uuid; st public.roadmap_stages;
begin
  select * into p from public.profiles where id=p_user_id for update;
  if p.id is null then raise exception 'Profile missing'; end if;
  if p_mode not in ('onboarding','practice') then raise exception 'Invalid mode'; end if;
  if p_mode='practice' and not p.onboarding_complete then raise exception 'Finish onboarding first'; end if;
  if p_mode='onboarding' and p.onboarding_complete then raise exception 'Onboarding already complete'; end if;
  select id into s from public.conversation_sessions where user_id=p_user_id and mode=p_mode and ended_at is null;
  if s is not null then return s; end if;
  if p_mode='practice' then
    select * into st from public.roadmap_stages where user_id=p_user_id and stage_number=p.current_stage_number;
    if st.id is null or st.status='locked' then raise exception 'Stage unavailable'; end if;
  end if;
  insert into public.conversation_sessions(user_id,stage_id,mode,topic)
  values(p_user_id,st.id,p_mode,case when p_mode='onboarding' then 'Getting to know you' else st.title end) returning id into s;
  return s;
end;
$$;

create function public.claim_session(p_user_id uuid,p_session_id uuid,p_request_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.conversation_sessions; cached jsonb;
begin
  select * into s from public.conversation_sessions where id=p_session_id and user_id=p_user_id for update;
  if s.id is null then raise exception 'Session unavailable'; end if;
  select structured_result into cached from public.messages where session_id=p_session_id and request_id=p_request_id and role='assistant';
  if cached is not null then return jsonb_build_object('cached',true,'response',cached); end if;
  if s.ended_at is not null then return jsonb_build_object('ended',true,'summary',s.summary,'score',s.session_score,'counted',s.counted); end if;
  if s.processing_token is not null and s.processing_started_at > now()-interval '120 seconds' then raise exception 'Session busy'; end if;
  update public.conversation_sessions set processing_token=p_request_id,processing_started_at=now() where id=p_session_id;
  return jsonb_build_object('cached',false);
end;
$$;

create function public.save_chat_turn(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_message text,p_result jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.conversation_sessions; u uuid; a uuid; item jsonb; result jsonb; n integer;
begin
  select * into s from public.conversation_sessions where id=p_session_id and user_id=p_user_id for update;
  if s.id is null or s.ended_at is not null or s.processing_token is distinct from p_request_id then raise exception 'Session lock expired'; end if;
  if length(trim(p_message))>0 then
    insert into public.messages(session_id,user_id,role,content,request_id) values(p_session_id,p_user_id,'user',p_message,p_request_id) returning id into u;
  end if;
  insert into public.messages(session_id,user_id,role,content,request_id) values(p_session_id,p_user_id,'assistant',p_result->>'reply',p_request_id) returning id into a;
  if u is not null then
    for item in select value from jsonb_array_elements(coalesce(p_result->'corrections','[]'::jsonb)) limit 2 loop
      insert into public.mistakes(user_id,session_id,message_id,original_text,corrected_text,mistake_type,explanation)
      values(p_user_id,p_session_id,u,item->>'original',item->>'corrected',item->>'type',item->>'explanation');
    end loop;
  end if;
  if s.mode='onboarding' and coalesce((p_result->>'done')::boolean,false) then
    select count(*) into n from public.messages where session_id=p_session_id and role='user';
    if n<4 or jsonb_array_length(p_result->'roadmap') is distinct from 6 or p_result->'assessment' is null then raise exception 'Incomplete assessment'; end if;
    -- One transaction saves transcript, six stages, and profile: no half-built roadmaps.
    perform 1 from public.profiles where id=p_user_id for update;
    for item in select value from jsonb_array_elements(p_result->'roadmap') loop
      insert into public.roadmap_stages(user_id,stage_number,title,cefr_level,focus_skills,description,status)
      values(p_user_id,(item->>'stage_number')::integer,item->>'title',item->>'cefr_level',array(select jsonb_array_elements_text(item->'focus_skills')),item->>'description',case when (item->>'stage_number')::integer=1 then 'active' else 'locked' end);
    end loop;
    update public.profiles set onboarding_complete=true,current_cefr_level=p_result->'assessment'->>'level',learning_goal=p_result->'assessment'->>'goal',native_language=p_result->'assessment'->>'native_language',current_stage_number=1 where id=p_user_id;
    update public.conversation_sessions set ended_at=now(),summary=p_result->>'reply' where id=p_session_id;
  end if;
  result=jsonb_build_object('reply',p_result->>'reply','corrections',coalesce(p_result->'corrections','[]'::jsonb),'done',coalesce((p_result->>'done')::boolean,false),'messageId',a,'userMessageId',u);
  update public.messages set structured_result=result where id=a;
  update public.conversation_sessions set processing_token=null,processing_started_at=null where id=p_session_id;
  return result;
end;
$$;

create function public.finish_session(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_summary text,p_score numeric) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.conversation_sessions; p public.profiles; st public.roadmap_stages; turns integer; completions integer; qualifies boolean; today date; last_day date; advanced boolean:=false;
begin
  select * into s from public.conversation_sessions where id=p_session_id and user_id=p_user_id for update;
  if s.id is null or s.mode<>'practice' then raise exception 'Invalid practice session'; end if;
  if s.ended_at is not null then return jsonb_build_object('summary',s.summary,'score',s.session_score,'counted',s.counted,'alreadyEnded',true); end if;
  if s.processing_token is distinct from p_request_id then raise exception 'Session lock expired'; end if;
  select count(*) into turns from public.messages where session_id=p_session_id and role='user';
  qualifies=turns>=4;
  update public.conversation_sessions set ended_at=now(),summary=p_summary,session_score=case when qualifies then p_score else null end,counted=qualifies,processing_token=null,processing_started_at=null where id=p_session_id;
  if qualifies then
    select * into p from public.profiles where id=p_user_id for update;
    today=(now() at time zone 'UTC')::date;
    last_day=(p.last_active_at at time zone 'UTC')::date;
    update public.profiles set total_sessions=total_sessions+1,
      streak_count=case when last_day=today then greatest(streak_count,1) when last_day=today-1 then streak_count+1 else 1 end,
      last_active_at=now() where id=p_user_id;
    select * into st from public.roadmap_stages where id=s.stage_id and user_id=p_user_id for update;
    select count(*) into completions from public.conversation_sessions where stage_id=st.id and user_id=p_user_id and counted;
    if completions>=st.sessions_required and st.status='active' then
      update public.roadmap_stages set status='completed' where id=st.id;
      if st.stage_number<6 then
        update public.roadmap_stages set status='active' where user_id=p_user_id and stage_number=st.stage_number+1;
        update public.profiles set current_stage_number=st.stage_number+1 where id=p_user_id;
        advanced=true;
      end if;
    end if;
  end if;
  return jsonb_build_object('summary',p_summary,'score',case when qualifies then p_score else null end,'counted',qualifies,'stageAdvanced',advanced);
end;
$$;

-- Security definer functions are never callable by a browser, even when signed in.
revoke all on function public.handle_new_user() from public,anon,authenticated;
revoke all on function public.consume_api_quota(uuid,text,integer) from public,anon,authenticated;
revoke all on function public.start_session(uuid,text) from public,anon,authenticated;
revoke all on function public.claim_session(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.save_chat_turn(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_session(uuid,uuid,uuid,text,numeric) from public,anon,authenticated;
grant execute on function public.consume_api_quota(uuid,text,integer), public.start_session(uuid,text), public.claim_session(uuid,uuid,uuid), public.save_chat_turn(uuid,uuid,uuid,text,jsonb), public.finish_session(uuid,uuid,uuid,text,numeric) to service_role;
commit;

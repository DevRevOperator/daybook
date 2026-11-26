-- Personal Daybook. No task data, email addresses, or credentials belong here.
create schema if not exists daybook_private;
revoke all on schema daybook_private from public, anon, authenticated;

create table daybook_private.allowed_emails (
  email text primary key check (email = lower(email))
);
alter table daybook_private.allowed_emails enable row level security;

create table public.daybook_planners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  data jsonb,
  updated_at timestamptz not null default now()
);

create table public.daybook_backups (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  data jsonb not null,
  reason text not null,
  daily_key date,
  created_at timestamptz not null default now(),
  unique (user_id, daily_key)
);

create function public.daybook_is_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join daybook_private.allowed_emails a on a.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

alter table public.daybook_planners enable row level security;
alter table public.daybook_backups enable row level security;
revoke all on public.daybook_planners, public.daybook_backups from public, anon, authenticated;
grant select on public.daybook_planners, public.daybook_backups to authenticated;
create policy planner_owner_read on public.daybook_planners for select to authenticated
  using (user_id = (select auth.uid()) and (select public.daybook_is_allowed()));
create policy backup_owner_read on public.daybook_backups for select to authenticated
  using (user_id = (select auth.uid()) and (select public.daybook_is_allowed()));

create function daybook_private.check_access() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.daybook_is_allowed() then
    raise exception 'This account does not have access to Daybook.' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function daybook_private.backup_planner(owner_id uuid, snapshot jsonb, snapshot_revision bigint, backup_reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if snapshot is null then return; end if;
  insert into public.daybook_backups (user_id, revision, data, reason, daily_key)
    values (owner_id, snapshot_revision, snapshot, 'daily', (now() at time zone 'UTC')::date)
    on conflict (user_id, daily_key) do nothing;
  if backup_reason = 'before-import' then
    insert into public.daybook_backups (user_id, revision, data, reason)
      values (owner_id, snapshot_revision, snapshot, 'before-import');
  end if;
  delete from public.daybook_backups where user_id = owner_id and reason = 'daily' and id not in
    (select id from public.daybook_backups where user_id = owner_id and reason = 'daily' order by daily_key desc limit 30);
  delete from public.daybook_backups where user_id = owner_id and reason <> 'daily' and id not in
    (select id from public.daybook_backups where user_id = owner_id and reason <> 'daily' order by id desc limit 20);
end;
$$;

create function public.daybook_load() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := daybook_private.check_access(); row_data public.daybook_planners;
begin
  select * into row_data from public.daybook_planners where user_id = owner_id;
  return jsonb_build_object('revision', coalesce(row_data.revision, 0), 'state', row_data.data);
end;
$$;

create function public.daybook_save(expected_revision bigint, next_state jsonb, reason text default 'edit') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := daybook_private.check_access(); row_data public.daybook_planners;
begin
  if next_state is null or jsonb_typeof(next_state) <> 'object'
    or octet_length(next_state::text) > 26214400
    or (next_state->>'schemaVersion') is distinct from '2'
    or jsonb_typeof(next_state->'tasks') is distinct from 'array'
    or jsonb_typeof(next_state->'groups') is distinct from 'array'
    or jsonb_typeof(next_state->'lists') is distinct from 'array'
    or jsonb_typeof(next_state->'rules') is distinct from 'array'
    or jsonb_typeof(next_state->'settings') is distinct from 'object'
    or coalesce(next_state->>'name', '') = ''
    or reason not in ('edit', 'maintenance', 'before-import') then
    raise exception 'Invalid Daybook planner.' using errcode = '22023';
  end if;
  insert into public.daybook_planners (user_id) values (owner_id) on conflict do nothing;
  select * into row_data from public.daybook_planners where user_id = owner_id for update;
  if expected_revision is distinct from row_data.revision then
    return jsonb_build_object('conflict', true, 'revision', row_data.revision, 'state', row_data.data);
  end if;
  perform daybook_private.backup_planner(owner_id, row_data.data, row_data.revision, reason);
  update public.daybook_planners set data = next_state, revision = revision + 1, updated_at = now()
    where user_id = owner_id returning * into row_data;
  return jsonb_build_object('revision', row_data.revision, 'state', row_data.data);
end;
$$;

create function public.daybook_capture(capture_id text, capture_title text, capture_notes text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := daybook_private.check_access(); row_data public.daybook_planners; existing jsonb; task jsonb; saved jsonb;
begin
  if capture_id is null or capture_id !~* '^capture-[a-f0-9-]{36}$'
    or capture_title is null or length(trim(capture_title)) not between 1 and 1000
    or capture_notes is null or length(capture_notes) > 50000 then
    raise exception 'Enter a task of 1–1,000 characters.' using errcode = '22023';
  end if;
  select * into row_data from public.daybook_planners where user_id = owner_id for update;
  if row_data.data is null then raise exception 'Open your planner before capturing a task.'; end if;
  select value into existing from jsonb_array_elements(row_data.data->'tasks') where value->>'id' = capture_id;
  if existing is not null then
    if existing->>'title' is distinct from trim(capture_title) or existing->>'notes' is distinct from capture_notes then
      raise exception 'This capture has already been saved with different text. Find it in your planner.';
    end if;
    return jsonb_build_object('revision', row_data.revision, 'state', row_data.data, 'created', false, 'taskId', capture_id);
  end if;
  task := jsonb_build_object('id', capture_id, 'title', trim(capture_title), 'notes', capture_notes,
    'date', null, 'listId', null, 'completed', false, 'completedAt', null, 'color', '',
    'order', extract(epoch from clock_timestamp()) * 1000, 'dayOrder', jsonb_array_length(row_data.data->'tasks'),
    'listOrder', jsonb_array_length(row_data.data->'tasks'), 'ruleId', null, 'occurrenceDate', null,
    'createdAt', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  saved := public.daybook_save(row_data.revision, jsonb_set(row_data.data, '{tasks}', (row_data.data->'tasks') || jsonb_build_array(task)), 'edit');
  return saved || jsonb_build_object('created', true, 'taskId', capture_id);
end;
$$;

create function public.daybook_list_backups() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := daybook_private.check_access(); result jsonb;
begin
  select coalesce(jsonb_agg(x order by x.id desc), '[]'::jsonb) into result
    from (select id, revision, reason, created_at from public.daybook_backups where user_id = owner_id order by id desc limit 50) x;
  return result;
end;
$$;

create function public.daybook_get_backup(backup_id bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid := daybook_private.check_access(); row_data public.daybook_backups;
begin
  select * into row_data from public.daybook_backups where user_id = owner_id and id = backup_id;
  if row_data.id is null then raise exception 'Backup not found.' using errcode = '42501'; end if;
  return jsonb_build_object('revision', row_data.revision, 'state', row_data.data, 'exportedAt', row_data.created_at);
end;
$$;

revoke all on all functions in schema daybook_private from public, anon, authenticated;
revoke all on function public.daybook_is_allowed(), public.daybook_load(), public.daybook_save(bigint,jsonb,text),
  public.daybook_capture(text,text,text), public.daybook_list_backups(), public.daybook_get_backup(bigint) from public, anon;
grant execute on function public.daybook_is_allowed(), public.daybook_load(), public.daybook_save(bigint,jsonb,text),
  public.daybook_capture(text,text,text), public.daybook_list_backups(), public.daybook_get_backup(bigint) to authenticated;

-- ============================================================
-- MyBoardGame · Cabin 私有状态与房间成员权限
-- 适用：Supabase PostgreSQL / SQL Editor
--
-- 目标：
--   1. rooms 只允许持有房间令牌的成员读写
--   2. 隐藏叛徒的身份、阵营、叛徒目标不再出现在公开 state
--   3. 每名玩家只能读取自己的 secret
--
-- 注意：
--   - 这份 SQL 会改变 rooms 的读写方式，执行后必须同时使用新版 js/net.js。
--   - 令牌由客户端生成（32 字节随机），只存浏览器 localStorage；
--     数据库只存 SHA-256 哈希。
--   - 执行顺序：先跑本文件，再更新前端。
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. 房间成员
-- ------------------------------------------------------------
create table if not exists public.room_members (
  code        text not null,
  pid         text not null,
  token_hash  text not null,
  joined_at   timestamptz not null default now(),
  primary key (code, pid)
);

create index if not exists room_members_code_idx on public.room_members(code);
create index if not exists room_members_token_idx on public.room_members(code, token_hash);

-- 成员表不直接开放给客户端；只有 security definer 的 RPC / 策略函数能读
alter table public.room_members enable row level security;

-- ------------------------------------------------------------
-- 2. 每名玩家的私有状态
--    secret 示例：
--    { "side": "traitor", "traitor": 2, "traitorGoal": {...},
--      "traitorGoalText": "..." }
-- ------------------------------------------------------------
create table if not exists public.room_secrets (
  code        text not null,
  pid         text not null,
  secret      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (code, pid)
);

-- ------------------------------------------------------------
-- 3. 工具函数
-- ------------------------------------------------------------
create or replace function public.cabin_token_hash(p_token text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.cabin_request_token()
returns text
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.headers', true), '')::jsonb) ->> 'x-player-token',
    ''
  );
$$;

create or replace function public.cabin_is_member(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.room_members m
    where m.code = p_code
      and m.token_hash = public.cabin_token_hash(public.cabin_request_token())
  );
$$;

revoke all on function public.cabin_is_member(text) from public;
grant execute on function public.cabin_is_member(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 4. rooms 的 RLS：必须是成员才能读写
-- ------------------------------------------------------------
alter table public.rooms enable row level security;

drop policy if exists "rooms_friends_only" on public.rooms;
drop policy if exists "rooms_member_only" on public.rooms;

create policy "rooms_member_only" on public.rooms
  for all
  to anon, authenticated
  using (public.cabin_is_member(code))
  with check (public.cabin_is_member(code));

-- ------------------------------------------------------------
-- 5. room_secrets 的 RLS：只能读自己那一行
-- ------------------------------------------------------------
alter table public.room_secrets enable row level security;

-- 客户端不直接读写这两张表，全部走 security definer RPC
revoke all on table public.room_members from anon, authenticated;
revoke all on table public.room_secrets from anon, authenticated;

drop policy if exists "room_secrets_own" on public.room_secrets;
create policy "room_secrets_own" on public.room_secrets
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.room_members m
      where m.code = room_secrets.code
        and m.pid = room_secrets.pid
        and m.token_hash = public.cabin_token_hash(public.cabin_request_token())
    )
  );

-- 写入只走 cabin_set_secret，不直接放开 update/insert
drop policy if exists "room_secrets_write_own" on public.room_secrets;

-- ------------------------------------------------------------
-- 6. 建房 / 加入 / 存取 secret 的 RPC
-- ------------------------------------------------------------
create or replace function public.cabin_create_room(
  p_code text,
  p_pid text,
  p_token text,
  p_state jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := public.cabin_token_hash(p_token);
begin
  if length(coalesce(p_code, '')) < 4 then
    raise exception '邀请码太短';
  end if;
  if length(coalesce(p_pid, '')) < 4 then
    raise exception '玩家 ID 太短';
  end if;
  if exists (select 1 from public.rooms where code = p_code) then
    raise exception '邀请码已存在';
  end if;

  insert into public.rooms(code, state, version)
  values (p_code, coalesce(p_state, '{}'::jsonb), 0);

  insert into public.room_members(code, pid, token_hash)
  values (p_code, p_pid, v_hash);

  return jsonb_build_object('ok', true, 'code', p_code, 'version', 0);
end;
$$;

create or replace function public.cabin_join_room(
  p_code text,
  p_pid text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := public.cabin_token_hash(p_token);
  v_row record;
begin
  select * into v_row from public.rooms where code = p_code;
  if not found then
    raise exception '房间不存在';
  end if;
  if length(coalesce(p_pid, '')) < 4 then
    raise exception '玩家 ID 太短';
  end if;

  insert into public.room_members(code, pid, token_hash)
  values (p_code, p_pid, v_hash)
  on conflict (code, pid) do update
    set token_hash = excluded.token_hash,
        joined_at = now();

  return jsonb_build_object(
    'ok', true,
    'code', p_code,
    'version', v_row.version,
    'state', v_row.state
  );
end;
$$;

create or replace function public.cabin_get_secret(
  p_code text,
  p_pid text,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := public.cabin_token_hash(p_token);
  v_secret jsonb;
begin
  if not exists (
    select 1 from public.room_members
    where code = p_code and pid = p_pid and token_hash = v_hash
  ) then
    raise exception '没有这个房间的玩家身份';
  end if;

  select secret into v_secret
  from public.room_secrets
  where code = p_code and pid = p_pid;

  return coalesce(v_secret, '{}'::jsonb);
end;
$$;

create or replace function public.cabin_set_secret(
  p_code text,
  p_pid text,
  p_token text,
  p_secret jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := public.cabin_token_hash(p_token);
begin
  if not exists (
    select 1 from public.room_members
    where code = p_code and pid = p_pid and token_hash = v_hash
  ) then
    raise exception '没有这个房间的玩家身份';
  end if;

  insert into public.room_secrets(code, pid, secret, updated_at)
  values (p_code, p_pid, coalesce(p_secret, '{}'::jsonb), now())
  on conflict (code, pid) do update
    set secret = excluded.secret,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.cabin_create_room(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.cabin_join_room(text, text, text) to anon, authenticated;
grant execute on function public.cabin_get_secret(text, text, text) to anon, authenticated;
grant execute on function public.cabin_set_secret(text, text, text, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- 7. 隐藏叛徒拆分
--    在写入 rooms 之前：
--      - 把每名玩家的 side 存进 room_secrets
--      - 把 traitor / traitorGoal / traitorGoalText 只存给叛徒
--      - 从公开 state 删除这些字段
--
--    非隐藏剧本不拆分，避免正常对局多一次读写。
-- ------------------------------------------------------------
create or replace function public.cabin_split_hidden()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hidden boolean := coalesce((new.state #>> '{haunt,hidden}')::boolean, false);
  v_player jsonb;
  v_pid text;
  v_sec jsonb;
  v_traitor text;
  v_traitor_pid text;
  v_haunt jsonb;
begin
  if not v_hidden then
    delete from public.room_secrets where code = new.code;
    return new;
  end if;

  -- 每名玩家的阵营
  for v_player in
    select * from jsonb_array_elements(coalesce(new.state->'players', '[]'::jsonb))
  loop
    v_pid := v_player->>'id';
    if v_pid is null or v_pid = '' then continue; end if;

    select coalesce(secret, '{}'::jsonb) into v_sec
    from public.room_secrets
    where code = new.code and pid = v_pid;

    if v_player ? 'side' then
      v_sec := jsonb_set(coalesce(v_sec, '{}'::jsonb), '{side}', v_player->'side', true);
    end if;

    insert into public.room_secrets(code, pid, secret, updated_at)
    values (new.code, v_pid, v_sec, now())
    on conflict (code, pid) do update
      set secret = excluded.secret,
          updated_at = now();
  end loop;

  -- 叛徒身份与叛徒目标只给叛徒本人
  v_haunt := coalesce(new.state->'haunt', '{}'::jsonb);
  v_traitor := v_haunt->>'traitor';
  if v_traitor is not null and v_traitor ~ '^[0-9]+$' then
    v_traitor_pid := new.state #>> array['players', v_traitor, 'id'];
    if v_traitor_pid is not null and v_traitor_pid <> '' then
      select coalesce(secret, '{}'::jsonb) into v_sec
      from public.room_secrets
      where code = new.code and pid = v_traitor_pid;

      v_sec := jsonb_set(coalesce(v_sec, '{}'::jsonb), '{traitor}', to_jsonb(v_traitor::int), true);
      if v_haunt ? 'traitorGoal' then
        v_sec := jsonb_set(v_sec, '{traitorGoal}', v_haunt->'traitorGoal', true);
      end if;
      if v_haunt ? 'traitorGoalText' then
        v_sec := jsonb_set(v_sec, '{traitorGoalText}', v_haunt->'traitorGoalText', true);
      end if;

      insert into public.room_secrets(code, pid, secret, updated_at)
      values (new.code, v_traitor_pid, v_sec, now())
      on conflict (code, pid) do update
        set secret = excluded.secret,
            updated_at = now();
    end if;
  end if;

  -- 从公开 state 删除秘密
  new.state := jsonb_set(
    new.state,
    '{players}',
    (
      select jsonb_agg(p - 'side')
      from jsonb_array_elements(coalesce(new.state->'players', '[]'::jsonb)) p
    ),
    true
  );
  new.state := jsonb_set(
    new.state,
    '{haunt}',
    coalesce(new.state->'haunt', '{}'::jsonb) - 'traitor' - 'traitorGoal' - 'traitorGoalText',
    true
  );

  return new;
end;
$$;

drop trigger if exists cabin_split_hidden_before on public.rooms;
create trigger cabin_split_hidden_before
  before insert or update on public.rooms
  for each row execute function public.cabin_split_hidden();

-- ------------------------------------------------------------
-- 8. Realtime 仍用 rooms；room_secrets 不订阅
-- ------------------------------------------------------------
alter table public.rooms replica identity full;

-- ------------------------------------------------------------
-- 9. 验证
--    select * from public.rooms;
--    select * from public.room_members;
--    select * from public.room_secrets;
-- ------------------------------------------------------------

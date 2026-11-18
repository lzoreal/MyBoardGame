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
drop policy if exists "rooms_member_select" on public.rooms;
drop policy if exists "rooms_legacy_insert" on public.rooms;
drop policy if exists "rooms_legacy_write" on public.rooms;
drop policy if exists "rooms_legacy_delete" on public.rooms;

create policy "rooms_member_select" on public.rooms
  for select
  to anon, authenticated
  using (public.cabin_is_member(code));

-- 这个 rooms 表同时被其他桌游使用，不能全局 revoke update。
-- Cabin 房间禁止客户端直接改写，只能走 cabin_push_state；
-- 非 Cabin 房间保留旧的直写流程，避免破坏大富翁等现有游戏。
create policy "rooms_legacy_insert" on public.rooms
  for insert
  to anon, authenticated
  with check (coalesce(state->>'game', '') <> 'cabin');

create policy "rooms_legacy_write" on public.rooms
  for update
  to anon, authenticated
  using (coalesce(state->>'game', '') <> 'cabin')
  with check (coalesce(state->>'game', '') <> 'cabin');

create policy "rooms_legacy_delete" on public.rooms
  for delete
  to anon, authenticated
  using (coalesce(state->>'game', '') <> 'cabin');

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

-- 加入房间必须由数据库事务完成：
--   1. 已存在的 (code,pid) 只允许原令牌恢复，绝不覆盖 token
--   2. 新成员只能在 lobby 阶段加入，且受席位上限约束
--   3. 成员行和 state.players 在同一次事务里写入
drop function if exists public.cabin_join_room(text, text, text);

create or replace function public.cabin_join_room(
  p_code text,
  p_pid text,
  p_token text,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := public.cabin_token_hash(p_token);
  v_row record;
  v_member record;
  v_players jsonb;
  v_name text;
  v_max int;
begin
  if length(coalesce(p_code, '')) < 4 then
    raise exception '邀请码太短';
  end if;
  if length(coalesce(p_pid, '')) < 4 then
    raise exception '玩家 ID 太短';
  end if;
  if length(coalesce(p_token, '')) < 16 then
    raise exception '玩家令牌无效';
  end if;

  -- 同一房间的加入串行化，避免两个人同时抢最后一个席位
  perform pg_advisory_xact_lock(hashtext('cabin_room:' || p_code));

  select * into v_row from public.rooms where code = p_code for update;
  if not found then
    raise exception '房间不存在';
  end if;

  select * into v_member
  from public.room_members
  where code = p_code and pid = p_pid;

  if found then
    if v_member.token_hash <> v_hash then
      raise exception '这个玩家身份已被占用，不能用新令牌接管';
    end if;
    return jsonb_build_object(
      'ok', true,
      'code', p_code,
      'version', v_row.version,
      'state', v_row.state,
      'rejoined', true
    );
  end if;

  -- 新成员：只允许在大厅阶段进入
  if coalesce(v_row.state->>'phase', '') <> 'lobby' then
    raise exception '这局已经开始了，等下一局吧';
  end if;

  v_max := coalesce((v_row.state->>'maxPlayers')::int, 6);
  if (select count(*) from public.room_members where code = p_code) >= v_max then
    raise exception '房间已经满员';
  end if;

  v_players := coalesce(v_row.state->'players', '[]'::jsonb);
  if exists (
    select 1 from jsonb_array_elements(v_players) p
    where p->>'id' = p_pid
  ) then
    -- 玩家已在公开状态里，但没有成员行：属于旧数据或异常状态，不能直接认领
    raise exception '这个玩家 ID 已在房间中，缺少原令牌，无法接管';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    v_name := '玩家' || (jsonb_array_length(v_players) + 1)::text;
  end if;

  insert into public.room_members(code, pid, token_hash)
  values (p_code, p_pid, v_hash);

  v_players := v_players || jsonb_build_array(jsonb_build_object('id', p_pid, 'name', v_name));
  v_row.state := jsonb_set(v_row.state, '{players}', v_players, true);

  update public.rooms
  set state = v_row.state,
      version = v_row.version + 1,
      updated_at = now()
  where code = p_code;

  return jsonb_build_object(
    'ok', true,
    'code', p_code,
    'version', v_row.version + 1,
    'state', v_row.state,
    'rejoined', false
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

-- 客户端不再拥有写入 secret 的能力。
-- secret 只由 cabin_split_hidden 触发器根据服务端运行结果写入。
drop function if exists public.cabin_set_secret(text, text, text, jsonb);

-- ------------------------------------------------------------
-- 6.1 受控状态提交
--     客户端不能直接 UPDATE rooms。所有状态推进必须走这个 RPC：
--       - 验证成员令牌
--       - 验证版本号（乐观锁）
--       - 验证操作者是否是当前行动者
--       - 验证不会替换玩家身份 / 房主 / 游戏类型
--       - 隐藏叛徒只能在叛徒本人操作时揭露
--     注意：这仍然不是完整的服务端规则引擎；它先把“任意成员可写整包状态”
--     收窄为“只有当前行动者能提交一个合法阶段的状态”。
-- ------------------------------------------------------------
create or replace function public.cabin_push_state(
  p_code text,
  p_pid text,
  p_token text,
  p_version int,
  p_state jsonb,
  p_action text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text := public.cabin_token_hash(p_token);
  v_old record;
  v_new_state jsonb;
  v_new_version int;
  v_old_ids jsonb;
  v_new_ids jsonb;
  v_actor_idx int;
  v_turn_idx int;
  v_turn_pid text;
  v_actor_secret jsonb;
begin
  if not exists (
    select 1 from public.room_members
    where code = p_code and pid = p_pid and token_hash = v_hash
  ) then
    raise exception '没有这个房间的玩家身份';
  end if;

  select * into v_old from public.rooms where code = p_code for update;
  if not found then raise exception '房间不存在'; end if;
  if p_version is null or p_version <> v_old.version then
    raise exception '状态版本不一致，请刷新后重试';
  end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception '状态格式无效';
  end if;

  -- 身份锚点不可变
  if coalesce(p_state->>'game', '') <> coalesce(v_old.state->>'game', '') then
    raise exception '不能替换游戏类型';
  end if;
  if coalesce(p_state->>'hostId', '') <> coalesce(v_old.state->>'hostId', '') then
    raise exception '不能替换房主';
  end if;
  if coalesce(p_state->>'createdAt', '') <> coalesce(v_old.state->>'createdAt', '') then
    raise exception '不能替换房间创建信息';
  end if;

  select coalesce(jsonb_agg(p->>'id' order by ord), '[]'::jsonb) into v_old_ids
  from jsonb_array_elements(coalesce(v_old.state->'players', '[]'::jsonb)) with ordinality as t(p, ord);
  select coalesce(jsonb_agg(p->>'id' order by ord), '[]'::jsonb) into v_new_ids
  from jsonb_array_elements(coalesce(p_state->'players', '[]'::jsonb)) with ordinality as t(p, ord);
  if v_old_ids <> v_new_ids then
    raise exception '不能通过状态提交增删或替换玩家';
  end if;

  -- 阶段只能向前
  if coalesce(v_old.state->>'phase', '') = 'ended'
     and coalesce(p_state->>'phase', '') <> 'select' then
    raise exception '对局已结束，只能由房主重开';
  end if;

  -- 行动者必须是当前回合玩家；少数响应动作由目标玩家执行
  select ord - 1 into v_actor_idx
  from jsonb_array_elements(coalesce(v_old.state->'players', '[]'::jsonb)) with ordinality as t(p, ord)
  where p->>'id' = p_pid;
  if v_actor_idx is null then raise exception '玩家不在房间里'; end if;

  v_turn_idx := coalesce((v_old.state->>'turn')::int, 0);
  v_turn_pid := v_old.state #>> array['players', v_turn_idx::text, 'id'];

  -- 大厅阶段只允许房主开始；不允许成员直接把大厅改写成 playing
  if coalesce(v_old.state->>'phase', '') = 'lobby' and p_action <> 'start' then
    raise exception '游戏还没开始';
  end if;

  if p_action = 'start' or p_action = 'restart' then
    if v_old.state->>'hostId' <> p_pid then raise exception '只有房主能开始或重开'; end if;
  elsif p_action in ('tradeAccept', 'tradeReject') then
    if coalesce(v_old.state #>> '{tradeOffer,to}', '') <> p_pid then
      raise exception '这不是发给你的交易请求';
    end if;
  elsif p_action = 'tradeCancel' then
    if coalesce(v_old.state #>> '{tradeOffer,from}', '') <> p_pid then
      raise exception '只有发起者能取消交易';
    end if;
  elsif p_action = 'allocateDamage' then
    if coalesce(v_old.state #>> '{pendingDamage,player}', '') <> p_pid then
      raise exception '现在不该由你分配伤害';
    end if;
  else
    if coalesce(v_old.state->>'phase', '') not in ('lobby', 'select', 'playing') then
      raise exception '当前阶段不能提交动作';
    end if;
    if v_old.state->>'phase' <> 'lobby' and coalesce(v_turn_pid, '') <> p_pid then
      raise exception '还没轮到你行动';
    end if;
  end if;

  -- 隐藏叛徒：只有叛徒本人能把 hidden 从 true 改为 false
  if coalesce(v_old.state #>> '{haunt,hidden}', 'false') = 'true'
     and coalesce(p_state #>> '{haunt,hidden}', 'false') <> 'true' then
    select coalesce(secret, '{}'::jsonb) into v_actor_secret
    from public.room_secrets
    where code = p_code and pid = p_pid;
    if coalesce(v_actor_secret->>'side', '') <> 'traitor' then
      raise exception '只有隐藏叛徒本人能揭露身份';
    end if;
  end if;

  update public.rooms
  set state = p_state,
      version = v_old.version + 1,
      updated_at = now()
  where code = p_code
  returning state, version into v_new_state, v_new_version;

  return jsonb_build_object(
    'ok', true,
    'code', p_code,
    'version', v_new_version,
    'state', v_new_state
  );
end;
$$;

grant execute on function public.cabin_create_room(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.cabin_join_room(text, text, text, text) to anon, authenticated;
grant execute on function public.cabin_get_secret(text, text, text) to anon, authenticated;
grant execute on function public.cabin_push_state(text, text, text, int, jsonb, text) to anon, authenticated;

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
  v_was_hidden boolean := false;
  v_player jsonb;
  v_pid text;
  v_sec jsonb;
  v_traitor text;
  v_traitor_pid text;
  v_haunt jsonb;
  v_players jsonb;
  v_side_counts jsonb;
begin
  if tg_op <> 'INSERT' then
    v_was_hidden := coalesce((old.state #>> '{haunt,hidden}')::boolean, false);
  end if;
  if not v_hidden then
    -- 只有“隐藏 -> 揭露”才需要从 secrets 重建阵营。
    -- 重开一局（new 没有 haunt）只清理旧 secret，不能把上一局阵营套到新局。
    if v_was_hidden and (new.state ? 'haunt') then
      v_players := coalesce(new.state->'players', '[]'::jsonb);
      for v_player in select * from jsonb_array_elements(v_players) loop
        v_pid := v_player->>'id';
        if v_pid is null or v_pid = '' then continue; end if;
        select coalesce(secret, '{}'::jsonb) into v_sec
        from public.room_secrets
        where code = new.code and pid = v_pid;
        if v_sec ? 'side' then
          -- 用下标精确替换，避免依赖 JSON 路径里的 '-' 字符
          v_players := (
            select jsonb_agg(
              case when elem->>'id' = v_pid
                then elem || jsonb_build_object('side', v_sec->'side')
                else elem
              end
              order by ord
            )
            from jsonb_array_elements(v_players) with ordinality as t(elem, ord)
          );
        end if;
      end loop;

      new.state := jsonb_set(new.state, '{players}', coalesce(v_players, '[]'::jsonb), true);

      -- 从叛徒 secret 恢复叛徒编号与目标
      select secret into v_sec
      from public.room_secrets
      where code = new.code
        and coalesce((secret->>'traitor')::int, -1) >= 0
      limit 1;
      if found and v_sec is not null then
        v_haunt := coalesce(new.state->'haunt', '{}'::jsonb);
        v_haunt := jsonb_set(v_haunt, '{traitor}', v_sec->'traitor', true);
        if v_sec ? 'traitorGoal' then v_haunt := jsonb_set(v_haunt, '{traitorGoal}', v_sec->'traitorGoal', true); end if;
        if v_sec ? 'traitorGoalText' then v_haunt := jsonb_set(v_haunt, '{traitorGoalText}', v_sec->'traitorGoalText', true); end if;
        new.state := jsonb_set(new.state, '{haunt}', v_haunt, true);
      end if;
    end if;

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

  -- 公开一个聚合计数，供无法看到别人 side 的客户端做胜负与目标判定，
  -- 但不下发任何具体玩家的阵营。计数用 secrets + 公开的 dead 状态计算。
  select jsonb_build_object(
    'hero', count(*) filter (
      where coalesce(s.secret->>'side', '') = 'hero'
        and coalesce((p->>'dead')::boolean, false) = false
    ),
    'traitor', count(*) filter (
      where coalesce(s.secret->>'side', '') = 'traitor'
        and coalesce((p->>'dead')::boolean, false) = false
    )
  ) into v_side_counts
  from jsonb_array_elements(coalesce(new.state->'players', '[]'::jsonb)) p
  left join public.room_secrets s
    on s.code = new.code and s.pid = p->>'id';

  v_haunt := coalesce(new.state->'haunt', '{}'::jsonb);
  v_haunt := jsonb_set(v_haunt, '{sideCounts}', v_side_counts, true);
  new.state := jsonb_set(new.state, '{haunt}', v_haunt, true);

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

-- ============================================================
-- MyBoardGame · Supabase 初始化脚本
-- 用法：Supabase 控制台 → SQL Editor → 粘贴整段 → Run
-- ============================================================

-- 1. 建表：一行 = 一个房间
create table if not exists public.rooms (
  code       text primary key,                    -- 5 位邀请码
  state      jsonb not null default '{}'::jsonb,  -- 整个房间的 JSON 状态
  version    integer not null default 0,          -- 乐观锁版本号
  updated_at timestamptz not null default now()
);

-- 2. 开 RLS（Supabase 要求 public 表必须开，否则前端读不到）
alter table public.rooms enable row level security;

-- 3. 朋友局策略：允许 anon 读写
--    注意这等于「谁拿到 anonKey 都能改数据」，只适合好友局
drop policy if exists "rooms_friends_only" on public.rooms;
create policy "rooms_friends_only" on public.rooms
  for all
  to anon
  using (true)
  with check (true);

-- 4. 授权
grant select, insert, update, delete on public.rooms to anon, authenticated;

-- 5. 打开 Realtime，并让 UPDATE 推送带上完整行
alter table public.rooms replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rooms'
  ) then
    alter publication supabase_realtime add table public.rooms;
  end if;
end $$;

-- ============================================================
-- 验证：执行完后跑下面这句，能返回空数组就说明通了
-- select * from public.rooms;
-- ============================================================

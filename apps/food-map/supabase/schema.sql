-- 美食收藏：Supabase 資料表與權限
-- 用法：Supabase 專案 → SQL Editor → New query → 整份貼上 → Run。重跑也不會出錯。

-- 使用者名稱（註冊時自動建立）
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 店家（每個人自己的收藏）
create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  name text not null,
  branch text not null default '',
  address text not null default '',
  city text not null default '',
  district text not null default '',
  lat double precision,
  lng double precision,
  approx boolean not null default false,       -- 座標是大概位置（只對到路名或行政區）
  category text not null default 'restaurant',
  cuisine text not null default '',
  price smallint check (price between 1 and 4), -- 每人 1:≤200 2:200-500 3:500-1000 4:1000+
  meals text[] not null default '{}',          -- breakfast lunch tea dinner night
  hours text not null default '',
  status text not null default 'want' check (status in ('want', 'been')),
  rating smallint check (rating between 1 and 5),
  note text not null default '',
  tags text[] not null default '{}',
  source_url text not null default '',
  source_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists places_owner_idx on public.places (owner);

-- 美食群組
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- 分享到群組的店家
create table if not exists public.group_places (
  group_id uuid not null references public.groups on delete cascade,
  place_id uuid not null references public.places on delete cascade,
  added_by uuid not null default auth.uid() references public.profiles on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, place_id)
);

-- 滑卡配對：一輪 = 一組候選店家，大家各自左滑右滑
create table if not exists public.swipe_rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null default '',
  filters jsonb not null default '{}',
  place_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.swipes (
  round_id uuid not null references public.swipe_rounds on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  place_id uuid not null,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, place_id)
);

-- 權限判斷（security definer 避免 RLS 互相遞迴）
create or replace function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid())
$$;

create or replace function public.shares_group_with(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid)
$$;

create or replace function public.can_see_place(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_places gp join group_members gm on gm.group_id = gp.group_id
                 where gp.place_id = pid and gm.user_id = auth.uid())
$$;

-- 用邀請碼加入群組
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select id into gid from groups where invite_code = lower(trim(code));
  if gid is null then raise exception '找不到這個邀請碼'; end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

-- 建立群組時，建立者自動成為成員
create or replace function public.add_owner_as_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id) values (new.id, new.owner) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created after insert on public.groups
  for each row execute function public.add_owner_as_member();

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_places enable row level security;
alter table public.swipe_rounds enable row level security;
alter table public.swipes enable row level security;

drop policy if exists "看得到自己和群組好友" on public.profiles;
create policy "看得到自己和群組好友" on public.profiles for select using (public.shares_group_with(id));
drop policy if exists "改自己的名字" on public.profiles;
create policy "改自己的名字" on public.profiles for update using (id = auth.uid());

drop policy if exists "看自己的和群組分享的" on public.places;
create policy "看自己的和群組分享的" on public.places for select using (owner = auth.uid() or public.can_see_place(id));
drop policy if exists "新增自己的" on public.places;
create policy "新增自己的" on public.places for insert with check (owner = auth.uid());
drop policy if exists "改自己的" on public.places;
create policy "改自己的" on public.places for update using (owner = auth.uid());
drop policy if exists "刪自己的" on public.places;
create policy "刪自己的" on public.places for delete using (owner = auth.uid());

drop policy if exists "成員看得到群組" on public.groups;
create policy "成員看得到群組" on public.groups for select using (public.is_member(id) or owner = auth.uid());
drop policy if exists "建立群組" on public.groups;
create policy "建立群組" on public.groups for insert with check (owner = auth.uid());
drop policy if exists "建立者改名" on public.groups;
create policy "建立者改名" on public.groups for update using (owner = auth.uid());
drop policy if exists "建立者刪除" on public.groups;
create policy "建立者刪除" on public.groups for delete using (owner = auth.uid());

drop policy if exists "成員看得到成員" on public.group_members;
create policy "成員看得到成員" on public.group_members for select using (public.is_member(group_id));
drop policy if exists "自己退出" on public.group_members;
create policy "自己退出" on public.group_members for delete using (user_id = auth.uid());

drop policy if exists "成員看得到分享" on public.group_places;
create policy "成員看得到分享" on public.group_places for select using (public.is_member(group_id));
drop policy if exists "成員分享自己的店" on public.group_places;
create policy "成員分享自己的店" on public.group_places for insert
  with check (public.is_member(group_id) and added_by = auth.uid()
              and exists (select 1 from public.places where id = place_id and owner = auth.uid()));
drop policy if exists "分享的人收回" on public.group_places;
create policy "分享的人收回" on public.group_places for delete using (added_by = auth.uid());

drop policy if exists "成員看得到滑卡" on public.swipe_rounds;
create policy "成員看得到滑卡" on public.swipe_rounds for select using (public.is_member(group_id));
drop policy if exists "成員開新一輪" on public.swipe_rounds;
create policy "成員開新一輪" on public.swipe_rounds for insert with check (public.is_member(group_id) and created_by = auth.uid());
drop policy if exists "開的人刪除" on public.swipe_rounds;
create policy "開的人刪除" on public.swipe_rounds for delete using (created_by = auth.uid());

drop policy if exists "成員看得到大家的選擇" on public.swipes;
create policy "成員看得到大家的選擇" on public.swipes for select
  using (exists (select 1 from public.swipe_rounds r where r.id = round_id and public.is_member(r.group_id)));
drop policy if exists "自己滑" on public.swipes;
create policy "自己滑" on public.swipes for insert
  with check (user_id = auth.uid() and exists (select 1 from public.swipe_rounds r where r.id = round_id and public.is_member(r.group_id)));
drop policy if exists "改自己的選擇" on public.swipes;
create policy "改自己的選擇" on public.swipes for update using (user_id = auth.uid());

-- 新專案預設不一定開放資料表給登入的使用者，明確開放（實際能看到哪些資料由上面的 RLS 決定）
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- 即時同步：滑卡和群組分享即時出現在好友畫面
do $$ begin
  begin alter publication supabase_realtime add table public.swipes; exception when others then null; end;
  begin alter publication supabase_realtime add table public.group_places; exception when others then null; end;
  begin alter publication supabase_realtime add table public.swipe_rounds; exception when others then null; end;
end $$;

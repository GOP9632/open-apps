-- 美食收藏：Supabase 資料表與權限
-- 用法：Supabase 專案 → SQL Editor → New query → 整份貼上 → Run。重跑也不會出錯。
-- 全部放在獨立的 food schema，可以和其他 app 共用同一個 Supabase 專案，不會動到 public 裡原本的東西。
-- 跑完要到 Project Settings → Data API → Exposed schemas 加上 food。

create schema if not exists food;

-- 使用者名稱（註冊時自動建立）
create table if not exists food.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null default '',
  created_at timestamptz not null default now()
);

create or replace function food.handle_new_user() returns trigger
language plpgsql security definer set search_path = food as $$
begin
  insert into food.profiles (id, name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists food_on_auth_user_created on auth.users;
create trigger food_on_auth_user_created after insert on auth.users
  for each row execute function food.handle_new_user();

-- 這個 Supabase 專案原本就有的帳號也補上名字
insert into food.profiles (id, name)
select id, coalesce(nullif(raw_user_meta_data->>'name', ''), split_part(email, '@', 1)) from auth.users
on conflict (id) do nothing;

-- 店家（每個人自己的收藏）
create table if not exists food.places (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references food.profiles on delete cascade,
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
  photo text not null default '',               -- 封面照片網址（存在 food-photos bucket）
  dishes text[] not null default '{}',           -- 貼文推薦的菜色
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table food.places add column if not exists photo text not null default '';
alter table food.places add column if not exists dishes text[] not null default '{}';
create index if not exists places_owner_idx on food.places (owner);

-- 美食群組
create table if not exists food.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  owner uuid not null default auth.uid() references food.profiles on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists food.group_members (
  group_id uuid not null references food.groups on delete cascade,
  user_id uuid not null references food.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- 分享到群組的店家
create table if not exists food.group_places (
  group_id uuid not null references food.groups on delete cascade,
  place_id uuid not null references food.places on delete cascade,
  added_by uuid not null default auth.uid() references food.profiles on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, place_id)
);

-- 滑卡配對：一輪 = 一組候選店家，大家各自左滑右滑
create table if not exists food.swipe_rounds (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references food.groups on delete cascade,
  created_by uuid not null default auth.uid() references food.profiles on delete cascade,
  title text not null default '',
  filters jsonb not null default '{}',
  place_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists food.swipes (
  round_id uuid not null references food.swipe_rounds on delete cascade,
  user_id uuid not null default auth.uid() references food.profiles on delete cascade,
  place_id uuid not null,
  liked boolean not null,
  created_at timestamptz not null default now(),
  primary key (round_id, user_id, place_id)
);

-- 權限判斷（security definer 避免 RLS 互相遞迴）
create or replace function food.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = food as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid())
$$;

create or replace function food.shares_group_with(uid uuid) returns boolean
language sql stable security definer set search_path = food as $$
  select uid = auth.uid() or exists (
    select 1 from group_members a join group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid)
$$;

create or replace function food.can_see_place(pid uuid) returns boolean
language sql stable security definer set search_path = food as $$
  select exists (select 1 from group_places gp join group_members gm on gm.group_id = gp.group_id
                 where gp.place_id = pid and gm.user_id = auth.uid())
$$;

-- 用邀請碼加入群組
create or replace function food.join_group(code text) returns uuid
language plpgsql security definer set search_path = food as $$
declare gid uuid;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  select id into gid from groups where invite_code = lower(trim(code));
  if gid is null then raise exception '找不到這個邀請碼'; end if;
  insert into group_members (group_id, user_id) values (gid, auth.uid()) on conflict do nothing;
  return gid;
end $$;

-- 建立群組時，建立者自動成為成員
create or replace function food.add_owner_as_member() returns trigger
language plpgsql security definer set search_path = food as $$
begin
  insert into group_members (group_id, user_id) values (new.id, new.owner) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_group_created on food.groups;
create trigger on_group_created after insert on food.groups
  for each row execute function food.add_owner_as_member();

alter table food.profiles enable row level security;
alter table food.places enable row level security;
alter table food.groups enable row level security;
alter table food.group_members enable row level security;
alter table food.group_places enable row level security;
alter table food.swipe_rounds enable row level security;
alter table food.swipes enable row level security;

drop policy if exists "看得到自己和群組好友" on food.profiles;
create policy "看得到自己和群組好友" on food.profiles for select using (food.shares_group_with(id));
drop policy if exists "建立自己的名字" on food.profiles;
create policy "建立自己的名字" on food.profiles for insert with check (id = auth.uid());
drop policy if exists "改自己的名字" on food.profiles;
create policy "改自己的名字" on food.profiles for update using (id = auth.uid());

drop policy if exists "看自己的和群組分享的" on food.places;
create policy "看自己的和群組分享的" on food.places for select using (owner = auth.uid() or food.can_see_place(id));
drop policy if exists "新增自己的" on food.places;
create policy "新增自己的" on food.places for insert with check (owner = auth.uid());
drop policy if exists "改自己的" on food.places;
create policy "改自己的" on food.places for update using (owner = auth.uid());
drop policy if exists "刪自己的" on food.places;
create policy "刪自己的" on food.places for delete using (owner = auth.uid());

drop policy if exists "成員看得到群組" on food.groups;
create policy "成員看得到群組" on food.groups for select using (food.is_member(id) or owner = auth.uid());
drop policy if exists "建立群組" on food.groups;
create policy "建立群組" on food.groups for insert with check (owner = auth.uid());
drop policy if exists "建立者改名" on food.groups;
create policy "建立者改名" on food.groups for update using (owner = auth.uid());
drop policy if exists "建立者刪除" on food.groups;
create policy "建立者刪除" on food.groups for delete using (owner = auth.uid());

drop policy if exists "成員看得到成員" on food.group_members;
create policy "成員看得到成員" on food.group_members for select using (food.is_member(group_id));
drop policy if exists "自己退出" on food.group_members;
create policy "自己退出" on food.group_members for delete using (user_id = auth.uid());

drop policy if exists "成員看得到分享" on food.group_places;
create policy "成員看得到分享" on food.group_places for select using (food.is_member(group_id));
drop policy if exists "成員分享自己的店" on food.group_places;
create policy "成員分享自己的店" on food.group_places for insert
  with check (food.is_member(group_id) and added_by = auth.uid()
              and exists (select 1 from food.places where id = place_id and owner = auth.uid()));
drop policy if exists "分享的人收回" on food.group_places;
create policy "分享的人收回" on food.group_places for delete using (added_by = auth.uid());

drop policy if exists "成員看得到滑卡" on food.swipe_rounds;
create policy "成員看得到滑卡" on food.swipe_rounds for select using (food.is_member(group_id));
drop policy if exists "成員開新一輪" on food.swipe_rounds;
create policy "成員開新一輪" on food.swipe_rounds for insert with check (food.is_member(group_id) and created_by = auth.uid());
drop policy if exists "開的人刪除" on food.swipe_rounds;
create policy "開的人刪除" on food.swipe_rounds for delete using (created_by = auth.uid());
-- 群組建立者也能刪（清掉別人開的舊配對）
drop policy if exists "群組建立者也能刪滑卡" on food.swipe_rounds;
create policy "群組建立者也能刪滑卡" on food.swipe_rounds for delete using (exists (select 1 from food.groups g where g.id = swipe_rounds.group_id and g.owner = auth.uid()));

drop policy if exists "成員看得到大家的選擇" on food.swipes;
create policy "成員看得到大家的選擇" on food.swipes for select
  using (exists (select 1 from food.swipe_rounds r where r.id = round_id and food.is_member(r.group_id)));
drop policy if exists "自己滑" on food.swipes;
create policy "自己滑" on food.swipes for insert
  with check (user_id = auth.uid() and exists (select 1 from food.swipe_rounds r where r.id = round_id and food.is_member(r.group_id)));
drop policy if exists "改自己的選擇" on food.swipes;
create policy "改自己的選擇" on food.swipes for update using (user_id = auth.uid());
-- 滑卡「上一張」：可以刪掉自己滑的那筆
drop policy if exists "刪自己的選擇" on food.swipes;
create policy "刪自己的選擇" on food.swipes for delete using (user_id = auth.uid());

-- 新專案預設不一定開放資料表給登入的使用者，明確開放（實際能看到哪些資料由上面的 RLS 決定）
grant usage on schema food to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema food to authenticated, service_role;
grant execute on all functions in schema food to authenticated, service_role;

-- 即時同步：滑卡和群組分享即時出現在好友畫面
do $$ begin
  begin alter publication supabase_realtime add table food.swipes; exception when others then null; end;
  begin alter publication supabase_realtime add table food.group_places; exception when others then null; end;
  begin alter publication supabase_realtime add table food.swipe_rounds; exception when others then null; end;
end $$;

-- 店家照片：公開讀取的 bucket，每個人只能上傳／刪除自己資料夾（使用者 id）裡的檔案
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-photos', 'food-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
drop policy if exists "food 上傳自己的照片" on storage.objects;
create policy "food 上傳自己的照片" on storage.objects for insert to authenticated
  with check (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "food 刪自己的照片" on storage.objects;
create policy "food 刪自己的照片" on storage.objects for delete to authenticated
  using (bucket_id = 'food-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 分享捷徑用的收藏碼：iPhone 捷徑帶著它呼叫 quick-add 函式，在背景直接收藏
create table if not exists food.quick_keys (
  user_id uuid primary key references food.profiles on delete cascade,
  key text not null unique,
  created_at timestamptz not null default now()
);
alter table food.quick_keys enable row level security;
drop policy if exists "看自己的收藏碼" on food.quick_keys;
create policy "看自己的收藏碼" on food.quick_keys for select using (user_id = auth.uid());
grant select on food.quick_keys to authenticated;
grant select, insert, update on food.quick_keys to service_role;
-- 拿自己的收藏碼（沒有就產生；reset = true 換新的，舊捷徑就失效）
create or replace function food.quick_key(reset boolean default false) returns text
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if auth.uid() is null then raise exception '請先登入'; end if;
  if not reset then
    select q.key into k from food.quick_keys q where q.user_id = auth.uid();
    if k is not null then return k; end if;
  end if;
  k := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into food.quick_keys (user_id, key) values (auth.uid(), k)
  on conflict (user_id) do update set key = excluded.key, created_at = now();
  return k;
end $$;
revoke execute on function food.quick_key(boolean) from public, anon;
grant execute on function food.quick_key(boolean) to authenticated;

-- 課堂錄音：Supabase 資料表與權限
-- 用法：Supabase 專案 → SQL Editor → New query → 整份貼上 → Run。重跑也不會出錯。
-- 全部放在獨立的 recorder schema，可以和美食收藏共用同一個 Supabase 專案。
-- 跑完要到 Project Settings → Data API → Exposed schemas 加上 recorder。

create schema if not exists recorder;
grant usage on schema recorder to anon, authenticated, service_role;

-- 分類和錄音的文字資料（逐字稿、AI 筆記、問答、重點），每個人只看得到自己的
-- 錄音本身在 Storage 的 recorder-audio，照片不同步
create table if not exists recorder.items (
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('folder', 'session')),
  id text not null,
  data jsonb not null default '{}',
  updated_at bigint not null,          -- app 裡最後修改的時間（毫秒）
  deleted boolean not null default false,
  primary key (owner, kind, id)
);
create index if not exists items_sync_idx on recorder.items (owner, updated_at);
alter table recorder.items enable row level security;
drop policy if exists items_own on recorder.items;
create policy items_own on recorder.items for all to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
grant select, insert, update, delete on recorder.items to authenticated;

-- 每天的用量（給雲端 AI 擋額度用）
create table if not exists recorder.usage (
  owner uuid not null references auth.users on delete cascade,
  day date not null,
  audio_sec integer not null default 0,
  ai_calls integer not null default 0,
  primary key (owner, day)
);
alter table recorder.usage enable row level security;
drop policy if exists usage_read_own on recorder.usage;
create policy usage_read_own on recorder.usage for select to authenticated using (owner = auth.uid());
grant select on recorder.usage to authenticated;

-- 雲端 AI 函式呼叫：先問還剩多少（台灣時間每天歸零）
create or replace function recorder.quota(p_audio_sec int, p_calls int, p_max_audio_sec int, p_max_calls int, p_global_audio_sec int)
returns jsonb language plpgsql security definer set search_path = recorder as $$
declare
  today date := (now() at time zone 'Asia/Taipei')::date;
  mine recorder.usage;
  everyone bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'login'); end if;
  select * into mine from recorder.usage where owner = auth.uid() and day = today;
  select coalesce(sum(audio_sec), 0) into everyone from recorder.usage where day = today;
  return jsonb_build_object(
    'ok', coalesce(mine.audio_sec, 0) + greatest(p_audio_sec, 0) <= p_max_audio_sec
          and coalesce(mine.ai_calls, 0) + greatest(p_calls, 0) <= p_max_calls
          and everyone + greatest(p_audio_sec, 0) <= p_global_audio_sec,
    'reason', case
      when coalesce(mine.audio_sec, 0) + greatest(p_audio_sec, 0) > p_max_audio_sec then 'audio'
      when coalesce(mine.ai_calls, 0) + greatest(p_calls, 0) > p_max_calls then 'calls'
      when everyone + greatest(p_audio_sec, 0) > p_global_audio_sec then 'global'
      else '' end,
    'audio_sec', coalesce(mine.audio_sec, 0), 'ai_calls', coalesce(mine.ai_calls, 0), 'global_audio_sec', everyone);
end $$;

-- 用完再記帳；只能加不能減，所以自己呼叫也沒辦法把用量歸零
create or replace function recorder.add_usage(p_audio_sec int, p_calls int)
returns void language plpgsql security definer set search_path = recorder as $$
begin
  if auth.uid() is null then return; end if;
  insert into recorder.usage (owner, day, audio_sec, ai_calls)
  values (auth.uid(), (now() at time zone 'Asia/Taipei')::date, greatest(p_audio_sec, 0), greatest(p_calls, 0))
  on conflict (owner, day) do update
    set audio_sec = recorder.usage.audio_sec + excluded.audio_sec,
        ai_calls = recorder.usage.ai_calls + excluded.ai_calls;
end $$;
revoke all on function recorder.quota(int, int, int, int, int) from public, anon;
revoke all on function recorder.add_usage(int, int) from public, anon;
grant execute on function recorder.quota(int, int, int, int, int) to authenticated;
grant execute on function recorder.add_usage(int, int) to authenticated;

-- 錄音檔：私人 bucket，每個人只能讀寫自己資料夾（路徑開頭是自己的 user id）
insert into storage.buckets (id, name, public, file_size_limit)
values ('recorder-audio', 'recorder-audio', false, 52428800)
on conflict (id) do nothing;
drop policy if exists recorder_audio_own on storage.objects;
create policy recorder_audio_own on storage.objects for all to authenticated
  using (bucket_id = 'recorder-audio' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'recorder-audio' and (storage.foldername(name))[1] = auth.uid()::text);

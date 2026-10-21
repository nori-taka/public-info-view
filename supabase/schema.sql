-- 公共情報ビューア用のテーブルと検索関数。Supabase の SQL Editor に貼って Run する（1回だけ）。
-- 読めるのは本人（user_id が自分）だけ（RLS）。書き込みは巡回側が service_role キーで行う（RLSを通らない）。

create extension if not exists pg_trgm;   -- 日本語の部分一致検索を速くする

create table if not exists public.pi_items (
  user_id     uuid not null,
  id          text not null,                 -- 種別＋URL（または案件キー）から作ったID。同じものは上書き
  kind        text not null check (kind in ('news', 'bid', 'doc')),   -- 新着 / 入札 / 議会資料
  org_id      text,                          -- 団体ID（ota, kiryu …）
  org         text,                          -- 団体名
  label       text,                          -- 区分（新着・契約検査課・議決結果・入札 工事 発注情報 など）
  title       text not null,
  url         text,                          -- 原文のURL
  first_seen  timestamptz not null default now(),   -- 初めて見つけた日時（新着順の基準）
  hits        text[] not null default '{}',  -- 注目キーワード
  meta        jsonb not null default '{}'::jsonb,   -- 入札の列など
  body        text,                          -- 本文（検索の対象。一覧では読み込まない）
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists pi_items_seen_idx on public.pi_items (user_id, first_seen desc);
create index if not exists pi_items_search_idx on public.pi_items
  using gin ((coalesce(title, '') || ' ' || coalesce(body, '')) gin_trgm_ops);

alter table public.pi_items enable row level security;

drop policy if exists "own rows: select" on public.pi_items;
create policy "own rows: select" on public.pi_items
  for select using (auth.uid() = user_id);
-- insert / update / delete の方針は作らない（= ブラウザからは書き込めない）。巡回側だけが書く。

-- 全文検索（部分一致）。一致した前後を抜き出して返す。ログイン中の本人の行だけが対象になる。
create or replace function public.pi_search(
  q     text,
  kinds text[] default null,
  orgs  text[] default null,
  lim   int    default 60
)
returns table (
  id text, kind text, org_id text, org text, label text, title text, url text,
  first_seen timestamptz, hits text[], snippet text
)
language sql stable security invoker
as $$
  select i.id, i.kind, i.org_id, i.org, i.label, i.title, i.url, i.first_seen, i.hits,
    case
      when position(lower(q) in lower(coalesce(i.body, ''))) > 0
        then substr(i.body, greatest(position(lower(q) in lower(i.body)) - 40, 1), 200)
      else substr(coalesce(i.body, i.title), 1, 120)
    end as snippet
  from public.pi_items i
  where (coalesce(i.title, '') || ' ' || coalesce(i.body, ''))
        ilike '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    and (kinds is null or i.kind = any(kinds))
    and (orgs  is null or i.org_id = any(orgs))
  order by i.first_seen desc
  limit lim
$$;

-- 2026-10-30 以降、public に新しく作る表は、データAPIから使うために明示的な権限が要る（Supabaseからの通知）。
-- 読めるのはログイン本人だけ（上の RLS）。書き込みは巡回側の service_role キーだけ。anon（未ログイン）には何も付けない。
grant select on public.pi_items to authenticated;
grant select, insert, update, delete on public.pi_items to service_role;
grant execute on function public.pi_search(text, text[], text[], int) to authenticated;

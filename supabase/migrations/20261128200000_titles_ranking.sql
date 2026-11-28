-- 강화 최고 기록, 서버 첫 달성 알림, 칭호, 명예의 전당 부문 탭, 랭킹 칭호 효과, 랭킹 제외 표시(2026-11-28, 코드 세션 9 묶음 4).
-- 기획: docs/balance/growth-1127.md 8-1~8-3, docs/balance/ranking-titles.md(랭킹 칭호 이름·효과 식). 사용자 결정 3·5·6(공유 노트 new-features-1127.md).
-- - 강화 규칙은 그대로다. 계정마다 지금까지 성공한 가장 높은 단계를 남긴다(profiles.best_forge).
-- - 강화 첫 달성 칭호 여섯(대장장이 +20 … 신의 손 +50, 꾸밈만), 누적 랭킹 칭호(무기·모험·킬 1~3위, 골드 2·3위)와 갑부(골드 1위, 칭호 칸을 쓰지 않음).
-- - 칭호는 하나만 단다(set_title). 이름표·정보창·채팅(send_chat이 붙임)·명예의 전당(ranking)에 보인다.
-- - 랭킹 칭호는 매시 정각 뒤 처음 부르는 함수가 다시 정한다(refresh_rank_titles, 예약 작업 없음).
-- - 효과는 지금 단 칭호 하나로 전투·공격마다 센다: 무기 1위 모험 판 경험치 +75%(fx.exp), 모험 1~3위 판 금화 +10·6·3%(fx.gold),
--   킬 1~3위 사람에게 받는 피해 −10·6·3%(hit_player 맨 끝, 던전 몬스터 피해에는 없음).
-- - 서버에서 처음 나온 +30 이상 단계는 모두에게 notice kind 'forge_first'로 알린다(그때는 +35 이상 알림 'forge'를 보내지 않음).
-- - 시험용 계정 하나(마을 레벨 1, STR 999,999)는 rank_excluded로 모든 순위·칭호·갑부·서버 첫 달성에서 뺀다.
-- 새로 만드는 것과 올리기만 하는 채우기라 다시 실행해도 된다.
--
-- ⚠ 되돌리기 어려운 것(운영 DB):
--   1. profiles에 칸 넷(best_forge, best_forge_at, rank_excluded, title)이 생기고 지난 값을 채운다(지금 가진 무기 단계로, 2026-11-28 운영 DB 읽기: 기록 7명).
--   2. 강화 칭호를 지금 가진 무기 단계까지 준다(운영 DB 읽기: +20 이상 3명, +30 이상 1명). 서버 첫 달성 +30~+35 여섯 줄을 지금 주인으로 채운다(알림 없음).
--   3. 시험용 계정 조건(마을 레벨 1, STR 999,999)에 맞는 계정이 꼭 하나면 rank_excluded를 켠다(운영 DB 읽기: 1명).
--
-- 확인 쿼리(운영 DB에서 읽기만, 모든 칸 true). 운영 DB에서는 따로 select count(*) from public.profiles where rank_excluded; 가 1이어야 한다.
--   select
--     (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'profiles'
--       and column_name in ('best_forge', 'best_forge_at', 'rank_excluded', 'title')) = 4 as has_columns,
--     (select count(*) from public.titles) = 18 as titles_rows,
--     to_regclass('public.player_titles') is not null and to_regclass('public.title_holders') is not null
--       and to_regclass('public.forge_firsts') is not null and to_regclass('public.rank_clock') is not null as has_tables,
--     coalesce(not has_function_privilege('anon', 'public.ranking(text,integer)', 'execute')
--       and not has_function_privilege('anon', 'public.set_title(text)', 'execute')
--       and not has_function_privilege('authenticated', 'public.refresh_rank_titles()', 'execute'), false) as grants_ok,
--     not exists (select 1 from public.profiles as p where p.best_forge < (select coalesce(max(g.level), 0) from public.gear as g where g.player = p.id)) as best_filled,
--     not exists (select 1 from public.profiles as p join public.titles as t on t.kind = 'forge' and t.forge_level <= p.best_forge
--       where not exists (select 1 from public.player_titles as x where x.player = p.id and x.title = t.id)) as titles_filled,
--     not exists (select 1 from public.profiles where level = 1 and str = 999999 and not rank_excluded)
--       and (select count(*) from public.profiles where rank_excluded) <= 1 as excluded_ok,
--     not exists (select 1 from public.gear as g join public.profiles as p on p.id = g.player and not p.rank_excluded
--       cross join lateral generate_series(30, g.level) as s(lv)
--       where g.level >= 30 and not exists (select 1 from public.forge_firsts as f where f.level = s.lv)) as firsts_filled,
--     (select hour from public.rank_clock) > '-infinity' as ranks_set,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.forge_gear(bigint,boolean,boolean,boolean)')) = 'ee73f5fdc11c1b673ef1ea71d15580c2', false) as f_forge,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.hit_player(uuid,text,bigint,bigint,integer)')) = '5c6c767e16a5f53dfa780f1b50f4e580', false) as f_hit,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_power(uuid)')) = '69ba08025b614add8bbb94112d9824fb', false) as f_power,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_battle(text,integer,integer)')) = '3f96bb3c0edce6a367036f32765c1b50', false) as f_battle,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.send_chat(text,boolean)')) = '577b2f2ca691ba9f090153e45376e163', false) as f_chat,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.top_players(integer)')) = '77348588bfd9c5ea3f6fd0d962e8b468', false) as f_top,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.top_killers(integer)')) = '295392b1a2826fb1578f5330152aa456', false) as f_killers,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.adventure_ranking()')) = '5751d94952cd59c5c2001fec23b58928', false) as f_advrank,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.rank_order(text)')) = 'f366566716e8ae1e0cf97ba161311024', false) as f_order,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.worn_title_fx(uuid)')) = '00520d9c0f61e1fc4b2480b92b078eaa', false) as f_fx,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.refresh_rank_titles()')) = 'c062c5ec7e1e4520e3bb34202efa4dd4', false) as f_refresh,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.ranking(text,integer)')) = 'de7994cc6b4b3e4dea08c583a2505d31', false) as f_ranking,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.my_titles()')) = '9615fcf2196bd7324b4e6d96b4ec2960', false) as f_mine,
--     coalesce((select md5(replace(prosrc, E'\r', '')) from pg_proc where oid = to_regprocedure('public.set_title(text)')) = '416b0bc8d452baeae6dd622b36752262', false) as f_set;

-- ───────── 1. 프로필 칸: 최고 강화 기록, 랭킹 제외 표시 ─────────
-- best_forge: 지금까지 성공한 가장 높은 단계(팔거나 부서져도, 하락해도 내려가지 않음). best_forge_at: 그 단계에 처음 닿은 때.
-- rank_excluded: 켜진 계정은 명예의 전당 다섯 탭, 미니맵 레벨 TOP 10, Tab 킬 순위, 모험 들어가기 탭 순위, 랭킹 칭호, 갑부, 서버 첫 달성에서 빠진다.
-- 켜고 끄는 것은 관리 화면 Table Editor로 한다(화면 버튼 없음). 클라이언트는 이 칸들을 쓸 수 없다(profiles 쓰기 권한은 x, y, inventory, map뿐).
alter table public.profiles add column if not exists best_forge integer not null default 0;
alter table public.profiles add column if not exists best_forge_at timestamptz;
alter table public.profiles add column if not exists rank_excluded boolean not null default false;

-- ───────── 2. 칭호 표 ─────────
-- kind: forge = 강화 첫 달성(한 번 얻으면 계속, 꾸밈만), rank = 누적 랭킹 1~3위(매시 정각에 다시 정함), rich = 골드 1위 '갑부'(칭호 칸을 쓰지 않고 늘 함께 보임).
-- 주간 랭킹(다음 묶음)은 kind를 하나 더해 같은 표와 title_holders를 쓴다.
-- board·place: 랭킹 칭호의 부문(forge 무기, adventure 모험, gold 골드, kills 킬)과 순위. forge_level: 강화 칭호의 단계.
-- fx_exp: 모험 판 경험치(adventure_power의 fx.exp에 더함), fx_gold: 모험 판 금화(fx.gold에 더함), pvp_cut: 사람에게 받는 피해를 줄이는 몫(hit_player).
-- 효과는 지금 단 칭호 하나에서만 온다. 클라이언트는 id와 이름만 읽는다(다른 사람 이름표의 칭호 id를 이름으로 바꿈).
create table if not exists public.titles (
  id text primary key,
  name text not null,
  kind text not null,
  sort integer not null,
  forge_level integer unique,
  board text,
  place integer,
  fx_exp numeric not null default 0,
  fx_gold numeric not null default 0,
  pvp_cut numeric not null default 0,
  unique (kind, board, place)
);
alter table public.titles enable row level security;
revoke all on table public.titles from anon, authenticated;
grant select (id, name) on table public.titles to authenticated;
drop policy if exists "players read titles" on public.titles;
create policy "players read titles" on public.titles for select to authenticated using (true);

-- 이름: 강화 칭호는 기획 growth-1127.md 8-1, 랭킹 칭호와 효과는 ranking-titles.md 0장(골드 1위만 '갑부').
insert into public.titles (id, name, kind, sort, forge_level, board, place, fx_exp, fx_gold, pvp_cut) values
  ('rank_forge_1', '무기 1위', 'rank', 11, null, 'forge', 1, 0.75, 0, 0),
  ('rank_forge_2', '무기 2위', 'rank', 12, null, 'forge', 2, 0, 0, 0),
  ('rank_forge_3', '무기 3위', 'rank', 13, null, 'forge', 3, 0, 0, 0),
  ('rank_adventure_1', '모험 1위', 'rank', 21, null, 'adventure', 1, 0, 0.10, 0),
  ('rank_adventure_2', '모험 2위', 'rank', 22, null, 'adventure', 2, 0, 0.06, 0),
  ('rank_adventure_3', '모험 3위', 'rank', 23, null, 'adventure', 3, 0, 0.03, 0),
  ('rank_gold_1', '갑부', 'rich', 31, null, 'gold', 1, 0, 0, 0),
  ('rank_gold_2', '골드 2위', 'rank', 32, null, 'gold', 2, 0, 0, 0),
  ('rank_gold_3', '골드 3위', 'rank', 33, null, 'gold', 3, 0, 0, 0),
  ('rank_kills_1', '킬 1위', 'rank', 41, null, 'kills', 1, 0, 0, 0.10),
  ('rank_kills_2', '킬 2위', 'rank', 42, null, 'kills', 2, 0, 0, 0.06),
  ('rank_kills_3', '킬 3위', 'rank', 43, null, 'kills', 3, 0, 0, 0.03),
  ('forge_20', '대장장이', 'forge', 101, 20, null, null, 0, 0, 0),
  ('forge_30', '숙련 대장장이', 'forge', 102, 30, null, null, 0, 0, 0),
  ('forge_35', '명장', 'forge', 103, 35, null, null, 0, 0, 0),
  ('forge_40', '대명장', 'forge', 104, 40, null, null, 0, 0, 0),
  ('forge_45', '전설의 명장', 'forge', 105, 45, null, null, 0, 0, 0),
  ('forge_50', '신의 손', 'forge', 106, 50, null, null, 0, 0, 0)
on conflict (id) do update set
  name = excluded.name, kind = excluded.kind, sort = excluded.sort, forge_level = excluded.forge_level,
  board = excluded.board, place = excluded.place, fx_exp = excluded.fx_exp, fx_gold = excluded.fx_gold, pvp_cut = excluded.pvp_cut;

-- 단 칭호(null이면 달지 않음). 쓰기는 set_title로만 한다.
alter table public.profiles add column if not exists title text references public.titles (id) on delete set null;

-- 한 번 얻으면 계속 가지는 칭호(강화 첫 달성). 클라이언트는 직접 읽지 않고 my_titles로만 본다.
create table if not exists public.player_titles (
  player uuid not null references public.profiles (id) on delete cascade,
  title text not null references public.titles (id) on delete cascade,
  got_at timestamptz not null default now(),
  primary key (player, title)
);
alter table public.player_titles enable row level security;
revoke all on table public.player_titles from anon, authenticated;

-- 지금 랭킹 칭호를 가진 사람(칭호마다 한 사람). 매시 정각 뒤 refresh_rank_titles가 다시 적는다.
create table if not exists public.title_holders (
  title text primary key references public.titles (id) on delete cascade,
  player uuid not null references public.profiles (id) on delete cascade,
  since timestamptz not null default now()
);
create index if not exists title_holders_player_idx on public.title_holders (player);
alter table public.title_holders enable row level security;
revoke all on table public.title_holders from anon, authenticated;

-- 단계마다 서버에서 처음 닿은 사람(+30 이상만). 계정을 지워도 그 단계의 첫 달성은 다시 나오지 않는다.
create table if not exists public.forge_firsts (
  level integer primary key check (level between 30 and 99),
  player uuid references public.profiles (id) on delete set null,
  at timestamptz not null default now()
);
alter table public.forge_firsts enable row level security;
revoke all on table public.forge_firsts from anon, authenticated;

-- 랭킹 칭호를 마지막으로 정한 정각(한 줄). 따로 도는 예약 작업 없이, 정각 뒤 처음 부르는 함수가 다시 센다.
create table if not exists public.rank_clock (
  id boolean primary key default true check (id),
  hour timestamptz not null default '-infinity'
);
insert into public.rank_clock (id) values (true) on conflict (id) do nothing;
alter table public.rank_clock enable row level security;
revoke all on table public.rank_clock from anon, authenticated;

-- ───────── 3. 순위 규칙(명예의 전당 탭과 정각 칭호 셈이 함께 씀) ─────────
-- 마을: 마을 레벨, 경험치, 가입 순(모두 넣음). 무기: 최고 강화 기록, 먼저 닿은 사람, 가입 순(채워 넣은 기록은 닿은 때가 같아 가입 순).
-- 모험: 판 최고 레벨, 먼저 닿은 사람, 가입 순. 골드: 가진 골드, 가입 순. 킬: 킬, 데스 적은 사람, 가입 순.
-- 값이 0이면 순위가 없다(마을 빼고). 랭킹 제외 계정은 빠진다. value는 글자(골드와 레벨은 큰 수), extra는 킬 탭의 데스.
create or replace function public.rank_order(board text)
returns table (player uuid, place integer, value text, extra text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if board = 'village' then
    return query
      select p.id, (row_number() over (order by p.level desc, p.exp desc, p.created_at))::integer, p.level::text, null::text
      from public.profiles as p
      where not p.rank_excluded;
  elsif board = 'forge' then
    return query
      select p.id, (row_number() over (order by p.best_forge desc, p.best_forge_at, p.created_at))::integer, p.best_forge::text, null::text
      from public.profiles as p
      where p.best_forge > 0 and not p.rank_excluded;
  elsif board = 'adventure' then
    return query
      select p.id, (row_number() over (order by a.best_level desc, a.best_at nulls last, p.created_at))::integer, a.best_level::text, null::text
      from public.adventure_players as a join public.profiles as p on p.id = a.player
      where a.best_level > 0 and not p.rank_excluded;
  elsif board = 'gold' then
    return query
      select p.id, (row_number() over (order by p.gold desc, p.created_at))::integer, p.gold::text, null::text
      from public.profiles as p
      where p.gold > 0 and not p.rank_excluded;
  elsif board = 'kills' then
    return query
      select p.id, (row_number() over (order by p.kills desc, p.deaths, p.created_at))::integer, p.kills::text, p.deaths::text
      from public.profiles as p
      where p.kills > 0 and not p.rank_excluded;
  end if;
end;
$$;

-- 지금 단 칭호의 효과. 랭킹 칭호는 지금 가진 사람일 때만 든다(강화 칭호는 효과가 0).
create or replace function public.worn_title_fx(who uuid)
returns table (fx_exp numeric, fx_gold numeric, pvp_cut numeric)
language sql stable security definer set search_path = ''
as $$
  select t.fx_exp, t.fx_gold, t.pvp_cut
  from public.profiles as p
  join public.titles as t on t.id = p.title
  where p.id = who
    and (exists (select 1 from public.title_holders as h where h.title = t.id and h.player = p.id)
      or exists (select 1 from public.player_titles as x where x.title = t.id and x.player = p.id));
$$;

-- 매시 정각 뒤 처음 부를 때 랭킹 칭호(무기·모험·골드·킬 1~3위)를 다시 정한다. 같은 정각에는 한 번만 센다(rank_clock 줄을 잠근 쪽만).
-- 잃은 랭킹 칭호를 달고 있던 사람은 '달지 않음'이 된다. 프로필을 잠그는 함수는 잠그기 전에 이것을 불러야 서로 기다리다 멈추지 않는다.
create or replace function public.refresh_rank_titles() returns void
language plpgsql security definer set search_path = ''
as $$
declare
  h timestamptz := date_trunc('hour', now());
  b text;
  t record;
begin
  if (select c.hour from public.rank_clock as c where c.id) >= h then
    return;
  end if;
  update public.rank_clock as c set hour = h where c.id and c.hour < h;
  if not found then
    return;
  end if;
  for b in select distinct x.board from public.titles as x where x.kind in ('rank', 'rich') loop
    for t in
      select x.id, r.player from public.titles as x
      left join public.rank_order(b) as r on r.place = x.place
      where x.board = b and x.kind in ('rank', 'rich')
    loop
      if t.player is null then
        delete from public.title_holders as q where q.title = t.id;
      else
        insert into public.title_holders as q (title, player, since) values (t.id, t.player, now())
          on conflict (title) do update set player = excluded.player, since = excluded.since
          where q.player <> excluded.player;
      end if;
    end loop;
  end loop;
  update public.profiles as p set title = null
  from public.titles as x
  where x.id = p.title and x.kind in ('rank', 'rich')
    and not exists (select 1 from public.title_holders as q where q.title = p.title and q.player = p.id);
end;
$$;

-- 명예의 전당 탭(마을·무기·모험·골드·킬): 위 how_many명(1~100)과 내 줄. 줄마다 단 칭호 이름과 갑부 여부를 싣는다.
-- 값은 글자로 준다(골드 형식 규칙). 킬 탭의 extra는 데스.
create or replace function public.ranking(kind text, how_many integer default 50) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  n integer := least(greatest(coalesce(how_many, 50), 1), 100);
  rich_id uuid;
begin
  if kind is null or kind not in ('village', 'forge', 'adventure', 'gold', 'kills') then
    raise exception 'unknown kind';
  end if;
  perform public.refresh_rank_titles();
  select h.player into rich_id from public.title_holders as h join public.titles as x on x.id = h.title where x.kind = 'rich';
  return (
    with r as (select * from public.rank_order(kind))
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(jsonb_build_object(
          'rank', r.place, 'name', p.nickname, 'title', t.name, 'rich', coalesce(p.id = rich_id, false),
          'value', r.value, 'extra', r.extra, 'me', p.id = auth.uid()
        ) order by r.place)
        from r join public.profiles as p on p.id = r.player left join public.titles as t on t.id = p.title
        where r.place <= n
      ), '[]'::jsonb),
      'me', (
        select jsonb_build_object(
          'rank', r.place, 'name', p.nickname, 'title', t.name, 'rich', coalesce(p.id = rich_id, false),
          'value', r.value, 'extra', r.extra, 'me', true
        )
        from r join public.profiles as p on p.id = r.player left join public.titles as t on t.id = p.title
        where r.player = auth.uid()
      )
    )
  );
end;
$$;

-- 내가 가진 칭호(강화 첫 달성 + 지금 가진 랭킹 칭호, 갑부는 kind rich)와 단 칭호, 최고 강화 기록.
-- 얻은 때와 조건은 돌려주지 않는다(사용자 결정 '얻은 칭호 이름만'). 효과 숫자는 상태 값으로 준다.
create or replace function public.my_titles() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid := auth.uid();
begin
  if who is null then
    raise exception 'not signed in';
  end if;
  perform public.refresh_rank_titles();
  return jsonb_build_object(
    'titles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'name', t.name, 'kind', t.kind, 'exp', t.fx_exp, 'gold', t.fx_gold, 'cut', t.pvp_cut
      ) order by t.sort)
      from public.titles as t
      where exists (select 1 from public.player_titles as x where x.player = who and x.title = t.id)
        or exists (select 1 from public.title_holders as x where x.player = who and x.title = t.id)
    ), '[]'::jsonb),
    'worn', (select p.title from public.profiles as p where p.id = who),
    'best', (select p.best_forge from public.profiles as p where p.id = who)
  );
end;
$$;

-- 칭호 하나를 단다(null이면 뗀다). 가진 칭호만 달 수 있고 갑부는 달지 않는다(늘 함께 보이는 표시). 돌려주는 것은 단 칭호 id.
create or replace function public.set_title(title_id text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  who uuid := auth.uid();
begin
  perform public.refresh_rank_titles();
  if title_id is not null and not exists (
    select 1 from public.titles as t
    where t.id = title_id and t.kind <> 'rich'
      and (exists (select 1 from public.player_titles as x where x.player = who and x.title = t.id)
        or exists (select 1 from public.title_holders as x where x.player = who and x.title = t.id))
  ) then
    raise exception 'not owned';
  end if;
  update public.profiles set title = title_id where id = who;
  if not found then
    raise exception 'no profile';
  end if;
  return title_id;
end;
$$;

-- ───────── 4. 고친 함수(가장 새 본문을 옮겨 필요한 줄만 바꿈) ─────────

-- forge_gear: 20261116000000_forge.sql 본문 + 최고 강화 기록, 강화 첫 달성 칭호(돌려주는 title), 서버 첫 달성 알림 forge_first.
create or replace function public.forge_gear(item bigint, guard boolean default false, hold boolean default false, boost boolean default false)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  g public.gear%rowtype;
  w public.weapons%rowtype;
  st public.forge_steps%rowtype;
  sale numeric;
  cost numeric;
  p_success integer;
  p_keep integer;
  roll integer;
  outcome text;
  saved text;
  new_level integer;
  new_gold numeric;
  next_price numeric := 0;
  got text;
  server_first boolean := false;
  best integer;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.map <> 'smithy' then
    raise exception 'not at the smithy';
  end if;
  select * into g from public.gear as x where x.id = item and x.player = me.id for update;
  if not found then
    raise exception 'not owned';
  end if;
  select * into strict w from public.weapons as x where x.id = g.kind;
  if me.last_forge_at > now() - (3 * w.price) * interval '1 millisecond' then
    raise exception 'too fast';
  end if;
  if g.level >= 99 then
    raise exception 'max level';
  end if;
  select * into strict st from public.forge_steps as x where x.level = g.level;

  sale := public.gear_price(g.level, w.price, me.luk);
  cost := greatest(1, div(sale + 50, 100));
  p_success := st.success;
  p_keep := st.keep;
  if guard then
    if st.destroy = 0 then
      raise exception 'guard not usable';
    end if;
    cost := cost + greatest(1, div(st.destroy * sale * 11 + 9999999, 10000000));
  end if;
  if hold then
    if st.fall = 0 then
      raise exception 'hold not usable';
    end if;
    cost := cost + greatest(1, div(st.fall * (sale - public.gear_price(g.level - 1, w.price, me.luk)) * 11 + 9999999, 10000000));
  end if;
  if boost then
    if st.keep < 100000 then
      raise exception 'boost not usable';
    end if;
    cost := cost + greatest(1, div((public.gear_price(g.level + 1, w.price, me.luk) - sale) * 11 + 99, 100));
    p_success := p_success + 100000;
    p_keep := p_keep - 100000;
  end if;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  roll := floor(random() * 1000000);
  if roll < p_success then
    outcome := 'success';
  elsif roll < p_success + p_keep then
    outcome := 'keep';
  elsif roll < p_success + p_keep + st.fall then
    outcome := 'drop';
  else
    outcome := 'destroy';
  end if;
  if outcome = 'drop' and hold then
    outcome := 'keep';
    saved := 'hold';
  elsif outcome = 'destroy' and guard then
    outcome := 'keep';
    saved := 'guard';
  end if;

  update public.profiles set gold = gold - cost, last_forge_at = now() where id = me.id returning gold into new_gold;
  if outcome = 'destroy' then
    delete from public.gear as x where x.id = g.id;
  else
    new_level := g.level + case outcome when 'success' then 1 when 'drop' then -1 else 0 end;
    update public.gear as x set level = new_level where x.id = g.id;
    next_price := public.gear_price(new_level, w.price, me.luk);
  end if;

  -- 최고 강화 기록·강화 첫 달성 칭호·서버 첫 달성(2026-11-28, 기획 growth-1127.md 8-1). 기록은 하락·파괴로 내려가지 않는다.
  -- 서버 첫 달성은 +30 이상만, 랭킹 제외 계정은 세지 않는다.
  best := me.best_forge;
  if outcome = 'success' then
    if new_level > me.best_forge then
      update public.profiles set best_forge = new_level, best_forge_at = now() where id = me.id;
      best := new_level;
    end if;
    insert into public.player_titles (player, title)
      select me.id, t.id from public.titles as t where t.kind = 'forge' and t.forge_level = new_level
      on conflict do nothing
      returning title into got;
    if new_level >= 30 and not me.rank_excluded then
      insert into public.forge_firsts (level, player) values (new_level, me.id) on conflict (level) do nothing;
      server_first := found;
    end if;
  end if;

  -- 서버 첫 달성이면 그 알림 하나만 보낸다(+35 이상 알림과 겹치지 않게).
  if server_first then
    perform realtime.send(
      jsonb_build_object('kind', 'forge_first', 'name', me.nickname, 'item', g.kind, 'level', new_level),
      'notice',
      'world-chat',
      true
    );
  elsif outcome = 'success' and new_level >= 35 then
    perform realtime.send(
      jsonb_build_object('kind', 'forge', 'name', me.nickname, 'item', g.kind, 'level', new_level),
      'notice',
      'world-chat',
      true
    );
  end if;
  return jsonb_build_object(
    'result', outcome, 'saved', saved, 'level', new_level,
    'gold', new_gold::text, 'paid', cost::text, 'price', next_price::text,
    'best', best, 'title', (select t.name from public.titles as t where t.id = got)
  );
end;
$$;

-- hit_player: 20261128100000_village_campfire.sql 본문 + 정각 칭호 셈, 맞는 사람의 킬 칭호만큼 피해를 줄임.
create or replace function public.hit_player(
  target uuid, weapon text default 'pistol', gear bigint default null, shot bigint default null, pellets integer default 1
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  attacker public.profiles%rowtype;
  victim public.profiles%rowtype;
  arm public.weapons%rowtype;
  g public.gear%rowtype;
  lvl integer := 0;
  cur_mag integer;
  cur_mag_at timestamptz;
  cur_shot bigint;
  cur_pellets integer;
  damage bigint;
  remaining bigint;
  victim_karma integer;
  attacker_karma integer;
  share numeric;
  loot record;
  take integer;
  taken jsonb := '[]'::jsonb;
  gold_take numeric := 0;
  cut numeric := 0;
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;
  -- 정각이 지났으면 랭킹 칭호를 먼저 다시 정한다(프로필을 잠그기 전에, 2026-11-28).
  perform public.refresh_rank_titles();

  select * into arm from public.weapons as x where x.id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;
  if pellets is null or pellets < 1 or pellets > arm.pellets then
    raise exception 'too many pellets';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict attacker from public.profiles where id = auth.uid();
  if attacker.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if weapon = 'pistol' then
    cur_mag := attacker.pistol_mag;
    cur_mag_at := attacker.pistol_mag_at;
    cur_shot := attacker.pistol_shot;
    cur_pellets := attacker.pistol_pellets;
  else
    if hit_player.gear is null then
      select * into g from public.gear as x where x.player = attacker.id and x.kind = weapon order by x.id limit 1 for update;
    else
      select * into g from public.gear as x where x.id = hit_player.gear and x.player = attacker.id and x.kind = weapon for update;
    end if;
    if not found then
      raise exception 'weapon not owned';
    end if;
    lvl := g.level;
    cur_mag := g.mag_used;
    cur_mag_at := g.mag_at;
    cur_shot := g.last_shot;
    cur_pellets := g.shot_pellets;
  end if;

  select * into victim from public.profiles where id = target;
  -- 공격 금지: 시작마을과 그 안의 상점(mart)·대장간(smithy)·노동청(labor)·농협(farmcoop) 안 맵, 캠프파이어 맵(campfire, 2026-11-28), 모험 맵(id가 adv_로 시작), 빌라(id가 villa로 시작, 2026-11-27).
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'mart', 'smithy', 'labor', 'farmcoop', 'campfire')
    or left(attacker.map, 4) = 'adv_' or left(attacker.map, 5) = 'villa' then
    return null;
  end if;

  if shot is not null and shot = cur_shot then
    -- 같은 사격의 다른 사람(산탄): 간격과 탄창은 이미 셌다. 알 수 합만 본다.
    if cur_pellets + pellets > arm.pellets then
      raise exception 'too many pellets';
    end if;
    cur_pellets := cur_pellets + pellets;
  else
    -- 네트워크 지연으로 몰려 오는 요청을 감안해 발사 간격의 60%까지 봐준다.
    if attacker.last_hit_at > now() - arm.cooldown_ms * interval '0.6 milliseconds' then
      raise exception 'too fast';
    end if;
    if arm.magazine is not null then
      -- 재장전 시간의 80%를 쉬었으면 재장전했을 수 있으니 새 탄창으로 센다.
      if cur_mag_at <= now() - arm.reload_ms * interval '0.8 milliseconds' then
        cur_mag := 0;
      end if;
      if cur_mag >= arm.magazine then
        raise exception 'reloading';
      end if;
      cur_mag := cur_mag + 1;
      cur_mag_at := now();
    end if;
    cur_shot := shot;
    cur_pellets := pellets;
    update public.profiles set last_hit_at = now() where id = attacker.id;
  end if;

  if weapon = 'pistol' then
    update public.profiles
      set pistol_mag = cur_mag, pistol_mag_at = cur_mag_at, pistol_shot = cur_shot, pistol_pellets = cur_pellets
      where id = attacker.id;
  else
    update public.gear as x
      set mag_used = cur_mag, mag_at = cur_mag_at, last_shot = cur_shot, shot_pellets = cur_pellets
      where x.id = g.id;
  end if;

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  -- 킬 1~3위 칭호를 단 사람은 사람에게 받는 피해가 10·6·3% 준다(2026-11-28, ranking-titles.md 3-5). 식 맨 끝에 곱한다.
  select coalesce(max(f.pvp_cut), 0) into cut from public.worn_title_fx(victim.id) as f;
  -- 피해는 정수라서 소수점 아래는 그 확률만큼 1을 더한다. 체력보다 큰 피해는 체력만큼으로 줄여 bigint를 넘지 않게 한다.
  damage := least(victim.hp, greatest(1, floor(
    arm.damage * pellets * power(1.03::numeric, lvl) * (1 + attacker.str * 0.001) * 1000 / (1000 + victim.def) * (1 - cut) + random()::numeric
  )));

  update public.profiles set hp = greatest(hp - damage, 0) where id = target returning hp into remaining;

  -- world-chat은 클라이언트가 쓸 수 없는 채널이라 체력 값을 위조할 수 없다.
  perform realtime.send(
    jsonb_build_object('id', target, 'hp', remaining, 'max', victim.max_hp),
    'hp',
    'world-chat',
    true
  );

  if remaining = 0 then
    perform public.gain_exp(attacker.id, 10000);
    update public.profiles set kills = kills + 1 where id = attacker.id;
    update public.profiles set deaths = deaths + 1 where id = target;

    victim_karma := public.karma_now(victim.karma, victim.karma_at);
    attacker_karma := public.karma_now(attacker.karma, attacker.karma_at);

    if victim_karma > 0 then
      -- 현상범을 잡았다: 현상금을 넘기고 현상범의 악업을 1 내린다. 잡은 사람의 악업은 그대로다.
      share := case victim_karma when 1 then 0.01 when 2 then 0.05 when 3 then 0.10 when 4 then 0.20 else 0.30 end;
      for loot in select item, count from public.stash where player = target loop
        take := floor(loot.count * share);
        continue when take <= 0;
        -- share가 1보다 작아 take는 늘 count보다 작으므로 0개가 남는 일은 없다.
        update public.stash set count = count - take where player = target and item = loot.item;
        insert into public.stash (player, item, count) values (attacker.id, loot.item, take)
          on conflict (player, item) do update set count = public.stash.count + excluded.count;
        taken := taken || jsonb_build_object('item', loot.item, 'count', take);
      end loop;
      gold_take := floor(victim.gold * share);
      update public.profiles set gold = gold - gold_take, karma = victim_karma - 1, karma_at = now() where id = target;
      update public.profiles set gold = gold + gold_take where id = attacker.id;
      perform realtime.send(
        jsonb_build_object('killer', attacker.id, 'victim', target, 'gold', gold_take::text, 'items', taken),
        'bounty',
        'world-chat',
        true
      );
    else
      update public.profiles set karma = least(attacker_karma + 1, 5), karma_at = now() where id = attacker.id;
    end if;

    -- wanted는 잡힌 사람의 악업 단계(0이면 현상범이 아니었음). 받은 클라이언트는 현상범 명단을 다시 읽는다.
    perform realtime.send(
      jsonb_build_object('kind', 'kill', 'killer', attacker.nickname, 'victim', victim.nickname, 'wanted', victim_karma),
      'notice',
      'world-chat',
      true
    );
  end if;
  return remaining;
end;
$$;

-- adventure_power: 20261119200000_adventure_expansion.sql 본문 + 단 칭호 효과(fx.exp, fx.gold).
create or replace function public.adventure_power(who uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  base_level numeric;
  mul numeric;
  c_hp numeric; c_atk numeric; c_def numeric; c_agi numeric; c_luc numeric;
  full_zones numeric;
  g_hp numeric; g_atk numeric; g_def numeric; g_agi numeric; g_luc numeric;
  combo_add numeric := 0;
  combo_max numeric := 0.5;
  crit_mul numeric := 2;
  leech numeric := 0;
  exp_bonus numeric := 0;
  gold_bonus numeric := 0;
  endure jsonb := '[]';
  it record;
  t_hp numeric;
  -- 장착 무기(main_weapon, 가진 것만): 스텟, 그 스텟에 더할 몫, 특수 효과와 값
  eq_stat text;
  eq_pct numeric := 0;
  eq_fx text;
  eq_fx_value numeric := 0;
  guard numeric := 0;
  drop_bonus numeric := 0;
  -- 무기 고정 수치(포인트, 2026-11-19 사용자 "이대로 (추천)", 기획 10장 '고정 수치'): 스텟마다 컬렉션 몫 + 장착 몫
  f_hp numeric := 0; f_atk numeric := 0; f_def numeric := 0; f_agi numeric := 0; f_luc numeric := 0;
  eq_flat numeric := 0;
  t_exp numeric := 0;
  t_gold numeric := 0;
begin
  select * into strict me from public.profiles as p where p.id = who;
  select * into strict a from public.adventure_players as x where x.player = who;
  -- 장착 몫 고정 포인트 = floor(장착 % × 2 × 그 무기 지역 보스 레벨)
  select w.stat, w.equip_pct * (1 + 0.25 * (c.copies - 1)), w.equip_fx, w.equip_fx_value,
      floor(w.equip_pct * (1 + 0.25 * (c.copies - 1)) * 2 * z.boss_level)
    into eq_stat, eq_pct, eq_fx, eq_fx_value, eq_flat
    from public.adventure_weapons as w join public.adventure_collection as c on c.weapon = w.id and c.player = who
    join public.adventure_zones as z on z.id = w.zone
    where w.id = a.main_weapon;
  if not found then
    eq_stat := null; eq_pct := 0; eq_fx := null; eq_fx_value := 0; eq_flat := 0;
  end if;
  base_level := floor(me.level / 1000);
  mul := 1 + base_level * 0.25;

  select
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'hp'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'atk'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'def'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'agi'), 0),
    coalesce(sum(w.star * 0.01 * c.copies) filter (where w.stat = 'luc'), 0)
  into c_hp, c_atk, c_def, c_agi, c_luc
  from public.adventure_collection as c join public.adventure_weapons as w on w.id = c.weapon
  where c.player = who;
  -- 컬렉션 몫 고정 포인트: 가진 무기마다 floor(★ × 1% × 가진 수 × 2 × 그 무기 지역 보스 레벨)(무기마다 버림, 계산기 flatOf)
  select
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'hp'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'atk'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'def'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'agi'), 0),
    coalesce(sum(floor(w.star * 0.01 * c.copies * 2 * z.boss_level)) filter (where w.stat = 'luc'), 0)
  into f_hp, f_atk, f_def, f_agi, f_luc
  from public.adventure_collection as c
  join public.adventure_weapons as w on w.id = c.weapon
  join public.adventure_zones as z on z.id = w.zone
  where c.player = who;
  case eq_stat
    when 'hp' then f_hp := f_hp + eq_flat;
    when 'atk' then f_atk := f_atk + eq_flat;
    when 'def' then f_def := f_def + eq_flat;
    when 'agi' then f_agi := f_agi + eq_flat;
    when 'luc' then f_luc := f_luc + eq_flat;
    else null;
  end case;
  -- 장착 무기 스텟은 컬렉션 보너스와 따로 더한다(계산기 statsWith의 col[stat] += …).
  case eq_stat
    when 'hp' then c_hp := c_hp + eq_pct;
    when 'atk' then c_atk := c_atk + eq_pct;
    when 'def' then c_def := c_def + eq_pct;
    when 'agi' then c_agi := c_agi + eq_pct;
    when 'luc' then c_luc := c_luc + eq_pct;
    else null;
  end case;

  -- '지역 무기 다 모음 +5%'는 지역 여덟(sort 1~8)만 센다(기획 10장, 새 지역 무기 셋은 모두 반드시 얻어 세면 거저 붙음)
  select 0.05 * count(*) into full_zones from (
    select w.zone from public.adventure_weapons as w
    join public.adventure_zones as z on z.id = w.zone
    left join public.adventure_collection as c on c.weapon = w.id and c.player = who
    where z.sort <= 8
    group by w.zone having count(c.weapon) = count(*)
  ) as done;

  -- 보석: 그 스텟 고정 포인트(2026-11-19 사용자 "보석은 %로 하지않고, 절대값으로 한다.", 기획 9장). 예전은 % 합
  select
    coalesce(sum(i.value) filter (where i.stat = 'hp'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'atk'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'def'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'agi'), 0),
    coalesce(sum(i.value) filter (where i.stat = 'luc'), 0)
  into g_hp, g_atk, g_def, g_agi, g_luc
  from public.adventure_owned as o join public.adventure_items as i on i.id = o.item
  where o.player = who and o.slot is not null and i.kind = 'gem';

  for it in
    select i.kind, i.value, i.value2 from public.adventure_owned as o join public.adventure_items as i on i.id = o.item
    where o.player = who and o.slot is not null and i.kind <> 'gem'
  loop
    if it.kind = 'learn' then
      exp_bonus := exp_bonus + it.value;
    elsif it.kind = 'pouch' then
      gold_bonus := gold_bonus + it.value;
    elsif it.kind = 'combo' then
      combo_add := combo_add + it.value;
      combo_max := greatest(combo_max, it.value2);
    elsif it.kind = 'sharp' then
      crit_mul := greatest(crit_mul, it.value);
    elsif it.kind = 'leech' then
      leech := greatest(leech, it.value);
    elsif it.kind = 'endure' then
      endure := endure || jsonb_build_array(jsonb_build_array(it.value, coalesce(it.value2, 0)));
    end if;
  end loop;
  -- 장착 무기 특수 효과는 장신구에 더한다(날카로운 반지 ×2.5 + 0.5 = ×3, 연타 반지 상한 60% + 10%p = 70%).
  if eq_fx = 'crit' then
    crit_mul := crit_mul + eq_fx_value;
  elsif eq_fx = 'combo' then
    combo_add := combo_add + eq_fx_value;
    combo_max := combo_max + eq_fx_value;
  elsif eq_fx = 'leech' then
    leech := leech + eq_fx_value;
  elsif eq_fx = 'guard' then
    guard := eq_fx_value;
  elsif eq_fx = 'drop' then
    drop_bonus := eq_fx_value;
  end if;

  -- 단 칭호 효과(2026-11-28, ranking-titles.md 3-2·3-3): 무기 1위 판 경험치 +75%, 모험 1~3위 판 금화 +10·6·3%. 장신구 효과와 같은 괄호에 더한다.
  select coalesce(max(f.fx_exp), 0), coalesce(max(f.fx_gold), 0) into t_exp, t_gold from public.worn_title_fx(who) as f;
  exp_bonus := exp_bonus + t_exp;
  gold_bonus := gold_bonus + t_gold;

  t_hp := greatest(0, me.max_hp - 100);
  return jsonb_build_object(
    'hp', (100 + (a.run_hp + t_hp * 10 + f_hp + g_hp) * 5) * (1 + c_hp + full_zones) * mul,
    'atk', (10 + (a.run_atk + me.str * 10 + f_atk + g_atk)) * (1 + c_atk + full_zones) * mul,
    'def', (a.run_def + me.def * 10 + f_def + g_def) * 3 * (1 + c_def + full_zones) * mul,
    'agi', (a.run_agi + me.agi * 10 + f_agi + g_agi) * (1 + c_agi + full_zones) * mul,
    'luc', (a.run_luc + me.luk * 10 + f_luc + g_luc) * (1 + c_luc + full_zones) * mul,
    'base', base_level,
    'mul', mul,
    'town', jsonb_build_object('hp', t_hp, 'atk', me.str, 'def', me.def, 'agi', me.agi, 'luc', me.luk),
    -- 무기 고정 포인트(스텟마다 컬렉션 + 장착, 포인트라 HP는 × 5, DEF는 × 3으로 보임)
    'flat', jsonb_build_object('hp', f_hp, 'atk', f_atk, 'def', f_def, 'agi', f_agi, 'luc', f_luc),
    -- 낀 보석 고정 포인트(스텟마다 합, 포인트라 HP는 × 5, DEF는 × 3으로 보임)
    'gem', jsonb_build_object('hp', g_hp, 'atk', g_atk, 'def', g_def, 'agi', g_agi, 'luc', g_luc),
    'bonus', jsonb_build_object(
      'hp', c_hp + full_zones, 'atk', c_atk + full_zones, 'def', c_def + full_zones,
      'agi', c_agi + full_zones, 'luc', c_luc + full_zones
    ),
    'fx', jsonb_build_object(
      'comboAdd', combo_add, 'comboMax', combo_max, 'critMul', crit_mul, 'leech', leech, 'endure', endure,
      'exp', exp_bonus, 'gold', gold_bonus, 'guard', guard, 'drop', drop_bonus
    ),
    -- 화면에 보일 장착 효과(숫자만). 장착이 없거나 가진 무기가 아니면 null
    'equip', case when eq_stat is null then null else jsonb_build_object(
      'weapon', a.main_weapon, 'stat', eq_stat, 'pct', eq_pct, 'flat', eq_flat, 'fx', eq_fx, 'value', eq_fx_value
    ) end
  );
end;
$$;

-- adventure_battle: 20261124000000_adventure_boss_bp.sql 본문 + 맨 앞에서 정각 칭호 셈.
create or replace function public.adventure_battle(map text, x integer, y integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  z public.adventure_zones%rowtype;
  a public.adventure_players%rowtype;
  s public.adventure_spots%rowtype;
  m public.adventure_minis%rowtype;
  is_boss boolean;
  is_mini boolean;
  boss_key text;
  fresh boolean := false;
  first_kill boolean := false;
  bp_gain integer := 0;
  lv numeric;
  d numeric;
  hp_mul double precision := 1;
  atk_mul double precision := 1;
  exp_mul numeric := 1;
  drop_mul numeric := 1;
  pw jsonb;
  p_hp double precision; p_atk double precision; p_def double precision; p_agi double precision; p_luc double precision;
  m_hp double precision; m_atk double precision;
  combo double precision; crit double precision; hit double precision; crit_mul double precision; leech double precision;
  saves jsonb;
  save_left integer;
  saved boolean;
  back double precision;
  my double precision;
  mon double precision;
  dmg double precision;
  is_crit boolean;
  hits integer;
  turns jsonb := '[]';
  won boolean := false;
  luc numeric;
  gain numeric := 0;
  new_level numeric;
  got_points numeric := 0;
  gold_gain numeric := 0;
  parts integer;
  unit numeric;
  dropped text;
  drop_copies integer := 0;
  roll double precision;
  settled jsonb;
  -- 설정 표 값(위 1번의 key)
  t_drop_normal numeric; t_drop_boss numeric; t_exp_base numeric; t_exp_boss numeric;
  t_foe_hp numeric; t_foe_atk numeric; t_foe numeric;
  t_exp3 numeric; t_exp2 numeric; t_exp15 numeric; t_drop3 numeric; t_drop2 numeric; t_foe_hp_half numeric; t_foe_atk_half numeric;
  t_bp_boss numeric; t_bp_mini numeric;
begin
  -- 정각이 지났으면 랭킹 칭호를 먼저 다시 정한다(프로필을 잠그기 전에, 2026-11-28). 칭호 효과는 adventure_power가 본다.
  perform public.refresh_rank_titles();
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  select * into s from public.adventure_spots as q where q.map = adventure_battle.map and q.x = adventure_battle.x and q.y = adventure_battle.y;
  if not found then
    raise exception 'no monster';
  end if;
  select * into strict z from public.adventure_zones as q where q.id = s.zone;
  if me.map <> s.map then
    raise exception 'not in the field';
  end if;
  a := public.adventure_prepare(me.id);
  if not a.in_run then
    raise exception 'no run';
  end if;
  if a.run_map is distinct from s.map then
    raise exception 'not in the field';
  end if;
  -- 지역 잠금(앞 지역 보스를 계정이 잡았는지)은 보지 않는다(2026-11-19 사용자 "싸움이 가능해야 한다"). 판이 갈 수 있는 맵은 adventure_move가 정하고
  -- (다음 지역은 이번 판에 보스를 잡아야), 그 맵에 있으면 싸운다. 높은 지역 포탈로 간 판이 화산 폭풍과 앞 지역 포탈로 걸어 돌아간 곳에서 싸울 수 있다.
  is_boss := s.kind = 'boss';
  is_mini := s.kind = 'mini';
  if is_mini then
    select * into strict m from public.adventure_minis as q where q.zone = z.id and q.idx = s.mini;
  end if;
  lv := s.level;
  d := case when is_mini then m.strength when is_boss then z.boss_strength else z.strength end;
  if lv is null then
    raise exception 'no monster';
  end if;
  -- 보스·중간 보스는 판마다 한 번(2026-11-21 사용자 "중간보스, 보스 는 게임 한판 당 한번씩만 잡을수있게"): 이번 판에 이긴 것(run_bosses에 키)과는 싸우지 않는다.
  -- 수문장도 같다(화면은 이긴 뒤 숨김). 별 하늘 보스 둘은 키가 하나('adv_7')라 하나를 이기면 둘 다 못 싸운다. 진 싸움은 키가 붙지 않아 다시 싸운다.
  -- BP·last_battle_at을 쓰기 전에 돌려보낸다. 키는 이긴 뒤 붙이는 것과 같다(보스 'adv_N', 중간 보스 'adv_N#idx', 수문장 'gate:맵').
  boss_key := case when is_boss then z.id when is_mini then z.id || '#' || m.idx end;
  if coalesce(boss_key, case when s.kind = 'gate' then 'gate:' || s.map end) = any (a.run_bosses) then
    raise exception 'already won';
  end if;
  if a.bp <= 0 then
    raise exception 'no bp';
  end if;
  -- 너무 빨리 누름 막기(기획 8장, 연출과 결과 줄을 합한 가장 짧은 시간)
  if a.last_battle_at > now() - interval '2.5 seconds' then
    raise exception 'too fast';
  end if;
  -- 숫자 설정 표(2026-11-23 사용자 "옮겨"): 전투 한 번에 한 번 읽는다(16줄, bp_boss·bp_mini는 2026-11-24). 줄이 빠졌으면 싸우지 않는다.
  select
    max(q.value) filter (where q.key = 'drop_normal'), max(q.value) filter (where q.key = 'drop_boss'),
    max(q.value) filter (where q.key = 'exp_base'), max(q.value) filter (where q.key = 'exp_boss_x'),
    max(q.value) filter (where q.key = 'foe_hp_x'), max(q.value) filter (where q.key = 'foe_atk_x'), max(q.value) filter (where q.key = 'foe_x'),
    max(q.value) filter (where q.key = 'bonus_exp3'), max(q.value) filter (where q.key = 'bonus_exp2'), max(q.value) filter (where q.key = 'bonus_exp15'),
    max(q.value) filter (where q.key = 'bonus_drop3'), max(q.value) filter (where q.key = 'bonus_drop2'),
    max(q.value) filter (where q.key = 'bonus_foe_hp'), max(q.value) filter (where q.key = 'bonus_foe_atk'),
    max(q.value) filter (where q.key = 'bp_boss'), max(q.value) filter (where q.key = 'bp_mini')
  into t_drop_normal, t_drop_boss, t_exp_base, t_exp_boss, t_foe_hp, t_foe_atk, t_foe,
    t_exp3, t_exp2, t_exp15, t_drop3, t_drop2, t_foe_hp_half, t_foe_atk_half, t_bp_boss, t_bp_mini
  from public.adventure_tuning as q;
  if t_drop_normal is null or t_drop_boss is null or t_exp_base is null or t_exp_boss is null or t_foe_hp is null or t_foe_atk is null or t_foe is null
    or t_exp3 is null or t_exp2 is null or t_exp15 is null or t_drop3 is null or t_drop2 is null or t_foe_hp_half is null or t_foe_atk_half is null
    or t_bp_boss is null or t_bp_mini is null then
    raise exception 'no tuning';
  end if;
  -- 구역 보너스는 일반 몬스터 자리에만 있다(일곱 빛 들판의 빛, 지옥 첫 띠 경험치 방). 배수는 설정 표 bonus_*(처음 값 3, 2, 1.5, 3, 2, 0.5, 0.5).
  case s.bonus
    when 'exp3' then exp_mul := t_exp3;
    when 'exp2' then exp_mul := t_exp2;
    when 'exp15' then exp_mul := t_exp15;
    when 'drop3' then drop_mul := t_drop3;
    when 'drop2' then drop_mul := t_drop2;
    when 'foeHp' then hp_mul := t_foe_hp_half;
    when 'foeAtk' then atk_mul := t_foe_atk_half;
    else null;
  end case;
  -- 몬스터 체력 × 2, 공격 × 1.5(2026-11-20 사용자 "공격 1.5, 체력 *2 로", 보통·중간 보스·보스·수문장 모두). 지역 세기는 그대로 두고 여기서 곱한다(에이전트가 정함).
  -- 그 위에 × 0.8(2026-11-23 사용자 "몬스터들의 세기를 지금보다 20% 약하게 만든다.", 체력·공격 모두, 보통·중간 보스·보스·수문장 모두).
  -- 표의 세기 값과 레벨은 그대로 두고 여기서 곱한다(기획이 정함). 결과의 'mon' 체력·공격도 줄어든 값이다.
  -- 2와 1.5는 설정 표 foe_hp_x·foe_atk_x, 0.8은 foe_x(2026-11-23 사용자 "옮겨"). 곱하는 차례는 예전 식과 같다.
  m_hp := d * (30 + 10 * lv) * hp_mul * t_foe_hp * t_foe;
  m_atk := d * (5 + 1.5 * lv) * atk_mul * t_foe_atk * t_foe;

  pw := public.adventure_power(me.id);
  p_hp := (pw ->> 'hp')::double precision;
  p_atk := (pw ->> 'atk')::double precision;
  p_def := (pw ->> 'def')::double precision;
  p_agi := (pw ->> 'agi')::double precision;
  p_luc := (pw ->> 'luc')::double precision;
  crit_mul := (pw -> 'fx' ->> 'critMul')::double precision;
  leech := (pw -> 'fx' ->> 'leech')::double precision;
  saves := pw -> 'fx' -> 'endure';
  save_left := jsonb_array_length(saves);

  -- 전투(dungeon-run.js fightOnce). 콤보·크리티컬 식의 몬스터 레벨 × 2 → × 4(2026-11-19 사용자 "agi 의 효과를 줄이고 세기는 5%만 낮춘다.", 기획 17장 'AGI와 장신구 조정의 안' 1)
  combo := least((pw -> 'fx' ->> 'comboMax')::double precision, p_agi / (p_agi + lv * 4) + (pw -> 'fx' ->> 'comboAdd')::double precision);
  crit := least(0.5, (p_agi + p_luc) / (p_agi + p_luc + lv * 4));
  -- 받는 피해 = 몬스터 ATK² ÷ (몬스터 ATK + 내 DEF) × (1 − 장착 무기의 받는 피해 줄임)(기획 5장, 19장 '컬렉션 무기 장착')
  hit := m_atk * m_atk / (m_atk + p_def) * (1 - coalesce((pw -> 'fx' ->> 'guard')::double precision, 0));
  my := p_hp;
  mon := m_hp;
  <<fight>>
  for turn in 1..20 loop
    hits := 1;
    while hits < 5 and random() < combo loop
      hits := hits + 1;
    end loop;
    for h in 1..hits loop
      is_crit := random() < crit;
      dmg := least(mon, p_atk * (0.9 + 0.2 * random()) * case when is_crit then crit_mul else 1 end);
      mon := mon - dmg;
      if mon > 0 and leech > 0 then
        my := least(p_hp, my + dmg * leech);
      end if;
      turns := turns || jsonb_build_array(jsonb_build_array(0, round(dmg), is_crit::integer, ceil(my), ceil(greatest(mon, 0))));
      if mon <= 0 then
        won := true;
        exit fight;
      end if;
    end loop;
    dmg := hit * (0.9 + 0.2 * random());
    my := my - dmg;
    turns := turns || jsonb_build_array(jsonb_build_array(1, round(dmg), 0, ceil(greatest(my, 0)), ceil(mon)));
    if my <= 0 then
      saved := false;
      while not saved and save_left > 0 loop
        saved := random() < (saves -> (save_left - 1) ->> 0)::double precision;
        back := (saves -> (save_left - 1) ->> 1)::double precision;
        save_left := save_left - 1;
      end loop;
      exit fight when not saved;
      my := greatest(1, p_hp * back);
      turns := turns || jsonb_build_array(jsonb_build_array(2, 0, 0, ceil(my), ceil(mon)));
    end if;
  end loop;

  if won then
    a.bp := greatest(0, a.bp - 1);
    a.run_wins := a.run_wins + 1;
    -- 경험치: expOf × (보스·중간 보스 3, 이길 때마다) × (1 + 배움의 보석) × 구역 보너스. 판 레벨로 줄지 않는다(2026-11-18 사용자 "레벨의 2배가 되더라도, 경험치 못얻거나, 아이템 못얻는건 없다. 무조건 얻는다").
    -- 얻는 경험치 40 → 20(2026-11-19 사용자 "…50%를 줄이거나…") → 10(2026-11-20 사용자 "레벨업 경험치 얻는량을 지금 보다 다시 50% 줄여라", 보통·중간 보스·보스·수문장 모두)
    -- 10과 보스·중간 보스 3은 설정 표 exp_base·exp_boss_x(2026-11-23 사용자 "옮겨").
    gain := round(t_exp_base * (lv + 3) ^ 2 * case when is_boss or is_mini then t_exp_boss else 1 end
      * (1 + (pw -> 'fx' ->> 'exp')::numeric) * exp_mul);
    a.run_exp := a.run_exp + gain;
    -- levelFromExp: 레벨 n까지 쌓인 경험치가 50n(n − 1)
    new_level := floor((1 + sqrt(1 + 8 * a.run_exp / 100)) / 2);
    if new_level > a.run_level then
      got_points := (new_level - a.run_level) * 5;
      a.run_points := a.run_points + got_points;
      a.run_level := new_level;
      if a.auto_split then
        -- 추천대로 나누기 HP 3 : ATK 3 : DEF 1 : AGI 1(마을 AGI와 상관없이, 2026-11-18 사용자 결정). 나눈 나머지는 남긴다.
        parts := 8;
        unit := floor(a.run_points / parts);
        a.run_hp := a.run_hp + unit * 3;
        a.run_atk := a.run_atk + unit * 3;
        a.run_def := a.run_def + unit;
        a.run_agi := a.run_agi + unit;
        a.run_points := a.run_points - unit * parts;
      end if;
    end if;

    if is_boss then
      boss_key := z.id;
      first_kill := not exists (select 1 from public.adventure_bosses as b where b.player = me.id and b.zone = z.id);
      insert into public.adventure_bosses (player, zone) values (me.id, z.id)
        on conflict on constraint adventure_bosses_pkey do update set kills = public.adventure_bosses.kills + 1;
      -- 보스 BP(2026-11-24 사용자 "보스를 잡으면 bp+3 (즉 bp1 소모되니깐 bp+2)", 예전 5): 설정 표 bp_boss(처음 값 3, 정수로 반올림).
      bp_gain := round(t_bp_boss)::integer;
    elsif is_mini then
      boss_key := z.id || '#' || m.idx;
      first_kill := not exists (
        select 1 from public.adventure_mini_kills as k where k.player = me.id and k.zone = z.id and k.idx = m.idx
      );
      insert into public.adventure_mini_kills (player, zone, idx) values (me.id, z.id, m.idx)
        on conflict on constraint adventure_mini_kills_pkey do update set kills = public.adventure_mini_kills.kills + 1;
      -- 중간 보스 BP(같은 날 "중간보스를 잡으면 bp + 2 ( bp1 소모되니깐 bp + 1)", 예전과 같음): 설정 표 bp_mini(처음 값 2).
      bp_gain := round(t_bp_mini)::integer;
    end if;
    fresh := boss_key is not null and not (boss_key = any (a.run_bosses));

    -- 판 금화: 332 × (L ÷ 20,000)^0.08 × lucGold × (1 + 금화 주머니)(166 → 332, 2026-11-19 사용자 "가져오는 재화는 100%로 같게하고, 금화를 현재보다 2배로 늘려라."). 예전: 166(2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로"). 보스·중간 보스를 처음 잡을 때만 × 5(금화 방 × 10).
    luc := (pw ->> 'luc')::numeric;
    gold_gain := round(332 * power(lv / 20000, 0.08) * (1 + 3 * luc / (luc + 4 * lv))
      * case when first_kill then 5 * coalesce(m.gold, 1) else 1 end
      * (1 + (pw -> 'fx' ->> 'gold')::numeric));
    a.run_gold := a.run_gold + gold_gain;

    if boss_key is not null then
      -- 보스·중간 보스 무기: 일반 몬스터 드랍 식에서 0.002만 0.15로, 이길 때마다(이제 판마다 한 번). 2026-11-21 사용자 "보스 한판당 한번이니깐 드롭률을 15% 정도로 올려라.",
      -- "LUC, 장착무기의 드랍효과는 적용되야한다."(중간 보스도 같음은 PM이 정함). 상한은 두지 않는다(가장 높으면 약 0.15 × 2 × 1.75 ≈ 52%).
      -- 예전: 0.002(같은 날 "안 2: 일반 몹과 같은 식 (추천)", 처음 잡을 때 반드시 주던 것과 판마다 처음 이길 때만(fresh) 2%는 없앴다).
      -- 보스 자리에는 구역 보너스가 없어 drop_mul은 1이다. 처음 잡을 때 금화 × 5, BP, firstBoss·firstMini·firstKill, 나오는 무기, 가진 수 5에서 멈춤은 그대로다.
      -- 0.15는 설정 표 drop_boss(2026-11-23 사용자 "옮겨").
      if random() < t_drop_boss * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
        if is_boss then
          select w.id into dropped from public.adventure_weapons as w where w.zone = z.id and w.boss order by w.id limit 1;
        else
          dropped := m.weapon;
        end if;
      end if;
    elsif random() < t_drop_normal * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
      -- 0.08은 설정 표 drop_normal(2026-11-23 사용자 "옮겨").
      -- 보통 몬스터 무기 기본값 8%(2026-11-23 사용자 "일반 몬스터 무기 드랍 비율을 지금의 10배로 올린다." 뒤 "일반 몬스터 무기 드롭률 8%로 올리자.", 예전 0.2%).
      -- LUC 몫, 구역 drop_mul(일곱 빛 드롭 방 × 2·× 3), 장착 무기 드랍 효과는 그대로 곱한다(가장 높으면 약 0.08 × 2 × 3 × 1.75 ≈ 84%, 1을 넘지 않음).
      -- 장착 무기 드랍 +25~75%는 보통 몬스터 드랍과 보스·중간 보스 무기에 똑같이 붙는다(2026-11-21부터, 위 식)
      -- 별 비율(★1 40, ★2 30, ★3 18, ★4 9, ★5 3) × 0.55^가진 수. 다 모은(+4) 무기와 지역 보스 무기는 빠진다(중간 보스 무기는 들어감).
      roll := random();
      with pool as (
        select w.id, (case w.star when 1 then 40 when 2 then 30 when 3 then 18 when 4 then 9 else 3 end)
          * power(0.55::double precision, coalesce(c.copies, 0)) as weight
        from public.adventure_weapons as w
        left join public.adventure_collection as c on c.weapon = w.id and c.player = me.id
        where w.zone = z.id and not w.boss and coalesce(c.copies, 0) < 5
      ), ranges as (
        select pool.id, sum(pool.weight) over (order by pool.id) as upto, sum(pool.weight) over () as total from pool
      )
      select ranges.id into dropped from ranges where ranges.upto > roll * ranges.total order by ranges.upto limit 1;
    end if;
    -- 수문장(평원 1, 2026-11-19 사용자 "통로에 길을 막고 있는 화산폭풍의 일반몹 수문장"): 이기면 이번 판에 그 맵의 높은 지역 포탈이 열린다('gate:맵'). BP는 없다.
    if s.kind = 'gate' and not (('gate:' || s.map) = any (a.run_bosses)) then
      a.run_bosses := a.run_bosses || ('gate:' || s.map);
    end if;
    -- 보스 BP는 한 판에 보스마다 한 번(위에서 이긴 보스와는 싸우지 않으므로 fresh는 늘 참이다)
    if fresh then
      a.run_bosses := a.run_bosses || boss_key;
      a.bp := a.bp + bp_gain;
    else
      bp_gain := 0;
    end if;
    if dropped is not null then
      insert into public.adventure_collection (player, weapon) values (me.id, dropped)
        on conflict (player, weapon) do update set copies = public.adventure_collection.copies + 1
        where public.adventure_collection.copies < 5;
      if found then
        a.run_drops := a.run_drops || to_jsonb(dropped);
        select c.copies into drop_copies from public.adventure_collection as c where c.player = me.id and c.weapon = dropped;
      else
        dropped := null;
      end if;
    end if;
  else
    a.bp := greatest(0, a.bp - 3);
    a.run_losses := a.run_losses + 1;
  end if;

  update public.adventure_players as q set
    bp = a.bp, run_level = a.run_level, run_exp = a.run_exp, run_points = a.run_points,
    run_hp = a.run_hp, run_atk = a.run_atk, run_def = a.run_def, run_agi = a.run_agi,
    run_gold = a.run_gold, run_wins = a.run_wins, run_losses = a.run_losses, run_drops = a.run_drops,
    run_bosses = a.run_bosses, last_battle_at = now(),
    -- 최고 레벨: 판 레벨이 지금까지보다 오르면 함께 올린다(같은 레벨이면 먼저 닿은 때를 남김).
    best_level = greatest(q.best_level, a.run_level),
    best_at = case when a.run_level > q.best_level then now() else q.best_at end
    where q.player = me.id;

  if a.bp = 0 then
    -- 판 끝. 결과는 last_result에 남고, 화면은 연출 뒤 adventure_state로 한 번 받는다(새로고침해도 남음).
    settled := public.adventure_settle(me.id, 'bp');
  end if;

  return jsonb_build_object(
    'win', won,
    'turns', turns,
    'me', jsonb_build_object('hp', p_hp, 'atk', p_atk, 'def', p_def, 'agi', p_agi, 'luc', p_luc),
    'mon', jsonb_build_object(
      'map', s.map, 'zone', z.id, 'x', s.x, 'y', s.y, 'kind', s.kind, 'art', s.art, 'mini', s.mini, 'bonus', s.bonus,
      'level', lv, 'boss', is_boss or is_mini, 'hp', m_hp, 'atk', m_atk
    ),
    'exp', gain::text,
    'level', a.run_level::text,
    'points', got_points::text,
    'gold', gold_gain::text,
    'drop', dropped,
    'dropCopies', drop_copies,
    'firstBoss', is_boss and first_kill,
    'firstMini', is_mini and first_kill,
    'firstKill', first_kill,
    'bpGain', bp_gain,
    'ended', settled is not null,
    'state', public.adventure_view(me.id)
  );
end;
$$;

-- send_chat: 20261112020000_global_chat.sql 본문 + 단 칭호 이름과 갑부를 붙임.
create or replace function public.send_chat(message text, everyone boolean default false) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  author text;
  place text;
  body text := btrim(message);
  worn text;
  rich boolean;
begin
  if body = '' or char_length(body) > 100 then
    raise exception 'invalid message';
  end if;

  -- 단 칭호 이름과 갑부는 서버가 붙인다(남이 꾸밀 수 없게, 2026-11-28). 정각이 지났으면 순위를 먼저 다시 정한다.
  perform public.refresh_rank_titles();
  select p.nickname, p.map, t.name into strict author, place, worn
    from public.profiles as p left join public.titles as t on t.id = p.title where p.id = auth.uid();
  rich := exists (select 1 from public.title_holders as h join public.titles as x on x.id = h.title where h.player = auth.uid() and x.kind = 'rich');

  perform realtime.send(
    jsonb_build_object('id', auth.uid(), 'author', author, 'text', body, 'title', worn, 'rich', rich),
    'chat',
    case when everyone then 'world-chat' else 'chat:' || place end,
    true
  );
end;
$$;

-- ───────── 5. 순위 읽기에서 랭킹 제외 계정을 뺀다 ─────────

-- 미니맵 밑 레벨 TOP 10: 20261108020000_fixed_exp.sql 본문 + 랭킹 제외.
create or replace function public.top_players(how_many integer) returns table (nickname text, level text)
language sql stable security definer set search_path = ''
as $$
  select p.nickname, p.level::text
  from public.profiles as p
  where not p.rank_excluded
  order by p.level desc, p.exp desc, p.created_at
  limit least(greatest(how_many, 1), 100);
$$;

-- Tab 킬/데스 순위: 20261111040000_notices.sql 본문 + 랭킹 제외.
create or replace function public.top_killers(how_many integer) returns table (nickname text, kills integer, deaths integer)
language sql stable security definer set search_path = ''
as $$
  select p.nickname, p.kills, p.deaths
  from public.profiles as p
  where not p.rank_excluded
  order by p.kills desc, p.deaths, p.created_at
  limit least(greatest(how_many, 1), 50);
$$;

-- 모험 들어가기 탭 최고 레벨 순위: 20261117000000_adventure.sql 본문 + 랭킹 제외.
create or replace function public.adventure_ranking() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ranked as (
    select a.player, p.nickname, a.best_level,
      row_number() over (order by a.best_level desc, a.best_at asc nulls last, a.player) as n
    from public.adventure_players as a join public.profiles as p on p.id = a.player
    where a.best_level > 0 and not p.rank_excluded
  )
  select jsonb_build_object(
    'top', (
      select coalesce(jsonb_agg(jsonb_build_object('rank', r.n, 'name', r.nickname, 'level', r.best_level::text, 'me', r.player = auth.uid()) order by r.n), '[]')
      from ranked as r where r.n <= 10
    ),
    'me', (select jsonb_build_object('rank', r.n, 'name', r.nickname, 'level', r.best_level::text) from ranked as r where r.player = auth.uid()),
    'name', (select p.nickname from public.profiles as p where p.id = auth.uid())
  );
$$;

-- ───────── 6. 권한 ─────────
-- 안에서만 쓰는 함수는 아무도 직접 부르지 못한다(security definer 함수가 부름).
revoke execute on function public.rank_order(text) from public, anon, authenticated;
revoke execute on function public.worn_title_fx(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_rank_titles() from public, anon, authenticated;
revoke execute on function public.ranking(text, integer) from public, anon;
grant execute on function public.ranking(text, integer) to authenticated;
revoke execute on function public.my_titles() from public, anon;
grant execute on function public.my_titles() to authenticated;
revoke execute on function public.set_title(text) from public, anon;
grant execute on function public.set_title(text) to authenticated;
-- 고친 함수는 예전 권한 그대로(create or replace는 권한을 남기지만 같은 줄을 다시 적어 둔다).
revoke execute on function public.forge_gear(bigint, boolean, boolean, boolean) from public, anon;
grant execute on function public.forge_gear(bigint, boolean, boolean, boolean) to authenticated;
revoke execute on function public.hit_player(uuid, text, bigint, bigint, integer) from public, anon;
grant execute on function public.hit_player(uuid, text, bigint, bigint, integer) to authenticated;
revoke execute on function public.adventure_power(uuid) from public, anon, authenticated;
revoke execute on function public.adventure_battle(text, integer, integer) from public, anon;
grant execute on function public.adventure_battle(text, integer, integer) to authenticated;
revoke execute on function public.send_chat(text, boolean) from public, anon;
grant execute on function public.send_chat(text, boolean) to authenticated;
revoke execute on function public.top_players(integer) from public, anon;
grant execute on function public.top_players(integer) to authenticated;
revoke execute on function public.top_killers(integer) from public, anon;
grant execute on function public.top_killers(integer) to authenticated;
revoke execute on function public.adventure_ranking() from public, anon;
grant execute on function public.adventure_ranking() to authenticated;

-- ───────── 7. 지난 값 채우기(두 번 실행해도 한 번만 듦) ─────────
-- 최고 강화 기록 = 지금 가진 무기 가운데 가장 높은 단계, 닿은 때 = 실행 시각(채운 기록끼리는 가입 순이 됨).
-- 팔았거나 부서진 무기는 기록이 없어 채우지 못한다. 기록은 올리기만 한다.
update public.profiles as p
set best_forge = g.top, best_forge_at = now()
from (select x.player, max(x.level) as top from public.gear as x group by x.player) as g
where g.player = p.id and g.top > p.best_forge;

-- 최고 기록까지의 강화 칭호(+20, +30, +35 …)를 준다. 알림은 보내지 않는다.
insert into public.player_titles (player, title)
select p.id, t.id from public.profiles as p join public.titles as t on t.kind = 'forge' and t.forge_level <= p.best_forge
on conflict do nothing;

-- 시험용 계정 하나(마을 레벨 1, STR 999,999, 사용자 결정 5)를 랭킹에서 뺀다. 그 조건에 맞는 계정이 꼭 하나일 때만 켠다.
update public.profiles
set rank_excluded = true
where level = 1 and str = 999999
  and (select count(*) from public.profiles where level = 1 and str = 999999) = 1;

-- 서버 첫 달성: 지금 가진 무기의 +30 ~ 가장 높은 단계를 그 무기 주인으로 채운다(알림 없음). 한 단계를 여럿이 가졌으면 먼저 산 무기(gear id가 작은 것).
-- 랭킹 제외 계정의 무기는 세지 않는다.
insert into public.forge_firsts (level, player, at)
select distinct on (s.lv) s.lv, g.player, now()
from public.gear as g
join public.profiles as p on p.id = g.player and not p.rank_excluded
cross join lateral generate_series(30, g.level) as s(lv)
where g.level >= 30
order by s.lv, g.id
on conflict (level) do nothing;

-- 지금 순위로 랭킹 칭호를 한 번 정한다(다음 정각에 다시 셈).
select public.refresh_rank_titles();

notify pgrst, 'reload schema';

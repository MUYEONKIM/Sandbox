-- 새 컨텐츠 '모험'(2026-11-17 사용자가 정함, 기획 docs/balance/dungeon-rework.md 19장. 2026-11-18 모험 손보기, 지역 여덟, 맵 위 몬스터를 더함).
-- 혼자 싸우는 자동 전투. 몬스터는 맵의 정해진 자리(adventure_spots, 몬스터마다 한 줄)에 떠 있고 잡아도 사라지지 않는다. 부딪히면 싸운다(걷다가 마주치지 않음).
-- 판 하나에 BP 20, 이기면 −1, 지면 −3, 지역 보스를 잡으면 +5, 중간 보스 +2(한 판에 보스마다 한 번). 걷기는 BP를 쓰지 않는다.
-- 판마다 레벨 1부터이고 BP가 0이 되거나 귀환하면 판이 끝나 이긴 수 × 5,400 마을 경험치와 판 금화의 50%를 마을로 가져간다.
-- 하루 제한은 없다. 판이 끝나면 바로 새 판을 연다.
-- 맵은 입구 맵 adv_gate와 지역 맵들이 포탈로 이어진다. 맵 → 지역은 adventure_maps(지역 하나가 맵 여럿일 수 있음, 2026-11-18 기획 19장 '맵 나누기').
-- 같은 지역 안은 앞뒤로, 다음 지역은 보스를 잡은 뒤 앞으로만 간다(adventure_move가 확인한다). 몬스터 레벨은 몬스터 줄에 있다(띠 없음).
--
-- 숫자와 식은 docs/balance/tools/dungeon-run.js 위쪽 값과 같다. 바꾸면 그 파일과 화면의 src/game/adventureRules.ts를 같이 고친다.
-- - 전투(adventure_battle): fightOnce. 피해, 콤보·크리티컬 상한, 20차례, 장신구(연타·날카로운·흡혈·버팀)가 같다. 난수 순서는 다르다.
-- - 몬스터: monster(L, d) = 체력 d × (30 + 10L), 공격 d × (5 + 1.5L). 경험치 expOf = 40 × (L + 3)², 보스·중간 보스 3배, expFalloff, levelFromExp.
-- - 판 금화: 166 × (L ÷ 20,000)^0.08 × lucGold, 보스·중간 보스는 처음 잡을 때만 5배. 드랍: 2% × (1 + LUC ÷ (LUC + 4L)). 스텟(adventure_power): START, PER_POINT, 마을 스텟 × 100, 베이스 레벨.
-- 기존 던전(dungeons, monsters, kill_monster, monster_hit, dungeon_roster)은 그대로 둔다.
-- 새 표는 adventure_ 앞머리를 쓰고 클라이언트는 표를 직접 읽거나 쓰지 못한다(행 보안만 켜고 정책 없음). 함수로만 다룬다.
-- 바꾸는 기존 것 둘(모험 맵 아홉 장에서 공격과 블록을 서버도 막는다. 맵 id가 adv_로 시작하면 모험 맵이다):
-- - hit_player의 공격 금지 맵에 모험 맵을 더한다. 본문은 20261116010000_interior_rooms.sql 그대로다.
-- - 블록 놓기 정책 "players place blocks"를 20261116040000_farm_gate.sql 그대로 두고 모험 맵이 아니라는 조건만 더해 다시 만든다.
-- 컬렉션 무기 216종(디자인 세션 공유 노트 adventure-weapons.md, art-source/adventure/sprites/adv-weapons.json, 지역마다 27종)도 넣는다.
-- 이름은 임시다. art(그림 칸 번호)는 public/sprites/adventure/adv-weapons.png 그대로라 무기 id마다 예전 값을 둔다.
-- 다시 실행해도 된다(create table if not exists 뒤 alter로 바뀐 열을 맞춤, 행은 on conflict로 값만 다시 씀, create or replace).
-- 표를 지우는 줄은 없다. 예전 지역 두 줄(meadow, inferno)은 adv_1, adv_2로 옮긴 뒤 지운다(처음 실행이면 지울 것이 없다).
--
-- 실행 전 확인: 아래 두 select만 먼저 따로 실행한다. 처음 실행이면 둘 다 0줄이다(모험 표가 아직 없고, 모험 맵에 선 사람이 없음).
--    select table_name from information_schema.tables where table_schema = 'public' and table_name like 'adventure\_%';
--    select nickname, map from public.profiles where left(map, 4) = 'adv_';
-- 실행 뒤 확인: 아래 select가 11, 8, 13, 39, 216, 11, 59, 17, true, true를 돌려주면 다 들어갔다.
-- 차례대로 표 11, 지역 8, 맵 13(입구 + 지역 맵 열둘), 장신구 39(보석 다섯 × 6단계 + 그 밖의 9), 무기 216, 중간 보스 11, 몬스터 59(일반 39 + 중간 보스 11 + 보스 9),
-- 함수 17(화면이 부르는 13과 안에서만 쓰는 4), 공격 금지, 블록 금지다.
--    select (select count(*) from information_schema.tables where table_schema = 'public' and table_name like 'adventure\_%') as tables,
--      (select count(*) from public.adventure_zones) as zones, (select count(*) from public.adventure_maps) as maps, (select count(*) from public.adventure_items) as items,
--      (select count(*) from public.adventure_weapons) as weapons, (select count(*) from public.adventure_minis) as minis,
--      (select count(*) from public.adventure_spots) as spots,
--      (select count(*) from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'adventure\_%') as functions,
--      (select position('left(attacker.map, 4)' in pg_get_functiondef('public.hit_player(uuid, text, bigint, bigint, integer)'::regprocedure)) > 0) as no_pvp,
--      (select position('adv_' in pg_get_expr(p.polwithcheck, p.polrelid)) > 0 from pg_policy as p
--        where p.polrelid = 'public.blocks'::regclass and p.polname = 'players place blocks') as no_blocks;

-- ───────── 1. 표 ─────────

-- 지역. 세기와 보스 세기, 보스 레벨은 지역 것이다. 몬스터 레벨은 몬스터 줄(adventure_spots)에 있다(2026-11-18 띠 없앰). 표 값이라 재배포 없이 바꾼다.
create table if not exists public.adventure_zones (
  id text primary key,
  name text not null,
  sort integer not null unique,
  map text not null unique,
  strength numeric not null check (strength > 0),
  boss_level numeric not null check (boss_level >= 1),
  boss_strength numeric not null check (boss_strength > 0),
  -- 이 지역의 보스를 처음 잡아야 열린다(null이면 처음부터).
  unlock_after text references public.adventure_zones (id)
);
-- 로컬에 잠깐 있던 열(띠마다 싸우는 수, 화면이 보내는 보너스 목록)을 지운다. 처음 실행이면 아무 일도 하지 않는다.
alter table public.adventure_zones drop column if exists fights, drop column if exists bonuses, drop column if exists bands;

-- 맵 → 지역(2026-11-18 기획 19장 '맵 나누기'). idx는 지역 안 차례(1이 첫 맵, 지역의 map 열과 같은 맵). 입구 맵은 zone 없음, idx 0.
create table if not exists public.adventure_maps (
  map text primary key,
  zone text references public.adventure_zones (id),
  idx integer not null check (idx >= 0)
);

-- 사람마다 한 줄. run_*는 판마다 처음부터인 값이다(판이 없으면 레벨 1, 0). bp는 보스를 잡으면 20을 넘을 수 있다.
-- run_map은 이 판이 지금 있는 맵(이어 하기 자리), run_bosses는 이 판에서 BP를 받은 보스('adv_1', 중간 보스는 'adv_2#3').
create table if not exists public.adventure_players (
  player uuid primary key references public.profiles (id) on delete cascade,
  bp integer not null default 20 check (bp >= 0),
  in_run boolean not null default false,
  run_map text,
  run_bosses text[] not null default '{}',
  run_level numeric not null default 1 check (run_level >= 1),
  run_exp numeric not null default 0 check (run_exp >= 0),
  run_points numeric not null default 0 check (run_points >= 0),
  run_hp numeric not null default 0 check (run_hp >= 0),
  run_atk numeric not null default 0 check (run_atk >= 0),
  run_def numeric not null default 0 check (run_def >= 0),
  run_agi numeric not null default 0 check (run_agi >= 0),
  run_luc numeric not null default 0 check (run_luc >= 0),
  run_gold numeric not null default 0 check (run_gold >= 0),
  run_wins integer not null default 0,
  run_losses integer not null default 0,
  run_drops jsonb not null default '[]',
  -- 끝난 판의 결과. 아직 결과 화면을 안 봤으면 여기 남는다.
  last_result jsonb,
  slots integer not null default 2 check (slots between 2 and 8),
  auto_split boolean not null default false,
  main_weapon text,
  last_battle_at timestamptz not null default '2000-01-01'
);
-- 2026-11-17 첫 모양(하루 BP 10, 0시에 판 끝)을 쓰던 표를 지금 모양으로 바꾼다. 처음 실행이면 아무 일도 하지 않는다.
alter table public.adventure_players
  drop column if exists bp_day,
  drop column if exists run_day,
  add column if not exists run_map text,
  add column if not exists run_bosses text[] not null default '{}';
alter table public.adventure_players drop constraint if exists adventure_players_bp_check;
alter table public.adventure_players add constraint adventure_players_bp_check check (bp >= 0);
alter table public.adventure_players alter column bp set default 20;
update public.adventure_players set run_map = 'adv_gate' where in_run and run_map is null;
-- 맵 열세 장(2026-11-18 밤): 예전 맵 id(adv_1, adv_2, adv_6)에 남은 판은 그 지역 첫 맵으로 옮긴다(처음 실행이면 아무 일도 하지 않음).
update public.adventure_players set run_map = run_map || 'a' where run_map in ('adv_1', 'adv_2', 'adv_6');
-- 레벨이 오르면 스텟 창이 뜨게 '저절로 나누기'는 처음에 끈다(2026-11-18 기획 19장 4번). 이미 있는 줄은 고른 값을 그대로 둔다.
alter table public.adventure_players alter column auto_split set default false;
-- 최고 레벨 순위(2026-11-18 밤 사용자 "처음 던전 포탈 위에 서면 들어가기 탭에서 아래에 맵이 나오는게 아니라, 유저들의 최고 레벨 랭킹을 띄우도록 한다",
-- 기획 19장 '가져가는 경험치 줄이기, 최고 레벨 랭킹'). best_level은 지금까지 판에서 오른 가장 높은 판 레벨, best_at은 그 레벨에 처음 닿은 때
-- (같은 레벨이면 먼저 닿은 사람이 위). 지우지 않고 쌓는다. adventure_battle이 이겨 판 레벨이 오를 때 함께 올린다.
alter table public.adventure_players
  add column if not exists best_level numeric not null default 0,
  add column if not exists best_at timestamptz;
create index if not exists adventure_players_best_idx on public.adventure_players (best_level desc, best_at asc) where best_level > 0;
-- 처음 넣을 때 판 중인 사람은 지금 판 레벨로 채운다(다시 실행해도 더 높을 때만).
update public.adventure_players set best_level = run_level, best_at = now() where in_run and run_level > best_level;

-- 컬렉션 무기 정의. art는 게임 그림 public/sprites/adventure/adv-weapons.png의 칸 번호(18열, 32×32)다.
-- zone은 지역 id(adv_1~adv_8)다. 지역보다 무기 행을 먼저 바꿀 수 있게 adventure_zones를 가리키지 않는다.
create table if not exists public.adventure_weapons (
  id text primary key,
  name text not null,
  art text not null,
  star integer not null check (star between 1 and 5),
  stat text not null check (stat in ('hp', 'atk', 'def', 'agi', 'luc')),
  zone text not null,
  boss boolean not null default false
);
alter table public.adventure_weapons drop constraint if exists adventure_weapons_zone_fkey;
-- 장착 효과(2026-11-18 사용자 "컬렉션 무기를 장착할 수 있어야 한다. 효과도 다 있으면 좋다", 기획 19장 '컬렉션 무기 장착').
-- equip_pct: 그 무기 스텟에 더하는 몫(단계 +0일 때, 단계마다 × (1 + 0.25 × 단계)). equip_fx: ★4 이상 특수 효과 하나와 값.
-- 값을 배포 없이 SQL로 고칠 수 있게 열로 둔다(에이전트가 정함). 처음 값은 아래 무기 행 뒤의 update가 식으로 채운다.
alter table public.adventure_weapons add column if not exists equip_pct numeric not null default 0;
alter table public.adventure_weapons add column if not exists equip_fx text;
alter table public.adventure_weapons add column if not exists equip_fx_value numeric not null default 0;
alter table public.adventure_weapons drop constraint if exists adventure_weapons_equip_fx_check;
alter table public.adventure_weapons add constraint adventure_weapons_equip_fx_check
  check (equip_fx is null or equip_fx in ('crit', 'combo', 'leech', 'guard', 'drop'));

-- 사람마다 가진 컬렉션 무기. copies 1이 처음 얻은 것이고 5(+4)까지 오른다.
create table if not exists public.adventure_collection (
  player uuid not null references public.profiles (id) on delete cascade,
  weapon text not null references public.adventure_weapons (id),
  copies integer not null default 1 check (copies between 1 and 5),
  first_at timestamptz not null default now(),
  primary key (player, weapon)
);

-- 사람마다 처음 잡은 지역 보스와 잡은 수. 처음 잡은 보스 수가 상점 단계와 장신구 칸을 연다.
create table if not exists public.adventure_bosses (
  player uuid not null references public.profiles (id) on delete cascade,
  zone text not null references public.adventure_zones (id),
  first_at timestamptz not null default now(),
  kills integer not null default 1,
  primary key (player, zone)
);

-- 중간 보스(기획 11장). 지역 맵의 곁길 방에 있고 다음 지역을 열지 않는다. idx는 지역 안 번호(1부터, 맵 자료 adv-maps.json의 mids 순서).
-- 세기는 지역 세기 × 3. gold는 판 금화 배수(평원 금화 방 2). weapon은 처음 잡으면 반드시 주는 ★4 무기다.
create table if not exists public.adventure_minis (
  zone text not null references public.adventure_zones (id),
  idx integer not null,
  name text not null,
  level numeric not null check (level >= 1),
  strength numeric not null check (strength > 0),
  gold numeric not null default 1 check (gold > 0),
  weapon text references public.adventure_weapons (id),
  primary key (zone, idx)
);

-- 맵 위 몬스터 자리(기획 11장 '맵 위 몬스터'). 디자인 세션 자리 후보(monster-spots.json)와 맵 자료(adv-maps.json)의 중간 보스·보스 칸이다.
-- 몬스터 표(2026-11-18 기획 19장 '몬스터 한 마리씩'): 몬스터마다 한 줄, 맵과 칸, 역할, 그림, 레벨.
-- kind 'normal'은 지역 세기, 'mini'는 adventure_minis(zone, mini)의 세기, 'boss'는 지역 보스 세기. bonus는 그 몬스터 전투에 붙는 구역 보너스
-- (일곱 빛 들판: exp3, drop3, exp15, exp2, drop2, foeHp, foeAtk / 지옥 경험치 방: exp3). 화면은 같은 자료를 읽어 몬스터를 띄운다.
create table if not exists public.adventure_spots (
  map text not null references public.adventure_maps (map),
  zone text not null references public.adventure_zones (id),
  x integer not null,
  y integer not null,
  kind text not null check (kind in ('normal', 'mini', 'boss')),
  art text,
  level numeric not null check (level >= 1),
  mini integer,
  bonus text check (bonus in ('exp3', 'drop3', 'exp15', 'exp2', 'drop2', 'foeHp', 'foeAtk')),
  primary key (map, x, y)
);

-- 사람마다 잡은 중간 보스와 잡은 수.
create table if not exists public.adventure_mini_kills (
  player uuid not null references public.profiles (id) on delete cascade,
  zone text not null,
  idx integer not null,
  first_at timestamptz not null default now(),
  kills integer not null default 1,
  primary key (player, zone, idx),
  foreign key (zone, idx) references public.adventure_minis (zone, idx) on delete cascade
);
alter table public.adventure_spots drop constraint if exists adventure_spots_mini_fkey;
alter table public.adventure_spots add constraint adventure_spots_mini_fkey foreign key (zone, mini) references public.adventure_minis (zone, idx);

-- 상점 장신구. 보석(kind 'gem')은 stat에 +value(비율)이고 여러 개 낀다(stack). 나머지는 한 종류에 하나만 낀다.
-- combo: value 콤보 +%p, value2 콤보 상한. sharp: 크리티컬 피해 배수. leech: 때린 피해의 몫만큼 회복. endure: value 확률, value2 남기는 체력 비율.
-- learn: 경험치 +비율. pouch: 판 금화 +비율. opens: 처음 잡은 보스가 몇 마리여야 상점에 나오는지.
create table if not exists public.adventure_items (
  id text primary key,
  kind text not null check (kind in ('gem', 'learn', 'pouch', 'combo', 'sharp', 'leech', 'endure')),
  stat text check (stat in ('hp', 'atk', 'def', 'agi', 'luc')),
  tier integer not null,
  name text not null,
  value numeric not null,
  value2 numeric,
  price numeric not null check (price > 0),
  opens integer not null default 0,
  stack boolean not null default false,
  sort integer not null
);

-- 사람마다 가진 장신구. slot이 있으면 낀 것이다. paid는 산 값(되팔면 절반).
create table if not exists public.adventure_owned (
  id bigint generated always as identity primary key,
  player uuid not null references public.profiles (id) on delete cascade,
  item text not null references public.adventure_items (id),
  paid numeric not null check (paid >= 0),
  slot integer check (slot between 1 and 8),
  bought_at timestamptz not null default now()
);
create index if not exists adventure_owned_player on public.adventure_owned (player);
create unique index if not exists adventure_owned_slot on public.adventure_owned (player, slot) where slot is not null;

alter table public.adventure_zones enable row level security;
alter table public.adventure_players enable row level security;
alter table public.adventure_weapons enable row level security;
alter table public.adventure_collection enable row level security;
alter table public.adventure_bosses enable row level security;
alter table public.adventure_minis enable row level security;
alter table public.adventure_spots enable row level security;
alter table public.adventure_maps enable row level security;
alter table public.adventure_mini_kills enable row level security;
alter table public.adventure_items enable row level security;
alter table public.adventure_owned enable row level security;
revoke all on table public.adventure_zones, public.adventure_players, public.adventure_weapons, public.adventure_collection,
  public.adventure_bosses, public.adventure_minis, public.adventure_spots, public.adventure_mini_kills, public.adventure_items, public.adventure_owned,
  public.adventure_maps
  from anon, authenticated;

-- ───────── 2. 처음 넣는 행 ─────────

-- 기획 11장 '지역 여덟과 맵'. 칸 레벨과 보스 레벨은 원작 구역 값, 세기와 보스 세기는 계산기(dungeon-run.js REGIONS) 값이다(2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로": 2.4, 17.8, 32.5, 58.1, 75.3, 82.1, 79.9, 130.8).
-- 예전 두 줄(meadow 평원, inferno 지옥)의 sort를 먼저 비켜 두고 새 줄을 넣은 뒤, 보스 기록을 새 id로 옮기고 지운다.
update public.adventure_zones set sort = sort + 1000 where id in ('meadow', 'inferno') and sort < 1000;
insert into public.adventure_zones (id, name, sort, map, strength, boss_level, boss_strength, unlock_after) values
  ('adv_1', '평원', 1, 'adv_1a', 1, 5200, 2.4, null),
  ('adv_2', '지옥', 2, 'adv_2a', 2, 20000, 17.8, 'adv_1'),
  ('adv_3', '얽힌 숲', 3, 'adv_3', 3, 27200, 32.5, 'adv_2'),
  ('adv_4', '벼랑길', 4, 'adv_4', 4.5, 36000, 58.1, 'adv_3'),
  ('adv_5', '일곱 빛 들판', 5, 'adv_5', 5, 40000, 75.3, 'adv_4'),
  ('adv_6', '구름 정원', 6, 'adv_6a', 6.5, 93333, 82.1, 'adv_5'),
  ('adv_7', '별 하늘', 7, 'adv_7', 9, 250000, 79.9, 'adv_6'),
  ('adv_8', '그늘 동굴', 8, 'adv_8', 12, 450000, 130.8, 'adv_7')
on conflict (id) do update set
  name = excluded.name, sort = excluded.sort, map = excluded.map, strength = excluded.strength,
  boss_level = excluded.boss_level, boss_strength = excluded.boss_strength, unlock_after = excluded.unlock_after;
insert into public.adventure_bosses (player, zone, first_at, kills)
select b.player, case b.zone when 'meadow' then 'adv_1' else 'adv_2' end, b.first_at, b.kills
from public.adventure_bosses as b where b.zone in ('meadow', 'inferno')
on conflict (player, zone) do nothing;
delete from public.adventure_bosses as b where b.zone in ('meadow', 'inferno');
delete from public.adventure_zones as z where z.id in ('meadow', 'inferno');

-- 맵 → 지역(공유 노트 code-adventure-tools/monster-rows.cjs가 게임 맵 자료에서 만든다). 맵이 바뀌면 몬스터 행과 함께 통째로 다시 넣는다.
delete from public.adventure_spots;
delete from public.adventure_maps;
insert into public.adventure_maps (map, zone, idx) values
  ('adv_gate', null, 0),
  ('adv_1a', 'adv_1', 1),
  ('adv_1b', 'adv_1', 2),
  ('adv_1c', 'adv_1', 3),
  ('adv_2a', 'adv_2', 1),
  ('adv_2b', 'adv_2', 2),
  ('adv_3', 'adv_3', 1),
  ('adv_4', 'adv_4', 1),
  ('adv_5', 'adv_5', 1),
  ('adv_6a', 'adv_6', 1),
  ('adv_6b', 'adv_6', 2),
  ('adv_7', 'adv_7', 1),
  ('adv_8', 'adv_8', 1);

-- 기획 9장. 보석 다섯 × 단계 1~6, 그 밖의 장신구 여섯 종류(아홉 줄).
-- 단계 3은 첫째 보스(평원), 4는 둘째(지옥), 5는 넷째(벼랑길), 6은 여섯째(구름 정원)를 처음 잡으면 열린다.
insert into public.adventure_items (id, kind, stat, tier, name, value, value2, price, opens, stack, sort)
select 'gem_' || s.stat || '_' || t.tier, 'gem', s.stat, t.tier, s.name, t.pct, null, t.price, t.opens, true, s.sort * 10 + t.tier
from (values ('hp', '체력의 보석', 1), ('atk', '힘의 보석', 2), ('def', '수호의 보석', 3), ('agi', '바람의 보석', 4), ('luc', '행운의 보석', 5))
  as s (stat, name, sort)
cross join (values (1, 0.15, 30000, 0), (2, 0.3, 200000, 0), (3, 0.5, 1500000, 1), (4, 0.75, 12000000, 2), (5, 1.0, 100000000, 4), (6, 1.5, 800000000, 6))
  as t (tier, pct, price, opens)
on conflict (id) do update set
  kind = excluded.kind, stat = excluded.stat, tier = excluded.tier, name = excluded.name, value = excluded.value,
  value2 = excluded.value2, price = excluded.price, opens = excluded.opens, stack = excluded.stack, sort = excluded.sort;

insert into public.adventure_items (id, kind, stat, tier, name, value, value2, price, opens, stack, sort) values
  ('learn_2', 'learn', null, 2, '배움의 보석', 0.5, null, 200000, 0, false, 102),
  ('pouch_2', 'pouch', null, 2, '금화 주머니', 0.2, null, 200000, 0, false, 112),
  ('combo_3', 'combo', null, 3, '연타 반지', 0.1, 0.6, 1500000, 1, false, 123),
  ('combo_4', 'combo', null, 4, '연타 반지', 0.1, 0.65, 12000000, 2, false, 124),
  ('sharp_3', 'sharp', null, 3, '날카로운 반지', 2.5, null, 1500000, 1, false, 133),
  ('sharp_4', 'sharp', null, 4, '날카로운 반지', 3, null, 12000000, 2, false, 134),
  ('leech_3', 'leech', null, 3, '흡혈 목걸이', 0.1, null, 1500000, 1, false, 143),
  ('leech_4', 'leech', null, 4, '흡혈 목걸이', 0.15, null, 12000000, 2, false, 144),
  ('endure_4', 'endure', null, 4, '버팀 목걸이', 1, 0, 12000000, 2, false, 154)
on conflict (id) do update set
  kind = excluded.kind, stat = excluded.stat, tier = excluded.tier, name = excluded.name, value = excluded.value,
  value2 = excluded.value2, price = excluded.price, opens = excluded.opens, stack = excluded.stack, sort = excluded.sort;

-- 컬렉션 무기 216종(디자인 세션 adv-weapons.json 순서, 지역마다 27종). 이름은 임시다(같은 이름에 II, III).
insert into public.adventure_weapons (id, name, art, star, stat, zone, boss) values
  ('1-19', '두꺼운 남빛 대검', '63', 1, 'atk', 'adv_1', false),
  ('2-10', '은빛 잎 장검', '2', 1, 'hp', 'adv_1', false),
  ('2-24', '갈색 장검', '3', 1, 'def', 'adv_1', false),
  ('2-28', '은빛 톱날 전기톱', '69', 1, 'atk', 'adv_1', false),
  ('3-10', '은빛 장검', '5', 1, 'def', 'adv_1', false),
  ('3-30', '은백 잎 장검', '7', 1, 'hp', 'adv_1', false),
  ('4-23', '갈색 장검 II', '10', 1, 'def', 'adv_1', false),
  ('4-25', '은빛 장검 II', '11', 1, 'def', 'adv_1', false),
  ('5-23', '장검', '16', 1, 'hp', 'adv_1', false),
  ('6-16', '검은 장검', '20', 1, 'def', 'adv_1', false),
  ('7-7', '은빛 장검 III', '21', 1, 'def', 'adv_1', false),
  ('gun-wooden-rifle', '나무 소총', '161', 1, 'hp', 'adv_1', false),
  ('1-12', '은백 깃털 장검', '61', 2, 'def', 'adv_1', false),
  ('3-26', '장검 II', '6', 2, 'hp', 'adv_1', false),
  ('3-28', '은빛 곡도', '73', 2, 'luc', 'adv_1', false),
  ('4-30', '연둣빛 보석 장검', '78', 2, 'def', 'adv_1', false),
  ('5-7', '하늘빛 초승달 세검', '13', 2, 'agi', 'adv_1', false),
  ('6-6', '누런 고리 곡도', '79', 2, 'def', 'adv_1', false),
  ('6-15', '은빛 톱니 장검', '19', 2, 'luc', 'adv_1', false),
  ('7-30', '가는 은빛 세검', '84', 2, 'agi', 'adv_1', false),
  ('gun-compact-pistol', '작은 권총', '154', 2, 'agi', 'adv_1', false),
  ('2-6', '분홍 아이스크림', '27', 3, 'luc', 'adv_1', false),
  ('5-5', '초록 잎 당근', '32', 3, 'luc', 'adv_1', false),
  ('7-6', '붉은 장검', '39', 3, 'luc', 'adv_1', false),
  ('3-5', '주황 고리 바게트', '45', 4, 'luc', 'adv_1', false),
  ('7-28', '레몬', '55', 4, 'luc', 'adv_1', false),
  ('2-17', '금빛 잎 장검', '60', 5, 'luc', 'adv_1', true),
  ('1-14', '주황 세검', '0', 1, 'agi', 'adv_2', false),
  ('4-14', '주황 십자 장검', '9', 1, 'def', 'adv_2', false),
  ('5-25', '가는 붉은 세검', '17', 1, 'agi', 'adv_2', false),
  ('7-8', '붉은 톱니 장검', '22', 1, 'def', 'adv_2', false),
  ('7-11', '넓은 푸른 대검', '83', 1, 'atk', 'adv_2', false),
  ('7-16', '주황 장검', '23', 1, 'def', 'adv_2', false),
  ('1-29', '은빛 고리 곡도', '66', 2, 'def', 'adv_2', false),
  ('3-15', '은빛 날개 장검', '70', 2, 'def', 'adv_2', false),
  ('3-16', '주황 곡도', '71', 2, 'def', 'adv_2', false),
  ('4-6', '붉은 날개 장검', '75', 2, 'def', 'adv_2', false),
  ('4-19', '푸른 보석 장검', '76', 2, 'def', 'adv_2', false),
  ('4-22', '주황 날개 장검', '77', 2, 'luc', 'adv_2', false),
  ('5-10', '검은 십자 장검', '14', 2, 'luc', 'adv_2', false),
  ('7-1', '붉은 활', '38', 2, 'def', 'adv_2', false),
  ('7-12', '은빛 장검 IV', '41', 2, 'hp', 'adv_2', false),
  ('gun-silenced-pistol', '소음 권총', '158', 2, 'agi', 'adv_2', false),
  ('2-11', '넓은 주황 대검', '86', 3, 'atk', 'adv_2', false),
  ('2-30', '넓은 주황 대검 II', '89', 3, 'atk', 'adv_2', false),
  ('3-8', '은빛 구슬 장검', '90', 3, 'atk', 'adv_2', false),
  ('4-10', '가는 주황 세검', '96', 3, 'agi', 'adv_2', false),
  ('5-6', '검은 장검 II', '98', 3, 'atk', 'adv_2', false),
  ('5-18', '가는 붉은 세검 II', '100', 3, 'agi', 'adv_2', false),
  ('2-5', '갈색 용 대검', '114', 4, 'atk', 'adv_2', false),
  ('2-18', '주황 꽃 세검', '115', 4, 'agi', 'adv_2', false),
  ('3-21', '주황 용 대검', '116', 4, 'atk', 'adv_2', false),
  ('3-27', '넓은 검은 대검', '93', 4, 'atk', 'adv_2', false),
  ('7-20', '불꽃 대검', '131', 5, 'atk', 'adv_2', true),
  ('1-18', '초록 대검', '62', 2, 'atk', 'adv_3', false),
  ('1-28', '주황 가시 장검', '1', 2, 'hp', 'adv_3', false),
  ('2-8', '검은 나뭇가지 장검', '67', 2, 'agi', 'adv_3', false),
  ('2-26', '누런 뼈 장검', '4', 2, 'luc', 'adv_3', false),
  ('4-3', '은빛 잎 장검 II', '8', 2, 'hp', 'adv_3', false),
  ('4-27', '은빛 장검 V', '12', 2, 'luc', 'adv_3', false),
  ('5-16', '누런 뼈 곡도', '15', 2, 'luc', 'adv_3', false),
  ('5-29', '올리브빛 장검', '18', 2, 'def', 'adv_3', false),
  ('6-10', '분홍 결정 세검', '80', 2, 'agi', 'adv_3', false),
  ('gun-revolver', '리볼버', '157', 2, 'luc', 'adv_3', false),
  ('1-26', '분홍 꽃 창', '25', 3, 'hp', 'adv_3', false),
  ('2-3', '초록 잎 곡도', '26', 3, 'hp', 'adv_3', false),
  ('2-13', '초록 잎 단검', '28', 3, 'hp', 'adv_3', false),
  ('2-15', '분홍 잎 몽둥이', '29', 3, 'hp', 'adv_3', false),
  ('3-13', '갈색 가시 대검', '30', 3, 'hp', 'adv_3', false),
  ('5-14', '붉은 버섯 세검', '33', 3, 'hp', 'adv_3', false),
  ('6-27', '분홍 꽃 장검', '35', 3, 'hp', 'adv_3', false),
  ('6-28', '초록 잎 장검', '36', 3, 'hp', 'adv_3', false),
  ('6-29', '붉은 잎 장검', '37', 3, 'hp', 'adv_3', false),
  ('7-29', '초록 잎 장검 II', '43', 3, 'hp', 'adv_3', false),
  ('4-17', '갈색 잎 몽둥이', '31', 4, 'hp', 'adv_3', false),
  ('6-2', '숲의 이끼 대검', '49', 4, 'hp', 'adv_3', false),
  ('6-14', '연둣빛 이끼 장검', '50', 4, 'hp', 'adv_3', false),
  ('6-24', '연둣빛 장검', '51', 4, 'hp', 'adv_3', false),
  ('7-15', '초록 잎 장검 III', '53', 4, 'hp', 'adv_3', false),
  ('4-28', '초록 깃털 장검', '58', 5, 'hp', 'adv_3', false),
  ('6-26', '주황 별 장검', '59', 5, 'hp', 'adv_3', true),
  ('1-22', '은빛 고리 대검', '64', 2, 'atk', 'adv_4', false),
  ('4-4', '두꺼운 대검', '74', 2, 'atk', 'adv_4', false),
  ('6-11', '넓은 주황 대검 III', '81', 2, 'atk', 'adv_4', false),
  ('6-12', '넓은 갈색 대검', '82', 2, 'atk', 'adv_4', false),
  ('gun-compact-carbine', '짧은 카빈', '153', 2, 'agi', 'adv_4', false),
  ('gun-micro-smg', '초소형 기관단총', '156', 2, 'agi', 'adv_4', false),
  ('1-8', '넓은 보랏빛 대검', '24', 3, 'hp', 'adv_4', false),
  ('1-30', '넓은 금빛 대검', '85', 3, 'atk', 'adv_4', false),
  ('3-7', '넓은 주황 대검 IV', '138', 3, 'atk', 'adv_4', false),
  ('3-12', '보랏빛 촉수 대검', '91', 3, 'atk', 'adv_4', false),
  ('3-19', '장검 III', '72', 3, 'def', 'adv_4', false),
  ('5-19', '숲의 이끼 곡도', '34', 3, 'hp', 'adv_4', false),
  ('6-25', '넓은 푸른 대검 II', '149', 3, 'atk', 'adv_4', false),
  ('7-9', '분홍 몽둥이', '40', 3, 'hp', 'adv_4', false),
  ('7-26', '보랏빛 대검', '108', 3, 'atk', 'adv_4', false),
  ('gun-double-barrel-shotgun', '쌍열 산탄총', '155', 3, 'atk', 'adv_4', false),
  ('gun-tactical-shotgun', '전술 산탄총', '159', 3, 'def', 'adv_4', false),
  ('gun-tactical-smg', '전술 기관단총', '160', 3, 'agi', 'adv_4', false),
  ('1-21', '넓은 초록 대검', '44', 4, 'hp', 'adv_4', false),
  ('3-22', '금빛 보석 장검', '168', 4, 'luc', 'adv_4', false),
  ('7-13', '갈색 몽둥이', '52', 4, 'hp', 'adv_4', false),
  ('gun-assault-rifle', '돌격 소총', '152', 4, 'atk', 'adv_4', false),
  ('gun-energy-pistol', '에너지 권총', '189', 4, 'luc', 'adv_4', false),
  ('gun-light-machine-gun', '경기관총', '191', 4, 'def', 'adv_4', false),
  ('4-8', '붉은 고리 곡도', '57', 5, 'hp', 'adv_4', false),
  ('5-1', '금빛 고리 대검', '207', 5, 'atk', 'adv_4', true),
  ('gun-energy-rifle', '에너지 소총', '190', 5, 'atk', 'adv_4', false),
  ('1-25', '붉은 보석 장검', '65', 3, 'def', 'adv_5', false),
  ('2-21', '붉은 가시 장검', '87', 3, 'luc', 'adv_5', false),
  ('3-18', '분홍 톱니 장검', '92', 3, 'atk', 'adv_5', false),
  ('4-11', '핏빛 장검', '97', 3, 'atk', 'adv_5', false),
  ('4-18', '노래하는 장검', '142', 3, 'agi', 'adv_5', false),
  ('5-8', '불꽃 장검', '99', 3, 'atk', 'adv_5', false),
  ('5-17', '푸른 대검', '146', 3, 'atk', 'adv_5', false),
  ('5-30', '청록 가시 장검', '147', 3, 'def', 'adv_5', false),
  ('6-3', '푸른 가시 장검', '103', 3, 'atk', 'adv_5', false),
  ('6-22', '빛의 톱니 장검', '148', 3, 'luc', 'adv_5', false),
  ('7-23', '꼬치', '42', 3, 'luc', 'adv_5', false),
  ('7-24', '청록 결정 대검', '151', 3, 'atk', 'adv_5', false),
  ('1-11', '금빛 꽃 장검', '162', 4, 'luc', 'adv_5', false),
  ('2-1', '분홍 장검', '113', 4, 'hp', 'adv_5', false),
  ('2-25', '분홍 장검 II', '166', 4, 'def', 'adv_5', false),
  ('3-14', '분홍 장검 III', '167', 4, 'luc', 'adv_5', false),
  ('4-20', '광선 장검', '171', 4, 'def', 'adv_5', false),
  ('5-28', '금빛 결정 대검', '176', 4, 'atk', 'adv_5', false),
  ('6-9', '노란 촉수 장검', '179', 4, 'luc', 'adv_5', false),
  ('6-17', '넓은 분홍 대검', '180', 4, 'atk', 'adv_5', false),
  ('7-10', '무지개 꽃 세검', '184', 4, 'agi', 'adv_5', false),
  ('7-21', '상아빛 고리 단검', '187', 4, 'agi', 'adv_5', false),
  ('1-7', '무지개 별 장검', '194', 5, 'luc', 'adv_5', true),
  ('4-13', '금빛 구슬 장검', '205', 5, 'luc', 'adv_5', false),
  ('5-4', '금빛 장검', '208', 5, 'luc', 'adv_5', false),
  ('6-13', '노란 꽃 장검', '212', 5, 'luc', 'adv_5', false),
  ('6-21', '금빛 고리 장검', '214', 5, 'luc', 'adv_5', false),
  ('1-6', '푸른 초승달 곡도', '132', 3, 'def', 'adv_6', false),
  ('2-4', '분홍 물방울 장검', '133', 3, 'def', 'adv_6', false),
  ('3-3', '붉은 구슬 장검', '136', 3, 'def', 'adv_6', false),
  ('3-6', '보랏빛 곡도', '137', 3, 'def', 'adv_6', false),
  ('3-24', '은빛 장검 VI', '139', 3, 'def', 'adv_6', false),
  ('4-7', '얼음 결정 단검', '140', 3, 'agi', 'adv_6', false),
  ('4-16', '넓은 하늘빛 대검', '141', 3, 'atk', 'adv_6', false),
  ('5-13', '하늘빛 결정 장검', '145', 3, 'def', 'adv_6', false),
  ('1-15', '바람 깃털 장검', '163', 4, 'agi', 'adv_6', false),
  ('2-14', '물결 황새치', '134', 4, 'agi', 'adv_6', false),
  ('2-19', '노래하는 장검 II', '135', 4, 'agi', 'adv_6', false),
  ('4-9', '주황 장검 II', '95', 4, 'atk', 'adv_6', false),
  ('4-21', '하늘빛 삼지창', '143', 4, 'agi', 'adv_6', false),
  ('5-2', '붉은 불꽃 장검', '120', 4, 'atk', 'adv_6', false),
  ('5-15', '바람 곡도', '172', 4, 'agi', 'adv_6', false),
  ('5-22', '하늘빛 장검', '173', 4, 'def', 'adv_6', false),
  ('6-4', '주황 장검 III', '104', 4, 'atk', 'adv_6', false),
  ('6-8', '하늘빛 가시 장검', '178', 4, 'def', 'adv_6', false),
  ('7-3', '은빛 고리 장검', '107', 4, 'atk', 'adv_6', false),
  ('7-18', '금빛 고리 곡도', '186', 4, 'luc', 'adv_6', false),
  ('1-2', '푸른 눈송이 장검', '192', 5, 'def', 'adv_6', false),
  ('1-9', '푸른 물방울 단검', '195', 5, 'agi', 'adv_6', false),
  ('2-20', '주황 불꽃 장검', '128', 5, 'agi', 'adv_6', false),
  ('2-29', '은빛 소용돌이 곡도', '200', 5, 'agi', 'adv_6', true),
  ('3-11', '하늘빛 고리 단검', '202', 5, 'agi', 'adv_6', false),
  ('5-9', '푸른 꽃 곡도', '209', 5, 'def', 'adv_6', false),
  ('7-27', '노란 별 장검', '188', 5, 'luc', 'adv_6', false),
  ('2-16', '주황 별 장검 II', '68', 3, 'luc', 'adv_7', false),
  ('5-21', '가는 핏빛 세검', '101', 3, 'agi', 'adv_7', false),
  ('6-20', '증기 곡도', '106', 3, 'hp', 'adv_7', false),
  ('6-30', '갈색 잎 장검', '150', 3, 'hp', 'adv_7', false),
  ('1-17', '붉은 톱날 장검', '110', 4, 'agi', 'adv_7', false),
  ('2-7', '노란 번개 장검', '164', 4, 'agi', 'adv_7', false),
  ('2-9', '분홍 고리 장검', '165', 4, 'def', 'adv_7', false),
  ('3-9', '분홍 꽃 장검 II', '46', 4, 'hp', 'adv_7', false),
  ('3-20', '초록 덩굴 곡도', '47', 4, 'hp', 'adv_7', false),
  ('3-23', '푸른 고리 장검', '117', 4, 'def', 'adv_7', false),
  ('4-15', '가는 분홍 마법서', '170', 4, 'agi', 'adv_7', false),
  ('4-26', '하늘빛 가시 장검 II', '144', 4, 'agi', 'adv_7', false),
  ('5-20', '연둣빛 잎 장검', '48', 4, 'hp', 'adv_7', false),
  ('5-24', '주황 보석 장검', '174', 4, 'luc', 'adv_7', false),
  ('5-26', '검은 구슬 장검', '175', 4, 'agi', 'adv_7', false),
  ('7-2', '은빛 고리 곡도 II', '181', 4, 'luc', 'adv_7', false),
  ('7-17', '초록 장검', '185', 4, 'luc', 'adv_7', false),
  ('7-22', '초록 잎 장검 IV', '54', 4, 'hp', 'adv_7', false),
  ('1-13', '노란 번개 장검 II', '196', 5, 'agi', 'adv_7', false),
  ('2-27', '별빛 별 대검', '199', 5, 'atk', 'adv_7', true),
  ('3-1', '금빛 고리 장검 II', '201', 5, 'luc', 'adv_7', false),
  ('3-2', '불꽃 장검 II', '129', 5, 'def', 'adv_7', false),
  ('3-4', '회녹빛 불꽃 곡도', '130', 5, 'hp', 'adv_7', false),
  ('4-2', '하늘빛 번개 장검', '169', 5, 'agi', 'adv_7', false),
  ('6-1', '초록 초승달 단검', '210', 5, 'agi', 'adv_7', false),
  ('6-5', '금빛 초승달 곡도', '211', 5, 'luc', 'adv_7', false),
  ('6-19', '분홍 리본', '213', 5, 'def', 'adv_7', false),
  ('1-16', '보랏빛 곡도 II', '109', 4, 'def', 'adv_8', false),
  ('1-24', '붉은 용 곡도', '111', 4, 'luc', 'adv_8', false),
  ('1-27', '가는 붉은 세검 III', '112', 4, 'agi', 'adv_8', false),
  ('2-22', '은빛 장검 VII', '88', 4, 'hp', 'adv_8', false),
  ('3-25', '보랏빛 장검', '118', 4, 'atk', 'adv_8', false),
  ('4-1', '굽은 검은 장검', '94', 4, 'atk', 'adv_8', false),
  ('5-3', '삼각 분홍 대검', '121', 4, 'atk', 'adv_8', false),
  ('5-12', '검은 장검 III', '122', 4, 'atk', 'adv_8', false),
  ('5-27', '검은 촉수 삼지창', '102', 4, 'agi', 'adv_8', false),
  ('6-7', '검은 고리 세검', '177', 4, 'agi', 'adv_8', false),
  ('6-18', '검붉은 가시 장검', '105', 4, 'atk', 'adv_8', false),
  ('6-23', '노란 날개 장검', '123', 4, 'atk', 'adv_8', false),
  ('7-4', '붉은 장검 II', '182', 4, 'hp', 'adv_8', false),
  ('7-5', '푸른 장검', '183', 4, 'def', 'adv_8', false),
  ('1-1', '붉은 불꽃 곡도', '125', 5, 'luc', 'adv_8', false),
  ('1-4', '은빛 세검', '193', 5, 'agi', 'adv_8', false),
  ('1-5', '금빛 불꽃 장검', '126', 5, 'hp', 'adv_8', false),
  ('1-10', '붉은 꽃 세검', '56', 5, 'hp', 'adv_8', false),
  ('1-20', '은백 날개 장검', '197', 5, 'luc', 'adv_8', false),
  ('1-23', '가는 금빛 세검', '198', 5, 'agi', 'adv_8', false),
  ('2-2', '금빛 장검 II', '127', 5, 'def', 'adv_8', false),
  ('3-17', '금빛 고리 장검 III', '203', 5, 'luc', 'adv_8', false),
  ('3-29', '금빛 보석 장검 II', '204', 5, 'luc', 'adv_8', false),
  ('4-5', '가는 검은 세검', '119', 5, 'agi', 'adv_8', true),
  ('4-29', '금빛 고리 장검 IV', '206', 5, 'luc', 'adv_8', false),
  ('7-19', '푸른 불꽃 장검', '124', 5, 'atk', 'adv_8', false),
  ('7-25', '금빛 구슬 장검 II', '215', 5, 'luc', 'adv_8', false)
on conflict (id) do update set
  name = excluded.name, art = excluded.art, star = excluded.star, stat = excluded.stat, zone = excluded.zone, boss = excluded.boss;

-- 장착 효과 처음 값(기획 19장 표, 계산기 dungeon-run.js EQUIP_STAR_PCT·EQUIP_FX). 다시 실행하면 이 식으로 돌아간다.
-- 스텟: ★ × 5%. 특수(★4 이상, 중간 보스 무기는 ★4, 지역 보스 무기는 셋째 값):
-- ATK 크리티컬 피해 +0.25 / +0.5 / +0.75, AGI 콤보 +5 / +10 / +15%p(상한도), HP 흡혈 5 / 10 / 15%, DEF 받는 피해 −5 / −10 / −15%, LUC 무기 드랍 +25 / +50 / +75%.
update public.adventure_weapons set
  equip_pct = star * 0.05,
  equip_fx = case when star >= 4 or boss then
    case stat when 'atk' then 'crit' when 'agi' then 'combo' when 'hp' then 'leech' when 'def' then 'guard' else 'drop' end
  end,
  equip_fx_value = case when star < 4 and not boss then 0
    else case when stat in ('atk', 'luc') then 0.25 else 0.05 end * case when boss then 3 else star - 3 end
  end;

-- 중간 보스 11(기획 11장, 자리와 레벨은 디자인 세션 맵 자료 adv-maps.json의 mids, 무기는 adventure-weapons.md). 세기 = 지역 세기 × 3.
insert into public.adventure_minis (zone, idx, name, level, strength, gold, weapon) values
  ('adv_1', 1, '숲 방', 710, 3, 1, '7-28'),
  ('adv_1', 2, '금화 방', 2222, 3, 2, '3-5'),
  ('adv_2', 1, '용암 굴 1', 9000, 6, 1, '3-27'),
  ('adv_2', 2, '용암 굴 2', 12000, 6, 1, '2-5'),
  ('adv_2', 3, '용암 굴 3', 15000, 6, 1, '3-21'),
  ('adv_2', 4, '용암 굴 4', 18000, 6, 1, '2-18'),
  ('adv_3', 1, '가운데 빈터', 25555, 9, 1, '7-15'),
  ('adv_6', 1, '서쪽 섬', 48000, 19.5, 1, '6-8'),
  ('adv_6', 2, '동쪽 섬', 58000, 19.5, 1, '5-2'),
  ('adv_6', 3, '북서쪽 섬', 70000, 19.5, 1, '1-15'),
  ('adv_6', 4, '북동쪽 섬', 85000, 19.5, 1, '5-22')
on conflict (zone, idx) do update set
  name = excluded.name, level = excluded.level, strength = excluded.strength, gold = excluded.gold, weapon = excluded.weapon;

-- 몬스터 59(일반 39, 중간 보스 11, 보스 9, 2026-11-18 밤 몬스터 한 마리씩·맵 열세 장). 공유 노트 code-adventure-tools/monster-rows.cjs가
-- 디자인 세션 자료(monster-spots.json version 2, adv-maps.json version 2)에서 만든다(맵, 지역, 칸, 역할, 그림, 레벨, 중간 보스 번호, 보너스).
-- 몬스터가 바뀌면 통째로 다시 넣는다(위에서 맵 행과 함께 지웠다). 예전 모양(띠, 지역·칸 키)의 표면 열을 맞춘다(빈 표라 바로 바뀐다).
alter table public.adventure_spots drop constraint if exists adventure_spots_pkey;
alter table public.adventure_spots
  add column if not exists map text,
  add column if not exists art text,
  add column if not exists level numeric,
  drop column if exists band;
alter table public.adventure_spots alter column map set not null, alter column level set not null;
alter table public.adventure_spots add primary key (map, x, y);
alter table public.adventure_spots drop constraint if exists adventure_spots_map_fkey;
alter table public.adventure_spots add constraint adventure_spots_map_fkey foreign key (map) references public.adventure_maps (map);
alter table public.adventure_spots drop constraint if exists adventure_spots_level_check;
alter table public.adventure_spots add constraint adventure_spots_level_check check (level >= 1);
insert into public.adventure_spots (map, zone, x, y, kind, art, level, mini, bonus) values
  ('adv_1a', 'adv_1', 10, 6, 'normal', 's2-20', 1, null, null),
  ('adv_1a', 'adv_1', 21, 10, 'normal', 's2-11', 2, null, null),
  ('adv_1a', 'adv_1', 13, 21, 'normal', 's4-10', 5, null, null),
  ('adv_1a', 'adv_1', 23, 24, 'normal', 's0-20', 12, null, null),
  ('adv_1b', 'adv_1', 15, 7, 'normal', 's3-15', 28, null, null),
  ('adv_1b', 'adv_1', 9, 19, 'normal', 's2-03', 65, null, null),
  ('adv_1b', 'adv_1', 22, 19, 'normal', 's3-03', 150, null, null),
  ('adv_1b', 'adv_1', 33, 28, 'normal', 's3-13', 350, null, null),
  ('adv_1b', 'adv_1', 22, 41, 'mini', 's0-04', 710, 1, null),
  ('adv_1c', 'adv_1', 14, 8, 'normal', 's3-10', 800, null, null),
  ('adv_1c', 'adv_1', 21, 21, 'normal', 's2-12', 1800, null, null),
  ('adv_1c', 'adv_1', 42, 19, 'mini', 's0-22', 2222, 2, null),
  ('adv_1c', 'adv_1', 42, 31, 'normal', 's0-24', 4000, null, null),
  ('adv_1c', 'adv_1', 43, 43, 'boss', 's2-24', 5200, null, null),
  ('adv_2a', 'adv_2', 44, 28, 'normal', 's3-04', 5300, null, 'exp3'),
  ('adv_2a', 'adv_2', 40, 17, 'normal', 's2-10', 7200, null, null),
  ('adv_2a', 'adv_2', 38, 3, 'mini', 's3-25', 9000, 1, null),
  ('adv_2a', 'adv_2', 23, 6, 'normal', 's3-14', 9800, null, null),
  ('adv_2a', 'adv_2', 12, 14, 'mini', 's4-03', 12000, 2, null),
  ('adv_2b', 'adv_2', 31, 26, 'normal', 's3-32', 13300, null, null),
  ('adv_2b', 'adv_2', 31, 13, 'mini', 's3-20', 15000, 3, null),
  ('adv_2b', 'adv_2', 6, 32, 'normal', 's4-02', 18000, null, null),
  ('adv_2b', 'adv_2', 12, 42, 'mini', 's2-14', 18000, 4, null),
  ('adv_2b', 'adv_2', 5, 5, 'boss', 's4-12', 20000, null, null),
  ('adv_3', 'adv_3', 6, 14, 'normal', 's0-13', 20100, null, null),
  ('adv_3', 'adv_3', 14, 26, 'normal', 's2-02', 22500, null, null),
  ('adv_3', 'adv_3', 10, 6, 'normal', 's3-02', 25000, null, null),
  ('adv_3', 'adv_3', 22, 22, 'mini', 's3-35', 25555, 1, null),
  ('adv_3', 'adv_3', 38, 38, 'boss', 's0-00', 27200, null, null),
  ('adv_4', 'adv_4', 13, 24, 'normal', 's0-02', 28800, null, null),
  ('adv_4', 'adv_4', 23, 19, 'normal', 's3-12', 31000, null, null),
  ('adv_4', 'adv_4', 32, 21, 'normal', 's3-31', 33500, null, null),
  ('adv_4', 'adv_4', 42, 27, 'boss', 's2-01', 36000, null, null),
  ('adv_5', 'adv_5', 27, 17, 'normal', 's3-24', 37777, null, 'exp3'),
  ('adv_5', 'adv_5', 12, 32, 'normal', 's4-11', 37777, null, 'drop3'),
  ('adv_5', 'adv_5', 32, 12, 'normal', 's3-21', 37777, null, 'exp15'),
  ('adv_5', 'adv_5', 17, 27, 'normal', 's3-11', 37777, null, 'exp2'),
  ('adv_5', 'adv_5', 37, 7, 'normal', 's3-34', 37777, null, 'drop2'),
  ('adv_5', 'adv_5', 22, 22, 'normal', 's0-01', 37777, null, 'foeHp'),
  ('adv_5', 'adv_5', 7, 37, 'normal', 's2-13', 37777, null, 'foeAtk'),
  ('adv_5', 'adv_5', 37, 37, 'boss', 'b2', 40000, null, null),
  ('adv_6a', 'adv_6', 36, 31, 'normal', 's0-23', 43000, null, null),
  ('adv_6a', 'adv_6', 22, 37, 'mini', 's0-03', 48000, 1, null),
  ('adv_6a', 'adv_6', 25, 28, 'normal', 's2-21', 50000, null, null),
  ('adv_6a', 'adv_6', 30, 13, 'mini', 's0-21', 58000, 2, null),
  ('adv_6b', 'adv_6', 35, 31, 'normal', 's3-23', 62000, null, null),
  ('adv_6b', 'adv_6', 19, 37, 'mini', 's2-00', 70000, 3, null),
  ('adv_6b', 'adv_6', 25, 25, 'normal', 's0-11', 77000, null, null),
  ('adv_6b', 'adv_6', 31, 10, 'mini', 's3-33', 85000, 4, null),
  ('adv_6b', 'adv_6', 10, 10, 'boss', 'b4', 93333, null, null),
  ('adv_7', 'adv_7', 9, 7, 'normal', 's2-23', 100000, null, null),
  ('adv_7', 'adv_7', 12, 15, 'normal', 's0-12', 140000, null, null),
  ('adv_7', 'adv_7', 22, 19, 'normal', 's4-13', 190000, null, null),
  ('adv_7', 'adv_7', 27, 43, 'boss', 'b1', 250000, null, null),
  ('adv_7', 'adv_7', 43, 27, 'boss', 'b3', 250000, null, null),
  ('adv_8', 'adv_8', 29, 10, 'normal', 's4-00', 256000, null, null),
  ('adv_8', 'adv_8', 34, 29, 'normal', 's3-00', 320000, null, null),
  ('adv_8', 'adv_8', 15, 30, 'normal', 's3-01', 390000, null, null),
  ('adv_8', 'adv_8', 23, 23, 'boss', 'b5', 450000, null, null);

-- ───────── 3. 안에서만 쓰는 함수 ─────────

-- 판을 끝낸다: 이긴 수 × 5,400 마을 경험치(gain_exp, 2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로"), 판 금화 × 50%(버림) 마을 골드. 판 칸을 비우고 결과를 last_result에 남긴다.
-- reason은 끝난 까닭('bp' BP가 0이 됨, 'return' 귀환)이고 결과 화면 제목을 고른다. 가져가는 양은 둘이 같다.
-- 결과는 다음 adventure_state가 한 번 주고 지운다(전투 중에 새로고침해도 결과 화면이 뜨게, 2026-11-17 PM). 귀환은 adventure_return이 바로 준다.
-- 판이 없으면 null. 부르는 쪽이 profiles 줄을 먼저 잠근다.
drop function if exists public.adventure_settle(uuid);
create or replace function public.adventure_settle(who uuid, reason text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  town_exp integer;
  town_gold numeric;
  outcome jsonb;
begin
  select * into strict a from public.adventure_players as x where x.player = who for update;
  if not a.in_run then
    return null;
  end if;
  town_exp := a.run_wins * 5400;
  town_gold := floor(a.run_gold * 0.5);
  if town_exp > 0 then
    perform public.gain_exp(who, town_exp);
  end if;
  if town_gold > 0 then
    update public.profiles as p set gold = p.gold + town_gold where p.id = who;
  end if;
  outcome := jsonb_build_object(
    'reason', reason, 'map', a.run_map, 'level', a.run_level::text, 'wins', a.run_wins, 'losses', a.run_losses,
    'exp', a.run_exp::text, 'townExp', town_exp, 'gold', a.run_gold::text, 'townGold', town_gold::text, 'drops', a.run_drops
  );
  update public.adventure_players as x set
    in_run = false, bp = 20, run_map = null, run_bosses = '{}', run_level = 1, run_exp = 0, run_points = 0,
    run_hp = 0, run_atk = 0, run_def = 0, run_agi = 0, run_luc = 0, run_gold = 0, run_wins = 0, run_losses = 0,
    run_drops = '[]', last_result = outcome
    where x.player = who;
  return outcome;
end;
$$;

-- 내 줄을 만들고(없으면) 잠근다. 부르는 쪽이 profiles 줄을 먼저 잠근다(교착 막기).
create or replace function public.adventure_prepare(who uuid) returns public.adventure_players
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
begin
  insert into public.adventure_players (player) values (who) on conflict (player) do nothing;
  select * into strict a from public.adventure_players as x where x.player = who for update;
  return a;
end;
$$;

-- 지금 전투에 쓰는 스텟(기획 6장, 7장, 9장, 10장).
-- 스텟 = (처음 값 + (판에서 나눈 포인트 + 마을 스텟 × 100) × 1포인트 효과) × (1 + 컬렉션 + 보석) × (1 + 베이스 레벨 × 0.25).
-- 처음 값 HP 100, ATK 10, 나머지 0. 1포인트 효과 HP 5, ATK 1, DEF 3, AGI 1, LUC 1. 마을 HP는 max_hp − 100, STR → ATK, LUK → LUC.
-- 베이스 레벨 = floor(마을 레벨 / 1000). 컬렉션은 무기마다 별 × 1% × 가진 수, 한 지역을 다 모으면 모든 스텟 +5%.
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
begin
  select * into strict me from public.profiles as p where p.id = who;
  select * into strict a from public.adventure_players as x where x.player = who;
  select w.stat, w.equip_pct * (1 + 0.25 * (c.copies - 1)), w.equip_fx, w.equip_fx_value
    into eq_stat, eq_pct, eq_fx, eq_fx_value
    from public.adventure_weapons as w join public.adventure_collection as c on c.weapon = w.id and c.player = who
    where w.id = a.main_weapon;
  if not found then
    eq_stat := null; eq_pct := 0; eq_fx := null; eq_fx_value := 0;
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
  -- 장착 무기 스텟은 컬렉션 보너스와 따로 더한다(계산기 statsWith의 col[stat] += …).
  case eq_stat
    when 'hp' then c_hp := c_hp + eq_pct;
    when 'atk' then c_atk := c_atk + eq_pct;
    when 'def' then c_def := c_def + eq_pct;
    when 'agi' then c_agi := c_agi + eq_pct;
    when 'luc' then c_luc := c_luc + eq_pct;
    else null;
  end case;

  select 0.05 * count(*) into full_zones from (
    select w.zone from public.adventure_weapons as w
    left join public.adventure_collection as c on c.weapon = w.id and c.player = who
    group by w.zone having count(c.weapon) = count(*)
  ) as done;

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

  t_hp := greatest(0, me.max_hp - 100);
  return jsonb_build_object(
    'hp', (100 + (a.run_hp + t_hp * 100) * 5) * (1 + c_hp + full_zones + g_hp) * mul,
    'atk', (10 + (a.run_atk + me.str * 100)) * (1 + c_atk + full_zones + g_atk) * mul,
    'def', (a.run_def + me.def * 100) * 3 * (1 + c_def + full_zones + g_def) * mul,
    'agi', (a.run_agi + me.agi * 100) * (1 + c_agi + full_zones + g_agi) * mul,
    'luc', (a.run_luc + me.luk * 100) * (1 + c_luc + full_zones + g_luc) * mul,
    'base', base_level,
    'mul', mul,
    'town', jsonb_build_object('hp', t_hp, 'atk', me.str, 'def', me.def, 'agi', me.agi, 'luc', me.luk),
    'bonus', jsonb_build_object(
      'hp', c_hp + full_zones + g_hp, 'atk', c_atk + full_zones + g_atk, 'def', c_def + full_zones + g_def,
      'agi', c_agi + full_zones + g_agi, 'luc', c_luc + full_zones + g_luc
    ),
    'fx', jsonb_build_object(
      'comboAdd', combo_add, 'comboMax', combo_max, 'critMul', crit_mul, 'leech', leech, 'endure', endure,
      'exp', exp_bonus, 'gold', gold_bonus, 'guard', guard, 'drop', drop_bonus
    ),
    -- 화면에 보일 장착 효과(숫자만). 장착이 없거나 가진 무기가 아니면 null
    'equip', case when eq_stat is null then null else jsonb_build_object(
      'weapon', a.main_weapon, 'stat', eq_stat, 'pct', eq_pct, 'fx', eq_fx, 'value', eq_fx_value
    ) end
  );
end;
$$;

-- 모험 창이 보일 것을 한 번에 읽는다. 골드·레벨·경험치·포인트처럼 커지는 수는 글자로 보낸다.
create or replace function public.adventure_view(who uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'bp', a.bp, 'inRun', a.in_run, 'runMap', a.run_map, 'runBosses', to_jsonb(a.run_bosses),
    'level', a.run_level::text, 'exp', a.run_exp::text, 'points', a.run_points::text,
    'spent', jsonb_build_object('hp', a.run_hp::text, 'atk', a.run_atk::text, 'def', a.run_def::text, 'agi', a.run_agi::text, 'luc', a.run_luc::text),
    'runGold', a.run_gold::text, 'wins', a.run_wins, 'losses', a.run_losses, 'drops', a.run_drops,
    'auto', a.auto_split, 'slots', a.slots, 'mainWeapon', a.main_weapon,
    'bosses', (select coalesce(jsonb_agg(b.zone order by b.zone), '[]') from public.adventure_bosses as b where b.player = who),
    'zones', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', z.id, 'name', z.name, 'map', z.map, 'strength', z.strength,
        'first', (select min(s.level) from public.adventure_spots as s where s.zone = z.id and s.kind = 'normal'),
        'maps', (select coalesce(jsonb_agg(mp.map order by mp.idx), '[]') from public.adventure_maps as mp where mp.zone = z.id),
        'bossLevel', z.boss_level, 'bossStrength', z.boss_strength,
        'open', z.unlock_after is null or exists (select 1 from public.adventure_bosses as b where b.player = who and b.zone = z.unlock_after),
        'minis', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'idx', m.idx, 'name', m.name, 'level', m.level, 'strength', m.strength, 'gold', m.gold, 'weapon', m.weapon,
            'killed', exists (select 1 from public.adventure_mini_kills as k where k.player = who and k.zone = m.zone and k.idx = m.idx)
          ) order by m.idx), '[]')
          from public.adventure_minis as m where m.zone = z.id
        )
      ) order by z.sort), '[]')
      from public.adventure_zones as z
    ),
    'shop', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id, 'kind', i.kind, 'stat', i.stat, 'tier', i.tier, 'name', i.name, 'value', i.value, 'value2', i.value2,
        'price', i.price::text, 'opens', i.opens, 'stack', i.stack
      ) order by i.sort), '[]')
      from public.adventure_items as i
    ),
    'owned', (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'item', o.item, 'slot', o.slot, 'paid', o.paid::text) order by o.id), '[]')
      from public.adventure_owned as o where o.player = who
    ),
    'collection', (
      select coalesce(jsonb_agg(jsonb_build_object('weapon', c.weapon, 'copies', c.copies) order by c.weapon), '[]')
      from public.adventure_collection as c where c.player = who
    ),
    'power', public.adventure_power(who),
    'townLevel', p.level::text,
    'townGold', p.gold::text
  )
  from public.adventure_players as a join public.profiles as p on p.id = a.player
  where a.player = who;
$$;

revoke execute on function public.adventure_settle(uuid, text) from public, anon, authenticated;
revoke execute on function public.adventure_prepare(uuid) from public, anon, authenticated;
revoke execute on function public.adventure_power(uuid) from public, anon, authenticated;
revoke execute on function public.adventure_view(uuid) from public, anon, authenticated;

-- ───────── 4. 화면이 부르는 함수 ─────────

-- 모험 창을 열 때. 끝난 판의 결과를 아직 안 봤으면 result로 한 번 같이 준다.
create or replace function public.adventure_state() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  shown jsonb;
begin
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(auth.uid());
  -- 컬렉션 무기 정의(약 20KB)는 창 값과 달리 이 함수만 같이 준다. 전투마다 보내지 않는다. mini는 중간 보스가 주는 무기다.
  shown := public.adventure_view(auth.uid()) || jsonb_build_object('weapons', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', w.id, 'name', w.name, 'art', w.art, 'star', w.star, 'stat', w.stat, 'zone', w.zone, 'boss', w.boss,
      'equipPct', w.equip_pct, 'equipFx', w.equip_fx, 'equipFxValue', w.equip_fx_value,
      'mini', exists (select 1 from public.adventure_minis as m where m.weapon = w.id)
    ) order by w.art::integer), '[]')
    from public.adventure_weapons as w
  ));
  if a.last_result is not null then
    update public.adventure_players as x set last_result = null where x.player = auth.uid();
    shown := shown || jsonb_build_object('result', a.last_result);
  end if;
  return shown;
end;
$$;

-- 판을 연다(모험 창 [들어가기]). 판이 없으면 새 판(BP 20, 레벨 1, 입구 맵 adv_gate)이고, 판 중이면 그대로 둔다(이어 하기).
-- 화면은 돌려받은 runMap 맵 입구로 간다.
create or replace function public.adventure_start() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
begin
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(auth.uid());
  if not a.in_run then
    update public.adventure_players as x set
      in_run = true, bp = 20, run_map = 'adv_gate', run_bosses = '{}', run_level = 1, run_exp = 0, run_points = 0,
      run_hp = 0, run_atk = 0, run_def = 0, run_agi = 0, run_luc = 0, run_gold = 0, run_wins = 0, run_losses = 0, run_drops = '[]'
      where x.player = auth.uid();
  end if;
  return public.adventure_view(auth.uid());
end;
$$;

-- 귀환(필드 HUD의 [귀환]). BP 0과 같은 양을 가져가고 판을 끝낸다. 결과는 result로 바로 준다(last_result는 비움).
create or replace function public.adventure_return() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  outcome jsonb;
begin
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(auth.uid());
  if not a.in_run then
    raise exception 'no run';
  end if;
  outcome := public.adventure_settle(auth.uid(), 'return');
  update public.adventure_players as x set last_result = null where x.player = auth.uid();
  return public.adventure_view(auth.uid()) || jsonb_build_object('result', outcome);
end;
$$;

-- 포탈로 맵을 옮긴다(이어 하기 자리를 남김). 입구 맵에서는 열린 지역 맵으로, 지역 맵에서는 그 지역 보스를 잡아 열린 다음 지역 맵으로만 간다.
-- 되돌아가는 길은 없다(에이전트가 정함). 지금 맵과 같으면 그대로 돌려준다.
create or replace function public.adventure_move(target text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  z public.adventure_zones%rowtype;
  t public.adventure_maps%rowtype;
  here public.adventure_maps%rowtype;
begin
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(auth.uid());
  if not a.in_run then
    raise exception 'no run';
  end if;
  if adventure_move.target is distinct from a.run_map then
    select * into t from public.adventure_maps as x where x.map = adventure_move.target;
    if not found or t.zone is null then
      raise exception 'bad map';
    end if;
    select * into strict z from public.adventure_zones as x where x.id = t.zone;
    if z.unlock_after is not null
      and not exists (select 1 from public.adventure_bosses as b where b.player = auth.uid() and b.zone = z.unlock_after) then
      raise exception 'zone locked';
    end if;
    select * into here from public.adventure_maps as x where x.map = a.run_map;
    if not found or here.zone is null then
      -- 입구 맵에서는 열린 지역의 첫 맵으로만
      if t.idx <> 1 then
        raise exception 'bad map';
      end if;
    elsif here.zone = t.zone then
      -- 같은 지역 안: 앞뒤 한 장(기획 19장 2번 '앞 맵·다음 맵' 포탈)
      if abs(t.idx - here.idx) <> 1 then
        raise exception 'bad map';
      end if;
    elsif z.unlock_after is distinct from here.zone or t.idx <> 1
      or here.idx <> (select max(x.idx) from public.adventure_maps as x where x.zone = here.zone) then
      -- 다음 지역: 지금 지역의 마지막 맵에서 다음 지역의 첫 맵으로만, 앞으로만
      raise exception 'bad map';
    end if;
    update public.adventure_players as x set run_map = t.map where x.player = auth.uid();
  end if;
  return public.adventure_view(auth.uid());
end;
$$;

-- 전투 하나(2026-11-18 몬스터를 맵 위에 둠, 기획 19장 '몬스터를 맵 위에 두며 바뀌는 것'·'몬스터 한 마리씩'). (map, x, y)는 싸우는 몬스터의 맵과 칸이다.
-- 몬스터는 adventure_spots에 몬스터마다 한 줄이고 잡아도 사라지지 않는다. 그 줄이 역할(일반·중간 보스·보스), 레벨, 구역 보너스
-- (일곱 빛 들판의 빛, 지옥 경험치 방)를 정한다. 그래서 화면은 맵과 칸만 보내고 서버가 레벨과 보너스를 정한다(클라이언트가 보낸 빛을 믿지 않음).
-- 내가 그 몬스터에 부딪힌 것은 클라이언트를 믿는다(기획 12장, kill_monster와 같은 수준). 맵이 이 판의 지금 맵인지는 본다.
-- 서버가 끝까지 셈하고 차례 목록을 돌려준다. turns: [누구(0 나, 1 몬스터, 2 버팀 목걸이), 피해, 크리티컬(1/0), 내 체력, 몬스터 체력].
-- 판 레벨이 몬스터 레벨의 2배 이상이어도 싸운다(판 경험치만 0). 지역 보스를 이기면 BP +5, 중간 보스 +2, 무기 20%는 한 판에 보스마다 처음 이긴 한 번만.
-- 보스·중간 보스의 판 금화 × 5(금화 방 × 10)는 처음 잡을 때만이다. 이 전투로 BP가 0이 되면 ended가 true이고 판이 끝난다.
drop function if exists public.adventure_battle(text, integer);
drop function if exists public.adventure_battle(text, integer, integer, text);
-- 인자 이름이 바뀌어(zone → map) 같은 모양이라도 지우고 다시 만든다.
drop function if exists public.adventure_battle(text, integer, integer);
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
begin
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
  if z.unlock_after is not null
    and not exists (select 1 from public.adventure_bosses as b where b.player = me.id and b.zone = z.unlock_after) then
    raise exception 'zone locked';
  end if;
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
  if a.bp <= 0 then
    raise exception 'no bp';
  end if;
  -- 너무 빨리 누름 막기(기획 8장, 연출과 결과 줄을 합한 가장 짧은 시간)
  if a.last_battle_at > now() - interval '2.5 seconds' then
    raise exception 'too fast';
  end if;
  -- 구역 보너스는 일반 몬스터 자리에만 있다(일곱 빛 들판의 빛, 지옥 첫 띠 경험치 방).
  case s.bonus
    when 'exp3' then exp_mul := 3;
    when 'exp2' then exp_mul := 2;
    when 'exp15' then exp_mul := 1.5;
    when 'drop3' then drop_mul := 3;
    when 'drop2' then drop_mul := 2;
    when 'foeHp' then hp_mul := 0.5;
    when 'foeAtk' then atk_mul := 0.5;
    else null;
  end case;
  m_hp := d * (30 + 10 * lv) * hp_mul;
  m_atk := d * (5 + 1.5 * lv) * atk_mul;

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

  -- 전투(dungeon-run.js fightOnce)
  combo := least((pw -> 'fx' ->> 'comboMax')::double precision, p_agi / (p_agi + lv * 2) + (pw -> 'fx' ->> 'comboAdd')::double precision);
  crit := least(0.5, (p_agi + p_luc) / (p_agi + p_luc + lv * 2));
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
    -- 경험치: expOf × (보스·중간 보스 3, 이길 때마다) × expFalloff × (1 + 배움의 보석) × 구역 보너스
    gain := round(40 * (lv + 3) ^ 2 * case when is_boss or is_mini then 3 else 1 end
      * case when a.run_level <= lv then 1 else greatest(0, 2 - a.run_level / lv) end
      * (1 + (pw -> 'fx' ->> 'exp')::numeric) * exp_mul);
    a.run_exp := a.run_exp + gain;
    -- levelFromExp: 레벨 n까지 쌓인 경험치가 50n(n − 1)
    new_level := floor((1 + sqrt(1 + 8 * a.run_exp / 100)) / 2);
    if new_level > a.run_level then
      got_points := (new_level - a.run_level) * 5;
      a.run_points := a.run_points + got_points;
      a.run_level := new_level;
      if a.auto_split then
        -- 추천대로 나누기 HP 3 : ATK 3 : DEF 1(마을 AGI가 0이면 AGI 1을 더해 3 : 3 : 1 : 1). 나눈 나머지는 남긴다.
        parts := case when me.agi > 0 then 7 else 8 end;
        unit := floor(a.run_points / parts);
        a.run_hp := a.run_hp + unit * 3;
        a.run_atk := a.run_atk + unit * 3;
        a.run_def := a.run_def + unit;
        a.run_agi := a.run_agi + unit * (parts - 7);
        a.run_points := a.run_points - unit * parts;
      end if;
    end if;

    if is_boss then
      boss_key := z.id;
      first_kill := not exists (select 1 from public.adventure_bosses as b where b.player = me.id and b.zone = z.id);
      insert into public.adventure_bosses (player, zone) values (me.id, z.id)
        on conflict on constraint adventure_bosses_pkey do update set kills = public.adventure_bosses.kills + 1;
      bp_gain := 5;
    elsif is_mini then
      boss_key := z.id || '#' || m.idx;
      first_kill := not exists (
        select 1 from public.adventure_mini_kills as k where k.player = me.id and k.zone = z.id and k.idx = m.idx
      );
      insert into public.adventure_mini_kills (player, zone, idx) values (me.id, z.id, m.idx)
        on conflict on constraint adventure_mini_kills_pkey do update set kills = public.adventure_mini_kills.kills + 1;
      bp_gain := 2;
    end if;
    fresh := boss_key is not null and not (boss_key = any (a.run_bosses));

    -- 판 금화: 166 × (L ÷ 20,000)^0.08 × lucGold × (1 + 금화 주머니)(2026-11-18 결과 칸 클릭 규칙 뒤 다시 맞춤, 기획 17장 '결과 칸 클릭 규칙의 안', 사용자 "추천안으로"). 보스·중간 보스를 처음 잡을 때만 × 5(금화 방 × 10).
    luc := (pw ->> 'luc')::numeric;
    gold_gain := round(166 * power(lv / 20000, 0.08) * (1 + 3 * luc / (luc + 4 * lv))
      * case when first_kill then 5 * coalesce(m.gold, 1) else 1 end
      * (1 + (pw -> 'fx' ->> 'gold')::numeric));
    a.run_gold := a.run_gold + gold_gain;

    if boss_key is not null then
      -- 보스·중간 보스 무기: 처음 잡으면 반드시, 다시 잡으면 판마다 처음 이길 때만 20%
      if first_kill or (fresh and random() < 0.2) then
        if is_boss then
          select w.id into dropped from public.adventure_weapons as w where w.zone = z.id and w.boss order by w.id limit 1;
        else
          dropped := m.weapon;
        end if;
      end if;
    elsif random() < 0.02 * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
      -- 장착 무기 드랍 +25~75%는 보통 몬스터 드랍에만(보스 무기 20%에는 안 붙음, 계산기 drop과 같음)
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
    -- 보스 BP는 한 판에 보스마다 한 번
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

-- 그 판의 포인트를 나눈다(필드에서도 됨). 다섯 값은 0 이상의 정수이고 합이 남은 포인트를 넘지 않아야 한다.
-- 화면의 [+1] [+10] [+100] [절반] [전부] [추천대로] [고르게]는 화면이 셈해서 이 함수로 보낸다.
create or replace function public.adventure_assign(hp numeric, atk numeric, def numeric, agi numeric, luc numeric) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  total numeric;
begin
  if adventure_assign.hp is null or adventure_assign.atk is null or adventure_assign.def is null
    or adventure_assign.agi is null or adventure_assign.luc is null
    or least(adventure_assign.hp, adventure_assign.atk, adventure_assign.def, adventure_assign.agi, adventure_assign.luc) < 0
    or adventure_assign.hp <> floor(adventure_assign.hp) or adventure_assign.atk <> floor(adventure_assign.atk)
    or adventure_assign.def <> floor(adventure_assign.def) or adventure_assign.agi <> floor(adventure_assign.agi)
    or adventure_assign.luc <> floor(adventure_assign.luc) then
    raise exception 'bad points';
  end if;
  total := adventure_assign.hp + adventure_assign.atk + adventure_assign.def + adventure_assign.agi + adventure_assign.luc;
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(auth.uid());
  if total <= 0 or total > a.run_points then
    raise exception 'not enough points';
  end if;
  update public.adventure_players as x set
    run_hp = x.run_hp + adventure_assign.hp, run_atk = x.run_atk + adventure_assign.atk, run_def = x.run_def + adventure_assign.def,
    run_agi = x.run_agi + adventure_assign.agi, run_luc = x.run_luc + adventure_assign.luc, run_points = x.run_points - total
    where x.player = auth.uid();
  return public.adventure_view(auth.uid());
end;
$$;

-- "레벨이 오르면 추천대로 저절로 나누기"를 켜고 끈다. 켤 때 남은 포인트가 있으면 바로 나눈다(adventure_battle과 같은 나누기).
create or replace function public.adventure_set_auto(enabled boolean) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  parts integer;
  unit numeric;
begin
  if enabled is null then
    raise exception 'bad value';
  end if;
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  a := public.adventure_prepare(me.id);
  parts := case when me.agi > 0 then 7 else 8 end;
  unit := case when enabled then floor(a.run_points / parts) else 0 end;
  update public.adventure_players as x set
    auto_split = enabled,
    run_hp = x.run_hp + unit * 3, run_atk = x.run_atk + unit * 3, run_def = x.run_def + unit, run_agi = x.run_agi + unit * (parts - 7),
    run_points = x.run_points - unit * parts
    where x.player = me.id;
  return public.adventure_view(me.id);
end;
$$;

-- 상점에서 장신구를 산다(마을 골드, 시작마을의 모험 창에서, 판 중이 아닐 때만). 빈 칸이 있고 끼울 수 있으면 바로 낀다(에이전트가 정함).
create or replace function public.adventure_buy(item text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  it public.adventure_items%rowtype;
  free_slot integer;
begin
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  if me.map <> 'plains' then
    raise exception 'not at the gate';
  end if;
  a := public.adventure_prepare(me.id);
  if a.in_run then
    raise exception 'in run';
  end if;
  select * into it from public.adventure_items as i where i.id = adventure_buy.item;
  if not found then
    raise exception 'unknown item';
  end if;
  if it.opens > (select count(*) from public.adventure_bosses as b where b.player = me.id) then
    raise exception 'item locked';
  end if;
  if me.gold < it.price then
    raise exception 'not enough gold';
  end if;
  update public.profiles as p set gold = p.gold - it.price where p.id = me.id;

  select s into free_slot from generate_series(1, a.slots) as s
    where not exists (select 1 from public.adventure_owned as o where o.player = me.id and o.slot = s)
    order by s limit 1;
  if not it.stack and exists (
    select 1 from public.adventure_owned as o join public.adventure_items as i on i.id = o.item
    where o.player = me.id and o.slot is not null and i.kind = it.kind
  ) then
    free_slot := null;
  end if;
  insert into public.adventure_owned (player, item, paid, slot) values (me.id, it.id, it.price, free_slot);
  return public.adventure_view(me.id);
end;
$$;

-- 가진 장신구 하나(adventure_owned의 id)를 산 값의 절반(버림)에 판다. 끼고 있으면 빠진다. 판 중에는 안 된다.
create or replace function public.adventure_sell(item bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  o public.adventure_owned%rowtype;
begin
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  if me.map <> 'plains' then
    raise exception 'not at the gate';
  end if;
  a := public.adventure_prepare(me.id);
  if a.in_run then
    raise exception 'in run';
  end if;
  delete from public.adventure_owned as x where x.id = adventure_sell.item and x.player = me.id returning * into o;
  if not found then
    raise exception 'not owned';
  end if;
  update public.profiles as p set gold = p.gold + floor(o.paid / 2) where p.id = me.id;
  return public.adventure_view(me.id);
end;
$$;

-- 장신구를 칸에 낀다. item이 null이면 그 칸을 비운다. 그 칸에 있던 것은 빠지고, 다른 칸에 있던 것이면 옮긴다. 판 중에는 안 된다.
-- 보석이 아닌 장신구는 한 종류에 하나만 낀다.
create or replace function public.adventure_equip(slot integer, item bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  it public.adventure_items%rowtype;
begin
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  if me.map <> 'plains' then
    raise exception 'not at the gate';
  end if;
  a := public.adventure_prepare(me.id);
  if a.in_run then
    raise exception 'in run';
  end if;
  if adventure_equip.slot is null or adventure_equip.slot < 1 or adventure_equip.slot > a.slots then
    raise exception 'bad slot';
  end if;
  if adventure_equip.item is not null then
    select i.* into it from public.adventure_owned as o join public.adventure_items as i on i.id = o.item
      where o.id = adventure_equip.item and o.player = me.id;
    if not found then
      raise exception 'not owned';
    end if;
    if not it.stack and exists (
      select 1 from public.adventure_owned as o join public.adventure_items as i on i.id = o.item
      where o.player = me.id and o.slot is not null and o.slot <> adventure_equip.slot and o.id <> adventure_equip.item and i.kind = it.kind
    ) then
      raise exception 'one of a kind';
    end if;
  end if;
  update public.adventure_owned as o set slot = null where o.player = me.id and o.slot = adventure_equip.slot;
  if adventure_equip.item is not null then
    update public.adventure_owned as o set slot = adventure_equip.slot where o.id = adventure_equip.item and o.player = me.id;
  end if;
  return public.adventure_view(me.id);
end;
$$;

-- 장신구 칸을 하나 늘린다. 처음 2칸, 지역 보스 하나를 처음 잡을 때마다 1칸씩 열리고 8칸까지(여섯째 보스에서 8칸). 판 중에는 안 된다.
-- 값: 3번째 20만, 4번째 100만, 5번째 500만, 6번째 2,500만, 7번째 1.25억, 8번째 6.25억(기획 9장, 화면 adventureRules.ts의 SLOT_PRICES와 같음).
create or replace function public.adventure_buy_slot() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  a public.adventure_players%rowtype;
  cap integer;
  price numeric;
begin
  select * into me from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  if me.map <> 'plains' then
    raise exception 'not at the gate';
  end if;
  a := public.adventure_prepare(me.id);
  if a.in_run then
    raise exception 'in run';
  end if;
  cap := least(8, 2 + (select count(*) from public.adventure_bosses as b where b.player = me.id)::integer);
  if a.slots >= cap then
    raise exception 'slot locked';
  end if;
  price := (array[200000, 1000000, 5000000, 25000000, 125000000, 625000000])[a.slots - 1];
  if me.gold < price then
    raise exception 'not enough gold';
  end if;
  update public.profiles as p set gold = p.gold - price where p.id = me.id;
  update public.adventure_players as x set slots = x.slots + 1 where x.player = me.id;
  return public.adventure_view(me.id);
end;
$$;

-- 들어가기 탭의 최고 레벨 순위(2026-11-18 밤): 위 10명(순위, 닉네임, 최고 판 레벨, 나인지)과 내 순위(기록이 없으면 null), 내 닉네임.
-- 같은 레벨이면 먼저 닿은 사람이 위다. 기록이 없는 사람(best_level 0)은 넣지 않는다. 화면은 탭을 열 때 한 번 읽는다.
create or replace function public.adventure_ranking() returns jsonb
language sql stable security definer set search_path = ''
as $$
  with ranked as (
    select a.player, p.nickname, a.best_level,
      row_number() over (order by a.best_level desc, a.best_at asc nulls last, a.player) as n
    from public.adventure_players as a join public.profiles as p on p.id = a.player
    where a.best_level > 0
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

-- 무기 장착(2026-11-18 사용자 "무기는 하나만 장착할 수 있다", "무기는 모험중에도 변경할 수 있다", 기획 19장 '컬렉션 무기 장착').
-- 가진 무기만 낀다. null이면 장착을 푼다(전투 화면은 기본 장검). 횟수·시간·비용 제한이 없다.
-- 전투는 걸 때 저장된 무기로 세므로 그 뒤에 바꾼 것은 다음 전투부터 든다. 예전 '대표 무기'(adventure_set_weapon, 겉모습만)를 이것으로 바꿨다.
drop function if exists public.adventure_set_weapon(text);
create or replace function public.adventure_equip_weapon(weapon_id text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.profiles as p where p.id = auth.uid() for update;
  if not found then
    raise exception 'no profile';
  end if;
  perform public.adventure_prepare(auth.uid());
  if weapon_id is not null
    and not exists (select 1 from public.adventure_collection as c where c.player = auth.uid() and c.weapon = weapon_id) then
    raise exception 'weapon not owned';
  end if;
  update public.adventure_players as x set main_weapon = weapon_id where x.player = auth.uid();
  return public.adventure_view(auth.uid());
end;
$$;

revoke execute on function public.adventure_state() from public, anon;
revoke execute on function public.adventure_start() from public, anon;
revoke execute on function public.adventure_return() from public, anon;
revoke execute on function public.adventure_move(text) from public, anon;
revoke execute on function public.adventure_equip_weapon(text) from public, anon;
revoke execute on function public.adventure_ranking() from public, anon;
revoke execute on function public.adventure_battle(text, integer, integer) from public, anon;
revoke execute on function public.adventure_assign(numeric, numeric, numeric, numeric, numeric) from public, anon;
revoke execute on function public.adventure_set_auto(boolean) from public, anon;
revoke execute on function public.adventure_buy(text) from public, anon;
revoke execute on function public.adventure_sell(bigint) from public, anon;
revoke execute on function public.adventure_equip(integer, bigint) from public, anon;
revoke execute on function public.adventure_buy_slot() from public, anon;
grant execute on function public.adventure_state() to authenticated;
grant execute on function public.adventure_start() to authenticated;
grant execute on function public.adventure_return() to authenticated;
grant execute on function public.adventure_move(text) to authenticated;
grant execute on function public.adventure_equip_weapon(text) to authenticated;
grant execute on function public.adventure_ranking() to authenticated;
grant execute on function public.adventure_battle(text, integer, integer) to authenticated;
grant execute on function public.adventure_assign(numeric, numeric, numeric, numeric, numeric) to authenticated;
grant execute on function public.adventure_set_auto(boolean) to authenticated;
grant execute on function public.adventure_buy(text) to authenticated;
grant execute on function public.adventure_sell(bigint) to authenticated;
grant execute on function public.adventure_equip(integer, bigint) to authenticated;
grant execute on function public.adventure_buy_slot() to authenticated;

-- ───────── 5. 모험 맵 공격 금지 ─────────
-- 20261116010000_interior_rooms.sql의 hit_player에서 공격 금지 맵 목록 한 줄과 그 위 주석만 바꾼다.
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
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;

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
  -- 공격 금지: 시작마을과 그 안의 상점(mart)·대장간(smithy)·노동청(labor)·농협(farmcoop) 안 맵, 모험 맵 아홉 장(adv_gate, adv_1~adv_8, id가 adv_로 시작).
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'mart', 'smithy', 'labor', 'farmcoop')
    or left(attacker.map, 4) = 'adv_' then
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

  -- 피해는 정수라서 소수점 아래는 그 확률만큼 1을 더한다. 체력보다 큰 피해는 체력만큼으로 줄여 bigint를 넘지 않게 한다.
  damage := least(victim.hp, greatest(1, floor(
    arm.damage * pellets * power(1.03::numeric, lvl) * (1 + attacker.str * 0.001) * 1000 / (1000 + victim.def) + random()::numeric
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

revoke execute on function public.hit_player(uuid, text, bigint, bigint, integer) from public, anon;
grant execute on function public.hit_player(uuid, text, bigint, bigint, integer) to authenticated;

-- ───────── 6. 모험 맵 블록 금지 ─────────
-- 20261116040000_farm_gate.sql의 "players place blocks"를 그대로 두고 맨 끝에 모험 맵(id가 adv_로 시작)이 아니라는 조건만 더했다.
-- 화면도 막는다(map.ts의 buildZones). 농장 입구 칸처럼 서버에도 넣는다(2026-11-17 PM).
drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks for insert to authenticated
with check (
  placed_by = auth.uid()
  and (
    z = 0
    or exists (
      select 1 from public.blocks as below
      where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1
    )
  )
  and (
    map <> 'farm'
    or (
      exists (select 1 from public.farm_plots as f where f.x = blocks.x and f.y = blocks.y and f.owner = auth.uid())
      and not public.farm_is_gate(blocks.x, blocks.y)
    )
  )
  and left(map, 4) <> 'adv_'
);

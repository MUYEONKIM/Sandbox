-- 모험 맵 v7(넓은 터)과 몬스터 B안, 보스·중간 보스 판마다 한 번(2026-11-21, PM 전달, 사용자가 미리보기를 보고 "넘겨").
-- 사용자: "맵이 전체적으로 길어진 만큼, 레벨업 구간도 많이 늘어났다. 따라서 기존의 몬스터들의 레벨이 많이 높아져야 될 것이다."
--   "같은맵에 같은 몬스터만 여러개 비치되어 있기보다는 다양한 몬스터가 비치되어있어야 한다. 몬스터 더 추가해도 된다."
--   "중간보스, 보스 는 게임 한판 당 한번씩만 잡을수있게". 고른 것: 레벨 "B: 지역마다 약 3배 (추천)", 그림 "다른 지역 그림도 씀 (추천)",
--   맵마다 수 "10/10/10/6으로 늘림 (추천)", 보스 규칙 "맵과 함께".
-- 기획 공유 노트 planning-monster-levels-1121.md 12·14장(표 docs/balance/tools/adventure-levels-B-10.json), 디자인 공유 노트 adventure-maps-v7.md 6절.
-- 실제 DB에 들어간 앞 migration은 고치지 않는다. 다시 실행해도 된다(update는 같은 값, 몬스터 자리는 지우고 다시 넣음, create or replace).
--
-- 1. adventure_zones.boss_level: 얽힌 숲부터 12줄(앞 보스의 약 3배, 화산 폭풍 100억). 평원 5,200·지옥 2만은 그대로. strength, boss_strength는 바꾸지 않는다.
-- 2. adventure_minis.level: 17줄(평원 2·지옥 4는 그대로). strength, gold, weapon, idx는 그대로라 adventure_mini_kills 처치 기록이 남는다.
-- 3. adventure_spots(몬스터 자리): 지우고 543줄로 다시 넣는다(일반 504 = 들머리·왼길·오른길 10, 보스 마당 6, 수문장 1, 중간 보스 23, 보스 15).
--    자리는 디자인 v7 맵 자료, 레벨·그림은 B-10 표. 중간 보스 번호(mini)는 그대로. 수문장은 레벨 3,780,000,000, 지역은 지금처럼 화산 폭풍(세기·드랍).
--    bonus: 지옥 들머리 경험치 방 한 자리 'exp3', 일곱 빛 맵 넷은 선 빛 구역 키. 맵 id, 이어짐 표(adventure_links 168줄), adventure_maps는 그대로다.
--    한 맵 안 일반 몬스터 그림은 56장 모두 다르다(구름 정원 6a·6l·6r에서 겹치던 하나를 디자인이 일곱 빛 그림 s0-01로 바꿈, 그 그림도 두 지역 한도 안).
-- 4. adventure_battle: 이번 판에 이긴 보스·중간 보스(run_bosses에 키)와는 싸우지 않는다('already won', BP와 마지막 전투 시각을 쓰기 전).
--    수문장도 같다(화면은 예전부터 이긴 뒤 숨김). 별 하늘 보스 둘은 키가 하나라 하나를 이기면 둘 다. 진 싸움은 다시 할 수 있다.
--    처음 잡을 때 금화 × 5, BP(보스 +5, 중간 보스 +2), 다음 지역 길 열림은 그대로다.
-- 5. adventure_battle 보스·중간 보스 무기 드랍: 일반 몬스터 드랍 식에서 0.002만 0.15로(이길 때마다 = 이제 판마다 한 번).
--    사용자 "보스 한판당 한번이니깐 드롭률을 15% 정도로 올려라.", "LUC, 장착무기의 드랍효과는 적용되야한다."(PM 전달, 중간 보스도 같음은 PM이 정함).
--    0.15 × (1 + LUC ÷ (LUC + 4L)) × 드랍 방(보스 자리는 1) × (1 + 장착 무기 드랍), 상한 없음(가장 높으면 약 52%). 일반 몬스터 식(0.002 …), 나오는 무기, 가진 수 5에서 멈춤은 그대로다.
-- 지역 첫 레벨(입구 맵 포탈 이름표)은 adventure_view가 adventure_spots의 가장 낮은 일반 몬스터 레벨로 내므로 저절로 바뀐다. 무기 고정 수치는 boss_level을 읽어 함께 커진다.
-- 진행 중인 판도 실행 순간부터 새 레벨과 판마다 한 번을 받는다(이미 이긴 보스는 그 판에서 다시 못 싸움). 최고 레벨 랭킹은 지우지 않는다.
--
-- 실행 순서: 이 SQL을 실행한 뒤 새 화면(맵 자료 v7)을 바로 배포한다. 그 사이 예전 화면(v6)은 몬스터 자리와 레벨이 서버와 맞지 않는다
-- (v6 자리 445 가운데 297곳은 서버가 'no monster', v7과 같은 칸 148곳은 화면과 다른 몬스터(새 레벨·그림)와 싸운다). 포탈 이동(이어짐 표)은 그대로 된다.
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true). strengths_same은 세기 합이 이 SQL 전과 같은지(로컬 DB에서 뽑은 값, 같은 migration)이다.
--   select
--     (select string_agg(boss_level::text, ',' order by sort) from public.adventure_zones)
--       = '5200,20000,60000,180000,550000,1600000,5000000,15000000,45000000,130000000,400000000,1200000000,3600000000,10000000000' as boss_levels,
--     (select sum(strength) = 78.2 and sum(boss_strength) = 127.8 from public.adventure_zones)
--       and (select sum(strength) = 199.8 and count(*) = 23 from public.adventure_minis) as strengths_same,
--     (select count(*) = 543 and count(*) filter (where kind = 'normal') = 504 and count(*) filter (where kind = 'gate') = 1
--        and count(*) filter (where kind = 'mini') = 23 and count(*) filter (where kind = 'boss') = 15 from public.adventure_spots) as spots_543,
--     (select sum(x * 100 + y) from public.adventure_spots) = 1924428 as v7_places,
--     exists (select 1 from public.adventure_spots where kind = 'gate' and map = 'adv_1a' and x = 78 and y = 70 and zone = 'adv_14') as gate_place,
--     not exists (select 1 from public.adventure_spots as s join public.adventure_maps as m on m.map = s.map where s.kind = 'normal'
--        group by s.map, m.idx having count(*) <> case when m.idx = 4 then 6 else 10 end) as counts_10_6,
--     not exists (select 1 from public.adventure_spots as s join public.adventure_zones as z on z.id = s.zone
--        where s.kind in ('normal', 'mini') and s.level >= z.boss_level) as boss_on_top,
--     not exists (select 1 from public.adventure_spots as s join public.adventure_zones as z on z.id = s.zone
--        where s.kind = 'boss' and s.level <> z.boss_level) as boss_spots,
--     not exists (select 1 from public.adventure_spots as s join public.adventure_maps as m on m.map = s.map where s.kind = 'boss' and m.idx <> 4) as bosses_in_yards,
--     not exists (select 1 from public.adventure_zones as z join public.adventure_zones as p on p.sort = z.sort - 1
--        where (select min(s.level) from public.adventure_spots as s where s.zone = z.id and s.kind = 'normal') <= p.boss_level) as zones_chain,
--     not exists (select 1 from public.adventure_spots as s join public.adventure_maps as m on m.map = s.map where s.kind = 'normal'
--        group by m.zone having max(s.level) filter (where m.idx = 1) >= min(s.level) filter (where m.idx in (2, 3))
--          or max(s.level) filter (where m.idx in (2, 3)) >= min(s.level) filter (where m.idx = 4)) as order_by_map,
--     not exists (select 1 from public.adventure_spots where kind = 'normal' group by map having count(*) <> count(distinct level)) as levels_differ,
--     not exists (select 1 from public.adventure_spots where kind = 'normal' group by map having count(*) <> count(distinct art)) as arts_differ,
--     not exists (select 1 from public.adventure_spots where kind = 'normal' group by art having count(distinct zone) > 2) as art_two_zones,
--     (select s.level = (select min(t.level) from public.adventure_spots as t where t.zone = 'adv_14' and t.kind = 'normal')
--        from public.adventure_spots as s where s.kind = 'gate') as gate_level,
--     (select count(*) = 23 from public.adventure_minis)
--       and not exists (select 1 from public.adventure_minis as mi
--         where (select count(*) from public.adventure_spots as s
--           where s.kind = 'mini' and s.zone = mi.zone and s.mini = mi.idx and s.level = mi.level) <> 1) as minis_match,
--     (select count(*) = 1 from public.adventure_spots where zone = 'adv_2' and bonus = 'exp3')
--       and (select s.level = (select min(t.level) from public.adventure_spots as t where t.zone = 'adv_2' and t.kind = 'normal')
--         from public.adventure_spots as s where s.zone = 'adv_2' and s.bonus = 'exp3') as exp_room,
--     not exists (select 1 from public.adventure_spots
--        where map in ('adv_5a', 'adv_5l', 'adv_5r', 'adv_5') and kind = 'normal' and bonus is null) as lights_bonus,
--     not exists (select 1 from public.adventure_spots where map in ('adv_5a', 'adv_5l', 'adv_5r', 'adv_5') and kind = 'normal'
--        group by map having count(distinct bonus) <> case when map = 'adv_5' then 5 else 7 end) as lights_spread,
--     (select count(*) from public.adventure_links) = 168 as links_same,
--     position('raise exception ''already won''' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0
--       and position('= any (a.run_bosses) then' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0 as once_per_run,
--     position('5 * coalesce(m.gold, 1)' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0
--       and position('random() < 0.002 * (1 + luc / (luc + 4 * lv)) * drop_mul' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0 as battle_kept,
--     position('random() < 0.15 * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> ''fx'' ->> ''drop'')::numeric, 0))' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0
--       and (length(pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure))
--         - length(replace(pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure), 'random() < 0.002 * (1 + luc', ''))) / length('random() < 0.002 * (1 + luc') = 1 as boss_drop_15;

-- 1. 지역 보스 레벨(세기는 그대로)
update public.adventure_zones as z set boss_level = v.boss_level
from (values
  ('adv_3', 60000),
  ('adv_4', 180000),
  ('adv_5', 550000),
  ('adv_6', 1600000),
  ('adv_7', 5000000),
  ('adv_8', 15000000),
  ('adv_9', 45000000),
  ('adv_10', 130000000),
  ('adv_11', 400000000),
  ('adv_12', 1200000000),
  ('adv_13', 3600000000),
  ('adv_14', 10000000000)
) as v (id, boss_level)
where z.id = v.id;

-- 2. 중간 보스 레벨(번호·세기·금화·무기는 그대로)
update public.adventure_minis as m set level = v.level
from (values
  ('adv_3', 1, 48300),
  ('adv_6', 1, 668000),
  ('adv_6', 2, 856000),
  ('adv_6', 3, 1100000),
  ('adv_6', 4, 1420000),
  ('adv_9', 1, 20000000),
  ('adv_9', 2, 34600000),
  ('adv_10', 1, 57900000),
  ('adv_10', 2, 99000000),
  ('adv_11', 1, 169000000),
  ('adv_11', 2, 299000000),
  ('adv_12', 1, 509000000),
  ('adv_12', 2, 875000000),
  ('adv_13', 1, 1610000000),
  ('adv_13', 2, 2610000000),
  ('adv_14', 1, 4860000000),
  ('adv_14', 2, 7640000000)
) as v (zone, idx, level)
where m.zone = v.zone and m.idx = v.idx;

-- 3. 몬스터 자리(화면 맵 자료 monsters와 같은 칸, 디자인 monster-spots.json v7 543줄)
delete from public.adventure_spots;
insert into public.adventure_spots (map, zone, x, y, kind, art, level, mini, bonus) values
  ('adv_1a', 'adv_1', 13, 10, 'normal', 's2-20', 1, null, null),
  ('adv_1a', 'adv_1', 10, 16, 'normal', 's2-11', 2, null, null),
  ('adv_1a', 'adv_1', 18, 19, 'normal', 's4-10', 3, null, null),
  ('adv_1a', 'adv_1', 29, 13, 'normal', 's0-20', 4, null, null),
  ('adv_1a', 'adv_1', 3, 40, 'normal', 's3-15', 5, null, null),
  ('adv_1a', 'adv_1', 40, 3, 'normal', 's2-03', 6, null, null),
  ('adv_1a', 'adv_1', 36, 16, 'normal', 's3-03', 7, null, null),
  ('adv_1a', 'adv_1', 42, 16, 'normal', 's3-13', 10, null, null),
  ('adv_1a', 'adv_1', 35, 70, 'normal', 's3-10', 14, null, null),
  ('adv_1a', 'adv_1', 70, 75, 'normal', 's2-12', 20, null, null),
  ('adv_1a', 'adv_14', 78, 70, 'gate', 'Gate_Hellfire_Knight_01', 3780000000, null, null),
  ('adv_1b', 'adv_1', 13, 10, 'normal', 's0-24', 28, null, null),
  ('adv_1b', 'adv_1', 15, 16, 'normal', 's2-20', 38, null, null),
  ('adv_1b', 'adv_1', 7, 25, 'normal', 's2-11', 54, null, null),
  ('adv_1b', 'adv_1', 23, 16, 'normal', 's4-10', 75, null, null),
  ('adv_1b', 'adv_1', 29, 29, 'normal', 's0-20', 100, null, null),
  ('adv_1b', 'adv_1', 36, 29, 'normal', 's3-15', 140, null, null),
  ('adv_1b', 'adv_1', 14, 54, 'normal', 's2-03', 200, null, null),
  ('adv_1b', 'adv_1', 37, 37, 'normal', 's3-03', 280, null, null),
  ('adv_1b', 'adv_1', 57, 69, 'normal', 's3-13', 390, null, null),
  ('adv_1b', 'adv_1', 71, 59, 'normal', 's3-10', 550, null, null),
  ('adv_1b', 'adv_1', 9, 70, 'mini', 's0-04', 710, 1, null),
  ('adv_1r', 'adv_1', 14, 14, 'normal', 's2-12', 33, null, null),
  ('adv_1r', 'adv_1', 31, 5, 'normal', 's0-24', 45, null, null),
  ('adv_1r', 'adv_1', 19, 23, 'normal', 's2-20', 63, null, null),
  ('adv_1r', 'adv_1', 26, 23, 'normal', 's2-11', 88, null, null),
  ('adv_1r', 'adv_1', 36, 16, 'normal', 's4-10', 120, null, null),
  ('adv_1r', 'adv_1', 36, 27, 'normal', 's0-20', 170, null, null),
  ('adv_1r', 'adv_1', 44, 21, 'normal', 's3-15', 240, null, null),
  ('adv_1r', 'adv_1', 60, 39, 'normal', 's2-03', 330, null, null),
  ('adv_1r', 'adv_1', 43, 68, 'normal', 's3-03', 460, null, null),
  ('adv_1r', 'adv_1', 71, 61, 'normal', 's3-13', 650, null, null),
  ('adv_1r', 'adv_1', 68, 7, 'mini', 's0-22', 2222, 2, null),
  ('adv_1c', 'adv_1', 10, 10, 'normal', 's3-10', 760, null, null),
  ('adv_1c', 'adv_1', 8, 44, 'normal', 's2-12', 1100, null, null),
  ('adv_1c', 'adv_1', 14, 38, 'normal', 's0-24', 1500, null, null),
  ('adv_1c', 'adv_1', 18, 45, 'normal', 's2-20', 2100, null, null),
  ('adv_1c', 'adv_1', 15, 51, 'normal', 's2-11', 2900, null, null),
  ('adv_1c', 'adv_1', 44, 8, 'normal', 's4-10', 4000, null, null),
  ('adv_1c', 'adv_1', 39, 39, 'boss', 's2-24', 5200, null, null),
  ('adv_2a', 'adv_2', 41, 39, 'normal', 's3-04', 5300, null, 'exp3'),
  ('adv_2a', 'adv_2', 16, 8, 'normal', 's2-10', 5570, null, null),
  ('adv_2a', 'adv_2', 12, 15, 'normal', 's3-14', 5840, null, null),
  ('adv_2a', 'adv_2', 13, 23, 'normal', 's3-32', 6140, null, null),
  ('adv_2a', 'adv_2', 19, 23, 'normal', 's4-02', 6450, null, null),
  ('adv_2a', 'adv_2', 13, 42, 'normal', 's3-13', 6770, null, null),
  ('adv_2a', 'adv_2', 19, 36, 'normal', 'Demon_Bloated_06', 7110, null, null),
  ('adv_2a', 'adv_2', 44, 13, 'normal', 'Demon_Obsidian_03', 7460, null, null),
  ('adv_2a', 'adv_2', 26, 36, 'normal', 'Demon_Scaled_04', 7840, null, null),
  ('adv_2a', 'adv_2', 65, 70, 'normal', 'Demon_Shadow_05', 8230, null, null),
  ('adv_2l', 'adv_2', 6, 16, 'normal', 's3-04', 8640, null, null),
  ('adv_2l', 'adv_2', 6, 64, 'mini', 's3-25', 9000, 1, null),
  ('adv_2l', 'adv_2', 24, 11, 'normal', 's2-10', 9080, null, null),
  ('adv_2l', 'adv_2', 18, 41, 'normal', 's3-14', 9530, null, null),
  ('adv_2l', 'adv_2', 10, 42, 'normal', 's3-32', 10000, null, null),
  ('adv_2l', 'adv_2', 13, 49, 'normal', 's4-02', 10500, null, null),
  ('adv_2l', 'adv_2', 57, 12, 'normal', 's3-13', 11000, null, null),
  ('adv_2l', 'adv_2', 52, 23, 'normal', 'Demon_Bloated_06', 11600, null, null),
  ('adv_2l', 'adv_2', 45, 72, 'mini', 's4-03', 12000, 2, null),
  ('adv_2l', 'adv_2', 58, 23, 'normal', 'Demon_Obsidian_03', 12200, null, null),
  ('adv_2l', 'adv_2', 55, 31, 'normal', 'Demon_Scaled_04', 12800, null, null),
  ('adv_2l', 'adv_2', 75, 64, 'normal', 'Demon_Shadow_05', 13400, null, null),
  ('adv_2r', 'adv_2', 13, 10, 'normal', 's3-04', 8860, null, null),
  ('adv_2r', 'adv_2', 10, 16, 'normal', 's2-10', 9300, null, null),
  ('adv_2r', 'adv_2', 9, 22, 'normal', 's3-14', 9770, null, null),
  ('adv_2r', 'adv_2', 22, 9, 'normal', 's3-32', 10300, null, null),
  ('adv_2r', 'adv_2', 15, 48, 'normal', 's4-02', 10800, null, null),
  ('adv_2r', 'adv_2', 10, 55, 'normal', 's3-13', 11300, null, null),
  ('adv_2r', 'adv_2', 16, 55, 'normal', 'Demon_Bloated_06', 11900, null, null),
  ('adv_2r', 'adv_2', 63, 5, 'normal', 'Demon_Obsidian_03', 12500, null, null),
  ('adv_2r', 'adv_2', 30, 72, 'normal', 'Demon_Scaled_04', 13100, null, null),
  ('adv_2r', 'adv_2', 72, 30, 'normal', 'Demon_Shadow_05', 13800, null, null),
  ('adv_2r', 'adv_2', 56, 74, 'mini', 's3-20', 15000, 3, null),
  ('adv_2r', 'adv_2', 74, 56, 'mini', 's2-14', 18000, 4, null),
  ('adv_2b', 'adv_2', 12, 33, 'normal', 's3-04', 14100, null, null),
  ('adv_2b', 'adv_2', 8, 8, 'normal', 's2-10', 14800, null, null),
  ('adv_2b', 'adv_2', 18, 33, 'normal', 's3-14', 15500, null, null),
  ('adv_2b', 'adv_2', 11, 41, 'normal', 's3-32', 16300, null, null),
  ('adv_2b', 'adv_2', 4, 55, 'normal', 's4-02', 17100, null, null),
  ('adv_2b', 'adv_2', 55, 4, 'normal', 's3-13', 18000, null, null),
  ('adv_2b', 'adv_2', 37, 37, 'boss', 's4-12', 20000, null, null),
  ('adv_3a', 'adv_3', 26, 18, 'normal', 's0-13', 21000, null, null),
  ('adv_3a', 'adv_3', 50, 22, 'normal', 's2-02', 21700, null, null),
  ('adv_3a', 'adv_3', 58, 18, 'normal', 's3-02', 22400, null, null),
  ('adv_3a', 'adv_3', 18, 58, 'normal', 'Insect_Mantis_06', 23200, null, null),
  ('adv_3a', 'adv_3', 45, 42, 'normal', 'Insect_Spider_05', 24000, null, null),
  ('adv_3a', 'adv_3', 58, 34, 'normal', 's0-20', 24800, null, null),
  ('adv_3a', 'adv_3', 51, 42, 'normal', 's2-21', 25600, null, null),
  ('adv_3a', 'adv_3', 50, 58, 'normal', 'Dragon_Chitin_04', 26500, null, null),
  ('adv_3a', 'adv_3', 58, 58, 'normal', 'Dragon_Slime_07', 27400, null, null),
  ('adv_3a', 'adv_3', 66, 66, 'normal', 'Insect_Beetle_07', 28300, null, null),
  ('adv_3l', 'adv_3', 18, 18, 'normal', 's0-13', 29200, null, null),
  ('adv_3l', 'adv_3', 18, 26, 'normal', 's2-02', 30200, null, null),
  ('adv_3l', 'adv_3', 26, 18, 'normal', 's3-02', 31200, null, null),
  ('adv_3l', 'adv_3', 18, 42, 'normal', 'Insect_Mantis_06', 32300, null, null),
  ('adv_3l', 'adv_3', 26, 38, 'normal', 'Insect_Spider_05', 33400, null, null),
  ('adv_3l', 'adv_3', 35, 32, 'normal', 's0-20', 34500, null, null),
  ('adv_3l', 'adv_3', 41, 32, 'normal', 's2-21', 35600, null, null),
  ('adv_3l', 'adv_3', 50, 30, 'normal', 'Dragon_Chitin_04', 36800, null, null),
  ('adv_3l', 'adv_3', 50, 38, 'normal', 'Dragon_Slime_07', 38100, null, null),
  ('adv_3l', 'adv_3', 62, 38, 'normal', 'Insect_Beetle_07', 39400, null, null),
  ('adv_3l', 'adv_3', 39, 39, 'mini', 's3-35', 48300, 1, null),
  ('adv_3r', 'adv_3', 18, 14, 'normal', 's0-13', 29700, null, null),
  ('adv_3r', 'adv_3', 26, 14, 'normal', 's2-02', 30700, null, null),
  ('adv_3r', 'adv_3', 22, 22, 'normal', 's3-02', 31700, null, null),
  ('adv_3r', 'adv_3', 18, 30, 'normal', 'Insect_Mantis_06', 32800, null, null),
  ('adv_3r', 'adv_3', 38, 26, 'normal', 'Insect_Spider_05', 33900, null, null),
  ('adv_3r', 'adv_3', 33, 42, 'normal', 's0-20', 35100, null, null),
  ('adv_3r', 'adv_3', 51, 21, 'normal', 's2-21', 36200, null, null),
  ('adv_3r', 'adv_3', 39, 42, 'normal', 'Dragon_Chitin_04', 37500, null, null),
  ('adv_3r', 'adv_3', 50, 46, 'normal', 'Dragon_Slime_07', 38700, null, null),
  ('adv_3r', 'adv_3', 58, 58, 'normal', 'Insect_Beetle_07', 40000, null, null),
  ('adv_3', 'adv_3', 18, 30, 'normal', 's0-13', 40700, null, null),
  ('adv_3', 'adv_3', 18, 46, 'normal', 's2-02', 42100, null, null),
  ('adv_3', 'adv_3', 14, 14, 'normal', 's3-02', 43500, null, null),
  ('adv_3', 'adv_3', 22, 14, 'normal', 'Insect_Mantis_06', 44900, null, null),
  ('adv_3', 'adv_3', 38, 18, 'normal', 'Insect_Spider_05', 46400, null, null),
  ('adv_3', 'adv_3', 46, 18, 'normal', 's0-20', 48000, null, null),
  ('adv_3', 'adv_3', 37, 37, 'boss', 's0-00', 60000, null, null),
  ('adv_4a', 'adv_4', 13, 8, 'normal', 's0-02', 63000, null, null),
  ('adv_4a', 'adv_4', 20, 8, 'normal', 's3-12', 65100, null, null),
  ('adv_4a', 'adv_4', 20, 52, 'normal', 's3-31', 67300, null, null),
  ('adv_4a', 'adv_4', 28, 58, 'normal', 's0-24', 69600, null, null),
  ('adv_4a', 'adv_4', 22, 58, 'normal', 's2-12', 71900, null, null),
  ('adv_4a', 'adv_4', 13, 52, 'normal', 'Cursed_Knight_03', 74300, null, null),
  ('adv_4a', 'adv_4', 16, 58, 'normal', 'Dragon_Ironscale_03', 76800, null, null),
  ('adv_4a', 'adv_4', 34, 71, 'normal', 'Humanoid_Berserker_04', 79400, null, null),
  ('adv_4a', 'adv_4', 75, 37, 'normal', 'Humanoid_Cursed_Archer_05', 82100, null, null),
  ('adv_4a', 'adv_4', 64, 77, 'normal', 'Humanoid_Cursed_Knight_03', 84800, null, null),
  ('adv_4l', 'adv_4', 18, 6, 'normal', 's0-02', 87700, null, null),
  ('adv_4l', 'adv_4', 27, 8, 'normal', 's3-12', 90600, null, null),
  ('adv_4l', 'adv_4', 35, 16, 'normal', 's3-31', 93700, null, null),
  ('adv_4l', 'adv_4', 43, 5, 'normal', 's0-24', 96800, null, null),
  ('adv_4l', 'adv_4', 50, 7, 'normal', 's2-12', 100000, null, null),
  ('adv_4l', 'adv_4', 47, 13, 'normal', 'Cursed_Knight_03', 103000, null, null),
  ('adv_4l', 'adv_4', 26, 61, 'normal', 'Dragon_Ironscale_03', 107000, null, null),
  ('adv_4l', 'adv_4', 17, 59, 'normal', 'Humanoid_Berserker_04', 111000, null, null),
  ('adv_4l', 'adv_4', 27, 73, 'normal', 'Humanoid_Cursed_Archer_05', 114000, null, null),
  ('adv_4l', 'adv_4', 64, 68, 'normal', 'Humanoid_Cursed_Knight_03', 118000, null, null),
  ('adv_4r', 'adv_4', 38, 2, 'normal', 's0-02', 89200, null, null),
  ('adv_4r', 'adv_4', 20, 59, 'normal', 's3-12', 92100, null, null),
  ('adv_4r', 'adv_4', 28, 56, 'normal', 's3-31', 95200, null, null),
  ('adv_4r', 'adv_4', 26, 63, 'normal', 's0-24', 98400, null, null),
  ('adv_4r', 'adv_4', 61, 23, 'normal', 's2-12', 102000, null, null),
  ('adv_4r', 'adv_4', 46, 50, 'normal', 'Cursed_Knight_03', 105000, null, null),
  ('adv_4r', 'adv_4', 69, 28, 'normal', 'Dragon_Ironscale_03', 109000, null, null),
  ('adv_4r', 'adv_4', 66, 34, 'normal', 'Humanoid_Berserker_04', 112000, null, null),
  ('adv_4r', 'adv_4', 54, 51, 'normal', 'Humanoid_Cursed_Archer_05', 116000, null, null),
  ('adv_4r', 'adv_4', 42, 71, 'normal', 'Humanoid_Cursed_Knight_03', 120000, null, null),
  ('adv_4', 'adv_4', 13, 24, 'normal', 's0-02', 122000, null, null),
  ('adv_4', 'adv_4', 19, 22, 'normal', 's3-12', 126000, null, null),
  ('adv_4', 'adv_4', 12, 12, 'normal', 's3-31', 130000, null, null),
  ('adv_4', 'adv_4', 31, 41, 'normal', 's0-24', 135000, null, null),
  ('adv_4', 'adv_4', 15, 55, 'normal', 's2-12', 139000, null, null),
  ('adv_4', 'adv_4', 55, 15, 'normal', 'Cursed_Knight_03', 144000, null, null),
  ('adv_4', 'adv_4', 46, 46, 'boss', 's2-01', 180000, null, null),
  ('adv_5a', 'adv_5', 28, 36, 'normal', 's0-01', 189000, null, 'exp15'),
  ('adv_5a', 'adv_5', 28, 44, 'normal', 's2-13', 195000, null, 'exp2'),
  ('adv_5a', 'adv_5', 36, 36, 'normal', 's3-11', 202000, null, 'foeHp'),
  ('adv_5a', 'adv_5', 28, 28, 'normal', 's3-21', 209000, null, 'drop3'),
  ('adv_5a', 'adv_5', 44, 36, 'normal', 's3-24', 216000, null, 'drop3'),
  ('adv_5a', 'adv_5', 36, 28, 'normal', 's3-34', 224000, null, 'drop2'),
  ('adv_5a', 'adv_5', 36, 44, 'normal', 's4-11', 231000, null, 'foeAtk'),
  ('adv_5a', 'adv_5', 44, 28, 'normal', 'Humanoid_Cursed_Mage_06', 239000, null, 'exp3'),
  ('adv_5a', 'adv_5', 36, 20, 'normal', 'Merfolk_Sorceress_04', 248000, null, 'exp2'),
  ('adv_5a', 'adv_5', 62, 36, 'normal', 'Undead_Lich_05', 256000, null, 'exp3'),
  ('adv_5l', 'adv_5', 36, 20, 'normal', 's0-01', 265000, null, 'exp2'),
  ('adv_5l', 'adv_5', 20, 36, 'normal', 's2-13', 274000, null, 'foeAtk'),
  ('adv_5l', 'adv_5', 9, 36, 'normal', 's3-11', 284000, null, 'exp2'),
  ('adv_5l', 'adv_5', 36, 28, 'normal', 's3-21', 293000, null, 'drop2'),
  ('adv_5l', 'adv_5', 20, 52, 'normal', 's3-24', 303000, null, 'drop3'),
  ('adv_5l', 'adv_5', 52, 20, 'normal', 's3-34', 314000, null, 'exp15'),
  ('adv_5l', 'adv_5', 36, 36, 'normal', 's4-11', 325000, null, 'foeHp'),
  ('adv_5l', 'adv_5', 62, 20, 'normal', 'Humanoid_Cursed_Mage_06', 336000, null, 'foeHp'),
  ('adv_5l', 'adv_5', 36, 52, 'normal', 'Merfolk_Sorceress_04', 347000, null, 'exp3'),
  ('adv_5l', 'adv_5', 36, 62, 'normal', 'Undead_Lich_05', 359000, null, 'drop3'),
  ('adv_5r', 'adv_5', 28, 35, 'normal', 's0-01', 270000, null, 'exp15'),
  ('adv_5r', 'adv_5', 35, 28, 'normal', 's2-13', 279000, null, 'drop2'),
  ('adv_5r', 'adv_5', 42, 28, 'normal', 's3-11', 288000, null, 'exp3'),
  ('adv_5r', 'adv_5', 28, 42, 'normal', 's3-21', 298000, null, 'exp2'),
  ('adv_5r', 'adv_5', 35, 35, 'normal', 's3-24', 309000, null, 'foeHp'),
  ('adv_5r', 'adv_5', 42, 35, 'normal', 's3-34', 319000, null, 'drop3'),
  ('adv_5r', 'adv_5', 35, 42, 'normal', 's4-11', 330000, null, 'foeAtk'),
  ('adv_5r', 'adv_5', 58, 28, 'normal', 'Humanoid_Cursed_Mage_06', 341000, null, 'foeAtk'),
  ('adv_5r', 'adv_5', 58, 42, 'normal', 'Merfolk_Sorceress_04', 353000, null, 'drop3'),
  ('adv_5r', 'adv_5', 26, 58, 'normal', 'Undead_Lich_05', 365000, null, 'foeHp'),
  ('adv_5', 'adv_5', 22, 28, 'normal', 's0-01', 372000, null, 'exp15'),
  ('adv_5', 'adv_5', 22, 22, 'normal', 's2-13', 384000, null, 'drop3'),
  ('adv_5', 'adv_5', 22, 34, 'normal', 's3-11', 398000, null, 'exp2'),
  ('adv_5', 'adv_5', 28, 22, 'normal', 's3-21', 411000, null, 'drop2'),
  ('adv_5', 'adv_5', 34, 28, 'normal', 's3-24', 425000, null, 'drop3'),
  ('adv_5', 'adv_5', 34, 22, 'normal', 's3-34', 440000, null, 'exp3'),
  ('adv_5', 'adv_5', 45, 45, 'boss', 'b2', 550000, null, null),
  ('adv_6a', 'adv_6', 16, 22, 'normal', 's0-23', 578000, null, null),
  ('adv_6a', 'adv_6', 10, 25, 'normal', 's2-21', 597000, null, null),
  ('adv_6a', 'adv_6', 13, 31, 'normal', 's3-23', 616000, null, null),
  ('adv_6a', 'adv_6', 22, 25, 'normal', 's0-11', 636000, null, null),
  ('adv_6a', 'adv_6', 7, 31, 'normal', 'Abyssal_Venom_Jellyfish_05', 656000, null, null),
  ('adv_6a', 'adv_6', 19, 31, 'normal', 'Dragon_Crystal_06', 678000, null, null),
  ('adv_6a', 'adv_6', 44, 5, 'normal', 'Insect_Dragonfly_08', 700000, null, null),
  ('adv_6a', 'adv_6', 70, 21, 'normal', 'Merfolk_Ghost_07', 722000, null, null),
  ('adv_6a', 'adv_6', 62, 62, 'normal', 'Undead_Ghost_06', 745000, null, null),
  ('adv_6a', 'adv_6', 22, 66, 'normal', 's0-01', 770000, null, null),
  ('adv_6l', 'adv_6', 7, 69, 'mini', 's0-03', 668000, 1, null),
  ('adv_6l', 'adv_6', 33, 30, 'normal', 's2-21', 794000, null, null),
  ('adv_6l', 'adv_6', 39, 30, 'normal', 's3-23', 820000, null, null),
  ('adv_6l', 'adv_6', 30, 39, 'normal', 's0-11', 847000, null, null),
  ('adv_6l', 'adv_6', 3, 39, 'mini', 's0-21', 856000, 2, null),
  ('adv_6l', 'adv_6', 36, 36, 'normal', 'Abyssal_Venom_Jellyfish_05', 874000, null, null),
  ('adv_6l', 'adv_6', 50, 5, 'normal', 'Dragon_Crystal_06', 902000, null, null),
  ('adv_6l', 'adv_6', 45, 30, 'normal', 'Insect_Dragonfly_08', 931000, null, null),
  ('adv_6l', 'adv_6', 42, 36, 'normal', 'Merfolk_Ghost_07', 961000, null, null),
  ('adv_6l', 'adv_6', 48, 36, 'normal', 'Undead_Ghost_06', 992000, null, null),
  ('adv_6l', 'adv_6', 33, 73, 'normal', 's0-23', 1020000, null, null),
  ('adv_6l', 'adv_6', 74, 41, 'normal', 's0-01', 1060000, null, null),
  ('adv_6r', 'adv_6', 23, 13, 'normal', 's3-23', 807000, null, null),
  ('adv_6r', 'adv_6', 17, 19, 'normal', 's0-11', 833000, null, null),
  ('adv_6r', 'adv_6', 23, 19, 'normal', 'Abyssal_Venom_Jellyfish_05', 860000, null, null),
  ('adv_6r', 'adv_6', 29, 16, 'normal', 'Dragon_Crystal_06', 888000, null, null),
  ('adv_6r', 'adv_6', 20, 25, 'normal', 'Insect_Dragonfly_08', 917000, null, null),
  ('adv_6r', 'adv_6', 29, 22, 'normal', 'Merfolk_Ghost_07', 946000, null, null),
  ('adv_6r', 'adv_6', 26, 28, 'normal', 'Undead_Ghost_06', 977000, null, null),
  ('adv_6r', 'adv_6', 4, 35, 'normal', 's0-23', 1010000, null, null),
  ('adv_6r', 'adv_6', 42, 4, 'normal', 's2-21', 1040000, null, null),
  ('adv_6r', 'adv_6', 38, 73, 'normal', 's0-01', 1070000, null, null),
  ('adv_6r', 'adv_6', 71, 7, 'mini', 's2-00', 1100000, 3, null),
  ('adv_6r', 'adv_6', 73, 38, 'mini', 's3-33', 1420000, 4, null),
  ('adv_6b', 'adv_6', 23, 17, 'normal', 's0-11', 1090000, null, null),
  ('adv_6b', 'adv_6', 5, 41, 'normal', 'Abyssal_Venom_Jellyfish_05', 1130000, null, null),
  ('adv_6b', 'adv_6', 29, 17, 'normal', 'Dragon_Crystal_06', 1160000, null, null),
  ('adv_6b', 'adv_6', 41, 5, 'normal', 'Insect_Dragonfly_08', 1200000, null, null),
  ('adv_6b', 'adv_6', 6, 55, 'normal', 'Merfolk_Ghost_07', 1240000, null, null),
  ('adv_6b', 'adv_6', 55, 6, 'normal', 'Undead_Ghost_06', 1280000, null, null),
  ('adv_6b', 'adv_6', 43, 43, 'boss', 'b4', 1600000, null, null),
  ('adv_7a', 'adv_7', 35, 36, 'normal', 's2-23', 1680000, null, null),
  ('adv_7a', 'adv_7', 41, 30, 'normal', 's0-12', 1740000, null, null),
  ('adv_7a', 'adv_7', 48, 5, 'normal', 's4-13', 1800000, null, null),
  ('adv_7a', 'adv_7', 47, 30, 'normal', 's2-13', 1860000, null, null),
  ('adv_7a', 'adv_7', 35, 45, 'normal', 's3-11', 1930000, null, null),
  ('adv_7a', 'adv_7', 44, 36, 'normal', 's3-21', 2000000, null, null),
  ('adv_7a', 'adv_7', 53, 36, 'normal', 's3-23', 2070000, null, null),
  ('adv_7a', 'adv_7', 49, 43, 'normal', 'Abyssal_Follower_05', 2140000, null, null),
  ('adv_7a', 'adv_7', 26, 67, 'normal', 'Abyssal_Horror_04', 2220000, null, null),
  ('adv_7a', 'adv_7', 65, 64, 'normal', 'Monster_Amorphous_07', 2300000, null, null),
  ('adv_7l', 'adv_7', 21, 15, 'normal', 's2-23', 2380000, null, null),
  ('adv_7l', 'adv_7', 28, 14, 'normal', 's0-12', 2460000, null, null),
  ('adv_7l', 'adv_7', 32, 20, 'normal', 's4-13', 2550000, null, null),
  ('adv_7l', 'adv_7', 27, 28, 'normal', 's2-13', 2640000, null, null),
  ('adv_7l', 'adv_7', 4, 43, 'normal', 's3-11', 2730000, null, null),
  ('adv_7l', 'adv_7', 55, 4, 'normal', 's3-21', 2830000, null, null),
  ('adv_7l', 'adv_7', 45, 46, 'normal', 's3-23', 2930000, null, null),
  ('adv_7l', 'adv_7', 51, 46, 'normal', 'Abyssal_Follower_05', 3030000, null, null),
  ('adv_7l', 'adv_7', 52, 53, 'normal', 'Abyssal_Horror_04', 3140000, null, null),
  ('adv_7l', 'adv_7', 21, 70, 'normal', 'Monster_Amorphous_07', 3250000, null, null),
  ('adv_7r', 'adv_7', 32, 26, 'normal', 's2-23', 2420000, null, null),
  ('adv_7r', 'adv_7', 26, 32, 'normal', 's0-12', 2500000, null, null),
  ('adv_7r', 'adv_7', 38, 26, 'normal', 's4-13', 2590000, null, null),
  ('adv_7r', 'adv_7', 26, 38, 'normal', 's2-13', 2680000, null, null),
  ('adv_7r', 'adv_7', 35, 32, 'normal', 's3-11', 2780000, null, null),
  ('adv_7r', 'adv_7', 44, 29, 'normal', 's3-21', 2880000, null, null),
  ('adv_7r', 'adv_7', 41, 35, 'normal', 's3-23', 2980000, null, null),
  ('adv_7r', 'adv_7', 7, 29, 'normal', 'Abyssal_Follower_05', 3080000, null, null),
  ('adv_7r', 'adv_7', 72, 9, 'normal', 'Abyssal_Horror_04', 3190000, null, null),
  ('adv_7r', 'adv_7', 29, 72, 'normal', 'Monster_Amorphous_07', 3310000, null, null),
  ('adv_7', 'adv_7', 4, 51, 'normal', 's2-23', 3360000, null, null),
  ('adv_7', 'adv_7', 20, 20, 'normal', 's0-12', 3480000, null, null),
  ('adv_7', 'adv_7', 26, 23, 'normal', 's4-13', 3600000, null, null),
  ('adv_7', 'adv_7', 26, 17, 'normal', 's2-13', 3730000, null, null),
  ('adv_7', 'adv_7', 40, 40, 'normal', 's3-11', 3860000, null, null),
  ('adv_7', 'adv_7', 51, 4, 'normal', 's3-21', 4000000, null, null),
  ('adv_7', 'adv_7', 32, 53, 'boss', 'b1', 5000000, null, null),
  ('adv_7', 'adv_7', 53, 32, 'boss', 'b3', 5000000, null, null),
  ('adv_8a', 'adv_8', 35, 4, 'normal', 's4-00', 5250000, null, null),
  ('adv_8a', 'adv_8', 30, 30, 'normal', 's3-00', 5430000, null, null),
  ('adv_8a', 'adv_8', 36, 27, 'normal', 's3-01', 5610000, null, null),
  ('adv_8a', 'adv_8', 27, 36, 'normal', 's0-13', 5800000, null, null),
  ('adv_8a', 'adv_8', 42, 30, 'normal', 's2-02', 5990000, null, null),
  ('adv_8a', 'adv_8', 30, 42, 'normal', 's2-20', 6190000, null, null),
  ('adv_8a', 'adv_8', 36, 42, 'normal', 's2-23', 6400000, null, null),
  ('adv_8a', 'adv_8', 71, 31, 'normal', 's3-14', 6620000, null, null),
  ('adv_8a', 'adv_8', 31, 71, 'normal', 's3-34', 6840000, null, null),
  ('adv_8a', 'adv_8', 69, 69, 'normal', 's4-02', 7070000, null, null),
  ('adv_8l', 'adv_8', 9, 6, 'normal', 's4-00', 7310000, null, null),
  ('adv_8l', 'adv_8', 6, 12, 'normal', 's3-00', 7550000, null, null),
  ('adv_8l', 'adv_8', 12, 15, 'normal', 's3-01', 7810000, null, null),
  ('adv_8l', 'adv_8', 29, 6, 'normal', 's0-13', 8070000, null, null),
  ('adv_8l', 'adv_8', 32, 12, 'normal', 's2-02', 8340000, null, null),
  ('adv_8l', 'adv_8', 35, 6, 'normal', 's2-20', 8620000, null, null),
  ('adv_8l', 'adv_8', 14, 26, 'normal', 's2-23', 8910000, null, null),
  ('adv_8l', 'adv_8', 4, 50, 'normal', 's3-14', 9210000, null, null),
  ('adv_8l', 'adv_8', 23, 72, 'normal', 's3-34', 9520000, null, null),
  ('adv_8l', 'adv_8', 74, 29, 'normal', 's4-02', 9840000, null, null),
  ('adv_8r', 'adv_8', 18, 13, 'normal', 's4-00', 7430000, null, null),
  ('adv_8r', 'adv_8', 15, 19, 'normal', 's3-00', 7680000, null, null),
  ('adv_8r', 'adv_8', 24, 13, 'normal', 's3-01', 7940000, null, null),
  ('adv_8r', 'adv_8', 30, 16, 'normal', 's0-13', 8200000, null, null),
  ('adv_8r', 'adv_8', 48, 5, 'normal', 's2-02', 8480000, null, null),
  ('adv_8r', 'adv_8', 40, 46, 'normal', 's2-20', 8770000, null, null),
  ('adv_8r', 'adv_8', 40, 53, 'normal', 's2-23', 9060000, null, null),
  ('adv_8r', 'adv_8', 49, 55, 'normal', 's3-14', 9360000, null, null),
  ('adv_8r', 'adv_8', 41, 75, 'normal', 's3-34', 9680000, null, null),
  ('adv_8r', 'adv_8', 74, 31, 'normal', 's4-02', 10000000, null, null),
  ('adv_8', 'adv_8', 13, 40, 'normal', 's4-00', 10200000, null, null),
  ('adv_8', 'adv_8', 10, 46, 'normal', 's3-00', 10500000, null, null),
  ('adv_8', 'adv_8', 4, 55, 'normal', 's3-01', 10900000, null, null),
  ('adv_8', 'adv_8', 29, 29, 'normal', 's0-13', 11200000, null, null),
  ('adv_8', 'adv_8', 40, 10, 'normal', 's2-02', 11600000, null, null),
  ('adv_8', 'adv_8', 55, 4, 'normal', 's2-20', 12000000, null, null),
  ('adv_8', 'adv_8', 40, 40, 'boss', 'b5', 15000000, null, null),
  ('adv_9a', 'adv_9', 17, 24, 'normal', 'Abyssal_Predator_01', 15800000, null, null),
  ('adv_9a', 'adv_9', 24, 22, 'normal', 'Abyssal_Anglerfish_03', 16300000, null, null),
  ('adv_9a', 'adv_9', 23, 28, 'normal', 'Abyssal_Giant_Squid_04', 16900000, null, null),
  ('adv_9a', 'adv_9', 10, 37, 'normal', 'Abyssal_Horror_04', 17400000, null, null),
  ('adv_9a', 'adv_9', 51, 40, 'normal', 'Abyssal_Follower_05', 18000000, null, null),
  ('adv_9a', 'adv_9', 45, 12, 'normal', 'Abyssal_Venom_Jellyfish_05', 18600000, null, null),
  ('adv_9a', 'adv_9', 58, 40, 'normal', 'Abyssal_Deep_Eel_06', 19300000, null, null),
  ('adv_9a', 'adv_9', 48, 69, 'normal', 'Deep_Sea_Skeleton_Warrior_06', 19900000, null, null),
  ('adv_9a', 'adv_9', 57, 33, 'normal', 'Abyssal_Giant_Isopod_07', 20600000, null, null),
  ('adv_9a', 'adv_9', 68, 43, 'normal', 'Deep_Sea_Carapace_Predator_07', 21300000, null, null),
  ('adv_9l', 'adv_9', 7, 56, 'mini', 'Abyssal_Sea_Centipede_09', 20000000, 1, null),
  ('adv_9l', 'adv_9', 24, 28, 'normal', 'Abyssal_Gulper_Viper_08', 22000000, null, null),
  ('adv_9l', 'adv_9', 32, 26, 'normal', 'Abyssal_Black_Dragon_08', 22700000, null, null),
  ('adv_9l', 'adv_9', 35, 7, 'normal', 'Abyssal_Predator_01', 23500000, null, null),
  ('adv_9l', 'adv_9', 29, 35, 'normal', 'Abyssal_Anglerfish_03', 24200000, null, null),
  ('adv_9l', 'adv_9', 42, 46, 'normal', 'Abyssal_Giant_Squid_04', 25100000, null, null),
  ('adv_9l', 'adv_9', 48, 43, 'normal', 'Abyssal_Horror_04', 25900000, null, null),
  ('adv_9l', 'adv_9', 42, 52, 'normal', 'Abyssal_Follower_05', 26800000, null, null),
  ('adv_9l', 'adv_9', 48, 49, 'normal', 'Abyssal_Venom_Jellyfish_05', 27700000, null, null),
  ('adv_9l', 'adv_9', 33, 70, 'normal', 'Abyssal_Deep_Eel_06', 28600000, null, null),
  ('adv_9l', 'adv_9', 72, 45, 'normal', 'Deep_Sea_Skeleton_Warrior_06', 29500000, null, null),
  ('adv_9r', 'adv_9', 31, 26, 'normal', 'Abyssal_Giant_Isopod_07', 22300000, null, null),
  ('adv_9r', 'adv_9', 31, 32, 'normal', 'Deep_Sea_Carapace_Predator_07', 23100000, null, null),
  ('adv_9r', 'adv_9', 47, 21, 'normal', 'Abyssal_Gulper_Viper_08', 23800000, null, null),
  ('adv_9r', 'adv_9', 40, 29, 'normal', 'Abyssal_Black_Dragon_08', 24600000, null, null),
  ('adv_9r', 'adv_9', 14, 19, 'normal', 'Abyssal_Predator_01', 25500000, null, null),
  ('adv_9r', 'adv_9', 17, 48, 'normal', 'Abyssal_Anglerfish_03', 26300000, null, null),
  ('adv_9r', 'adv_9', 11, 48, 'normal', 'Abyssal_Giant_Squid_04', 27200000, null, null),
  ('adv_9r', 'adv_9', 6, 30, 'normal', 'Abyssal_Horror_04', 28100000, null, null),
  ('adv_9r', 'adv_9', 30, 73, 'normal', 'Abyssal_Follower_05', 29100000, null, null),
  ('adv_9r', 'adv_9', 67, 47, 'normal', 'Abyssal_Venom_Jellyfish_05', 30000000, null, null),
  ('adv_9r', 'adv_9', 70, 30, 'mini', 'Abyssal_Sea_Spider_10', 34600000, 2, null),
  ('adv_9b', 'adv_9', 26, 23, 'normal', 'Abyssal_Deep_Eel_06', 30500000, null, null),
  ('adv_9b', 'adv_9', 4, 51, 'normal', 'Deep_Sea_Skeleton_Warrior_06', 31600000, null, null),
  ('adv_9b', 'adv_9', 29, 29, 'normal', 'Abyssal_Giant_Isopod_07', 32600000, null, null),
  ('adv_9b', 'adv_9', 37, 46, 'normal', 'Deep_Sea_Carapace_Predator_07', 33700000, null, null),
  ('adv_9b', 'adv_9', 46, 37, 'normal', 'Abyssal_Gulper_Viper_08', 34800000, null, null),
  ('adv_9b', 'adv_9', 51, 4, 'normal', 'Abyssal_Black_Dragon_08', 36000000, null, null),
  ('adv_9b', 'adv_9', 40, 40, 'boss', 'Abyssal_Dragon_King_08', 45000000, null, null),
  ('adv_10a', 'adv_10', 28, 27, 'normal', 'Merfolk_Warrior_03', 47300000, null, null),
  ('adv_10a', 'adv_10', 22, 40, 'normal', 'Monster_Blob_03', 48800000, null, null),
  ('adv_10a', 'adv_10', 38, 26, 'normal', 'Merfolk_Sorceress_04', 50400000, null, null),
  ('adv_10a', 'adv_10', 34, 33, 'normal', 'Monster_Fusion_Horror_04', 52000000, null, null),
  ('adv_10a', 'adv_10', 26, 46, 'normal', 'Merfolk_Snake_Maiden_05', 53700000, null, null),
  ('adv_10a', 'adv_10', 3, 49, 'normal', 'Monster_Bloater_05', 55400000, null, null),
  ('adv_10a', 'adv_10', 34, 54, 'normal', 'Merfolk_Thorn_Warden_06', 57100000, null, null),
  ('adv_10a', 'adv_10', 23, 69, 'normal', 'Monster_Serpent_06', 59000000, null, null),
  ('adv_10a', 'adv_10', 67, 48, 'normal', 'Merfolk_Ghost_07', 60900000, null, null),
  ('adv_10a', 'adv_10', 49, 67, 'normal', 'Monster_Amorphous_07', 62800000, null, null),
  ('adv_10l', 'adv_10', 5, 62, 'mini', 'Merfolk_Bone_Harpooner_09', 57900000, 1, null),
  ('adv_10l', 'adv_10', 13, 29, 'normal', 'Merfolk_Parasite_08', 64800000, null, null),
  ('adv_10l', 'adv_10', 20, 28, 'normal', 'Monster_Crab_08', 66900000, null, null),
  ('adv_10l', 'adv_10', 29, 19, 'normal', 'Monster_Octopus_09', 69000000, null, null),
  ('adv_10l', 'adv_10', 34, 4, 'normal', 'Merfolk_Warrior_03', 71300000, null, null),
  ('adv_10l', 'adv_10', 4, 40, 'normal', 'Monster_Blob_03', 73500000, null, null),
  ('adv_10l', 'adv_10', 21, 50, 'normal', 'Merfolk_Sorceress_04', 75900000, null, null),
  ('adv_10l', 'adv_10', 30, 56, 'normal', 'Monster_Fusion_Horror_04', 78300000, null, null),
  ('adv_10l', 'adv_10', 38, 51, 'normal', 'Merfolk_Snake_Maiden_05', 80800000, null, null),
  ('adv_10l', 'adv_10', 26, 76, 'normal', 'Monster_Bloater_05', 83400000, null, null),
  ('adv_10l', 'adv_10', 76, 55, 'normal', 'Merfolk_Thorn_Warden_06', 86100000, null, null),
  ('adv_10r', 'adv_10', 15, 18, 'normal', 'Monster_Serpent_06', 65900000, null, null),
  ('adv_10r', 'adv_10', 23, 13, 'normal', 'Merfolk_Ghost_07', 68000000, null, null),
  ('adv_10r', 'adv_10', 30, 15, 'normal', 'Monster_Amorphous_07', 70100000, null, null),
  ('adv_10r', 'adv_10', 4, 29, 'normal', 'Merfolk_Parasite_08', 72400000, null, null),
  ('adv_10r', 'adv_10', 23, 25, 'normal', 'Monster_Crab_08', 74700000, null, null),
  ('adv_10r', 'adv_10', 25, 40, 'normal', 'Monster_Octopus_09', 77100000, null, null),
  ('adv_10r', 'adv_10', 32, 35, 'normal', 'Merfolk_Warrior_03', 79600000, null, null),
  ('adv_10r', 'adv_10', 40, 32, 'normal', 'Monster_Blob_03', 82100000, null, null),
  ('adv_10r', 'adv_10', 50, 23, 'normal', 'Merfolk_Sorceress_04', 84700000, null, null),
  ('adv_10r', 'adv_10', 52, 50, 'normal', 'Monster_Fusion_Horror_04', 87400000, null, null),
  ('adv_10r', 'adv_10', 69, 5, 'mini', 'Monster_Eel_10', 99000000, 2, null),
  ('adv_10b', 'adv_10', 11, 17, 'normal', 'Merfolk_Snake_Maiden_05', 88800000, null, null),
  ('adv_10b', 'adv_10', 9, 8, 'normal', 'Monster_Bloater_05', 91700000, null, null),
  ('adv_10b', 'adv_10', 5, 43, 'normal', 'Merfolk_Thorn_Warden_06', 94600000, null, null),
  ('adv_10b', 'adv_10', 12, 54, 'normal', 'Monster_Serpent_06', 97600000, null, null),
  ('adv_10b', 'adv_10', 43, 5, 'normal', 'Merfolk_Ghost_07', 101000000, null, null),
  ('adv_10b', 'adv_10', 54, 12, 'normal', 'Monster_Amorphous_07', 104000000, null, null),
  ('adv_10b', 'adv_10', 41, 41, 'boss', 'Merfolk_Queen_10', 130000000, null, null),
  ('adv_11a', 'adv_11', 42, 5, 'normal', 'Insect_Centipede_03', 137000000, null, null),
  ('adv_11a', 'adv_11', 18, 42, 'normal', 'Undead_Skeleton_Warrior_03', 142000000, null, null),
  ('adv_11a', 'adv_11', 21, 50, 'normal', 'Insect_Scorpion_04', 147000000, null, null),
  ('adv_11a', 'adv_11', 53, 62, 'normal', 'Undead_Zombie_04', 152000000, null, null),
  ('adv_11a', 'adv_11', 62, 56, 'normal', 'Insect_Spider_05', 157000000, null, null),
  ('adv_11a', 'adv_11', 72, 54, 'normal', 'Undead_Lich_05', 162000000, null, null),
  ('adv_11a', 'adv_11', 61, 66, 'normal', 'Venom_Stinger_Behemoth_05', 168000000, null, null),
  ('adv_11a', 'adv_11', 46, 76, 'normal', 'Insect_Mantis_06', 174000000, null, null),
  ('adv_11a', 'adv_11', 76, 46, 'normal', 'Undead_Ghost_06', 180000000, null, null),
  ('adv_11a', 'adv_11', 32, 73, 'normal', 'Insect_Beetle_07', 186000000, null, null),
  ('adv_11l', 'adv_11', 16, 59, 'mini', 'Undead_Ghoul_09', 169000000, 1, null),
  ('adv_11l', 'adv_11', 27, 10, 'normal', 'Undead_Vampire_07', 192000000, null, null),
  ('adv_11l', 'adv_11', 35, 31, 'normal', 'Insect_Dragonfly_08', 199000000, null, null),
  ('adv_11l', 'adv_11', 30, 37, 'normal', 'Undead_Mummy_08', 206000000, null, null),
  ('adv_11l', 'adv_11', 4, 44, 'normal', 'Insect_Crab_Spider_09', 213000000, null, null),
  ('adv_11l', 'adv_11', 37, 51, 'normal', 'Insect_Centipede_03', 220000000, null, null),
  ('adv_11l', 'adv_11', 55, 34, 'normal', 'Undead_Skeleton_Warrior_03', 228000000, null, null),
  ('adv_11l', 'adv_11', 54, 42, 'normal', 'Insect_Scorpion_04', 236000000, null, null),
  ('adv_11l', 'adv_11', 39, 65, 'normal', 'Undead_Zombie_04', 244000000, null, null),
  ('adv_11l', 'adv_11', 68, 37, 'normal', 'Insect_Spider_05', 252000000, null, null),
  ('adv_11l', 'adv_11', 55, 50, 'normal', 'Undead_Lich_05', 261000000, null, null),
  ('adv_11r', 'adv_11', 13, 37, 'normal', 'Venom_Stinger_Behemoth_05', 196000000, null, null),
  ('adv_11r', 'adv_11', 30, 11, 'normal', 'Insect_Mantis_06', 202000000, null, null),
  ('adv_11r', 'adv_11', 49, 18, 'normal', 'Undead_Ghost_06', 209000000, null, null),
  ('adv_11r', 'adv_11', 52, 27, 'normal', 'Insect_Beetle_07', 217000000, null, null),
  ('adv_11r', 'adv_11', 31, 57, 'normal', 'Undead_Vampire_07', 224000000, null, null),
  ('adv_11r', 'adv_11', 51, 5, 'normal', 'Insect_Dragonfly_08', 232000000, null, null),
  ('adv_11r', 'adv_11', 56, 56, 'normal', 'Undead_Mummy_08', 240000000, null, null),
  ('adv_11r', 'adv_11', 73, 49, 'normal', 'Insect_Crab_Spider_09', 248000000, null, null),
  ('adv_11r', 'adv_11', 65, 59, 'normal', 'Insect_Centipede_03', 257000000, null, null),
  ('adv_11r', 'adv_11', 60, 66, 'normal', 'Undead_Skeleton_Warrior_03', 266000000, null, null),
  ('adv_11r', 'adv_11', 40, 70, 'mini', 'Insect_Larva_10', 299000000, 2, null),
  ('adv_11b', 'adv_11', 15, 28, 'normal', 'Insect_Scorpion_04', 270000000, null, null),
  ('adv_11b', 'adv_11', 23, 29, 'normal', 'Undead_Zombie_04', 279000000, null, null),
  ('adv_11b', 'adv_11', 30, 24, 'normal', 'Insect_Spider_05', 289000000, null, null),
  ('adv_11b', 'adv_11', 4, 4, 'normal', 'Undead_Lich_05', 299000000, null, null),
  ('adv_11b', 'adv_11', 23, 41, 'normal', 'Venom_Stinger_Behemoth_05', 309000000, null, null),
  ('adv_11b', 'adv_11', 42, 22, 'normal', 'Insect_Mantis_06', 320000000, null, null),
  ('adv_11b', 'adv_11', 42, 42, 'boss', 'Undead_Wraith_10', 400000000, null, null),
  ('adv_12a', 'adv_12', 24, 24, 'normal', 'Cursed_Siren_02', 420000000, null, null),
  ('adv_12a', 'adv_12', 34, 4, 'normal', 'Cursed_Knight_03', 434000000, null, null),
  ('adv_12a', 'adv_12', 30, 24, 'normal', 'Humanoid_Cursed_Knight_03', 449000000, null, null),
  ('adv_12a', 'adv_12', 36, 24, 'normal', 'Skeleton_Lord_03', 464000000, null, null),
  ('adv_12a', 'adv_12', 42, 24, 'normal', 'Humanoid_Berserker_04', 479000000, null, null),
  ('adv_12a', 'adv_12', 36, 30, 'normal', 'Cursed_Wraith_04', 496000000, null, null),
  ('adv_12a', 'adv_12', 42, 30, 'normal', 'Humanoid_Cursed_Archer_05', 512000000, null, null),
  ('adv_12a', 'adv_12', 69, 45, 'normal', 'Humanoid_Cursed_Mage_06', 529000000, null, null),
  ('adv_12a', 'adv_12', 45, 69, 'normal', 'Humanoid_Gladiator_07', 547000000, null, null),
  ('adv_12a', 'adv_12', 68, 68, 'normal', 'Undead_Vampire_07', 566000000, null, null),
  ('adv_12l', 'adv_12', 7, 54, 'mini', 'Humanoid_Assassin_08', 509000000, 1, null),
  ('adv_12l', 'adv_12', 44, 24, 'normal', 'Cursed_Siren_02', 585000000, null, null),
  ('adv_12l', 'adv_12', 9, 38, 'normal', 'Cursed_Knight_03', 604000000, null, null),
  ('adv_12l', 'adv_12', 38, 9, 'normal', 'Humanoid_Cursed_Knight_03', 625000000, null, null),
  ('adv_12l', 'adv_12', 43, 30, 'normal', 'Skeleton_Lord_03', 646000000, null, null),
  ('adv_12l', 'adv_12', 52, 32, 'normal', 'Humanoid_Berserker_04', 667000000, null, null),
  ('adv_12l', 'adv_12', 52, 44, 'normal', 'Cursed_Wraith_04', 690000000, null, null),
  ('adv_12l', 'adv_12', 44, 52, 'normal', 'Humanoid_Cursed_Archer_05', 713000000, null, null),
  ('adv_12l', 'adv_12', 67, 38, 'normal', 'Humanoid_Cursed_Mage_06', 737000000, null, null),
  ('adv_12l', 'adv_12', 38, 67, 'normal', 'Humanoid_Gladiator_07', 762000000, null, null),
  ('adv_12l', 'adv_12', 56, 52, 'normal', 'Undead_Vampire_07', 787000000, null, null),
  ('adv_12r', 'adv_12', 10, 29, 'normal', 'Cursed_Siren_02', 594000000, null, null),
  ('adv_12r', 'adv_12', 29, 10, 'normal', 'Cursed_Knight_03', 614000000, null, null),
  ('adv_12r', 'adv_12', 17, 29, 'normal', 'Humanoid_Cursed_Knight_03', 635000000, null, null),
  ('adv_12r', 'adv_12', 29, 17, 'normal', 'Skeleton_Lord_03', 656000000, null, null),
  ('adv_12r', 'adv_12', 10, 36, 'normal', 'Humanoid_Berserker_04', 678000000, null, null),
  ('adv_12r', 'adv_12', 36, 10, 'normal', 'Cursed_Wraith_04', 701000000, null, null),
  ('adv_12r', 'adv_12', 2, 33, 'normal', 'Humanoid_Cursed_Archer_05', 725000000, null, null),
  ('adv_12r', 'adv_12', 33, 2, 'normal', 'Humanoid_Cursed_Mage_06', 749000000, null, null),
  ('adv_12r', 'adv_12', 64, 33, 'normal', 'Humanoid_Gladiator_07', 774000000, null, null),
  ('adv_12r', 'adv_12', 33, 64, 'normal', 'Undead_Vampire_07', 800000000, null, null),
  ('adv_12r', 'adv_12', 54, 12, 'mini', 'Humanoid_Cursed_Paladin_09', 875000000, 2, null),
  ('adv_12b', 'adv_12', 2, 2, 'normal', 'Cursed_Siren_02', 814000000, null, null),
  ('adv_12b', 'adv_12', 42, 32, 'normal', 'Cursed_Knight_03', 841000000, null, null),
  ('adv_12b', 'adv_12', 48, 32, 'normal', 'Humanoid_Cursed_Knight_03', 869000000, null, null),
  ('adv_12b', 'adv_12', 23, 51, 'normal', 'Skeleton_Lord_03', 899000000, null, null),
  ('adv_12b', 'adv_12', 54, 32, 'normal', 'Humanoid_Berserker_04', 929000000, null, null),
  ('adv_12b', 'adv_12', 51, 23, 'normal', 'Cursed_Wraith_04', 960000000, null, null),
  ('adv_12b', 'adv_12', 42, 42, 'boss', 'Humanoid_Berserker_10', 1200000000, null, null),
  ('adv_13a', 'adv_13', 27, 27, 'normal', 'Dragon_Ironscale_03', 1260000000, null, null),
  ('adv_13a', 'adv_13', 36, 30, 'normal', 'Dragon_Chitin_04', 1300000000, null, null),
  ('adv_13a', 'adv_13', 30, 36, 'normal', 'Dragon_Bone_05', 1350000000, null, null),
  ('adv_13a', 'adv_13', 36, 36, 'normal', 'Dragon_Crystal_06', 1390000000, null, null),
  ('adv_13a', 'adv_13', 39, 44, 'normal', 'Dragon_Slime_07', 1440000000, null, null),
  ('adv_13a', 'adv_13', 12, 70, 'normal', 'Blackiron_Dragon_07', 1490000000, null, null),
  ('adv_13a', 'adv_13', 70, 12, 'normal', 'Abyssal_Black_Dragon_08', 1540000000, null, null),
  ('adv_13a', 'adv_13', 61, 60, 'normal', 's3-01', 1590000000, null, null),
  ('adv_13a', 'adv_13', 47, 74, 'normal', 's3-24', 1640000000, null, null),
  ('adv_13a', 'adv_13', 74, 47, 'normal', 's4-13', 1700000000, null, null),
  ('adv_13l', 'adv_13', 15, 58, 'mini', 'Dragon_Shadow_08', 1610000000, 1, null),
  ('adv_13l', 'adv_13', 47, 9, 'normal', 'Dragon_Ironscale_03', 1750000000, null, null),
  ('adv_13l', 'adv_13', 55, 12, 'normal', 'Dragon_Chitin_04', 1810000000, null, null),
  ('adv_13l', 'adv_13', 47, 34, 'normal', 'Dragon_Bone_05', 1870000000, null, null),
  ('adv_13l', 'adv_13', 25, 24, 'normal', 'Dragon_Crystal_06', 1940000000, null, null),
  ('adv_13l', 'adv_13', 18, 30, 'normal', 'Dragon_Slime_07', 2000000000, null, null),
  ('adv_13l', 'adv_13', 67, 37, 'normal', 'Blackiron_Dragon_07', 2070000000, null, null),
  ('adv_13l', 'adv_13', 62, 47, 'normal', 'Abyssal_Black_Dragon_08', 2140000000, null, null),
  ('adv_13l', 'adv_13', 8, 37, 'normal', 's3-01', 2210000000, null, null),
  ('adv_13l', 'adv_13', 60, 54, 'normal', 's3-24', 2280000000, null, null),
  ('adv_13l', 'adv_13', 65, 65, 'normal', 's4-13', 2360000000, null, null),
  ('adv_13r', 'adv_13', 9, 12, 'normal', 'Dragon_Ironscale_03', 1780000000, null, null),
  ('adv_13r', 'adv_13', 12, 6, 'normal', 'Dragon_Chitin_04', 1840000000, null, null),
  ('adv_13r', 'adv_13', 67, 27, 'normal', 'Dragon_Bone_05', 1900000000, null, null),
  ('adv_13r', 'adv_13', 4, 27, 'normal', 'Dragon_Crystal_06', 1970000000, null, null),
  ('adv_13r', 'adv_13', 6, 60, 'normal', 'Dragon_Slime_07', 2040000000, null, null),
  ('adv_13r', 'adv_13', 12, 66, 'normal', 'Blackiron_Dragon_07', 2100000000, null, null),
  ('adv_13r', 'adv_13', 27, 67, 'normal', 'Abyssal_Black_Dragon_08', 2170000000, null, null),
  ('adv_13r', 'adv_13', 54, 61, 'normal', 's3-01', 2250000000, null, null),
  ('adv_13r', 'adv_13', 60, 54, 'normal', 's3-24', 2320000000, null, null),
  ('adv_13r', 'adv_13', 66, 60, 'normal', 's4-13', 2400000000, null, null),
  ('adv_13r', 'adv_13', 62, 9, 'mini', 'Dragon_Blood_09', 2610000000, 2, null),
  ('adv_13b', 'adv_13', 19, 31, 'normal', 'Dragon_Ironscale_03', 2440000000, null, null),
  ('adv_13b', 'adv_13', 4, 4, 'normal', 'Dragon_Chitin_04', 2520000000, null, null),
  ('adv_13b', 'adv_13', 18, 38, 'normal', 'Dragon_Bone_05', 2610000000, null, null),
  ('adv_13b', 'adv_13', 13, 58, 'normal', 'Dragon_Crystal_06', 2700000000, null, null),
  ('adv_13b', 'adv_13', 33, 13, 'normal', 'Dragon_Slime_07', 2790000000, null, null),
  ('adv_13b', 'adv_13', 58, 13, 'normal', 'Blackiron_Dragon_07', 2880000000, null, null),
  ('adv_13b', 'adv_13', 34, 34, 'boss', 'Dragon_King_10', 3600000000, null, null),
  ('adv_14a', 'adv_14', 40, 21, 'normal', 'Hellfire_Knight_01', 3780000000, null, null),
  ('adv_14a', 'adv_14', 36, 12, 'normal', 'Demon_Obsidian_03', 3900000000, null, null),
  ('adv_14a', 'adv_14', 31, 40, 'normal', 'Demon_Scaled_04', 4010000000, null, null),
  ('adv_14a', 'adv_14', 39, 32, 'normal', 'Demon_Shadow_05', 4140000000, null, null),
  ('adv_14a', 'adv_14', 37, 6, 'normal', 'Demon_Bloated_06', 4260000000, null, null),
  ('adv_14a', 'adv_14', 46, 55, 'normal', 'Demon_Warlord_07', 4390000000, null, null),
  ('adv_14a', 'adv_14', 52, 51, 'normal', 'Blackiron_Dragon_07', 4530000000, null, null),
  ('adv_14a', 'adv_14', 38, 72, 'normal', 's2-10', 4660000000, null, null),
  ('adv_14a', 'adv_14', 67, 49, 'normal', 's3-04', 4800000000, null, null),
  ('adv_14a', 'adv_14', 67, 69, 'normal', 's3-32', 4950000000, null, null),
  ('adv_14l', 'adv_14', 6, 60, 'mini', 'Demon_Sorcerer_08', 4860000000, 1, null),
  ('adv_14l', 'adv_14', 18, 24, 'normal', 'Hellfire_Knight_01', 5100000000, null, null),
  ('adv_14l', 'adv_14', 26, 22, 'normal', 'Demon_Obsidian_03', 5260000000, null, null),
  ('adv_14l', 'adv_14', 30, 30, 'normal', 'Demon_Scaled_04', 5420000000, null, null),
  ('adv_14l', 'adv_14', 42, 3, 'normal', 'Demon_Shadow_05', 5580000000, null, null),
  ('adv_14l', 'adv_14', 2, 35, 'normal', 'Demon_Bloated_06', 5750000000, null, null),
  ('adv_14l', 'adv_14', 38, 35, 'normal', 'Demon_Warlord_07', 5930000000, null, null),
  ('adv_14l', 'adv_14', 47, 41, 'normal', 'Blackiron_Dragon_07', 6110000000, null, null),
  ('adv_14l', 'adv_14', 28, 67, 'normal', 's2-10', 6290000000, null, null),
  ('adv_14l', 'adv_14', 49, 50, 'normal', 's3-04', 6490000000, null, null),
  ('adv_14l', 'adv_14', 65, 40, 'normal', 's3-32', 6680000000, null, null),
  ('adv_14r', 'adv_14', 12, 32, 'normal', 'Hellfire_Knight_01', 5180000000, null, null),
  ('adv_14r', 'adv_14', 43, 12, 'normal', 'Demon_Obsidian_03', 5340000000, null, null),
  ('adv_14r', 'adv_14', 48, 18, 'normal', 'Demon_Scaled_04', 5500000000, null, null),
  ('adv_14r', 'adv_14', 53, 8, 'normal', 'Demon_Shadow_05', 5670000000, null, null),
  ('adv_14r', 'adv_14', 39, 40, 'normal', 'Demon_Bloated_06', 5840000000, null, null),
  ('adv_14r', 'adv_14', 71, 48, 'normal', 'Demon_Warlord_07', 6020000000, null, null),
  ('adv_14r', 'adv_14', 36, 66, 'normal', 'Blackiron_Dragon_07', 6200000000, null, null),
  ('adv_14r', 'adv_14', 37, 72, 'normal', 's2-10', 6390000000, null, null),
  ('adv_14r', 'adv_14', 30, 66, 'normal', 's3-04', 6580000000, null, null),
  ('adv_14r', 'adv_14', 30, 73, 'normal', 's3-32', 6780000000, null, null),
  ('adv_14r', 'adv_14', 58, 23, 'mini', 'Demon_Berserker_09', 7640000000, 2, null),
  ('adv_14b', 'adv_14', 4, 4, 'normal', 'Hellfire_Knight_01', 6890000000, null, null),
  ('adv_14b', 'adv_14', 13, 57, 'normal', 'Demon_Obsidian_03', 7100000000, null, null),
  ('adv_14b', 'adv_14', 48, 18, 'normal', 'Demon_Scaled_04', 7310000000, null, null),
  ('adv_14b', 'adv_14', 48, 24, 'normal', 'Demon_Shadow_05', 7530000000, null, null),
  ('adv_14b', 'adv_14', 57, 13, 'normal', 'Demon_Bloated_06', 7760000000, null, null),
  ('adv_14b', 'adv_14', 57, 57, 'normal', 'Demon_Warlord_07', 8000000000, null, null),
  ('adv_14b', 'adv_14', 36, 36, 'boss', 'Demon_King_10', 10000000000, null, null);

-- 4·5. 전투: 보스·중간 보스 판마다 한 번, 보스·중간 보스 무기 드랍 0.15
-- 전투 하나. 20261121000000_adventure_boss_drop.sql의 것에 판마다 한 번(이번 판에 이긴 보스·중간 보스·수문장과는 싸우지 않음, 위 4번)과 보스·중간 보스 무기 드랍 0.15(위 5번)만 바꿨다.
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
  -- 몬스터 체력 × 2, 공격 × 1.5(2026-11-20 사용자 "공격 1.5, 체력 *2 로", 보통·중간 보스·보스·수문장 모두). 지역 세기는 그대로 두고 여기서 곱한다(에이전트가 정함).
  m_hp := d * (30 + 10 * lv) * hp_mul * 2;
  m_atk := d * (5 + 1.5 * lv) * atk_mul * 1.5;

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
    gain := round(10 * (lv + 3) ^ 2 * case when is_boss or is_mini then 3 else 1 end
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
      if random() < 0.15 * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
        if is_boss then
          select w.id into dropped from public.adventure_weapons as w where w.zone = z.id and w.boss order by w.id limit 1;
        else
          dropped := m.weapon;
        end if;
      end if;
    elsif random() < 0.002 * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
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

revoke execute on function public.adventure_battle(text, integer, integer) from public, anon;
grant execute on function public.adventure_battle(text, integer, integer) to authenticated;

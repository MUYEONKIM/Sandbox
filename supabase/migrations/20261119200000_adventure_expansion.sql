-- 모험 새 지역 여섯(A안), 높은 지역 포탈, 장신구·보석·무기 흡혈, AGI·세기(2026-11-19, 기획 dungeon-rework.md 19장 '새 지역 여섯(A안)', 17장 'AGI와 장신구 조정의 안').
-- 실제 DB에 들어간 앞 migration은 고치지 않고 바뀐 행과 함수만 둔다. 다시 실행해도 된다(insert … on conflict, update, create or replace).
-- 행은 공유 노트 code-adventure-tools/expansion-rows.cjs가 디자인 세션 맵 자료 4판(adv-maps.json)에서, 이 파일은 make-expansion.cjs가 만든다.
--
-- 1. 지역 여섯(adv_9 심연 골짜기 ~ adv_14 화산 폭풍), 맵 열두 장(adv_9a ~ adv_14b), 몬스터 78(보스 6, 중간 보스 12, 보통 60), 중간 보스 12, 무기 18(★4 중간 보스 무기 둘, ★5 보스 무기 하나씩).
--    사용자가 정함: "A: 새 지역 6곳 (추천)", 레벨·세기·역할 "이대로 (추천)", 무기 "보스·중간 보스 무기만 (추천)". 무기 이름은 빈 글자(화면에 이름을 쓰지 않음).
-- 2. 높은 지역 포탈(사용자 "화산 폭풍 (추천)", "늘 열림 (추천)", 출발은 평원 1): adventure_move가 adv_1a → adv_14a, adv_14a → adv_gate를 늘 받는다.
--    adventure_battle은 화산 폭풍에서 앞 지역(용의 둥지) 보스 기록을 보지 않는다(그래야 포탈로 간 판이 싸울 수 있음, 에이전트가 정함).
-- 3. AGI(사용자 "agi 의 효과를 줄이고 세기는 5%만 낮춘다."): 콤보·크리티컬 식의 몬스터 레벨 × 2 → × 4(adventure_battle).
-- 4. 세기(같은 말, 기획 11장 표): 지금 지역 여덟과 중간 보스를 무기 흡혈을 뺀 값 × 0.95로(평원 보통 1·평원 중간 보스 3은 그대로). 새 지역은 기획 표 값.
-- 5. 장신구(사용자 "이대로 (추천)"): 흡혈 1% / 2%, 연타 +5%p·상한 55% / 60%, 날카로운 × 2.25 / × 2.5, 버팀 50%. 배움의 보석·금화 주머니는 그대로.
-- 6. 보석(사용자 "보석은 %로 하지않고, 절대값으로 한다."): 그 스텟 고정 포인트 1단계 1,500 · 2단계 3,000 · 3단계 20,000 · 4단계 40,000 · 5단계 80,000 · 6단계 750,000.
--    adventure_power가 % 합에서 빼고 판 포인트·마을 스텟 × 10·무기 고정 수치와 같은 괄호에 더한다. 몰아 끼기는 막지 않는다.
-- 7. 무기 흡혈 뺌(사용자 "무기에서 흡혈은 뺀다."): HP 무기의 장착 효과(흡혈)를 없앤다. HP 몫과 고정 수치는 그대로.
-- 8. '지역 무기 다 모음 +5%'는 지역 여덟만 센다(기획 10장, adventure_power).
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true):
--   select (select count(*) from public.adventure_zones) = 14 as zones,
--     (select count(*) from public.adventure_maps) = 25 as maps,
--     (select count(*) from public.adventure_spots) = 137 as spots,
--     (select count(*) from public.adventure_minis) = 23 as minis,
--     (select count(*) from public.adventure_weapons) = 234 as weapons,
--     (select count(*) from public.adventure_weapons where stat = 'hp' and equip_fx is not null) = 0 as no_weapon_leech,
--     (select array_agg(strength order by sort) from public.adventure_zones) = array[1, 3.9, 5.5, 5.9, 5.9, 5.7, 5.9, 5.8, 5.8, 6.2, 6.3, 6.5, 6.8, 7]::numeric[] as strengths,
--     (select array_agg(boss_strength order by sort) from public.adventure_zones) = array[6.4, 7.5, 8.9, 8.5, 9.2, 9.1, 8.6, 9.3, 9.8, 9.3, 9.8, 9.7, 11.1, 10.6]::numeric[] as boss_strengths,
--     (select array_agg(strength order by zone, idx) from public.adventure_minis where zone in ('adv_2', 'adv_3', 'adv_6')) = array[6.1, 7.5, 7.4, 7.4, 9, 9, 8.7, 8.9, 9.2]::numeric[] as mini_strengths,
--     (select array_agg(value order by tier) from public.adventure_items where kind = 'gem' and stat = 'atk') = array[1500, 3000, 20000, 40000, 80000, 750000]::numeric[] as gem_points,
--     (select array_agg(array[value, coalesce(value2, -1)] order by id) from public.adventure_items where kind in ('combo', 'sharp', 'leech', 'endure'))
--       = array[[0.05, 0.55], [0.05, 0.6], [0.5, 0], [0.01, -1], [0.02, -1], [2.25, -1], [2.5, -1]]::numeric[] as items,
--     position('lv * 4' in pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure)) > 0 as agi_x4,
--     position('adv_14a' in pg_get_functiondef('public.adventure_move(text)'::regprocedure)) > 0 as jump_portal,
--     position('f_atk + g_atk' in pg_get_functiondef('public.adventure_power(uuid)'::regprocedure)) > 0 as gem_flat;

-- ───────── 1. 지역 여섯, 지금 지역 세기 ─────────

insert into public.adventure_zones (id, name, sort, map, strength, boss_level, boss_strength, unlock_after) values
  ('adv_9', '심연 골짜기', 9, 'adv_9a', 5.8, 800000, 9.8, 'adv_8'),
  ('adv_10', '유령 늪', 10, 'adv_10a', 6.2, 1400000, 9.3, 'adv_9'),
  ('adv_11', '뼈 사막', 11, 'adv_11a', 6.3, 2400000, 9.8, 'adv_10'),
  ('adv_12', '저주받은 성', 12, 'adv_12a', 6.5, 3800000, 9.7, 'adv_11'),
  ('adv_13', '용의 둥지', 13, 'adv_13a', 6.8, 6000000, 11.1, 'adv_12'),
  ('adv_14', '화산 폭풍', 14, 'adv_14a', 7, 10000000, 10.6, 'adv_13')
on conflict (id) do update set
  name = excluded.name, sort = excluded.sort, map = excluded.map, strength = excluded.strength,
  boss_level = excluded.boss_level, boss_strength = excluded.boss_strength, unlock_after = excluded.unlock_after;

-- 지금 지역 여덟: 무기 흡혈을 뺀 값 × 0.95(기획 11장 표, 17장 'AGI와 장신구 조정의 안' 7). 평원 보통 1은 그대로.
update public.adventure_zones as z set strength = v.strength, boss_strength = v.boss_strength
from (values
  ('adv_1', 1, 6.4),
  ('adv_2', 3.9, 7.5),
  ('adv_3', 5.5, 8.9),
  ('adv_4', 5.9, 8.5),
  ('adv_5', 5.9, 9.2),
  ('adv_6', 5.7, 9.1),
  ('adv_7', 5.9, 8.6),
  ('adv_8', 5.8, 9.3)
) as v (id, strength, boss_strength)
where z.id = v.id;

-- ───────── 2. 맵 열두 장 ─────────

insert into public.adventure_maps (map, zone, idx) values
  ('adv_9a', 'adv_9', 1),
  ('adv_9b', 'adv_9', 2),
  ('adv_10a', 'adv_10', 1),
  ('adv_10b', 'adv_10', 2),
  ('adv_11a', 'adv_11', 1),
  ('adv_11b', 'adv_11', 2),
  ('adv_12a', 'adv_12', 1),
  ('adv_12b', 'adv_12', 2),
  ('adv_13a', 'adv_13', 1),
  ('adv_13b', 'adv_13', 2),
  ('adv_14a', 'adv_14', 1),
  ('adv_14b', 'adv_14', 2)
on conflict (map) do update set zone = excluded.zone, idx = excluded.idx;

-- ───────── 3. 무기 18종, 무기 흡혈 뺌 ─────────

-- 그림은 public/sprites/adventure/adv-weapons.png의 칸 216~233(디자인 세션이 지금 그림의 색을 바꿈, adv-weapons-new.json). 지역마다 중간 보스 1, 중간 보스 2, 보스.
insert into public.adventure_weapons (id, name, art, star, stat, zone, boss) values
  ('adv_9-mid1', '', '216', 4, 'atk', 'adv_9', false),
  ('adv_9-mid2', '', '217', 4, 'def', 'adv_9', false),
  ('adv_9-boss', '', '218', 5, 'hp', 'adv_9', true),
  ('adv_10-mid1', '', '219', 4, 'luc', 'adv_10', false),
  ('adv_10-mid2', '', '220', 4, 'hp', 'adv_10', false),
  ('adv_10-boss', '', '221', 5, 'agi', 'adv_10', true),
  ('adv_11-mid1', '', '222', 4, 'agi', 'adv_11', false),
  ('adv_11-mid2', '', '223', 4, 'atk', 'adv_11', false),
  ('adv_11-boss', '', '224', 5, 'def', 'adv_11', true),
  ('adv_12-mid1', '', '225', 4, 'def', 'adv_12', false),
  ('adv_12-mid2', '', '226', 4, 'hp', 'adv_12', false),
  ('adv_12-boss', '', '227', 5, 'atk', 'adv_12', true),
  ('adv_13-mid1', '', '228', 4, 'atk', 'adv_13', false),
  ('adv_13-mid2', '', '229', 4, 'agi', 'adv_13', false),
  ('adv_13-boss', '', '230', 5, 'hp', 'adv_13', true),
  ('adv_14-mid1', '', '231', 4, 'luc', 'adv_14', false),
  ('adv_14-mid2', '', '232', 4, 'def', 'adv_14', false),
  ('adv_14-boss', '', '233', 5, 'atk', 'adv_14', true)
on conflict (id) do update set
  name = excluded.name, art = excluded.art, star = excluded.star, stat = excluded.stat, zone = excluded.zone, boss = excluded.boss;

-- 새 무기 장착 효과: 지금 식(★ × 0.05, ★4 이상 특수 효과, 20261117000000_adventure.sql). HP 무기는 흡혈이 없다(아래).
update public.adventure_weapons set
  equip_pct = star * 0.05,
  equip_fx = case when star >= 4 or boss then
    case stat when 'atk' then 'crit' when 'agi' then 'combo' when 'def' then 'guard' when 'luc' then 'drop' end
  end,
  equip_fx_value = case when (star < 4 and not boss) or stat = 'hp' then 0
    else case when stat in ('atk', 'luc') then 0.25 else 0.05 end * case when boss then 3 else star - 3 end
  end
where zone in ('adv_9', 'adv_10', 'adv_11', 'adv_12', 'adv_13', 'adv_14');

-- 무기 흡혈 뺌(2026-11-19 사용자 "무기에서 흡혈은 뺀다."): HP 무기 모두
update public.adventure_weapons set equip_fx = null, equip_fx_value = 0 where stat = 'hp';

-- ───────── 4. 중간 보스 12, 지금 중간 보스 세기 ─────────

-- 이름은 맵 자료의 방 이름(화면이 몬스터 칸의 방 이름으로 찾음). 번호 1은 맵 a, 2는 맵 b. 무기는 그 지역 ★4.
insert into public.adventure_minis (zone, idx, name, level, strength, gold, weapon) values
  ('adv_9', 1, '물 굴', 530000, 9.6, 1, 'adv_9-mid1'),
  ('adv_9', 2, '옛 우물', 700000, 9.9, 1, 'adv_9-mid2'),
  ('adv_10', 1, '갈대 섬', 930000, 9.7, 1, 'adv_10-mid1'),
  ('adv_10', 2, '검은 물가', 1220000, 9.4, 1, 'adv_10-mid2'),
  ('adv_11', 1, '모래 구덩이', 1620000, 9.4, 1, 'adv_11-mid1'),
  ('adv_11', 2, '납골당', 2100000, 9.3, 1, 'adv_11-mid2'),
  ('adv_12', 1, '감시탑', 2700000, 9.7, 1, 'adv_12-mid1'),
  ('adv_12', 2, '예배당', 3350000, 9.6, 1, 'adv_12-mid2'),
  ('adv_13', 1, '얼음 굴', 4400000, 11.1, 1, 'adv_13-mid1'),
  ('adv_13', 2, '핏빛 굴', 5300000, 11.3, 1, 'adv_13-mid2'),
  ('adv_14', 1, '불 바위', 7100000, 10.9, 1, 'adv_14-mid1'),
  ('adv_14', 2, '재 바위', 8800000, 10.7, 1, 'adv_14-mid2')
on conflict (zone, idx) do update set
  name = excluded.name, level = excluded.level, strength = excluded.strength, gold = excluded.gold, weapon = excluded.weapon;

-- 지금 중간 보스: × 0.95(평원 3은 그대로)
update public.adventure_minis as m set strength = v.strength
from (values
  ('adv_2', 1, 6.1),
  ('adv_2', 2, 7.5),
  ('adv_2', 3, 7.4),
  ('adv_2', 4, 7.4),
  ('adv_3', 1, 9.0),
  ('adv_6', 1, 9.0),
  ('adv_6', 2, 8.7),
  ('adv_6', 3, 8.9),
  ('adv_6', 4, 9.2)
) as v (zone, idx, strength)
where m.zone = v.zone and m.idx = v.idx;

-- ───────── 5. 몬스터 78 ─────────

-- 새 지역 몬스터는 통째로 다시 넣는다(지금 지역 몬스터는 그대로). 칸은 디자인 맵 자료 4판, 레벨은 기획 17장 표.
delete from public.adventure_spots where zone in ('adv_9', 'adv_10', 'adv_11', 'adv_12', 'adv_13', 'adv_14');
insert into public.adventure_spots (map, zone, x, y, kind, art, level, mini, bonus) values
  ('adv_9a', 'adv_9', 9, 6, 'normal', 'Abyssal_Predator_01', 470000, null, null),
  ('adv_9a', 'adv_9', 20, 8, 'normal', 'Abyssal_Anglerfish_03', 485000, null, null),
  ('adv_9a', 'adv_9', 14, 16, 'normal', 'Abyssal_Giant_Squid_04', 495000, null, null),
  ('adv_9a', 'adv_9', 17, 24, 'normal', 'Abyssal_Horror_04', 510000, null, null),
  ('adv_9a', 'adv_9', 28, 34, 'normal', 'Abyssal_Follower_05', 525000, null, null),
  ('adv_9a', 'adv_9', 39, 27, 'normal', 'Abyssal_Venom_Jellyfish_05', 540000, null, null),
  ('adv_9a', 'adv_9', 12, 42, 'mini', 'Abyssal_Sea_Centipede_09', 530000, 1, null),
  ('adv_9b', 'adv_9', 8, 12, 'normal', 'Abyssal_Deep_Eel_06', 555000, null, null),
  ('adv_9b', 'adv_9', 12, 20, 'normal', 'Deep_Sea_Skeleton_Warrior_06', 570000, null, null),
  ('adv_9b', 'adv_9', 24, 16, 'normal', 'Abyssal_Giant_Isopod_07', 590000, null, null),
  ('adv_9b', 'adv_9', 36, 21, 'normal', 'Abyssal_Gulper_Viper_08', 620000, null, null),
  ('adv_9b', 'adv_9', 31, 30, 'normal', 'Abyssal_Black_Dragon_08', 640000, null, null),
  ('adv_9b', 'adv_9', 27, 3, 'normal', 'Deep_Sea_Carapace_Predator_07', 605000, null, null),
  ('adv_9b', 'adv_9', 23, 38, 'mini', 'Abyssal_Sea_Spider_10', 700000, 2, null),
  ('adv_9b', 'adv_9', 38, 38, 'boss', 'Abyssal_Dragon_King_08', 800000, null, null),
  ('adv_10a', 'adv_10', 4, 18, 'normal', 'Merfolk_Warrior_03', 840000, null, null),
  ('adv_10a', 'adv_10', 10, 20, 'normal', 'Monster_Blob_03', 860000, null, null),
  ('adv_10a', 'adv_10', 23, 7, 'normal', 'Monster_Fusion_Horror_04', 900000, null, null),
  ('adv_10a', 'adv_10', 25, 15, 'normal', 'Merfolk_Sorceress_04', 880000, null, null),
  ('adv_10a', 'adv_10', 17, 26, 'normal', 'Monster_Bloater_05', 950000, null, null),
  ('adv_10a', 'adv_10', 24, 24, 'normal', 'Merfolk_Snake_Maiden_05', 920000, null, null),
  ('adv_10a', 'adv_10', 37, 23, 'normal', 'Merfolk_Thorn_Warden_06', 970000, null, null),
  ('adv_10a', 'adv_10', 16, 42, 'mini', 'Merfolk_Bone_Harpooner_09', 930000, 1, null),
  ('adv_10b', 'adv_10', 1, 10, 'normal', 'Monster_Serpent_06', 990000, null, null),
  ('adv_10b', 'adv_10', 11, 15, 'normal', 'Merfolk_Ghost_07', 1020000, null, null),
  ('adv_10b', 'adv_10', 19, 13, 'normal', 'Monster_Amorphous_07', 1040000, null, null),
  ('adv_10b', 'adv_10', 26, 19, 'normal', 'Merfolk_Parasite_08', 1070000, null, null),
  ('adv_10b', 'adv_10', 34, 26, 'normal', 'Monster_Octopus_09', 1120000, null, null),
  ('adv_10b', 'adv_10', 28, 3, 'normal', 'Monster_Crab_08', 1090000, null, null),
  ('adv_10b', 'adv_10', 41, 11, 'mini', 'Monster_Eel_10', 1220000, 2, null),
  ('adv_10b', 'adv_10', 35, 39, 'boss', 'Merfolk_Queen_10', 1400000, null, null),
  ('adv_11a', 'adv_11', 14, 7, 'normal', 'Insect_Centipede_03', 1470000, null, null),
  ('adv_11a', 'adv_11', 10, 20, 'normal', 'Undead_Skeleton_Warrior_03', 1500000, null, null),
  ('adv_11a', 'adv_11', 24, 11, 'normal', 'Insect_Scorpion_04', 1530000, null, null),
  ('adv_11a', 'adv_11', 18, 27, 'normal', 'Undead_Zombie_04', 1560000, null, null),
  ('adv_11a', 'adv_11', 29, 20, 'normal', 'Insect_Spider_05', 1600000, null, null),
  ('adv_11a', 'adv_11', 25, 35, 'normal', 'Undead_Lich_05', 1630000, null, null),
  ('adv_11a', 'adv_11', 31, 33, 'normal', 'Venom_Stinger_Behemoth_05', 1660000, null, null),
  ('adv_11a', 'adv_11', 3, 30, 'mini', 'Undead_Ghoul_09', 1620000, 1, null),
  ('adv_11b', 'adv_11', 3, 28, 'normal', 'Insect_Mantis_06', 1700000, null, null),
  ('adv_11b', 'adv_11', 9, 21, 'normal', 'Undead_Ghost_06', 1730000, null, null),
  ('adv_11b', 'adv_11', 26, 36, 'normal', 'Insect_Beetle_07', 1770000, null, null),
  ('adv_11b', 'adv_11', 32, 30, 'normal', 'Undead_Vampire_07', 1810000, null, null),
  ('adv_11b', 'adv_11', 17, 13, 'normal', 'Undead_Mummy_08', 1880000, null, null),
  ('adv_11b', 'adv_11', 24, 7, 'normal', 'Insect_Dragonfly_08', 1840000, null, null),
  ('adv_11b', 'adv_11', 32, 11, 'normal', 'Insect_Crab_Spider_09', 1920000, null, null),
  ('adv_11b', 'adv_11', 40, 22, 'mini', 'Insect_Larva_10', 2100000, 2, null),
  ('adv_11b', 'adv_11', 40, 6, 'boss', 'Undead_Wraith_10', 2400000, null, null),
  ('adv_12a', 'adv_12', 39, 32, 'normal', 'Cursed_Siren_02', 2500000, null, null),
  ('adv_12a', 'adv_12', 29, 32, 'normal', 'Cursed_Knight_03', 2560000, null, null),
  ('adv_12a', 'adv_12', 27, 25, 'normal', 'Humanoid_Cursed_Knight_03', 2630000, null, null),
  ('adv_12a', 'adv_12', 18, 20, 'normal', 'Skeleton_Lord_03', 2690000, null, null),
  ('adv_12a', 'adv_12', 14, 13, 'normal', 'Humanoid_Berserker_04', 2760000, null, null),
  ('adv_12a', 'adv_12', 38, 8, 'mini', 'Humanoid_Assassin_08', 2700000, 1, null),
  ('adv_12b', 'adv_12', 15, 33, 'normal', 'Humanoid_Cursed_Archer_05', 2900000, null, null),
  ('adv_12b', 'adv_12', 22, 40, 'normal', 'Cursed_Wraith_04', 2830000, null, null),
  ('adv_12b', 'adv_12', 24, 19, 'normal', 'Humanoid_Cursed_Mage_06', 2970000, null, null),
  ('adv_12b', 'adv_12', 14, 18, 'normal', 'Humanoid_Gladiator_07', 3040000, null, null),
  ('adv_12b', 'adv_12', 37, 12, 'mini', 'Humanoid_Cursed_Paladin_09', 3350000, 2, null),
  ('adv_12b', 'adv_12', 5, 5, 'boss', 'Humanoid_Berserker_10', 3800000, null, null),
  ('adv_13a', 'adv_13', 16, 6, 'normal', 'Dragon_Ironscale_03', 4000000, null, null),
  ('adv_13a', 'adv_13', 16, 15, 'normal', 'Dragon_Chitin_04', 4150000, null, null),
  ('adv_13a', 'adv_13', 24, 28, 'normal', 'Dragon_Bone_05', 4300000, null, null),
  ('adv_13a', 'adv_13', 36, 11, 'mini', 'Dragon_Shadow_08', 4400000, 1, null),
  ('adv_13b', 'adv_13', 5, 31, 'normal', 'Dragon_Crystal_06', 4450000, null, null),
  ('adv_13b', 'adv_13', 24, 36, 'normal', 'Dragon_Slime_07', 4650000, null, null),
  ('adv_13b', 'adv_13', 34, 19, 'normal', 'Blackiron_Dragon_07', 4800000, null, null),
  ('adv_13b', 'adv_13', 41, 41, 'mini', 'Dragon_Blood_09', 5300000, 2, null),
  ('adv_13b', 'adv_13', 21, 24, 'boss', 'Dragon_King_10', 6000000, null, null),
  ('adv_14a', 'adv_14', 32, 38, 'normal', 'Hellfire_Knight_01', 6300000, null, null),
  ('adv_14a', 'adv_14', 26, 25, 'normal', 'Demon_Obsidian_03', 6600000, null, null),
  ('adv_14a', 'adv_14', 15, 13, 'normal', 'Demon_Scaled_04', 6950000, null, null),
  ('adv_14a', 'adv_14', 36, 9, 'mini', 'Demon_Sorcerer_08', 7100000, 1, null),
  ('adv_14b', 'adv_14', 10, 13, 'normal', 'Demon_Shadow_05', 7250000, null, null),
  ('adv_14b', 'adv_14', 24, 9, 'normal', 'Demon_Bloated_06', 7650000, null, null),
  ('adv_14b', 'adv_14', 24, 25, 'normal', 'Demon_Warlord_07', 8000000, null, null),
  ('adv_14b', 'adv_14', 33, 5, 'mini', 'Demon_Berserker_09', 8800000, 2, null),
  ('adv_14b', 'adv_14', 38, 36, 'boss', 'Demon_King_10', 10000000, null, null);

-- ───────── 6. 장신구와 보석 ─────────

update public.adventure_items as i set value = v.value, value2 = v.value2
from (values
  ('leech_3', 0.01, null::numeric),
  ('leech_4', 0.02, null),
  ('combo_3', 0.05, 0.55),
  ('combo_4', 0.05, 0.6),
  ('sharp_3', 2.25, null),
  ('sharp_4', 2.5, null),
  ('endure_4', 0.5, 0)
) as v (id, value, value2)
where i.id = v.id;

-- 보석: 그 스텟 고정 포인트(예전 % × 2 × 그 단계를 처음 쓰는 지역 보스 레벨을 다듬은 값, 기획 17장 'AGI와 장신구 조정의 안' 5). 값과 열리는 때는 그대로.
update public.adventure_items set value = case tier when 1 then 1500 when 2 then 3000 when 3 then 20000 when 4 then 40000 when 5 then 80000 else 750000 end
where kind = 'gem';

-- ───────── 7. 함수 ─────────

-- 지금 전투에 쓰는 스텟. 20261119000000_adventure_numbers.sql의 것에서 보석과 '지역 무기 다 모음'만 바꿨다(위 6·8번).
-- 스텟 = (처음 값 + (판 포인트 + 마을 스텟 × 10 + 무기 고정 포인트 + 보석 포인트) × 1포인트 효과) × (1 + 컬렉션 + 장착) × (1 + 베이스 레벨 × 0.25).
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

revoke execute on function public.adventure_power(uuid) from public, anon, authenticated;

-- 전투 하나. 20261119000000_adventure_numbers.sql의 것에서 AGI 식(× 4)과 화산 폭풍 지역 잠금만 바꿨다(위 2·3번).
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
  -- 화산 폭풍(adv_14)은 평원 1의 높은 지역 포탈로 늘 가는 곳이라 앞 지역 보스 기록을 보지 않는다(2026-11-19 사용자가 정함, 기획 17장 '입구의 높은 지역 포탈')
  if z.unlock_after is not null and z.id <> 'adv_14'
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
    gain := round(40 * (lv + 3) ^ 2 * case when is_boss or is_mini then 3 else 1 end
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
      -- 보스·중간 보스 무기: 처음 잡으면 반드시, 다시 잡으면 판마다 처음 이길 때만 2%(20% → 2%, 사용자 "전반적으로 드롭률이 너무 높다. 파격적으로 줄여줘.")
      if first_kill or (fresh and random() < 0.02) then
        if is_boss then
          select w.id into dropped from public.adventure_weapons as w where w.zone = z.id and w.boss order by w.id limit 1;
        else
          dropped := m.weapon;
        end if;
      end if;
    elsif random() < 0.002 * (1 + luc / (luc + 4 * lv)) * drop_mul * (1 + coalesce((pw -> 'fx' ->> 'drop')::numeric, 0)) then
      -- 장착 무기 드랍 +25~75%는 보통 몬스터 드랍에만(보스 무기 2%에는 안 붙음, 계산기 drop과 같음)
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

revoke execute on function public.adventure_battle(text, integer, integer) from public, anon;
grant execute on function public.adventure_battle(text, integer, integer) to authenticated;

-- 포탈로 맵을 옮긴다. 20261118200000_adventure_rework.sql의 것에 높은 지역 포탈과 '→ 입구'만 더했다(위 2번).
create or replace function public.adventure_move(target text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  a public.adventure_players%rowtype;
  z public.adventure_zones%rowtype;
  t public.adventure_maps%rowtype;
  here public.adventure_maps%rowtype;
  here_zone public.adventure_zones%rowtype;
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
    -- 높은 지역 포탈(평원 1 adv_1a → 화산 폭풍 1 adv_14a)과 그 도착 칸 옆 '→ 입구'(adv_14a → 입구 맵 adv_gate): 늘(run_bosses를 보지 않음, 2026-11-19 사용자가 정함)
    if (a.run_map = 'adv_1a' and adventure_move.target = 'adv_14a') or (a.run_map = 'adv_14a' and adventure_move.target = 'adv_gate') then
      update public.adventure_players as x set run_map = adventure_move.target where x.player = auth.uid();
      return public.adventure_view(auth.uid());
    end if;
    select * into t from public.adventure_maps as x where x.map = adventure_move.target;
    if not found or t.zone is null then
      raise exception 'bad map';
    end if;
    select * into strict z from public.adventure_zones as x where x.id = t.zone;
    select * into here from public.adventure_maps as x where x.map = a.run_map;
    if not found or here.zone is null then
      -- 입구 맵: 포탈은 평원 1로 가는 하나
      if t.idx <> 1 or z.unlock_after is not null then
        raise exception 'bad map';
      end if;
    elsif here.zone = t.zone then
      -- 같은 지역 안: 앞뒤 한 장
      if abs(t.idx - here.idx) <> 1 then
        raise exception 'bad map';
      end if;
    else
      select * into strict here_zone from public.adventure_zones as x where x.id = here.zone;
      if z.unlock_after = here.zone then
        -- 다음 지역: 지금 지역 마지막 맵에서 다음 지역 첫 맵으로, 이번 판에 지금 지역 보스를 잡았을 때만
        if t.idx <> 1 or here.idx <> (select max(x.idx) from public.adventure_maps as x where x.zone = here.zone) then
          raise exception 'bad map';
        end if;
        if not (here.zone = any (a.run_bosses)) then
          raise exception 'zone locked';
        end if;
      elsif here_zone.unlock_after = t.zone then
        -- 앞 지역: 지금 지역 첫 맵에서 앞 지역 마지막 맵으로, 늘
        if here.idx <> 1 or t.idx <> (select max(x.idx) from public.adventure_maps as x where x.zone = t.zone) then
          raise exception 'bad map';
        end if;
      else
        raise exception 'bad map';
      end if;
    end if;
    update public.adventure_players as x set run_map = t.map where x.player = auth.uid();
  end if;
  return public.adventure_view(auth.uid());
end;
$$;

revoke execute on function public.adventure_move(text) from public, anon;
grant execute on function public.adventure_move(text) to authenticated;

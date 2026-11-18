-- 모험 몬스터·보스 세기 다시 맞추기(2026-11-19 둘째, 기획 dungeon-rework.md 11장 표·17장, 계산기 dungeon-run.js 기본값).
-- 사용자 원문(코드 세션에 직접): "1. 경험치 배율이 ㄴ무 높다. 레벨이 14만인데 3만짜리 몬스터 잡아도 레벨이 한번에 3만씩 오른다."
--   "2. 보스 세기를 조금 더 세게한다. 지금은 또 너무 쉬워졌다." → 경험치 식 대신 "몬스터의 스펙을 올리면 어떄?",
--   보스 "2배 레벨에서 약 30%로 (추천)". 기획 세션 안을 사용자가 고름(PM 전달): 보통 몬스터 "1.5배 레벨에서 50% (추천)", 뒤 세 지역 "이대로 (추천)".
-- 몬스터 식(체력 d × (30 + 10L), 공격 d × (5 + 1.5L))과 경험치 식은 그대로라 함수는 바꾸지 않고 행 값만 바꾼다.
-- 실제 DB에 들어간 앞 파일들은 고치지 않는다. 다시 실행해도 된다(같은 값으로 update).
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true):
--   select (select strength from public.adventure_zones where id = 'adv_2') = 4.1 as zone_strength,
--     (select boss_strength from public.adventure_zones where id = 'adv_2') = 7.9 as boss_strength,
--     (select strength from public.adventure_minis where zone = 'adv_2' and idx = 1) = 6.4 as mini_strength,
--     (select array_agg(strength order by sort) = array[1, 4.1, 5.8, 6.2, 6.2, 6.0, 6.2, 6.1]::numeric[]
--       and array_agg(boss_strength order by sort) = array[6.7, 7.9, 9.4, 8.9, 9.7, 9.6, 9.1, 9.8]::numeric[] from public.adventure_zones) as all_zones,
--     (select array_agg(strength order by zone, idx) = array[3, 3, 6.4, 7.9, 7.8, 7.8, 9.5, 9.5, 9.2, 9.4, 9.7]::numeric[] from public.adventure_minis) as all_minis;

-- 지역 세기(보통 몬스터)와 보스 세기. 평원 보통 몬스터 1은 그대로.
-- 예전 값: 세기 1, 2, 3, 4.5, 5, 6.5, 9, 12 / 보스 2.4, 7.5, 8.1, 8.3, 8.4, 8.6, 11.8, 17.0
update public.adventure_zones as z set strength = v.s, boss_strength = v.b
  from (values
    ('adv_1', 1, 6.7),
    ('adv_2', 4.1, 7.9),
    ('adv_3', 5.8, 9.4),
    ('adv_4', 6.2, 8.9),
    ('adv_5', 6.2, 9.7),
    ('adv_6', 6.0, 9.6),
    ('adv_7', 6.2, 9.1),
    ('adv_8', 6.1, 9.8)
  ) as v (id, s, b)
  where z.id = v.id;

-- 중간 보스 세기(11장 표·계산기 MIDS 차례, idx는 레벨 차례). 평원 숲 방·금화 방 3은 그대로.
-- 지옥 용암 굴 1~4(Lv 9,000·12,000·15,000·18,000) 6 → 6.4, 7.9, 7.8, 7.8
-- 얽힌 숲 가운데 빈터(Lv 25,555) 7.8 → 9.5
-- 구름 정원 서쪽·동쪽·북서쪽·북동쪽 섬(Lv 48,000·58,000·70,000·85,000) 8.3, 8.4, 8.4, 8.6 → 9.5, 9.2, 9.4, 9.7
update public.adventure_minis as m set strength = v.s
  from (values
    ('adv_2', 1, 6.4), ('adv_2', 2, 7.9), ('adv_2', 3, 7.8), ('adv_2', 4, 7.8),
    ('adv_3', 1, 9.5),
    ('adv_6', 1, 9.5), ('adv_6', 2, 9.2), ('adv_6', 3, 9.4), ('adv_6', 4, 9.7)
  ) as v (zone, idx, s)
  where m.zone = v.zone and m.idx = v.idx;

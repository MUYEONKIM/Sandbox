-- 일곱 빛 들판 노랑 구역 경험치 ×3 없앰(2026-11-25, 사용자가 PM 창에 줌, PM 전달). 실제 DB에 들어간 앞 migration은 고치지 않는다.
-- 다시 실행해도 된다: 이미 없앤 자리는 바뀌지 않는다(같은 update가 0줄).
--
-- 사용자: "7색의 땅인가 거기서 exp 3배는 없애라." PM 질문(일곱 빛 exp x 3 구역은 지옥 첫 띠 경험치 방과 같은 bonus_exp3를 씀)에 "일곱 빛만 없앰 (추천)".
-- 1. 일곱 빛 들판(adv_5 지역: adv_5a, adv_5l, adv_5r, adv_5) 노랑 구역 몬스터 다섯 자리의 구역 보너스(bonus 'exp3')를 지운다.
--    그 자리 몬스터는 보통 몬스터와 같다(레벨·그림은 그대로). 노랑 바닥 색은 화면에 그대로 남는다(맵 자료).
-- 지옥 첫 띠 경험치 방(adv_2a (41, 39), bonus 'exp3')과 설정 표 bonus_exp3, 전투 함수, 다른 여섯 빛 구역은 그대로다.
-- 몬스터 세기(adventure_zones·adventure_minis)와 레벨, 사용자가 실제 DB에서 직접 바꾼 값은 건드리지 않는다.
--
-- 실제 DB 확인(SQL Editor, 실행 뒤, 모두 true):
--   select
--     not exists (select 1 from public.adventure_spots as s where s.zone = 'adv_5' and s.bonus = 'exp3') as rainbow_exp3_gone,
--     (select count(*) from public.adventure_spots as s
--       where (s.map, s.x, s.y) in (('adv_5', 34, 22), ('adv_5a', 44, 28), ('adv_5a', 62, 36), ('adv_5l', 36, 52), ('adv_5r', 42, 28))
--         and s.kind = 'normal' and s.bonus is null) = 5 as five_now_normal,
--     (select count(*) from public.adventure_spots as s where s.bonus = 'exp3') = 1
--       and exists (select 1 from public.adventure_spots as s where s.map = 'adv_2a' and s.x = 41 and s.y = 39 and s.bonus = 'exp3') as hell_exp3_kept,
--     (select string_agg(g.bonus || ' ' || g.n, ', ' order by g.bonus collate "C")
--       from (select s.bonus, count(*) as n from public.adventure_spots as s where s.zone = 'adv_5' and s.bonus is not null group by s.bonus) as g)
--       = 'drop2 4, drop3 8, exp15 4, exp2 6, foeAtk 4, foeHp 5' as other_lights_kept,
--     exists (select 1 from public.adventure_tuning as t where t.key = 'bonus_exp3' and t.value is not null) as tuning_kept,
--     position('when ''exp3'' then exp_mul := t_exp3;' in f.src) > 0 as battle_kept
--   from (select pg_get_functiondef('public.adventure_battle(text, integer, integer)'::regprocedure) as src) as f;

-- ───────── 1. 일곱 빛 노랑 구역 보너스 ─────────

update public.adventure_spots
set bonus = null
where zone = 'adv_5' and bonus = 'exp3';

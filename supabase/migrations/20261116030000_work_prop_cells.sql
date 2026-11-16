-- 작업장 소품 칸에 있는 블록을 지운다(2026-11-16). 사용자: "소품이 우선이다. 기존 위치에 블록있으면 그 블록을 삭제하는 것이다."
--
-- 지울 칸: src/game/workLayouts.ts(WORK_LAYOUTS)의 네 작업장 소품 85개가 차지하는 칸 122개
--   (채석장 49, 벌목장 24, 채집장 30, 낚시터 19).
--   소품 하나를 한 줄(맵, 그림, x, y, w, d)로 적고, (x, y)에서 x 방향 w칸, y 방향 d칸을 모두 편다. 물 위 소품(선착장, 배)도 넣었다.
--   칸 목록을 뽑은 workLayouts.ts의 md5: 3f7416efaf2cee8b6fa806b707ef58e4. 이 파일이 바뀌면 칸 목록도 다시 뽑는다.
-- 가리는 돌 칸(소품 앞에서 소품을 가리는 돌)은 아직 넣지 않았다. 사용자가 지우기로 정하면 cover에 칸을 넣는다(벌목장 180칸, 낚시터 22칸).
-- 지울 블록: 그 칸의 블록 전부. 층(z 0~4), 종류, 놓은 사람을 가리지 않는다.
--   칸 밖에 놓은 큰 가구(침대처럼 여러 칸을 차지하는 것)도 차지하는 칸이 지울 칸에 걸치면 지운다(에이전트가 정함).
-- 돌려주지 않는다: 사용자가 "삭제"라고 했다. 또 인벤토리는 화면(클라이언트)이 profiles.inventory를 통째로 덮어써서,
--   SQL로 블록을 넣어 줘도 접속해 있던 사람의 다음 저장에 지워질 수 있다.
-- 다시 실행해도 된다. 두 번째에는 그사이 새로 놓인 블록만 지운다(없으면 맨 끝 결과의 합계가 0이다).
--
-- 실행 순서
--   1. 이 파일을 실제 DB의 SQL Editor에서 실행한다.
--   2. 바로 푸시(배포)한다. 새 화면은 소품 칸이 막힌 칸이라 블록을 놓지 못한다(World.isOpenGround).
--   3. 실제 사이트에 새 번들이 뜨면 이 파일을 한 번 더 실행한다. 새로고침하지 않은 사람의 예전 화면은 소품 칸에 블록을 놓을 수 있어서다.
-- 접속해 있는 사람의 화면에서는 지운 블록이 Realtime(blocks의 DELETE)으로 바로 사라진다.
--
-- 지우기를 막는 것이 없는지(읽기만, 0줄이어야 한다): blocks에 트리거, 규칙, RLS 강제가 있으면 줄이 나온다.
--   select 'trigger' as kind, tgname as name from pg_trigger where tgrelid = 'public.blocks'::regclass and not tgisinternal
--   union all select 'rule', rulename from pg_rules where schemaname = 'public' and tablename = 'blocks'
--   union all select 'force_rls', relname from pg_class where oid = 'public.blocks'::regclass and relforcerowsecurity;
--
-- 실행 전 확인(읽기만 한다): 아래 /* */ 안의 select만 새 쿼리 창에 붙여 먼저 실행하면 지울 블록이 칸마다 나온다.
--   map·x·y는 칸(큰 가구는 놓은 칸), why는 지우는 까닭(소품 = 소품 칸, 가림 = 소품을 가리는 돌, 큰 가구 = 칸 밖에서 걸친 가구),
--   layers는 그 칸에서 지울 줄 수, blocks는 블록 종류, placed_by는 놓은 사람이다. layers를 더한 값이 맨 끝 결과의 합계와 같아야 한다
--   (그사이 누가 놓거나 회수하면 조금 다를 수 있다). 같은 select가 공유 노트 sql-drafts/work_prop_cells_check.sql에도 있다.
/*
with
props(map, sprite, x, y, w, d) as (values
  -- 채석장: 소품 24개, 49칸
  ('quarry', 'work-cliff', 2, 0, 4, 1),
  ('quarry', 'work-cliff', 6, 0, 4, 1),
  ('quarry', 'work-cliff', 10, 0, 4, 1),
  ('quarry', 'work-cliff', 14, 0, 4, 1),
  ('quarry', 'work-cliff-x', 0, 2, 1, 4),
  ('quarry', 'work-cliff-x', 0, 6, 1, 4),
  ('quarry', 'work-cliff-x', 0, 10, 1, 4),
  ('quarry', 'work-crane', 7, 1, 2, 2),
  ('quarry', 'work-cart', 13, 7, 2, 1),
  ('quarry', 'work-rubble', 4, 2, 1, 1),
  ('quarry', 'work-blocks', 5, 2, 1, 1),
  ('quarry', 'work-rubble', 24, 2, 1, 1),
  ('quarry', 'work-blocks', 25, 2, 1, 1),
  ('quarry', 'work-rubble', 30, 2, 1, 1),
  ('quarry', 'work-blocks', 36, 42, 1, 1),
  ('quarry', 'work-rubble', 37, 43, 1, 1),
  ('quarry', 'work-rubble', 33, 38, 1, 1),
  ('quarry', 'work-lantern', 45, 38, 1, 1),
  ('quarry', 'work-lantern', 40, 31, 1, 1),
  ('quarry', 'work-lantern', 33, 26, 1, 1),
  ('quarry', 'work-lantern', 27, 22, 1, 1),
  ('quarry', 'work-lantern', 25, 14, 1, 1),
  ('quarry', 'work-lantern', 18, 11, 1, 1),
  ('quarry', 'work-lantern', 9, 3, 1, 1),
  -- 벌목장: 소품 19개, 24칸
  ('logging', 'work-logpile', 33, 43, 2, 1),
  ('logging', 'work-logpile-x', 37, 35, 1, 2),
  ('logging', 'work-sawhorse', 32, 40, 2, 1),
  ('logging', 'work-firewood', 37, 42, 1, 1),
  ('logging', 'work-stump', 34, 42, 1, 1),
  ('logging', 'work-campfire', 34, 22, 1, 1),
  ('logging', 'work-stump', 33, 23, 1, 1),
  ('logging', 'work-stump', 34, 23, 1, 1),
  ('logging', 'work-stump', 18, 27, 1, 1),
  ('logging', 'work-stump', 42, 19, 1, 1),
  ('logging', 'work-stump', 9, 13, 1, 1),
  ('logging', 'work-stump', 22, 42, 1, 1),
  ('logging', 'work-logpile', 10, 1, 2, 1),
  ('logging', 'work-logpile', 23, 2, 2, 1),
  ('logging', 'work-lantern', 44, 38, 1, 1),
  ('logging', 'work-lantern', 39, 30, 1, 1),
  ('logging', 'work-lantern', 30, 21, 1, 1),
  ('logging', 'work-lantern', 19, 12, 1, 1),
  ('logging', 'work-lantern', 6, 2, 1, 1),
  -- 채집장: 소품 30개, 30칸
  ('gathering', 'work-fruittree', 3, 1, 1, 1),
  ('gathering', 'work-fruittree', 9, 1, 1, 1),
  ('gathering', 'work-fruittree', 15, 1, 1, 1),
  ('gathering', 'work-fruittree', 21, 1, 1, 1),
  ('gathering', 'work-fruittree', 27, 1, 1, 1),
  ('gathering', 'work-fruittree', 33, 1, 1, 1),
  ('gathering', 'work-fruittree', 39, 1, 1, 1),
  ('gathering', 'work-fruittree', 1, 7, 1, 1),
  ('gathering', 'work-fruittree', 1, 13, 1, 1),
  ('gathering', 'work-fruittree', 1, 19, 1, 1),
  ('gathering', 'work-fruittree', 1, 25, 1, 1),
  ('gathering', 'work-fruittree', 1, 31, 1, 1),
  ('gathering', 'work-fruittree', 1, 37, 1, 1),
  ('gathering', 'work-bush', 44, 34, 1, 1),
  ('gathering', 'work-bush', 37, 25, 1, 1),
  ('gathering', 'work-bush', 24, 19, 1, 1),
  ('gathering', 'work-bush', 12, 13, 1, 1),
  ('gathering', 'work-bush', 35, 8, 1, 1),
  ('gathering', 'work-scarecrow', 8, 27, 1, 1),
  ('gathering', 'work-scarecrow', 22, 33, 1, 1),
  ('gathering', 'work-scarecrow', 33, 16, 1, 1),
  ('gathering', 'work-basket', 13, 26, 1, 1),
  ('gathering', 'work-basket', 19, 32, 1, 1),
  ('gathering', 'work-basket', 31, 15, 1, 1),
  ('gathering', 'work-basket', 36, 38, 1, 1),
  ('gathering', 'work-wheelbarrow-x', 37, 40, 1, 1),
  ('gathering', 'work-lantern', 44, 40, 1, 1),
  ('gathering', 'work-lantern', 39, 25, 1, 1),
  ('gathering', 'work-lantern', 25, 18, 1, 1),
  ('gathering', 'work-lantern', 13, 16, 1, 1),
  -- 낚시터: 소품 12개, 19칸
  ('fishing', 'work-dock', 30, 30, 4, 1), -- 물 위
  ('fishing', 'work-boat', 31, 31, 2, 1), -- 물 위
  ('fishing', 'work-bench-x', 8, 22, 1, 2),
  ('fishing', 'work-bench', 22, 8, 2, 1),
  ('fishing', 'work-rodrack', 37, 42, 1, 1),
  ('fishing', 'work-tackle', 35, 42, 1, 1),
  ('fishing', 'work-dryrack', 34, 39, 2, 1),
  ('fishing', 'work-lantern', 44, 39, 1, 1),
  ('fishing', 'work-lantern', 40, 33, 1, 1),
  ('fishing', 'work-lantern', 36, 28, 1, 1),
  ('fishing', 'work-lantern', 8, 26, 1, 1),
  ('fishing', 'work-lantern', 26, 8, 1, 1)
),
prop_cells as (
  select distinct p.map, cx as x, cy as y
  from props as p, generate_series(p.x, p.x + p.w - 1) as cx, generate_series(p.y, p.y + p.d - 1) as cy
),
-- 소품 앞에서 소품을 가리는 돌 칸(공유 노트 workplace-art.md '칸 확정' 절의 표).
-- 지금은 비어 있다. 사용자가 지우기로 정하면 이 select를 values 목록으로 바꾼다.
cover(map, x, y) as (select null::text, null::integer, null::integer where false),
cells as (
  select map, x, y, '소품' as why from prop_cells
  union all
  select c.map, c.x, c.y, '가림' from cover as c
  where not exists (select 1 from prop_cells as o where o.map = c.map and o.x = c.x and o.y = c.y)
),
-- 큰 가구 크기(src/blocks.ts footprintOf): 놓은 칸 (x, y)에서 x - (a - 1) / 2부터 a칸, y - (b - 1) / 2부터 b칸을 차지한다.
big(a, b, ids) as (values
  (2,3, array['f_bed_md_greyblue_1', 'f_bed_md_blue_1', 'f_bed_md_red_1', 'f_bed_md_space_1', 'f_bed_ms_greyblue_1', 'f_bed_ms_blue_1', 'f_bed_ms_red_1', 'f_bed_ms_space_1', 'f_bed_wd_greyblue_1', 'f_bed_wd_blue_1', 'f_bed_wd_red_1', 'f_bed_wd_space_1', 'f_bed_ws_greyblue_1', 'f_bed_ws_blue_1', 'f_bed_ws_red_1', 'f_bed_ws_space_1']),
  (3,2, array['f_bed_md_greyblue_2', 'f_bed_md_blue_2', 'f_bed_md_red_2', 'f_bed_md_space_2', 'f_bed_ms_greyblue_2', 'f_bed_ms_blue_2', 'f_bed_ms_red_2', 'f_bed_ms_space_2', 'f_bed_wd_greyblue_2', 'f_bed_wd_blue_2', 'f_bed_wd_red_2', 'f_bed_wd_space_2', 'f_bed_ws_greyblue_2', 'f_bed_ws_blue_2', 'f_bed_ws_red_2', 'f_bed_ws_space_2']),
  (2,2, array['f_table_s_glass_1', 'f_table_s_glass_2', 'f_table_s_white_1', 'f_table_s_white_2', 'f_table_s_wood_1', 'f_table_s_wood_2', 'f_table_glass_1', 'f_table_glass_2', 'f_table_white_1', 'f_table_white_2', 'f_table_wood_1', 'f_table_wood_2', 'f_carpet_stripe_1', 'f_carpet_stripe_2', 'f_carpet_plain_1', 'f_carpet_plain_2']),
  (1,2, array['f_cupboard_1']),
  (2,1, array['f_cupboard_2']),
  (3,3, array['f_carpet_round_greyblue', 'f_carpet_round_blue', 'f_carpet_round_red']),
  (4,4, array['f_carpet_big_white_1', 'f_carpet_big_white_2']),
  (2,4, array['f_futon_1']),
  (4,2, array['f_futon_2'])
),
hit as (
  select b.map, b.x, b.y, b.z, c.why
  from public.blocks as b join cells as c on c.map = b.map and c.x = b.x and c.y = b.y
  union
  select b.map, b.x, b.y, b.z, '큰 가구'
  from public.blocks as b
  join big as f on b.block = any (f.ids)
  join cells as c on c.map = b.map
    and c.x between b.x - (f.a - 1) / 2 and b.x - (f.a - 1) / 2 + f.a - 1
    and c.y between b.y - (f.b - 1) / 2 and b.y - (f.b - 1) / 2 + f.b - 1
  where not exists (select 1 from cells as o where o.map = b.map and o.x = b.x and o.y = b.y)
)
select h.map, h.x, h.y, min(h.why) as why, count(*) as layers, string_agg(distinct b.block, ', ') as blocks,
  string_agg(distinct coalesce(p.nickname, b.placed_by::text), ', ') as placed_by
from hit as h
join public.blocks as b on b.map = h.map and b.x = h.x and b.y = h.y and b.z = h.z
left join public.profiles as p on p.id = b.placed_by
group by h.map, h.x, h.y
order by h.map, h.x, h.y;
*/

-- 지우고, 이번에 지운 줄 수를 맵별·사람별로 보여 준다. 맨 끝 줄은 합계다.
with
props(map, sprite, x, y, w, d) as (values
  -- 채석장: 소품 24개, 49칸
  ('quarry', 'work-cliff', 2, 0, 4, 1),
  ('quarry', 'work-cliff', 6, 0, 4, 1),
  ('quarry', 'work-cliff', 10, 0, 4, 1),
  ('quarry', 'work-cliff', 14, 0, 4, 1),
  ('quarry', 'work-cliff-x', 0, 2, 1, 4),
  ('quarry', 'work-cliff-x', 0, 6, 1, 4),
  ('quarry', 'work-cliff-x', 0, 10, 1, 4),
  ('quarry', 'work-crane', 7, 1, 2, 2),
  ('quarry', 'work-cart', 13, 7, 2, 1),
  ('quarry', 'work-rubble', 4, 2, 1, 1),
  ('quarry', 'work-blocks', 5, 2, 1, 1),
  ('quarry', 'work-rubble', 24, 2, 1, 1),
  ('quarry', 'work-blocks', 25, 2, 1, 1),
  ('quarry', 'work-rubble', 30, 2, 1, 1),
  ('quarry', 'work-blocks', 36, 42, 1, 1),
  ('quarry', 'work-rubble', 37, 43, 1, 1),
  ('quarry', 'work-rubble', 33, 38, 1, 1),
  ('quarry', 'work-lantern', 45, 38, 1, 1),
  ('quarry', 'work-lantern', 40, 31, 1, 1),
  ('quarry', 'work-lantern', 33, 26, 1, 1),
  ('quarry', 'work-lantern', 27, 22, 1, 1),
  ('quarry', 'work-lantern', 25, 14, 1, 1),
  ('quarry', 'work-lantern', 18, 11, 1, 1),
  ('quarry', 'work-lantern', 9, 3, 1, 1),
  -- 벌목장: 소품 19개, 24칸
  ('logging', 'work-logpile', 33, 43, 2, 1),
  ('logging', 'work-logpile-x', 37, 35, 1, 2),
  ('logging', 'work-sawhorse', 32, 40, 2, 1),
  ('logging', 'work-firewood', 37, 42, 1, 1),
  ('logging', 'work-stump', 34, 42, 1, 1),
  ('logging', 'work-campfire', 34, 22, 1, 1),
  ('logging', 'work-stump', 33, 23, 1, 1),
  ('logging', 'work-stump', 34, 23, 1, 1),
  ('logging', 'work-stump', 18, 27, 1, 1),
  ('logging', 'work-stump', 42, 19, 1, 1),
  ('logging', 'work-stump', 9, 13, 1, 1),
  ('logging', 'work-stump', 22, 42, 1, 1),
  ('logging', 'work-logpile', 10, 1, 2, 1),
  ('logging', 'work-logpile', 23, 2, 2, 1),
  ('logging', 'work-lantern', 44, 38, 1, 1),
  ('logging', 'work-lantern', 39, 30, 1, 1),
  ('logging', 'work-lantern', 30, 21, 1, 1),
  ('logging', 'work-lantern', 19, 12, 1, 1),
  ('logging', 'work-lantern', 6, 2, 1, 1),
  -- 채집장: 소품 30개, 30칸
  ('gathering', 'work-fruittree', 3, 1, 1, 1),
  ('gathering', 'work-fruittree', 9, 1, 1, 1),
  ('gathering', 'work-fruittree', 15, 1, 1, 1),
  ('gathering', 'work-fruittree', 21, 1, 1, 1),
  ('gathering', 'work-fruittree', 27, 1, 1, 1),
  ('gathering', 'work-fruittree', 33, 1, 1, 1),
  ('gathering', 'work-fruittree', 39, 1, 1, 1),
  ('gathering', 'work-fruittree', 1, 7, 1, 1),
  ('gathering', 'work-fruittree', 1, 13, 1, 1),
  ('gathering', 'work-fruittree', 1, 19, 1, 1),
  ('gathering', 'work-fruittree', 1, 25, 1, 1),
  ('gathering', 'work-fruittree', 1, 31, 1, 1),
  ('gathering', 'work-fruittree', 1, 37, 1, 1),
  ('gathering', 'work-bush', 44, 34, 1, 1),
  ('gathering', 'work-bush', 37, 25, 1, 1),
  ('gathering', 'work-bush', 24, 19, 1, 1),
  ('gathering', 'work-bush', 12, 13, 1, 1),
  ('gathering', 'work-bush', 35, 8, 1, 1),
  ('gathering', 'work-scarecrow', 8, 27, 1, 1),
  ('gathering', 'work-scarecrow', 22, 33, 1, 1),
  ('gathering', 'work-scarecrow', 33, 16, 1, 1),
  ('gathering', 'work-basket', 13, 26, 1, 1),
  ('gathering', 'work-basket', 19, 32, 1, 1),
  ('gathering', 'work-basket', 31, 15, 1, 1),
  ('gathering', 'work-basket', 36, 38, 1, 1),
  ('gathering', 'work-wheelbarrow-x', 37, 40, 1, 1),
  ('gathering', 'work-lantern', 44, 40, 1, 1),
  ('gathering', 'work-lantern', 39, 25, 1, 1),
  ('gathering', 'work-lantern', 25, 18, 1, 1),
  ('gathering', 'work-lantern', 13, 16, 1, 1),
  -- 낚시터: 소품 12개, 19칸
  ('fishing', 'work-dock', 30, 30, 4, 1), -- 물 위
  ('fishing', 'work-boat', 31, 31, 2, 1), -- 물 위
  ('fishing', 'work-bench-x', 8, 22, 1, 2),
  ('fishing', 'work-bench', 22, 8, 2, 1),
  ('fishing', 'work-rodrack', 37, 42, 1, 1),
  ('fishing', 'work-tackle', 35, 42, 1, 1),
  ('fishing', 'work-dryrack', 34, 39, 2, 1),
  ('fishing', 'work-lantern', 44, 39, 1, 1),
  ('fishing', 'work-lantern', 40, 33, 1, 1),
  ('fishing', 'work-lantern', 36, 28, 1, 1),
  ('fishing', 'work-lantern', 8, 26, 1, 1),
  ('fishing', 'work-lantern', 26, 8, 1, 1)
),
prop_cells as (
  select distinct p.map, cx as x, cy as y
  from props as p, generate_series(p.x, p.x + p.w - 1) as cx, generate_series(p.y, p.y + p.d - 1) as cy
),
-- 소품 앞에서 소품을 가리는 돌 칸(공유 노트 workplace-art.md '칸 확정' 절의 표).
-- 지금은 비어 있다. 사용자가 지우기로 정하면 이 select를 values 목록으로 바꾼다.
cover(map, x, y) as (select null::text, null::integer, null::integer where false),
cells as (
  select map, x, y, '소품' as why from prop_cells
  union all
  select c.map, c.x, c.y, '가림' from cover as c
  where not exists (select 1 from prop_cells as o where o.map = c.map and o.x = c.x and o.y = c.y)
),
-- 큰 가구 크기(src/blocks.ts footprintOf): 놓은 칸 (x, y)에서 x - (a - 1) / 2부터 a칸, y - (b - 1) / 2부터 b칸을 차지한다.
big(a, b, ids) as (values
  (2,3, array['f_bed_md_greyblue_1', 'f_bed_md_blue_1', 'f_bed_md_red_1', 'f_bed_md_space_1', 'f_bed_ms_greyblue_1', 'f_bed_ms_blue_1', 'f_bed_ms_red_1', 'f_bed_ms_space_1', 'f_bed_wd_greyblue_1', 'f_bed_wd_blue_1', 'f_bed_wd_red_1', 'f_bed_wd_space_1', 'f_bed_ws_greyblue_1', 'f_bed_ws_blue_1', 'f_bed_ws_red_1', 'f_bed_ws_space_1']),
  (3,2, array['f_bed_md_greyblue_2', 'f_bed_md_blue_2', 'f_bed_md_red_2', 'f_bed_md_space_2', 'f_bed_ms_greyblue_2', 'f_bed_ms_blue_2', 'f_bed_ms_red_2', 'f_bed_ms_space_2', 'f_bed_wd_greyblue_2', 'f_bed_wd_blue_2', 'f_bed_wd_red_2', 'f_bed_wd_space_2', 'f_bed_ws_greyblue_2', 'f_bed_ws_blue_2', 'f_bed_ws_red_2', 'f_bed_ws_space_2']),
  (2,2, array['f_table_s_glass_1', 'f_table_s_glass_2', 'f_table_s_white_1', 'f_table_s_white_2', 'f_table_s_wood_1', 'f_table_s_wood_2', 'f_table_glass_1', 'f_table_glass_2', 'f_table_white_1', 'f_table_white_2', 'f_table_wood_1', 'f_table_wood_2', 'f_carpet_stripe_1', 'f_carpet_stripe_2', 'f_carpet_plain_1', 'f_carpet_plain_2']),
  (1,2, array['f_cupboard_1']),
  (2,1, array['f_cupboard_2']),
  (3,3, array['f_carpet_round_greyblue', 'f_carpet_round_blue', 'f_carpet_round_red']),
  (4,4, array['f_carpet_big_white_1', 'f_carpet_big_white_2']),
  (2,4, array['f_futon_1']),
  (4,2, array['f_futon_2'])
),
hit as (
  select b.map, b.x, b.y, b.z, c.why
  from public.blocks as b join cells as c on c.map = b.map and c.x = b.x and c.y = b.y
  union
  select b.map, b.x, b.y, b.z, '큰 가구'
  from public.blocks as b
  join big as f on b.block = any (f.ids)
  join cells as c on c.map = b.map
    and c.x between b.x - (f.a - 1) / 2 and b.x - (f.a - 1) / 2 + f.a - 1
    and c.y between b.y - (f.b - 1) / 2 and b.y - (f.b - 1) / 2 + f.b - 1
  where not exists (select 1 from cells as o where o.map = b.map and o.x = b.x and o.y = b.y)
),
gone as (
  delete from public.blocks as b using hit as h
  where b.map = h.map and b.x = h.x and b.y = h.y and b.z = h.z
  returning b.map, b.placed_by
),
counted as (
  select g.map, coalesce(p.nickname, g.placed_by::text) as who, count(*) as removed
  from gone as g left join public.profiles as p on p.id = g.placed_by
  group by g.map, coalesce(p.nickname, g.placed_by::text)
)
select map, who, removed from (
  select 0 as k, map, who, removed from counted
  union all
  select 1, '합계', '', coalesce(sum(removed), 0) from counted
) as r
order by k, map, who;

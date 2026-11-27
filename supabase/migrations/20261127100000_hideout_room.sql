-- 4층 숨은 방을 따로 된 방(맵 'hideout')으로 옮긴다(2026-11-27 코드 세션 7).
-- 방 칸 좌표(x 44~53, y 15~28)는 새 맵에서도 같아서 맵 이름만 'tower4' → 'hideout'으로 바꾼다(좌표 변환 없음).
-- 옮기는 것: 놓인 블록(blocks), 상자 안 물건(box_items), 바닥에 떨어진 것(ground_items), 그 방에 서서 접속을 끊은 사람의 자리(profiles).
-- 방과 4층을 잇던 통로 칸 (43, 21)에 있던 것·사람은 4층 숨은 입구 바로 안쪽 (41, 21)로 옮긴다.
--
-- 실행 전에 운영 서버 백업을 먼저 돌린다: C:\Users\its\its-sandbox-server\backup\backup-prod.ps1
-- 새 화면을 배포하기 전에 실행한다. 실행부터 배포까지 예전 화면에서는 4층 숨은 방이 비어 보인다(블록은 새 맵에 그대로 있음).
-- 한 번 실행하면 4층 그 자리에 남는 것이 없어서, 다시 실행해도 아무것도 바뀌지 않는다.
-- 옮기기 전과 뒤의 수를 세어 다르면 오류를 내고 모두 되돌린다(아래 do 블록). 새 맵에 같은 칸 블록이 이미 있으면 기본 키 오류로 모두 되돌린다.
--
-- 확인 쿼리(실행 뒤 모두 true, 6칸). blocks_count는 2026-11-27 운영 DB에서 읽기만으로 센 수(블록 8)다. 그 사이 방을 바꿨으면 다를 수 있다.
-- select
--   not exists (select 1 from public.blocks where map = 'tower4' and x between 43 and 53 and y between 15 and 28) as blocks_moved,
--   not exists (select 1 from public.box_items where map = 'tower4' and x between 43 and 53 and y between 15 and 28) as box_moved,
--   not exists (select 1 from public.ground_items where map = 'tower4' and x between 43 and 53 and y between 15 and 28) as ground_moved,
--   not exists (select 1 from public.profiles where map = 'tower4' and x between 43 and 53 and y between 15 and 28) as players_moved,
--   (select count(*) from public.blocks where map = 'hideout') = 8 as blocks_count,
--   not exists (select 1 from public.blocks where map = 'hideout' and (x not between 44 and 53 or y not between 15 and 28)) as blocks_inside_room;

do $$
declare
  room_blocks bigint;
  room_boxes bigint;
  room_ground bigint;
  passage_ground bigint;
  had_blocks bigint;
  had_boxes bigint;
  had_ground bigint;
  moved bigint;
begin
  select count(*) into room_blocks from public.blocks where map = 'tower4' and x between 44 and 53 and y between 15 and 28;
  select count(*) into room_boxes from public.box_items where map = 'tower4' and x between 44 and 53 and y between 15 and 28;
  select count(*) into room_ground from public.ground_items where map = 'tower4' and x between 44 and 53 and y between 15 and 28;
  select count(*) into passage_ground from public.ground_items where map = 'tower4' and x = 43 and y between 15 and 28;
  select count(*) into had_blocks from public.blocks where map = 'hideout';
  select count(*) into had_boxes from public.box_items where map = 'hideout';
  select count(*) into had_ground from public.ground_items where map = 'hideout';

  update public.blocks set map = 'hideout' where map = 'tower4' and x between 44 and 53 and y between 15 and 28;
  update public.box_items set map = 'hideout' where map = 'tower4' and x between 44 and 53 and y between 15 and 28;
  update public.ground_items set map = 'hideout' where map = 'tower4' and x between 44 and 53 and y between 15 and 28;
  update public.ground_items set x = 41, y = 21 where map = 'tower4' and x = 43 and y between 15 and 28;
  update public.profiles set map = 'hideout' where map = 'tower4' and x between 44 and 53 and y between 15 and 28;
  update public.profiles set x = 41, y = 21 where map = 'tower4' and x = 43 and y between 15 and 28;

  select count(*) into moved from public.blocks where map = 'hideout';
  if moved <> had_blocks + room_blocks then
    raise exception 'hideout blocks % <> % + %', moved, had_blocks, room_blocks;
  end if;
  select count(*) into moved from public.box_items where map = 'hideout';
  if moved <> had_boxes + room_boxes then
    raise exception 'hideout boxes % <> % + %', moved, had_boxes, room_boxes;
  end if;
  select count(*) into moved from public.ground_items where map = 'hideout';
  if moved <> had_ground + room_ground then
    raise exception 'hideout ground % <> % + %', moved, had_ground, room_ground;
  end if;
  raise notice 'hideout: blocks %, box items %, ground items % (+% from passage to 4F)', room_blocks, room_boxes, room_ground, passage_ground;
end $$;

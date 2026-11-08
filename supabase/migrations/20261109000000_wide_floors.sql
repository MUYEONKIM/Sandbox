-- 7, 8층 바닥을 80×80칸으로 넓혔다(2026-11-09). 그 층의 맵은 한 변이 86칸이라 x, y가 45를 넘는다.
-- 좌표 상한을 클라이언트 config.ts의 MAX_MAP_SIZE(100칸, 0~99)와 맞춘다. 바닥 안인지는 클라이언트가 본다.
-- 다시 실행해도 된다.

alter table public.profiles
  drop constraint if exists profiles_x_check,
  drop constraint if exists profiles_y_check;
alter table public.profiles
  add constraint profiles_x_check check (x between 0 and 99),
  add constraint profiles_y_check check (y between 0 and 99);

alter table public.blocks
  drop constraint if exists blocks_x_check,
  drop constraint if exists blocks_y_check;
alter table public.blocks
  add constraint blocks_x_check check (x between 0 and 99),
  add constraint blocks_y_check check (y between 0 and 99);

-- 노동청 창에 작업장마다 지금 있는 사람을 보인다(2026-11-11 사용자 요청 "각 작업장에 인원 몇 명, 누가 있는지").
-- 접속 여부는 서버가 모르므로, 최근 2분 안에 그 작업장에서 자원을 캤거나 움직인 사람을 있는 사람으로 친다.
-- 다시 실행해도 되게 했다.

alter table public.profiles add column if not exists seen_at timestamptz;

-- 위치나 맵이 바뀔 때(클라이언트가 2초마다 저장) 마지막으로 보인 시각을 남긴다.
create or replace function public.touch_seen_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.map is distinct from old.map or new.x is distinct from old.x or new.y is distinct from old.y then
    new.seen_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_touch_seen_at on public.profiles;
create trigger profiles_touch_seen_at
  before update on public.profiles
  for each row execute function public.touch_seen_at();

-- 작업장마다 지금 있는 사람의 닉네임. 바꾸면 src/ui/office.ts의 안내 문구도 함께 바꾼다.
create or replace function public.workplace_roster() returns table (workplace text, nickname text)
language sql stable security definer set search_path = ''
as $$
  select p.map, p.nickname
  from public.profiles as p
  join public.workplaces as w on w.id = p.map
  where greatest(p.last_harvest_at, p.seen_at) > now() - interval '2 minutes'
  order by p.map, p.nickname;
$$;

revoke execute on function public.workplace_roster() from public, anon;
grant execute on function public.workplace_roster() to authenticated;

notify pgrst, 'reload schema';

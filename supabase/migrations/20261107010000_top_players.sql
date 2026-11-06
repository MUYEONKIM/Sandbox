-- 명예의 전당: 레벨이 높은 순서로 닉네임과 레벨만 돌려준다.
-- profiles는 자기 행만 읽을 수 있어서 서버 함수로 필요한 값만 연다.
create function public.top_players(how_many integer) returns table (nickname text, level text)
language sql stable security definer set search_path = ''
as $$
  select p.nickname, p.level::text
  from public.profiles as p
  order by p.level desc, p.created_at
  limit least(greatest(how_many, 1), 100);
$$;

revoke execute on function public.top_players(integer) from public, anon;
grant execute on function public.top_players(integer) to authenticated;

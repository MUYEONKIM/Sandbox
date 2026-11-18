-- 땅의 메모 위에 서면 쓴 사람과 글을 보인다(2026-11-18 사용자 "떨어진 메모장 위에 서면 무슨 말이 메모되있는지 창이 뜨고,
-- 메모장 벗어나면 창이 꺼진다"). 읽기만 하고 줍지는 않는다(줍기는 예전처럼 pick_up).
-- 예전에는 메모 글(memos)을 줍기 전에는 아무도 읽을 수 없었다. 이제 그 메모가 놓인 칸에 선 사람만 읽는다:
--   서버의 내 맵(profiles.map)과 내 칸(profiles.x, y)이 메모가 놓인 맵·칸과 같아야 한다. 다르면 'not here'.
--   화면은 부르기 전에 미뤄 둔 내 위치를 먼저 저장한다(src/net/session.ts의 readMemo가 flush 뒤에 부름).
-- 돌려주는 것: { id(땅의 것 id), body, author(쓴 사람 닉네임) }. 없거나 골드면 'gone'.
--
-- 배포 전 실제 DB에서 이 파일을 한 번 실행한다. 맨 아래 확인 select가 함수와 권한을 보인다.

create or replace function public.read_memo(item bigint) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  got public.ground_items%rowtype;
begin
  select * into strict me from public.profiles p where p.id = auth.uid();
  select * into got from public.ground_items g where g.id = read_memo.item and g.memo is not null;
  if not found then
    raise exception 'gone';
  end if;
  if got.map is distinct from me.map or got.x <> me.x or got.y <> me.y then
    raise exception 'not here';
  end if;
  return (
    select jsonb_build_object('id', got.id, 'body', m.body, 'author', a.nickname)
    from public.memos m join public.profiles a on a.id = m.author
    where m.id = got.memo
  );
end;
$$;

revoke execute on function public.read_memo(bigint) from public, anon;
grant execute on function public.read_memo(bigint) to authenticated;

-- 확인: 함수가 있고(security definer = true), authenticated만 부를 수 있다(anon_can = false, auth_can = true).
select
  p.proname,
  p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'execute') as anon_can,
  has_function_privilege('authenticated', p.oid, 'execute') as auth_can
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'read_memo';

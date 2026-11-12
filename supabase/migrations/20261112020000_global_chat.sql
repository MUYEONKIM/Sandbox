-- 전체 채팅(2026-11-12 사용자 요청 "채팅창에서 tab 누르면 전체 채팅, 일반 채팅 모드 바뀌기").
-- 일반 채팅은 지금처럼 같은 맵(chat:<맵> 채널)에만, 전체 채팅은 모든 플레이어가 듣는 world-chat 채널로 보낸다.
-- 두 채널 모두 서버만 보낼 수 있어 닉네임을 사칭할 수 없다. everyone을 빼고 부르면 일반 채팅이라,
-- 이 SQL을 실행한 뒤에도 지금 실제 사이트가 그대로 동작한다. 다시 실행해도 되게 했다.

-- 인자가 바뀌므로 예전 함수(message 하나만 받는)를 지운다. 남겨 두면 PostgREST가 둘 중 무엇을 부를지 못 고른다.
drop function if exists public.send_chat(text);

-- 나머지는 20261111030000_open_world.sql과 같다.
create or replace function public.send_chat(message text, everyone boolean default false) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  author text;
  place text;
  body text := btrim(message);
begin
  if body = '' or char_length(body) > 100 then
    raise exception 'invalid message';
  end if;

  select nickname, map into strict author, place from public.profiles where id = auth.uid();

  perform realtime.send(
    jsonb_build_object('id', auth.uid(), 'author', author, 'text', body),
    'chat',
    case when everyone then 'world-chat' else 'chat:' || place end,
    true
  );
end;
$$;

revoke execute on function public.send_chat(text, boolean) from public, anon;
grant execute on function public.send_chat(text, boolean) to authenticated;

notify pgrst, 'reload schema';

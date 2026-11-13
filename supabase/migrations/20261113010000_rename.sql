-- 닉네임 변경권(2026-11-13 사용자 요청 "인당 처음 한 번은 무료, 이후부터는 상점에서 10만 골드").
-- 모든 플레이어(이미 가입한 사람 포함)가 변경권 1장을 가지고 시작하고, 상점에서 1장씩 더 산다.
-- 바꾸면 world-chat의 notice 알림으로 모두에게 알린다(사용자가 "전체에 알림"으로 정함).
-- 닉네임은 profiles에만 있고 게시판, 메모, 순위, 채팅은 그때그때 profiles에서 읽으므로 바꾸면 모두 새 이름으로 보인다.
-- 다시 실행해도 되게 했다.

alter table public.profiles
  add column if not exists rename_tickets integer not null default 1 check (rename_tickets >= 0);

-- 변경권 1장을 산다. 값을 바꾸면 src/game/economy.ts의 RENAME_PRICE도 함께 바꾼다.
create or replace function public.buy_rename_ticket() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  cost constant integer := 100000;
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.gold < cost then
    raise exception 'not enough gold';
  end if;

  update public.profiles
    set gold = gold - cost, rename_tickets = rename_tickets + 1
    where id = me.id
    returning gold, rename_tickets into me.gold, me.rename_tickets;
  return jsonb_build_object('gold', me.gold, 'tickets', me.rename_tickets);
end;
$$;

revoke execute on function public.buy_rename_ticket() from public, anon;
grant execute on function public.buy_rename_ticket() to authenticated;

-- 변경권 1장을 써서 닉네임을 바꾼다. 규칙은 가입 때와 같다(앞뒤 공백을 빼고 2~12자, 다른 사람과 겹치지 않음).
create or replace function public.change_nickname(new_name text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  wanted text := btrim(new_name);
begin
  select * into strict me from public.profiles where id = auth.uid() for update;
  if wanted is null or char_length(wanted) not between 2 and 12 then
    raise exception 'bad name';
  end if;
  if wanted = me.nickname then
    raise exception 'same name';
  end if;
  if me.rename_tickets < 1 then
    raise exception 'no ticket';
  end if;
  if exists (select 1 from public.profiles where nickname = wanted) then
    raise exception 'name taken';
  end if;

  begin
    update public.profiles
      set nickname = wanted, rename_tickets = rename_tickets - 1
      where id = me.id;
  exception when unique_violation then
    -- 위에서 확인한 뒤 같은 순간에 다른 사람이 먼저 가져갔다.
    raise exception 'name taken';
  end;

  perform realtime.send(
    jsonb_build_object('kind', 'rename', 'id', me.id, 'from', me.nickname, 'to', wanted),
    'notice',
    'world-chat',
    true
  );
  return wanted;
end;
$$;

revoke execute on function public.change_nickname(text) from public, anon;
grant execute on function public.change_nickname(text) to authenticated;

notify pgrst, 'reload schema';

-- 열린 세상(2026-11-11 사용자 요청): 블록과 꾸미기는 모든 맵에 놓고, 공격은 시작마을에서만 막고, 채팅은 같은 맵끼리만 본다.
-- 블록과 꾸미기는 이제 누구나 무제한으로 가져서 상점에서 팔지 않는다(shop_items 표와 buy_item 함수는 남겨 두지만 쓰지 않는다).
-- 다시 실행해도 되게 했다.

-- 블록은 어느 맵에든 놓는다. 아래 블록이 있어야 쌓는 조건은 그대로다.
drop policy if exists "players place blocks" on public.blocks;
create policy "players place blocks" on public.blocks
  for insert to authenticated with check (
    placed_by = auth.uid()
    and (z = 0 or exists (select 1 from public.blocks below
      where below.map = blocks.map and below.x = blocks.x and below.y = blocks.y and below.z = blocks.z - 1)));

-- 채팅은 맵마다 따로인 chat:<맵> 채널로 보낸다. 클라이언트는 그 채널을 읽기만 할 수 있어 닉네임을 사칭할 수 없다.
drop policy if exists "players read world channels" on realtime.messages;
create policy "players read world channels" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'world-chat' or realtime.topic() like 'world:%' or realtime.topic() like 'chat:%');

create or replace function public.send_chat(message text) returns void
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
    'chat:' || place,
    true
  );
end;
$$;

-- 공격은 시작마을(plains)에서만 막는다. 나머지는 20261111020000_casino.sql과 같다.
create or replace function public.hit_player(target uuid, weapon text default 'pistol') returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  attacker public.profiles%rowtype;
  victim public.profiles%rowtype;
  arm public.weapons%rowtype;
  damage integer;
  remaining integer;
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;

  select * into arm from public.weapons where id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict attacker from public.profiles where id = auth.uid();
  if attacker.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if not weapon = any(attacker.owned_weapons) then
    raise exception 'weapon not owned';
  end if;
  -- 네트워크 지연으로 몰려 오는 요청을 감안해 발사 간격의 60%까지 봐준다.
  if attacker.last_hit_at > now() - arm.cooldown_ms * interval '0.6 milliseconds' then
    raise exception 'too fast';
  end if;

  select * into victim from public.profiles where id = target;
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map = 'plains' then
    return null;
  end if;

  update public.profiles set last_hit_at = now() where id = attacker.id;

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  -- 피해는 정수라서 소수점 아래는 그 확률만큼 1을 더한다. 그래야 0.1%씩 쌓인 스텟도 평균에 그대로 반영된다.
  damage := greatest(1, floor(arm.damage * (1 + attacker.str * 0.001) * 1000 / (1000 + victim.def) + random()::numeric));

  update public.profiles set hp = greatest(hp - damage, 0) where id = target returning hp into remaining;

  -- world-chat은 클라이언트가 쓸 수 없는 채널이라 체력 값을 위조할 수 없다.
  perform realtime.send(
    jsonb_build_object('id', target, 'hp', remaining, 'max', victim.max_hp),
    'hp',
    'world-chat',
    true
  );

  if remaining = 0 then
    perform public.gain_exp(attacker.id, 10000);
  end if;
  return remaining;
end;
$$;

notify pgrst, 'reload schema';

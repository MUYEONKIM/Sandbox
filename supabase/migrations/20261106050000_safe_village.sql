-- 시작마을(평원)은 비무장지대다. 공격은 피해를 주지 않고 블록은 놓이지 않는다.
-- 다른 맵을 막거나 풀려면 src/game/maps.ts의 safe도 함께 바꾼다.
drop policy "players place blocks" on public.blocks;

create policy "players place blocks" on public.blocks
  for insert to authenticated with check (placed_by = auth.uid() and map <> 'plains');

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

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 25)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  damage := greatest(1, round(arm.damage * (1 + attacker.str * 0.1) * 10 / (10 + victim.def)));

  update public.profiles set hp = greatest(hp - damage, 0) where id = target returning hp into remaining;

  -- world-chat은 클라이언트가 쓸 수 없는 채널이라 체력 값을 위조할 수 없다.
  perform realtime.send(
    jsonb_build_object('id', target, 'hp', remaining),
    'hp',
    'world-chat',
    true
  );

  if remaining = 0 then
    perform public.raise_level(attacker.id, ceil(attacker.level * 0.5) + 10);
  end if;
  return remaining;
end;
$$;


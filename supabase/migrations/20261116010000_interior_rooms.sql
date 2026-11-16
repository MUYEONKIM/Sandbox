-- 노동청 안(labor)과 농협 안(farmcoop) 맵의 공격 금지(2026-11-16 사용자 "둘 다 만들어", 디자인 세션 labor-coop-rooms.md).
-- 시작마을 건물 안이라 상점·대장간 안처럼 공격을 막는다(에이전트가 정함). 바꾸는 것은 hit_player의 공격 금지 맵 목록 한 줄뿐이고,
-- 본문은 20261116000000_forge.sql의 hit_player 그대로다. 서버에서 맵 이름을 따로 보는 다른 곳은 없다(대장간 forge_gear의 'smithy'뿐).
-- 되돌리기 쉽다(forge.sql의 hit_player를 다시 실행하면 됨). 표나 칸은 바꾸지 않는다.
--
-- 함께 나가는 건물 안 다시 꾸미기(상점, 도박장, 증권거래소, 아이티공간 1·4층, 옥상)는 SQL이 없지만 소품이 바닥 65칸을 차지한다.
-- 실행 전 확인: 아래 select만 따로 실행해 그 칸에 이미 놓인 블록이 있는지 본다. 결과가 있으면 그 블록이 소품과 겹쳐 보인다.
--    select map, x, y, z, block from public.blocks where (map, x, y) in (values
--      ('mart', 15, 15), ('mart', 15, 16), ('mart', 15, 17), ('mart', 15, 20), ('mart', 20, 15), ('mart', 21, 15), ('mart', 22, 15), ('mart', 23, 15),
--      ('mart', 28, 15), ('mart', 15, 26), ('mart', 28, 20), ('mart', 28, 24), ('casino', 13, 14), ('casino', 13, 15), ('casino', 13, 16), ('casino', 13, 28),
--      ('casino', 13, 29), ('casino', 14, 13), ('casino', 28, 13), ('casino', 29, 13), ('casino', 21, 25), ('casino', 22, 25), ('casino', 21, 26), ('casino', 22, 26),
--      ('casino', 18, 27), ('exchange', 13, 15), ('exchange', 13, 16), ('exchange', 13, 18), ('exchange', 13, 19), ('exchange', 13, 21), ('exchange', 13, 22), ('exchange', 13, 24),
--      ('exchange', 13, 25), ('exchange', 17, 17), ('exchange', 27, 17), ('tower1', 25, 13), ('tower1', 26, 13), ('tower1', 32, 13), ('tower4', 26, 3), ('tower4', 27, 3),
--      ('tower4', 36, 3), ('tower4', 38, 3), ('tower4', 39, 3), ('tower4', 40, 3), ('tower4', 3, 10), ('tower4', 3, 11), ('tower4', 3, 12), ('tower4', 3, 13),
--      ('tower4', 3, 15), ('rooftop', 6, 5), ('rooftop', 7, 5), ('rooftop', 6, 6), ('rooftop', 7, 6), ('rooftop', 9, 5), ('rooftop', 10, 5), ('rooftop', 9, 6),
--      ('rooftop', 10, 6), ('rooftop', 16, 3), ('rooftop', 17, 3), ('rooftop', 19, 3), ('rooftop', 20, 3), ('rooftop', 22, 3), ('rooftop', 23, 3), ('rooftop', 25, 3),
--      ('rooftop', 26, 3)
--    ) order by map, x, y, z;

create or replace function public.hit_player(
  target uuid, weapon text default 'pistol', gear bigint default null, shot bigint default null, pellets integer default 1
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  attacker public.profiles%rowtype;
  victim public.profiles%rowtype;
  arm public.weapons%rowtype;
  g public.gear%rowtype;
  lvl integer := 0;
  cur_mag integer;
  cur_mag_at timestamptz;
  cur_shot bigint;
  cur_pellets integer;
  damage bigint;
  remaining bigint;
  victim_karma integer;
  attacker_karma integer;
  share numeric;
  loot record;
  take integer;
  taken jsonb := '[]'::jsonb;
  gold_take numeric := 0;
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;

  select * into arm from public.weapons as x where x.id = weapon;
  if not found then
    raise exception 'unknown weapon';
  end if;
  if pellets is null or pellets < 1 or pellets > arm.pellets then
    raise exception 'too many pellets';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict attacker from public.profiles where id = auth.uid();
  if attacker.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if weapon = 'pistol' then
    cur_mag := attacker.pistol_mag;
    cur_mag_at := attacker.pistol_mag_at;
    cur_shot := attacker.pistol_shot;
    cur_pellets := attacker.pistol_pellets;
  else
    if hit_player.gear is null then
      select * into g from public.gear as x where x.player = attacker.id and x.kind = weapon order by x.id limit 1 for update;
    else
      select * into g from public.gear as x where x.id = hit_player.gear and x.player = attacker.id and x.kind = weapon for update;
    end if;
    if not found then
      raise exception 'weapon not owned';
    end if;
    lvl := g.level;
    cur_mag := g.mag_used;
    cur_mag_at := g.mag_at;
    cur_shot := g.last_shot;
    cur_pellets := g.shot_pellets;
  end if;

  select * into victim from public.profiles where id = target;
  -- 공격 금지: 시작마을과 그 안의 상점(mart)·대장간(smithy)·노동청(labor)·농협(farmcoop) 안 맵.
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'mart', 'smithy', 'labor', 'farmcoop') then
    return null;
  end if;

  if shot is not null and shot = cur_shot then
    -- 같은 사격의 다른 사람(산탄): 간격과 탄창은 이미 셌다. 알 수 합만 본다.
    if cur_pellets + pellets > arm.pellets then
      raise exception 'too many pellets';
    end if;
    cur_pellets := cur_pellets + pellets;
  else
    -- 네트워크 지연으로 몰려 오는 요청을 감안해 발사 간격의 60%까지 봐준다.
    if attacker.last_hit_at > now() - arm.cooldown_ms * interval '0.6 milliseconds' then
      raise exception 'too fast';
    end if;
    if arm.magazine is not null then
      -- 재장전 시간의 80%를 쉬었으면 재장전했을 수 있으니 새 탄창으로 센다.
      if cur_mag_at <= now() - arm.reload_ms * interval '0.8 milliseconds' then
        cur_mag := 0;
      end if;
      if cur_mag >= arm.magazine then
        raise exception 'reloading';
      end if;
      cur_mag := cur_mag + 1;
      cur_mag_at := now();
    end if;
    cur_shot := shot;
    cur_pellets := pellets;
    update public.profiles set last_hit_at = now() where id = attacker.id;
  end if;

  if weapon = 'pistol' then
    update public.profiles
      set pistol_mag = cur_mag, pistol_mag_at = cur_mag_at, pistol_shot = cur_shot, pistol_pellets = cur_pellets
      where id = attacker.id;
  else
    update public.gear as x
      set mag_used = cur_mag, mag_at = cur_mag_at, last_shot = cur_shot, shot_pellets = cur_pellets
      where x.id = g.id;
  end if;

  if random() < least(0.6, victim.agi::numeric / (victim.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', target), 'dodge', 'world-chat', true);
    return victim.hp;
  end if;

  -- 피해는 정수라서 소수점 아래는 그 확률만큼 1을 더한다. 체력보다 큰 피해는 체력만큼으로 줄여 bigint를 넘지 않게 한다.
  damage := least(victim.hp, greatest(1, floor(
    arm.damage * pellets * power(1.03::numeric, lvl) * (1 + attacker.str * 0.001) * 1000 / (1000 + victim.def) + random()::numeric
  )));

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
    update public.profiles set kills = kills + 1 where id = attacker.id;
    update public.profiles set deaths = deaths + 1 where id = target;

    victim_karma := public.karma_now(victim.karma, victim.karma_at);
    attacker_karma := public.karma_now(attacker.karma, attacker.karma_at);

    if victim_karma > 0 then
      -- 현상범을 잡았다: 현상금을 넘기고 현상범의 악업을 1 내린다. 잡은 사람의 악업은 그대로다.
      share := case victim_karma when 1 then 0.01 when 2 then 0.05 when 3 then 0.10 when 4 then 0.20 else 0.30 end;
      for loot in select item, count from public.stash where player = target loop
        take := floor(loot.count * share);
        continue when take <= 0;
        -- share가 1보다 작아 take는 늘 count보다 작으므로 0개가 남는 일은 없다.
        update public.stash set count = count - take where player = target and item = loot.item;
        insert into public.stash (player, item, count) values (attacker.id, loot.item, take)
          on conflict (player, item) do update set count = public.stash.count + excluded.count;
        taken := taken || jsonb_build_object('item', loot.item, 'count', take);
      end loop;
      gold_take := floor(victim.gold * share);
      update public.profiles set gold = gold - gold_take, karma = victim_karma - 1, karma_at = now() where id = target;
      update public.profiles set gold = gold + gold_take where id = attacker.id;
      perform realtime.send(
        jsonb_build_object('killer', attacker.id, 'victim', target, 'gold', gold_take::text, 'items', taken),
        'bounty',
        'world-chat',
        true
      );
    else
      update public.profiles set karma = least(attacker_karma + 1, 5), karma_at = now() where id = attacker.id;
    end if;

    -- wanted는 잡힌 사람의 악업 단계(0이면 현상범이 아니었음). 받은 클라이언트는 현상범 명단을 다시 읽는다.
    perform realtime.send(
      jsonb_build_object('kind', 'kill', 'killer', attacker.nickname, 'victim', victim.nickname, 'wanted', victim_karma),
      'notice',
      'world-chat',
      true
    );
  end if;
  return remaining;
end;
$$;

revoke execute on function public.hit_player(uuid, text, bigint, bigint, integer) from public, anon;
grant execute on function public.hit_player(uuid, text, bigint, bigint, integer) to authenticated;

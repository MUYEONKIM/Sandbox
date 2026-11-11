-- 시작마을 도박장(2026-11-11 사용자 요청): 사다리, 홀짝, 달팽이 경주에 골드를 건다.
-- 결과와 배당은 이 함수가 정하고 클라이언트는 연출만 한다. 배당이나 거는 돈 범위를 바꾸면 src/game/casino.ts도 함께 바꾼다.
-- 도박장 안에서는 공격할 수 없다. 다시 실행해도 되게 했다.

-- 한 판마다 남기는 기록. 클라이언트는 읽지 못하고 SQL Editor에서만 본다.
create table if not exists public.bets (
  id bigint generated always as identity primary key,
  player uuid not null references public.profiles (id) on delete cascade,
  game text not null,
  pick text not null,
  amount integer not null,
  outcome text not null,
  payout integer not null,
  created_at timestamptz not null default now()
);

create index if not exists bets_player_created on public.bets (player, created_at desc);
alter table public.bets enable row level security;
revoke all on public.bets from anon, authenticated;

-- 골드를 걸고 결과를 돌려준다: 결과가 반영된 골드, 결과(사다리는 'L3'처럼 출발과 줄 수, 홀짝은 구슬 1~10개, 달팽이는 1등 번호), 돌려받은 골드(건 돈 포함, 지면 0).
-- 사다리: 출발(L, R)이나 줄 수(3, 4) 하나를 맞히면 1.96배, 둘 다(L3, L4, R3, R4) 맞히면 3.97배. 홀짝 1.96배. 달팽이 경주 2.97배.
create or replace function public.place_bet(game text, pick text, amount integer) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  me public.profiles%rowtype;
  side text;
  lines text;
  result text;
  rate numeric := 0;
  won integer;
begin
  if amount is null or amount < 10 or amount > 100000 then
    raise exception 'bad amount';
  end if;

  select * into strict me from public.profiles where id = auth.uid() for update;
  if me.map <> 'casino' then
    raise exception 'not at the casino';
  end if;
  if me.gold < amount then
    raise exception 'not enough gold';
  end if;

  if game = 'ladder' then
    if pick is null or pick not in ('L', 'R', '3', '4', 'L3', 'L4', 'R3', 'R4') then
      raise exception 'bad pick';
    end if;
    side := case when random() < 0.5 then 'L' else 'R' end;
    lines := case when random() < 0.5 then '3' else '4' end;
    result := side || lines;
    if length(pick) = 2 then
      rate := case when pick = result then 3.97 else 0 end;
    else
      rate := case when pick in (side, lines) then 1.96 else 0 end;
    end if;
  elsif game = 'oddeven' then
    if pick is null or pick not in ('odd', 'even') then
      raise exception 'bad pick';
    end if;
    result := (1 + floor(random() * 10))::integer::text;
    rate := case when (result::integer % 2 = 1) = (pick = 'odd') then 1.96 else 0 end;
  elsif game = 'snail' then
    if pick is null or pick not in ('1', '2', '3') then
      raise exception 'bad pick';
    end if;
    result := (1 + floor(random() * 3))::integer::text;
    rate := case when pick = result then 2.97 else 0 end;
  else
    raise exception 'unknown game';
  end if;

  won := floor(amount * rate);
  update public.profiles set gold = gold - amount + won where id = me.id;
  insert into public.bets (player, game, pick, amount, outcome, payout) values (me.id, game, pick, amount, result, won);
  return jsonb_build_object('gold', me.gold - amount + won, 'outcome', result, 'payout', won);
end;
$$;

revoke execute on function public.place_bet(text, text, integer) from public, anon;
grant execute on function public.place_bet(text, text, integer) to authenticated;

-- 도박장 안에서도 공격을 막는다. 나머지는 20261111000000_exp_hp.sql과 같다.
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
  if not found or victim.map <> attacker.map or victim.hp <= 0 or attacker.map in ('plains', 'tower1', 'casino') then
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

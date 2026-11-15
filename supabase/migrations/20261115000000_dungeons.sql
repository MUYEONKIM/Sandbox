-- 던전 두 곳(2026-11-15 사용자 요청): 시작마을 아래 "던전 입장" 포탈에서 던전을 골라 들어가 몬스터를 잡고
-- 골드와 경험치를 받는다. 몬스터 움직임과 체력은 같은 던전 사람끼리 실시간 채널로 나눠 보고(클라이언트),
-- 서버는 잡았을 때의 보상(kill_monster)과 몬스터에게 맞았을 때의 체력(monster_hit)만 정한다.
-- 몬스터 능력치와 보상은 표 값이라 재배포 없이 바꾼다. 아래 값은 임시이고 사용자가 따로 맞춘 값을 알려 주기로 했다.

create table if not exists public.dungeons (
  id text primary key,
  name text not null,
  blurb text not null,
  sort integer not null default 0
);

create table if not exists public.monsters (
  id text primary key,
  dungeon text not null references public.dungeons (id),
  name text not null,
  hp integer not null check (hp > 0),
  -- 한 번 때릴 때의 피해(DEF로 줄어듦)
  damage integer not null check (damage >= 0),
  -- 초당 움직이는 칸 수
  speed numeric not null check (speed > 0),
  -- 공격 간격과 공격이 닿는 거리(칸)
  attack_ms integer not null check (attack_ms >= 200),
  reach numeric not null check (reach > 0),
  -- 이 거리(칸) 안에 사람이 있으면 쫓아온다
  sight numeric not null default 7 check (sight > 0),
  gold integer not null check (gold >= 0),
  exp integer not null check (exp >= 0),
  -- 던전에 한 번에 있는 수
  count integer not null check (count between 0 and 30),
  sort integer not null default 0
);

alter table public.dungeons enable row level security;
alter table public.monsters enable row level security;
revoke all on public.dungeons, public.monsters from anon, authenticated;
grant select on public.dungeons, public.monsters to authenticated;

drop policy if exists "players read dungeons" on public.dungeons;
create policy "players read dungeons" on public.dungeons for select to authenticated using (true);
drop policy if exists "players read monsters" on public.monsters;
create policy "players read monsters" on public.monsters for select to authenticated using (true);

insert into public.dungeons (id, name, blurb, sort) values
  ('meadow', '평원 던전', '오크와 병사가 지키는 풀밭 유적입니다.', 1),
  ('inferno', '지옥 던전', '악마와 피의 괴물이 사는 불바다입니다. 더 세고 더 많이 줍니다.', 2)
on conflict (id) do update set name = excluded.name, blurb = excluded.blurb, sort = excluded.sort;

-- 임시 값: 골드는 체력 1당 약 1.2G, 경험치는 체력 1당 200. 권총을 60% 쯤 쏘고 있으면 작업장 기본 벌이(분당 약 350G,
-- 경험치 6만)의 5배쯤 된다.
insert into public.monsters (id, dungeon, name, hp, damage, speed, attack_ms, reach, sight, gold, exp, count, sort) values
  ('orc', 'meadow', '오크', 60, 4, 1.8, 1200, 1.0, 7, 72, 12000, 8, 1),
  ('soldier', 'meadow', '병사', 90, 6, 1.5, 1400, 1.1, 7, 108, 18000, 6, 2),
  ('demon', 'inferno', '악마', 150, 12, 2.2, 1100, 1.1, 8, 180, 30000, 7, 1),
  ('blood', 'inferno', '피의 괴물', 220, 16, 1.4, 1500, 1.2, 7, 264, 44000, 6, 2)
on conflict (id) do nothing;

alter table public.profiles add column if not exists last_kill_at timestamptz not null default 'epoch';
alter table public.profiles add column if not exists last_monster_hit_at timestamptz not null default 'epoch';

-- 몬스터를 잡은 사람(마지막 한 방)이 부른다. 그 던전에 있고 살아 있어야 받는다.
-- 0.3초 안에 다시 부르면 거절한다(몰아서 부르는 것을 막는 정도이고, 몬스터 체력은 서버가 모른다).
create or replace function public.kill_monster(kind text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  m public.monsters%rowtype;
  p public.profiles%rowtype;
  new_gold integer;
  leveled jsonb;
begin
  select * into m from public.monsters where id = kind;
  if not found then
    raise exception 'unknown monster';
  end if;

  select * into strict p from public.profiles where id = auth.uid() for update;
  if p.map <> m.dungeon then
    raise exception 'not in that dungeon';
  end if;
  if p.hp <= 0 then
    raise exception 'player is down';
  end if;
  if p.last_kill_at > now() - interval '300 milliseconds' then
    raise exception 'too fast';
  end if;

  update public.profiles set gold = gold + m.gold, last_kill_at = now() where id = p.id returning gold into new_gold;
  leveled := public.gain_exp(p.id, m.exp);
  return leveled || jsonb_build_object('gold', new_gold, 'gained_gold', m.gold, 'gained_exp', m.exp);
end;
$$;

-- 몬스터에게 맞은 사람이 부른다. 피해는 DEF로 줄고 AGI로 피할 수 있다(사람끼리 싸울 때와 같은 식).
-- 여러 마리가 한꺼번에 때려도 0.15초에 한 번만 받는다. 체력 변화는 world-chat으로 모두에게 알린다.
create or replace function public.monster_hit(kind text) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  m public.monsters%rowtype;
  p public.profiles%rowtype;
  dealt integer;
  remaining integer;
begin
  select * into m from public.monsters where id = kind;
  if not found then
    raise exception 'unknown monster';
  end if;

  select * into strict p from public.profiles where id = auth.uid() for update;
  if p.map <> m.dungeon or p.hp <= 0 then
    return null;
  end if;
  if m.damage = 0 or p.last_monster_hit_at > now() - interval '150 milliseconds' then
    return p.hp;
  end if;

  update public.profiles set last_monster_hit_at = now() where id = p.id;

  if random() < least(0.6, p.agi::numeric / (p.agi + 1000)) then
    perform realtime.send(jsonb_build_object('id', p.id), 'dodge', 'world-chat', true);
    return p.hp;
  end if;

  dealt := greatest(1, floor(m.damage * 1000 / (1000 + p.def) + random()::numeric));
  update public.profiles set hp = greatest(hp - dealt, 0) where id = p.id returning hp into remaining;
  perform realtime.send(jsonb_build_object('id', p.id, 'hp', remaining, 'max', p.max_hp), 'hp', 'world-chat', true);
  return remaining;
end;
$$;

-- 던전마다 지금 있는 사람의 닉네임: 최근 2분 안에 그 던전에서 움직였거나 몬스터를 잡은 사람.
create or replace function public.dungeon_roster() returns table (dungeon text, nickname text)
language sql stable security definer set search_path = ''
as $$
  select p.map, p.nickname
  from public.profiles as p
  join public.dungeons as d on d.id = p.map
  where greatest(p.seen_at, p.last_kill_at) > now() - interval '2 minutes'
  order by p.map, p.nickname;
$$;

revoke execute on function public.kill_monster(text), public.monster_hit(text), public.dungeon_roster() from public, anon;
grant execute on function public.kill_monster(text), public.monster_hit(text), public.dungeon_roster() to authenticated;

notify pgrst, 'reload schema';

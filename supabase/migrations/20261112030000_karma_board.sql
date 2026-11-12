-- 악업(카르마)과 현상범, 게시판 말머리(2026-11-12 사용자 요청).
-- 악업: 사람을 죽이면 1씩 올라 최대 5. 현상범(악업 1 이상)을 죽이면 오르지 않는다(현상금 사냥).
--       30분마다 1씩, 그리고 잡힐(죽을) 때마다 1씩 내려간다.
-- 현상금: 현상범이 죽으면 악업 단계에 따라 1 1%, 2 5%, 3 10%, 4 20%, 5 30%의 전리품(종류마다, 소수점 아래 버림)과 골드가 죽인 사람에게 간다.
-- 게시판: 글마다 말머리(일반 general, 건의사항 suggestion)가 붙는다. 공지는 여전히 src/updates.ts다.
-- 다시 실행해도 되게 했다.

alter table public.profiles
  add column if not exists karma smallint not null default 0 check (karma between 0 and 5),
  add column if not exists karma_at timestamptz;

-- 저장된 악업에서 karma_at 뒤로 30분이 지날 때마다 1씩 뺀 지금의 악업. 바꾸면 src/game/karma.ts의 안내 문구도 바꾼다.
create or replace function public.karma_now(karma smallint, karma_at timestamptz) returns integer
language sql stable set search_path = ''
as $$
  select greatest(0, karma - coalesce(floor(extract(epoch from (now() - karma_at)) / 1800)::integer, 0));
$$;

revoke execute on function public.karma_now(smallint, timestamptz) from public, anon, authenticated;

-- 현상범 명단: 지금 악업이 1 이상인 사람. 화면 왼쪽 위 명단과 이름 색에 쓴다.
create or replace function public.wanted_list() returns table (id uuid, nickname text, karma integer)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.nickname, public.karma_now(p.karma, p.karma_at)
  from public.profiles as p
  where public.karma_now(p.karma, p.karma_at) > 0
  order by 3 desc, p.nickname
  limit 50;
$$;

revoke execute on function public.wanted_list() from public, anon;
grant execute on function public.wanted_list() to authenticated;

-- 쓰러뜨리면 악업과 현상금을 처리한다. 나머지는 20261111040000_notices.sql과 같다.
create or replace function public.hit_player(target uuid, weapon text default 'pistol') returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  attacker public.profiles%rowtype;
  victim public.profiles%rowtype;
  arm public.weapons%rowtype;
  damage integer;
  remaining integer;
  victim_karma integer;
  attacker_karma integer;
  share numeric;
  loot record;
  take integer;
  taken jsonb := '[]'::jsonb;
  gold_take integer := 0;
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
        jsonb_build_object('killer', attacker.id, 'victim', target, 'gold', gold_take, 'items', taken),
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

-- 게시판 말머리
alter table public.board_posts
  add column if not exists category text not null default 'general' check (category in ('general', 'suggestion'));

-- 인자가 바뀌므로 예전 함수를 지운다. 남겨 두면 PostgREST가 둘 중 무엇을 부를지 못 고른다.
drop function if exists public.write_post(text);
drop function if exists public.read_board(integer);

-- 글을 쓴다. 나머지는 20261112010000_board.sql과 같다. category를 빼면 일반 글이다.
create or replace function public.write_post(body text, category text default 'general') returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  text_ text := btrim(body);
  new_id bigint;
begin
  if text_ is null or char_length(text_) < 1 or char_length(text_) > 300 then
    raise exception 'bad length';
  end if;
  if write_post.category is null or write_post.category not in ('general', 'suggestion') then
    raise exception 'bad category';
  end if;
  if exists (
    select 1 from public.board_posts
    where author = auth.uid() and created_at > now() - interval '10 seconds'
  ) then
    raise exception 'too fast';
  end if;

  insert into public.board_posts (author, body, category) values (auth.uid(), text_, write_post.category)
    returning id into new_id;
  return new_id;
end;
$$;

-- 최근 글을 how_many개(최대 100) 새 글부터 읽는다. kind를 주면 그 말머리 글만 읽는다.
create or replace function public.read_board(how_many integer, kind text default null)
returns table (id bigint, nickname text, body text, created_at timestamptz, mine boolean, category text)
language sql stable security definer set search_path = ''
as $$
  select b.id, p.nickname, b.body, b.created_at, b.author = auth.uid(), b.category
  from public.board_posts as b
  join public.profiles as p on p.id = b.author
  where kind is null or b.category = kind
  order by b.created_at desc, b.id desc
  limit least(greatest(how_many, 1), 100);
$$;

revoke execute on function public.write_post(text, text) from public, anon;
revoke execute on function public.read_board(integer, text) from public, anon;
grant execute on function public.write_post(text, text) to authenticated;
grant execute on function public.read_board(integer, text) to authenticated;

notify pgrst, 'reload schema';

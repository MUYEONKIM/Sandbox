-- 체력과 피격 판정. hp는 서버 함수만 바꿀 수 있다.
-- 클라이언트의 update 권한은 x, y, map, inventory 컬럼에만 있다.
alter table public.profiles
  add column hp integer not null default 100 check (hp between 0 and 100),
  add column last_hit_at timestamptz;

-- 총알이 다른 플레이어에게 맞았을 때 맞힌 쪽이 호출한다.
-- 피해량과 발사 간격을 서버가 정하므로 클라이언트가 값을 부풀릴 수 없다.
create function public.hit_player(target uuid) returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  shooter public.profiles%rowtype;
  remaining integer;
begin
  if target = auth.uid() then
    raise exception 'invalid target';
  end if;

  -- 서로 동시에 맞혀도 교착되지 않도록 항상 같은 순서로 잠근다.
  perform 1 from public.profiles where id in (auth.uid(), target) order by id for update;

  select * into strict shooter from public.profiles where id = auth.uid();
  if shooter.hp <= 0 then
    raise exception 'shooter is down';
  end if;
  if shooter.last_hit_at > now() - interval '150 milliseconds' then
    raise exception 'too fast';
  end if;

  update public.profiles
    set hp = greatest(hp - 10, 0)
    where id = target and map = shooter.map and hp > 0
    returning hp into remaining;
  if remaining is null then
    return null;
  end if;

  update public.profiles set last_hit_at = now() where id = shooter.id;

  -- world-chat은 클라이언트가 쓸 수 없는 채널이라 체력 값을 위조할 수 없다.
  perform realtime.send(
    jsonb_build_object('id', target, 'hp', remaining),
    'hp',
    'world-chat',
    true
  );
  return remaining;
end;
$$;

-- 쓰러진 플레이어만 체력을 되찾을 수 있다.
create function public.respawn() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.profiles set hp = 100 where id = auth.uid() and hp = 0;
  if found then
    perform realtime.send(
      jsonb_build_object('id', auth.uid(), 'hp', 100),
      'hp',
      'world-chat',
      true
    );
  end if;
end;
$$;

revoke execute on function public.hit_player(uuid) from public, anon;
revoke execute on function public.respawn() from public, anon;
grant execute on function public.hit_player(uuid) to authenticated;
grant execute on function public.respawn() to authenticated;

import type { AuthError, User } from '@supabase/supabase-js';
import type { EconomyData } from '../game/economy';
import { DEFAULT_MAP, isMapId, type WorkId } from '../game/maps';
import { BASE_HP } from '../config';
import { isStat } from '../game/stats';
import { isWeapon } from '../items';
import { BLOCKS, type BlockId } from '../blocks';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  nickname: string;
  map: string;
  x: number;
  y: number;
  hp: number;
  /** 최대 체력. HP 스텟을 살 때마다 1씩 는다. */
  max_hp: number;
  gold: number;
  /** 숫자가 아주 커질 수 있어 문자열로 받는다. */
  level: string;
  /** 지금 레벨에서 모은 경험치 */
  exp: number;
  inventory: unknown;
  str: number;
  def: number;
  agi: number;
  luk: number;
  owned_weapons: string[];
  owned_tools: string[];
  /** 회원가입 때 고른 캐릭터. 옛 계정은 null이다. */
  skin: number | null;
}

const MESSAGES: Record<string, string> = {
  email_provider_disabled: '서버에서 이메일 로그인이 꺼져 있습니다. 관리자에게 문의해 주세요.',
  signup_disabled: '지금은 회원가입을 받지 않습니다.',
  invalid_credentials: '이메일 또는 비밀번호가 맞지 않습니다.',
  email_not_confirmed: '메일함에서 확인 링크를 먼저 눌러 주세요.',
  user_already_exists: '이미 가입된 이메일입니다.',
  email_exists: '이미 가입된 이메일입니다.',
  weak_password: '비밀번호가 너무 약합니다. 6자 이상으로 정해 주세요.',
  validation_failed: '이메일 또는 비밀번호 형식이 맞지 않습니다.',
  email_address_invalid: '사용할 수 없는 이메일입니다.',
  over_request_rate_limit: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  over_email_send_rate_limit: '메일 발송 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.',
};

function describe(error: AuthError) {
  return (error.code && MESSAGES[error.code]) || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

export async function currentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(describe(error));
  return data.user;
}

/** 가입과 동시에 접속되면 사용자를, 메일 확인이 필요하면 null을 돌려준다. */
export async function signUp(email: string, password: string, nickname: string, skin: number): Promise<User | null> {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { nickname, skin } } });
  // 닉네임은 프로필을 만들 때 DB가 검사하므로, 어긋나면 서버 오류(500)로 돌아온다.
  if (error?.status === 500) throw new Error('이미 쓰이는 닉네임입니다. 다른 닉네임을 입력해 주세요.');
  if (error) throw new Error(describe(error));
  return data.session ? data.user : null;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/** 노동청과 상점에서 쓸 작업장, 자원, 무기, 도구, 스텟 표와 내 자원을 읽어 온다. */
export async function loadEconomy(profile: Profile): Promise<EconomyData> {
  const [workplaces, loot, stash, weapons, tools, stats, items] = await Promise.all([
    supabase.from('workplaces').select('id, name, blurb, gather_ms').order('sort'),
    supabase.from('loot').select('item, workplace, name, blurb, price, weight'),
    supabase.from('stash').select('item, count'),
    supabase.from('weapons').select('id, blurb, price, damage, cooldown_ms').order('sort'),
    supabase.from('tools').select('id, workplace, name, blurb, price').order('sort'),
    supabase.from('stats').select('id, name, blurb, base_price, price_step').order('sort'),
    supabase.from('shop_items').select('id, price, amount').order('sort'),
  ]);
  const error = workplaces.error ?? loot.error ?? stash.error ?? weapons.error ?? tools.error ?? stats.error ?? items.error;
  if (error) throw new Error(error.message);
  const { gold, str, def, agi, luk, max_hp: maxHp, owned_weapons: owned, owned_tools: ownedTools } = profile;
  return {
    gold,
    myStats: { str, def, agi, luk, hp: maxHp - BASE_HP },
    owned: owned.filter(isWeapon),
    ownedTools,
    weapons: (weapons.data ?? []).flatMap(({ id, cooldown_ms: cooldownMs, ...rest }) =>
      isWeapon(id) ? [{ ...rest, id, cooldownMs }] : [],
    ),
    tools: (tools.data ?? []).map(({ workplace, ...rest }) => ({ ...rest, workplace: workplace as WorkId })),
    // 이 버전의 게임이 모르는 블록은 상점에 내놓지 않는다.
    items: (items.data ?? []).flatMap(({ id, ...rest }) => (Object.hasOwn(BLOCKS, id) ? [{ ...rest, id: id as BlockId }] : [])),
    stats: (stats.data ?? []).flatMap(({ id, base_price: basePrice, price_step: priceStep, ...rest }) =>
      isStat(id) ? [{ ...rest, id, basePrice, priceStep }] : [],
    ),
    loot: loot.data ?? [],
    stash: stash.data ?? [],
    workplaces: (workplaces.data ?? []).map(({ id, name, blurb, gather_ms: gatherMs }) => ({
      id: id as WorkId,
      name,
      blurb,
      gatherMs,
    })),
  };
}

export async function loadProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, map, x, y, hp, max_hp, gold, level::text, exp, inventory, str, def, agi, luk, owned_weapons, owned_tools, skin')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  // 없어진 맵(행복 아파트 등)에 저장된 플레이어는 시작마을에서 시작한다.
  return isMapId(data.map) ? data : { ...data, map: DEFAULT_MAP };
}

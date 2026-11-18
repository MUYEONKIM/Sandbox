import { formatNumber } from './level';
import { adventureState, type AdvView, type AdvWeapon, type AdvZone } from '../net/adventure';
import type { AdvPower } from './adventureRules';

/**
 * 모험 창, 모험 필드, 전투 화면이 함께 보는 서버 값(2026-11-17, 기획 docs/balance/dungeon-rework.md).
 * 서버 함수가 돌려주는 창 값(AdvView)을 들고 있고, 바뀌면 version을 올려 듣는 곳에 알린다.
 */
export class Adventure {
  view: AdvView | null = null;
  /** 컬렉션 무기 정의(adventure_state가 줄 때마다 바꿈) */
  weapons: AdvWeapon[] = [];
  private weaponById = new Map<string, AdvWeapon>();
  /** 값이 바뀔 때마다 오른다. 칸 색처럼 스텟에 따라 셈하는 곳은 이 값이 바뀔 때만 다시 센다. */
  version = 0;
  private readonly listeners = new Set<() => void>();

  onChange(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  set(view: AdvView) {
    this.view = view;
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** 서버에서 다시 읽는다. 아직 안 본 끝난 판(BP 0)이 있으면 그 결과를 돌려준다(한 번만 온다). 실패하면 오류 글. */
  async refresh() {
    const view = await adventureState();
    if (typeof view === 'string') return view;
    const { result, weapons, ...rest } = view;
    if (weapons) {
      this.weapons = weapons;
      this.weaponById = new Map(weapons.map((w) => [w.id, w]));
    }
    this.set(rest);
    return result ?? null;
  }

  /** 전투에 쓰는 지금 스텟. 서버 adventure_power와 같은 값이다. */
  get power(): AdvPower | null {
    const p = this.view?.power;
    return p ? { hp: p.hp, atk: p.atk, def: p.def, agi: p.agi, luc: p.luc, fx: p.fx } : null;
  }

  /** 이 맵이 속한 지역(지역 하나가 맵 여럿일 수 있음) */
  zoneOfMap(map: string): AdvZone | undefined {
    return this.view?.zones.find((z) => z.map === map || z.maps?.includes(map));
  }

  weapon(id: string | null | undefined) {
    return id ? this.weaponById.get(id) : undefined;
  }

  /** 가진 무기와 가진 수 */
  copies(id: string) {
    return this.view?.collection.find((c) => c.weapon === id)?.copies ?? 0;
  }

  get bosses() {
    return this.view?.bosses.length ?? 0;
  }
}

/** 서버가 글자로 보낸 큰 수(또는 number)를 "123,456"처럼 쓴다(formatNumber). 소수점 아래는 버린다. */
export function bigText(value: number | string) {
  try {
    return formatNumber(typeof value === 'string' ? BigInt(value) : Math.floor(Math.max(0, value)));
  } catch {
    return String(value);
  }
}

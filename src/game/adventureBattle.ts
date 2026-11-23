import { battleBg, DEFAULT_HELD, HERO_ART, heldWeapon, loadAdventureArt, loadMapBg, WEAPON_CELL, weaponIcon as weaponIconOf, type AdventureArt } from '../art/adventureArt';
import { FORGE_HELD, FORGE_HELD_SIZE } from '../art/forgeArt';
import type { AdvBattle } from '../net/adventure';
import { bigOf } from '../ui/countUp';
import { element } from '../ui/dom';
import { playResult, type ResEls, type ResultAnim } from '../ui/resultAnim';
import { formatNumber } from './level';
import { bigText } from './adventure';
import { monsterArt, type MonsterFrame, type MonsterRole } from './adventureMaps';
import { BP_RUN } from './adventureRules';

/**
 * 모험 2D 전투 화면(2026-11-17, 기획 5장, 디자인 세션 시안 adventure-ui.md 2장, 바탕은 art-source/adventure/ui/battle.ts).
 * 창 하나: 위에 장소와 BP, 양쪽 이름·레벨·체력 막대, 가운데 240×135 도트 무대(2배 백버퍼), 아래 결과 줄.
 * 서버가 정한 차례 목록을 시간표로 바꿔 그린다. 건너뛰기는 없다(2026-11-17 모험 손보기, 사용자 "건너뛰기 버튼은 존재하면 안된다").
 * 끝나면 결과 줄을 보이고 1.2초 뒤 저절로 닫힌다. 그 전에 누르거나 Space·Enter·Esc를 누르면 먼저 닫힌다(전투가 다 끝난 뒤라 건너뛰기가 아니다).
 * requestAnimationFrame은 연출 동안(1~2초)만 돈다. 끝나면 멈춘다. 전투 창이 떠 있는 동안 Phaser 필드는 GameScene이 재운다.
 * 무대 아래 전투 기록 줄(2026-11-18, 디자인 세션 adventure-battle-fx.md 2장): 맞는 순간에 한 줄씩, DOM은 맞을 때만 바꾼다.
 * 창 뒤에는 들어가기 소용돌이(battleIntro.ts)가 남긴 '노이즈 낀 원래 화면' 배경이 깔리고(장막은 투명), 창은 120ms 동안 나타나며 닫히면 150ms 동안 걷힌다.
 */

const STAGE_W = 240;
const STAGE_H = 135;
const SCALE = 2;
/** 캐릭터가 서는 땅 줄(배경 그림과 같음) */
const GROUND_Y = 111;
const HERO_X = 72;
const FOE_X = 168;
const LUNGE = 10;
const FOE_LUNGE = 8;
const IDLE_MS = 500;
/** 몬스터는 움직임 프레임이 없는 한 장 그림이다(2026-11-18 맵 위 몬스터). 무대에서 일반은 그대로, 중간 보스·보스는 0.8배(디자인 세션 adventure-monsters.md 4절). */
const FOE_SCALE: Record<MonsterRole, number> = { normal: 1, mid: 0.8, boss: 0.8 };
/** 무대에서도 살짝 떠 있다(px)와 흔들림 폭, 한 바퀴(ms) */
const FOE_LIFT = 4;
const FOE_BOB = 1.5;
const FOE_BOB_MS = 1600;
/** 맞았을 때 흔들기(px)와 번쩍임(ms) */
const FOE_SHAKE = 2;
const FOE_FLASH_MS = 70;
/** 한 차례 = clamp(1,500ms ÷ 차례 수, 40, 150). 시작 0.15초, 끝 0.4초(기획 5장, 전투 하나 1~2초). */
const HIT_MIN_MS = 40;
const HIT_MAX_MS = 150;
const FIGHT_MS = 1500;
const LEAD_MS = 150;
const END_MS = 400;
/** 결과 칸을 눌러 끝 모습으로 멈춘 뒤 이만큼 안의 두 번째 누름(빠른 두 번 클릭)은 닫지 않는다(끝 모습을 보이려고, 에이전트가 정함) */
const HOLD_GUARD_MS = 300;
/** 차례가 이보다 많으면 이어진 연타를 숫자 하나("5연타")로 묶는다. */
const MERGE_OVER = 30;

interface Turn {
  by: 'hero' | 'foe';
  damage: number;
  crit?: boolean;
  combo?: number;
  heal?: number;
  endure?: boolean;
  /** 내 차례 뒤 몬스터 남은 체력(서버가 올림한 정수, 이기면 0) */
  foeLeft?: number;
}
interface Timed extends Turn {
  start: number;
  hit: number;
  dur: number;
}

/** 서버 차례 [누구, 피해, 크리티컬, 내 체력, 몬스터 체력]을 연출 차례로. 연타 번호와 흡혈(내 체력이 는 만큼)을 붙인다. */
export function toTurns(battle: AdvBattle): Turn[] {
  const out: Turn[] = [];
  // 서버는 체력을 올림한 정수로 보낸다. 처음 값도 올림해야 흡혈이 없을 때 0이 아닌 회복이 생기지 않는다.
  let prevMy = Math.ceil(battle.me.hp);
  let combo = 0;
  for (const [who, damage, crit, my, mon] of battle.turns) {
    if (who === 0) {
      combo++;
      const heal = my - prevMy;
      out.push({ by: 'hero', damage, crit: crit === 1, combo: combo > 1 ? combo : undefined, heal: heal >= 1 ? heal : undefined, foeLeft: mon });
    } else if (who === 1) {
      combo = 0;
      out.push({ by: 'foe', damage });
    } else {
      const last = out[out.length - 1];
      if (last) last.endure = true;
    }
    prevMy = my;
  }
  return out;
}

function compact(turns: Turn[]) {
  if (turns.length <= MERGE_OVER) return turns;
  const out: Turn[] = [];
  for (const t of turns) {
    const last = out[out.length - 1];
    if (t.by === 'hero' && (t.combo ?? 1) > 1 && last?.by === 'hero') {
      last.damage += t.damage;
      last.combo = t.combo;
      last.crit = last.crit || t.crit;
      last.foeLeft = t.foeLeft;
      if (t.heal) last.heal = (last.heal ?? 0) + t.heal;
    } else out.push({ ...t });
  }
  return out;
}

function schedule(turns: Turn[]) {
  const list = compact(turns);
  const n = Math.max(1, list.length);
  const dur = Math.max(HIT_MIN_MS, Math.min(HIT_MAX_MS, FIGHT_MS / n));
  const events: Timed[] = list.map((turn, i) => {
    const start = LEAD_MS + i * dur;
    return { ...turn, start, dur, hit: start + dur * (turn.by === 'hero' ? 0.35 : 0.5) };
  });
  const end = LEAD_MS + n * dur;
  return { events, end, total: end + END_MS };
}

const easeOut = (t: number) => 1 - (1 - t) ** 2;
const lungeOf = (u: number) => (u < 0.3 ? easeOut(u / 0.3) : u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4);

/** 잰 값(성능 확인용): 연 횟수, 연 데 걸린 시간 합, 그린 장면 수, 그린 시간 합 */
export const battleStats = { opens: 0, openMs: 0, frames: 0, drawMs: 0 };

/** 전투 상대 그림: 몬스터 그림(monsters.json)의 프레임 */
interface Foe {
  frame: MonsterFrame;
  sheet: CanvasImageSource;
  name: string;
  role: MonsterRole;
  /** 그림 해상도 배율(monsters.json scale) */
  k: number;
}

interface Bar {
  fill: HTMLElement;
  lag: HTMLElement;
  text: HTMLElement;
  shown: string;
}

class Stage {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly floats: HTMLElement;
  private readonly flash = document.createElement('canvas');
  private readonly plan: ReturnType<typeof schedule>;
  private spawned = 0;
  private logEnded = false;

  constructor(
    stage: HTMLElement,
    private readonly art: AdventureArt,
    private readonly fight: { map: string; member: number; weapon: { id: string; art: string } | null; foe: Foe | null; heroHp: number; foeHp: number; win: boolean; role: MonsterRole; turns: Turn[] },
    private readonly heroBar: Bar,
    private readonly foeBar: Bar,
    private readonly log: BattleLog,
  ) {
    const canvas = element('', stage, 'canvas') as HTMLCanvasElement;
    canvas.width = STAGE_W * SCALE;
    canvas.height = STAGE_H * SCALE;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.scale(SCALE, SCALE);
    this.floats = element('adv-floats', stage);
    this.plan = schedule(fight.turns);
  }

  get total() {
    return this.plan.total;
  }

  /** 시각 t의 장면. live면 새로 맞은 숫자를 띄운다(건너뛸 때는 숫자를 지운다). */
  render(t: number, live: boolean) {
    const d0 = performance.now();
    const { ctx, fight, plan } = this;
    const bg = battleBg(fight.map);
    if (bg) ctx.drawImage(bg, 0, 0, STAGE_W, STAGE_H);
    else {
      ctx.fillStyle = '#1c1014';
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }
    let heroHp = fight.heroHp;
    let foeHp = fight.foeHp;
    for (const e of plan.events) {
      if (e.hit > t) break;
      // 몬스터 칸은 서버가 준 남은 체력을 쓴다. 반올림한 피해를 빼면 체력이 소수일 때(세기 × 0.8 등) 이겨도 1이 남아 보인다.
      if (e.by === 'hero') foeHp = e.foeLeft ?? foeHp - e.damage;
      else heroHp = e.endure ? 1 : heroHp - e.damage;
      if (e.heal) heroHp = Math.min(fight.heroHp, heroHp + e.heal);
    }
    this.bar(this.heroBar, Math.max(0, heroHp), fight.heroHp);
    this.bar(this.foeBar, Math.max(0, foeHp), fight.foeHp);

    const ended = t >= plan.end;
    const active = plan.events.find((e) => t >= e.start && t < e.start + e.dur);
    const struck = plan.events.find((e) => t >= e.hit && t < e.hit + e.dur * 0.6);

    // 몬스터(한 장 그림): 공격은 앞으로 내밀기, 맞으면 흔들기와 흰 번쩍임, 지면 흐려짐
    const foe = fight.foe;
    let foeDx = 0;
    let foeFlash = false;
    let foeAlpha = 1;
    if (ended && fight.win) {
      foeAlpha = Math.max(0.25, 1 - (t - plan.end) / 350);
    } else if (active?.by === 'foe') {
      foeDx = -FOE_LUNGE * lungeOf((t - active.start) / active.dur);
    } else if (struck?.by === 'hero') {
      foeFlash = t - struck.hit < FOE_FLASH_MS;
      foeDx = (Math.floor((t - struck.hit) / 40) % 2 ? -1 : 1) * FOE_SHAKE;
    }
    if (foe) {
      const w = foe.frame.w * foe.k * FOE_SCALE[foe.role];
      if (foe.role !== 'normal' && !(ended && fight.win)) this.ring(FOE_X, Math.round(w * 0.45));
      this.shadow(FOE_X, Math.max(9, Math.round(w * 0.3)));
      const bob = Math.round(FOE_BOB * Math.sin((2 * Math.PI * t) / FOE_BOB_MS));
      this.monster(foe, FOE_X + foeDx, GROUND_Y - FOE_LIFT + bob, foeFlash, foeAlpha);
    }

    // 내 캐릭터
    let pose = Math.floor(t / IDLE_MS) % 2 ? 'idle1' : 'idle0';
    let heroDx = 0;
    let swing = -0.7;
    if (ended && !fight.win) pose = 'down';
    else if (active?.by === 'hero') {
      const u = (t - active.start) / active.dur;
      pose = u < 0.6 ? 'attack' : pose;
      heroDx = LUNGE * lungeOf(u);
      swing = u < 0.45 ? -1.7 + (u / 0.45) * 2.6 : 0.9;
    } else if (struck?.by === 'foe') {
      pose = 'hit';
      heroDx = -3;
    }
    this.shadow(HERO_X, 9);
    this.hero(pose, HERO_X + heroDx, swing);

    if (live) {
      while (this.spawned < plan.events.length && plan.events[this.spawned].hit <= t) {
        const e = plan.events[this.spawned++];
        this.spawnFloats(e);
        this.log.push(e);
      }
      if (ended && !this.logEnded) {
        this.logEnded = true;
        this.log.end(fight.win, fight.role);
      }
    } else {
      this.spawned = plan.events.length;
      this.floats.replaceChildren();
    }
    battleStats.frames++;
    battleStats.drawMs += performance.now() - d0;
  }

  private bar(bar: Bar, hp: number, max: number) {
    const w = `${(100 * hp) / max}%`;
    if (bar.shown === w) return;
    bar.shown = w;
    bar.fill.style.width = w;
    bar.lag.style.width = w;
    bar.text.textContent = `${bigText(Math.ceil(hp))} / ${bigText(Math.ceil(max))}`;
  }

  private shadow(x: number, rx: number) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let dy = -2; dy <= 2; dy++) {
      const half = Math.round(rx * Math.sqrt(1 - (dy / 3) ** 2));
      ctx.fillRect(Math.round(x - half), GROUND_Y + dy, half * 2, 1);
    }
  }

  /** 보스 발밑의 붉은 고리(살아 있는 동안만) */
  private ring(x: number, rx: number) {
    const { ctx } = this;
    const ry = Math.max(5, Math.round(rx * 0.24));
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2));
      ctx.fillStyle = 'rgba(150,20,30,0.28)';
      ctx.fillRect(Math.round(x - half), GROUND_Y + dy, half * 2, 1);
      ctx.fillStyle = (dy & 1) === 0 ? '#ff5a4a' : '#c83020';
      ctx.fillRect(Math.round(x - half), GROUND_Y + dy, 1, 1);
      ctx.fillRect(Math.round(x + half - 1), GROUND_Y + dy, 1, 1);
    }
    ctx.fillStyle = '#ff5a4a';
    for (let dx = -rx + 2; dx < rx - 2; dx += 3) {
      ctx.fillRect(Math.round(x + dx), GROUND_Y - ry, 2, 1);
      ctx.fillRect(Math.round(x + dx), GROUND_Y + ry, 2, 1);
    }
  }

  private hero(pose: string, x: number, swing: number) {
    const { ctx, art, fight } = this;
    const m = HERO_ART;
    const col = m.poses.indexOf(pose);
    const left = Math.round(x - m.foot.x);
    const top = GROUND_Y - m.foot.y;
    ctx.drawImage(art.heroes, col * m.cell.w, fight.member * m.cell.h, m.cell.w, m.cell.h, left, top, m.cell.w, m.cell.h);
    const hand = m.hand[pose];
    if (!hand) return;
    // 대표 무기(컬렉션)가 있으면 그 그림, 없으면 대장간 손 그림의 장검
    const custom = fight.weapon ? heldWeapon(fight.weapon.id, fight.weapon.art) : null;
    ctx.save();
    ctx.translate(left + hand.x, top + hand.y);
    ctx.rotate(swing + (custom?.turn ?? 0));
    if (custom) ctx.drawImage(art.weapons, custom.sx, custom.sy, WEAPON_CELL, WEAPON_CELL, -custom.grip.x, -custom.grip.y, WEAPON_CELL, WEAPON_CELL);
    else {
      const held = FORGE_HELD[DEFAULT_HELD];
      const S = FORGE_HELD_SIZE;
      ctx.drawImage(art.held, held.col * S, 0, S, S, -held.grip.x, -held.grip.y, S, S);
    }
    ctx.restore();
  }

  /** 몬스터 그림 한 장. 발밑 점(ax, ay)을 (x, footY)에 맞춘다. 줄인 그림이라 이것만 부드럽게 그린다. */
  private monster(foe: Foe, x: number, footY: number, flash: boolean, alpha: number) {
    const { ctx } = this;
    const f = foe.frame;
    const sc = FOE_SCALE[foe.role] * foe.k;
    const dw = f.w * sc;
    const dh = f.h * sc;
    const left = Math.round(x - f.ax * sc);
    const top = Math.round(footY - f.ay * sc);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(foe.sheet, f.x, f.y, f.w, f.h, left, top, dw, dh);
    if (flash) {
      // 맞은 순간 하얗게: 작은 캔버스에 찍고 흰색으로 덮어 그 위에 더한다.
      const c = this.flash;
      c.width = f.w;
      c.height = f.h;
      const g = c.getContext('2d')!;
      g.drawImage(foe.sheet, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(0, 0, f.w, f.h);
      ctx.drawImage(c, 0, 0, f.w, f.h, left, top, dw, dh);
    }
    ctx.restore();
  }

  private spawnFloats(e: Timed) {
    const foe = this.fight.foe;
    const foeTop = foe ? GROUND_Y - FOE_LIFT - foe.frame.ay * foe.k * FOE_SCALE[foe.role] - 4 : GROUND_Y - 50;
    const heroTop = GROUND_Y - HERO_ART.foot.y + 4;
    const add = (cls: string, text: string, x: number, y: number, combo?: string) => {
      const el = element(`adv-float ${cls}`, this.floats);
      el.textContent = text;
      if (combo) element('combo', el, 'span').textContent = combo;
      el.style.left = `${(100 * x) / STAGE_W}%`;
      el.style.top = `${(100 * y) / STAGE_H}%`;
      el.addEventListener('animationend', () => el.remove());
    };
    const n = bigText(e.damage);
    const jitter = ((e.combo ?? 1) - 1) * 7;
    if (e.by === 'hero') {
      add(`to-foe${e.crit ? ' crit' : ''}`, `${n}${e.crit ? '!' : ''}`, FOE_X + jitter, foeTop - jitter * 0.6, e.combo && e.combo > 1 ? `${e.combo}연타` : undefined);
      if (e.heal) add('heal', `+${bigText(e.heal)}`, HERO_X - 10, heroTop + 6);
    } else {
      add(`to-hero${e.crit ? ' crit' : ''}`, `-${n}`, HERO_X, heroTop);
      if (e.endure) add('note', '버팀!', HERO_X, heroTop - 16);
    }
  }
}

/** 전투 기록 줄에 보이는 줄 수 */
const LOG_LINES = 3;
/** 장막이 걷히는 시간(battleIntro LEAVE_MS와 같음) */
const VEIL_LEAVE_MS = 150;

/**
 * 전투 기록 줄: 무대 바로 아래 세 줄 상자. 새 줄은 아래에 붙고 위 줄일수록 흐리다(CSS). 넘치면 맨 위 줄을 지운다.
 * 연타는 한 줄을 고쳐 쓰고, 줄은 공격하는 쪽이 바뀔 때만 새로 생긴다. 전투가 끝나면 이겼는지 한 줄 쓴다.
 */
class BattleLog {
  readonly box: HTMLElement;
  /**
   * 이긴 전투 요약 세 줄(2026-11-19 사용자 "Lv. 115 -> 345 (줄바꿈) Gold 35,377 -> 38,999 (줄바꿈) Status point 4 -> 3,777").
   * 있으면 끝날 때 앞 줄을 지우고 "이겼습니다" 아래에 붙이며, 상자는 네 줄 높이로 늘어난다(.adv-log.summary).
   */
  summary: string[] | null = null;
  private last: { el: HTMLElement; by: 'hero' | 'foe'; hits: number; damage: number; heal: number; crit: boolean } | null = null;

  constructor(parent: HTMLElement) {
    this.box = element('adv-log', parent);
    this.box.setAttribute('aria-live', 'polite');
  }

  private line(cls: string) {
    const el = element(`adv-log-line ${cls}`, this.box, 'p');
    while (this.box.childElementCount > LOG_LINES) this.box.firstElementChild!.remove();
    return el;
  }

  /** 한 차례(머리 위 숫자와 같은 때에 부른다) */
  push(t: Turn) {
    if (t.by === 'hero') {
      // 연타(2연타부터)는 바로 앞 내 줄에 더한다.
      const same = this.last && this.last.by === 'hero' && (t.combo ?? 1) > 1 ? this.last : null;
      if (same) {
        same.hits = Math.max(same.hits + 1, t.combo ?? 0);
        same.damage += t.damage;
        same.heal += t.heal ?? 0;
        same.crit ||= !!t.crit;
      } else {
        this.last = { el: this.line('give'), by: 'hero', hits: Math.max(1, t.combo ?? 1), damage: t.damage, heal: t.heal ?? 0, crit: !!t.crit };
      }
      const cur = this.last!;
      const el = cur.el;
      el.className = `adv-log-line give${cur.crit ? ' crit' : ''}`;
      el.replaceChildren();
      if (cur.crit) {
        element('tag', el, 'span').textContent = '치명타!';
        el.append(' ');
      }
      if (cur.hits > 1) {
        element('combo', el, 'span').textContent = `${cur.hits}연타로`;
        el.append(' ');
      }
      element('', el, 'b').textContent = bigText(cur.damage);
      el.append(' 피해를 줬습니다');
      if (cur.heal >= 1) {
        el.append(' ');
        element('heal', el, 'span').textContent = `체력 +${bigText(cur.heal)}`;
      }
    } else {
      const el = this.line('take');
      element('', el, 'b').textContent = bigText(t.damage);
      el.append(' 피해를 받았습니다');
      this.last = { el, by: 'foe', hits: 1, damage: t.damage, heal: 0, crit: false };
      if (t.endure) {
        this.line('note').textContent = '체력 1로 버텼습니다';
        this.last = null;
      }
    }
  }

  /** 전투가 끝났을 때 */
  end(win: boolean, role: MonsterRole) {
    const text = !win ? '쓰러졌습니다' : role === 'boss' ? '보스를 쓰러뜨렸습니다' : role === 'mid' ? '중간 보스를 쓰러뜨렸습니다' : '이겼습니다';
    this.last = null;
    if (win && this.summary) {
      this.box.replaceChildren();
      this.box.classList.add('summary');
      element('adv-log-line win', this.box, 'p').textContent = text;
      for (const s of this.summary) element('adv-log-line sum', this.box, 'p').textContent = s;
      return;
    }
    this.line(win ? 'win' : 'lose').textContent = text;
  }
}

function fighterCard(parent: HTMLElement, cls: string, name: string, level: string): Bar {
  const box = element(`adv-fighter ${cls}`, parent);
  const head = element('adv-fighter-name', box);
  element('', head, 'b').textContent = name;
  element('adv-fighter-level', head, 'span').textContent = level;
  const bar = element('adv-hp', box);
  const lag = element('adv-hp-lag', bar);
  const fill = element('adv-hp-fill', bar);
  const text = element('adv-hp-text', box);
  return { fill, lag, text, shown: '' };
}

/** BP 점 20개(2줄 × 10, 디자인 세션 시안). 보스를 잡아 20을 넘으면 금빛 점이 오른쪽에 붙고 글씨는 "BP 23"이다. */
export function bpDots(parent: HTMLElement, left: number, total = BP_RUN, label = true) {
  const box = element('adv-bp', parent);
  const grid = element('adv-bp-grid', box);
  const n = Math.max(total, left);
  for (let i = 0; i < n; i++) element(`adv-bp-dot${i < left ? '' : ' spent'}${i >= total ? ' extra' : ''}`, grid);
  if (label) element('adv-bp-text', box, 'span').textContent = left > total ? `BP ${left}` : `BP ${left}/${total}`;
  return box;
}

export interface BattleContext {
  /** 지역 이름(평원) */
  zoneName: string;
  /** 중간 보스와 싸우면 그 방 이름(용암 굴 2) */
  miniName: string | null;
  /** 상대 그림(monsters.json 프레임 id), 임시 이름, 역할 */
  foe: { art: string; name: string; role: MonsterRole } | null;
  /** 필드 캐릭터 번호(0~6) */
  member: number;
  /** 전투 전 판 레벨(글자) */
  levelBefore: string;
  /** 전투 전 판 경험치(글자, 결과 칸 막대의 처음 자리) */
  expBefore: string;
  /** 전투 전 판 금화와 남은 포인트(글자, 이긴 전투 요약 줄) */
  goldBefore: string;
  pointsBefore: string;
  /** 대표 무기(없으면 장검) */
  weapon: { id: string; art: string } | null;
  /** 떨어진 무기(이름, 별, 그림 칸). card는 마우스를 올리거나 누르면 보일 무기 카드를 그린다(컬렉션 카드와 같음) */
  drop: { name: string; star: number; art: string; card?: (parent: HTMLElement) => void } | null;
  /** 뒤에 '노이즈 낀 원래 화면' 배경이 깔려 있으면 장막을 더 어둡게 하지 않는다(battleIntro.ts) */
  onBackdrop?: boolean;
}

/**
 * 전투 창을 띄워 연출하고 결과 칸을 보인다. 스스로 닫히지 않고 결과가 나온 뒤 화면을 누르거나 클릭할 때만 닫힌다
 * (2026-11-19 사용자 "전투 결과창은 자동으로 닫히지 않고, 내가 화면을 터치하거나, 마우스 클릭을 할 시 에만 닫힌다", 예전 이김 0.5초·짐 1초 뒤 닫힘).
 * 전투 창 어디를 눌러도 된다. 이김은 결과 숫자가 오르는 중이면 첫 누름에 끝 모습으로 멈추고 다음 누름에 닫힌다(2026-11-18 사용자 결과 칸 클릭 규칙).
 * 키는 받지 않는다(2026-11-18 사용자). 얻은 무기 칸은 마우스를 올리거나 누르면 카드가 보이고, 그 칸을 눌러서는 닫히지 않는다.
 * 장막은 닫힌 뒤 150ms 동안 걷히며 지워진다.
 */
export async function playBattle(parent: HTMLElement, battle: AdvBattle, ctx: BattleContext): Promise<void> {
  // 그 맵 배경은 처음 싸울 때 한 장만 읽는다(싸우기를 누를 때 GameScene이 먼저 받기 시작함). 못 읽으면 어두운 바탕.
  const [art] = await Promise.all([loadAdventureArt(), loadMapBg(battle.mon.map).catch(() => null)]);
  const t0 = performance.now();
  const { mon } = battle;
  // 몬스터 그림은 두 장 가운데 그 몬스터가 있는 것(새 지역 여섯은 monsters-new)
  const found = ctx.foe ? monsterArt(ctx.foe.art) : null;
  const foe: Foe | null = found && ctx.foe ? { frame: found.frame, sheet: found.image, name: ctx.foe.name, role: ctx.foe.role, k: found.meta.scale ?? 1 } : null;
  const veil = element(`adv-battle-veil${mon.boss ? ' boss' : ''}${ctx.onBackdrop ? ' on-backdrop' : ''}`, parent);
  const panel = element(`office adv-battle${mon.boss ? ' boss' : ''}`, veil);
  const head = element('adv-battle-head', panel);
  element('adv-battle-place', head).textContent = ctx.miniName
    ? `${ctx.zoneName} ${ctx.miniName} · 중간 보스 Lv. ${bigText(mon.level)}`
    : mon.boss
      ? `${ctx.zoneName} 보스 · Lv. ${bigText(mon.level)}`
      : `${ctx.zoneName} · 칸 Lv. ${bigText(mon.level)}`;
  // 이 전투로 판이 끝났으면 state는 다음 판 값(BP 20)이라 0을 보인다.
  bpDots(head, battle.ended ? 0 : battle.state.bp);
  const fighters = element('adv-fighters', panel);
  const heroBar = fighterCard(fighters, 'hero', '나', `Lv. ${bigText(ctx.levelBefore)}`);
  // 몬스터 이름 대신 역할(2026-11-19 사용자 "몬스터 이름, 장비이름 굳이 없어도 된다.", "모두 빼기 (추천)")
  const foeBar = fighterCard(fighters, 'foe', mon.kind === 'boss' ? '보스' : mon.kind === 'mini' ? '중간 보스' : '몬스터', `Lv. ${bigText(mon.level)}`);
  const stageBox = element('adv-stage', panel);
  const role: MonsterRole = mon.kind === 'boss' ? 'boss' : mon.kind === 'mini' ? 'mid' : 'normal';
  const log = new BattleLog(panel);
  if (battle.win) {
    // 요약(2026-11-19 사용자). Status point 뒤 값은 나누기 전의 남은 포인트 = 앞 값 + 이번에 얻은 포인트다
    // (사용자 "당연히 분배 되기전의 남은 status point 가 떠야한다": 저절로 나누기가 켜져 있어도 나눈 뒤 값이 아니다).
    const pointsAfter = (bigOf(ctx.pointsBefore) + bigOf(battle.points)).toString();
    log.summary = [
      `Lv. ${bigText(ctx.levelBefore)} -> ${bigText(battle.level)}`,
      `Gold ${bigText(ctx.goldBefore)} -> ${bigText((bigOf(ctx.goldBefore) + bigOf(battle.gold)).toString())}`,
      `Status point ${bigText(ctx.pointsBefore)} -> ${bigText(pointsAfter)}`,
    ];
  }
  const stage = new Stage(stageBox, art, { map: mon.map, member: ctx.member, weapon: ctx.weapon, foe, heroHp: battle.me.hp, foeHp: mon.hp, win: battle.win, role, turns: toTurns(battle) }, heroBar, foeBar, log);
  const result = element(`adv-result ${battle.win ? 'win' : 'lose'}`, panel);
  result.hidden = true;
  const parts = fillResult(result, battle, ctx);
  let anim: ResultAnim | null = null;

  return new Promise((resolve) => {
    let raf = 0;
    let finished = false;
    let closed = false;
    /** 이긴 전투의 결과 숫자 오르기가 끝났는지, 누름으로 끝 모습으로 멈춘 때(바로 닫히지 않게) */
    let animDone = false;
    let heldAt = 0;
    const start = performance.now();
    const close = () => {
      if (closed) return;
      closed = true;
      cancelAnimationFrame(raf);
      anim?.finish();
      window.removeEventListener('keydown', onKey, true);
      // 장막을 150ms 동안 걷는다(그동안 필드가 다시 보인다). 부르는 쪽은 곧바로 필드를 깨운다.
      veil.classList.add('leave');
      window.setTimeout(() => veil.remove(), VEIL_LEAVE_MS);
      resolve();
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      result.hidden = false;
      if (!parts) return;
      // 이긴 전투: 막대·레벨·Level up·들어온 경험치(≤ 2.0초) → 무기 튀어 나오기. 닫기는 누를 때만.
      anim = playResult(parts, {
        from: bigOf(ctx.levelBefore),
        to: bigOf(battle.level),
        expBefore: bigOf(ctx.expBefore),
        gained: bigOf(battle.exp),
        levelText: (n) => bigText(n.toString()),
        numText: formatNumber,
      });
      void anim.done.then(() => (animDone = true));
      // 결과 칸이 창 아래로 넘치면(무기 줄 등, 낮은 화면) 다 보이게 창 안을 내린다(#hud는 건드리지 않게 scrollIntoView 대신).
      if (panel.scrollHeight > panel.clientHeight) panel.scrollTop = panel.scrollHeight;
    };
    const frame = (now: number) => {
      const t = now - start;
      stage.render(t, true);
      if (t < stage.total) raf = requestAnimationFrame(frame);
      else finish();
    };
    /**
     * 전투 창이 떠 있는 동안(연출과 결과 칸 모두) 키와 누르기는 아무것도 하지 않는다. 결과 칸은 스스로 닫힐 때만 닫힌다
     * (2026-11-18 사용자 "결과칸이 닫힐때까지 다른 키를 눌러도 반응 없어야 한다. 다른키를 눌렀다고해서 결과칸이 닫히지 않는다.",
     * 누르기도 같게는 PM이 정함). 게임 키가 맵·채팅·창으로 가지 않게 여기서 막고, 브라우저 키(Ctrl·Alt 조합, F1~F12)는 그대로 둔다.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || /^F\d+$/.test(e.code)) return;
      e.stopPropagation();
      if (/^(Space|Enter|NumpadEnter|Escape|Tab|Arrow\w+)$/.test(e.code)) e.preventDefault();
    };
    // 결과 칸 밖(전투 그림, 어두운 배경)과 연출 중 누르기는 아무것도 하지 않는다. 장막이 화면을 덮고, 누르기가 window까지 올라가
    // Phaser(window의 손 떼기)·HUD로 가지 않게 여기서 멈춘다(닫힌 뒤 캐릭터가 그쪽으로 걷지 않게).
    /**
     * 누르기(2026-11-19 사용자 "화면을 터치하거나, 마우스 클릭을 할 시 에만 닫힌다"): 결과가 나오기 전(연출 중)에는 아무것도 하지 않는다.
     * 이김은 결과 숫자가 오르는 중이면 첫 누름에 끝 모습(마지막 레벨·막대·무기)으로 멈추고(2026-11-18 사용자 "결과팝업이 꺼지는게 아니라,
     * 마지막 레벨이 나온상태로 멈춰있고, 한번더 클릭시 꺼지는 것이다."), 그 뒤 누르면 닫힌다. 오르기가 끝났으면 한 번에 닫힌다. 짐도 한 번에 닫힌다.
     */
    const press = () => {
      if (!finished || closed) return;
      if (parts && !animDone) {
        animDone = true;
        heldAt = performance.now();
        anim?.finish();
        return;
      }
      if (performance.now() - heldAt < HOLD_GUARD_MS) return;
      close();
    };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchend'] as const) {
      veil.addEventListener(type, (e) => {
        if (type === 'pointerdown') e.preventDefault();
        e.stopPropagation();
        if (type === 'click') press();
      });
    }
    window.addEventListener('keydown', onKey, true);
    stage.render(0, true);
    raf = requestAnimationFrame(frame);
    battleStats.opens++;
    battleStats.openMs += performance.now() - t0;
  });
}

/**
 * 결과 칸 2판(디자인 adventure-ui.md 18절, 2026-11-18 사용자가 자세히 정함). 칩·머리글은 없다.
 * 이김: [Lv 312] ······ [+498만] / 보라 막대 / "EXP 지금 / 필요" / 얻은 무기 그림 40px + 별. 무기가 없으면 그 줄이 없다.
 * 짐: "패배" 한 낱말(PM이 정함, BP −3 칩 뺌). 이기면 움직일 것들을 돌려주고 지면 null.
 */
function fillResult(box: HTMLElement, battle: AdvBattle, ctx: BattleContext): ResEls | null {
  box.classList.add('res2');
  if (!battle.win) {
    element('adv-result-word', box, 'span').textContent = '패배';
    return null;
  }
  const top = element('adv-res-top', box);
  const wrap = element('adv-res-lvwrap', top);
  wrap.append('Lv. ');
  const level = element('adv-res-lv', wrap, 'span');
  level.textContent = bigText(ctx.levelBefore);
  const upLayer = element('lvup-layer', wrap);
  const gain = element('adv-res-gain', top, 'span');
  const bar = element('exp adv-res-bar', box);
  const fill = element('exp-fill', bar);
  const flash = element('lv-flash', bar);
  bar.classList.add('lv-anim');
  const exp = element('adv-res-exp', box);
  const drops: HTMLElement[] = [];
  if (battle.drop && ctx.drop) {
    const row = element('adv-res-drops', box);
    const cell = element('adv-res-drop', row);
    const icon = weaponIconOf(ctx.drop.art);
    icon.style.width = '40px';
    icon.style.height = '40px';
    cell.appendChild(icon);
    element('adv-res-star', cell).textContent = '★'.repeat(ctx.drop.star);
    drops.push(cell);
    const card = ctx.drop.card;
    if (card) {
      // 마우스를 올리면 무기 카드(2026-11-19 사용자 "결과창에서 장비를 얻었다면 마우스 호버시 얻은 장비에 대한 정보를 볼 수 있어야 한다").
      // 터치는 칸을 누를 때마다 열고 닫는다. 칸을 눌러서는 전투 창이 닫히지 않는다(에이전트가 정함). 카드는 처음 보일 때 한 번 그린다.
      const tip = element('adv-res-tip', cell);
      tip.hidden = true;
      let drawn = false;
      const show = (on: boolean) => {
        if (on && !drawn) {
          drawn = true;
          card(tip);
        }
        tip.hidden = !on;
      };
      cell.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') show(true);
      });
      cell.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse') show(false);
      });
      // 마우스로 누르면 그대로 보이고, 터치는 누를 때마다 열고 닫는다.
      cell.addEventListener('click', (e) => {
        e.stopPropagation();
        show((e as PointerEvent).pointerType === 'mouse' || tip.hidden !== false);
      });
    }
  }
  return { level, upLayer, fill, flash, gain, exp, drops };
}

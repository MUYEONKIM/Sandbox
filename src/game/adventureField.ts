import Phaser from 'phaser';
import { MAP_SIZE } from '../config';
import { depthOf, tileCenter } from '../iso';
import type { AdvZone } from '../net/adventure';
import { element } from '../ui/dom';
import { equipBlock, statRows, type EquipUi } from '../ui/adventure';
import { bigOf, COUNT, countUp, type Counting } from '../ui/countUp';
import { bigText, type Adventure } from './adventure';
import { bpDots } from './adventureBattle';
import { infernus, lightAt, monstersOf, type AdvMapData, type FieldMonster, type MonsterFrame } from './adventureMaps';
import { formatNumber } from './level';
import type { Tile } from './world';

/**
 * 모험 맵 필드(2026-11-18 맵 위 몬스터, 기획 19장 '몬스터를 맵 위에 두며 바뀌는 것'·'몬스터 한 마리씩, 맵 나누기, 부딪히면 싸움, 레벨업 스텟 창').
 * 몬스터는 정해진 자리(adventureMaps.monstersOf, 서버 adventure_spots와 같은 칸)에 떠 있고 잡아도 사라지지 않는다.
 * 몬스터 칸은 막혀 있고(World.setMonsterTiles), 그 쪽으로 방향 키를 누르거나 몬스터를 누르면 싸운다(GameScene이 bump를 부름).
 * 머리 위 이름표 "Lv. 350"은 한 색이다(회색 이름표는 없앰, 2026-11-19, 경험치 줄어듦을 없애서(사용자 "레벨의 2배가 되더라도, 경험치 못얻거나, 아이템 못얻는건 없다. 무조건 얻는다")). 옆 칸에 서면 이름 줄이 더해진다.
 * 이길 확률과 하는 법 안내는 보이지 않는다(2026-11-18 사용자 "이길 확률 같은건 없애라… 플레이어가 게임하면서 자연스럽게 알아가진다").
 * 위 가운데 HUD: BP 점 20개, [스텟 (P)], [귀환](판이 없으면 [귀환]만) / (일곱 빛 들판) 선 구역의 빛. 판 레벨은 아래 정보 칸에 있다(Hud.setRun).
 * 얽힌 숲 되돌림 칸을 밟으면 hooks.reset.
 * 레벨이 오르면 결과 줄과 함께 스텟 판이 레벨 업 창으로 뜬다(openLevelUp). 떠 있는 동안 필드는 입력을 받지 않는다(GameScene canAct).
 *
 * 성능(기획 13장): 몬스터 그림과 이름표는 맵에 들어올 때 한 번 놓고, 그림자는 바닥 그림에 있다. 0.1초마다 화면 안 몬스터만 흔들림을 셈해
 * 정수 픽셀이 바뀔 때만 y를 바꾸고, 화면 밖 몬스터는 숨긴다(깊이는 그대로라 다시 정렬하지 않음). 이름표 그림은 글·색이 바뀐 것만 바꾼다.
 * HUD(DOM)는 글이 바뀔 때만 고친다.
 */

/** 흔들림을 다시 세는 간격과 한 바퀴(ms) */
const BOB_TICK_MS = 100;
const BOB_PERIOD_MS = 2400;
/** 옆 몬스터와 흔들림이 어긋나게 하는 위상(몬스터 번호마다) */
const BOB_PHASE = 2.39;
/** 화면 밖 이만큼(월드 px)까지는 미리 보인다. */
const VIEW_MARGIN = 96;
/** 이름표 글씨(월드 px). 그림은 2배로 그려 반으로 줄인다(화면 2배에서 또렷하게). */
const TAG_FONT = 9;
const TAG_RES = 2;
/** 이름표 글 색: 한 가지 #f3e9d2(이길 확률과 상관없음, 디자인 세션이 정함) */
const TAG_COLOR = '#f3e9d2';
/** 가까이 선 몬스터 이름표 위에 더하는 이름 줄(흰 8px) */
const NAME_FONT = 8;

export interface AdventureFieldHooks {
  /** 이 몬스터와 싸운다. */
  fight(monster: FieldMonster): void;
  /** 지금 싸울 수 있는지(창이 열려 있거나 전투 중이면 false) */
  canFight(): boolean;
  /** 되돌림 칸을 밟았다(얽힌 숲): 미로 입구로 옮긴다. */
  reset(): void;
  /** [귀환]을 눌렀다. */
  leave(): void;
  /** 전투가 끝나 판 값을 넣는 동안이면 금화 오르기를 기다릴 ms(배경이 걷히는 동안), 아니면 null(바로 바꿈) */
  goldDelay(): number | null;
}

export interface FieldMap {
  id: string;
  data: AdvMapData;
  /** 지역(입구 맵이면 null) */
  zone: AdvZone | null;
}

interface Floating {
  m: FieldMonster;
  frame: MonsterFrame;
  image: Phaser.GameObjects.Image;
  tag: Phaser.GameObjects.Image;
  /** 흔들림 0일 때 y, 흔들림 폭, 위상 */
  baseY: number;
  bob: number;
  phase: number;
  shownBob: number;
  shown: boolean;
  /** 이름표 그림 키(바뀔 때만 다시 그림) */
  tagKey: string;
  /** 보이는지 볼 때 쓰는 월드 자리 */
  cx: number;
  top: number;
  bottom: number;
}

/** 레벨 업 창으로 뜬 스텟 판 */
interface LevelUp {
  from: string;
  to: string;
  gained: string;
  onKey: (e: KeyboardEvent) => void;
  recommend: HTMLButtonElement | null;
}

export class AdventureField {
  private readonly hud: HTMLElement;
  private readonly row1: HTMLElement;
  private readonly lightRow: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly floats: Floating[] = [];
  /** 칸 번호 → 그 칸 둘레의 몬스터(이름 줄을 보일 몬스터, 가까운 쪽) */
  private readonly nearAt = new Map<number, number>();
  /** 칸 번호 → 그 칸에 선 몬스터 */
  private readonly onTile = new Map<number, number>();
  private readonly resets = new Set<number>();
  private readonly timer: Phaser.Time.TimerEvent;
  private readonly offChange: () => void;
  private near = -1;
  private here: Tile | null = null;
  private levelUp: LevelUp | null = null;
  private shownRow1 = '';
  /**
   * 위 HUD 금화(2026-11-18 사용자 "보이게 하기", BP 점 옆). goldEl은 숫자 칸, goldShown은 보이는(오르기가 끝나면 보일) 값.
   * 전투 뒤에는 배경이 걷힌 뒤 앞 값에서 새 값으로 450ms 동안 오르고 튄다(결과 칸 2판에서 금화 칩이 빠져 금화가 오르는 모습은 여기서 보인다, PM 2026-11-18).
   */
  private goldEl: HTMLElement | null = null;
  private goldShown: bigint | null = null;
  private goldCount: Counting | null = null;
  private goldTimer = 0;
  private shownLight = '';
  private panelVersion = -1;
  /** 스텟 판 맨 위 장착 칸의 화면 상태(목록 열림, 거르기, 고른 무기). 판을 다시 그려도 남긴다. */
  private readonly equipUi: EquipUi = { open: false, filter: null, sel: null, scroll: 0 };
  /** 잰 값(성능 확인용): 흔들림 계산 횟수·시간·y를 바꾼 수·보인 몬스터 수 */
  readonly bobStats = { ticks: 0, ms: 0, moved: 0, visible: 0 };

  constructor(
    private readonly scene: Phaser.Scene,
    root: HTMLElement,
    private readonly adventure: Adventure,
    private readonly map: FieldMap,
    private readonly labelDepth: number,
    private readonly hooks: AdventureFieldHooks,
  ) {
    this.hud = element('adv-hud', root);
    this.row1 = element('adv-hud-row', this.hud);
    this.lightRow = element('adv-light', this.hud);
    this.lightRow.hidden = true;
    this.panel = element('adv-stat-panel', root);
    this.panel.hidden = true;
    for (const r of map.data.resets) this.resets.add(r.x + r.y * MAP_SIZE);
    if (map.zone) this.placeMonsters();
    this.timer = scene.time.addEvent({ delay: BOB_TICK_MS, loop: true, callback: () => this.bobTick() });
    this.offChange = adventure.onChange(() => {
      this.repaintTags();
      this.paint();
      if (!this.panel.hidden) this.paintPanel();
    });
  }

  /** 맵 위 몬스터들(World 몬스터 칸으로 막는다) */
  get monsters(): FieldMonster[] {
    return this.floats.map((f) => f.m);
  }

  /** 몬스터 그림과 이름표를 놓고, 이름 줄을 보일 칸 표를 만든다. */
  private placeMonsters() {
    const art = infernus();
    if (!art) return;
    const scene = this.scene;
    if (!scene.textures.exists('adv-monsters')) {
      const texture = scene.textures.addImage('adv-monsters', art.monsterSheet)!;
      for (const [id, f] of Object.entries(art.monsters.frames)) texture.add(id, 0, f.x, f.y, f.w, f.h);
      // 그린 그림을 줄인 것이라 계단이 생기지 않게 부드럽게 늘린다(Infernus 조각과 같음).
      texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    const best = new Map<number, number>();
    // 고해상도 그림이면 배율만큼 줄여 그려 월드 크기를 같게 한다(monsters.json scale).
    const k = art.monsters.scale ?? 1;
    monstersOf(this.map.id).forEach((m, i) => {
      const frame = art.monsters.frames[m.art];
      const role = art.monsters.roles[frame.role];
      const c = tileCenter(m.x, m.y);
      const baseY = c.y - role.lift;
      const image = scene.add
        .image(c.x, baseY, 'adv-monsters', m.art)
        .setOrigin(frame.ax / frame.w, frame.ay / frame.h)
        .setScale(k)
        .setDepth(depthOf(m.x, m.y) + 0.5);
      const tag = scene.add.image(c.x, baseY - frame.h * k - 2, '__DEFAULT').setOrigin(0.5, 1).setScale(1 / TAG_RES).setDepth(this.labelDepth);
      this.floats.push({ m, frame, image, tag, baseY, bob: role.bob, phase: i * BOB_PHASE, shownBob: 0, shown: true, tagKey: '', cx: c.x, top: baseY - frame.h * k - 30, bottom: c.y + 8 });
      this.onTile.set(m.x + m.y * MAP_SIZE, i);
      // 둘레 8칸: 이름 줄을 보이는 칸. 둘이 겹치면 더 가까운 몬스터(몬스터끼리 5칸 넘게 떨어져 있어 거의 없음).
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = m.x + dx;
          const y = m.y + dy;
          if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) continue;
          const key = x + y * MAP_SIZE;
          const d = Math.abs(dx) + Math.abs(dy);
          if (best.has(key) && best.get(key)! <= d) continue;
          best.set(key, d);
          this.nearAt.set(key, i);
        }
      }
    });
    for (const f of this.floats) this.paintTag(f);
  }

  /** 들어온 칸에서 시작한다(맵에 들어올 때, 되돌림 칸으로 옮겼을 때). */
  enter(tile: Tile) {
    this.here = { ...tile };
    this.setNear(this.nearAt.get(tile.x + tile.y * MAP_SIZE) ?? -1);
    this.paint();
    this.bobTick();
  }

  /** 한 칸 걸었다. 걷기는 BP를 쓰지 않는다. 곁의 몬스터가 바뀌면 이름 줄을 고친다. */
  step(tile: Tile) {
    if (this.here && this.here.x === tile.x && this.here.y === tile.y) return;
    this.here = { ...tile };
    const key = tile.x + tile.y * MAP_SIZE;
    if (this.resets.has(key)) {
      this.hooks.reset();
      return;
    }
    this.setNear(this.nearAt.get(key) ?? -1);
    this.paint();
  }

  /** 이 칸에 선 몬스터 */
  monsterAt(tile: Tile): FieldMonster | null {
    return this.floats[this.onTile.get(tile.x + tile.y * MAP_SIZE) ?? -1]?.m ?? null;
  }

  /** 누른 곳(월드 좌표)에 그림이 있는 몬스터. 그림을 눌러도 칸을 눌러도 된다. 겹치면 앞(아래)에 그린 것. */
  monsterAtPoint(wx: number, wy: number): FieldMonster | null {
    let hit: Floating | null = null;
    for (const f of this.floats) {
      if (!f.shown) continue;
      const half = f.image.displayWidth / 2;
      const top = f.image.y - f.image.displayHeight * f.image.originY;
      if (wx < f.cx - half || wx > f.cx + half || wy < top || wy > f.bottom) continue;
      if (!hit || f.baseY > hit.baseY) hit = f;
    }
    return hit?.m ?? null;
  }

  /** 몬스터 칸에 부딪혔다: 싸울 수 있으면 싸운다. 싸우면 true. */
  bump(tile: Tile) {
    const target = this.monsterAt(tile);
    const view = this.adventure.view;
    if (!target || !view?.inRun || view.bp <= 0 || !this.hooks.canFight()) return false;
    this.hooks.fight(target);
    return true;
  }

  /** 몬스터 몸 가운데(월드 좌표, 흔들림 빼고). 전투 들어가기 소용돌이의 가운데로 쓴다. */
  bodyOf(m: FieldMonster) {
    const f = this.floats.find((x) => x.m === m);
    if (!f) return null;
    return { x: f.cx, y: f.baseY - f.image.displayHeight / 2 };
  }

  /** 스텟 판(P)을 열고 닫는다. 레벨 업 창으로 떠 있으면 P로는 닫지 않는다. */
  toggleStats() {
    if (this.levelUp) return;
    this.panel.hidden = !this.panel.hidden;
    // 판을 닫으면 장착 무기 목록도 닫는다.
    if (this.panel.hidden) Object.assign(this.equipUi, { open: false, sel: null, scroll: 0 });
    if (!this.panel.hidden) {
      this.panelVersion = -1;
      this.paintPanel();
    }
  }

  get statsOpen() {
    return !this.panel.hidden;
  }

  /** 레벨 업 창이 떠 있는지(떠 있는 동안 필드는 입력을 받지 않는다) */
  get levelUpOpen() {
    return this.levelUp !== null;
  }

  /**
   * 레벨 업 창(기획 19장 4번): 이긴 전투로 판 레벨이 오르고 판이 이어질 때, 전투 창이 닫혀 필드로 돌아온 뒤 스텟 판을 띄운다
   * (2026-11-18 사용자 "전투 종료후 스텟창은 맵으로 돌아온 후에 뜬다"). [추천대로 나누고 닫기 (Enter)]는 남은 포인트를 추천대로 나누고 닫는다.
   * [닫기 (Esc)](Space도)는 나누지 않고 닫는다.
   * 키는 창이 먼저 받는다(채팅·점프보다 먼저, window capture).
   */
  openLevelUp(from: string, to: string, gained: string) {
    this.closeLevelUp(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const enter = e.code === 'Enter' || e.code === 'NumpadEnter';
      if (!enter && e.code !== 'Escape' && e.code !== 'Space') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) this.closeLevelUp(enter);
    };
    this.levelUp = { from, to, gained, onKey, recommend: null };
    window.addEventListener('keydown', onKey, true);
    this.panel.classList.add('levelup');
    this.panel.hidden = false;
    this.panelVersion = -1;
    this.paintPanel();
  }

  /** 레벨 업 창을 닫는다. assign이면 남은 포인트를 추천대로 나눈다. */
  private closeLevelUp(assign: boolean) {
    const up = this.levelUp;
    if (!up) return;
    this.levelUp = null;
    window.removeEventListener('keydown', up.onKey, true);
    if (assign && up.recommend && !up.recommend.disabled) up.recommend.click();
    this.panel.classList.remove('levelup');
    this.panel.hidden = true;
    this.panel.replaceChildren();
    Object.assign(this.equipUi, { open: false, sel: null, scroll: 0 });
    this.panelVersion = -1;
  }

  /** 전투가 끝났다. */
  settle() {
    this.paint();
  }

  destroy() {
    this.finishGold();
    this.closeLevelUp(false);
    this.offChange();
    this.timer.remove();
    this.hud.remove();
    this.panel.remove();
    for (const f of this.floats) {
      f.image.destroy();
      f.tag.destroy();
    }
    this.floats.length = 0;
  }

  /**
   * 0.1초마다: 화면 안 몬스터만 흔들림을 세고 정수 픽셀이 바뀔 때만 y를 바꾼다. 화면 밖 몬스터와 이름표는 숨긴다.
   * 전투 중에는 GameScene이 Phaser 루프를 재워 이 일도 쉰다.
   */
  private bobTick() {
    const t0 = performance.now();
    const view = this.scene.cameras.main.worldView;
    const left = view.x - VIEW_MARGIN;
    const right = view.right + VIEW_MARGIN;
    const top = view.y - VIEW_MARGIN;
    const bottom = view.bottom + VIEW_MARGIN;
    const now = this.scene.time.now;
    let visible = 0;
    for (const f of this.floats) {
      const inside = f.cx >= left && f.cx <= right && f.bottom >= top && f.top <= bottom;
      if (inside !== f.shown) {
        f.shown = inside;
        f.image.setVisible(inside);
        f.tag.setVisible(inside);
      }
      if (!inside) continue;
      visible++;
      const bob = Math.round(f.bob * Math.sin((2 * Math.PI * now) / BOB_PERIOD_MS + f.phase));
      if (bob === f.shownBob) continue;
      f.shownBob = bob;
      f.image.y = f.baseY + bob;
      this.bobStats.moved++;
    }
    this.bobStats.ticks++;
    this.bobStats.visible = visible;
    this.bobStats.ms += performance.now() - t0;
  }

  /** 서버 값이 바뀌면 이름표를 맞춘다: 글이 바뀐 이름표만 다시 그린다(paintTag가 키로 거름). */
  private repaintTags() {
    for (const f of this.floats) this.paintTag(f);
  }

  /**
   * 이름표(디자인 세션 adventure-monsters.md 7절 4): "Lv. 350"(일반), "중간 보스 Lv. 2,222", "보스 Lv. 15,000"(줄이지 않은 숫자, 2026-11-18 사용자).
   * 옆 칸에 선 몬스터만 위에 이름 한 줄을 더한다. 그림은 글과 색이 같으면 다시 쓴다.
   */
  private paintTag(f: Floating) {
    const L = f.m.level;
    const near = this.floats[this.near] === f;
    const lv = `Lv. ${formatNumber(L)}`;
    const text = f.m.kind === 'boss' ? `보스 ${lv}` : f.m.kind === 'mini' ? `중간 보스 ${lv}` : lv;
    const name = near ? f.frame.name : '';
    const texKey = `adv-tag|${f.m.kind}|${name}|${text}`;
    if (texKey === f.tagKey) return;
    f.tagKey = texKey;
    if (!this.scene.textures.exists(texKey)) this.scene.textures.addCanvas(texKey, tagCanvas(name, text, TAG_COLOR, f.m.kind));
    f.tag.setTexture(texKey);
  }

  /** 가까이 선 몬스터가 바뀌면 앞뒤 둘의 이름표만 다시 그린다. */
  private setNear(index: number) {
    if (index === this.near) return;
    const before = this.floats[this.near];
    this.near = index;
    if (before) this.paintTag(before);
    const now = this.floats[index];
    if (now) this.paintTag(now);
  }

  /** 위 HUD. 글이 바뀔 때만 DOM을 고친다. */
  private paint() {
    const view = this.adventure.view;
    // 판이 끝났으면 서버 값의 BP는 다음 판 값(20)이라 0을 보인다(결과 화면이 곧 뜬다).
    const bp = view?.inRun ? view.bp : 0;
    const points = view?.points ?? '0';
    // 판 레벨은 아래 정보 칸으로 옮겼다(디자인 adventure-ui.md 14절). 판이 없으면 [귀환]만 둔다.
    const key1 = `${bp}|${view?.inRun}|${points}`;
    if (key1 !== this.shownRow1) {
      this.shownRow1 = key1;
      const r = this.row1;
      r.replaceChildren();
      this.goldEl = null;
      if (view?.inRun) {
        bpDots(r, bp);
        // 금화: "금화" 꼬리표(HUD 글색) + 청록 숫자(모험 창 상태 줄의 금화와 같은 꼴, 에이전트가 정함)
        const gold = element('adv-hud-gold', r, 'span');
        gold.append('금화 ');
        this.goldEl = element('adv-coin', gold, 'span');
        this.goldEl.textContent = formatNumber(this.goldShown ?? 0n);
        const stats = element('adv-hud-button', r, 'button') as HTMLButtonElement;
        stats.type = 'button';
        stats.textContent = '스텟 (P)';
        stats.addEventListener('click', () => this.toggleStats());
        if (points !== '0') element('adv-badge', stats, 'span').textContent = bigText(points);
      }
      const leave = element('adv-hud-button adv-return', r, 'button') as HTMLButtonElement;
      leave.type = 'button';
      leave.textContent = '귀환';
      leave.addEventListener('click', () => this.hooks.leave());
    }
    this.paintGold(view?.inRun ? bigOf(view.runGold) : null);
    // 일곱 빛 들판: 선 구역의 빛과 보너스(상태). 구역이 바뀔 때만 고친다.
    const lights = this.map.data.lights;
    const li = this.here ? lightAt(lights, this.here.x, this.here.y) : -1;
    const legend = li >= 0 ? lights?.legend[li] : undefined;
    // 글은 맵 자료 legend.hud("exp x 3" 등, 2026-11-18 사용자 "\"이 구역: 경험치 ×3\" 대신 exp x 3 로 쓴다"). 앞말 없이 빛 색 네모와 함께.
    const text = legend ? (legend.hud ?? legend.bonus) : '';
    const light = legend ? `${legend.color}|${text}` : '';
    if (light !== this.shownLight) {
      this.shownLight = light;
      this.lightRow.replaceChildren();
      this.lightRow.hidden = !legend;
      if (legend) {
        element('adv-light-dot', this.lightRow, 'span').style.background = legend.color;
        this.lightRow.append(text);
      }
    }
  }

  /** 금화 숫자. 바뀔 때만 고치고, 전투 뒤 늘면(goldDelay) 기다렸다가 450ms 동안 오른다. 판이 없으면 칸이 없다. */
  private paintGold(gold: bigint | null) {
    if (gold === this.goldShown) return;
    const from = this.goldShown;
    this.finishGold();
    this.goldShown = gold;
    const el = this.goldEl;
    if (gold === null || !el) return;
    const delay = this.hooks.goldDelay();
    if (from === null || gold < from || delay === null) {
      el.textContent = formatNumber(gold);
      return;
    }
    const start = () => {
      this.goldTimer = 0;
      this.goldCount = countUp([{ el, from, to: gold, fmt: formatNumber }], COUNT.gold, { lockWidth: true, pop: true });
    };
    if (delay > 0) this.goldTimer = window.setTimeout(start, delay);
    else start();
  }

  /** 금화 오르기를 곧바로 끝 값으로(다음 전투를 걸 때) */
  finishGold() {
    if (this.goldTimer) {
      window.clearTimeout(this.goldTimer);
      this.goldTimer = 0;
      if (this.goldEl && this.goldShown !== null) this.goldEl.textContent = formatNumber(this.goldShown);
    }
    this.goldCount?.finish();
    this.goldCount = null;
  }

  private paintPanel() {
    const view = this.adventure.view;
    if (!view || this.panelVersion === this.adventure.version) return;
    this.panelVersion = this.adventure.version;
    this.panel.replaceChildren();
    const up = this.levelUp;
    if (up) {
      // 디자인 시안: "레벨 업"(금빛 18px) / "Lv a → b · 포인트 +n"(포인트 수만 금빛 굵게)
      const head = element('adv-levelup-head', this.panel);
      element('', head, 'b').textContent = '레벨 업';
      const rest = element('', head, 'span');
      rest.append(`Lv. ${bigText(up.from)} → ${bigText(up.to)} · 포인트 `);
      element('', rest, 'em').textContent = `+${bigText(up.gained)}`;
    }
    const say = element('adv-message', document.createElement('div'));
    // 맨 위 장착 칸(디자인 adventure-ui.md 17절 1번, 레벨 업 창도 같은 판). 목록 열기·고르기는 판만 다시 그린다.
    equipBlock(this.panel, this.adventure, view, this.equipUi, (text) => (say.textContent = text), () => {
      this.panelVersion = -1;
      this.paintPanel();
    });
    const recommend = statRows(this.panel, this.adventure, view, true, (text) => (say.textContent = text));
    this.panel.append(say);
    if (up) {
      up.recommend = recommend;
      const row = element('adv-levelup-buttons', this.panel);
      const go = element('adv-btn primary', row, 'button') as HTMLButtonElement;
      go.type = 'button';
      go.textContent = '추천대로 나누고 닫기 (Enter)';
      go.addEventListener('click', () => this.closeLevelUp(true));
      const close = element('adv-btn', row, 'button') as HTMLButtonElement;
      close.type = 'button';
      close.textContent = '닫기 (Esc)';
      close.addEventListener('click', () => this.closeLevelUp(false));
    }
  }
}

/**
 * 몬스터 이름표 그림(디자인 세션 확인 도구 view.js nameTags와 같은 모양): 검은 반투명 판, 보스 빨강·중간 보스 주황 테두리.
 * name이 있으면(가까이 선 몬스터) 위에 흰 이름 한 줄을 더한다. 화면 2배에서 또렷하게 TAG_RES배로 그린다.
 */
function tagCanvas(name: string, text: string, color: string, kind: FieldMonster['kind']) {
  const R = TAG_RES;
  const font = `bold ${TAG_FONT * R}px sans-serif`;
  const nameFont = `bold ${NAME_FONT * R}px sans-serif`;
  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  let textW = measure.measureText(text).width;
  if (name) {
    measure.font = nameFont;
    textW = Math.max(textW, measure.measureText(name).width);
  }
  const w = Math.ceil(textW) + 8 * R;
  const nameH = name ? (NAME_FONT + 2) * R : 0;
  const h = nameH + (TAG_FONT + 4) * R;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.62)';
  g.fillRect(0, 0, w, h);
  if (kind !== 'normal') {
    g.strokeStyle = kind === 'boss' ? '#ff3b30' : '#ffa53a';
    g.lineWidth = R;
    g.strokeRect(R / 2, R / 2, w - R, h - R);
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (name) {
    g.font = nameFont;
    g.fillStyle = '#ffffff';
    g.fillText(name, w / 2, nameH / 2 + R);
  }
  g.font = font;
  g.fillStyle = color;
  g.fillText(text, w / 2, nameH + ((TAG_FONT + 4) * R) / 2 + R / 2);
  return c;
}

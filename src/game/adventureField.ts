import Phaser from 'phaser';
import { MAP_SIZE } from '../config';
import { depthOf, tileCenter } from '../iso';
import { adventureTuning, type AdvZone } from '../net/adventure';
import { adventureArt, loadAdventureArt } from '../art/adventureArt';
import { element } from '../ui/dom';
import type { BossDot } from '../ui/minimap';
import { statRows } from '../ui/adventure';
import { gearKey, gearWindow, type GearUi } from '../ui/adventureGear';
import { bigOf, COUNT, countUp, type Counting } from '../ui/countUp';
import { bigText, type Adventure } from './adventure';
import { bpDots } from './adventureBattle';
import { lightAt, monsterArt, monstersOf, type AdvMapData, type FieldMonster, type MonsterFrame, type MonsterSheet } from './adventureMaps';
import { formatNumber } from './level';
import type { Tile } from './world';
import { sound } from '../sound/engine';

/**
 * 모험 맵 필드(2026-11-18 맵 위 몬스터, 기획 19장 '몬스터를 맵 위에 두며 바뀌는 것'·'몬스터 한 마리씩, 맵 나누기, 부딪히면 싸움, 레벨업 스텟 창').
 * 몬스터는 정해진 자리(adventureMaps.monstersOf, 서버 adventure_spots와 같은 칸)에 떠 있고 잡아도 사라지지 않는다.
 * 몬스터 칸은 막혀 있고(World.setMonsterTiles), 그 쪽으로 방향 키를 누르거나 몬스터를 누르면 싸운다(GameScene이 bump를 부름).
 * 머리 위 이름표 "Lv. 350"은 한 색이다(회색 이름표는 없앰, 2026-11-19, 경험치 줄어듦을 없애서(사용자 "레벨의 2배가 되더라도, 경험치 못얻거나, 아이템 못얻는건 없다. 무조건 얻는다")). 옆 칸에 서면 이름 줄이 더해진다.
 * 이길 확률과 하는 법 안내는 보이지 않는다(2026-11-18 사용자 "이길 확률 같은건 없애라… 플레이어가 게임하면서 자연스럽게 알아가진다").
 * 위 가운데 HUD: BP 점 20개, [스텟 (I)], [귀환](판이 없으면 [귀환]만) / (일곱 빛 들판) 선 구역의 빛. 판 레벨은 아래 정보 칸에 있다(Hud.setRun).
 * 얽힌 숲 되돌림 칸을 밟으면 hooks.reset.
 * 레벨이 오르면 결과 줄과 함께 스텟 판이 레벨 업 창으로 뜬다(openLevelUp). 떠 있는 동안 필드는 입력을 받지 않는다(GameScene canAct).
 * I(HUD [스텟])는 스텟 판과 화면 가운데 장비창(ui/adventureGear.ts)을 함께 열고 닫는다(2026-11-21, 디자인 adventure-ui.md 23절). 둘은 .adv-sheet 하나에 담고,
 * Esc 한 번에 둘 다 닫힌다(closeStats). 레벨 업 창은 스텟 판만 띄운다.
 *
 * 수문장·보스·중간 보스는 판마다 한 번이다(2026-11-21 사용자 "중간보스, 보스 는 게임 한판 당 한번씩만 잡을수있게"): 이번 판에 이기면(서버 runBosses에 그 키)
 * 그림·이름표·그림자를 숨기고 칸을 연다(syncBeaten). 새 판이면 다시 선다.
 *
 * 성능(기획 13장): 몬스터 그림과 이름표는 맵에 들어올 때 한 번 놓고, 그림자는 바닥 그림에 있다(판마다 한 번 이기는 몬스터만 따로 그린 그림자, 맵에 많아야 넷).
 * 이름표는 맵에 들어올 때 그 맵 것을 한 장에 모아 텍스처 하나로 올리고(buildTagAtlas) 맵을 떠날 때 지운다. 0.1초마다 화면 안 몬스터만 흔들림을 셈해
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
  /** 이번 판에 이긴 수문장·보스·중간 보스(숨김, 칸이 열림) */
  gone: boolean;
  /** 판마다 한 번 이기는 몬스터의 발밑 그림자(함께 숨김). 일반 몬스터는 바닥 그림에 구워 null */
  shadow: Phaser.GameObjects.Graphics | null;
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

/** 미니맵 보스 점 목록 번호(모든 필드가 함께 센다) */
let bossDotSerial = 0;

/**
 * 일곱 빛 구역 글의 배수: 맵 자료 legend.key → 서버 설정 표 key(adventure_tuning bonus_*, 2026-11-23 사용자 "옮겨").
 * 표는 일곱 빛 맵에 들어올 때마다 한 번 읽고(14줄), 받기 전에는 앞서 받은 값, 처음에는 맵 자료 글(처음 값과 같음)을 보인다.
 */
const BONUS_TUNING: Record<string, string> = {
  exp3: 'bonus_exp3', exp2: 'bonus_exp2', exp15: 'bonus_exp15', drop3: 'bonus_drop3', drop2: 'bonus_drop2', foeHp: 'bonus_foe_hp', foeAtk: 'bonus_foe_atk',
};
let tuning: Record<string, number> | null = null;
/** 맵 자료 글("exp x 3", "enemy hp x 0.5")의 끝 숫자를 표 값으로 바꾼다. */
const lightText = (legend: { key?: string; bonus?: string; hud?: string }) => {
  const text = legend.hud ?? legend.bonus ?? '';
  if (!legend.key || !text) return text;
  const v = tuning?.[BONUS_TUNING[legend.key] ?? ''];
  return v === undefined ? text : text.replace(/[\d.]+$/, String(v));
};

export class AdventureField {
  private readonly hud: HTMLElement;
  private readonly row1: HTMLElement;
  private readonly lightRow: HTMLElement;
  /** 스텟 판과 장비창을 담는 묶음(.adv-sheet). 휴대폰에서는 둘을 위아래로 이어 한 번에 스크롤한다. */
  private readonly sheet: HTMLElement;
  private readonly gear: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly floats: Floating[] = [];
  /** 칸 번호 → 그 칸 둘레의 몬스터(이름 줄을 보일 몬스터, 가까운 쪽) */
  private readonly nearAt = new Map<number, number>();
  /** 칸 번호 → 그 칸에 선 몬스터 */
  private readonly onTile = new Map<number, number>();
  private readonly resets = new Set<number>();
  /** 맵 한 변 칸 수(v5 맵 자료 size, 64·46). 칸 번호 = x + y × size */
  private readonly size: number;
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
  /** destroy 뒤면 true(늦게 온 설정 표 답을 버린다) */
  private dead = false;
  /** 이 맵 이름표를 모은 텍스처 키(buildTagAtlas). 맵을 떠날 때 지운다. */
  private tagAtlas = '';
  private panelVersion = -1;
  /** 장비창의 화면 상태(스텟 탭, 고른 무기). 창을 다시 그려도 남기고, 닫으면 처음으로 돌린다. */
  private readonly gearUi: GearUi = { tab: null, sel: null };
  /** 장비창을 그린 값(gearKey). 같으면 다시 그리지 않는다. */
  private gearShown = '';
  /** 잰 값(성능 확인용): 장비창을 통째로 그린 횟수와 시간(ms) */
  readonly gearStats = { draws: 0, ms: 0 };
  /** 잰 값(성능 확인용): 흔들림 계산 횟수·시간·y를 바꾼 수·보인 몬스터 수 */
  readonly bobStats = { ticks: 0, ms: 0, moved: 0, visible: 0 };
  /**
   * 미니맵에 그릴 보스·중간 보스·수문장(이번 판에 이긴 것은 빠짐)과 그 목록 번호. 맵에 놓을 때와 이긴 뒤·새 판(syncBeaten이 바꿨을 때)에만 새로 만든다.
   * 번호는 모든 필드가 함께 세어 맵이 바뀌어도 겹치지 않는다. GameScene 미니맵은 번호가 바뀌었을 때만 다시 그린다.
   */
  bossDots: BossDot[] = [];
  bossDotsVersion = 0;

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
    this.sheet = element('adv-sheet', root);
    this.sheet.hidden = true;
    this.gear = element('adv-gearwin', this.sheet);
    this.panel = element('adv-stat-panel', this.sheet);
    this.size = map.data.size ?? MAP_SIZE;
    // 되돌림 칸(예전 얽힌 숲 미로)은 v5 자료에 없다(2026-11-21). 자료에 생기면 다시 듣는다.
    for (const r of map.data.resets ?? []) this.resets.add(r.x + r.y * this.size);
    if (map.zone) this.placeMonsters();
    // 일곱 빛 맵이면 설정 표를 한 번 읽어 구역 글의 배수를 맞춘다. 받은 뒤 글이 바뀔 때만 다시 그린다(paint가 shownLight와 견줌).
    if (map.data.lights) {
      void adventureTuning().then((t) => {
        if (!t || this.dead) return;
        tuning = t;
        this.paint();
      });
    }
    this.timer = scene.time.addEvent({ delay: BOB_TICK_MS, loop: true, callback: () => this.bobTick() });
    this.offChange = adventure.onChange(() => {
      this.repaintTags();
      this.paint();
      if (!this.sheet.hidden) {
        this.paintPanel();
        this.paintGear();
      }
    });
  }

  /** 맵 위 몬스터들(World 몬스터 칸으로 막는다) */
  get monsters(): FieldMonster[] {
    return this.floats.filter((f) => !f.gone).map((f) => f.m);
  }

  /**
   * 몬스터 그림 텍스처(그림 한 장에 하나, 처음 쓸 때 만든다). 새 지역 여섯의 두 번째 그림은 그 맵에 들어올 때만 GPU에 올린다.
   * 그린 그림을 줄인 것이라 계단이 생기지 않게 부드럽게 늘린다(Infernus 조각과 같음).
   */
  private sheetTexture(sheet: MonsterSheet) {
    const scene = this.scene;
    if (scene.textures.exists(sheet.key)) return;
    const texture = scene.textures.addImage(sheet.key, sheet.image)!;
    for (const [id, f] of Object.entries(sheet.meta.frames)) texture.add(id, 0, f.x, f.y, f.w, f.h);
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  }

  /** 몬스터 그림과 이름표를 놓고, 이름 줄을 보일 칸 표를 만든다. */
  private placeMonsters() {
    const scene = this.scene;
    const best = new Map<number, number>();
    monstersOf(this.map.id).forEach((m, i) => {
      const art = monsterArt(m.art);
      if (!art) return;
      this.sheetTexture(art);
      const frame = art.frame;
      const role = art.meta.roles[frame.role];
      // 고해상도 그림이면 배율만큼 줄여 그려 월드 크기를 같게 한다(monsters.json scale).
      const k = art.meta.scale ?? 1;
      const c = tileCenter(m.x, m.y);
      const baseY = c.y - role.lift;
      const image = scene.add
        .image(c.x, baseY, art.key, m.art)
        .setOrigin(frame.ax / frame.w, frame.ay / frame.h)
        .setScale(k)
        .setDepth(depthOf(m.x, m.y) + 0.5);
      const tag = scene.add.image(c.x, baseY - frame.h * k - 2, '__DEFAULT').setOrigin(0.5, 1).setScale(1 / TAG_RES).setDepth(this.labelDepth);
      const shadow = m.once ? onceShadow(scene, c, frame.w * k) : null;
      const index = this.floats.length;
      this.floats.push({ m, frame, image, tag, baseY, bob: role.bob, phase: i * BOB_PHASE, shownBob: 0, shown: true, gone: false, shadow, tagKey: '', cx: c.x, top: baseY - frame.h * k - 30, bottom: c.y + 8 });
      this.onTile.set(m.x + m.y * this.size, index);
      // 둘레 8칸: 이름 줄을 보이는 칸. 둘이 겹치면 더 가까운 몬스터(몬스터끼리 5칸 넘게 떨어져 있어 거의 없음).
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = m.x + dx;
          const y = m.y + dy;
          if (x < 0 || y < 0 || x >= this.size || y >= this.size) continue;
          const key = x + y * this.size;
          const d = Math.abs(dx) + Math.abs(dy);
          if (best.has(key) && best.get(key)! <= d) continue;
          best.set(key, d);
          this.nearAt.set(key, index);
        }
      }
    });
    this.buildTagAtlas();
    for (const f of this.floats) this.paintTag(f);
    if (!this.syncBeaten()) this.refreshBossDots();
  }

  /** 미니맵 보스 점 목록을 다시 만든다. 수문장은 중간 보스와 같은 점(제가 정한 것). */
  private refreshBossDots() {
    this.bossDots = this.floats
      .filter((f) => f.m.once && !f.gone)
      .map((f): BossDot => ({ x: f.m.x, y: f.m.y, kind: f.m.kind === 'boss' ? 'boss' : 'mini' }));
    this.bossDotsVersion = ++bossDotSerial;
  }

  /**
   * 판마다 한 번 이기는 몬스터: 수문장(평원 1, 2026-11-19 사용자 "통로에 길을 막고 있는 화산폭풍의 일반몹 수문장"), 보스·중간 보스(2026-11-21 사용자
   * "중간보스, 보스 는 게임 한판 당 한번씩만 잡을수있게"). 이번 판에 이겼으면(서버 runBosses에 그 키) 그림·이름표·그림자를 숨기고 칸을 연다(monsters에서 빠짐).
   * 별 하늘 보스 둘은 키가 하나라 함께 사라진다. 새 판이면 다시 선다. 바뀌었으면 true(GameScene이 몬스터 칸을 다시 막음).
   */
  syncBeaten() {
    const done = this.adventure.view?.runBosses ?? [];
    let changed = false;
    let cleared = false;
    for (const f of this.floats) {
      if (!f.m.once) continue;
      const gone = done.includes(f.m.once);
      if (gone === f.gone) continue;
      // 보스·수문장을 잡아 새 포탈이 열림(맵에 들어와 처음 맞출 때는 내지 않는다)
      if (gone && this.beatenSynced && (f.m.kind === 'boss' || f.m.gate)) cleared = true;
      f.gone = gone;
      f.shown = !gone;
      f.image.setVisible(!gone);
      f.tag.setVisible(!gone);
      f.shadow?.setVisible(!gone);
      changed = true;
    }
    if (changed) this.refreshBossDots();
    if (cleared) sound.play('boss_clear');
    this.beatenSynced = true;
    return changed;
  }

  /** syncBeaten을 한 번 했음(그 뒤로 잡힌 것만 boss_clear) */
  private beatenSynced = false;

  /** 들어온 칸에서 시작한다(맵에 들어올 때, 되돌림 칸으로 옮겼을 때). */
  enter(tile: Tile) {
    this.here = { ...tile };
    this.setNear(this.nearAt.get(tile.x + tile.y * this.size) ?? -1);
    this.paint();
    this.bobTick();
  }

  /** 한 칸 걸었다. 걷기는 BP를 쓰지 않는다. 곁의 몬스터가 바뀌면 이름 줄을 고친다. */
  step(tile: Tile) {
    if (this.here && this.here.x === tile.x && this.here.y === tile.y) return;
    this.here = { ...tile };
    const key = tile.x + tile.y * this.size;
    if (this.resets.has(key)) {
      this.hooks.reset();
      return;
    }
    this.setNear(this.nearAt.get(key) ?? -1);
    this.paint();
  }

  /** 이 칸에 선 몬스터 */
  monsterAt(tile: Tile): FieldMonster | null {
    const f = this.floats[this.onTile.get(tile.x + tile.y * this.size) ?? -1];
    return f && !f.gone ? f.m : null;
  }

  /** 누른 곳(월드 좌표)에 그림이 있는 몬스터. 그림을 눌러도 칸을 눌러도 된다. 겹치면 앞(아래)에 그린 것. */
  monsterAtPoint(wx: number, wy: number): FieldMonster | null {
    let hit: Floating | null = null;
    for (const f of this.floats) {
      if (!f.shown || f.gone) continue;
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

  /** 스텟 판과 장비창을 함께 열고 닫는다(I, HUD [스텟]). 레벨 업 창으로 떠 있으면 I로는 닫지 않는다. */
  toggleStats() {
    if (this.levelUp) return;
    if (!this.sheet.hidden) {
      this.closeStats();
      return;
    }
    sound.play('ui_open');
    this.sheet.hidden = false;
    this.panelVersion = -1;
    this.gearShown = '';
    this.paintPanel();
    this.paintGear();
    if (!adventureArt) void loadAdventureArt().then(() => this.paintGear());
  }

  /**
   * 스텟 판과 장비창을 함께 닫는다(I, HUD [스텟], Esc 한 번, 2026-11-21 사용자 "켜지면 esc로 창을 닫을 수 있도록 해라.").
   * 레벨 업 창은 제 키(Enter·Esc)로 닫으므로 여기서는 닫지 않는다. 닫았으면 true.
   */
  closeStats() {
    if (this.levelUp || this.sheet.hidden) return false;
    sound.play('ui_close');
    this.sheet.hidden = true;
    this.clearGear();
    return true;
  }

  /** 장비창을 비우고 탭·고른 무기를 처음으로(다음에 열면 낀 무기의 스텟 탭) */
  private clearGear() {
    this.gear.replaceChildren();
    this.gearShown = '';
    Object.assign(this.gearUi, { tab: null, sel: null });
  }

  get statsOpen() {
    return !this.sheet.hidden;
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
    // 레벨 업 창은 스텟 판만(디자인 23절 5번): 장비창은 숨기고, 묶음은 예전 판 자리 그대로(CSS .adv-sheet.levelup)
    this.clearGear();
    this.gear.hidden = true;
    this.sheet.classList.add('levelup');
    this.panel.classList.add('levelup');
    sound.play('ui_open');
    this.sheet.hidden = false;
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
    this.sheet.classList.remove('levelup');
    sound.play('ui_close');
    this.sheet.hidden = true;
    this.gear.hidden = false;
    this.panel.replaceChildren();
    this.panelVersion = -1;
  }

  /** 전투가 끝났다. */
  settle() {
    this.paint();
  }

  destroy() {
    this.dead = true;
    this.finishGold();
    this.closeLevelUp(false);
    this.offChange();
    this.timer.remove();
    this.hud.remove();
    this.sheet.remove();
    for (const f of this.floats) {
      f.image.destroy();
      f.tag.destroy();
      f.shadow?.destroy();
    }
    this.floats.length = 0;
    // 이 맵 이름표 텍스처(맵마다 레벨이 모두 달라 다음 맵에서 다시 쓰지 않음). 맵을 많이 돌아도 GPU에 쌓이지 않게 지운다.
    if (this.tagAtlas && this.scene.textures.exists(this.tagAtlas)) this.scene.textures.remove(this.tagAtlas);
    this.tagAtlas = '';
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
      if (f.gone) continue;
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
   * 이 맵 이름표를 한 장(세로로 쌓음, 사이 2px)에 그려 텍스처 하나로 올린다. 맵에 들어올 때 한 번.
   * 모험 레벨 B안(2026-11-21)부터 한 맵의 몬스터 레벨이 모두 달라 이름표도 모두 다르다. 이름표마다 텍스처를 올리면 하나에 약 2ms(맵 하나 11개 약 25ms)라
   * 한 번에 올린다(제가 정한 것). 이름표가 한 텍스처라 그릴 때도 함께 묶인다.
   */
  private buildTagAtlas() {
    const pieces = new Map<string, HTMLCanvasElement>();
    for (const f of this.floats) {
      const key = tagFrame(f.m);
      if (!pieces.has(key)) pieces.set(key, tagCanvas('', tagText(f.m), TAG_COLOR, f.m.kind));
    }
    if (!pieces.size) return;
    const gap = 2;
    let w = 0;
    let h = gap;
    for (const c of pieces.values()) {
      w = Math.max(w, c.width);
      h += c.height + gap;
    }
    const atlas = document.createElement('canvas');
    atlas.width = w;
    atlas.height = h;
    // CPU 캔버스(willReadFrequently): GPU 캔버스는 텍스처로 올릴 때 GPU에서 다시 읽어 와 6~10ms, CPU 캔버스는 0.5ms 안쪽(이 PC에서 잼)
    const g = atlas.getContext('2d', CPU_CANVAS)!;
    const at = new Map<string, number>();
    let y = gap;
    for (const [key, c] of pieces) {
      g.drawImage(c, 0, y);
      at.set(key, y);
      y += c.height + gap;
    }
    const name = `adv-tags-${++tagAtlasCount}`;
    const texture = this.scene.textures.addCanvas(name, atlas);
    if (!texture) return;
    for (const [key, c] of pieces) texture.add(key, 0, 0, at.get(key)!, c.width, c.height);
    this.tagAtlas = name;
  }

  /** 이름표 그림을 몬스터에 붙인다(이 맵 이름표 텍스처의 그 칸). 글은 레벨과 종류로만 정해져 맵에 있는 동안 바뀌지 않는다. */
  private paintTag(f: Floating) {
    const key = tagFrame(f.m);
    if (key === f.tagKey || !this.tagAtlas) return;
    f.tagKey = key;
    f.tag.setTexture(this.tagAtlas, key);
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
        // 키는 P → I(2026-11-21 사용자 "인벤토리는 모험에서 어차피 안쓰니깐 p 대신 i 로 통일한다")
        stats.textContent = '스텟 (I)';
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
    // 끝 숫자는 서버 설정 표 값(lightText, 2026-11-23 사용자 "옮겨").
    // 글이 없는 빛(노랑, 보너스 없음)은 줄을 숨긴다(제가 정한 것).
    const text = legend ? lightText(legend) : '';
    const light = legend && text ? `${legend.color}|${text}` : '';
    if (light !== this.shownLight) {
      this.shownLight = light;
      this.lightRow.replaceChildren();
      this.lightRow.hidden = !light;
      if (legend && light) {
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
    // 장착 칸과 무기 목록은 장비창으로 옮겼다(2026-11-21 디자인 23절). 판에는 스텟 줄만 남는다.
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

  /** 장비창. 낀 무기·가진 무기·낀 장신구·그림이 바뀔 때만 통째로 다시 그리고, 스크롤 자리는 남긴다. */
  private paintGear() {
    const view = this.adventure.view;
    if (!view || this.levelUp || this.sheet.hidden) return;
    const key = gearKey(this.adventure, view);
    if (key === this.gearShown) return;
    this.gearShown = key;
    const t0 = performance.now();
    const top = this.gear.scrollTop;
    const sheetTop = this.sheet.scrollTop;
    this.gear.replaceChildren();
    gearWindow(this.gear, this.adventure, view, this.gearUi);
    if (top) this.gear.scrollTop = top;
    if (sheetTop) this.sheet.scrollTop = sheetTop;
    this.gearStats.draws++;
    this.gearStats.ms += performance.now() - t0;
  }
}

/**
 * 이름표 글(디자인 세션 adventure-monsters.md 7절 4): "Lv. 350"(일반), "중간 보스 Lv. 2,222", "보스 Lv. 15,000"(줄이지 않은 숫자, 2026-11-18 사용자).
 * 이름 줄은 없다(2026-11-19 사용자 "몬스터 이름, 장비이름 굳이 없어도 된다.").
 */
function tagText(m: FieldMonster) {
  const lv = `Lv. ${formatNumber(m.level)}`;
  return m.kind === 'boss' ? `보스 ${lv}` : m.kind === 'mini' ? `중간 보스 ${lv}` : lv;
}
/** 이름표 텍스처 안 칸 이름(종류와 글이 같으면 같은 칸) */
const tagFrame = (m: FieldMonster) => `${m.kind}|${tagText(m)}`;
/** 이름표 텍스처 키 번호(맵에 들어올 때마다 새 키, 앞 맵 것은 떠날 때 지움) */
let tagAtlasCount = 0;
/** 이름표 캔버스는 CPU 캔버스로 그린다(텍스처로 올리기가 빠름, buildTagAtlas) */
const CPU_CANVAS: CanvasRenderingContext2DSettings = { willReadFrequently: true };

/**
 * 판마다 한 번 이기는 몬스터(수문장·보스·중간 보스)의 발밑 그림자. 바닥 그림의 그림자(adventureGround)와 같은 두 단계 타원
 * (그림 폭의 30%, 최소 9, 알파 0.22 둘)이고, 몬스터와 함께 숨기려고 따로 그린다. 깊이는 바닥(0)과 바닥 위 표시(경로 점, 1) 사이라
 * 꾸밈·캐릭터는 모두 그 위에 그려진다(바닥에 구운 것과 같은 차례).
 */
const SHADOW_DEPTH = 0.5;
function onceShadow(scene: Phaser.Scene, c: { x: number; y: number }, width: number) {
  const rx = Math.max(9, Math.round(width * 0.3));
  const ry = Math.round(rx / 2);
  const g = scene.add.graphics().setDepth(SHADOW_DEPTH);
  for (const k of [1, 0.66]) {
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(Math.round(c.x), Math.round(c.y), rx * k * 2, ry * k * 2);
  }
  return g;
}

/**
 * 몬스터 이름표 그림(디자인 세션 확인 도구 view.js nameTags와 같은 모양): 검은 반투명 판, 보스 빨강·중간 보스 주황 테두리.
 * name이 있으면(가까이 선 몬스터) 위에 흰 이름 한 줄을 더한다. 화면 2배에서 또렷하게 TAG_RES배로 그린다.
 */
function tagCanvas(name: string, text: string, color: string, kind: FieldMonster['kind']) {
  const R = TAG_RES;
  const font = `bold ${TAG_FONT * R}px sans-serif`;
  const nameFont = `bold ${NAME_FONT * R}px sans-serif`;
  const measure = document.createElement('canvas').getContext('2d', CPU_CANVAS)!;
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
  const g = c.getContext('2d', CPU_CANVAS)!;
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

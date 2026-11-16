import type Phaser from 'phaser';
import { sprite } from '../art/sprites';
import { depthOf, gridToWorld, tileCenter } from '../iso';
import { CROP_ART, CROP_CELL } from './cropArt';

/**
 * 농장(2026-11-15 사용자 요청, 기획 docs/balance/farm.md). 농장 맵(farm)의 땅은 2칸 흙길로 나뉜 6×6칸 구획 25개(900칸)이고,
 * 농협에서 땅과 씨앗을 사서 내 땅에 심고 다 자라면 거둔다. 땅 주인, 작물, 다 자랐는지, 거둔 개수, 칭찬·비난은 서버가 정한다.
 */

export type CropId = 'carrot' | 'potato' | 'onion' | 'tomato' | 'eggplant' | 'corn';
export const CROP_IDS: readonly CropId[] = ['carrot', 'potato', 'onion', 'tomato', 'eggplant', 'corn'];

export function isCropId(value: unknown): value is CropId {
  return typeof value === 'string' && (CROP_IDS as readonly string[]).includes(value);
}

/** 서버 crops 표 */
export interface CropInfo {
  id: CropId;
  name: string;
  growSeconds: number;
  /** 작물 1개 값 = 씨앗 값 */
  price: number;
  /** 한 번 거둘 때 기본 개수 */
  yield: number;
}

export type Grade = 'normal' | 'praise' | 'blame';
export const GRADE_NAME: Record<Grade, string> = { normal: '', praise: '칭찬 ', blame: '비난 ' };
const GRADE_RATE: Record<Grade, number> = { normal: 1, praise: 1.1, blame: 0.9 };

/** 작물 1개를 팔 때 값(서버 sell_crops와 같은 식) */
export function cropValue(price: number, grade: Grade) {
  return Math.round(price * GRADE_RATE[grade]);
}

/** 땅 한 칸 */
export interface Plot {
  x: number;
  y: number;
  owner: string;
  nickname: string;
  crop: CropId | null;
  /** 심은 시각(ms). 비었으면 null */
  plantedAt: number | null;
  praise: number;
  blame: number;
}

/** 땅인 칸인지. 서버 farm_is_plot과 같아야 한다: 2~39칸 안에서 8칸마다 6칸이 땅이고 2칸이 길이다. */
export function isPlot(x: number, y: number) {
  return x >= 2 && x <= 39 && y >= 2 && y <= 39 && (x - 2) % 8 < 6 && (y - 2) % 8 < 6;
}

/** n번째 땅 값: 5,000G × 1.08^(n−1). 값은 서버가 정하고 여기서는 창에 보여 줄 값을 셈한다. */
export function landPrice(n: number) {
  return Math.round(5000 * 1.08 ** (n - 1));
}

/** 다 자라는 시각(ms) */
export function ripeAt(plot: Plot, crop: CropInfo) {
  return (plot.plantedAt ?? 0) + crop.growSeconds * 1000;
}

/** 다 자랐을 때 될 종류: 칭찬이 많으면 칭찬, 비난이 많으면 비난, 같으면 일반 */
export function gradeOf(plot: Plot): Grade {
  return plot.praise > plot.blame ? 'praise' : plot.blame > plot.praise ? 'blame' : 'normal';
}

/** 남은 시간을 "3시간 20분", "5분", "40초"처럼 */
export function formatLeft(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) return `${Math.floor(s / 3600)}시간 ${Math.floor((s % 3600) / 60)}분`;
  if (s >= 60) return `${Math.floor(s / 60)}분`;
  return `${s}초`;
}

/** 자라는 시간을 "10분", "24시간"처럼 */
export function formatGrow(seconds: number) {
  return seconds >= 3600 ? `${seconds / 3600}시간` : `${Math.round(seconds / 60)}분`;
}

/** formatLeft 글이 바뀌는 단위의 값: 1분 넘게 남았으면 분, 1분 안이면 초, 다 자랐으면 0. 이 값이 같으면 글도 같다. */
export function leftTick(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? -Math.floor(s / 60) : s;
}

// ───────── 칸 글: 마우스를 올린 글(GameScene.plotTip), 땅 지도(LandMap.describe), 작물 곁 안내 창이 같이 쓴다 ─────────

/** 칸 주인을 가리키는 말: 내 것이면 '내', 남의 것이면 '○○의'(이름이 없으면 '누군가의') */
export function ownerWord(plot: Plot, myId: string) {
  return plot.owner === myId ? '내' : `${plot.nickname || '누군가'}의`;
}

export function votesText(plot: Plot) {
  return `칭찬 ${plot.praise} · 비난 ${plot.blame}`;
}

/** 작물 상태 한 줄: 자라는 중이면 '당근 3시간 20분 남음', 다 자랐으면 '칭찬 당근 다 자람' */
export function cropStateText(plot: Plot, crop: CropInfo, now = Date.now()) {
  const left = ripeAt(plot, crop) - now;
  return left > 0 ? `${crop.name} ${formatLeft(left)} 남음` : `${GRADE_NAME[gradeOf(plot)]}${crop.name} 다 자람`;
}

/** 작물 곁 안내 창과 F가 하는 일 */
export type FarmDo = 'vote' | 'harvest' | 'plant';

/** 안내 창에 보일 칸의 상태. GameScene이 모아 넘긴다. */
export interface PlotSituation {
  plot: Plot;
  /** plot.crop의 정보. 비었으면 undefined */
  crop: CropInfo | undefined;
  myId: string;
  /** 칸에 블록이 놓였는지 */
  blocked: boolean;
  /** 단축키 칸에서 고른 씨앗: 이름('당근 씨앗')과 가진 개수. 씨앗을 안 골랐으면 null */
  seed: { name: string; count: number } | null;
  now: number;
}

/** 안내 창을 띄울 칸인지: 작물이 있는 칸(누구 것이든)과 내 빈 땅 */
export function showsCard(plot: Plot | undefined, myId: string): plot is Plot {
  return !!plot && (plot.crop !== null || plot.owner === myId);
}

/** 그 칸에서 F(휴대폰은 창의 버튼)가 하는 일. 없으면 null */
export function plotAction(s: PlotSituation): FarmDo | null {
  const { plot, crop } = s;
  if (crop) {
    if (s.now < ripeAt(plot, crop)) return 'vote';
    return plot.owner === s.myId ? 'harvest' : null;
  }
  if (plot.owner !== s.myId || s.blocked || !s.seed || s.seed.count <= 0) return null;
  return 'plant';
}

export const FARM_DO_LABEL: Record<FarmDo, string> = { vote: '칭찬·비난', harvest: '거두기', plant: '심기' };

/** 안내 창의 글 줄(첫 줄이 제목). docs/balance/farm.md 9.3의 표와 같다. */
export function plotCardLines(s: PlotSituation): string[] {
  const { plot, crop } = s;
  if (crop) {
    const title = `${ownerWord(plot, s.myId)} ${crop.name}`;
    const left = ripeAt(plot, crop) - s.now;
    if (left > 0) return [title, `다 자랄 때까지 ${formatLeft(left)}`, votesText(plot)];
    const grade = gradeOf(plot);
    const ripe = grade === 'normal' ? '다 자람' : `다 자람 · ${GRADE_NAME[grade]}작물`;
    return plot.owner === s.myId ? [title, ripe, votesText(plot)] : [title, ripe, '주인만 거둘 수 있습니다', votesText(plot)];
  }
  const title = '내 빈 땅';
  if (s.blocked) return [title, '블록을 회수해야 심을 수 있습니다'];
  if (!s.seed) return [title, '단축키 칸에서 씨앗을 고르면 심을 수 있습니다'];
  if (s.seed.count <= 0) return [title, `${s.seed.name}이 없습니다 · 농협에서 삽니다`];
  return [title, `${s.seed.name} ${s.seed.count}개`];
}

/** 흙길 타일(tiles.png). 땅이 아닌 칸에 깐다. */
export const FARM_ROAD_TILES = [0, 1, 2, 3, 4, 5];
/** 산 땅에 덮는 갈아 놓은 밭 타일(tiles.png) */
export const FARMLAND_TILES = [25, 26];
/** 바닥 타일 그림에서 윗면이 시작하는 높이(maps.ts의 BLOCK_TOP) */
export const FLOOR_TOP = 8;
/** 자라는 단계를 다시 셈하는 간격 */
const STAGE_CHECK_MS = 30_000;

const key = (x: number, y: number) => x + y * 1000;

/** 작물 그림(public/sprites/farm/crops.png)과 칭찬·비난 표시를 등록한다. */
export function registerFarmTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('farm-crops')) {
    scene.textures.addSpriteSheet('farm-crops', sprite('farm/crops'), { frameWidth: CROP_CELL.width, frameHeight: CROP_CELL.height });
  }
  if (!scene.textures.exists('farm-heart')) scene.textures.addCanvas('farm-heart', markCanvas('heart'));
  if (!scene.textures.exists('farm-cloud')) scene.textures.addCanvas('farm-cloud', markCanvas('cloud'));
}

/** 다 자란 칭찬 작물 위의 작은 하트, 비난 작물 위의 작은 먹구름(받은 그림에 없어서 그림) */
function markCanvas(kind: 'heart' | 'cloud') {
  const rows =
    kind === 'heart'
      ? ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
      : ['..###...', '.#####.#', '########', '########', '.######.', '..#..#..'];
  const canvas = document.createElement('canvas');
  canvas.width = rows[0].length + 2;
  canvas.height = rows.length + 2;
  const ctx = canvas.getContext('2d')!;
  const fill = kind === 'heart' ? '#ff5d7a' : '#5b5f6e';
  const edge = kind === 'heart' ? '#7a1c33' : '#25262d';
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '#') return;
      ctx.fillStyle = edge;
      ctx.fillRect(x, y, 3, 3);
    }),
  );
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c !== '#') return;
      ctx.fillStyle = fill;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }),
  );
  return canvas;
}

/** 작물 그림의 단계: 심은 직후 첫 장, 다 자라면 마지막 장(바구니), 그 사이는 자란 비율. 농협 땅 지도도 쓴다. */
export function stageOf(plot: Plot, crop: CropInfo, now: number) {
  const frames = CROP_ART[crop.id].frames;
  const grown = (now - (plot.plantedAt ?? now)) / (crop.growSeconds * 1000);
  if (grown >= 1) return frames - 1;
  return Math.min(frames - 2, Math.max(0, Math.floor(grown * (frames - 1))));
}

/**
 * 농장 맵의 땅과 작물 그림. 땅을 사거나 팔거나 심고 거두면 그 칸만 다시 그리고, 자라는 단계는 30초마다 셈해
 * 단계가 바뀐 칸만 그림을 바꾼다(CLAUDE.md "렌더링 성능이 우선"). 900칸이 모두 차도 매 프레임 하는 일은 없다.
 */
export class FarmField {
  private readonly plots = new Map<number, Plot>();
  private readonly soil = new Map<number, Phaser.GameObjects.Image>();
  private readonly crops = new Map<number, Phaser.GameObjects.Image>();
  private readonly marks = new Map<number, Phaser.GameObjects.Image>();
  private nextCheck = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cropInfo: Map<CropId, CropInfo>,
    private readonly myId: string,
  ) {}

  setAll(list: Plot[]) {
    for (const k of [...this.plots.keys()]) this.clearCell(k);
    this.plots.clear();
    for (const plot of list) this.upsert(plot);
  }

  upsert(plot: Plot) {
    this.plots.set(key(plot.x, plot.y), plot);
    this.draw(plot, Date.now());
  }

  remove(x: number, y: number) {
    const k = key(x, y);
    this.plots.delete(k);
    this.clearCell(k);
  }

  at(x: number, y: number) {
    return this.plots.get(key(x, y));
  }

  get all() {
    return [...this.plots.values()];
  }

  /** 내가 가진 땅 수 */
  get mine() {
    let n = 0;
    for (const plot of this.plots.values()) if (plot.owner === this.myId) n++;
    return n;
  }

  crop(id: CropId) {
    return this.cropInfo.get(id);
  }

  isRipe(plot: Plot, now = Date.now()) {
    const crop = plot.crop && this.cropInfo.get(plot.crop);
    return !!crop && now >= ripeAt(plot, crop);
  }

  /** 화면 갱신마다 부른다. 30초에 한 번만 단계를 셈한다. */
  update(now: number) {
    if (now < this.nextCheck) return;
    this.nextCheck = now + STAGE_CHECK_MS;
    const wall = Date.now();
    for (const plot of this.plots.values()) if (plot.crop) this.draw(plot, wall);
  }

  private clearCell(k: number) {
    this.soil.get(k)?.destroy();
    this.crops.get(k)?.destroy();
    this.marks.get(k)?.destroy();
    this.soil.delete(k);
    this.crops.delete(k);
    this.marks.delete(k);
  }

  private draw(plot: Plot, now: number) {
    const k = key(plot.x, plot.y);
    const { x, y } = plot;
    const crop = plot.crop && this.cropInfo.get(plot.crop);
    // 산 땅은 갈아 놓은 밭. 작물을 심으면 작물 그림(밭 포함)이 덮는다.
    if (!crop) {
      this.crops.get(k)?.destroy();
      this.crops.delete(k);
      this.marks.get(k)?.destroy();
      this.marks.delete(k);
      if (!this.soil.has(k)) {
        const corner = gridToWorld(x, y);
        const tile = FARMLAND_TILES[(x * 7 + y * 13) % FARMLAND_TILES.length];
        this.soil.set(k, this.scene.add.image(corner.x, corner.y - FLOOR_TOP, 'tiles', tile).setOrigin(0.5, 0).setDepth(0.55));
      }
      return;
    }
    this.soil.get(k)?.destroy();
    this.soil.delete(k);
    const art = CROP_ART[crop.id];
    const frame = art.row * CROP_CELL.cols + stageOf(plot, crop, now);
    let image = this.crops.get(k);
    if (!image) {
      const c = tileCenter(x, y);
      image = this.scene.add
        .image(c.x, c.y, 'farm-crops', frame)
        .setOrigin(art.anchorX / CROP_CELL.width, art.anchorY / CROP_CELL.height)
        .setDepth(depthOf(x, y) + 0.2);
      this.crops.set(k, image);
    } else if (image.frame.name !== String(frame)) {
      image.setFrame(frame);
    }
    // 다 자란 칭찬 작물에는 하트, 비난 작물에는 먹구름
    const grade = now >= ripeAt(plot, crop) ? gradeOf(plot) : 'normal';
    const markKey = grade === 'praise' ? 'farm-heart' : grade === 'blame' ? 'farm-cloud' : null;
    const mark = this.marks.get(k);
    if (!markKey) {
      mark?.destroy();
      this.marks.delete(k);
    } else if (!mark || mark.texture.key !== markKey) {
      mark?.destroy();
      const c = tileCenter(x, y);
      this.marks.set(k, this.scene.add.image(c.x, c.y - 20, markKey).setDepth(depthOf(x, y) + 0.3));
    }
  }

  destroy() {
    for (const k of [...this.plots.keys()]) this.clearCell(k);
    this.plots.clear();
  }
}

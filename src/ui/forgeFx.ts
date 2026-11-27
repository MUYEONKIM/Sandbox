import type { ForgeOutcome } from '../game/forge';
import { element } from './dom';
import './forgeFx.css';
import { sound } from '../sound/engine';
import type { SfxKey } from '../sound/catalog';

/** 번개마다 나는 소리: 망치질, 마지막은 결과 소리 */
const BOLT_SFX: Record<BoltKind, SfxKey> = { strike: 'anvil', success: 'forge_success', keep: 'forge_keep', drop: 'forge_drop', destroy: 'forge_break' };

/**
 * 망치질 번개 연출(2026-11-16 사용자 "망치질 순간의 이펙트는 따로 화면에 전체적인 이펙트를 띄우면서 번개치는 느낌으로").
 * 나만 본다(다른 사람에게 보내지 않음). 길이는 망치질 간격과 같고, 서버 결과는 바로 받아 두었다가 마지막 번개와 함께 보인다.
 * 번개가 2~4번 화면 위 끝에서 무기까지 내리꽂히고(가운데에서 퍼지는 번쩍임, 화면 가장자리 빛, 화면 흔들림, 불꽃), 마지막 번개 색과
 * 장면이 결과(성공 금빛 터짐과 빛살, 유지 연기, 하락 금 간 선, 파괴 조각)다. 화면을 누르면 결과로 바로 넘어간다(망치질 간격은 그대로).
 * 번쩍임과 가장자리 빛은 함께 1초에 3번을 넘지 않는다. 움직임을 줄이도록 설정한 기기에서는 번쩍임, 가장자리 빛, 금빛 터짐, 흔들림을 끈다.
 * 움직임은 모두 transform·opacity이고 그림자·그라디언트는 처음 한 번만 그려진다. 매 프레임 도는 JS는 없다.
 * 디자인 세션 의견(2026-11-16)을 따랐다. 값의 근거는 forgeFx.css.
 */

export interface FxResult {
  kind: ForgeOutcome;
  /** 결과 단계(파괴면 부서지기 전 단계) */
  level: number;
  /** 두루마리가 막아 유지가 됐으면 */
  saved: boolean;
}

type BoltKind = 'strike' | ForgeOutcome;

/** 번쩍임 사이 최소 간격: 1초에 3번을 넘지 않게(광과민성) */
const FLASH_GAP_MS = 340;
/** 결과 장면을 보여 주는 최소 시간 */
const RESULT_MIN_MS = 700;
const OUT_MS = 250;
/** 번개 한 번에 만든 조각(줄기, 번쩍임, 불꽃)을 지우는 때 */
const PARTS_MS = 800;
const SPARKS = 14;

const BOLT_COLORS: Record<BoltKind, [core: string, glow: string]> = {
  strike: ['#ffffff', '#9fd8ff'],
  success: ['#fff6c8', '#ffd84d'],
  keep: ['#ffffff', '#9fd8ff'],
  drop: ['#d8ccff', '#7a5aff'],
  destroy: ['#ff8a7a', '#d0201a'],
};

/**
 * 번개 줄기 모양 셋(가로 140, 세로 480 좌표, 에이전트가 정함). 화면 높이에 맞춰 세로로만 늘고 굵기는 그대로다.
 * 줄기 끝 (70, 480)이 무기에 닿고, 갈래 둘은 옆으로 30~45° 뻗는다.
 */
const BOLT_SHAPES: [trunk: string, branches: string][] = [
  ['M78 0 L60 70 L84 112 L56 190 L80 236 L62 318 L82 360 L66 430 L70 480', 'M84 112 L106 138 L130 172 M62 318 L42 342 L16 378'],
  ['M58 0 L76 60 L52 120 L86 176 L64 250 L90 300 L68 372 L80 420 L70 480', 'M52 120 L32 146 L8 180 M90 300 L110 326 L134 360'],
  ['M70 0 L88 54 L62 96 L80 160 L54 214 L78 270 L60 330 L86 392 L70 480', 'M80 160 L102 184 L126 220 M60 330 L38 354 L14 390'],
];

const bolts = new Map<string, string>();
/** 번개 한 줄기 그림(SVG). 색과 모양마다 한 번만 만든다. */
function boltUrl(kind: BoltKind, shape: number) {
  const key = `${kind}${shape}`;
  let url = bolts.get(key);
  if (!url) {
    const [core, glow] = BOLT_COLORS[kind];
    const [trunk, branches] = BOLT_SHAPES[shape];
    const line = (d: string, color: string, width: number, alpha: number) =>
      `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-opacity="${alpha}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 480" preserveAspectRatio="none">' +
      line(trunk, glow, 36, 0.15) +
      line(trunk, glow, 18, 0.35) +
      line(branches, glow, 8, 0.35) +
      line(trunk, core, 6, 1) +
      line(branches, core, 2, 1) +
      '</svg>';
    url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    bolts.set(key, url);
  }
  return url;
}

/** 금 간 선: 아이콘 위 160px. 어두운 바탕에서도 보이게 연보라 테두리를 둔다(에이전트가 정함). */
const CRACK_URL = (() => {
  const main = 'M28 18 L64 62 L52 82 L92 106 L80 128 L136 146 M64 62 L98 48 M92 106 L116 94 M52 82 L30 96';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><path d="${main}" fill="none" stroke="#b9a8ff" stroke-width="7" stroke-opacity="0.8" stroke-linecap="round" stroke-linejoin="round"/><path d="${main}" fill="none" stroke="#1f1a24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
})();

/** 가장자리 빛: 60ms 동안 켜지고 320ms 동안 꺼진다. */
const EDGE_FRAMES: Keyframe[] = [{ opacity: 0 }, { opacity: 1, offset: 60 / 380 }, { opacity: 0 }];
const EDGE_MS = 380;

/** 파괴 조각 넷: 처음 자리(x, y), 뻗는 거리(dx, dy, 약 170~185px), 회전(±95~120°) */
const SHARDS: [x0: number, y0: number, dx: number, dy: number, r: number][] = [
  [-48, -48, -130, -110, -110],
  [0, -48, 140, -100, 95],
  [-48, 0, -125, 130, 120],
  [0, 0, 135, 125, -100],
];

export class ForgeFx {
  private root: HTMLElement | null = null;
  /** 흔들리는 화면(번개, 빛, 가운데 무대가 다 여기 있다) */
  private world: HTMLElement | null = null;
  private stage: HTMLElement | null = null;
  private edge: HTMLElement | null = null;
  private icon: HTMLImageElement | null = null;
  private timers: number[] = [];
  private result: FxResult | null = null;
  private finalAt = 0;
  private endAt = 0;
  private lastFlash = -Infinity;
  private skipping = false;
  private finished = false;
  /** 움직임을 줄이도록 설정한 기기 */
  private calm = false;
  /** 다음 번개 모양(같은 줄기가 잇달아 나오지 않게 돌려 쓴다) */
  private shape = 0;
  private done: (() => void) | null = null;
  /** 연출을 하나 띄우는 데 든 시간(잴 때 본다) */
  lastBuildMs = 0;

  /** 연출을 띄운다. 연출이 끝나면 풀린다. */
  play(iconUrl: string, durationMs: number): Promise<void> {
    this.stop();
    const started = performance.now();
    this.result = null;
    this.skipping = false;
    this.finished = false;
    this.lastFlash = -Infinity;
    this.calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = element('forge-fx', document.body);
    const world = element('forge-fx-world', root);
    const edge = element('forge-fx-edge', world);
    const stage = element('forge-fx-stage', world);
    element('forge-fx-glow', stage);
    const icon = element('forge-fx-icon', stage, 'img') as HTMLImageElement;
    icon.src = iconUrl;
    icon.alt = '';
    element('forge-fx-hint', stage).textContent = '누르면 결과로 넘어갑니다';
    root.addEventListener('pointerdown', () => this.skip());
    this.root = root;
    this.world = world;
    this.stage = stage;
    this.edge = edge;
    this.icon = icon;

    // 망치질 간격 1초마다 번개 한 번, 2~4번. 마지막 번개(결과)는 간격의 74% 지점이다.
    const count = Math.min(4, Math.max(2, Math.round(durationMs / 1000)));
    this.finalAt = started + durationMs * 0.74;
    this.endAt = started + durationMs;
    for (let i = 0; i < count - 1; i++) {
      const at = durationMs * (0.12 + (0.62 * i) / (count - 1));
      this.later(at, () => this.strike('strike'));
    }
    this.later(durationMs * 0.74, () => this.finish());
    this.lastBuildMs = performance.now() - started;
    return new Promise((resolve) => (this.done = resolve));
  }

  /** 서버 결과를 받았다. 마지막 번개 때 보인다. */
  setResult(result: FxResult) {
    this.result = result;
    if (this.skipping || performance.now() >= this.finalAt) this.finish();
  }

  /** 연출을 바로 닫는다(실패했거나 창을 닫을 때). */
  stop() {
    this.clearTimers();
    this.root?.remove();
    this.root = this.world = this.stage = this.edge = this.icon = null;
    this.done?.();
    this.done = null;
  }

  private later(ms: number, fn: () => void) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers() {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }

  private skip() {
    if (this.finished) {
      this.close();
      return;
    }
    this.skipping = true;
    if (this.result) this.finish();
  }

  /** 번개 한 번: 위 끝에서 무기까지 내리꽂는 줄기, 번쩍임과 가장자리 빛, 흔들림, 불꽃 */
  private strike(kind: BoltKind) {
    const world = this.world;
    const stage = this.stage;
    if (!world || !stage) return;
    sound.play(BOLT_SFX[kind]);
    const parts: HTMLElement[] = [];
    const bolt = element('forge-fx-bolt', world, 'img') as HTMLImageElement;
    bolt.src = boltUrl(kind, this.shape);
    bolt.alt = '';
    this.shape = (this.shape + 1) % BOLT_SHAPES.length;
    parts.push(bolt);
    this.light(kind, parts);
    if (kind === 'destroy') this.shake(12, 320);
    else this.shake(8, 260);
    for (let i = 0; i < SPARKS; i++) {
      // 절반은 날아가는 쪽으로 돌린 2×10px 막대(꼬리 있는 불똥), 절반은 3~6px 점
      const streak = i % 2 === 0;
      const spark = element(`forge-fx-spark${streak ? ' streak' : ''}${kind === 'destroy' ? ' red' : ''}`, stage);
      const angle = (i / SPARKS) * Math.PI * 2 + Math.random() * 0.4;
      const reach = 120 + Math.random() * 100;
      const dx = Math.cos(angle) * reach;
      const dy = Math.sin(angle) * reach - 20;
      spark.style.setProperty('--dx', `${dx.toFixed(1)}px`);
      spark.style.setProperty('--dy', `${dy.toFixed(1)}px`);
      if (streak) spark.style.setProperty('--turn', `${((Math.atan2(dy, dx) * 180) / Math.PI + 90).toFixed(1)}deg`);
      else spark.style.setProperty('--size', `${3 + Math.floor(Math.random() * 4)}px`);
      parts.push(spark);
    }
    // 마지막 번개가 순서 타이머를 지워도 조각은 지워지게 따로 둔다.
    window.setTimeout(() => parts.forEach((p) => p.remove()), PARTS_MS);
  }

  /** 가운데에서 퍼지는 번쩍임과 화면 가장자리 빛. 1초에 3번을 넘지 않는다. */
  private light(kind: BoltKind, parts: HTMLElement[]) {
    const now = performance.now();
    if (this.calm || !this.world || !this.edge || now - this.lastFlash < FLASH_GAP_MS) return;
    this.lastFlash = now;
    parts.push(element('forge-fx-flash', this.world));
    this.edge.className = `forge-fx-edge ${kind}`;
    this.edge.animate(EDGE_FRAMES, EDGE_MS);
  }

  /** 화면 전체 흔들림 */
  private shake(px: number, ms: number) {
    if (this.calm || !this.world) return;
    this.world.animate(
      [
        { transform: 'translate(0, 0)' },
        { transform: `translate(${-px}px, ${px * 0.4}px)` },
        { transform: `translate(${px * 0.8}px, ${-px * 0.6}px)` },
        { transform: `translate(${-px * 0.4}px, ${px * 0.2}px)` },
        { transform: 'translate(0, 0)' },
      ],
      { duration: ms, easing: 'linear' },
    );
  }

  /** 마지막 번개와 결과 장면. 결과가 아직 없으면 결과가 올 때 부른다. */
  private finish() {
    const result = this.result;
    if (!result || !this.stage || this.finished) return;
    this.finished = true;
    this.clearTimers();
    // 건너뛰어 바로 앞 번쩍임과 너무 가까우면 그 간격만큼 기다렸다가 보인다.
    const wait = this.calm ? 0 : this.lastFlash + FLASH_GAP_MS - performance.now();
    if (wait > 0) this.later(wait, () => this.reveal(result));
    else this.reveal(result);
  }

  private reveal(result: FxResult) {
    const world = this.world;
    const stage = this.stage;
    if (!world || !stage) return;
    this.strike(result.kind);
    const label = element(`forge-fx-label ${result.kind}`, stage);
    if (result.kind === 'success') {
      element('forge-fx-ring', stage);
      element('forge-fx-ring late', stage);
      // 금빛 터짐과 빛살은 화면 크기이고 무대(아이콘, 글씨) 뒤에 깐다.
      if (!this.calm) stage.before(element('forge-fx-burst', world), element('forge-fx-rays', world));
      label.textContent = `+${result.level} 성공`;
    } else if (result.kind === 'keep') {
      for (const dx of [-45, 0, 45]) element('forge-fx-smoke', stage).style.setProperty('--dx', `${dx}px`);
      label.textContent = result.saved ? '두루마리가 막았습니다' : '유지';
    } else if (result.kind === 'drop') {
      const crack = element('forge-fx-crack', stage, 'img') as HTMLImageElement;
      crack.src = CRACK_URL;
      crack.alt = '';
      label.textContent = `하락 +${result.level}`;
    } else {
      this.icon?.classList.add('gone');
      const src = this.icon?.src ?? '';
      SHARDS.forEach(([x0, y0, dx, dy, r], i) => {
        const shard = element('forge-fx-shard', stage);
        shard.style.backgroundImage = `url("${src}")`;
        shard.style.backgroundPosition = `${-(i % 2) * 48}px ${-Math.floor(i / 2) * 48}px`;
        shard.style.setProperty('--x0', `${x0}px`);
        shard.style.setProperty('--y0', `${y0}px`);
        shard.style.setProperty('--dx', `${dx}px`);
        shard.style.setProperty('--dy', `${dy}px`);
        shard.style.setProperty('--r', `${r}deg`);
      });
      label.textContent = '파괴';
    }
    // 결과는 간격이 끝날 때까지(최소 0.7초) 보이고, 건너뛰었으면 0.7초 뒤에 닫는다.
    const left = this.skipping ? RESULT_MIN_MS : Math.max(RESULT_MIN_MS, this.endAt - performance.now());
    this.later(left, () => this.close());
  }

  private close() {
    const root = this.root;
    if (!root) return;
    this.clearTimers();
    root.classList.add('out');
    this.root = this.world = this.stage = this.edge = this.icon = null;
    const done = this.done;
    this.done = null;
    window.setTimeout(() => {
      root.remove();
      done?.();
    }, OUT_MS);
  }
}

import { advMap, loadChapterLayout, type AdvMapData, type ChapterLayout } from '../game/adventureMaps';
import type { Tile } from '../game/world';
import { element } from './dom';
import { sound } from '../sound/engine';

/**
 * 모험 지역 전체지도(2026-11-25 사용자 "m 키를 누르던, 미니맵에 +버튼을 만들던 해서, 현재 챕터 전체지도 보이게", 디자인 세션 6 minimap-v8.md 3·4절 "넘겨").
 * 지역 맵 넷을 이어진 포탈이 가깝게 놓은 배치표(chapter-layout.json, PC wide / 휴대폰 tall)대로 걷는 땅 윤곽만 그린다.
 * 밑그림(윤곽·이어짐·지역 밖 화살표·맵 이름·포탈 점)은 열 때와 지금 맵·창 크기·열린 포탈이 바뀔 때만 한 번 굽고,
 * 덧그림(보스·유저·나 점)은 상태가 바뀌었을 때만 다시 그린다(GameScene이 0.1초마다 견줌). 매 프레임 일은 없다.
 */

const PHONE_QUERY = '(max-width: 620px)';
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
const C = {
  edge: '#1f1510',
  dim: '#d8c6a8',
  gold: '#f2cf6a',
  me: '#ffe14d',
  other: '#ff4d4d',
  portal: '#5fe3ff',
  boss: '#ff3b30',
  mini: '#ffa53a',
  gate: '#ffe14a',
  lineNow: '#fff3d0',
  lineOther: '#9c8c70',
  link: 'rgba(95,227,255,0.45)',
  textEdge: 'rgba(20,14,10,0.9)',
};

export interface ChapterState {
  /** 지금 맵 id(모험 지역 맵) */
  now: string;
  me: Tile;
  /** 지금 맵의 다른 유저 칸 */
  others: Tile[];
  /** 이번 판에 이긴 보스·중간 보스·수문장 키(서버 run_bosses) */
  beaten: readonly string[];
}

interface Frame {
  zone: number;
  ids: string[];
  layout: ChapterLayout;
  small: boolean;
  k: number;
  ox0: number;
  oy0: number;
}

const ground = (m: AdvMapData, x: number, y: number) => m.rows[y]?.[x] === '.';

/** 그림판 w × h의 픽셀마다 덮는 칸을 거꾸로 찾아(toTile) 걷는 땅 가면을 만들고, 네 이웃에 땅이 아닌 픽셀이 있는 땅 픽셀만 칠한다. */
function bakeOutline(w: number, h: number, toTile: (px: number, py: number) => [number, number], m: AdvMapData, color: string, thick: number) {
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [tx, ty] = toTile(x + 0.5, y + 0.5);
      if (ground(m, tx, ty)) mask[x + y * w] = 1;
    }
  }
  const img = new ImageData(w, h);
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[x + y * w]) continue;
      let edge = false;
      for (let d = 1; d <= thick && !edge; d++) {
        if (x - d < 0 || y - d < 0 || x + d >= w || y + d >= h) edge = true;
        else if (!mask[x - d + y * w] || !mask[x + d + y * w] || !mask[x + (y - d) * w] || !mask[x + (y + d) * w]) edge = true;
      }
      if (!edge) continue;
      const i = (x + y * w) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

function square(g: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  const h = Math.floor(s / 2);
  const cx = Math.round(x);
  const cy = Math.round(y);
  g.fillStyle = C.edge;
  g.fillRect(cx - h - 1, cy - h - 1, s + 2, s + 2);
  g.fillStyle = color;
  g.fillRect(cx - h, cy - h, s, s);
}

/** 미니맵과 같은 마름모 점(한 줄씩 정수 픽셀, 한 픽셀 큰 어두운 마름모를 먼저 깖) */
function diamond(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (const [r, fill] of [
    [h + 1, C.edge],
    [h, color],
  ] as const) {
    g.fillStyle = fill;
    for (let dy = -r; dy <= r; dy++) {
      const w = r - Math.abs(dy);
      g.fillRect(cx - w, cy + dy, w * 2 + 1, 1);
    }
  }
}

export class ChapterMap {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly base: HTMLCanvasElement;
  private readonly over: HTMLCanvasElement;
  /** 윤곽 한 맵을 올리는 숨은 그림판(다시 씀) */
  private readonly scratch = document.createElement('canvas');
  private open = false;
  private state: ChapterState | null = null;
  private frame: Frame | null = null;
  /** 밑그림을 마지막으로 구운 조건(지역, 지금 맵, 크기, 열린 포탈). 같으면 다시 굽지 않는다. */
  private baseKey = '';
  /** 마지막으로 밑그림을 구운 시간(ms, 확인용) */
  lastBakeMs = 0;
  /** 열고 닫힐 때(미니맵 지도 버튼을 눌린 모양으로) */
  onToggle: ((open: boolean) => void) | null = null;

  constructor(parent: HTMLElement) {
    this.root = element('chapter-map', parent);
    this.root.hidden = true;
    const head = element('chapter-map-head', this.root);
    this.title = element('chapter-map-title', head);
    const close = element('chapter-map-close', head, 'button') as HTMLButtonElement;
    close.type = 'button';
    close.tabIndex = -1;
    close.title = '닫기';
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });
    this.body = element('chapter-map-body', this.root);
    this.base = element('chapter-map-canvas', this.body, 'canvas') as HTMLCanvasElement;
    this.over = element('chapter-map-canvas over', this.body, 'canvas') as HTMLCanvasElement;
    // 창 크기가 바뀌면 다음에 다시 맞춘다(열려 있으면 바로).
    window.addEventListener('resize', () => {
      if (this.open && this.state) void this.show(this.state);
    });
  }

  get isOpen() {
    return this.open;
  }

  /** 연다. 이미 열려 있으면 지금 상태로 맞춘다. */
  async show(state: ChapterState) {
    const map = advMap(state.now);
    if (!map?.zone) return;
    this.state = state;
    if (!this.open) {
      this.open = true;
      if (this.root.hidden) sound.play('ui_open');
      this.root.hidden = false;
      this.onToggle?.(true);
    }
    const zones = await loadChapterLayout().catch(() => null);
    if (!this.open || this.state !== state) return;
    const pair = zones?.[String(map.zone)];
    if (!pair) {
      this.close();
      return;
    }
    this.title.textContent = `${map.zone}  ${map.zoneName ?? ''}`;
    this.render(map.zone, pair, state);
  }

  /** 열려 있을 때 상태가 바뀌었다(GameScene이 바뀐 것이 있을 때만 부름). */
  update(state: ChapterState) {
    if (!this.open) return;
    const zone = advMap(state.now)?.zone;
    if (!zone) {
      this.close();
      return;
    }
    if (zone !== this.frame?.zone || state.now !== this.state?.now) {
      void this.show(state);
      return;
    }
    this.state = state;
    if (this.baseKeyOf(this.frame, state) !== this.baseKey) this.paintBase(this.frame, state);
    this.paintOver(this.frame, state);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    if (!this.root.hidden) sound.play('ui_close');
    this.root.hidden = true;
    this.onToggle?.(false);
  }

  /** 창 크기에 맞춰 배율을 정하고, 밑그림이 달라졌을 때만 굽는다. */
  private render(zone: number, pair: { wide: ChapterLayout; tall: ChapterLayout }, state: ChapterState) {
    const small = matchMedia(PHONE_QUERY).matches;
    const layout = small ? pair.tall : pair.wide;
    // 배치표와 맵 자료가 둘 다 아는 맵만 그린다(맵을 바꾸고 배치표를 아직 다시 안 만들었어도 깨지지 않게).
    const ids = Object.keys(layout.maps).filter((id) => advMap(id)?.zone === zone);
    const PAD = small ? 10 : 18;
    const LABEL = small ? 16 : 22;
    const OUTER = small ? 34 : 64;
    const w = Math.max(200, Math.floor(this.body.clientWidth));
    let h: number;
    if (small) {
      // 휴대폰: 폭에 맞춘 배율로 높이를 정하고, 아래 막대 위까지로 줄인다.
      const k = (w - PAD * 2 - OUTER * 2) / layout.size[0];
      const room = window.innerHeight - this.body.getBoundingClientRect().top - 120;
      h = Math.max(160, Math.min(Math.ceil(layout.size[1] * k + PAD * 2 + LABEL + OUTER), Math.floor(room)));
    } else h = Math.max(160, Math.floor(this.body.clientHeight));
    for (const c of [this.base, this.over]) {
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
    }
    this.body.style.height = small ? `${h}px` : '';
    const k = Math.min((w - PAD * 2 - OUTER * 2) / layout.size[0], (h - PAD * 2 - LABEL - OUTER) / layout.size[1]);
    const mapW = layout.size[0] * k;
    const mapH = layout.size[1] * k;
    const frame: Frame = {
      zone,
      ids,
      layout,
      small,
      k,
      ox0: Math.round((w - mapW) / 2),
      oy0: Math.round(PAD + LABEL + (h - PAD * 2 - LABEL - mapH) / 2),
    };
    const sizeChanged = !this.frame || this.frame.k !== frame.k || this.frame.ox0 !== frame.ox0 || this.frame.oy0 !== frame.oy0 || this.frame.zone !== zone || this.frame.small !== small;
    this.frame = frame;
    if (sizeChanged || this.baseKeyOf(frame, state) !== this.baseKey) this.paintBase(frame, state);
    this.paintOver(frame, state);
  }

  /** 밑그림 조건: 지역, 지금 맵, 배율·자리, 지역 밖 포탈이 열렸는지(보스·수문장 키) */
  private baseKeyOf(f: Frame, state: ChapterState) {
    const open = f.ids
      .flatMap((id) => (advMap(id)?.portals ?? []).filter((p) => p.need).map((p) => (this.portalOpen(id, p.need!, state.beaten) ? 1 : 0)))
      .join('');
    return `${f.zone}|${state.now}|${f.k}|${f.ox0}|${f.oy0}|${f.small}|${open}`;
  }

  /**
   * 지역 밖 포탈이 이번 판에 열렸는지. 키는 맵 자료에서 읽는다(특정 맵·키 모양에 묶지 않음, 맵을 바꿔도 그대로):
   * 'gate'는 그 맵 수문장의 gate 키, 'boss'는 같은 지역 맵들의 보스 key 가운데 하나(별 하늘처럼 보스 둘이 키 하나여도 됨).
   */
  private portalOpen(id: string, need: 'boss' | 'gate', beaten: readonly string[]) {
    const map = advMap(id);
    if (!map) return false;
    if (need === 'gate') return (map.monsters ?? []).some((m) => m.gate && beaten.includes(m.gate));
    const keys = (this.frame?.ids ?? [id])
      .flatMap((other) => advMap(other)?.monsters ?? [])
      .filter((m) => m.role === 'boss' && m.key)
      .map((m) => m.key!);
    return keys.some((key) => beaten.includes(key));
  }

  private at(f: Frame, id: string, x: number, y: number) {
    const L = f.layout.maps[id];
    return { x: f.ox0 + (L.ox + (x - y)) * f.k, y: f.oy0 + (L.oy + (x + y) / 2) * f.k };
  }

  private paintBase(f: Frame, state: ChapterState) {
    const t0 = performance.now();
    this.baseKey = this.baseKeyOf(f, state);
    const g = this.base.getContext('2d')!;
    const { k, small } = f;
    g.clearRect(0, 0, this.base.width, this.base.height);
    const maps = f.ids.map((id) => advMap(id)).filter((m): m is AdvMapData => !!m);
    const inZone = new Set(f.ids);

    // 맵 사이 이어짐: 두 포탈 점을 점선으로(윤곽 아래)
    g.setLineDash(small ? [3, 3] : [5, 4]);
    g.lineWidth = small ? 1 : 1.5;
    g.strokeStyle = C.link;
    for (const m of maps) {
      for (const p of m.portals) {
        if (!inZone.has(p.to) || m.id > p.to) continue;
        const back = advMap(p.to)?.portals.find((q) => q.to === m.id);
        if (!back) continue;
        const a = this.at(f, m.id, p.x + 0.5, p.y + 0.5);
        const b = this.at(f, p.to, back.x + 0.5, back.y + 0.5);
        g.beginPath();
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
      }
    }
    g.setLineDash([]);

    // 윤곽: 맵마다 자기 상자 범위 픽셀만 돌며 굽는다.
    for (const m of maps) {
      const L = f.layout.maps[m.id];
      const x0 = Math.floor(f.ox0 + (L.ox + L.box[0]) * k) - 1;
      const y0 = Math.floor(f.oy0 + (L.oy + L.box[1]) * k) - 1;
      const bw = Math.ceil((L.box[2] - L.box[0]) * k) + 3;
      const bh = Math.ceil((L.box[3] - L.box[1]) * k) + 3;
      const toTile = (px: number, py: number): [number, number] => {
        const X = (x0 + px - f.ox0) / k - L.ox;
        const Y = (y0 + py - f.oy0) / k - L.oy;
        return [Math.floor(Y + X / 2), Math.floor(Y - X / 2)];
      };
      const now = m.id === state.now;
      // putImageData는 밑의 이어짐 점선까지 덮어쓰므로 작은 그림판에 올린 뒤 drawImage로 겹친다.
      const scratch = this.scratch;
      if (scratch.width < bw) scratch.width = bw;
      if (scratch.height < bh) scratch.height = bh;
      const sg = scratch.getContext('2d')!;
      sg.putImageData(bakeOutline(bw, bh, toTile, m, now ? C.lineNow : C.lineOther, now && !small ? 2 : 1), 0, 0);
      g.drawImage(scratch, 0, 0, bw, bh, x0, y0, bw, bh);
    }

    // 맵 이름 자리(배치표 label, 없으면 상자 위 가운데). 아래 화살표 글이 이름을 덮지 않게 먼저 셈해 둔다.
    const nameSize = small ? 11 : 13;
    const nameFont = `bold ${nameSize}px ${FONT}`;
    g.font = nameFont;
    const names = maps.map((m) => {
      const L = f.layout.maps[m.id];
      const label = L.label;
      const x = f.ox0 + (L.ox + (label ? label.x : (L.box[0] + L.box[2]) / 2)) * k;
      const ly = f.oy0 + (L.oy + (label ? label.y : L.box[1])) * k;
      // 'above'는 글 아래끝을 5px 위, 'below'는 글 위끝을 5px 아래(디자인 세션 7 배치표 규칙).
      const below = label?.side === 'below';
      const y = below ? ly + 5 : ly - 5;
      const w = g.measureText(m.name).width;
      const top = below ? y : y - nameSize;
      return { m, x, y, below, box: [x - w / 2 - 2, top - 2, x + w / 2 + 2, top + nameSize + 2] as const };
    });
    const taken: (readonly [number, number, number, number])[] = names.map((n) => n.box);
    const hits = (b: readonly [number, number, number, number]) => taken.some((t) => b[0] < t[2] && t[0] < b[2] && b[1] < t[3] && t[1] < b[3]);

    // 지역 밖으로 나가는 포탈: 맵 가운데 → 포탈 쪽 짧은 화살표 + 가는 지역 이름(앞 지역 하늘색, 다음 지역 주황, 수문장 노랑, 안 열렸으면 흐리게)
    for (const m of maps) {
      const L = f.layout.maps[m.id];
      const cx = f.ox0 + (L.ox + (L.box[0] + L.box[2]) / 2) * k;
      const cy = f.oy0 + (L.oy + (L.box[1] + L.box[3]) / 2) * k;
      for (const p of m.portals) {
        if (inZone.has(p.to)) continue;
        const q = this.at(f, m.id, p.x + 0.5, p.y + 0.5);
        const dx = q.x - cx;
        const dy = q.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const tip = { x: q.x + ux * (small ? 14 : 22), y: q.y + uy * (small ? 14 : 22) };
        const color = p.need === 'gate' ? C.gate : p.need === 'boss' ? C.mini : C.portal;
        g.globalAlpha = p.need && !this.portalOpen(m.id, p.need, state.beaten) ? 0.4 : 1;
        g.strokeStyle = color;
        g.lineWidth = small ? 1.5 : 2;
        g.beginPath();
        g.moveTo(q.x, q.y);
        g.lineTo(tip.x, tip.y);
        g.stroke();
        const angle = Math.atan2(uy, ux);
        const head = small ? 4 : 6;
        g.fillStyle = color;
        g.beginPath();
        g.moveTo(tip.x + Math.cos(angle) * head, tip.y + Math.sin(angle) * head);
        g.lineTo(tip.x + Math.cos(angle + 2.4) * head, tip.y + Math.sin(angle + 2.4) * head);
        g.lineTo(tip.x + Math.cos(angle - 2.4) * head, tip.y + Math.sin(angle - 2.4) * head);
        g.closePath();
        g.fill();
        const label = advMap(p.to)?.zoneName ?? '';
        const size = small ? 10 : 12;
        g.font = `bold ${size}px ${FONT}`;
        const w = g.measureText(label).width;
        const vertical = Math.abs(uy) > Math.abs(ux);
        const side = small ? 6 : 9;
        // 글 자리 후보: 화살표 끝 옆(예전 자리) → 반대쪽 옆 → 끝 아래 → 끝 위. 맵 이름이나 앞서 놓은 글과 겹치지 않는 첫 자리(제가 정한 것).
        const first: CanvasTextAlign = vertical || ux > 0 ? 'left' : 'right';
        const W = this.base.width;
        const H = this.base.height;
        // 그림판 밖으로 나가면 안쪽으로 밀어 넣는다(휴대폰은 가장자리 여유가 좁아 지역 이름이 잘렸음).
        const inside = (c: { align: CanvasTextAlign; x: number; y: number }) => {
          const x0 = c.align === 'center' ? c.x - w / 2 : c.align === 'right' ? c.x - w : c.x;
          const shift = Math.max(0, 3 - x0) - Math.max(0, x0 + w - (W - 3));
          return { align: c.align, x: c.x + shift, y: Math.min(H - 4, Math.max(size + 2, c.y)) };
        };
        const candidates = ([
          { align: first, x: vertical ? tip.x + side : tip.x + ux * (small ? 5 : 8), y: vertical ? tip.y + (small ? 4 : 5) : tip.y + 4 },
          { align: first === 'left' ? 'right' : 'left', x: first === 'left' ? tip.x - side : tip.x + side, y: tip.y + 4 },
          { align: 'center' as CanvasTextAlign, x: tip.x, y: tip.y + size + 6 },
          { align: 'center' as CanvasTextAlign, x: tip.x, y: tip.y - 8 },
          { align: 'center' as CanvasTextAlign, x: tip.x, y: tip.y + size * 2 + 10 },
          { align: 'center' as CanvasTextAlign, x: tip.x, y: tip.y - size - 12 },
        ] as { align: CanvasTextAlign; x: number; y: number }[]).map(inside);
        const boxOf = (c: { align: CanvasTextAlign; x: number; y: number }) => {
          const x0 = c.align === 'center' ? c.x - w / 2 : c.align === 'right' ? c.x - w : c.x;
          return [x0 - 2, c.y - size - 2, x0 + w + 2, c.y + 3] as const;
        };
        const pick = candidates.find((c) => !hits(boxOf(c))) ?? candidates[0];
        taken.push(boxOf(pick));
        g.textAlign = pick.align;
        g.lineWidth = 3;
        g.strokeStyle = C.textEdge;
        g.strokeText(label, pick.x, pick.y);
        g.fillText(label, pick.x, pick.y);
        g.globalAlpha = 1;
      }
    }

    // 맵 이름(위에서 셈한 자리)과 포탈 점
    for (const { m, x, y, below } of names) {
      g.font = nameFont;
      g.textAlign = 'center';
      g.textBaseline = below ? 'top' : 'alphabetic';
      g.lineWidth = 3;
      g.strokeStyle = C.textEdge;
      g.strokeText(m.name, x, y);
      g.fillStyle = m.id === state.now ? C.gold : C.dim;
      g.fillText(m.name, x, y);
      g.textBaseline = 'alphabetic';
      for (const p of m.portals) {
        const q = this.at(f, m.id, p.x + 0.5, p.y + 0.5);
        square(g, q.x, q.y, small ? 3 : 4, p.need === 'gate' ? C.gate : C.portal);
      }
    }
    this.lastBakeMs = performance.now() - t0;
  }

  /** 덧그림: 네 맵의 보스·중간 보스·수문장(이번 판에 이긴 것은 빠짐), 지금 맵의 다른 유저와 나 */
  private paintOver(f: Frame, state: ChapterState) {
    const g = this.over.getContext('2d')!;
    const { small } = f;
    g.clearRect(0, 0, this.over.width, this.over.height);
    for (const id of f.ids) {
      const m = advMap(id);
      if (!m) continue;
      for (const s of m.monsters ?? []) {
        if (s.role !== 'boss' && s.role !== 'mid' && !s.gate) continue;
        const key = s.key ?? s.gate;
        if (key && state.beaten.includes(key)) continue;
        const q = this.at(f, id, s.x + 0.5, s.y + 0.5);
        if (s.role === 'boss') diamond(g, q.x, q.y, small ? 3 : 4, C.boss);
        else diamond(g, q.x, q.y, small ? 2 : 3, C.mini);
      }
    }
    if (!f.layout.maps[state.now]) return;
    for (const o of state.others) {
      const q = this.at(f, state.now, o.x + 0.5, o.y + 0.5);
      square(g, q.x, q.y, small ? 3 : 4, C.other);
    }
    const q = this.at(f, state.now, state.me.x + 0.5, state.me.y + 0.5);
    square(g, q.x, q.y, small ? 5 : 6, C.me);
  }
}

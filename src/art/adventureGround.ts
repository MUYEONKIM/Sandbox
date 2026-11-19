import { gridToWorld, tileCenter } from '../iso';
import { Terrain, type GameMap } from '../game/map';
import { infernus, monsterArt, type AdvMapData, type FieldMonster } from '../game/adventureMaps';
import { worldRect } from './ground';

/**
 * 모험 맵 바닥 그림에 더하는 것(2026-11-18, 디자인 세션 확인 도구 art-source/adventure/maps/view.js의 paintFloor를 옮김).
 * 별(빈 땅), 일곱 빛 구역 색과 경계, Infernus 바닥 조각(뼈, 무늬, 용 뼈), 보스·중간 보스 칸 고리, 떠 있는 몬스터 발밑 그림자.
 * 띠 경계 점선은 몬스터에 레벨 이름표가 붙어 그리지 않는다(2026-11-18 맵 위 몬스터, 디자인 세션 확인 그림과 같음).
 * 맵에 처음 들어갈 때 바닥 그림(paintGround) 한 장에 한 번 그린다. 매 프레임 하는 일은 없다.
 */

const SIZE_OF = (map: GameMap) => map.size;

/** 칸 윗면 마름모를 지금 경로에 더한다(월드 좌표). */
function diamondPath(g: CanvasRenderingContext2D, x: number, y: number, ox = 0) {
  const a = gridToWorld(x, y);
  const b = gridToWorld(x + 1, y);
  const c = gridToWorld(x + 1, y + 1);
  const e = gridToWorld(x, y + 1);
  g.moveTo(a.x - ox, a.y);
  g.lineTo(b.x - ox, b.y);
  g.lineTo(c.x - ox, c.y);
  g.lineTo(e.x - ox, e.y);
  g.closePath();
}

function diamond(g: CanvasRenderingContext2D, x: number, y: number, ox: number) {
  g.beginPath();
  diamondPath(g, x, y, ox);
}

/** monsters: 맵 위 몬스터(adventureMaps.monstersOf). 몬스터는 제자리에 떠 있어 그림자를 바닥 그림에 한 번 그린다. */
export function paintAdventureGround(canvas: HTMLCanvasElement, data: AdvMapData, map: GameMap, monsters: FieldMonster[]) {
  const g = canvas.getContext('2d')!;
  const size = SIZE_OF(map);
  const ox = worldRect(size).left;
  const ground = (x: number, y: number) => x >= 0 && y >= 0 && x < size && y < size && map.terrain[x + y * size] === Terrain.Ground;

  // 별 하늘: 빈 땅에 별을 찍는다.
  for (const s of data.stars ?? []) {
    if (ground(Math.floor(s.x), Math.floor(s.y))) continue;
    const p = gridToWorld(s.x, s.y);
    g.fillStyle = `rgba(255,255,240,${s.a})`;
    g.fillRect(Math.round(p.x - ox), Math.round(p.y), s.s, s.s);
  }

  // 일곱 빛 들판: 구역마다 빛 색을 반투명으로 칠하고(그린 바닥 위에만) 구역 경계를 긋는다.
  const L = data.lights;
  if (L) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = 0.42;
    for (let y = L.origin; y < L.origin + L.n * L.size; y++) {
      for (let x = L.origin; x < L.origin + L.n * L.size; x++) {
        const li = Number(L.rows[Math.floor((y - L.origin) / L.size)][Math.floor((x - L.origin) / L.size)]);
        g.fillStyle = L.legend[li].color;
        diamond(g, x, y, ox);
        g.fill();
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.lineWidth = 1;
    const end = L.origin + L.n * L.size;
    for (let i = 0; i <= L.n; i++) {
      const t = L.origin + i * L.size;
      for (const [a, b] of [
        [gridToWorld(t, L.origin), gridToWorld(t, end)],
        [gridToWorld(L.origin, t), gridToWorld(end, t)],
      ]) {
        g.beginPath();
        g.moveTo(a.x - ox, a.y);
        g.lineTo(b.x - ox, b.y);
        g.stroke();
      }
    }
  }

  // 바닥 조각. clip이면 땅 칸 안만 남긴다(그늘 동굴의 용 뼈).
  const art = infernus();
  if (art) {
    for (const f of data.floors) {
      const m = art.meta.floors[f.id];
      if (!m) continue;
      const c = tileCenter(f.x, f.y);
      const dx = Math.round(c.x - ox - m.w / 2);
      const dy = Math.round(c.y - m.h / 2);
      if (!f.clip) {
        g.drawImage(art.floorPieces, m.x, m.y, m.w, m.h, dx, dy, m.w, m.h);
        continue;
      }
      const t = document.createElement('canvas');
      t.width = m.w;
      t.height = m.h;
      const tg = t.getContext('2d')!;
      tg.drawImage(art.floorPieces, m.x, m.y, m.w, m.h, 0, 0, m.w, m.h);
      // 땅 칸 마름모를 한 경로로 모아 한 번에 남긴다(destination-in은 칠한 곳 밖을 지우므로 한 번만 칠한다).
      tg.globalCompositeOperation = 'destination-in';
      tg.fillStyle = '#000';
      tg.translate(-(ox + dx), -dy);
      tg.beginPath();
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) if (ground(x, y)) diamondPath(tg, x, y);
      }
      tg.fill();
      g.globalAlpha = 0.9;
      g.drawImage(t, dx, dy);
      g.globalAlpha = 1;
    }
  }

  // 보스(빨강)·중간 보스(주황) 칸 고리 두 겹
  const ring = (s: { x: number; y: number }, color: string) => {
    const c = tileCenter(s.x, s.y);
    g.strokeStyle = color;
    for (const [rx, w] of [
      [13, 2],
      [19, 1.5],
    ]) {
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(c.x - ox, c.y, rx, rx / 2, 0, 0, Math.PI * 2);
      g.stroke();
    }
  };
  for (const s of data.bosses) ring(s, '#ff3b30');
  for (const s of data.mids) ring(s, '#ffa53a');

  // 떠 있는 몬스터 발밑 그림자: 두 단계 타원(디자인 세션 adventure-monsters.md 4절, 그림 폭의 30%, 최소 9)
  for (const mo of monsters) {
    // 수문장은 이번 판에 이기면 사라져서 바닥에 그림자를 굽지 않는다(에이전트가 정함)
    if (mo.gate) continue;
    const found = monsterArt(mo.art);
    if (!found) continue;
    const f = found.frame;
    const c = tileCenter(mo.x, mo.y);
    const rx = Math.max(9, Math.round(f.w * (found.meta.scale ?? 1) * 0.3));
    const ry = Math.round(rx / 2);
    for (const [k, a] of [
      [1, 0.22],
      [0.66, 0.22],
    ]) {
      g.fillStyle = `rgba(0,0,0,${a})`;
      g.beginPath();
      g.ellipse(Math.round(c.x - ox), Math.round(c.y), rx * k, ry * k, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
}

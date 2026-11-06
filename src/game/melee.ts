import type { BulletTarget } from './bullets';

/** 앞쪽 120도 안에 있어야 벨 수 있다. 부채꼴 절반 각도의 코사인 값이다. */
const ARC_COS = 0.5;
/** 몸이 겹칠 만큼 가까우면 방향과 상관없이 벤다. */
const TOUCHING = 0.5;
const CHECK_STEP = 0.2;

interface Point {
  x: number;
  y: number;
}

/** 칼이 벽을 뚫지 않도록 두 지점 사이를 잘게 나누어 확인한다. */
function isClear(from: Point, to: Point, isSolid: (x: number, y: number) => boolean) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  for (let moved = CHECK_STEP; moved < length; moved += CHECK_STEP) {
    const ratio = moved / length;
    const x = from.x + (to.x - from.x) * ratio;
    const y = from.y + (to.y - from.y) * ratio;
    if (isSolid(Math.floor(x), Math.floor(y))) return false;
  }
  return true;
}

/** from에서 aim 쪽으로 벨 때 맞는 사람을 찾는다. 한 번에 가장 가까운 한 명만 벤다. */
export function meleeTarget(
  from: Point,
  aim: Point,
  reach: number,
  targets: BulletTarget[],
  isSolid: (x: number, y: number) => boolean,
) {
  const aimX = aim.x - from.x;
  const aimY = aim.y - from.y;
  const aimLength = Math.hypot(aimX, aimY);

  const inArc = (target: BulletTarget) => {
    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const distance = Math.hypot(dx, dy);
    if (distance > reach) return false;
    if (distance <= TOUCHING) return true;
    return (dx * aimX + dy * aimY) / (distance * aimLength) >= ARC_COS;
  };

  const distanceTo = ({ x, y }: BulletTarget) => Math.hypot(x - from.x, y - from.y);
  return targets
    .filter((target) => inArc(target) && isClear(from, target, isSolid))
    .sort((a, b) => distanceTo(a) - distanceTo(b))[0];
}

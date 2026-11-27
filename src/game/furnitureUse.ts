import { BLOCKS, blockArt, isCeil, isCurtain, isOff, pairOf, type BlockId } from '../blocks';
import type { Posture } from '../net/session';
import { USE_SEATS } from '../roomUse';

/**
 * 가구를 쓰는 법(2026-11-27, 공유 노트 room-rules.md 2·4절): F로 맞닿은 칸의 가구에 앉거나 눕고, 등을 켜고 끄고, 커튼을 여닫고, 상자를 연다.
 * 앉는·눕는 가구는 디자인 세션 5의 자리 자료(roomUse.ts USE_SEATS)를 따르고, 자료가 없는 것(옛 가구)은 이름으로 고른다. 상자 가구는 이름으로 고른다(코드 세션 5가 정함).
 */

const SIT = /의자|소파|벤치|스툴|변기|방석|빈백|흔들|오토만|안마/;
const LIE = /침대|해먹|^요\(|^요$|매트리스/;
const STORE = /서랍장|옷장|장롱|상자|궤짝|냉장고|금고|반닫이|수납|캐비닛|사물함|트롤리|진열장|행거/;

const isFurnishing = (id: BlockId) => {
  const { kind } = blockArt(id);
  return kind === 'room' || kind === 'furniture' || kind === 'cube';
};

/** 앉는 가구면 'sit', 눕는 가구면 'lie' */
export function seatKind(id: BlockId): Posture | null {
  if (!isFurnishing(id) || isCeil(id) || blockArt(id).kind === 'cube') return null;
  // 자리 자료가 있으면 그것을 따른다. 앉는 자리와 눕는 자리가 다 있으면(소파침대) 앉는다.
  const seat = USE_SEATS[id];
  if (seat) return seat.sit ? 'sit' : 'lie';
  const { name } = BLOCKS[id];
  if (LIE.test(name)) return 'lie';
  return SIT.test(name) ? 'sit' : null;
}

/** 메모와 골드를 넣는 상자 가구 */
export function isStore(id: BlockId) {
  return isFurnishing(id) && !isCeil(id) && STORE.test(BLOCKS[id].name);
}

/** 켜고 끄는 등이나 여닫는 커튼이면 바꿀 짝 id */
export function toggleOf(id: BlockId): BlockId | null {
  const next = pairOf(id);
  if (!next) return null;
  // 짝이 있는 것 가운데 등(켬 ↔ 끔)과 커튼(열림 ↔ 닫힘)만 바꾼다.
  return isCurtain(id) || isOff(id) || isOff(next) || /_on(_|$)/.test(id) ? next : null;
}

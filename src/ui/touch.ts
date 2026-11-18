/**
 * 손가락으로 쓰는 화면(휴대폰)인지. 처음 한 번만 본다(2026-11-18 휴대폰 고치기).
 * 키보드가 없어 글에서 키 이름(F, I, Tab, Esc)을 빼고, 휴대폰에만 있는 버튼은 touch.css가 같은 조건으로 보인다.
 */
export const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

/** 키 안내가 붙은 글: 휴대폰이면 phone, 아니면 pc */
export function byInput(pc: string, phone: string) {
  return TOUCH ? phone : pc;
}

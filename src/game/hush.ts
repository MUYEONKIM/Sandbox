/**
 * 이스터에그(2026-11-13 사용자 요청 "아무도 몰라야 하니 진입 코드와 팝업 문구를 암호화").
 * 들어가는 자리와 키, 들어갈 때 뜨는 문구는 아래 암호문에만 있다. 이동 키 하나를 같은 칸에서 HUSH_HOLD_MS 동안 누르고 있으면
 * "맵:x:y:키 코드"로 열쇠를 만들어 풀어 본다(PBKDF2 600,000회 → AES-GCM). 맞는 자리가 아니면 풀리지 않고 아무 일도 없다.
 * 이 파일은 art-source/secret/make-hush.cjs(커밋 안 함, 원문이 들어 있음)가 만든다. 손으로 고치지 않는다.
 */
export const HUSH_HOLD_MS = 5000;

const ROUNDS = 600000;
const SALT = 'mBawODPOppAVgZuCtJWkDg==';
const IV = 'Z2jp9mt+u8a0ZMAG';
const DATA = 'X0p0YhePHoEHuCoRQga7JVjqWCbbNn3nt1dEbgb9c2fZjrjDF/9h50Vxw7Bup9ddeQlL3r5xGGMt';

export interface Hush {
  /** 들어갈 맵 */
  map: string;
  /** 들어간 사람에게만 띄우는 문구 */
  popup: string;
}

const bytes = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function openHush(place: string): Promise<Hush | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const material = await subtle.importKey('raw', new TextEncoder().encode(place), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle.deriveKey(
      { name: 'PBKDF2', salt: bytes(SALT), iterations: ROUNDS, hash: 'SHA-256' },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );
    const plain = await subtle.decrypt({ name: 'AES-GCM', iv: bytes(IV) }, key, bytes(DATA));
    return JSON.parse(new TextDecoder().decode(plain)) as Hush;
  } catch {
    return null;
  }
}

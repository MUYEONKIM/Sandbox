import { element } from './dom';

/** 서버가 모두에게 보내는 알림 */
export type Notice =
  | { kind: 'join'; name: string }
  /** wanted는 잡힌 사람의 악업(0이면 현상범이 아니었음) */
  | { kind: 'kill'; killer: string; victim: string; wanted: number }
  /** 닉네임 변경(2026-11-13 사용자 요청 "전체에 알림"). id로 같은 맵 사람의 이름표를 바꾼다. */
  | { kind: 'rename'; id: string; from: string; to: string };

/** 한 번에 화면에 남겨 두는 알림 수와 보이는 시간 */
const MAX_NOTICES = 3;
const NOTICE_MS = 4500;

/** 숫자는 읽는 소리로 받침을 정한다: 영 일 삼 육 칠 팔은 받침이 있다. */
const DIGIT_BATCHIM: Record<string, boolean> = {
  '0': true, '1': true, '2': false, '3': true, '4': false, '5': false, '6': true, '7': true, '8': true, '9': false,
};

/** 마지막 글자에 받침이 있는지. 알 수 없으면(영문 등) null */
function hasBatchim(word: string): boolean | null {
  const last = word.at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  return DIGIT_BATCHIM[last] ?? null;
}

/** 닉네임 뒤에 맞는 조사를 붙인다. 받침을 알 수 없으면 "이(가)"처럼 둘 다 쓴다. */
function josa(word: string, withBatchim: string, without: string) {
  const batchim = hasBatchim(word);
  if (batchim === null) return `${word}${withBatchim}(${without})`;
  return word + (batchim ? withBatchim : without);
}

/** "으로/로": 받침이 없거나 ㄹ 받침이면 "로"다. 숫자 1, 7, 8(일, 칠, 팔)도 ㄹ 받침이다. */
function josaRo(word: string) {
  const last = word.at(-1) ?? '';
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const final = (code - 0xac00) % 28;
    return word + (final === 0 || final === 8 ? '로' : '으로');
  }
  const batchim = DIGIT_BATCHIM[last];
  if (batchim === undefined) return `${word}(으)로`;
  return word + (batchim && !'178'.includes(last) ? '으로' : '로');
}

export function noticeText(notice: Notice) {
  if (notice.kind === 'join') return `${notice.name}님이 입장했습니다`;
  if (notice.kind === 'rename') return `${josa(notice.from, '이', '가')} 닉네임을 ${josaRo(notice.to)} 바꿨습니다`;
  if (notice.wanted > 0) return `${josa(notice.killer, '이', '가')} 현상범 ${josa(notice.victim, '을', '를')} 잡았습니다`;
  return `${josa(notice.killer, '이', '가')} ${josa(notice.victim, '을', '를')} 죽였습니다`;
}

/** 화면 위쪽 가운데에 잠깐 떴다 사라지는 전체 알림 */
export class NoticeBar {
  private readonly root: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = element('notices', parent);
  }

  show(notice: Notice) {
    const line = element(`notice notice-${notice.kind}`, this.root);
    line.textContent = noticeText(notice);
    while (this.root.childElementCount > MAX_NOTICES) this.root.firstElementChild?.remove();
    window.setTimeout(() => line.remove(), NOTICE_MS);
  }
}

/**
 * 펫의 말(기획 세션 4 docs/balance/pet-care-1127.md 4.2 말 목록, 종류와 상관없이 같음). 낱말 답(4.1 표) 가운데
 * 목록에 없는 짧은 답 몇 줄('조금 먹을 수 있어요!', '같이 놀아요!', '저도 고마워요!', '괜찮아요!')은 코드 세션이 정했다.
 * 말투(2026-11-28 사용자 "펫들의 말투는 모두다 ..!! 맛있어요! 주인님..! 안녕하세요..! 와 같이 ...! 또는 ! 을 붙인다"): 끝만 바꿨다.
 * '.' → '!', '..' → '..!', 물음 → '?!'(PM), 말없음 → '..!!'. 괄호 몸짓('(가만히 바라본다)')은 말이 아니라 그대로. 새 줄도 이 끝으로 쓴다.
 * 고르는 차례(4.1): 0일 때 말 → 그날 첫 인사 → 30 아래 상태의 말 → 곳·때의 말(2단계부터 3번에 1번) → 단계 말. 최근 5개는 빼고 고른다.
 */
export const STAGE_LINES: readonly (readonly string[])[] = [
  ['..!!', '누구세요..?!', '(가만히 바라본다)', '여기는 어디예요?!', '..안녕!', '조금 무서워요!'],
  ['안녕!', '오늘도 왔네요!', '같이 걸어요!', '여기 냄새가 좋아요!', '조금 더 놀아도 돼요?!', '헤헤..!'],
  ['보고 싶었어요!', '오늘은 뭐 할 거예요?!', '옆에 있으면 좋아요!', '아까 그거 재밌었어요!', '헤헤.. 쓰다듬어 줘요!', '같이 있으니까 따뜻해요!'],
  ['제일 좋아요!', '어디든 같이 갈래요!', '오늘도 고마워요!', '내가 옆에 있을게요!', '헤헤.. 계속 이렇게 있고 싶어요!', '기다리고 있었어요!'],
  ['우리는 가족이에요!', '언제나 여기 있을게요!', '같이 있으면 다 괜찮아요!', '오래오래 같이 있어요!', '헤헤.. 사랑해요!', '오늘 하루도 수고했어요!'],
];

export const GREETINGS = ['..왔어요?!', '안녕! 오늘도 왔네요!', '왔다! 보고 싶었어요!', '기다렸어요! 오늘도 같이 있어요!', '어서 와요. 오늘도 같이 있어서 좋아요!'];

/** 상태가 30 아래일 때: [1~2단계, 3~5단계] */
export const LOW_LINES = {
  fullness: ['배고파요..!', '배고파요.. 같이 뭐 먹어요!'],
  energy: ['졸려요..!', '조금만 쉬었다 가요!'],
  company: ['..혼자 있었어요!', '많이 보고 싶었어요!'],
} as const;

export const ZERO_LINES = ['..배고파요..!', '..어디 갔었어요..!', '힘이 없어요..!', '..!!'];
export const CHANCE_LINE = '..많이 기다렸어요!';
export const REARM_LINE = '..고마워요. 다시 힘이 나요!';
export const FAREWELL_LINE = '..!!';
/** 기분 좋은 큰 화면의 말 */
export const JOY_LINE = '헤헤..!';

/** 곳과 때(2단계부터) */
export const PLACE_LINES = {
  campfire: ['불이 따뜻해요!', '여기 앉아 있으면 좋아요!'],
  campfireMap: ['별이 많아요!'],
  adventure: ['조심해요!', '같이 가요!'],
  farm: ['흙 냄새가 좋아요!', '이거 다 자라면 맛있겠다!'],
  morning: ['좋은 아침이에요!'],
  night: ['밤이에요. 별이 보여요!', '졸려요..!'],
} as const;

/** 돌보기에 답하는 말. 1단계는 짧게(기획 4.2) */
export const CARE_LINES = {
  pat: ['헤헤..!', '..!'],
  praise: ['정말요? 헤헤..!', '..!'],
  feed: ['맛있어요!', '..맛있어요!'],
  favorite: ['이거 제일 좋아해요!', '..맛있어요!'],
  full: '배불러요!',
  play: ['한 번 더!', '..!'],
  tired: '지쳤어요..!',
} as const;

export interface TalkContext {
  stage: number;
  zero: boolean;
  greet: boolean;
  fullness: number;
  energy: number;
  company: number;
  /** 곳: 캠프파이어 곁(마을 통나무·캠프파이어 맵), 캠프파이어 맵, 모험, 농장 */
  place: 'campfire' | 'campfireMap' | 'adventure' | 'farm' | null;
  /** 한국 시간 시(0~23) */
  hour: number;
}

const recent: string[] = [];
const RECENT = 5;

function pick(list: readonly string[]) {
  const fresh = list.filter((line) => !recent.includes(line));
  const from = fresh.length ? fresh : list;
  const line = from[Math.floor(Math.random() * from.length)];
  remember(line);
  return line;
}

function remember(line: string) {
  recent.push(line);
  if (recent.length > RECENT) recent.shift();
}

const tier = (stage: number) => (stage >= 3 ? 1 : 0);

function lowLine(ctx: TalkContext) {
  const low = (['fullness', 'energy', 'company'] as const).filter((k) => ctx[k] < 30);
  if (!low.length) return null;
  return pick(low.map((k) => LOW_LINES[k][tier(ctx.stage)]));
}

/** 칸을 비운 말 걸기: 말 목록에서 하나(기획 4.1 차례) */
export function talkLine(ctx: TalkContext) {
  if (ctx.zero) return pick(ZERO_LINES);
  if (ctx.greet) {
    const line = GREETINGS[ctx.stage - 1];
    remember(line);
    return line;
  }
  const low = lowLine(ctx);
  if (low) return low;
  if (ctx.stage >= 2 && Math.random() < 1 / 3) {
    const extra: string[] = [];
    if (ctx.place) extra.push(...PLACE_LINES[ctx.place]);
    if (ctx.place === 'campfireMap') extra.push(...PLACE_LINES.campfire);
    if (ctx.hour >= 6 && ctx.hour <= 11) extra.push(...PLACE_LINES.morning);
    if (ctx.hour >= 19 || ctx.hour <= 5) extra.push(...PLACE_LINES.night);
    if (extra.length) return pick(extra);
  }
  return pick(STAGE_LINES[ctx.stage - 1]);
}

/** 글로 말하기에서 칭찬으로 치는 낱말(칭찬하기와 간격·횟수를 같이 셈) */
export function isPraiseText(text: string) {
  return ['잘했어', '착해', '최고'].some((w) => text.includes(w));
}

/** 글로 말하기: 낱말에 맞춘 답(기획 4.1 표). 칭찬 낱말은 isPraiseText로 따로 본다. */
export function replyTo(text: string, ctx: TalkContext) {
  const has = (...words: string[]) => words.some((w) => text.includes(w));
  if (ctx.zero) return pick(ZERO_LINES);
  if (has('밥', '배고', '먹자', '간식')) {
    if (ctx.fullness < 30) return LOW_LINES.fullness[tier(ctx.stage)];
    if (ctx.fullness >= 100) return CARE_LINES.full;
    return '조금 먹을 수 있어요!';
  }
  if (has('놀자', '놀아')) return ctx.energy < 15 ? CARE_LINES.tired : '같이 놀아요!';
  if (has('좋아', '사랑', '예뻐', '귀여')) return ['..!', '헤헤..!', '헤헤.. 쓰다듬어 줘요!', '제일 좋아요!', '헤헤.. 사랑해요!'][ctx.stage - 1];
  if (has('안녕', '왔어', '하이')) return GREETINGS[ctx.stage - 1];
  if (has('잘 자', '잘자', '졸려', '피곤')) return LOW_LINES.energy[ctx.energy < 30 ? 0 : 1];
  if (has('고마워')) return ctx.stage === 1 ? '..!' : '저도 고마워요!';
  if (has('미안')) return ctx.stage === 1 ? '..!' : '괜찮아요!';
  return ctx.stage === 1 ? '(가만히 바라본다)' : '(고개를 갸웃한다)';
}

/** 돌보기 답 한 줄(1단계는 짧게) */
export function careLine(kind: 'pat' | 'praise' | 'feed' | 'favorite' | 'play', stage: number) {
  return CARE_LINES[kind][stage === 1 ? 1 : 0];
}

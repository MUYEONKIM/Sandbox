/**
 * NPC 대사(2026-11-28 사용자 "NPC의 대화를 다양하게 많이 추가한다", 나누는 법 "A. 이대로", 대사는 기획 세션 4 npc-lines-1128.md 5절 그대로).
 * NPC마다 첫 인사 + 21줄: 늘 하는 말 8, 때 5(한국 시간), 계절 4, 날 2(크리스마스 12월 24~25일, 새해 첫날 1월 1일), 처음 온 사람 1, 단골 1.
 * 농협 직원 둘(coop, farm-coop)은 같은 대사다(npcLinesOf). 요리사(chef)는 주방이 생길 때 붙인다.
 * 고르는 법은 npcs.ts NpcCrew.pickLine.
 */

export type TalkPhase = 'morning' | 'noon' | 'sunset' | 'night' | 'dawn';
export type TalkSeason = 'spring' | 'summer' | 'autumn' | 'winter';
export type TalkDay = 'xmas' | 'newyear';

export interface NpcLines {
  greet: string;
  always: readonly string[];
  phase: Readonly<Record<TalkPhase, string>>;
  season: Readonly<Record<TalkSeason, string>>;
  day: Readonly<Record<TalkDay, string>>;
  newcomer: string;
  regular: string;
}

export const NPC_LINES: Readonly<Record<string, NpcLines>> = {
  'shopkeeper': {
    greet: '어서 오세요.',
    always: [
      '천천히 보세요.',
      '필요한 게 있으면 말씀하세요.',
      '오늘도 들러 주셨네요.',
      '물건은 다 제자리에 있어요.',
      '먼 길 다녀오셨나 봐요.',
      '아침에 선반을 닦아 뒀어요.',
      '손님 오시니 좋네요.',
      '계산은 여기서 해 드릴게요.',
    ],
    phase: { morning: '좋은 아침이에요.', noon: '점심은 드셨어요?', sunset: '해가 지고 있네요.', night: '늦게까지 고생 많으세요.', dawn: '이 시간에도 문은 열려 있어요.' },
    season: { spring: '밖에 꽃이 피었더라고요.', summer: '오늘도 덥네요.', autumn: '바람이 선선해졌어요.', winter: '밖이 많이 춥죠?' },
    day: { xmas: '메리 크리스마스예요.', newyear: '새해 복 많이 받으세요.' },
    newcomer: '마을에는 처음 오셨어요?',
    regular: '늘 와 주셔서 고마워요.',
  },
  'smith': {
    greet: '어서 오세요.',
    always: [
      '무기 손볼까요?',
      '불은 늘 지펴 두고 있어요.',
      '망치 소리가 좀 크죠?',
      '오늘도 쇠를 두드리는 중이에요.',
      '무기를 아끼시는군요.',
      '모루 앞은 뜨거우니 조심하세요.',
      '쇠 냄새가 나죠?',
      '하실 일 있으면 말씀하세요.',
    ],
    phase: { morning: '아침부터 불을 올렸어요.', noon: '한낮엔 화로가 제일 뜨거워요.', sunset: '하루 일이 거의 끝났네요.', night: '밤에도 화로는 꺼지지 않아요.', dawn: '새벽엔 쇠가 차갑네요.' },
    season: { spring: '봄이라 화로 앞이 덜 덥네요.', summer: '여름엔 화로 앞이 힘들어요.', autumn: '일하기 좋은 날씨예요.', winter: '겨울엔 여기가 제일 따뜻해요.' },
    day: { xmas: '크리스마스에도 불은 켜 둡니다.', newyear: '새해에도 잘 부탁드려요.' },
    newcomer: '대장간은 처음이세요?',
    regular: '이제 무기만 봐도 알겠어요.',
  },
  'apprentice': {
    greet: '어서 오세요.',
    always: [
      '무기 보고 가세요.',
      '제가 닦아 둔 무기들이에요.',
      '아직 배우는 중이에요.',
      '스승님은 저쪽에 계세요.',
      '언젠가 모루 앞에 설 거예요.',
      '마음에 드는 게 있으세요?',
      '오늘 진열을 새로 했어요.',
      '망치는 아직 못 잡아 봤어요.',
    ],
    phase: { morning: '아침 청소를 막 끝냈어요.', noon: '점심 먹고 막 왔어요.', sunset: '해가 지니 화로 불이 밝네요.', night: '밤에는 무기가 더 반짝여요.', dawn: '스승님은 벌써 일어나셨어요.' },
    season: { spring: '바람이 따뜻해졌어요.', summer: '여름엔 땀이 멈추질 않아요.', autumn: '가을이라 일하기 좋아요.', winter: '손이 시려서 장갑을 꼈어요.' },
    day: { xmas: '메리 크리스마스예요!', newyear: '올해는 꼭 실력을 늘릴 거예요.' },
    newcomer: '처음 오셨죠? 천천히 보세요.',
    regular: '또 오셨네요. 반가워요.',
  },
  'labor': {
    greet: '어서 오세요.',
    always: [
      '일자리 보러 오셨어요?',
      '오늘도 일하러 가시나요?',
      '서류가 많이 쌓였네요.',
      '오늘도 수고 많으세요.',
      '다녀오시면 또 들르세요.',
      '여러분 덕에 마을이 돌아가요.',
      '잠깐 쉬었다 가셔도 돼요.',
      '도장 찍을 게 아직 남았어요.',
    ],
    phase: { morning: '아침부터 부지런하시네요.', noon: '오후에도 힘내세요.', sunset: '하루가 금방 가네요.', night: '늦게까지 일하시네요.', dawn: '새벽에도 창구는 열려 있어요.' },
    season: { spring: '바깥일 하기 좋은 봄이에요.', summer: '더운데 무리하지 마세요.', autumn: '가을은 일하기 딱 좋아요.', winter: '추우니 따뜻하게 입으세요.' },
    day: { xmas: '크리스마스에도 출근했어요.', newyear: '새해에도 잘 부탁드립니다.' },
    newcomer: '처음 오셨으면 천천히 보세요.',
    regular: '이제 얼굴만 봐도 반가워요.',
  },
  'coop': {
    greet: '어서 오세요.',
    always: [
      '씨앗 보러 오셨어요?',
      '밭은 잘 돌보고 계세요?',
      '흙 냄새가 좋은 날이에요.',
      '오늘도 수고 많으세요.',
      '씨앗 봉투를 새로 채웠어요.',
      '농사일은 늘 바쁘죠.',
      '작물은 잘 자라고 있나요?',
      '장화에 흙이 묻었네요.',
    ],
    phase: { morning: '아침 이슬이 내렸어요.', noon: '햇살 좋은 한낮이에요.', sunset: '해 질 녘 밭이 예뻐요.', night: '밤에는 밭도 조용하네요.', dawn: '일찍 나오셨네요.' },
    season: { spring: '봄바람이 부네요.', summer: '햇볕이 뜨거워요.', autumn: '가을 들판은 보기만 해도 좋아요.', winter: '추운데 감기 조심하세요.' },
    day: { xmas: '즐거운 크리스마스 보내세요.', newyear: '올해도 잘 부탁드려요.' },
    newcomer: '농장은 처음이세요?',
    regular: '늘 와 주셔서 든든해요.',
  },
  'clerk': {
    greet: '어서 오세요.',
    always: [
      '오늘 시세입니다.',
      '오늘도 화면이 바쁘네요.',
      '천천히 보셔도 돼요.',
      '숫자가 계속 바뀌네요.',
      '거래 도와드릴게요.',
      '오늘도 손님이 많았어요.',
      '커피 한 잔 하고 왔어요.',
      '서두르지 않으셔도 돼요.',
    ],
    phase: { morning: '좋은 아침입니다.', noon: '오늘도 하루가 바쁘네요.', sunset: '하루가 거의 끝나 가네요.', night: '늦은 시간에도 오셨네요.', dawn: '새벽에도 화면은 켜 둬요.' },
    season: { spring: '봄이라 창밖이 밝네요.', summer: '에어컨이 있어 다행이에요.', autumn: '가을 하늘이 높네요.', winter: '몸 녹이고 가세요.' },
    day: { xmas: '메리 크리스마스입니다.', newyear: '새해 복 많이 받으세요.' },
    newcomer: '거래소는 처음이세요?',
    regular: '늘 찾아 주셔서 고맙습니다.',
  },
  'dealer-ladder': {
    greet: '어서 오세요.',
    always: [
      '사다리 한 판 하시겠어요?',
      '줄은 제가 그어 드릴게요.',
      '천천히 고르세요.',
      '오늘도 오셨네요.',
      '판은 늘 준비되어 있어요.',
      '어느 쪽이든 괜찮아요.',
      '손님 덕에 판이 즐거워요.',
      '잠깐 쉬었다 하셔도 돼요.',
    ],
    phase: { morning: '아침부터 오셨네요.', noon: '한낮에도 오셨네요.', sunset: '저녁 손님이 하나둘 오네요.', night: '밤이 깊었네요.', dawn: '이 시간에도 판은 열려 있어요.' },
    season: { spring: '밖은 봄이라던데요.', summer: '안은 시원하죠?', autumn: '가을이네요. 쉬엄쉬엄 하세요.', winter: '밖이 추우니 쉬었다 가세요.' },
    day: { xmas: '메리 크리스마스입니다.', newyear: '올해도 잘 부탁드립니다.' },
    newcomer: '처음이시면 천천히 보세요.',
    regular: '오늘도 오셨군요. 반갑습니다.',
  },
  'dealer-oddeven': {
    greet: '어서 오세요.',
    always: [
      '홀일까요, 짝일까요?',
      '마음 정하시면 말씀하세요.',
      '오늘도 오셨네요.',
      '숨 한 번 고르고 하세요.',
      '판은 깨끗하게 닦아 뒀어요.',
      '손님 오실 때마다 반가워요.',
      '서두르지 않으셔도 돼요.',
      '어느 쪽이든 좋아요.',
    ],
    phase: { morning: '아침 손님은 드물어요.', noon: '낮 손님이시네요.', sunset: '벌써 해가 지네요.', night: '늦은 밤이네요.', dawn: '새벽까지 계시네요.' },
    season: { spring: '봄바람 쐬고 오셨어요?', summer: '더운데 시원하게 쉬세요.', autumn: '선선한 날이네요.', winter: '손 녹이고 하세요.' },
    day: { xmas: '즐거운 크리스마스예요.', newyear: '새해 복 많이 받으세요.' },
    newcomer: '홀짝은 처음이세요?',
    regular: '이제 얼굴이 익숙하네요.',
  },
  'host-snail': {
    greet: '어서 오세요.',
    always: [
      '어느 달팽이로 하시겠어요?',
      '달팽이들이 준비 중이에요.',
      '달팽이들 밥을 막 줬어요.',
      '경주로는 매일 닦아요.',
      '달팽이들이 손님을 봤어요.',
      '응원하는 소리가 좋아요.',
      '천천히 골라 주세요.',
      '오늘도 와 주셨네요.',
    ],
    phase: { morning: '달팽이들이 막 일어났어요.', noon: '달팽이들이 낮잠에서 깼어요.', sunset: '하루가 벌써 저무네요.', night: '밤에도 달팽이들은 달려요.', dawn: '달팽이들이 졸려 보여요.' },
    season: { spring: '달팽이들도 봄을 반겨요.', summer: '달팽이들 물을 갈아 줬어요.', autumn: '가을이네요. 즐겁게 보세요.', winter: '추워서 달팽이 집을 덮었어요.' },
    day: { xmas: '달팽이들도 크리스마스예요.', newyear: '올해도 달팽이들을 부탁해요.' },
    newcomer: '경주는 처음 보세요?',
    regular: '달팽이들이 손님을 알아봐요.',
  },
  'barista': {
    greet: '어서 오세요.',
    always: [
      "ITS'room입니다.",
      '오늘은 뭘로 드릴까요?',
      '원두를 새로 갈았어요.',
      '천천히 쉬다 가세요.',
      '따뜻한 걸로 드릴까요?',
      '편하신 자리에 앉으세요.',
      '오늘도 와 주셨네요.',
      '커피 향이 좋죠?',
    ],
    phase: { morning: '아침 커피 준비됐어요.', noon: '점심 뒤엔 커피죠.', sunset: '창밖 노을이 예뻐요.', night: '저녁엔 연하게 드릴까요?', dawn: '새벽까지 깨어 계시네요.' },
    season: { spring: '봄 햇살이 창으로 들어와요.', summer: '시원한 거 드시겠어요?', autumn: '가을엔 따뜻한 게 좋죠.', winter: '손 녹이고 가세요.' },
    day: { xmas: '메리 크리스마스예요.', newyear: '새해에도 자주 들러 주세요.' },
    newcomer: '처음 오셨어요? 편하게 계세요.',
    regular: '늘 드시던 걸로 할까요?',
  },
  'chef': {
    greet: '어서 오세요.',
    always: [
      '무엇을 만들어 볼까요?',
      '냄비에서 좋은 냄새가 나죠?',
      '오늘도 주방이 바쁘네요.',
      '국자 소리가 좋죠?',
      '천천히 하세요. 불 조심하고요.',
      '요리책은 제 자랑이에요.',
      '맛있게 드시는 게 제일이에요.',
      '앞치마 끈 꼭 매세요.',
    ],
    phase: { morning: '아침은 드셨어요?', noon: '점심은 맛있게 드셨어요?', sunset: '저녁 준비할 시간이네요.', night: '밤참이 생각나는 시간이에요.', dawn: '새벽 주방은 조용해서 좋아요.' },
    season: { spring: '봄나물 생각이 나네요.', summer: '여름엔 불 앞이 덥네요.', autumn: '가을은 뭐든 맛있어요.', winter: '따뜻한 국물이 생각나요.' },
    day: { xmas: '메리 크리스마스예요.', newyear: '새해 복 많이 받으세요.' },
    newcomer: '주방은 처음이세요?',
    regular: '오늘도 같이 해 봐요.',
  },
};

/** 같은 사람으로 치는 NPC(대사·이야기 수를 함께 씀) */
const SAME_AS: Readonly<Record<string, string>> = { 'farm-coop': 'coop' };

/** 대사와 이야기 수를 묶는 id */
export function talkId(npcId: string) {
  return SAME_AS[npcId] ?? npcId;
}

export function npcLinesOf(npcId: string): NpcLines | undefined {
  return NPC_LINES[talkId(npcId)];
}

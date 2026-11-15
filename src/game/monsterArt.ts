// art-source/monsters/make-monsters.cjs가 만드는 파일이다. 손으로 고치지 않는다.
/** 몬스터 그림 한 칸의 크기, 동작별 프레임 수(줄 순서: idle, walk, attack, hurt, death), 칸 안의 발 위치 */
export const MONSTER_ART = {
  "orc": {
    "width": 39,
    "height": 31,
    "cols": 8,
    "frames": {
      "idle": 6,
      "walk": 8,
      "attack": 6,
      "hurt": 4,
      "death": 4
    },
    "footX": 15,
    "footY": 25
  },
  "soldier": {
    "width": 36,
    "height": 29,
    "cols": 8,
    "frames": {
      "idle": 6,
      "walk": 8,
      "attack": 6,
      "hurt": 4,
      "death": 4
    },
    "footX": 15,
    "footY": 25
  },
  "demon": {
    "width": 50,
    "height": 25,
    "cols": 8,
    "frames": {
      "idle": 6,
      "walk": 8,
      "attack": 7,
      "hurt": 4,
      "death": 4
    },
    "footX": 21,
    "footY": 21
  },
  "blood": {
    "width": 33,
    "height": 30,
    "cols": 8,
    "frames": {
      "idle": 6,
      "walk": 8,
      "attack": 8,
      "hurt": 4,
      "death": 4
    },
    "footX": 12,
    "footY": 26
  }
} as const;

export const MONSTER_ANIMS = ["idle","walk","attack","hurt","death"] as const;

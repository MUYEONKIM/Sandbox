// art-source/forge/make-forge.cjs가 만드는 파일이다. 손으로 고치지 않는다.
// 대장간 무기·방어구·두루마리·장신구 그림 자리. 무기 고른 그림은 docs/balance/weapons.md 6, 나머지는 forge-items.md 2~4.

/** 아이콘: public/sprites/forge/icons.png, 한 칸 32×32. col, row는 칸 번호(픽셀 = 번호 × 32).
 * 16px 원본(방어구, 두루마리, 장신구)은 2배로 키워 넣었다. 이름표 옆에 16px로 그리면 원본 그대로다. */
export const FORGE_ICON_SIZE = 32;
export const FORGE_ICONS = {
  "handgun": {
    "name": "권총",
    "col": 0,
    "row": 0
  },
  "sniper": {
    "name": "저격총",
    "col": 1,
    "row": 0
  },
  "shotgun": {
    "name": "산탄총",
    "col": 2,
    "row": 0
  },
  "dagger": {
    "name": "단검",
    "col": 3,
    "row": 0
  },
  "longsword": {
    "name": "장검",
    "col": 4,
    "row": 0
  },
  "greatsword": {
    "name": "대검",
    "col": 5,
    "row": 0
  },
  "scimitar": {
    "name": "곡도",
    "col": 6,
    "row": 0
  },
  "rapier": {
    "name": "세검",
    "col": 7,
    "row": 0
  },
  "club": {
    "name": "둔기",
    "col": 8,
    "row": 0
  },
  "axe": {
    "name": "도끼",
    "col": 9,
    "row": 0
  },
  "helmet": {
    "name": "투구",
    "col": 0,
    "row": 1
  },
  "armor": {
    "name": "갑옷",
    "col": 1,
    "row": 1
  },
  "pants": {
    "name": "바지",
    "col": 2,
    "row": 1
  },
  "boots": {
    "name": "장화",
    "col": 3,
    "row": 1
  },
  "scroll_guard": {
    "name": "파괴 방지 두루마리",
    "col": 4,
    "row": 1
  },
  "scroll_hold": {
    "name": "하락 방지 두루마리",
    "col": 5,
    "row": 1
  },
  "scroll_success": {
    "name": "성공 두루마리",
    "col": 6,
    "row": 1
  },
  "fedora": {
    "name": "중절모",
    "col": 0,
    "row": 2
  },
  "red_cape": {
    "name": "붉은 망토",
    "col": 1,
    "row": 2
  },
  "gold_ring": {
    "name": "금반지",
    "col": 2,
    "row": 2
  },
  "crown": {
    "name": "왕관",
    "col": 3,
    "row": 2
  }
} as const;

/** 손에 든 무기: public/sprites/forge/held.png, 한 칸 32×32를 가로로 이음(칸 x = col × 32, y = 0).
 * src/art/weapons.ts의 WeaponArt와 같은 규칙이다: 오른쪽(총구, 칼끝)을 향하고, grip은 칸 안에서 손으로 잡는 자리
 * (size = 32, setOrigin(grip.x / 32, grip.y / 32)). 1픽셀 어두운 테두리를 둘렀다. */
export const FORGE_HELD_SIZE = 32;
export const FORGE_HELD = {
  "handgun": {
    "name": "권총",
    "col": 0,
    "grip": {
      "x": 12.5,
      "y": 16
    }
  },
  "sniper": {
    "name": "저격총",
    "col": 1,
    "grip": {
      "x": 11.4,
      "y": 17.7
    }
  },
  "shotgun": {
    "name": "산탄총",
    "col": 2,
    "grip": {
      "x": 12.9,
      "y": 15.4
    }
  },
  "dagger": {
    "name": "단검",
    "col": 3,
    "grip": {
      "x": 13.3,
      "y": 15.7
    }
  },
  "longsword": {
    "name": "장검",
    "col": 4,
    "grip": {
      "x": 11.5,
      "y": 15.1
    }
  },
  "greatsword": {
    "name": "대검",
    "col": 5,
    "grip": {
      "x": 7.7,
      "y": 15.5
    }
  },
  "scimitar": {
    "name": "곡도",
    "col": 6,
    "grip": {
      "x": 8.4,
      "y": 14.4
    }
  },
  "rapier": {
    "name": "세검",
    "col": 7,
    "grip": {
      "x": 9.3,
      "y": 15.9
    }
  },
  "club": {
    "name": "둔기",
    "col": 8,
    "grip": {
      "x": 9.7,
      "y": 14.9
    }
  },
  "axe": {
    "name": "도끼",
    "col": 9,
    "grip": {
      "x": 7.5,
      "y": 13.3
    }
  }
} as const;

export type ForgeIconId = keyof typeof FORGE_ICONS;
export type ForgeWeaponArtId = keyof typeof FORGE_HELD;

// art-source/farm/make-crops.cjs가 만드는 파일이다. 손으로 고치지 않는다.
/** 작물 그림 한 칸 크기와 작물마다 줄 번호, 단계 수, 칸 안에서 밭 윗면 가운데 자리 */
export const CROP_CELL = { width: 32, height: 33, cols: 16 } as const;
export const CROP_ART = {
  "carrot": {
    "row": 0,
    "frames": 16,
    "anchorX": 15.8,
    "anchorY": 20.2
  },
  "potato": {
    "row": 1,
    "frames": 16,
    "anchorX": 15.8,
    "anchorY": 16.3
  },
  "onion": {
    "row": 2,
    "frames": 16,
    "anchorX": 15.8,
    "anchorY": 20.2
  },
  "tomato": {
    "row": 3,
    "frames": 16,
    "anchorX": 16.1,
    "anchorY": 19
  },
  "eggplant": {
    "row": 4,
    "frames": 16,
    "anchorX": 15.9,
    "anchorY": 20
  },
  "corn": {
    "row": 5,
    "frames": 16,
    "anchorX": 15.8,
    "anchorY": 16.3
  }
} as const;

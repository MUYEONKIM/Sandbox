export interface Dir {
  /** 격자 기준 이동량 */
  dx: number;
  dy: number;
  /** 사용할 캐릭터 그림 */
  view: 'front' | 'back';
  flip: boolean;
}

/** 키마다 화면 기준 방향 (x: 오른쪽이 +, y: 아래가 +) */
const MOVE_KEYS: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/** 두 키를 함께 누를 때 손가락이 어긋나는 시간만큼 첫걸음을 기다린다. */
const COMBO_MS = 50;

/**
 * 화면 방향을 격자 방향으로 바꾼다.
 * 위 키는 화면 위쪽 칸(-1,-1), 오른쪽 키는 화면 오른쪽 칸(+1,-1)으로 간다.
 * 두 키를 함께 누르면 마름모 변을 따라 옆 칸으로 간다.
 */
function toDir(sx: number, sy: number): Dir | null {
  if (!sx && !sy) return null;
  return {
    dx: Math.sign(sx + sy),
    dy: Math.sign(sy - sx),
    view: sy < 0 ? 'back' : 'front',
    flip: sx < 0,
  };
}

interface KeyActions {
  onSlot(index: number): void;
  onInventory(): void;
  onEscape(): void;
  onChat(): void;
}

/** event.code는 물리 키 위치를 뜻해서, 한글 입력 상태에서도 WASD와 E가 동작한다. */
export class Keys {
  private readonly held = new Set<string>();
  /** 프레임 사이에 눌렀다 뗀 키도 한 칸은 움직이도록 남겨 둔다. */
  private readonly tapped = new Set<string>();
  private readyAt = 0;

  constructor(private readonly actions: KeyActions) {
    window.addEventListener('keydown', (e) => this.down(e));
    window.addEventListener('keyup', (e) => this.held.delete(e.code));
    window.addEventListener('blur', () => this.held.clear());
  }

  private down(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code in MOVE_KEYS) {
      e.preventDefault();
      if (e.repeat) return;
      if (!this.held.size && !this.tapped.size) this.readyAt = performance.now() + COMBO_MS;
      this.held.add(e.code);
      this.tapped.add(e.code);
      return;
    }
    if (e.repeat) return;

    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      this.actions.onSlot(Number(digit[1]) - 1);
    } else if (e.code === 'KeyE') {
      this.actions.onInventory();
    } else if (e.code === 'Escape') {
      this.actions.onEscape();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.actions.onChat();
    }
  }

  /** 지금 움직일 방향을 돌려준다. */
  takeDirection(): Dir | null {
    if (performance.now() < this.readyAt) return null;
    let sx = 0;
    let sy = 0;
    for (const code of new Set([...this.held, ...this.tapped])) {
      sx += MOVE_KEYS[code][0];
      sy += MOVE_KEYS[code][1];
    }
    this.tapped.clear();
    return toDir(Math.sign(sx), Math.sign(sy));
  }
}

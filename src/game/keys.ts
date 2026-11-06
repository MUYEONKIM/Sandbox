/** 격자 기준 이동량 */
export interface Dir {
  dx: number;
  dy: number;
}

const UP = [0, -1] as const;
const DOWN = [0, 1] as const;
const LEFT = [-1, 0] as const;
const RIGHT = [1, 0] as const;

/** 키마다 화면 기준 방향 (x: 오른쪽이 +, y: 아래가 +) */
const MOVE_KEYS: Record<string, readonly [number, number]> = {
  ArrowUp: UP,
  KeyW: UP,
  ArrowDown: DOWN,
  KeyS: DOWN,
  ArrowLeft: LEFT,
  KeyA: LEFT,
  ArrowRight: RIGHT,
  KeyD: RIGHT,
};

/**
 * 화면 방향을 격자 방향으로 바꾼다.
 * 위 키는 화면 위쪽 칸(-1,-1), 오른쪽 키는 화면 오른쪽 칸(+1,-1)으로 간다.
 * 두 키를 함께 누르면 마름모 변을 따라 옆 칸으로 간다.
 */
function toDir(sx: number, sy: number): Dir | null {
  if (!sx && !sy) return null;
  return { dx: Math.sign(sx + sy), dy: Math.sign(sy - sx) };
}

function isShift(e: KeyboardEvent) {
  return e.key === 'Shift' || e.code.startsWith('Shift');
}

interface KeyActions {
  onSlot(index: number): void;
  onInventory(): void;
  onEscape(): void;
  onChat(): void;
}

/** event.code는 물리 키 위치를 뜻해서, 한글 입력 상태에서도 WASD와 I가 동작한다. */
export class Keys {
  private readonly held = new Set<string>();
  /** 프레임 사이에 눌렀다 뗀 키도 한 칸은 움직이도록 남겨 둔다. */
  private readonly tapped = new Set<string>();
  private shiftHeld = false;
  private jumpPressed = false;
  private workPressed = false;

  constructor(private readonly actions: KeyActions) {
    window.addEventListener('keydown', (e) => {
      if (isShift(e)) this.shiftHeld = true;
      this.down(e);
    });
    window.addEventListener('keyup', (e) => {
      if (isShift(e)) this.shiftHeld = false;
      this.held.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.shiftHeld = false;
    });
  }

  private down(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.code in MOVE_KEYS) {
      e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.tapped.add(e.code);
      return;
    }
    if (e.repeat) return;

    const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digit) {
      this.actions.onSlot(Number(digit[1]) - 1);
    } else if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      this.jumpPressed = true;
    } else if (e.code === 'KeyF') {
      this.workPressed = true;
    } else if (e.code === 'KeyI') {
      this.actions.onInventory();
    } else if (e.code === 'Escape') {
      this.actions.onEscape();
    } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.actions.onChat();
    }
  }

  private currentDir() {
    let sx = 0;
    let sy = 0;
    for (const code of new Set([...this.held, ...this.tapped])) {
      sx += MOVE_KEYS[code][0];
      sy += MOVE_KEYS[code][1];
    }
    return toDir(Math.sign(sx), Math.sign(sy));
  }

  /** 지금 움직일 방향을 돌려준다. */
  takeDirection(): Dir | null {
    const dir = this.currentDir();
    this.tapped.clear();
    return dir;
  }

  /** Shift를 누르고 있으면 달린다. */
  get running() {
    return this.shiftHeld;
  }

  /** F를 눌렀으면 true를 돌려주고 입력을 지운다. */
  takeWork() {
    const pressed = this.workPressed;
    this.workPressed = false;
    return pressed;
  }

  /** Space를 눌렀으면 true를 돌려주고 입력을 지운다. */
  takeJump() {
    const pressed = this.jumpPressed;
    this.jumpPressed = false;
    return pressed;
  }
}

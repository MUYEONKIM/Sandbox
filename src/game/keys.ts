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
  /** Tab을 누르면 true, 떼면 false. 누르고 있는 동안 킬/데스 순위를 보인다. */
  onScoreboard(open: boolean): void;
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
  /** 이동 키를 누른 시각. 같은 칸에서 오래 누르고 있는지 볼 때 쓴다(src/game/hush.ts). */
  private readonly pressedAt = new Map<string, number>();
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
      if (e.code === 'Tab') this.actions.onScoreboard(false);
      this.held.delete(e.code);
      this.pressedAt.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.pressedAt.clear();
      this.shiftHeld = false;
      this.actions.onScoreboard(false);
    });
  }

  private down(e: KeyboardEvent) {
    // 채팅, 금액, 게시판 글처럼 글자를 치는 중이면 게임 키로 쓰지 않는다.
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // Tab은 브라우저가 다른 칸으로 초점을 옮기지 않게 막고 순위표를 연다.
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!e.repeat) this.actions.onScoreboard(true);
      return;
    }

    if (e.code in MOVE_KEYS) {
      e.preventDefault();
      if (e.repeat) return;
      this.held.add(e.code);
      this.tapped.add(e.code);
      this.pressedAt.set(e.code, performance.now());
      return;
    }
    if (e.repeat) return;

    const digit = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (digit) {
      // 1~9는 단축키 칸 0~8, 0은 그 뒤의 메모장 칸(inventory.ts의 MEMO_SLOT)이다.
      const n = Number(digit[1]);
      this.actions.onSlot(n === 0 ? 9 : n - 1);
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

  /** 누르고 있던 방향키를 잊는다. 다시 눌러야 움직인다. 포탈을 타고 도착한 뒤 곧장 되돌아가지 않게 한다. */
  releaseDirections() {
    this.held.clear();
    this.tapped.clear();
    this.pressedAt.clear();
  }

  /** 이동 키를 딱 하나만 누르고 있으면 그 키의 code. 둘 이상이거나 없으면 null */
  heldMoveKey(): string | null {
    return this.pressedAt.size === 1 ? [...this.pressedAt.keys()][0] : null;
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

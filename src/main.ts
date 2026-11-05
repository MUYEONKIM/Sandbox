import Phaser from 'phaser';
import { LocalChat } from './game/chat';
import { GameScene } from './game/GameScene';
import { Inventory, STACK_SIZE } from './game/inventory';
import { Keys } from './game/keys';
import { ChatBox } from './ui/chat';
import { Hud } from './ui/hud';

const PLAYER_NAME = '나';

const inventory = new Inventory({
  0: { id: 'stone', count: STACK_SIZE },
  1: { id: 'brick', count: STACK_SIZE },
  2: { id: 'wood', count: STACK_SIZE },
  3: { id: 'hedge', count: STACK_SIZE },
  9: { id: 'stone', count: STACK_SIZE },
  10: { id: 'brick', count: STACK_SIZE },
  11: { id: 'wood', count: STACK_SIZE },
  12: { id: 'hedge', count: STACK_SIZE },
});

const root = document.getElementById('hud')!;
const hud = new Hud(root, inventory);
const chat = new ChatBox(root, new LocalChat(PLAYER_NAME), PLAYER_NAME);

const keys = new Keys({
  onSlot: (index) => inventory.select(index),
  onInventory: () => hud.toggle(),
  onEscape: () => hud.close(),
  onChat: () => {
    if (!hud.isOpen) chat.open();
  },
});

const scene = new GameScene(inventory, hud, keys, chat);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#2c6f93',
  pixelArt: true,
  scale: { mode: Phaser.Scale.RESIZE },
  scene,
});

// 개발 중 브라우저 콘솔에서 상태를 확인하기 위한 통로
if (import.meta.env.DEV) {
  Object.assign(window, { sandbox: { scene, inventory, hud, chat } });
}

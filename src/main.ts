import Phaser from 'phaser';
import { Economy, type EconomyData } from './game/economy';
import { GameScene } from './game/GameScene';
import { Inventory } from './game/inventory';
import { Keys } from './game/keys';
import { currentUser, loadEconomy, loadProfile, signOut, type Profile } from './net/auth';
import { GameSession } from './net/session';
import { isConfigured } from './net/supabase';
import { ChatBox } from './ui/chat';
import { element } from './ui/dom';
import { Hud } from './ui/hud';
import { showLogin } from './ui/login';
import { Minimap } from './ui/minimap';
import { NameTags } from './ui/nametags';
import { OfficeWindow } from './ui/office';

function enterGame(profile: Profile, economyData: EconomyData) {
  const root = document.getElementById('hud')!;
  const session = new GameSession(profile);
  const inventory = new Inventory(profile.inventory);
  inventory.onChange(() => session.saveLater({ inventory: inventory.slots }));

  const side = element('side', root);
  const hud = new Hud(root, side, inventory, profile.nickname, async () => {
    await session.flush();
    await signOut();
    location.reload();
  });
  hud.setHp(profile.hp);

  const economy = new Economy(economyData);
  hud.setGold(economy.gold);
  economy.onChange(() => hud.setGold(economy.gold));

  const minimap = new Minimap(side);
  const chat = new ChatBox(root, (text) => void session.sendChat(text));
  const tags = new NameTags(root);

  const office = new OfficeWindow(root, economy, {
    onGo: (place) => scene.goToWork(place),
    onSell: () => void scene.sellEverything(),
  });

  const keys = new Keys({
    onSlot: (index) => inventory.select(index),
    onInventory: () => hud.toggle(),
    onEscape: () => {
      hud.close();
      office.close();
    },
    onChat: () => {
      if (!hud.isOpen && !office.isOpen) chat.open();
    },
  });

  const scene = new GameScene(inventory, hud, keys, chat, tags, minimap, session, economy, office);

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
    Object.assign(window, { sandbox: { scene, inventory, hud, chat, session, economy, office } });
  }
}

async function main() {
  if (!isConfigured) {
    document.getElementById('game')!.textContent = '서버 설정이 없어 게임을 시작할 수 없습니다.';
    return;
  }

  const user = (await currentUser()) ?? (await showLogin(document.body));
  let profile = await loadProfile(user.id);
  if (!profile) {
    // 삭제된 계정의 세션이 남아 있으면 다시 로그인하게 한다.
    await signOut();
    profile = await loadProfile((await showLogin(document.body)).id);
  }
  if (profile) enterGame(profile, await loadEconomy(profile.gold));
}

main().catch(() => {
  document.getElementById('game')!.textContent = '서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.';
});

import Phaser from 'phaser';
import { loadSprites } from './art/sprites';
import { Economy, type EconomyData } from './game/economy';
import { GameScene } from './game/GameScene';
import { Inventory } from './game/inventory';
import { Keys } from './game/keys';
import { STAT_IDS } from './game/stats';
import { currentUser, loadEconomy, loadProfile, signOut, type Profile } from './net/auth';
import { GameSession } from './net/session';
import { isConfigured } from './net/supabase';
import { ChatBox } from './ui/chat';
import { element } from './ui/dom';
import { Hud } from './ui/hud';
import { showLogin } from './ui/login';
import { Minimap } from './ui/minimap';
import { NameTags } from './ui/nametags';
import { CastleWindow } from './ui/castle';
import { OfficeWindow } from './ui/office';
import { ShopWindow } from './ui/shop';

function enterGame(profile: Profile, economyData: EconomyData) {
  const root = document.getElementById('hud')!;
  const session = new GameSession(profile);
  const inventory = new Inventory(profile.inventory, economyData.owned);
  inventory.onChange(() => session.saveLater({ inventory: inventory.slots }));

  const side = element('side', root);
  const hud = new Hud(root, side, inventory, profile.nickname, async () => {
    await session.flush();
    await signOut();
    location.reload();
  });
  hud.setHp(profile.hp);
  hud.setLevel(BigInt(profile.level));

  const economy = new Economy(economyData);
  const showEconomy = () => {
    hud.setGold(economy.gold);
    hud.setStats(STAT_IDS.map((id) => `${id.toUpperCase()} ${economy.stat(id)}`).join('  ·  '));
  };
  showEconomy();
  economy.onChange(showEconomy);

  const minimap = new Minimap(side);
  const chat = new ChatBox(root, (text) => void session.sendChat(text));
  const tags = new NameTags(root);

  const office = new OfficeWindow(root, economy, {
    onGo: (place) => scene.goToWork(place),
  });

  const shop = new ShopWindow(root, economy, {
    onBuyWeapon: (id) => scene.buyWeapon(id),
    onBuyTool: (tool) => scene.buyTool(tool),
    onSell: () => void scene.sellEverything(),
  });

  const castle = new CastleWindow(root, economy, {
    onBuyStat: (id) => scene.buyStat(id),
  });

  const keys = new Keys({
    onSlot: (index) => inventory.select(index),
    onInventory: () => hud.toggle(),
    onEscape: () => {
      hud.close();
      office.close();
      shop.close();
      castle.close();
    },
    onChat: () => {
      if (!hud.isOpen && !office.isOpen && !shop.isOpen && !castle.isOpen) chat.open();
    },
  });

  const scene = new GameScene(inventory, hud, keys, chat, tags, minimap, session, economy, office, shop, castle);

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
    Object.assign(window, { sandbox: { scene, inventory, hud, chat, session, economy, office, shop, castle } });
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
  if (profile) {
    const [economy] = await Promise.all([loadEconomy(profile), loadSprites()]);
    enterGame(profile, economy);
  }
}

main().catch(() => {
  document.getElementById('game')!.textContent = '서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.';
});

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
import { KillBoard } from './ui/killboard';
import { Minimap } from './ui/minimap';
import { NoticeBar } from './ui/notice';
import { watchNewVersion } from './ui/newVersion';
import { NameTags } from './ui/nametags';
import { CasinoWindows } from './ui/casino';
import { BoardWindow } from './ui/board';
import { CastleWindow } from './ui/castle';
import { ElevatorWindow } from './ui/elevator';
import { FameWindow, RankPanel } from './ui/fame';
import { OfficeWindow } from './ui/office';
import { ShopWindow } from './ui/shop';

/** 명예의 전당 창과 미니맵 밑 패널에 보여 줄 인원 */
const FAME_SIZE = 50;
/** 게시판에 보여 줄 최근 글 수 */
const BOARD_SIZE = 50;
const PANEL_SIZE = 10;
/** Tab 킬/데스 순위표에 보여 줄 인원 */
const KILL_BOARD_SIZE = 10;

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
  hud.setHp(profile.hp, profile.max_hp);
  hud.setLevel(BigInt(profile.level), profile.exp);

  const economy = new Economy(economyData);
  const showEconomy = () => {
    hud.setGold(economy.gold);
    hud.setStats(STAT_IDS.map((id) => `${id.toUpperCase()} ${economy.stat(id)}`).join('  ·  '));
  };
  showEconomy();
  economy.onChange(showEconomy);

  const minimap = new Minimap(side);
  new RankPanel(side, profile.nickname, () => session.fetchRanking(PANEL_SIZE));
  const chat = new ChatBox(root, (text, everyone) => void session.sendChat(text, everyone));
  const tags = new NameTags(root);

  const office = new OfficeWindow(root, economy, {
    onGo: (place) => scene.goToWork(place),
    loadRoster: () => session.fetchWorkplaceRoster(),
  });

  const shop = new ShopWindow(root, economy, {
    onBuyWeapon: (id) => scene.buyWeapon(id),
    onBuyTool: (tool) => scene.buyTool(tool),
    onSell: () => void scene.sellEverything(),
  });

  const castle = new CastleWindow(root, economy, {
    onBuyStat: (id, amount) => scene.buyStat(id, amount),
  });

  const fame = new FameWindow(root, profile.nickname, () => session.fetchRanking(FAME_SIZE));
  const notices = new NoticeBar(root);
  const board = new BoardWindow(root, {
    load: () => session.readBoard(BOARD_SIZE),
    write: (body) => session.writePost(body),
    remove: (id) => session.deletePost(id),
  });
  const killBoard = new KillBoard(root, profile.nickname, () => session.fetchKillRanking(KILL_BOARD_SIZE));

  const casino = new CasinoWindows(root, economy, (game, pick, amount) => session.placeBet(game, pick, amount));

  const elevator = new ElevatorWindow(root, {
    onGo: (to) => scene.rideElevator(to),
  });

  const keys = new Keys({
    onScoreboard: (open) => (open ? void killBoard.show() : killBoard.hide()),
    onSlot: (index) => inventory.select(index),
    onInventory: () => hud.toggle(),
    onEscape: () => {
      hud.close();
      office.close();
      shop.close();
      castle.close();
      fame.close();
      board.close();
      elevator.close();
      casino.close();
    },
    onChat: () => {
      const windowOpen = hud.isOpen || office.isOpen || shop.isOpen || castle.isOpen || fame.isOpen || board.isOpen || elevator.isOpen || casino.isOpen;
      if (!windowOpen) chat.open();
    },
  });

  const scene = new GameScene(inventory, hud, keys, chat, tags, minimap, session, economy, office, shop, castle, fame, elevator, casino, notices, board);

  void session.announceJoin();
  watchNewVersion(root);

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
    Object.assign(window, { sandbox: { scene, inventory, hud, chat, session, economy, office, shop, castle, fame, board, elevator, casino } });
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

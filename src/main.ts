import Phaser from 'phaser';
import { loadSprites } from './art/sprites';
import { Economy, type EconomyData } from './game/economy';
import { GameScene } from './game/GameScene';
import { Inventory } from './game/inventory';
import { Keys } from './game/keys';
import { Market } from './game/market';
import { currentUser, loadEconomy, loadProfile, signOut, type Profile } from './net/auth';
import { GameSession, type RenameFail } from './net/session';
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
import { WantedPanel } from './ui/wanted';
import { ExchangeWindow } from './ui/exchange';
import { InfoView } from './ui/info';
import { CastleWindow } from './ui/castle';
import { ElevatorWindow } from './ui/elevator';
import { FameWindow, RankPanel } from './ui/fame';
import { OfficeWindow } from './ui/office';
import { ShopWindow } from './ui/shop';
import { GroundUi } from './ui/ground';
import { anyModalOpen, closeTopModal } from './ui/modal';
import { openRenameDialog } from './ui/rename';
import { showWhatsNew } from './ui/whatsNew';

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
    hud.refreshInfo();
  };
  showEconomy();
  economy.onChange(showEconomy);

  const market = new Market({ quotes: () => session.fetchQuotes(), holdings: () => session.fetchHoldings() });
  market.onChange(() => hud.refreshInfo());
  // 닉네임 변경권(2026-11-13 사용자 요청). session.profile이 이 profile이라 바꾸면 profile.nickname도 바뀐다.
  const myName = () => profile.nickname;
  const renameFail: Record<RenameFail, string> = {
    taken: '이미 쓰는 닉네임입니다.',
    same: '지금 닉네임과 같습니다.',
    bad: '닉네임은 2~12자로 적어 주세요.',
    ticket: '변경권이 없습니다. 상점에서 살 수 있습니다.',
    failed: '바꾸지 못했습니다. 잠시 후 다시 해 주세요.',
  };
  const rename = () =>
    openRenameDialog(root, profile.nickname, economy.renameTickets, async (name) => {
      const result = await session.changeNickname(name);
      if (!result.ok) return renameFail[result.reason];
      hud.setNickname(result.name);
      tags.setName(profile.id, result.name);
      economy.setRenameTickets(Math.max(0, economy.renameTickets - 1));
      return null;
    });
  const info = new InfoView(hud.infoPane, myName, economy, market, () => hud.status, rename);
  hud.setInfoRenderer(() => info.render());
  void market.refresh();

  const minimap = new Minimap(side);
  new RankPanel(side, myName, () => session.fetchRanking(PANEL_SIZE));
  const chat = new ChatBox(root, (text, everyone) => void session.sendChat(text, everyone), `chat-log:${profile.id}`);
  const tags = new NameTags(root);
  const wanted = new WantedPanel(hud.topLeft, profile.id, () => session.fetchWanted());
  wanted.onChange((karma) => tags.setKarma(karma));

  const office = new OfficeWindow(root, economy, {
    onGo: (place) => scene.goToWork(place),
    loadRoster: () => session.fetchWorkplaceRoster(),
  });

  const shop = new ShopWindow(root, economy, {
    onBuyWeapon: (id) => scene.buyWeapon(id),
    onBuyTool: (tool) => scene.buyTool(tool),
    onBuyRenameTicket: async () => {
      const bought = await session.buyRenameTicket();
      if (!bought) {
        hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
        return;
      }
      economy.setRenameTickets(bought.tickets, bought.gold);
      hud.toast('닉네임 변경권을 샀습니다', `가진 변경권 ${bought.tickets.toLocaleString()}장. I 창 정보창에서 씁니다.`);
    },
    onSell: () => void scene.sellEverything(),
  });

  const castle = new CastleWindow(root, economy, {
    onBuyStat: (id, amount) => scene.buyStat(id, amount),
  });

  const fame = new FameWindow(root, myName, () => session.fetchRanking(FAME_SIZE));
  const notices = new NoticeBar(root);
  const board = new BoardWindow(root, {
    load: (kind) => session.readBoard(BOARD_SIZE, kind),
    write: (body, category) => session.writePost(body, category),
    remove: (id) => session.deletePost(id),
  });
  const exchange = new ExchangeWindow(root, economy, market, {
    onTrade: async (stock, amount) => {
      const name = market.quote(stock)?.name ?? '주식';
      const result = await session.tradeStock(stock, amount);
      if (!result.ok) {
        const [title, detail] = {
          gold: ['골드가 모자랍니다', '가격이 막 바뀌었을 수도 있습니다'],
          shares: ['가진 주식이 모자랍니다', '없는 주식은 팔 수 없습니다'],
          overflow: ['골드 주머니가 넘칩니다', '골드는 21억 G까지만 들 수 있습니다'],
          failed: ['거래하지 못했습니다', '잠시 후 다시 시도해 주세요'],
        }[result.reason];
        hud.toast(title, detail);
        return;
      }
      economy.setGold(result.gold);
      market.setTraded(stock, result.shares, result.cost, result.price);
      const count = Math.abs(amount).toLocaleString();
      const total = (Math.abs(amount) * result.price).toLocaleString();
      hud.toast(
        amount > 0 ? `${name} ${count}주를 샀습니다` : `${name} ${count}주를 팔았습니다`,
        `주당 ${result.price.toLocaleString()}원 · ${amount > 0 ? '-' : '+'}${total}G`,
      );
    },
  });
  const killBoard = new KillBoard(root, myName, () => session.fetchKillRanking(KILL_BOARD_SIZE));

  const casino = new CasinoWindows(root, economy, (game, pick, amount) => session.placeBet(game, pick, amount));

  const elevator = new ElevatorWindow(root, {
    onGo: (to) => scene.rideElevator(to),
  });

  const keys = new Keys({
    onScoreboard: (open) => (open ? void killBoard.show() : killBoard.hide()),
    onSlot: (index) => inventory.select(index),
    onInventory: () => hud.toggle(),
    onHelp: () => hud.toggleHelp(),
    onRotate: () => inventory.rotateSelected(),
    onEscape: () => {
      if (anyModalOpen()) {
        closeTopModal();
        return;
      }
      hud.close();
      office.close();
      shop.close();
      castle.close();
      fame.close();
      board.close();
      exchange.close();
      elevator.close();
      casino.close();
    },
    onChat: () => {
      const windowOpen =
        hud.isOpen || office.isOpen || shop.isOpen || castle.isOpen || fame.isOpen || board.isOpen || exchange.isOpen || elevator.isOpen || casino.isOpen || anyModalOpen();
      if (!windowOpen) chat.open();
    },
  });

  // 땅에 놓는 메모와 골드(2026-11-13 사용자 요청)
  const groundUi = new GroundUi(root);
  hud.setMemoRenderer((pane) => groundUi.renderBag(pane));
  groundUi.onChange(() => hud.refreshMemos());
  hud.onDropGold = () => groundUi.openGoldDrop(economy.gold, (amount) => scene.dropGold(amount));
  void session.myMemos().then((memos) => groundUi.setHeld(memos));

  const scene = new GameScene(inventory, hud, keys, chat, tags, minimap, session, economy, office, shop, castle, fame, elevator, casino, notices, board, wanted, exchange, market, groundUi);

  void session.announceJoin();
  watchNewVersion(root);
  showWhatsNew(root, profile.id);

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
    Object.assign(window, { sandbox: { scene, inventory, hud, chat, session, economy, office, shop, castle, fame, board, exchange, market, elevator, casino, groundUi } });
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

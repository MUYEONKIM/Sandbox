import Phaser from 'phaser';
import { loadSprites } from './art/sprites';
import { isAdventure, isMapId } from './game/maps';
import { loadAdventureMaps } from './game/adventureMaps';
import { Economy, type EconomyData } from './game/economy';
import { goldText } from './game/gold';
import { GameScene } from './game/GameScene';
import { Inventory } from './game/inventory';
import { Keys } from './game/keys';
import { Market } from './game/market';
import { currentUser, loadDungeons, loadEconomy, loadFarm, loadForge, loadPotions, loadProfile, signOut, type Profile } from './net/auth';
import { ForgeTable } from './game/forge';
import { GameSession, type RenameFail } from './net/session';
import { isConfigured } from './net/supabase';
import { ChatBox } from './ui/chat';
import { element } from './ui/dom';
import { Hud } from './ui/hud';
import { showLogin } from './ui/login';
import { KillBoard } from './ui/killboard';
import { Minimap } from './ui/minimap';
import { ChapterMap } from './ui/chapterMap';
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
import { DungeonWindow } from './ui/dungeon';
import { Adventure } from './game/adventure';
import { AdventureWindow } from './ui/adventure';
import { cropOfSeed, WEAPONS } from './items';
import { ForgeWindow } from './ui/forge';
import { CoopWindow } from './ui/coop';
import { OfficeWindow } from './ui/office';
import { ShopWindow } from './ui/shop';
import { GroundUi } from './ui/ground';
import { BoxUi } from './ui/box';
import { anyModalOpen, closeTopModal } from './ui/modal';
import { openRenameDialog } from './ui/rename';
import { showWhatsNew } from './ui/whatsNew';
import { byInput } from './ui/touch';
import { WeaponTip } from './ui/weaponTip';

/** 명예의 전당 창과 미니맵 밑 패널에 보여 줄 인원 */
const FAME_SIZE = 50;
/** 게시판에 보여 줄 최근 글 수 */
const BOARD_SIZE = 50;
const PANEL_SIZE = 10;
/** Tab 킬/데스 순위표에 보여 줄 인원 */
const KILL_BOARD_SIZE = 10;

function enterGame(
  profile: Profile,
  economyData: EconomyData,
  dungeonData: Awaited<ReturnType<typeof loadDungeons>>,
  potionData: Awaited<ReturnType<typeof loadPotions>>,
  farmData: Awaited<ReturnType<typeof loadFarm>>,
  forgeData: Awaited<ReturnType<typeof loadForge>>,
) {
  const root = document.getElementById('hud')!;
  const session = new GameSession(profile);
  const inventory = new Inventory(profile.inventory, forgeData.gear);
  inventory.onChange(() => session.saveLater({ inventory: inventory.saved() }));
  // 횃불을 9번 칸에 한 번 넣었거나 처음 가입이면 바로 저장해 둔다(표시가 남아 다음에 다시 넣지 않는다).
  if (inventory.needsSave) session.saveLater({ inventory: inventory.saved() });

  const side = element('side', root);
  const hud = new Hud(root, side, inventory, profile.nickname, async () => {
    await session.flush();
    await signOut();
    location.reload();
  });
  session.onOnline = (count) => hud.setOnline(count);
  hud.setHp(profile.hp, profile.max_hp);
  hud.setLevel(BigInt(profile.level), profile.exp);

  const economy = new Economy(economyData);
  economy.setPotions(potionData.catalog, potionData.counts);
  economy.setFarm(farmData.crops, farmData.stock);
  hud.potionCount = (id) => economy.potionCount(id);
  hud.seedCount = (id) => economy.seedCount(cropOfSeed(id));
  const showEconomy = () => {
    hud.setGold(economy.gold);
    hud.refreshInfo();
    hud.refreshCounts();
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
  // 휴대폰에는 Tab 키가 없어 I 창의 '킬/데스 순위' 버튼으로 연다. 창을 닫고 순위를 띄우며, 화면 어디든 누르면 닫힌다.
  const showKillBoard = () => {
    hud.close();
    void killBoard.show();
    window.addEventListener('pointerdown', () => killBoard.hide(), { once: true, capture: true });
  };
  const info = new InfoView(hud.infoPane, myName, economy, market, () => hud.status, rename, showKillBoard);
  hud.setInfoRenderer(() => info.render());
  void market.refresh();

  const minimap = new Minimap(side);
  // 모험 지역 전체지도(2026-11-25): M, 미니맵 왼쪽 위 지도 버튼, Esc, ×
  const chapterMap = new ChapterMap(root);
  chapterMap.onToggle = (open) => minimap.setMapPressed(open);
  minimap.onMapButton = () => scene.toggleChapterMap();
  new RankPanel(side, myName, () => session.fetchRanking(PANEL_SIZE));
  const chat = new ChatBox(root, (text, everyone) => void session.sendChat(text, everyone), `chat-log:${profile.id}`, profile.id);
  const tags = new NameTags(root);
  const wanted = new WantedPanel(hud.topLeft, profile.id, () => session.fetchWanted());
  wanted.onChange((karma) => tags.setKarma(karma));

  const office = new OfficeWindow(root, economy, {
    onGo: (place) => scene.goToWork(place),
    loadRoster: () => session.fetchWorkplaceRoster(),
  });

  // 던전 입장 창(2026-11-15 사용자 요청)
  const dungeon = new DungeonWindow(root, dungeonData.dungeons, dungeonData.monsters, {
    onGo: (id) => scene.goToDungeon(id),
    loadRoster: () => session.fetchDungeonRoster(),
    goldOf: (gold) => economy.killGold(gold),
  });

  // 모험(2026-11-17, 기획 docs/balance/dungeon-rework.md). 시작마을 아래 귀퉁이 '모험하기' 포탈이 이 창을 연다.
  const adventure = new Adventure();
  const adventureWindow = new AdventureWindow(root, adventure, {
    enter: () => void scene.enterAdventure(),
    mapId: () => scene.currentMap,
  });

  // 농협(2026-11-15 사용자 요청, 기획 docs/balance/farm.md)
  const farmFailText: Record<string, string> = {
    taken: '그사이 다른 사람이 산 칸이 있어 모두 취소했습니다',
    'not enough gold': '골드가 모자랍니다',
    'cannot sell': '작물이나 블록이 있는 칸은 팔 수 없습니다',
    'not a plot': '땅이 아닌 칸이 있습니다',
  };
  const coop = new CoopWindow(root, economy, profile.id, {
    onBuySeeds: async (crop, amount) => {
      const bought = await session.buySeeds(crop, amount);
      if (typeof bought === 'string') {
        hud.toast('살 수 없습니다', farmFailText[bought] ?? '잠시 후 다시 시도해 주세요');
        return;
      }
      economy.setGold(bought.gold);
      economy.setSeedCount(crop, bought.count);
      hud.toast(`${economy.cropInfo(crop)?.name ?? ''} 씨앗 ${amount}개 구매`, byInput('인벤토리(I)의 씨앗 탭에서 단축키 칸에 넣고, 농장의 내 땅을 좌클릭해 심습니다', '인벤토리의 씨앗 탭에서 단축키 칸에 넣고, 농장의 내 땅을 눌러 심습니다'));
    },
    onSellCrops: async () => {
      const sold = await session.sellCrops();
      if (!sold) {
        hud.toast('팔지 못했습니다', '잠시 후 다시 시도해 주세요');
        return;
      }
      economy.setGold(sold.gold);
      economy.clearCrops();
      hud.toast(`작물을 모두 팔았습니다 (+${goldText(sold.earned)})`, '');
    },
    loadFarm: () => session.readFarm(),
    loadBlocks: () => session.readBlocks('farm'),
    buyPlots: async (cells) => {
      const result = await session.buyPlots(cells);
      if (typeof result === 'string') return farmFailText[result] ?? '사지 못했습니다';
      economy.setGold(result.gold);
      hud.toast(`땅 ${cells.length}칸을 샀습니다 (-${goldText(result.cost)})`, `내 땅 ${result.owned}칸`);
      return null;
    },
    sellPlots: async (cells) => {
      const result = await session.sellPlots(cells);
      if (typeof result === 'string') return farmFailText[result] ?? '팔지 못했습니다';
      economy.setGold(result.gold);
      hud.toast(`땅 ${cells.length}칸을 팔았습니다 (+${goldText(result.refund)})`, `내 땅 ${result.owned}칸`);
      return null;
    },
  });

  // 대장간(2026-11-16, docs/balance/weapons.md). 사기·강화·팔기는 서버가 정하고, 여기서 골드와 가방을 맞춘다.
  const forgeTable = new ForgeTable(forgeData.steps);
  // 무기에 마우스를 올리면(휴대폰은 길게 누르면) 이름, 공격력, 강화, 판매가가 뜬다(2026-11-18 사용자 요청).
  const weaponTip = new WeaponTip(root, economy, inventory, forgeTable);
  weaponTip.onLongPress = () => hud.stopDrag();
  const forge = new ForgeWindow(root, economy, inventory, forgeTable, {
    buy: async (kind) => {
      const bought = await session.buyGear(kind);
      if (typeof bought === 'string') return bought;
      economy.setGold(bought.gold);
      const placed = inventory.addGear(bought.gear);
      hud.toast(`+0 ${WEAPONS[kind].name} 구매 (-${goldText(bought.paid)})`, placed ? '단축키 칸에 넣었습니다' : byInput('인벤토리(I)의 무기 탭에 있습니다', '인벤토리의 무기 탭에 있습니다'));
      return null;
    },
    sell: async (gear) => {
      const sold = await session.sellGear(gear.id);
      if (typeof sold === 'string') {
        if (sold === 'gone') inventory.removeGear(gear.id);
        return sold;
      }
      economy.setGold(sold.gold);
      inventory.removeGear(gear.id);
      return null;
    },
    hammer: async (gear, scrolls) => {
      const result = await session.forgeGear(gear.id, scrolls);
      if (typeof result === 'string') {
        if (result === 'gone') inventory.removeGear(gear.id);
        return result;
      }
      // 강화비는 결과와 상관없이 빠지므로 골드는 바로 맞춘다. 단계와 목록은 연출 뒤 land에서 바꾼다.
      economy.setGold(result.gold);
      return result;
    },
    land: (gear, outcome) => {
      if (outcome.level === null) inventory.removeGear(gear.id);
      else inventory.setGearLevel(gear.id, outcome.level);
    },
  });

  const shop = new ShopWindow(root, economy, {
    onBuyTool: (tool) => scene.buyTool(tool),
    onBuyPotion: async (id, amount) => {
      const bought = await session.buyPotion(id, amount);
      if (!bought) {
        hud.toast('살 수 없습니다', '골드가 모자라거나 잠시 문제가 있습니다');
        return;
      }
      economy.setGold(bought.gold);
      economy.setPotionCount(id, bought.count);
      hud.toast(`${economy.potion(id)?.name ?? '포션'} ${amount}개 구매`, `가진 것 ${bought.count}개 · 인벤토리${byInput('(I)', '')}의 포션 탭에서 단축키 칸에 넣습니다`);
    },
    onBuyRenameTicket: async () => {
      const bought = await session.buyRenameTicket();
      if (!bought) {
        hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
        return;
      }
      economy.setRenameTickets(bought.tickets, bought.gold);
      hud.toast('닉네임 변경권을 샀습니다', `가진 변경권 ${bought.tickets.toLocaleString()}장. ${byInput('I 창', '인벤토리의')} 정보창에서 씁니다.`);
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
          failed: ['거래하지 못했습니다', '잠시 후 다시 시도해 주세요'],
        }[result.reason];
        hud.toast(title, detail);
        return;
      }
      economy.setGold(result.gold);
      market.setTraded(stock, result.shares, result.cost, result.price);
      const count = Math.abs(amount).toLocaleString();
      const total = goldText(BigInt(Math.abs(amount)) * BigInt(result.price));
      hud.toast(
        amount > 0 ? `${name} ${count}주를 샀습니다` : `${name} ${count}주를 팔았습니다`,
        `주당 ${result.price.toLocaleString()}원 · ${amount > 0 ? '-' : '+'}${total}`,
      );
    },
  });
  const killBoard = new KillBoard(root, myName, () => session.fetchKillRanking(KILL_BOARD_SIZE));

  const casino = new CasinoWindows(root, economy, (game, pick, amount) => session.placeBet(game, pick, amount));

  const elevator = new ElevatorWindow(root, {
    onGo: (to) => scene.rideElevator(to),
  });

  /**
   * 인터페이스 숨기기(U, 2026-11-27 사용자 "특정키 누르면 인터페이스들 다 안보이게"): #hud에 class 하나를 붙여 CSS로 숨긴다(display 바꾸기만).
   * 포탈·가구로 여는 창(.office)과 확인 창은 그대로 보인다. 인벤토리·채팅·안내·지도 키를 누르면 먼저 다시 보인다. 휴대폰은 키가 없어 쓰지 않는다.
   */
  const setUiHidden = (hidden: boolean) => {
    if (root.classList.contains('ui-hidden') === hidden) return;
    root.classList.toggle('ui-hidden', hidden);
    scene.setUiHidden(hidden);
  };
  const showUi = () => setUiHidden(false);
  const keys = new Keys({
    onScoreboard: (open) => (open ? void killBoard.show() : killBoard.hide()),
    onSlot: (index) => inventory.select(index),
    // 모험 맵에서는 I가 스텟 판과 장비창을 연다(2026-11-21 사용자 "인벤토리는 모험에서 어차피 안쓰니깐 p 대신 i 로 통일한다"). 마을 인벤토리는 모험에서 열지 않는다.
    onInventory: () => {
      showUi();
      if (scene.inAdventure) void scene.adventureStatsKey();
      else hud.toggle();
    },
    onHelp: () => {
      showUi();
      hud.toggleHelp();
    },
    onRotate: () => scene.reloadOrRotate(),
    onMap: () => {
      showUi();
      scene.toggleChapterMap();
    },
    onHideUi: () => setUiHidden(!root.classList.contains('ui-hidden')),
    onEscape: () => {
      if (anyModalOpen()) {
        closeTopModal();
        return;
      }
      if (chapterMap.isOpen) {
        chapterMap.close();
        return;
      }
      hud.close();
      office.close();
      dungeon.close();
      adventureWindow.close();
      scene.closeAdventureStats();
      coop.close();
      shop.close();
      forge.close();
      castle.close();
      fame.close();
      board.close();
      exchange.close();
      elevator.close();
      casino.close();
    },
    onChat: () => {
      showUi();
      const windowOpen =
        hud.isOpen || office.isOpen || dungeon.isOpen || adventureWindow.isOpen || coop.isOpen || shop.isOpen || forge.isOpen || castle.isOpen || fame.isOpen || board.isOpen || exchange.isOpen || elevator.isOpen || casino.isOpen || anyModalOpen();
      if (!windowOpen) chat.open();
    },
  });

  // 땅에 놓는 메모와 골드(2026-11-13 사용자 요청)
  const groundUi = new GroundUi(root);
  hud.setMemoRenderer((pane) => groundUi.renderBag(pane));
  groundUi.onChange(() => hud.refreshMemos());
  hud.onDropGold = () => groundUi.openGoldDrop(economy.gold, (amount) => scene.dropGold(amount));
  void session.myMemos().then((memos) => groundUi.setHeld(memos));

  const scene = new GameScene(inventory, hud, keys, chat, tags, minimap, session, economy, office, shop, castle, fame, elevator, casino, notices, board, wanted, exchange, market, groundUi, dungeon, dungeonData.monsters, coop, forge, adventure, adventureWindow, chapterMap, new BoxUi(root, session, economy, groundUi));

  hud.onUsePotion = () => scene.drinkSelectedPotion();
  hud.onReselect = () => scene.reloadOrRotate();
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
    Object.assign(window, { sandbox: { weaponTip, scene, inventory, hud, chat, session, economy, office, dungeon, coop, shop, forge, castle, fame, board, exchange, market, elevator, casino, groundUi, adventure, adventureWindow } });
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
    const [economy, dungeons, potions, farm, forge] = await Promise.all([
      loadEconomy(profile),
      loadDungeons(),
      loadPotions(),
      loadFarm(),
      loadForge(),
      loadSprites(),
      // 모험 맵에서 새로고침했으면 맵 자료를 먼저 읽는다(맵을 올리기 전에 있어야 함). 못 읽으면 GameScene이 시작마을로 보낸다.
      isMapId(profile.map) && isAdventure(profile.map) ? loadAdventureMaps(profile.map).catch(() => null) : null,
    ]);
    enterGame(profile, economy, dungeons, potions, farm, forge);
  }
}

main().catch((e) => {
  console.error('[시작 실패]', e);
  document.getElementById('game')!.textContent = '서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.';
});

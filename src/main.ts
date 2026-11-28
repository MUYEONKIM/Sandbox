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
import { NoticeBar, noticeText } from './ui/notice';
import { Titles } from './game/titles';
import { watchNewVersion } from './ui/newVersion';
import { NameTags } from './ui/nametags';
import { CasinoWindows } from './ui/casino';
import { BoardWindow } from './ui/board';
import { WantedPanel } from './ui/wanted';
import { ExchangeWindow } from './ui/exchange';
import { InfoView } from './ui/info';
import { CastleWindow } from './ui/castle';
import { ElevatorWindow } from './ui/elevator';
import { FameWindow } from './ui/fame';
import { DungeonWindow } from './ui/dungeon';
import { Adventure } from './game/adventure';
import { AdventureWindow } from './ui/adventure';
import { cropOfSeed, paintItem, WEAPONS } from './items';
import { PetCare } from './game/petCare';
import { foodValue, PET_FOODS, type PetFood, type PetKind } from './game/pets';
import { isCropId } from './game/farm';
import { spriteUrl } from './art/sprites';
import { PLACE_ICONS } from './ui/office';
import { PetPanel, type PetFoodRow } from './ui/petPanel';
import { openFarewell, PetPickWindow } from './ui/petWindows';
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
import { sound } from './sound/engine';
import { SoundPanel } from './ui/soundPanel';

/** 탭·고르기 버튼(누르면 ui_tab): 인벤토리 큰·작은 탭, I 창 보기, 게시판·모험 탭, 고르는 칸(대장간 탭·수량), 도박 걸 곳 */
const TAB_BUTTONS = '.bag-tab, .panel-view, .board-tab, .adv-tab, .shop-amount, .casino-pick';

/** 명예의 전당 창에 보여 줄 인원 */
const FAME_SIZE = 50;
/** 게시판에 보여 줄 최근 글 수 */
const BOARD_SIZE = 50;
/** Tab 킬/데스 순위표에 보여 줄 인원 */
const KILL_BOARD_SIZE = 10;
const HOUR_MS = 60 * 60 * 1000;
/** 매시 정각 뒤 내 칭호를 다시 읽기까지 기다리는 시간(모두가 한꺼번에 부르지 않게 5~30초 사이로 흩음) */
const TITLE_DELAY_MS = 5_000;
const TITLE_SPREAD_MS = 25_000;

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
  // 소리 설정(2026-11-27): 계정 줄의 '소리' 버튼
  const soundPanel = new SoundPanel(side.querySelector<HTMLElement>('.account')!);
  hud.setHp(profile.hp, profile.max_hp);
  hud.setLevel(BigInt(profile.level), profile.exp);

  const economy = new Economy(economyData);
  // 펫(2026-11-28): 상태는 서버 pet_state가 기준이다. 읽기는 장면을 만든 뒤 wirePets가 한다.
  const petCare = new PetCare(profile.id);
  economy.setPotions(potionData.catalog, potionData.counts);
  economy.setFarm(farmData.crops, farmData.stock);
  // 정보창 '태운 장작'(2026-11-28 캠프파이어): 접속한 뒤 따로 한 번 읽는다(기다리지 않음).
  void session.campfireLogs().then((total) => economy.setCampfireLogs(total));
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
  // 칭호(2026-11-28): 가진 칭호·단 칭호·최고 강화 기록. 달기는 서버 set_title이 확인한다.
  const titles = new Titles();
  const wearTitle = async (id: string | null) => {
    const result = await session.setTitle(id);
    if (typeof result === 'string') {
      sound.play('deny');
      hud.toast('달지 못했습니다', '');
      void refreshTitles();
      return;
    }
    titles.setWorn(result.worn);
  };
  const info = new InfoView(hud.infoPane, myName, economy, market, () => hud.status, rename, showKillBoard, { store: titles, wear: (id) => void wearTitle(id) });
  hud.setInfoRenderer(() => info.render());
  void market.refresh();

  const minimap = new Minimap(side);
  // 모험 지역 전체지도(2026-11-25): M, 미니맵 왼쪽 위 지도 버튼, Esc, ×
  const chapterMap = new ChapterMap(root);
  chapterMap.onToggle = (open) => minimap.setMapPressed(open);
  minimap.onMapButton = () => scene.toggleChapterMap();
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
        sound.play('deny');
        hud.toast('살 수 없습니다', farmFailText[bought] ?? '잠시 후 다시 시도해 주세요');
        return;
      }
      sound.play('buy');
      economy.setGold(bought.gold);
      economy.setSeedCount(crop, bought.count);
      hud.toast(`${economy.cropInfo(crop)?.name ?? ''} 씨앗 ${amount}개 구매`, `가진 씨앗 ${bought.count.toLocaleString()}개`);
    },
    onSellCrops: async () => {
      const sold = await session.sellCrops();
      if (!sold) {
        sound.play('deny');
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
      sound.play('buy');
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
      sound.play('buy');
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
      // 최고 기록과 강화 첫 달성 칭호는 연출이 끝난 뒤 보인다(결과가 먼저 비치지 않게). 칭호는 다시 읽어 얻은 것을 알린다.
      if (outcome.best !== null) titles.setBest(outcome.best);
      if (outcome.title) void refreshTitles();
    },
    best: () => titles.best,
  });

  const shop = new ShopWindow(root, economy, {
    onBuyTool: (tool) => scene.buyTool(tool),
    onBuyPotion: async (id, amount) => {
      const bought = await session.buyPotion(id, amount);
      if (!bought) {
        sound.play('deny');
        hud.toast('살 수 없습니다', '골드가 모자라거나 잠시 문제가 있습니다');
        return;
      }
      sound.play('buy');
      economy.setGold(bought.gold);
      economy.setPotionCount(id, bought.count);
      hud.toast(`${economy.potion(id)?.name ?? '포션'} ${amount}개 구매`, `가진 것 ${bought.count}개 · 인벤토리${byInput('(I)', '')}의 포션 탭에서 단축키 칸에 넣습니다`);
    },
    onBuyRenameTicket: async () => {
      const bought = await session.buyRenameTicket();
      if (!bought) {
        sound.play('deny');
        hud.toast('살 수 없습니다', '잠시 후 다시 시도해 주세요');
        return;
      }
      sound.play('buy');
      economy.setRenameTickets(bought.tickets, bought.gold);
      hud.toast('닉네임 변경권을 샀습니다', `가진 변경권 ${bought.tickets.toLocaleString()}장. ${byInput('I 창', '인벤토리의')} 정보창에서 씁니다.`);
    },
    onSell: () => void scene.sellEverything(),
    onBuyPetTreats: async (amount) => {
      const bought = await petCare.buyTreats(amount);
      if (typeof bought === 'string') {
        sound.play('deny');
        hud.toast('살 수 없습니다', bought === 'gold' ? '골드가 모자랍니다' : '잠시 후 다시 시도해 주세요');
        return;
      }
      sound.play('buy');
      economy.setPetTreats(bought.count, bought.gold);
      hud.toast(`펫 간식 ${amount}개 구매`, `가진 것 ${bought.count.toLocaleString()}개`);
    },
    petTreatPrice: () => petCare.treatPrice,
  });

  const castle = new CastleWindow(root, economy, {
    onBuyStat: (id, amount) => scene.buyStat(id, amount),
  });

  const fame = new FameWindow(root, (kind) => session.fameRanking(kind, FAME_SIZE));
  const notices = new NoticeBar(root);

  // 칭호를 얻거나 잃으면 나에게만 위쪽 알림과 채팅 기록 한 줄(growth-1127.md 8-1·8-2). 처음 읽은 것은 알리지 않는다.
  async function refreshTitles() {
    const mine = await session.myTitles();
    if (!mine) return;
    const { gained, lost } = titles.apply(mine);
    for (const [list, wasLost] of [[gained, false], [lost, true]] as const) {
      for (const { name } of list) {
        const notice = { kind: 'title', name, lost: wasLost } as const;
        notices.show(notice);
        chat.system(noticeText(notice));
      }
    }
  }
  // 내 이름표 칭호 줄과 접속 명단(다른 사람 화면), 정보창을 맞춘다.
  titles.onChange(() => {
    tags.setTitle(profile.id, titles.worn, titles.rich);
    session.setMyTitle(titles.worn, titles.rich);
    hud.refreshInfo();
  });
  tags.titleName = (id) => titles.nameOf(id);
  // 채팅·명예의 전당은 칭호 이름만 받아 칭호 표에서 id를 찾아 등급(색·아이콘)을 정한다(칭호 꾸밈 title-look.md 8절)
  chat.titleId = fame.titleId = (name) => titles.idOf(name);
  void session.loadTitleNames().then((rows) => {
    titles.setNames(rows);
    tags.repaintTitles();
    chat.repaintTitles();
  });
  // 랭킹 칭호는 서버가 매시 정각에 다시 정한다. 그 뒤 한 번 읽는다(1시간에 한 번).
  const scheduleTitles = () =>
    window.setTimeout(() => void refreshTitles().finally(scheduleTitles), HOUR_MS - (Date.now() % HOUR_MS) + TITLE_DELAY_MS + Math.random() * TITLE_SPREAD_MS);
  void refreshTitles();
  scheduleTitles();
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
        sound.play('deny');
        hud.toast(title, detail);
        return;
      }
      if (amount > 0) sound.play('buy');
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
      if (soundPanel.isOpen) {
        soundPanel.close();
        return;
      }
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

  wirePets(root, scene, hud, economy, info, adventure, petCare);

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
    // 소리는 src/sound/engine.ts가 맡는다. Phaser가 오디오를 따로 만들지 않게 끈다.
    audio: { noAudio: true },
    scene,
  });

  // 개발 중 브라우저 콘솔에서 상태를 확인하기 위한 통로
  if (import.meta.env.DEV) {
    Object.assign(window, { sandbox: { sound, weaponTip, scene, inventory, hud, chat, session, economy, office, dungeon, coop, shop, forge, castle, fame, board, exchange, market, elevator, casino, groundUi, adventure, adventureWindow, titles, petCare } });
  }
}

/** 펫 먹이 이름·그림(작물은 씨앗 아이콘과 같은 다 자란 그림, 붕어·풀은 낚시터·채집장 그림, 제가 정한 것) */
const foodIcons = new Map<PetFood, string>();
function foodIcon(food: PetFood) {
  let url = foodIcons.get(food);
  if (!url) {
    if (food === 'treat') url = spriteUrl('pets/pet-treat-32');
    else if (food === 'rebel_carp') url = spriteUrl(PLACE_ICONS.fishing);
    else if (food === 'roadside_grass') url = spriteUrl(PLACE_ICONS.gathering);
    else url = paintItem(`seed_${food}`).toDataURL();
    foodIcons.set(food, url);
  }
  return url;
}

/**
 * 펫(2026-11-28 코드 묶음 7): 상태 창, 고르는 창·입양 창·작별 창, 정보창 줄, 인벤토리 '펫' 탭, 상점 간식 수를 PetCare(서버 값)에 잇는다.
 * 처음 접속한 계정(펫 없음, 잃은 적 없음)은 고르는 창이 뜨고 고를 때까지 닫히지 않는다(사용자 결정 ⑤).
 */
function wirePets(root: HTMLElement, scene: GameScene, hud: Hud, economy: Economy, info: InfoView, adventure: Adventure, petCare: PetCare) {
  scene.petCare = petCare;
  const foodName = (food: PetFood) =>
    food === 'treat' ? '펫 간식' : isCropId(food) ? (economy.cropInfo(food)?.name ?? food) : (economy.lootItem(food)?.name ?? food);
  const countOf = (food: PetFood) => (food === 'treat' ? economy.petTreats : isCropId(food) ? economy.cropCount(food) : economy.stashCount(food));
  const foods = (kind: PetKind): PetFoodRow[] =>
    PET_FOODS.flatMap((food) => {
      const value = foodValue(kind, food);
      const count = countOf(food);
      return value && count > 0 ? [{ food, name: foodName(food), icon: foodIcon(food), count, full: value.full, favorite: value.favorite }] : [];
    });

  let pick: PetPickWindow | null = null;
  const openPick = (adopt: boolean) => {
    if (pick?.isOpen) return;
    pick = new PetPickWindow(root, {
      adopt: adopt ? { price: petCare.adoptPrice, gold: () => economy.gold } : null,
      choose: async (kind) => {
        if (adopt) {
          const result = await petCare.adopt(kind);
          if (typeof result === 'string') return result === 'gold' ? '골드가 모자랍니다' : '입양하지 못했습니다. 잠시 후 다시 해 주세요';
          economy.setGold(result);
          return null;
        }
        const result = await petCare.pick(kind);
        // 다른 창·기기에서 먼저 정했으면 서버 값을 쓰고 창을 닫는다(pets.md 5-4).
        if (result === null || result === 'already') return null;
        return '정하지 못했습니다. 잠시 후 다시 해 주세요';
      },
    });
  };

  const panel = new PetPanel(root, petCare, {
    canCare: () => scene.canCarePet,
    asleep: () => scene.petAsleep,
    playCare: (kind, hearts) => scene.playPetCare(kind, hearts),
    petSay: (text) => scene.petSay(text),
    talkContext: () => scene.petTalkPlace(),
    foods,
    fed: (food, grade, left) => {
      if (food === 'treat') economy.setPetTreats(left ?? 0);
      else if (isCropId(food)) {
        if (grade) economy.setCropCount(food, grade, left ?? 0);
      } else economy.setStashCount(food, left ?? 0);
      hud.refreshPetBag();
    },
    adopt: () => openPick(true),
  });
  scene.onPetClick = () => panel.pat();

  petCare.onChange = () => {
    panel.render();
    scene.syncMyPet();
    economy.setPetTreats(petCare.treats);
  };
  petCare.onSent = () => scene.syncMyPet();
  petCare.onPet = () => {
    scene.syncMyPet();
    hud.refreshInfo();
    hud.refreshPetBag();
    if (petCare.needsPick) openPick(false);
    else if (pick?.isOpen && petCare.kind) pick.close();
  };
  petCare.onChanceLost = (left, online) => panel.loseChance(left, online);
  petCare.onLost = (kind, alive) => {
    if (alive) scene.petFarewell(() => openFarewell(root, kind));
    else openFarewell(root, kind);
  };
  petCare.onStage = (stage) => panel.showBig(stage);
  info.pet = () => (petCare.unavailable || !petCare.state ? undefined : petCare.kind);

  // 인벤토리 '펫' 탭: 펫 간식(늘)과 지금 펫이 먹는 먹이(가진 것만)
  hud.setPetRenderer((pane) => {
    pane.replaceChildren();
    const kind = petCare.kind;
    const rows: { food: PetFood; count: number }[] = [{ food: 'treat', count: economy.petTreats }];
    if (kind) for (const row of foods(kind)) if (row.food !== 'treat') rows.push(row);
    for (const { food, count } of rows) {
      const row = element('pet-bag-row', pane);
      const icon = element('', row, 'img') as HTMLImageElement;
      icon.src = foodIcon(food);
      icon.alt = '';
      element('', row, 'span').textContent = foodName(food);
      element('count', row, 'span').textContent = `${count.toLocaleString()}개`;
    }
  });
  economy.onChange(() => hud.refreshPetBag());

  // 모험 한 번이 끝나면 서버가 친밀도 +2·기운 −5를 더했다(adventure_settle). 막대를 맞춘다.
  let inRun = adventure.view?.inRun ?? false;
  adventure.onChange(() => {
    const now = adventure.view?.inRun ?? false;
    if (inRun && !now) void petCare.refresh();
    inRun = now;
  });
  void petCare.load();
}

async function main() {
  if (!isConfigured) {
    document.getElementById('game')!.textContent = '서버 설정이 없어 게임을 시작할 수 없습니다.';
    return;
  }

  // 로그인 창은 곡이 없다(sound-plan.md 1절). 게임에 들어간 뒤 첫 클릭·키 입력 때 그 맵 곡을 튼다.
  // 화면 버튼 누르는 소리는 창마다 붙이지 않고 여기 한 곳에서 낸다(막힌 버튼은 click이 오지 않음). 탭·고르기 버튼은 ui_tab.
  document.addEventListener(
    'click',
    (e) => {
      const button = e.target instanceof Element ? e.target.closest('button') : null;
      if (button) sound.click(button.matches(TAB_BUTTONS) ? 'ui_tab' : 'ui_click');
    },
    { capture: true, passive: true },
  );
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

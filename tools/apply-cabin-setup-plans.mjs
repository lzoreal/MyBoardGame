/* 把 50 个官方剧本的 Setup 计划写入 content/cabin/scenarios/official-3e.json。
   计划只描述“开局如何摆”，规则目标仍由 cabin.js 的 Goal/剧本动作处理。 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'content', 'cabin', 'scenarios', 'official-3e.json');

const track = (a, b, c, d) => ({ 3: a, 4: b, 5: c, 6: d });
const mon = (monster, room, extra = {}) => ({ type: 'placeMonster', monster, room, ...extra });

const plans = {
  1: {
    summary: '杰克之灵放图书室；英雄在图书室进行驱魔。',
    ops: [
      { type: 'placeSpecialRoom', room: '图书室', floor: 'ground' },
      mon('jack', '图书室'),
      { type: 'custom', key: 'exorcism', value: true }
    ]
  },
  2: {
    summary: '发 1–N 号数字标记，1 号是隐藏叛徒；数字轨道 6/5/4/3。',
    numberTrackByPlayers: track(6, 5, 4, 3),
    ops: [
      { type: 'assignNumbers' },
      { type: 'grantItem', item: '骨戒', to: 'revealer' },
      { type: 'custom', key: 'ring', value: true },
      { type: 'custom', key: 'healOnReveal', value: 'allMight1' }
    ]
  },
  3: {
    summary: '每人 3 个疾病标记；6 人局有 2 个「1」；热病者入场。',
    ops: [
      { type: 'assignDisease' },
      mon('feverish', 'random'),
      { type: 'custom', key: 'multiTraitor', value: true }
    ]
  },
  4: {
    summary: '恶魔中介放门厅；火焰标记按 3/2/1/0 放在英雄板块。',
    ops: [
      mon({ key: 'demon_realtor', name: '恶魔中介', count: 1, might: 5, speed: 4, sanity: 5, known: 5, attack: 'might' }, '门厅'),
      { type: 'placeToken', token: '火焰', room: 'heroTiles', countByPlayers: track(3, 2, 1, 0) },
      { type: 'custom', key: 'rescueRealtor', value: true }
    ]
  },
  5: {
    summary: '每名英雄所在板块放 1 只石像小天使，再按 3/4/5/6 额外放到视线外。',
    ops: [
      mon('cherub', 'heroTiles', { perHero: true, countByPlayers: track(4, 5, 6, 7) }),
      { type: 'custom', key: 'hideAndSeek', value: true }
    ]
  },
  6: {
    summary: '8 个属性标记分区域放好；发 1–N 号数字标记，1 号是隐藏叛徒。',
    ops: [
      { type: 'assignNumbers' },
      { type: 'custom', key: 'traitEvidence', value: true },
      { type: 'custom', key: 'evidencePairs', value: 3 }
    ]
  },
  7: {
    summary: '揭示者翻倒并困在镜界；镜像体按 2/3/4/5 放在门厅。',
    ops: [
      mon('mirrorbeing', '门厅', { countByPlayers: track(2, 3, 4, 5) }),
      { type: 'flipRoom', who: 'revealer' },
      { type: 'custom', key: 'mirrorRealm', value: true }
    ]
  },
  8: {
    summary: '事件板块补到 3/4/5/6 块；每块放 1 个家政工；5 个符文标记。',
    ops: [
      { type: 'ensureSymbolTiles', symbol: 'event', countByPlayers: track(3, 4, 5, 6), noEffect: true },
      mon('housekeeper', 'eventTiles'),
      { type: 'placeToken', token: '符文', room: 'nonLanding', count: 5 },
      { type: 'custom', key: 'cleanRooms', value: ['血房', '焦屋', '坍塌房间', '杂物房', '地下墓穴'] }
    ]
  },
  9: {
    summary: '数字轨道设为 1；全员互为敌人。',
    numberTrack: 1,
    ops: [{ type: 'custom', key: 'ffaNumberTrack', value: true }]
  },
  10: {
    summary: '金库放底层远端；宝藏按人数 1–2/3/4/5 组；数字轨道 4。',
    numberTrack: 4,
    ops: [
      { type: 'placeToken', token: '宝藏', room: 'farBasement', countByPlayers: track(2, 3, 4, 5) },
      { type: 'custom', key: 'vault', value: 'farBasement' },
      { type: 'custom', key: 'bidTreasure', value: true }
    ]
  },
  11: {
    summary: '食物标记按 2/3/4/5 放好；女巫在回合结束吃人。',
    ops: [
      { type: 'placeToken', token: '食物', room: 'nonLanding', countByPlayers: track(2, 3, 4, 5) },
      mon({ key: 'witch', name: '女巫', count: 1, might: 6, speed: 4, sanity: 6, known: 5, attack: 'might', endTurn: { damage: { amount: 1, type: 'physical' } } }, 'random'),
      { type: 'custom', key: 'foodOfferings', value: 3 }
    ]
  },
  12: {
    summary: '奇怪护符交揭示者；两只巨魔之手放门厅与底层平台。',
    ops: [
      { type: 'grantItem', item: '奇怪护符', to: 'revealer' },
      mon('trollhand', '门厅'),
      mon('trollhand', '底层平台'),
      { type: 'custom', key: 'ffaAmulet', value: true }
    ]
  },
  13: {
    summary: '仪式轨道 3；仪式房与裂隙放底层；邪教徒按 3/4/5/6 放仪式房。',
    numberTrack: 3,
    ops: [
      { type: 'placeSpecialRoom', room: '仪式房', floor: 'basement' },
      { type: 'placeToken', token: '裂隙', room: '仪式房', count: 1 },
      mon('cultist', '仪式房'),
      { type: 'custom', key: 'awakenHer', value: 3 }
    ]
  },
  14: {
    summary: '数字轨道 4/4/5/5；家具按 1/2/3/4 放英雄板块。',
    numberTrackByPlayers: track(4, 4, 5, 5),
    ops: [
      mon('furniture', 'heroTiles'),
      { type: 'custom', key: 'spellProgress', value: 4 }
    ]
  },
  15: {
    summary: '叛徒本体死亡，控制幽灵、狼人、吸血鬼；大怪物放死亡板块。',
    ops: [
      mon('ghost', 'random'),
      mon('vampire', 'random'),
      mon('werewolf', 'random'),
      { type: 'custom', key: 'traitorBodyDead', value: true }
    ]
  },
  16: {
    summary: '墓地放好；遗骸按 1–4/5/6/7 发英雄；2 只小怪物。',
    ops: [
      { type: 'placeSpecialRoom', room: '墓园', floor: 'ground' },
      { type: 'placeToken', token: '遗骸', room: 'heroTiles', countByPlayers: track(4, 5, 6, 7) },
      mon('ghost', 'random', { count: 2 }),
      { type: 'custom', key: 'burial', value: 5 }
    ]
  },
  17: {
    summary: '3 只小妖精在叛徒板块；纸条按 6/5/4/3 准备，其中一张 DIE。',
    ops: [
      mon('gremlin', 'traitor', { count: 3 }),
      { type: 'placeToken', token: '纸条', room: 'heroTiles', countByPlayers: track(6, 5, 4, 3) },
      { type: 'custom', key: 'dieNote', value: true }
    ]
  },
  18: {
    summary: '叛徒棋子移出屋子；幻象按 1–N 放置，1 号是真身。',
    ops: [
      mon({ key: 'illusion', name: '幻象', count: 1, might: 5, speed: 5, sanity: 5, known: 5, attack: 'might', disguised: true }, 'nonLanding', { countByPlayers: track(3, 4, 5, 6) }),
      { type: 'custom', key: 'ringIllusion', value: true },
      { type: 'custom', key: 'trueBody', value: 1 }
    ]
  },
  19: {
    summary: '数字轨道 6/4/3/2；5 卷录像带分散；复仇幽灵在录像带板块。',
    numberTrackByPlayers: track(6, 4, 3, 2),
    ops: [
      { type: 'placeToken', token: '录像带', room: 'nonLanding', count: 5 },
      mon('vengeful', 'nonLanding'),
      { type: 'custom', key: 'tapes', value: 5 }
    ]
  },
  20: {
    summary: '补足至少 5 块非平台板块；音节符文按 2/3/5 放好；无名者在叛徒板块。',
    ops: [
      { type: 'ensureTiles', count: 5 },
      { type: 'placeToken', token: '音节', room: 'eventTiles', countByPlayers: track(2, 3, 5, 5) },
      mon('faceless', 'traitor'),
      { type: 'custom', key: 'nameSyllables', value: true }
    ]
  },
  21: {
    summary: '图书室放叛徒区域外；Spooky 在图书室持书；叛徒放恐惧标记。',
    ops: [
      { type: 'placeSpecialRoom', room: '图书室', floor: 'ground' },
      mon('spooky', '图书室'),
      { type: 'grantItem', item: '旧书', to: 'traitor' },
      { type: 'placeToken', token: '恐惧', room: 'traitor', count: 1 },
      { type: 'custom', key: 'burnBook', value: true }
    ]
  },
  22: {
    summary: '除底层平台外地下室洗回牌堆；英雄放底层平台；实验室放底层，僵尸 3 只。',
    ops: [
      { type: 'removeBasement' },
      { type: 'movePlayers', room: '底层平台' },
      { type: 'placeSpecialRoom', room: '实验室', floor: 'basement' },
      mon('zombie', '实验室', { count: 3 }),
      { type: 'custom', key: 'escapeHouse', value: true }
    ]
  },
  23: {
    summary: '数字轨道 2/3/4/5；ON 标记按人数分布，每个 ON 板块 1 台机器人。',
    numberTrackByPlayers: track(2, 3, 4, 5),
    ops: [
      mon('robot', 'nonLanding', { countByPlayers: track(2, 3, 4, 5) }),
      { type: 'placeToken', token: 'ON', room: 'nonLanding', countByPlayers: track(2, 3, 4, 5) },
      { type: 'custom', key: 'onTokens', valueByPlayers: track(2, 3, 4, 5) }
    ]
  },
  24: {
    summary: '舞厅与礼拜堂放底层；妖精舞者 1/2/3/4 放舞厅；精灵之火在五个地点。',
    ops: [
      { type: 'placeSpecialRoom', room: '舞厅', floor: 'basement' },
      { type: 'placeSpecialRoom', room: '礼拜堂', floor: 'basement' },
      mon('faedancer', '舞厅'),
      { type: 'placeSpecialRoom', room: '塔楼', floor: 'upper' },
      { type: 'placeSpecialRoom', room: '雕像回廊', floor: 'upper' },
      { type: 'placeSpecialRoom', room: '温室', floor: 'ground' },
      { type: 'placeSpecialRoom', room: '地下洞穴', floor: 'basement' },
      { type: 'placeSpecialRoom', room: '地下湖', floor: 'basement' },
      { type: 'placeToken', token: '精灵之火', room: 'nonLanding', countByPlayers: track(2, 3, 4, 5) },
      { type: 'custom', key: 'darkQueen', value: true }
    ]
  },
  25: {
    summary: '四项属性各留 1 个标记作法术材料。',
    ops: [{ type: 'custom', key: 'spellMaterials', value: 4 }]
  },
  26: {
    summary: '祭坛在底层；仪式房放底层；亲属按 2/3/4/5 放预兆板块。',
    ops: [
      { type: 'placeToken', token: '祭坛', room: 'farBasement', count: 1 },
      { type: 'placeSpecialRoom', room: '仪式房', floor: 'basement' },
      mon('relative', 'omenTiles'),
      { type: 'custom', key: 'elderQueen', value: true }
    ]
  },
  27: {
    summary: '英雄拿 3/4/4/5 个外星文字；叛徒拿 5/4/4/3 并在自己板块放 1 个。',
    ops: [
      { type: 'placeToken', token: '外星文字', room: 'heroTiles', countByPlayers: track(3, 4, 4, 5) },
      { type: 'placeToken', token: '外星文字', room: 'traitor', countByPlayers: track(6, 5, 5, 4) },
      { type: 'custom', key: 'alienWords', value: true }
    ]
  },
  28: {
    summary: '大白幽灵鲨入场；用炸药或撑到它被消灭。',
    ops: [
      mon('shark', 'random'),
      { type: 'custom', key: 'ghostShark', value: true }
    ]
  },
  29: {
    summary: '妖精按 1/2/3/3 放在叛徒板块。',
    ops: [
      mon('fae', 'traitor'),
      { type: 'custom', key: 'bindFae', value: 3 }
    ]
  },
  30: {
    summary: '秘密楼梯放好；从板块堆移除 4/6/9/12 块；叛徒预兆交给揭示者。',
    ops: [
      { type: 'removeTiles', countByPlayers: track(4, 6, 9, 12) },
      { type: 'transferOmens' },
      mon('wedding', 'omenTiles'),
      { type: 'movePlayers', room: '门厅', who: 'traitor' },
      { type: 'custom', key: 'secretStairs', value: true },
      { type: 'custom', key: 'weddingRing', value: true }
    ]
  },
  31: {
    summary: '收走所有物品与预兆，只留 4/5/7/9 张；2 只被诅咒的物品。',
    ops: [
      { type: 'clearItems' },
      { type: 'leaveItems', countByPlayers: track(4, 5, 7, 9) },
      mon('curseditem', 'random', { count: 2 }),
      { type: 'custom', key: 'escapeWithItems', value: 4 }
    ]
  },
  32: {
    summary: '叛徒本体死亡；猫又 3/4/5/7、亡灵猫 3/4/5/7；火焰 6/5/4/3。',
    ops: [
      mon('bakeneko', 'random'),
      mon({ key: 'undeadcat', name: '亡灵猫', count: 1, might: 5, speed: 5, sanity: 5, known: 5, attack: 'might' }, 'random', { countByPlayers: track(3, 4, 5, 7) }),
      { type: 'placeToken', token: '火焰', room: 'nonLanding', countByPlayers: track(6, 5, 4, 3) },
      { type: 'custom', key: 'traitorBodyDead', value: true },
      { type: 'custom', key: 'burnHouse', value: true }
    ]
  },
  33: {
    summary: '幽灵摄影师 2/3/4/5 放非平台板块；魔法相机给叛徒；英雄拿精华标记。',
    ops: [
      mon('photographer', 'nonLanding'),
      { type: 'grantItem', item: '魔法相机', to: 'traitor' },
      { type: 'placeToken', token: '英雄精华', room: 'heroTiles', countByPlayers: track(3, 4, 5, 6) },
      { type: 'custom', key: 'smashCamera', value: true }
    ]
  },
  34: {
    summary: '数字轨道 6/3/1/0；事件牌堆移出；留 1 个小怪物标记作朋友。',
    numberTrackByPlayers: track(6, 3, 1, 0),
    ops: [
      { type: 'removeEvents' },
      { type: 'custom', key: 'dimensionFriend', value: 1 }
    ]
  },
  35: {
    summary: '两个虫巢分别放底层和上层；鼻涕虫 2/3/5 在叛徒板块。',
    ops: [
      { type: 'placeToken', token: '虫巢', room: '底层平台', count: 1 },
      { type: 'placeToken', token: '虫巢', room: '上层平台', count: 1 },
      mon('slug', 'traitor'),
      { type: 'custom', key: 'saltWeakness', value: true }
    ]
  },
  36: {
    summary: '每个事件板块放 1 只幽灵；神智满值或杀光英雄。',
    ops: [
      mon('ghost', 'eventTiles', { count: 3 }),
      { type: 'custom', key: 'enlightenment', value: 'sanityMax' }
    ]
  },
  37: {
    summary: '每名英雄拿自己的 DNA；数字轨道 2/3/4/5；机器人 1/1/2 并给每名英雄 1 台。',
    numberTrackByPlayers: track(2, 3, 4, 5),
    ops: [
      { type: 'assignDNA' },
      mon('security', 'traitor'),
      mon('security', 'heroTiles', { perHero: true }),
      { type: 'custom', key: 'dnaGoal', value: 'eachHero' }
    ]
  },
  38: {
    summary: '厨房放底层；轨道 2/3/4/4；邻居 3/4/5/6 放事件板块。',
    numberTrackByPlayers: track(2, 3, 4, 4),
    ops: [
      { type: 'placeSpecialRoom', room: '厨房', floor: 'basement' },
      mon('neighbor', 'eventTiles'),
      { type: 'custom', key: 'killNeighbors', value: true }
    ]
  },
  39: {
    summary: '叛徒变蜂后；虫巢 5 个；工蜂 0/2/3 在自己板块。',
    numberTrackByPlayers: track(5, 4, 4, 3),
    ops: [
      mon('giantwasp', 'traitor'),
      { type: 'placeToken', token: '虫巢', room: 'nonLanding', count: 5 },
      mon({ key: 'worker', name: '工蜂', count: 1, might: 4, speed: 5, sanity: 4, known: 4, attack: 'might' }, 'traitor', { countByPlayers: track(0, 2, 3, 3) }),
      { type: 'custom', key: 'timeRunsOut', value: true }
    ]
  },
  40: {
    summary: '邪恶双胞胎 2/3/4/5 放叛徒板块，每个下面放对应英雄身份。',
    ops: [
      mon({ key: 'twins', name: '邪恶双胞胎', count: 1, might: 5, speed: 5, sanity: 5, known: 5, attack: 'might' }, 'traitor', { countByPlayers: track(2, 3, 4, 5) }),
      { type: 'custom', key: 'twinsIdentity', value: true }
    ]
  },
  41: {
    summary: '数字轨道 0；5 个搜查标记；陷阱在自己板块；发电机 3/3/4/5；房子作为怪物。',
    numberTrack: 0,
    ops: [
      { type: 'placeToken', token: '搜查', room: 'traitor', count: 5 },
      { type: 'placeToken', token: '陷阱', room: 'traitor', count: 1 },
      mon('house', 'traitor'),
      mon({ key: 'generator', name: '发电机', count: 1, might: 5, speed: 5, sanity: 5, known: 5, attack: 'might', noAttack: true }, 'symbolTiles', { countByPlayers: track(3, 3, 4, 5) }),
      { type: 'custom', key: 'generators', value: 3 }
    ]
  },
  42: {
    summary: '储藏室放底层；恶魔犬在叛徒板块；食物按 0/1/1/2。',
    ops: [
      { type: 'placeToken', token: '储藏室', room: 'farBasement', count: 1 },
      mon('dog', 'traitor'),
      { type: 'placeToken', token: '食物', room: 'nonLanding', countByPlayers: track(0, 1, 1, 2) },
      { type: 'custom', key: 'pantry', value: true }
    ]
  },
  43: {
    summary: '数字轨道 6/7/8/9；狼人放揭示者板块；撑过 6 轮。',
    numberTrackByPlayers: track(6, 7, 8, 9),
    ops: [
      mon('werewolf', 'revealer'),
      { type: 'custom', key: 'surviveUntilDawn', value: 6 }
    ]
  },
  44: {
    summary: '揭示者板块翻面着火；3 人局再翻一名英雄；5 个火焰标记；人体模型 1/2/3/4。',
    ops: [
      { type: 'flipRoom', who: 'revealer', extraHeroIfThree: true },
      { type: 'placeToken', token: '火焰', room: 'nonLanding', count: 5 },
      mon('mannequin', 'landingTiles'),
      { type: 'custom', key: 'burnFiveRooms', value: 5 }
    ]
  },
  45: {
    summary: '军械库放底层；叛徒抽 2 件武器；数字轨道 2/3/4/5。',
    numberTrackByPlayers: track(2, 3, 4, 5),
    ops: [
      { type: 'placeSpecialRoom', room: '军械库', floor: 'basement' },
      { type: 'drawWeapon', to: 'traitor' },
      { type: 'drawWeapon', to: 'traitor' },
      { type: 'custom', key: 'cutScene', value: true }
    ]
  },
  46: {
    summary: '叛徒变巨型毛发怪；门厅放 1 只；解药按人数藏好。',
    ops: [
      mon('hair', '门厅'),
      { type: 'placeToken', token: '解药', room: 'nonLanding', countByPlayers: track(1, 4, 6, 8) },
      { type: 'custom', key: 'traitorHair', value: true },
      { type: 'custom', key: 'convertAllHeroes', value: true }
    ]
  },
  47: {
    summary: '传送门 2/3/4/5 放好；每名英雄拿被困标记。',
    ops: [
      { type: 'placeToken', token: '传送门', room: 'nonLanding', countByPlayers: track(2, 3, 4, 5) },
      { type: 'trapHeroes' },
      { type: 'custom', key: 'portals', value: 3 }
    ]
  },
  48: {
    summary: '血房放底层；房主持头骨在血房；叛徒力量 +1。',
    ops: [
      { type: 'placeToken', token: '血房', room: 'farBasement', count: 1 },
      mon('host', 'farBasement'),
      { type: 'placeToken', token: '头骨', room: 'traitor', count: 1 },
      { type: 'grantTrait', to: 'traitor', trait: 'might', amount: 1 },
      { type: 'custom', key: 'skullToPanicRoom', value: true }
    ]
  },
  49: {
    summary: '恶魔放底层远离平台；契约在恶魔身上；每名英雄 1 个血标记；叛徒 1/1/2/2 力量与速度。',
    ops: [
      mon('demon', 'farBasement'),
      { type: 'placeToken', token: '契约', room: 'traitor', count: 1 },
      { type: 'assignBlood' },
      { type: 'grantTrait', to: 'traitor', trait: 'might', amountByPlayers: track(1, 1, 2, 2) },
      { type: 'grantTrait', to: 'traitor', trait: 'speed', amountByPlayers: track(1, 1, 2, 2) },
      { type: 'custom', key: 'bloodOfBlooded', value: true }
    ]
  },
  50: {
    summary: '炸药 3/4/4/5；叛徒变构造体并翻面；数字轨道 2/3/3/4。',
    numberTrackByPlayers: track(2, 3, 3, 4),
    ops: [
      { type: 'placeToken', token: '炸药', room: 'nonLanding', countByPlayers: track(3, 4, 4, 5) },
      mon('construct', 'traitor'),
      { type: 'flipRoom', who: 'traitor' },
      { type: 'custom', key: 'devour_the_house', value: true }
    ]
  }
};

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const list = Array.isArray(raw) ? raw : (raw.scenarios || raw.official || []);
if (list.length !== 50) throw new Error('expected 50 scenarios, got ' + list.length);
const missing = [];
for (const s of list) {
  const plan = plans[s.no];
  if (!plan) { missing.push(s.no); continue; }
  s.setup = {
    ...(s.setup || {}),
    mode: 'scripted',
    summary: plan.summary,
    ...(plan.numberTrack !== undefined ? { numberTrack: plan.numberTrack } : {}),
    ...(plan.numberTrackByPlayers ? { numberTrackByPlayers: plan.numberTrackByPlayers } : {}),
    ops: plan.ops
  };
  delete s.setup.placements;
}
if (missing.length) throw new Error('missing setup plans: ' + missing.join(','));
fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n');
console.log('updated', FILE, 'scripted=', list.length);

#!/usr/bin/env node
/*
 * 2026-11-19 逐剧本 Review 修复数据补丁。
 * 只改 content/cabin/scenarios/official-3e.json，不生成运行时状态补丁。
 * 用法：node tools/apply-scenario-review-fixes.mjs && node tools/build-cabin-packs.mjs
 */
import fs from 'node:fs';

const file = 'content/cabin/scenarios/official-3e.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const byNo = Object.fromEntries(data.scenarios.map((s) => [s.no, s]));
const action = (no, key) => {
  const sc = byNo[no];
  if (!sc) throw new Error('missing scenario ' + no);
  sc.actions = sc.actions || [];
  let a = sc.actions.find((x) => x.key === key);
  if (!a) {
    a = { key, name: key, trait: 'known', where: 'any', once: 'turn', tiers: [{ at: 0, do: {} }] };
    sc.actions.push(a);
  }
  return a;
};
const setup = (no) => byNo[no].setup.ops;
const hasOp = (no, type, predicate = () => true) => setup(no).some((o) => o.type === type && predicate(o));

// #2 摧毁戒指必须有戒指；失败才降数字轨道，给叛徒备选目标一条合法路径。
const destroyRing = action(2, 'destroy_ring');
destroyRing.requireItem = '骨戒';
destroyRing.miss = { damage: { type: 'physical', amount: 6 }, teleportLanding: true, numberTrack: -1 };

// #6 证据必须消耗；目标不再靠空手刷。
const uncover = action(6, 'uncover');
uncover.requireTokenPrefix = '证据:';
uncover.consumeTokenPrefix = '证据:';
uncover.tiers = [{ at: 5, do: { evidence: 1 } }, { at: 0, do: { note: '什么也没找到' } }];

// #7 镜界破咒必须有镜界状态；Setup 记录 flag。
const breakSpell = action(7, 'break_spell');
breakSpell.requireFlag = 'mirrorRealm';
if (!hasOp(7, 'custom', (o) => o.key === 'mirrorRealm')) setup(7).push({ type: 'custom', key: 'mirrorRealm', value: true });

// #8 清洁只能在指定可清洁房间，且消耗污垢。
const cleanRoom = action(8, 'clean_room');
cleanRoom.where = 'rooms';
cleanRoom.rooms = ['血房', '焦屋', '坍塌房间', '杂物房', '地下墓穴'];
cleanRoom.requireToken = '污垢';
cleanRoom.consumeToken = '污垢';

// #10 金库必须有实体房间，出价只能在金库。
if (!hasOp(10, 'placeSpecialRoom', (o) => o.room === '金库')) setup(10).unshift({ type: 'placeSpecialRoom', room: '金库', floor: 'basement' });
const bid = action(10, 'bid');
bid.where = 'room';
bid.room = '金库';

// #11 烹饪消耗一份 Setup 食物；3–6 人目标按实际可获得的食物数量计算。
byNo[11].heroGoal = { type: 'tokens', token: '食物', need: 3, needByPlayers: { 3: 2, 4: 3, 5: 4, 6: 5 } };
const cook = action(11, 'cook');
cook.requireToken = '食物';
cook.consumeToken = '食物';

// #17 英雄目标同时要求带符文小妖精和叛徒；hunt 按 gremlin 过滤。
byNo[17].heroGoal = { type: 'allOf', goals: [
  { type: 'hunt', need: 3, monster: 'gremlin' },
  { type: 'killTraitor' }
] };
byNo[17].heroGoalText = '消灭带符文的 3 只小妖精，并杀死叛徒';

// #18 揭穿幻象需要幻象状态。
action(18, 'unmask').requireFlag = 'ringIllusion';

// #19 摧毁录像带必须消耗现场录像带。
const destroyTape = action(19, 'destroy_tape');
destroyTape.requireToken = '录像带';
destroyTape.consumeToken = '录像带';

// #20 音节必须实际收集；击败无名者仍是最终条件。
byNo[20].actions = byNo[20].actions || [];
if (!byNo[20].actions.some((a) => a.key === 'gather_syllable')) {
  byNo[20].actions.push({
    key: 'gather_syllable', name: '收集音节', trait: 'known', where: 'any', once: 'turn', side: 'hero',
    requireToken: '音节', consumeToken: '音节',
    tiers: [{ at: 0, do: { token: '音节' } }]
  });
}
byNo[20].heroGoal = { type: 'allOf', goals: [
  { type: 'tokens', token: '音节', need: 3, needByPlayers: { 3: 2, 4: 3, 5: 5, 6: 5 } },
  { type: 'killTraitor' }
] };

// #21 烧书是英雄目标的一部分。
byNo[21].heroGoal = { type: 'allOf', goals: [
  { type: 'killTraitor' },
  { type: 'custom', key: 'book_burned', text: '烧掉旧书' }
] };
const burnBook = action(21, 'burn_book');
burnBook.side = 'hero';
burnBook.requireAnyItem = '旧书';
burnBook.tiers = [{ at: 0, do: { destroyAnyItem: '旧书', actionFlag: 'bookBurned' } }];

// #23 关闭机器必须消耗现场的 ON 标记。
byNo[23].heroGoal = { type: 'tokens', token: '已关闭机器', need: 3, needByPlayers: { 3: 2, 4: 3, 5: 4, 6: 5 } };
const shutdown = action(23, 'shutdown');
shutdown.requireToken = 'ON';
shutdown.consumeToken = 'ON';

// #24 官方：火焰放在塔楼/雕像回廊/温室/墓园/地下洞穴/地下湖；拾起后由英雄携带，
// 目标是把所有精灵之火放到礼拜堂，而不是在任意房间生成计数。
byNo[24].heroGoal = {
  type: 'tokens', token: '精灵之火', need: 4,
  needByPlayers: { 3: 2, 4: 3, 5: 4, 6: 5 },
  room: '礼拜堂', requireGoalOnly: false
};
const seelieRooms = ['塔楼', '雕像回廊', '温室', '墓园', '地下洞穴', '地下湖'];
if (!hasOp(24, 'placeSpecialRoom', (o) => o.room === '墓园')) {
  byNo[24].setup.ops.splice(3, 0, { type: 'placeSpecialRoom', room: '墓园', floor: 'ground' });
}
const seelieOp = (byNo[24].setup.ops || []).find((o) => o.type === 'placeToken' && o.token === '精灵之火');
if (seelieOp) {
  const idx = byNo[24].setup.ops.indexOf(seelieOp);
  byNo[24].setup.ops[idx] = {
    type: 'placeTokenRooms', token: '精灵之火', rooms: seelieRooms,
    countByPlayers: { 3: 2, 4: 3, 5: 4, 6: 5 }
  };
}
const pickFlame = action(24, 'pickflame');
pickFlame.where = 'any';
delete pickFlame.symbol;
pickFlame.requireToken = '精灵之火';
pickFlame.consumeToken = '精灵之火';
pickFlame.requireNotCarrying = true;
pickFlame.tiers = [
  { at: 5, do: { carryToken: '精灵之火' } },
  { at: 0, do: { damage: { type: 'general', amount: 2 }, carryToken: '精灵之火' } }
];
let dropFlame = byNo[24].actions.find((a) => a.key === 'drop_flame');
if (!dropFlame) {
  dropFlame = { key: 'drop_flame', name: '放下火焰', where: 'any', once: 'turn', side: 'hero' };
  byNo[24].actions.push(dropFlame);
}

// #28 引爆必须在大白鲨所在房间。
action(28, 'detonate').requireMonsterType = 'shark';

// #30 戒指在秘密楼梯；Setup 生成该房间。
if (!hasOp(30, 'placeSpecialRoom', (o) => o.room === '秘密楼梯')) setup(30).unshift({ type: 'placeSpecialRoom', room: '秘密楼梯', floor: 'ground' });
const claimRing = action(30, 'claim_ring');
claimRing.where = 'room';
claimRing.room = '秘密楼梯';

// #33 砸相机必须场上真的有相机。
action(33, 'smash_camera').requireAnyItem = '魔法相机';

// #34 维度改写必须由玩家触发，不能在 Setup 后直接满足目标。
byNo[34].heroGoal = { type: 'custom', key: 'dimension_escape', text: '在维度改写生效时抵达入口大厅', room: '入口大厅' };
byNo[34].actions = byNo[34].actions || [];
if (!byNo[34].actions.some((a) => a.key === 'shift_dimension')) {
  byNo[34].actions.push({
    key: 'shift_dimension', name: '触发维度改写', trait: 'known', where: 'any', once: 'game', side: 'hero',
    tiers: [{ at: 0, do: { actionFlag: 'dimensionActive' } }]
  });
}

// #35 焚烧虫巢必须消耗现场虫巢；给英雄一份盐。
const burnNest = action(35, 'burn_nest');
burnNest.requireToken = '虫巢';
burnNest.consumeToken = '虫巢';
burnNest.requireAnyItem = '盐';
const saltOp = setup(35).find((o) => o.type === 'grantItem' && o.item === '盐');
if (saltOp) saltOp.to = 'heroes';
else setup(35).push({ type: 'grantItem', item: '盐', to: 'heroes' });

// #36 文本是 4 个幽灵，Setup 补足到 4 个。
const ghostOp = setup(36).find((o) => o.type === 'placeMonster' && o.monster === 'ghost');
if (ghostOp) ghostOp.countByPlayers = { 3: 4, 4: 4, 5: 4, 6: 4 };
if (!hasOp(36, 'ensureSymbolTiles', (o) => o.symbol === 'event')) setup(36).unshift({ type: 'ensureSymbolTiles', symbol: 'event', count: 4 });

// 五个仪式型剧本的地点/道具前置。
const ensureRoom = (no, room, floor) => {
  if (!hasOp(no, 'placeSpecialRoom', (o) => o.room === room)) setup(no).push({ type: 'placeSpecialRoom', room, floor });
};

// #4 目标在仪式房；确保剧本开始时仪式房真实存在。
ensureRoom(4, '仪式房', 'ground');

// #16 必须先把遗骸收进仪式，才能在墓园安葬。
byNo[16].actions = byNo[16].actions || [];
if (!byNo[16].actions.some((a) => a.key === 'collect_relic')) {
  byNo[16].actions.push({
    key: 'collect_relic', name: '收集遗骸', trait: 'sanity', where: 'any', once: 'turn', side: 'hero',
    requireToken: '遗骸', consumeToken: '遗骸',
    tiers: [{ at: 0, do: { token: '已收集遗骸' } }]
  });
}
byNo[16].heroGoal = {
  type: 'ritual', room: '墓园', trait: 'sanity', diff: 5, need: 1,
  requireToken: '已收集遗骸', requireGoalOnly: true,
  requireCountByPlayers: { 3: 4, 4: 5, 5: 6, 6: 7 }
};

// #25 的四项法术材料必须在场上；仪式判定需要它们。
ensureRoom(25, '军械库', 'ground');
if (!hasOp(25, 'placeToken', (o) => o.token === '法术材料')) {
  setup(25).push({ type: 'placeToken', token: '法术材料', room: 'heroTiles', count: 4 });
}
byNo[25].heroGoal = { type: 'ritual', room: '军械库', trait: 'sanity', diff: 5, need: 2, requireToken: '法术材料', requireCount: 4 };

// #26 祭坛必须真实在场。
byNo[26].heroGoal = { type: 'ritual', room: '仪式房', trait: 'sanity', diff: 4, need: 3, requireToken: '祭坛', requireCount: 1 };

// #29 仪式房与妖精都必须真实存在。
ensureRoom(29, '仪式房', 'ground');
byNo[29].heroGoal = { type: 'ritual', room: '仪式房', trait: 'known', diff: 5, need: 3, requireMonsterType: 'fae' };

// #40 “所有双胞胎”按人数计算，不能固定 5。
byNo[40].heroGoal = { type: 'hunt', need: 5, needByPlayers: { 3: 2, 4: 3, 5: 4, 6: 5 }, monster: 'twins' };

// #41 过载必须在发电机所在房间。
action(41, 'overload').requireMonsterType = 'generator';

// #42 驱魔必须有幽灵；Setup 放 3 个幽灵，恶魔犬保留。
if (!hasOp(42, 'placeMonster', (o) => o.monster && o.monster.key === 'ghost')) {
  setup(42).push({
    type: 'placeMonster', room: 'eventTiles', count: 3,
    monster: { key: 'ghost', name: '幽灵', count: 3, speed: 3, might: 3, sanity: 3, known: 4, attack: 'sanity', noStun: true, noAttack: false, oneHit: false, damageReduce: false, ignoreDoors: false, attackOnly: '', rule: '不可被攻击' }
  });
}
action(42, 'exorcise').requireMonsterType = 'ghost';

// #44 官方：5 枚火焰标记是「set aside」的全局供应，点火可在任意板块进行。
const setfire = action(44, 'setfire');
delete setfire.requireToken;
delete setfire.consumeToken;
setfire.requireSupplyToken = '火焰';
setfire.consumeSupplyToken = '火焰';

// #46 英雄必须持解药并击败毛发怪。
byNo[46].heroGoal = { type: 'custom', key: 'hair_with_antidote', text: '持真解药击败巨型毛发怪', room: '入口大厅' };
if (!hasOp(46, 'grantItem', (o) => o.item === '解药')) setup(46).push({ type: 'grantItem', item: '解药', to: 'heroes' });

// #47 官方：传送门可以出现在任意板块；关闭传送门本身不解除被困，
// 必须另做「Escape the Portal」判定才能把英雄标记交给叛徒并脱困。
const seal = action(47, 'seal');
seal.where = 'any';
delete seal.symbol;
delete seal.trait;
seal.traits = ['known', 'sanity'];
seal.bonusSameRoomHero = 2;
seal.requireToken = '传送门';
seal.consumeToken = '传送门';
seal.tiers = [{ at: 4, do: { token: '已关闭传送门' } }, { at: 0, do: { damage: { type: 'mental', amount: 1 } } }];
let escapePortal = byNo[47].actions.find((a) => a.key === 'escape_portal');
if (!escapePortal) {
  escapePortal = {
    key: 'escape_portal', name: '摆脱传送门', trait: 'known', where: 'any', once: 'turn',
    side: 'hero', requireToken: '传送门', requireTrapped: true,
    tiers: [{ at: 6, do: { untrap: true, giveHeroToken: true } }, { at: 0, do: { gain: { trait: 'knowledge', amount: 1 } } }]
  };
  byNo[47].actions.push(escapePortal);
}
Object.assign(escapePortal, {
  trait: 'known', where: 'any', requireToken: '传送门', requireTrapped: true,
  tiers: [{ at: 6, do: { untrap: true, giveHeroToken: true } }, { at: 0, do: { gain: { trait: 'knowledge', amount: 1 } } }]
});

// #48 头骨必须被英雄带到恐慌室；Setup 给叛徒实体头骨，英雄可取走。
byNo[48].heroGoal = { type: 'custom', key: 'skull_to_panic', text: '把头骨带到恐慌室', room: '恐慌室' };
if (!hasOp(48, 'grantItem', (o) => o.item === '头骨')) setup(48).push({ type: 'grantItem', item: '头骨', to: 'traitor' });
const takeSkull = action(48, 'take_skull');
takeSkull.side = 'hero';
takeSkull.requireAnyItem = '头骨';
takeSkull.tiers = [{ at: 0, do: { takeAnyItem: '头骨' } }];

// #49 击败恶魔并烧掉契约；Setup 给叛徒实体契约。
byNo[49].heroGoal = { type: 'allOf', goals: [
  { type: 'killTraitor' },
  { type: 'custom', key: 'contract_burned', text: '烧掉契约' }
] };
if (!hasOp(49, 'grantItem', (o) => o.item === '契约')) setup(49).push({ type: 'grantItem', item: '契约', to: 'traitor' });
const burnContract = action(49, 'burn_contract');
burnContract.side = 'hero';
burnContract.requireAnyItem = '契约';
burnContract.tiers = [{ at: 0, do: { destroyAnyItem: '契约', actionFlag: 'contractBurned' } }];

// #7 镜界破咒：必须逐项猜出属性 / 预兆 / 房间，三中三才放人；行动不再靠固定阶梯自动发标记。
breakSpell.tiers = [{ at: 0, do: {} }];
breakSpell.requireFlag = 'mirrorRealm';

// #17 DIE 纸条：增加合法传递行动，必须交给同房间的另一位英雄。
const passNote = action(17, 'pass_note');
passNote.name = '把 DIE 纸条传下去';
passNote.side = 'hero';
passNote.where = 'any';
passNote.once = 'turn';
passNote.tiers = [{ at: 0, do: {} }];

// #18 成功揭穿幻象时让真身回到屋内，而不是只洗干净一个幻象标记。
const unmask = action(18, 'unmask');
unmask.tiers = [
  { at: 5, do: { revealTrueBody: true } },
  { at: 0, do: { damage: { type: 'mental', amount: 1 }, note: '幻象换了一张脸，你又一次认错人' } }
];

// #22 地下行动只是从入口大厅逃出，不需要额外携带物品。
if (byNo[22] && byNo[22].heroGoal) byNo[22].heroGoal.need = 0;

// #33 幽灵摄影师必须被力量攻击才可消灭。
byNo[33].monster.attackOnly = 'might';

// #50 官方：炸药是「set aside」的全局供应，可在任意板块安放。
const plantCharge = action(50, 'plant_charge');
delete plantCharge.requireToken;
delete plantCharge.consumeToken;
plantCharge.requireSupplyToken = '炸药';
plantCharge.consumeSupplyToken = '炸药';

// 官方卡面 #25：四种属性材料必须去对应板块找，集齐后只需一次 5+ 神智判定。
const findIngredient = (key, name, trait, rooms) => {
  const a = action(25, key);
  a.name = name; a.trait = trait; a.where = 'rooms'; a.rooms = rooms; a.once = 'turn';
  a.tiers = [{ at: 4, do: { token: '法术材料' } }, { at: 0, do: {} }];
};
findIngredient('find_sanity', '寻找神智材料', 'sanity', ['手术室', '墓园', '血房']);
findIngredient('find_might', '寻找力量材料', 'might', ['食品储藏室', '标本室', '餐厅']);
findIngredient('find_known', '寻找知识材料', 'known', ['熔炉房', '天文台', '图书室']);
findIngredient('find_speed', '寻找速度材料', 'speed', ['地下湖', '温室', '厨房']);
byNo[25].heroGoal = { type: 'ritual', room: '军械库', rooms: ['军械库', '仪式房'], trait: 'sanity', diff: 5, need: 1, requireToken: '法术材料', requireCount: 4 };
ensureRoom(25, '仪式房', 'ground');
// 材料不再由 Setup 直接放在英雄板块，改为必须通过四次寻找行动获得。
setup(25).forEach((o, i) => { if (o.type === 'placeToken' && o.token === '法术材料') setup(25).splice(i, 1); });

// 官方卡面 #41：目标按人数对应 3/3/4/5 台发电机全部过载；房子不可攻击、不可击晕。
byNo[41].heroGoal = { type: 'tokens', token: '过载发电机', need: 3, needByPlayers: { 3: 3, 4: 3, 5: 4, 6: 5 } };
if (byNo[41].monster) {
  byNo[41].monster.noAttack = true;
  byNo[41].monster.noStun = true;
  byNo[41].monster.rule = '不可攻击或击晕；只攻击 ON 发电机所在或相邻板块上的英雄';
}
setup(41).forEach((o) => {
  if (o.type === 'placeMonster' && o.monster && typeof o.monster === 'object' && o.monster.key === 'generator') {
    o.monster.on = true;
  }
});
const trap41 = action(41, 'disable_trap');
trap41.name = '解除陷阱';
trap41.trait = 'speed';
trap41.diff = 6;
trap41.requireToken = '陷阱';
trap41.consumeToken = '陷阱';
trap41.tiers = [{ at: 6, do: { numberTrack: 1, note: '解除陷阱并把数字轨道 +1' } }, { at: 0, do: {} }];
const sabotage41 = action(41, 'sabotage');
sabotage41.name = '破坏电子设备';
sabotage41.trait = 'known';
sabotage41.diff = 5;
sabotage41.tiers = [{ at: 5, do: { token: '搜查', numberTrack: 1 } }, { at: 0, do: {} }];
const overload41 = action(41, 'overload');
overload41.trait = 'none';
overload41.rollByNumberTrack = true;
overload41.tiers = [{ at: 5, do: { token: '过载发电机' } }, { at: 0, do: { note: '结束回合' } }];

// #24 拾火必须消耗现场火焰，避免同一个火焰标记被重复计数。
const pickflame24 = action(24, 'pickflame');
pickflame24.consumeToken = '精灵之火';

// #42 驱魔必须真正移除一只幽灵；否则同一只幽灵可以反复驱魔。
const exorcise42 = action(42, 'exorcise');
exorcise42.tiers = [{ at: 4, do: { token: '被驱魔的幽灵', removeMonster: 'ghost' } }, { at: 0, do: {} }];

// #37 关闭机器人必须校验机器人存在，并在成功后移除该机器人。
const disable37 = action(37, 'disable_robot');
disable37.requireMonsterType = 'security';
disable37.tiers = [{ at: 4, do: { token: '已关闭机器人', removeMonster: 'security' } }, { at: 0, do: { damage: { type: 'physical', amount: 1 } } }];



// 官方卡面 #43：躲藏与魅惑野兽；躲藏后不能被狼人攻击，移动会失去躲藏。
byNo[43].actions = byNo[43].actions || [];
if (!byNo[43].actions.some((a) => a.key === 'hide')) {
  byNo[43].actions.push({
    key: 'hide', name: '躲藏', trait: 'speed', where: 'any', once: 'turn', side: 'hero',
    tiers: [{ at: 5, do: { hideSelf: true } }, { at: 0, do: {} }]
  });
}
if (!byNo[43].actions.some((a) => a.key === 'charm')) {
  byNo[43].actions.push({
    key: 'charm', name: '魅惑野兽', trait: 'sanity', where: 'any', once: 'turn', side: 'hero',
    requireMonsterType: 'werewolf',
    tiers: [{ at: 8, do: { stunMonster: 'werewolf' } }, { at: 5, do: {} }, { at: 0, do: { damage: { type: 'physical', amount: 1 } } }]
  });
}

// 官方卡面 #43：目标不是撑过固定轮数，而是把数字轨道拖到 0，让黎明到来。
byNo[43].heroGoal = { type: 'custom', key: 'dawn', text: '数字轨道归零，撑到黎明' };
byNo[43].heroGoalText = '把数字轨道拖到 0，撑到黎明';
setup(43).forEach((o) => { if (o.type === 'custom' && o.key === 'surviveUntilDawn') o.key = 'dawn'; });

// 官方卡面 #4：诅咒知识是英雄携带的标记；净化房间会留下火焰；仪式按现场火焰、
// 仪式房和诅咒知识叠加加值；恶魔中介在怪物回合结束伤害同房间英雄。
const gainCurse4Final = action(4, 'gain_curse');
gainCurse4Final.tiers = [{ at: 5, do: { grantKnowledgeToken: true } }, { at: 0, do: {} }];
delete gainCurse4Final.token;
const cleanse4Final = action(4, 'cleanse_room');
cleanse4Final.tiers = [{ at: 6, do: { token: '火焰' } }, { at: 0, do: {} }];
cleanse4Final.bonusKnowledgeToken = 2;
cleanse4Final.forbidToken = '火焰';
delete cleanse4Final.requireToken;
delete cleanse4Final.consumeToken;
const ward4Final = action(4, 'prepare_ward');
ward4Final.tiers = [{ at: 6, do: { wardToken: true } }, { at: 0, do: {} }];
ward4Final.bonusKnowledgeToken = 2;
delete ward4Final.token;
const ritual4Final = action(4, 'perform_ritual');
ritual4Final.bonusPerRoomToken = '火焰';
ritual4Final.bonusRoom = '仪式房';
ritual4Final.bonusKnowledgeToken = 2;
ritual4Final.requireMonsterHere = true;
delete ritual4Final.extraDice;
if (byNo[4].monster) byNo[4].monster.noStun = true;
if (!hasOp(4, 'setAsideToken')) {
  setup(4).push({ type: 'setAsideToken', token: '火焰', countByPlayers: { 3: 3, 4: 4, 5: 5, 6: 6 } });
}

// 官方卡面 #25：叛徒从一开始就穿着铠甲；铠甲被英雄夺走后会诅咒双方。
// 借走时间不是官方行动，移除。
if (!hasOp(25, 'custom', (o) => o.key === 'armorStart')) {
  setup(25).push({ type: 'custom', key: 'armorStart', value: 4 });
}
let armorOps = setup(25).filter((o) => o.type === 'custom' && o.key === 'armorStart');
while (armorOps.length > 1) {
  const i = setup(25).findIndex((o) => o.type === 'custom' && o.key === 'armorStart');
  setup(25).splice(i, 1);
  armorOps.pop();
}
byNo[25].actions = byNo[25].actions.filter((a) => a.key !== 'borrow');

// 官方卡面 #44：5 枚火焰标记置于一旁；目标是把整栋房子点燃，点火不再消耗全局火焰。
const setfire44Final = action(44, 'setfire');
delete setfire44Final.requireSupplyToken;
delete setfire44Final.consumeSupplyToken;
setfire44Final.tiers = [{ at: 4, do: { burnRoom: true } }, { at: 0, do: {} }];
byNo[44].heroGoal = { type: 'custom', key: 'burn_every_room', text: '把整栋房子烧起来' };
byNo[44].heroGoalText = '把整栋房子烧起来';
byNo[50].heroGoal = { type: 'rig', token: '炸药', need: 3, perFloor: true, needByPlayers: { 3: 3, 4: 4, 5: 4, 6: 5 } };
byNo[50].heroGoalText = '把所有炸药安放好，且每层至少一枚';
setup(44).forEach((o, i) => {
  if (o.type === 'placeToken' && o.token === '火焰') setup(44).splice(i, 1);
});
if (!hasOp(44, 'setAsideToken')) setup(44).push({ type: 'setAsideToken', token: '火焰', count: 5 });

// 官方卡面 #50：炸药是置于一旁的供应；安放前必须先烧掉一件物品或预兆。
const plant50Final = action(50, 'plant_charge');
plant50Final.traits = ['speed', 'known'];
plant50Final.requireBurnable = true;
plant50Final.requireExplosive = true;
plant50Final.consumeItemBeforeRoll = true;
plant50Final.tiers = [{ at: 6, do: { placeExplosive: true } }, { at: 0, do: {} }];
delete plant50Final.requireSupplyToken;
delete plant50Final.consumeSupplyToken;
setup(50).forEach((o, i) => {
  if (o.type === 'placeToken' && o.token === '炸药') setup(50).splice(i, 1);
});
if (!hasOp(50, 'setAsideToken')) setup(50).push({ type: 'setAsideToken', token: '炸药', countByPlayers: { 3: 3, 4: 4, 5: 4, 6: 5 } });

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('scenario review data patched:', data.scenarios.length);

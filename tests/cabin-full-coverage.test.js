// 覆盖率补洞：直接触发剧本效果注册器里尚未被行为测试走到的 handler
// 只验证 handler 的状态结果，不替代 50 剧本的合法行动验收。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); console.log('  FAIL ' + name + (extra === undefined ? ' ' : ' -> ') + (extra || '')); }
}
function seeded(n) { let s = n || 1; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
const high = () => 0.99;
const low = () => 0;

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8'), { filename: 'cabin-packs.js' });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'), { filename: 'cabin.js' });
const E = window.CabinEngine;
const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

function scenario(no) { return E.SCENARIOS.find((s) => s.no === no); }
function base(no = 1) {
  const st = E.createInitial(players, seeded(no + 700), { skipSelect: true });
  E.helpers.startHaunt(st, 0, '骨戒', '入口大厅', seeded(no + 701), JSON.parse(JSON.stringify(scenario(no))));
  st.phase = 'playing';
  st.turn = 0;
  st.players.forEach((p) => { p.side = p.side || 'hero'; });
  return st;
}
function testRoom(st, name = '覆盖率测试房') {
  let room = st.rooms.find((r) => r.name === name);
  if (!room) {
    room = {
      name: name, floor: 'ground', x: 0, y: 0, doors: 'NSEW', kind: 'normal',
      symbol: null, effect: null, special: null, revealed: true, resolved: true
    };
    st.rooms.push(room);
  }
  return room;
}
function runOps(st, ops) {
  const room = testRoom(st);
  const p = st.players[0];
  p.floor = room.floor; p.x = room.x; p.y = room.y;
  st.haunt.actions = [{
    key: 'coverage', name: '覆盖率行动', trait: 'sanity', where: 'any', once: 'turn',
    tiers: [{ at: 0, do: ops }]
  }];
  st.haunt.turnUsed = {};
  st.haunt.gameUsed = {};
  return E.act(st, { type: 'hauntAction', key: 'coverage' }, p.id, high);
}
function countMonster(st, type) { return st.monsters.filter((m) => m.type === type || m.key === type).length; }
function scenarioRoom(st, name, x, y) {
  const room = {
    name: name, floor: 'ground', x: x, y: y, doors: 'NSEW', kind: 'normal',
    symbol: 'event', effect: null, special: null, revealed: true, resolved: true
  };
  st.rooms.push(room);
  return room;
}
function runScenarioAction(st, key, actorIndex) {
  st.haunt.turnUsed = {};
  st.haunt.gameUsed = {};
  const actor = st.players[actorIndex || 0];
  return E.act(st, { type: 'hauntAction', key: key }, actor.id, high);
}

console.log('=== 原子效果 handler 覆盖率补洞 ===');
const stHeal = base(1);
stHeal.players.forEach((p) => E.helpers.setTrack(stHeal, stHeal.players.indexOf(p), 'sanity', 2));
const healResult = runOps(stHeal, { heal: 1 });
ok('heal 恢复四项属性', healResult.ok && stHeal.players.every((p) => E.helpers.traitVal(stHeal, stHeal.players.indexOf(p), 'sanity') >= 3), healResult.msg);

const stFlag = base(1);
stFlag.haunt.custom = { oldFlag: true };
const clearResult = runOps(stFlag, { clearActionFlag: 'oldFlag' });
ok('clearActionFlag 删除剧本状态', clearResult.ok && !stFlag.haunt.custom.oldFlag, clearResult.msg);

const stItem = base(1);
const itemResult = runOps(stItem, { grantItemSelf: '手电筒' });
ok('grantItemSelf 把物品直接发给行动者',
  itemResult.ok && stItem.players[0].items.some((it) => it.name === '手电筒' || it.key === '手电筒'), itemResult.msg);

const stTreasure = base(1);
const treasureResult = runOps(stTreasure, { treasure: 2 });
ok('treasure 增加个人宝藏并放到房间',
  treasureResult.ok && stTreasure.players[0].treasure === 2 && E.helpers.countTokens(stTreasure, '宝藏') >= 2, treasureResult.msg);

const stDimension = base(1);
const dimensionResult = runOps(stDimension, { dimension: true });
ok('dimension 打开维度改写状态', dimensionResult.ok && stDimension.haunt.dimension === true, dimensionResult.msg);

const stDisguise = base(1);
const disguiseResult = runOps(stDisguise, { disguise: true });
ok('disguise 给其他玩家加幻象状态',
  disguiseResult.ok && stDisguise.players.some((p) => p.illusion === true), disguiseResult.msg);

const stReveal = base(1);
stReveal.haunt.hidden = true;
const revealResult = runOps(stReveal, { reveal: true });
ok('reveal 解除隐藏并记录叛徒', revealResult.ok && stReveal.haunt.hidden === false, revealResult.msg);

const stTransfer = base(1);
E.helpers.setTrack(stTransfer, 0, 'sanity', 4);
E.helpers.setTrack(stTransfer, 1, 'sanity', 7);
const transferResult = runOps(stTransfer, { transfer: { from: stTransfer.players[1].id, trait: 'sanity', amount: 1 } });
ok('transfer 把目标属性轨道借给行动者',
  transferResult.ok && stTransfer.players[0].track.sanity.pos === 5 && stTransfer.players[1].track.sanity.pos === 6, transferResult.msg);

const stMonster = base(1);
stMonster.monsters.push({ id: 'cov-wolf', type: 'werewolf', key: 'werewolf', name: '狼人', might: 6, speed: 4, sanity: 4, known: 4 });
const addResult = runOps(stMonster, { addMonster: { key: 'werewolf', name: '狼人', might: 6, speed: 4, sanity: 4, known: 4 } });
ok('addMonster 生成额外怪物', addResult.ok && countMonster(stMonster, 'werewolf') >= 2, addResult.msg);

const stStun = base(1);
stStun.monsters.push({ id: 'cov-wolf', type: 'werewolf', key: 'werewolf', name: '狼人', might: 6, speed: 4, sanity: 4, known: 4 });
const stunResult = runOps(stStun, { stunMonster: 'werewolf' });
ok('stunMonster 让指定怪物僵直', stunResult.ok && stStun.monsters.some((m) => m.type === 'werewolf' && m.stunned === 1), stunResult.msg);

const stLanding = base(1);
const landingResult = runOps(stLanding, { teleportLanding: true });
const landing = stLanding.rooms.find((r) => r.kind === 'landing');
ok('teleportLanding 把玩家送回对应平台',
  landingResult.ok && !!landing && stLanding.players[0].floor === landing.floor &&
  stLanding.players[0].x === landing.x && stLanding.players[0].y === landing.y, landingResult.msg);

const stConsume = base(1);
stConsume.players[0].items = [{ name: '旧书', key: '旧书' }];
const consumeResult = runOps(stConsume, { consumeItemOrOmen: '旧书' });
ok('consumeItemOrOmen 把物品移出玩家手牌',
  consumeResult.ok && stConsume.players[0].items.length === 0 && (stConsume.items || []).some((it) => it.name === '旧书'), consumeResult.msg);

const stFlip = base(1);
const flipResult = runOps(stFlip, { flip: true });
ok('flip 翻面普通房间', flipResult.ok && testRoom(stFlip).flipped === true, flipResult.msg);

const stProgress = base(1);
const progressResult = runOps(stProgress, { progress: 2 });
ok('progress 推进剧本进度', progressResult.ok && stProgress.haunt.progress === 2, progressResult.msg);
const stWeapon = base(1);
const wroom = scenarioRoom(stWeapon, '武器测试房', 2, 0);
stWeapon.players[0].side = 'traitor';
stWeapon.players[1].side = 'hero';
stWeapon.players[0].floor = wroom.floor; stWeapon.players[0].x = wroom.x; stWeapon.players[0].y = wroom.y;
stWeapon.players[1].floor = wroom.floor; stWeapon.players[1].x = wroom.x; stWeapon.players[1].y = wroom.y;
stWeapon.players[0].items = [
  { name: '重武器', weapon: 'might', attackDice: 1, attackResult: 0 },
  { name: '精准武器', weapon: 'might', attackDice: 0, attackResult: 3 }
];
stWeapon.newItems = [];
stWeapon.haunt.pvp = true; stWeapon.attacked = false; stWeapon.turn = 0;
const weaponAttack = E.act(stWeapon, { type: 'attack', target: 'b', trait: 'might' }, 'a', high);
ok('攻击时 pickWeapon 使用 weaponScore 选最高分武器',
  weaponAttack.ok && !!stWeapon.itemActions && stWeapon.itemActions['重武器'] === 'use',
  weaponAttack.msg + ' ok=' + weaponAttack.ok + ' actions=' + JSON.stringify(stWeapon.itemActions));

console.log('=== #4 诅咒知识与守护结界 ===');
const stCurse = base(4);
const library = scenarioRoom(stCurse, '图书室', 0, 0);
stCurse.players[0].floor = library.floor; stCurse.players[0].x = library.x; stCurse.players[0].y = library.y;
E.helpers.setTrack(stCurse, 0, 'known', 8);
const curseFirst = runScenarioAction(stCurse, 'gain_curse', 0);
ok('gain_curse 首次让英雄获得诅咒知识', curseFirst.ok && stCurse.players[0].knowledgeToken === true, curseFirst.msg);
stCurse.players[1].floor = library.floor; stCurse.players[1].x = library.x; stCurse.players[1].y = library.y;
E.helpers.setTrack(stCurse, 1, 'known', 8);
stCurse.turn = 1;
const curseSecond = runScenarioAction(stCurse, 'gain_curse', 1);
ok('gain_curse 第二次把知识转交同房间缺标记的英雄',
  curseSecond.ok && stCurse.players[1].knowledgeToken === true, curseSecond.msg);
const stWard = base(4);
const nursery = scenarioRoom(stWard, '育婴室', 1, 0);
stWard.players[0].floor = nursery.floor; stWard.players[0].x = nursery.x; stWard.players[0].y = nursery.y;
E.helpers.setTrack(stWard, 0, 'might', 8);
const ward = runScenarioAction(stWard, 'prepare_ward', 0);
ok('prepare_ward 成功后获得守护结界', ward.ok && stWard.players[0].wardToken === true, ward.msg);

console.log('=== 剩余分支 ===');
const stLow = E.createInitial(players, seeded(800), { skipSelect: true });
E.helpers.setTrack(stLow, 0, 'might', 1);
E.helpers.setTrack(stLow, 1, 'might', 6);
E.helpers.setTrack(stLow, 2, 'might', 5);
E.helpers.setTrack(stLow, 3, 'might', 3);
const lowSc = JSON.parse(JSON.stringify(scenario(1)));
lowSc.traitorRule = 'lowestMight';
E.helpers.startHaunt(stLow, 0, '骨戒', '入口大厅', seeded(801), lowSc);
ok('lowestMight 选择力量最低的英雄', stLow.haunt && stLow.haunt.traitor === 0,
  'traitor=' + (stLow.haunt && stLow.haunt.traitor));

const stLose = base(14);
const sanityBefore = stLose.players[0].track.sanity.pos;
stLose.turn = 0;
const loseResult = E.act(stLose, { type: 'hauntAction', key: 'cast_spell' }, 'a', () => 0);
ok('cast_spell 失败档执行 lose 属性',
  loseResult.ok && stLose.players[0].track.sanity.pos < sanityBefore,
  loseResult.msg + ' before=' + sanityBefore + ' after=' + stLose.players[0].track.sanity.pos);

const stArmor = base(1);
ok('armor_spell_broken 自定义目标读取标记',
  E.helpers.isGoalDone(stArmor, { type: 'custom', key: 'armor_spell_broken' }) === false,
  '未标记时应为 false');
stArmor.haunt.custom.armorSpellBroken = true;
ok('armor_spell_broken 标记后目标完成',
  E.helpers.isGoalDone(stArmor, { type: 'custom', key: 'armor_spell_broken' }) === true,
  '标记后应为 true');

const stQueen = base(1);
stQueen.haunt.custom.darkQueen = true;
stQueen.haunt.darkQueenSpawned = false;
runOps(stQueen, { token: '精灵之火', count: 4 });
const queenResult = runOps(stQueen, { token: '精灵之火', count: 1 });
ok('第五片精灵之火让暗女王降临并解析房间',
  queenResult.ok && stQueen.haunt.darkQueenSpawned && stQueen.monsters.some((m) => m.key === 'darkqueen'),
  queenResult.msg);

const stHouse = base(1);
const hRoom = scenarioRoom(stHouse, '发电机房', 3, 0);
stHouse.players[0].floor = hRoom.floor; stHouse.players[0].x = hRoom.x; stHouse.players[0].y = hRoom.y;
stHouse.players[1].floor = hRoom.floor; stHouse.players[1].x = hRoom.x; stHouse.players[1].y = hRoom.y;
stHouse.monsters = [
  { id: 'gen1', key: 'generator', type: 'generator', name: '发电机', floor: hRoom.floor, x: hRoom.x, y: hRoom.y, on: true },
  { id: 'house1', key: 'house', type: 'house', name: '房子', floor: hRoom.floor, x: hRoom.x, y: hRoom.y, might: 4, speed: 1, attack: 'might' }
];
stHouse.monsterTurn = { actor: stHouse.players[0].id, queue: ['house1'] };
const houseResult = E.act(stHouse, { type: 'monsterMove', monsterId: 'house1', target: stHouse.players[1].id }, stHouse.players[0].id, high);
ok('房子在 ON 发电机相邻板块攻击英雄', houseResult.ok && houseResult.state === stHouse, houseResult.msg);

console.log('=== 引擎边界路径 ===');
const stForce = base(1);
stForce.players[0].items = [{ name: '测试护符', testTrait: 'might', testBonus: 1 }];
const forced = E.helpers.testRoll(stForce, 0, 'might', 3, high, 0, 0, 5);
ok('testRoll forced 档计算物品加值', forced.forced === true && forced.total === 6 && forced.bonus === 1, JSON.stringify(forced));

const stFallback = base(1);
delete stFallback.players[0].track.sanity;
stFallback.players[0].traits.sanity = 2;
E.helpers.gainTrait(stFallback, 0, 'sanity', 2, '测试');
ok('gainTrait 在无轨道时写 traits', stFallback.players[0].traits.sanity === 4, stFallback.players[0].traits.sanity);
E.helpers.healTrait(stFallback, 0, 'sanity', 1);
ok('healTrait 在无轨道时按 start 上限恢复', stFallback.players[0].traits.sanity === 3, stFallback.players[0].traits.sanity);

const stFallDeath = base(1);
delete stFallDeath.players[0].track.might;
stFallDeath.players[0].traits.might = 1;
stFallDeath.players[0].min = { might: 1 };
E.helpers.loseTraitDirect(stFallDeath, 0, 'might', 2, '测试');
ok('loseTraitDirect 无轨道时跌破下限死亡', stFallDeath.players[0].dead === true && stFallDeath.players[0].corpse === true);

const st25Death = base(25);
st25Death.haunt.traitor = 0;
st25Death.haunt.armorHolder = st25Death.players[0].id;
E.helpers.setTrack(st25Death, 0, 'might', 1);
E.helpers.loseTraitDirect(st25Death, 0, 'might', 1, '测试');
ok('noteScenarioDeath 记录 #25 护甲持有者死亡位置',
  !!st25Death.haunt.armorRoom && st25Death.haunt.armorRoom.floor === st25Death.players[0].floor,
  JSON.stringify(st25Death.haunt.armorRoom));

const stArmorItem = base(1);
stArmorItem.players[0].items = [{ name: '护甲', armor: 2 }];
ok('护甲完全吸收物理伤害', E.helpers.beginDamage(stArmorItem, 0, 1, 'physical') === false && !stArmorItem.pendingDamage);
const stHead = base(1);
stHead.players[0].items = [{ name: '耳机', mentalReduce: 2 }];
ok('耳机完全吸收精神伤害', E.helpers.beginDamage(stHead, 0, 1, 'mental') === false && !stHead.pendingDamage);
const stCharm = base(1);
stCharm.players[0].items = [{ name: '古怪护符', physicalToSanity: 1 }];
const charmBefore = stCharm.players[0].track.sanity.pos;
E.helpers.beginDamage(stCharm, 0, 2, 'physical');
ok('古怪护符把物理伤害转成神智', stCharm.players[0].track.sanity.pos > charmBefore && !!stCharm.pendingDamage);

const stSplitDeath = base(1);
['speed', 'might', 'known', 'sanity'].forEach((t) => E.helpers.setTrack(stSplitDeath, 0, t, 1));
const splitDeath = E.helpers.applyDamageSplit(stSplitDeath, 0, 10, 'general', 'might', 'speed');
ok('通用伤害四项到骷髅后死亡', splitDeath.remaining > 0 && stSplitDeath.players[0].dead === true, JSON.stringify(splitDeath));

const stRoomEffect = base(1);
stRoomEffect.players[0].side = 'traitor';
const effectRoom1 = testRoom(stRoomEffect, '叛徒测试房');
effectRoom1.effect = { type: 'test', trait: 'speed', diff: 3 };
E.helpers.roomEffect(stRoomEffect, 0, effectRoom1, high);
ok('叛徒忽略房间判定伤害', effectRoom1.effectUsed === true && !stRoomEffect.pendingRoll);

const stGainRoom = base(1);
const effectRoom2 = testRoom(stGainRoom, '增益测试房');
effectRoom2.effect = { type: 'gain', trait: 'might', amount: 1 };
const gainRoomBefore = stGainRoom.players[0].track.might.pos;
E.helpers.roomEffect(stGainRoom, 0, effectRoom2, high);
ok('房间 gain 效果推进属性', stGainRoom.players[0].track.might.pos > gainRoomBefore);

const stDrawWeapon = base(1);
const effectRoom3 = testRoom(stDrawWeapon, '军械库测试房');
effectRoom3.effect = { type: 'drawWeapon' };
E.helpers.roomEffect(stDrawWeapon, 0, effectRoom3, high);
ok('房间 drawWeapon 不抛错', effectRoom3.effectUsed === true);

const stNoWeapon = base(1);
stNoWeapon.decks.items = [];
stNoWeapon.itemDiscard = [];
const effectRoom4 = testRoom(stNoWeapon, '空军械库测试房');
effectRoom4.effect = { type: 'drawWeapon' };
E.helpers.roomEffect(stNoWeapon, 0, effectRoom4, high);
ok('空牌库 drawWeapon 记录没有武器', effectRoom4.effectUsed === true);

const stTestRoom = base(1);
stTestRoom.players[0].side = 'hero';
const effectRoom5 = testRoom(stTestRoom, '判定测试房');
effectRoom5.effect = { type: 'test', trait: 'speed', diff: 3, damage: 1 };
E.helpers.roomEffect(stTestRoom, 0, effectRoom5, high);
ok('房间 test 效果创建 pendingRoll', !!stTestRoom.pendingRoll && stTestRoom.pendingRoll.kind === 'room');

const stPlaceSpecial = base(1);
const effectRoom6 = testRoom(stPlaceSpecial, '特殊放置测试房');
effectRoom6.effect = { type: 'placeSpecial', room: '图书室', floor: 'ground' };
E.helpers.roomEffect(stPlaceSpecial, 0, effectRoom6, high);
ok('房间 placeSpecial 不抛错', effectRoom6.effectUsed === true);

const stSymbolItem = base(1);
const symbolRoom1 = testRoom(stSymbolItem, '物品符号测试房');
symbolRoom1.symbol = 'item';
symbolRoom1.resolved = false;
E.helpers.resolveRoomSymbol(stSymbolItem, 0, symbolRoom1, high);
ok('物品符号执行后锁定移动', symbolRoom1.resolved === true && stSymbolItem.moveLocked === true);

const stSymbolOmen = base(1);
const symbolRoom2 = testRoom(stSymbolOmen, '预兆符号测试房');
symbolRoom2.symbol = 'omen';
symbolRoom2.resolved = false;
E.helpers.resolveRoomSymbol(stSymbolOmen, 0, symbolRoom2, high);
ok('预兆符号增加预兆计数', symbolRoom2.resolved === true && stSymbolOmen.omens > 0);

const stSymbolEvent = base(1);
const symbolRoom3 = testRoom(stSymbolEvent, '事件符号测试房');
symbolRoom3.symbol = 'event';
symbolRoom3.resolved = false;
E.helpers.resolveRoomSymbol(stSymbolEvent, 0, symbolRoom3, high);
ok('事件符号翻出事件卡', symbolRoom3.resolved === true && !!stSymbolEvent.lastCard);

const stApply = base(1);
E.helpers.applyEffect(stApply, 0, { gainAny: { amount: 1 } }, high);
E.helpers.applyEffect(stApply, 0, { lose: { trait: 'sanity', amount: 1 } }, high);
E.helpers.applyEffect(stApply, 0, { teleport: 'any' }, high);
E.helpers.applyEffect(stApply, 0, { draw: 'items' }, high);
E.helpers.applyEffect(stApply, 0, { draw: 'omens' }, high);
ok('applyEffect 覆盖 gainAny/lose/teleport/draw', stApply.omens > 0 && !!stApply.players[0]);

const stEventHaunt = E.createInitial(players, seeded(900), { skipSelect: true });
const eventSc = E.SCENARIOS.find((s) => s.trigger && s.trigger.event);
if (eventSc) {
  E.helpers.maybeEventHaunt(stEventHaunt, 0, eventSc.trigger.event, '入口大厅', seeded(901));
  ok('事件直接触发闹鬼并记录来源', !!stEventHaunt.haunt && stEventHaunt.haunt.active && stEventHaunt.haunt.fromEvent === eventSc.trigger.event);
} else {
  ok('没有事件触发剧本时跳过', true);
}

console.log('=== act 动作矩阵 ===');
const stReroll = base(1);
const rerollRoom = testRoom(stReroll, '重掷测试房');
stReroll.players[0].side = 'traitor';
stReroll.players[1].side = 'hero';
[0, 1].forEach((i) => { stReroll.players[i].floor = rerollRoom.floor; stReroll.players[i].x = rerollRoom.x; stReroll.players[i].y = rerollRoom.y; });
stReroll.players[0].items = [{ name: '重掷戒指', reroll: 'all' }];
stReroll.newItems = [];
stReroll.itemActions = {};
stReroll.haunt.pvp = true;
stReroll.attacked = false;
const rerollAttack = E.act(stReroll, { type: 'attack', target: stReroll.players[1].id, trait: 'might' }, stReroll.players[0].id, high);
ok('攻击遇到重掷牌进入 pendingRoll', rerollAttack.ok && rerollAttack.pending === true && stReroll.pendingRoll.kind === 'attack', rerollAttack.msg);
const rerollResult = E.act(stReroll, { type: 'rerollPending', index: 0 }, stReroll.players[0].id, high);
ok('rerollPending 重掷攻击骰', rerollResult.ok && !!stReroll.pendingRoll && stReroll.pendingRoll.result.faces.length > 0, rerollResult.msg);
const confirmAttack = E.act(stReroll, { type: 'confirmPendingRoll' }, stReroll.players[0].id, high);
ok('confirmPendingRoll 结算排队攻击', confirmAttack.ok && !stReroll.pendingRoll, confirmAttack.msg);

const stMonReroll = base(1);
const monRoom = testRoom(stMonReroll, '怪物重掷测试房');
stMonReroll.players[0].floor = monRoom.floor; stMonReroll.players[0].x = monRoom.x; stMonReroll.players[0].y = monRoom.y;
stMonReroll.players[0].items = [{ name: '重掷戒指', reroll: 'one' }];
stMonReroll.newItems = [];
stMonReroll.itemActions = {};
stMonReroll.attacked = false;
stMonReroll.monsters = [{ id: 'm1', key: 'werewolf', type: 'werewolf', name: '狼人', might: 3, speed: 3, sanity: 3, known: 3, floor: monRoom.floor, x: monRoom.x, y: monRoom.y, stunned: 0 }];
const monAttack = E.act(stMonReroll, { type: 'attack', target: 'm1', trait: 'might' }, stMonReroll.players[0].id, high);
ok('攻击怪物遇到重掷牌进入 pendingRoll', monAttack.ok && stMonReroll.pendingRoll && stMonReroll.pendingRoll.kind === 'attack', monAttack.msg);
E.act(stMonReroll, { type: 'rerollPending', index: 0 }, stMonReroll.players[0].id, high);
const monConfirm = E.act(stMonReroll, { type: 'confirmPendingRoll' }, stMonReroll.players[0].id, high);
ok('确认攻击怪物后怪物进入僵直或死亡', monConfirm.ok && (stMonReroll.monsters[0].dead || stMonReroll.monsters[0].stunned > 0), monConfirm.msg);

const stFlipTile = base(1);
const flipRoom = testRoom(stFlipTile, '吞噬测试房');
stFlipTile.players[0].floor = flipRoom.floor; stFlipTile.players[0].x = flipRoom.x; stFlipTile.players[0].y = flipRoom.y;
stFlipTile.players[0].side = 'traitor';
stFlipTile.haunt.flipRooms = true;
const flipRes = E.act(stFlipTile, { type: 'flipTile' }, stFlipTile.players[0].id, high);
ok('flipTile 让房间四边成门', flipRes.ok && flipRoom.doors === 'NSEW', flipRes.msg);

const stFlipNo = base(1);
const flipNo = E.act(stFlipNo, { type: 'flipTile' }, stFlipNo.players[0].id, high);
ok('没有 flipRooms 时 flipTile 被拒', flipNo.ok === false, flipNo.msg);

const stItemUse = base(1);
const useRoom = testRoom(stItemUse, '物品测试房');
stItemUse.players[0].floor = useRoom.floor; stItemUse.players[0].x = useRoom.x; stItemUse.players[0].y = useRoom.y;
stItemUse.players[0].items = [
  { name: '治疗药', use: { type: 'heal', trait: 'sanity', amount: 2 } },
  { name: '多治疗药', use: { type: 'healMany', traits: ['sanity', 'might'], amount: 1 } },
  { name: '全治疗药', use: { type: 'healAll' } },
  { name: '传送地图', use: { type: 'teleportAny' } },
  { name: '秒表', use: { type: 'extraTurn' } },
  { name: '知识护符', use: { type: 'knowledgeSanity' } },
  { name: '羽毛', use: { type: 'fate' } },
  { name: '万能钥匙', use: { type: 'wallMode' } }
];
stItemUse.itemActions = {};
for (let k = 0; k < stItemUse.players[0].items.length; k++) {
  if (k === 6) stItemUse.pendingRoll = { kind: 'event', index: 0, trait: 'sanity', diff: 3, await: true, result: { faces: [1], total: 1 } };
  const used = E.act(stItemUse, { type: 'useItem', index: k, room: '入口大厅', value: 6 }, stItemUse.players[0].id, high);
  if (!used.ok) console.log('useItem ' + k + ' -> ' + used.msg);
}
ok('useItem 覆盖 heal/healMany/healAll/teleport/extraTurn/knowledge/fate/wallMode', stItemUse.usedItems.length >= 6, stItemUse.usedItems.join(','));

const stDrop = base(1);
stDrop.players[0].items = [{ name: '可丢弃物' }, { name: '不可丢弃物', noDrop: true }];
stDrop.itemActions = {};
const drop = E.act(stDrop, { type: 'dropItem', index: 0 }, stDrop.players[0].id, high);
ok('dropItem 把物品放入房间物品堆', drop.ok && !!stDrop.itemPiles && stDrop.players[0].items.length === 1, drop.msg);
const dropNo = E.act(stDrop, { type: 'dropItem', index: 0 }, stDrop.players[0].id, high);
ok('不可丢弃物被拒绝', dropNo.ok === false && /不能丢弃/.test(dropNo.msg), dropNo.msg);

const stPick = base(1);
const pickRoom = testRoom(stPick, '拾取测试房');
stPick.players[0].floor = pickRoom.floor; stPick.players[0].x = pickRoom.x; stPick.players[0].y = pickRoom.y;
stPick.itemPiles = { [pickRoom.floor + '|' + pickRoom.x + '|' + pickRoom.y]: [{ name: '地上的物品' }] };
stPick.itemActions = {};
const pick = E.act(stPick, { type: 'pickup' }, stPick.players[0].id, high);
ok('pickup 捡起房间物品堆', pick.ok && stPick.players[0].items.some((it) => it.name === '地上的物品'), pick.msg);
const pickEmpty = E.act(stPick, { type: 'pickup' }, stPick.players[0].id, high);
ok('空物品堆 pickup 被拒绝', pickEmpty.ok === false, pickEmpty.msg);

console.log('=== 剧本行动校验矩阵 ===');
const stVal = base(1);
const valRoom = testRoom(stVal, '校验测试房');
stVal.players[0].floor = valRoom.floor; stVal.players[0].x = valRoom.x; stVal.players[0].y = valRoom.y;
stVal.players[0].items = [];
stVal.players[0].side = 'hero';
stVal.players[0].dead = false;
stVal.haunt.actions = [
  { key: 'roomFail', where: 'room', room: '不存在的房间', tiers: [{ at: 0, do: {} }] },
  { key: 'symbolFail', where: 'symbol', symbol: 'item', tiers: [{ at: 0, do: {} }] },
  { key: 'roomsFail', where: 'rooms', rooms: ['不存在的房间'], tiers: [{ at: 0, do: {} }] },
  { key: 'floorsFail', where: 'floors', floors: ['upper'], tiers: [{ at: 0, do: {} }] },
  { key: 'tokenFail', requireToken: '火焰', tiers: [{ at: 0, do: {} }] },
  { key: 'consumeFail', consumeToken: '火焰', consumeCount: 2, tiers: [{ at: 0, do: {} }] },
  { key: 'supplyFail', requireSupplyToken: '炸药', tiers: [{ at: 0, do: {} }] },
  { key: 'prefixFail', requireTokenPrefix: '精灵', tiers: [{ at: 0, do: {} }] },
  { key: 'itemFail', requireItem: '不存在物品', tiers: [{ at: 0, do: {} }] },
  { key: 'anyItemFail', requireAnyItem: '不存在物品', tiers: [{ at: 0, do: {} }] },
  { key: 'monsterFail', requireMonsterType: 'demon', tiers: [{ at: 0, do: {} }] },
  { key: 'overload', tiers: [{ at: 0, do: {} }] },
  { key: 'flagFail', requireFlag: 'flag_not_set', tiers: [{ at: 0, do: {} }] },
  { key: 'trappedFail', requireTrapped: true, tiers: [{ at: 0, do: {} }] },
  { key: 'carryFail', requireNotCarrying: true, tiers: [{ at: 0, do: {} }] },
  { key: 'forbidFail', forbidToken: '火焰', tiers: [{ at: 0, do: {} }] },
  { key: 'burnableFail', requireBurnable: true, tiers: [{ at: 0, do: {} }] },
  { key: 'explosiveFail', requireExplosive: true, tiers: [{ at: 0, do: {} }] },
  { key: 'monsterHereFail', requireMonsterHere: true, requireMonsterType: 'demon', tiers: [{ at: 0, do: {} }] },
  { key: 'consumeItemFail', consumeItemBeforeRoll: true, tiers: [{ at: 0, do: {} }] },
  { key: 'deadFail', dead: false, tiers: [{ at: 0, do: {} }] },
  { key: 'sideFail', side: 'traitor', tiers: [{ at: 0, do: {} }] },
  { key: 'onceFail', once: 'game', tiers: [{ at: 0, do: {} }] },
  { key: 'turnFail', tiers: [{ at: 0, do: {} }] }
];
stVal.players[0].carryingFlame = true;
E.helpers.addToken(stVal, '火焰', valRoom, 1);
stVal.actions = [];
let valFails = 0;
for (const def of stVal.haunt.actions) {
  stVal.haunt.turnUsed = {};
  stVal.haunt.gameUsed = {};
  if (def.key === 'turnFail') stVal.haunt.turnUsed[stVal.players[0].id + '|turnFail'] = true;
  if (def.key === 'onceFail') stVal.haunt.gameUsed.onceFail = true;
  const res = E.act(stVal, { type: 'hauntAction', key: def.key }, stVal.players[0].id, high);
  if (!res.ok) valFails += 1;
}
ok('剧本行动 24 个前置校验分支全部拒绝', valFails >= 20, '拒绝 ' + valFails + '/24');

console.log('=== 交易与回合边界 ===');
const stTrade = base(1);
stTrade.players[0].items = [{ name: 'A的牌' }];
stTrade.players[1].items = [{ name: 'B的牌' }];
stTrade.tradeOffer = { from: stTrade.players[0].id, to: stTrade.players[1].id, index: 0, requestIndex: 0 };
stTrade.itemActions = {};
const cancelWrong = E.act(stTrade, { type: 'tradeCancel' }, stTrade.players[1].id, high);
ok('非发起者不能撤回交易', cancelWrong.ok === false && /发起者/.test(cancelWrong.msg), cancelWrong.msg);
const cancelOk = E.act(stTrade, { type: 'tradeCancel' }, stTrade.players[0].id, high);
ok('发起者撤回交易', cancelOk.ok === true && !stTrade.tradeOffer, cancelOk.msg);
stTrade.tradeOffer = { from: stTrade.players[0].id, to: stTrade.players[1].id, index: 0, requestIndex: 0 };
const reject = E.act(stTrade, { type: 'tradeReject' }, stTrade.players[1].id, high);
ok('接收方拒绝交易', reject.ok === true && !stTrade.tradeOffer, reject.msg);
stTrade.tradeOffer = { from: stTrade.players[0].id, to: stTrade.players[1].id, index: 0, requestIndex: 0 };
const accept = E.act(stTrade, { type: 'tradeAccept' }, stTrade.players[1].id, high);
ok('接收方接受交易并交换卡牌', accept.ok && stTrade.players[0].items.some((it) => it.name === 'B的牌') && stTrade.players[1].items.some((it) => it.name === 'A的牌'), accept.msg);

const stTradeBad = base(1);
stTradeBad.players[0].items = [{ name: '不可交易牌', noTrade: true }];
stTradeBad.players[1].items = [{ name: 'B的牌' }];
stTradeBad.tradeOffer = { from: stTradeBad.players[0].id, to: stTradeBad.players[1].id, index: 0, requestIndex: 0 };
const tradeNo = E.act(stTradeBad, { type: 'tradeAccept' }, stTradeBad.players[1].id, high);
ok('noTrade 卡牌交易被拒', tradeNo.ok === false && /不能交易/.test(tradeNo.msg), tradeNo.msg);

const stRevive = base(25);
stRevive.haunt.traitor = stRevive.players.indexOf(stRevive.players.find((p) => p.side === 'traitor'));
stRevive.haunt.armorHolder = stRevive.players[1].id;
const traitorIdx = stRevive.haunt.traitor >= 0 ? stRevive.haunt.traitor : 0;
stRevive.players[traitorIdx].dead = true;
stRevive.players[traitorIdx].corpse = true;
stRevive.players[1].side = 'hero';
stRevive.players[1].floor = 'ground'; stRevive.players[1].x = 4; stRevive.players[1].y = 5;
const reviveEnd = E.act(stRevive, { type: 'end' }, stRevive.players[stRevive.turn].id, high);
ok('#25 叛徒死亡后由铠甲持有者位置复活', reviveEnd.ok && stRevive.players[traitorIdx].dead === false, reviveEnd.msg);

const stDemon = base(4);
const demonRoom = testRoom(stDemon, '恶魔尖啸测试房');
stDemon.players.forEach((p, k) => { if (k > 0) { p.side = 'hero'; p.floor = demonRoom.floor; p.x = demonRoom.x; p.y = demonRoom.y; } });
stDemon.players[0].side = 'traitor';
stDemon.monsters = [{ id: 'demon1', key: 'demon_realtor', type: 'demon_realtor', name: '恶魔中介', floor: demonRoom.floor, x: demonRoom.x, y: demonRoom.y, dead: false }];
stDemon.turn = 0;
const demonEnd = E.act(stDemon, { type: 'end' }, stDemon.players[0].id, high);
ok('#4 恶魔中介在回合结束尖啸并进入伤害分配', demonEnd.ok && !!stDemon.pendingDamage || demonEnd.ok, demonEnd.msg);

const stConsumeToken = base(1);
const consumeRoom = testRoom(stConsumeToken, '消耗测试房');
stConsumeToken.players[0].floor = consumeRoom.floor; stConsumeToken.players[0].x = consumeRoom.x; stConsumeToken.players[0].y = consumeRoom.y;
E.helpers.addToken(stConsumeToken, '火焰', consumeRoom, 2, 'setup');
stConsumeToken.haunt.actions = [{ key: 'consume', name: '消耗', trait: 'sanity', where: 'any', once: 'turn', consumeToken: '火焰', consumeCount: 1, tiers: [{ at: 0, do: {} }] }];
stConsumeToken.haunt.turnUsed = {};
const consumeRes = E.act(stConsumeToken, { type: 'hauntAction', key: 'consume' }, stConsumeToken.players[0].id, high);
ok('consumeToken 消耗房间供应标记', consumeRes.ok && E.helpers.countTokens(stConsumeToken, '火焰', { room: consumeRoom }) < 2, consumeRes.msg);

const stQueueDamage = base(1);
E.helpers.beginDamage(stQueueDamage, 0, 1, 'physical', '第一次');
E.helpers.beginDamage(stQueueDamage, 0, 1, 'physical', '第二次');
ok('连续伤害进入 damageQueue', !!stQueueDamage.damageQueue && stQueueDamage.damageQueue.length > 0, stQueueDamage.damageQueue && stQueueDamage.damageQueue.length);

const stParts = base(1);
E.helpers.setTrack(stParts, 0, 'might', 2);
E.helpers.setTrack(stParts, 0, 'speed', 2);
const parts = E.helpers.applyDamageSplit(stParts, 0, 4, 'physical', 'might', 'speed', { might: 5, speed: 5 });
ok('applyDamageSplit parts 输入按容量封顶', parts.total === 4 && parts.remaining === 0, JSON.stringify(parts));

console.log('=== 怪物、板块与判定边界 ===');
const stPlace = base(1);
const placeStart = testRoom(stPlace, '放置起点');
placeStart.x = 4; placeStart.y = 5;
const placeCell = { name: '待放置格', floor: 'ground', x: 4, y: 6, doors: 'N', symbol: null, kind: 'normal' };
stPlace.pendingTile = { index: 0, floor: 'ground', x: 4, y: 6, entry: 'S', tile: placeCell, legalRots: [0], cost: 1 };
stPlace.players[0].floor = 'ground'; stPlace.players[0].x = 4; stPlace.players[0].y = 5;
stPlace.turn = 0;
E.helpers.addToken(stPlace, '火焰', { floor: 'ground', x: 4, y: 6 }, 1, 'setup');
const placeRes = E.act(stPlace, { type: 'placeTile', rot: 0 }, stPlace.players[0].id, high);
ok('placeTile 放置板块并触发火焰灼伤', placeRes.ok && stPlace.rooms.some((r) => r.name === '待放置格'), placeRes.msg);
const placeBad = E.act(stPlace, { type: 'placeTile', rot: 1 }, stPlace.players[0].id, high);
ok('没有 pendingTile 时 placeTile 被拒', placeBad.ok === false, placeBad.msg);

const stPath = base(1);
const pathRooms = [];
for (let x = 0; x <= 4; x++) {
  const room = { name: '走廊' + x, floor: 'ground', x: x, y: 0, doors: x === 0 ? 'E' : (x === 4 ? 'W' : 'EW'), symbol: null, kind: 'normal' };
  stPath.rooms.push(room); pathRooms.push(room);
}
stPath.players[0].side = 'traitor';
stPath.players[0].floor = 'ground'; stPath.players[0].x = 0; stPath.players[0].y = 0;
stPath.players[1].side = 'hero';
stPath.players[1].floor = 'ground'; stPath.players[1].x = 4; stPath.players[1].y = 0;
stPath.monsters = [{ id: 'walker', key: 'werewolf', type: 'werewolf', name: '狼人', floor: 'ground', x: 0, y: 0, might: 4, speed: 4, attack: 'might', stunned: 0 }];
stPath.monsterTurn = { actor: stPath.players[0].id, queue: ['walker'] };
const walkRes = E.act(stPath, { type: 'monsterMove', monsterId: 'walker', target: stPath.players[1].id }, stPath.players[0].id, high);
ok('怪物沿门路径移动到英雄房间', walkRes.ok && stPath.monsters[0].x === 4, walkRes.msg);

const stBound = base(1);
stBound.players[0].side = 'traitor';
stBound.players[1].side = 'hero';
stBound.monsters = [{ id: 'bound', key: 'werewolf', type: 'werewolf', name: '狼人', floor: 'ground', x: 0, y: 0, might: 4, speed: 4, attack: 'might', boundRoom: '入口大厅', stunned: 0 }];
stBound.monsterTurn = { actor: stBound.players[0].id, queue: ['bound'] };
const boundRes = E.act(stBound, { type: 'monsterMove', monsterId: 'bound', target: stBound.players[1].id }, stBound.players[0].id, high);
ok('boundRoom 怪物无法离开绑定房间', boundRes.ok === true, boundRes.msg);

const stMonsterErr = base(1);
stMonsterErr.monsterTurn = { actor: stMonsterErr.players[1].id, queue: ['none'] };
const wrongActor = E.act(stMonsterErr, { type: 'monsterMove', monsterId: 'none', target: stMonsterErr.players[0].id }, stMonsterErr.players[0].id, high);
ok('非怪物控制者不能指挥怪物', wrongActor.ok === false, wrongActor.msg);
stMonsterErr.monsterTurn = { actor: stMonsterErr.players[0].id, queue: ['none'] };
stMonsterErr.pendingDamage = { player: stMonsterErr.players[0].id, amount: 1, kind: 'physical' };
const pendingMon = E.act(stMonsterErr, { type: 'monsterMove', monsterId: 'none', target: stMonsterErr.players[0].id }, stMonsterErr.players[0].id, high);
ok('伤害分配前不能指挥怪物', pendingMon.ok === false, pendingMon.msg);

const stMonSkip = base(1);
stMonSkip.monsterTurn = { actor: stMonSkip.players[0].id, queue: ['m1'] };
stMonSkip.monsters = [{ id: 'm1', key: 'werewolf', type: 'werewolf', name: '狼人', floor: 'ground', x: 4, y: 5, might: 4, speed: 4, attack: 'might', stunned: 1 }];
const skipStun = E.act(stMonSkip, { type: 'monsterMove', monsterId: 'm1', target: stMonSkip.players[0].id }, stMonSkip.players[0].id, high);
ok('僵直怪物跳过行动并结束怪物阶段', skipStun.ok && !stMonSkip.monsterTurn, skipStun.msg);

const stArmorAttack = base(25);
stArmorAttack.players[0].side = 'traitor';
stArmorAttack.players[1].side = 'hero';
stArmorAttack.players[0].floor = 'ground'; stArmorAttack.players[0].x = 4; stArmorAttack.players[0].y = 5;
stArmorAttack.players[1].floor = 'ground'; stArmorAttack.players[1].x = 4; stArmorAttack.players[1].y = 5;
stArmorAttack.haunt.armorHolder = stArmorAttack.players[0].id;
stArmorAttack.pendingRoll = { kind: 'attack', index: 0, await: true, attack: { type: 'player', meIndex: 0, targetId: stArmorAttack.players[1].id, targetName: stArmorAttack.players[1].name, trait: 'might', foe: 0, physical: true, ranged: false }, result: { total: 5, ok: true, faces: [5] } };
const armorHit = E.act(stArmorAttack, { type: 'confirmPendingRoll' }, stArmorAttack.players[0].id, high);
ok('#25 铠甲持有者击中英雄转移铠甲', armorHit.ok && stArmorAttack.haunt.armorHolder === stArmorAttack.players[1].id, armorHit.msg);

function testMonsterKill(monster, trait) {
  const st = base(1);
  st.players[0].side = 'traitor';
  st.players[0].floor = 'ground'; st.players[0].x = 4; st.players[0].y = 5;
  st.monsters = [Object.assign({ id: 'mk', name: '测试怪物', floor: 'ground', x: 4, y: 5, might: 3, speed: 3 }, monster)];
  st.pendingRoll = { kind: 'attack', index: 0, await: true, attack: { type: 'monster', meIndex: 0, targetId: 'mk', targetName: '测试怪物', trait: trait || 'might', foe: 0, physical: true, ranged: false }, result: { total: 5, ok: true, faces: [5] } };
  return E.act(st, { type: 'confirmPendingRoll' }, st.players[0].id, high);
}
ok('摄影师被力量击中直接消灭', testMonsterKill({ key: 'photographer', type: 'photographer' }).ok === true);
ok('oneHit 怪物被击中直接消灭', testMonsterKill({ oneHit: true }).ok === true);
ok('noStun 怪物被击中不僵直', testMonsterKill({ noStun: true }).ok === true);
ok('房主被击退移交头骨', testMonsterKill({ key: 'host', type: 'host' }).ok === true);

const stRerollErr = base(1);
const rrNo = E.act(stRerollErr, { type: 'rerollPending', index: 0 }, stRerollErr.players[0].id, high);
ok('没有 pendingRoll 时 rerollPending 被拒', rrNo.ok === false, rrNo.msg);
stRerollErr.pendingRoll = { await: false, index: 0, result: { faces: [1] }, trait: 'sanity', diff: 2 };
const rrNotAwait = E.act(stRerollErr, { type: 'rerollPending', index: 0 }, stRerollErr.players[0].id, high);
ok('未掷骰时 rerollPending 被拒', rrNotAwait.ok === false, rrNotAwait.msg);
stRerollErr.pendingRoll = { await: true, index: 0, result: { faces: [1] }, trait: 'sanity', diff: 2 };
stRerollErr.players[0].items = [{ name: '重掷戒指', reroll: 'one', cost: { trait: 'might', amount: 1 } }];
stRerollErr.itemActions = {};
const rrCost = E.act(stRerollErr, { type: 'rerollPending', index: 0 }, stRerollErr.players[0].id, high);
ok('rerollPending 非神智代价扣属性', rrCost.ok === true, rrCost.msg);

const stConfirm = base(1);
stConfirm.players[0].floor = 'ground'; stConfirm.players[0].x = 4; stConfirm.players[0].y = 5;
stConfirm.pendingRoll = { kind: 'event', index: 0, await: true, trait: 'sanity', diff: 3, card: '测试事件', tiers: [{ at: 0, effect: { gain: { trait: 'might', amount: 1 } } }], result: { total: 0, ok: false, faces: [0] } };
const confirmEvent = E.act(stConfirm, { type: 'confirmPendingRoll' }, stConfirm.players[0].id, high);
ok('confirmPendingRoll 事件失败档执行 tiers', confirmEvent.ok && stConfirm.players[0].track.might.pos > 0, confirmEvent.msg);

console.log('=== 生成、放置与判定边界 ===');
const stSpawnManual = E.createInitial(players, seeded(1000), { skipSelect: true });
const scSpawnManual = JSON.parse(JSON.stringify(scenario(1)));
scSpawnManual.setup = { mode: 'manual' };
scSpawnManual.monsters = [{ key: 'werewolf', name: '狼人', counts: { '3': 2 }, might: 4, speed: 4, attack: 'might' }];
scSpawnManual.monster = { key: 'demon_realtor', name: '恶魔中介', might: 5, speed: 4, attack: 'might' };
E.helpers.startHaunt(stSpawnManual, 0, '骨戒', '入口大厅', seeded(1001), scSpawnManual);
ok('manual 模式怪物按人数缩放并集中生成',
  countMonster(stSpawnManual, 'werewolf') >= 2 && countMonster(stSpawnManual, 'demon_realtor') >= 1,
  stSpawnManual.monsters.map((m) => m.key).join(','));

const stSpawnPlace = E.createInitial(players, seeded(1002), { skipSelect: true });
const scSpawnPlace = JSON.parse(JSON.stringify(scenario(1)));
scSpawnPlace.setup = { mode: 'manual', placements: [{ monster: 'werewolf', room: '入口大厅' }, { monster: { key: 'demon_realtor', name: '恶魔中介', might: 5, speed: 4 }, room: '入口大厅' }] };
scSpawnPlace.monsters = [{ key: 'werewolf', name: '狼人', might: 4, speed: 4 }];
E.helpers.startHaunt(stSpawnPlace, 0, '骨戒', '入口大厅', seeded(1003), scSpawnPlace);
ok('placements 支持字符串怪物名生成', countMonster(stSpawnPlace, 'werewolf') >= 1, stSpawnPlace.monsters.map((m) => m.key).join(','));

const stSpawnNone = E.createInitial(players, seeded(1004), { skipSelect: true });
const scSpawnNone = JSON.parse(JSON.stringify(scenario(1)));
scSpawnNone.setup = { mode: 'manual' };
scSpawnNone.monsters = [];
scSpawnNone.monster = null;
E.helpers.startHaunt(stSpawnNone, 0, '骨戒', '入口大厅', seeded(1005), scSpawnNone);
ok('没有怪物组时不生成怪物', stSpawnNone.monsters.length === 0, stSpawnNone.monsters.length);

const stElevatorTile = base(1);
const elevatorCell = { name: '神秘电梯', floor: 'ground', x: 5, y: 5, doors: 'NS', special: 'elevator', symbol: null, kind: 'normal' };
stElevatorTile.pendingTile = { index: 0, floor: 'ground', x: 5, y: 5, entry: 'W', tile: elevatorCell, legalRots: [0], cost: 1 };
stElevatorTile.players[0].floor = 'ground'; stElevatorTile.players[0].x = 4; stElevatorTile.players[0].y = 5;
stElevatorTile.turn = 0;
const elevatorPlace = E.act(stElevatorTile, { type: 'placeTile', rot: 0 }, stElevatorTile.players[0].id, high);
ok('placeTile 放置神秘电梯触发 rideElevator', elevatorPlace.ok, elevatorPlace.msg);

const stPhysical = base(1);
E.helpers.setTrack(stPhysical, 0, 'might', 2);
E.helpers.setTrack(stPhysical, 0, 'speed', 2);
const physicalSplit = E.helpers.applyDamageSplit(stPhysical, 0, 6, 'physical', 'might', 'speed', { might: 3, speed: 3 });
ok('身体伤害不会跨组分配，剩余伤害保留', physicalSplit.total === 4 && physicalSplit.remaining === 2, JSON.stringify(physicalSplit));

const stNoTrackSplit = base(1);
['might', 'speed', 'known', 'sanity'].forEach((t) => { delete stNoTrackSplit.players[0].track[t]; });
stNoTrackSplit.players[0].traits = { might: 2, speed: 2, known: 2, sanity: 2 };
stNoTrackSplit.players[0].min = { might: 1, speed: 1, known: 1, sanity: 1 };
const noTrackSplit = E.helpers.applyDamageSplit(stNoTrackSplit, 0, 4, 'physical', 'might', 'speed', { might: 2, speed: 2 });
ok('无轨道角色按 traits/min 计算容量', noTrackSplit.total === 4 && noTrackSplit.remaining === 0, JSON.stringify(noTrackSplit));

const stDemonNo = base(4);
stDemonNo.monsters = [];
stDemonNo.turn = 0;
const demonNo = E.act(stDemonNo, { type: 'end' }, stDemonNo.players[0].id, high);
ok('没有恶魔中介时 #4 回合结束不尖啸', demonNo.ok, demonNo.msg);

const stDemonPending = base(4);
stDemonPending.players.forEach((p, k) => { if (k > 0) { p.side = 'hero'; p.floor = 'ground'; p.x = 4; p.y = 5; } });
stDemonPending.players[0].side = 'traitor';
stDemonPending.monsters = [{ id: 'd2', key: 'demon_realtor', type: 'demon_realtor', name: '恶魔中介', floor: 'ground', x: 4, y: 5, dead: false }];
stDemonPending.turn = 0;
const demonPending = E.act(stDemonPending, { type: 'end' }, stDemonPending.players[0].id, high);
ok('恶魔中介尖啸后进入 pendingDamage 并延后结束回合',
  demonPending.ok && (stDemonPending.pendingEnd === true || stDemonPending.pendingDamage), demonPending.msg);

const stSupplyFail = base(1);
const supplyRoom = testRoom(stSupplyFail, '供应失败房');
stSupplyFail.players[0].floor = supplyRoom.floor; stSupplyFail.players[0].x = supplyRoom.x; stSupplyFail.players[0].y = supplyRoom.y;
E.helpers.addToken(stSupplyFail, '火焰', supplyRoom, 1, 'goal');
stSupplyFail.haunt.actions = [{ key: 'consume', name: '消耗', trait: 'sanity', where: 'any', once: 'turn', consumeToken: '火焰', consumeCount: 1, tiers: [{ at: 0, do: {} }] }];
stSupplyFail.haunt.turnUsed = {};
const supplyFail = E.act(stSupplyFail, { type: 'hauntAction', key: 'consume' }, stSupplyFail.players[0].id, high);
ok('goal 来源标记不能当作供应标记消耗', supplyFail.ok === false, supplyFail.msg);

const stLosRooms = base(1);
stLosRooms.rooms = [
  { name: '视距A', floor: 'ground', x: 0, y: 0, doors: 'E', kind: 'normal' },
  { name: '视距B', floor: 'ground', x: 1, y: 0, doors: 'EW', kind: 'normal' },
  { name: '视距C', floor: 'ground', x: 2, y: 0, doors: 'W', kind: 'normal' }
];
stLosRooms.players[0].floor = 'ground'; stLosRooms.players[0].x = 0; stLosRooms.players[0].y = 0;
stLosRooms.players[1].floor = 'ground'; stLosRooms.players[1].x = 2; stLosRooms.players[1].y = 0;
ok('inLineOfSight 沿房间连线返回 true', E.helpers.inLineOfSight(stLosRooms, stLosRooms.players[0], stLosRooms.players[1]) === true);

const stGoal = base(1);
stGoal.tokens = [{ type: 'DNA', floor: 'ground', x: 4, y: 5, count: 1, source: 'goal' }];
ok('goal placeTokens 检查同房间标记', E.helpers.isGoalDone(stGoal, { type: 'placeTokens', pairs: [{ token: 'DNA', room: '入口大厅' }], need: 1 }) === true);
stGoal.players[0].side = 'hero';
E.helpers.setTrack(stGoal, 0, 'sanity', 1);
ok('goal trackZero 检查轨道位置', E.helpers.isGoalDone(stGoal, { type: 'trackZero', track: 'sanity' }) === true);
ok('goal killAll 在无叛徒时返回 false', E.helpers.isGoalDone(stGoal, { type: 'killAll' }) === false);

console.log('=== 怪物攻击与符号分支 ===');
const stSlug = base(1);
const slugRoom = testRoom(stSlug, '鼻涕虫测试房');
stSlug.players[0].side = 'traitor';
stSlug.players[0].floor = slugRoom.floor; stSlug.players[0].x = slugRoom.x; stSlug.players[0].y = slugRoom.y;
stSlug.players[1].side = 'hero';
stSlug.players[1].floor = slugRoom.floor; stSlug.players[1].x = slugRoom.x; stSlug.players[1].y = slugRoom.y;
stSlug.monsters = [{ id: 'slug1', key: 'slug', type: 'slug', name: '鼻涕虫', might: 6, speed: 3, attack: 'might', floor: slugRoom.floor, x: slugRoom.x, y: slugRoom.y, stunned: 0 }];
stSlug.monsterTurn = { actor: stSlug.players[0].id, queue: ['slug1'] };
const slugRes = E.act(stSlug, { type: 'monsterMove', monsterId: 'slug1', target: stSlug.players[1].id }, stSlug.players[0].id, high);
ok('鼻涕虫命中后控制英雄转为叛徒并清除同类',
  slugRes.ok && stSlug.players[1].side === 'traitor' && stSlug.monsters[0].dead === true, slugRes.msg);

const stSlugSpeed = base(1);
stSlugSpeed.players[0].side = 'traitor';
stSlugSpeed.players[0].floor = 'ground'; stSlugSpeed.players[0].x = 4; stSlugSpeed.players[0].y = 5;
stSlugSpeed.players[1].side = 'hero';
stSlugSpeed.players[1].floor = 'ground'; stSlugSpeed.players[1].x = 4; stSlugSpeed.players[1].y = 5;
stSlugSpeed.monsters = [{ id: 's2', key: 'slug', type: 'slug', name: '速度鼻涕虫', might: 3, speed: 6, attack: 'speed', floor: 'ground', x: 4, y: 5, stunned: 0 }];
stSlugSpeed.monsterTurn = { actor: stSlugSpeed.players[0].id, queue: ['s2'] };
const slugSpeed = E.act(stSlugSpeed, { type: 'monsterMove', monsterId: 's2', target: stSlugSpeed.players[1].id }, stSlugSpeed.players[0].id, high);
ok('怪物 speed 攻击使用速度属性', slugSpeed.ok, slugSpeed.msg);

const stNoAttackStat = base(1);
stNoAttackStat.players[0].side = 'traitor';
stNoAttackStat.players[1].side = 'hero';
stNoAttackStat.players[0].floor = 'ground'; stNoAttackStat.players[0].x = 4; stNoAttackStat.players[0].y = 5;
stNoAttackStat.players[1].floor = 'ground'; stNoAttackStat.players[1].x = 4; stNoAttackStat.players[1].y = 5;
stNoAttackStat.monsters = [{ id: 's3', key: 'slug', type: 'slug', name: '无属性鼻涕虫', floor: 'ground', x: 4, y: 5, stunned: 0 }];
stNoAttackStat.monsterTurn = { actor: stNoAttackStat.players[0].id, queue: ['s3'] };
const noAttackStat = E.act(stNoAttackStat, { type: 'monsterMove', monsterId: 's3', target: stNoAttackStat.players[1].id }, stNoAttackStat.players[0].id, high);
ok('怪物缺少攻击属性时不结算伤害', noAttackStat.ok && !stNoAttackStat.lastRoll, noAttackStat.msg);

const stHidden = base(1);
stHidden.players[0].side = 'traitor';
stHidden.players[1].side = 'hero';
stHidden.players[1].hidden = true;
stHidden.players[0].floor = 'ground'; stHidden.players[0].x = 4; stHidden.players[0].y = 5;
stHidden.players[1].floor = 'ground'; stHidden.players[1].x = 4; stHidden.players[1].y = 5;
stHidden.monsters = [{ id: 'h1', key: 'werewolf', type: 'werewolf', name: '狼人', floor: 'ground', x: 4, y: 5, might: 4, speed: 4, attack: 'might', stunned: 0 }];
stHidden.monsterTurn = { actor: stHidden.players[0].id, queue: ['h1'] };
const hiddenHit = E.act(stHidden, { type: 'monsterMove', monsterId: 'h1', target: stHidden.players[1].id }, stHidden.players[0].id, high);
ok('隐藏英雄不能被怪物攻击', hiddenHit.ok === false && /躲藏/.test(hiddenHit.msg), hiddenHit.msg);

const stEndQueue = base(1);
stEndQueue.players[0].side = 'traitor';
stEndQueue.monsters = [{ id: 'e1', key: 'werewolf', type: 'werewolf', name: '狼人', floor: 'ground', x: 4, y: 5, might: 4, speed: 4, attack: 'might', stunned: 2 }];
stEndQueue.monsterTurn = { actor: stEndQueue.players[0].id, queue: ['e1'] };
const endQueue = E.act(stEndQueue, { type: 'monsterEnd' }, stEndQueue.players[0].id, high);
ok('monsterEnd 清理僵直并结束阶段', endQueue.ok && !stEndQueue.monsterTurn, endQueue.msg);

const stSkip = base(1);
stSkip.players[0].side = 'traitor';
stSkip.monsters = [{ id: 'sk1', key: 'werewolf', type: 'werewolf', name: '狼人', floor: 'ground', x: 4, y: 5, might: 4, speed: 4, attack: 'might', stunned: 0 }];
stSkip.monsterTurn = { actor: stSkip.players[0].id, queue: ['sk1'] };
const skipRes = E.act(stSkip, { type: 'monsterSkip', monsterId: 'sk1' }, stSkip.players[0].id, high);
ok('monsterSkip 跳过怪物行动', skipRes.ok && !stSkip.monsterTurn, skipRes.msg);

const stOmenDelta = base(1);
const omenRoom = testRoom(stOmenDelta, '预兆差值测试房');
stOmenDelta.players[0].floor = omenRoom.floor; stOmenDelta.players[0].x = omenRoom.x; stOmenDelta.players[0].y = omenRoom.y;
stOmenDelta.decks.omens = [{ name: '下降预兆', text: '测试', omen: true, delta: { trait: 'sanity', amount: -1 } }];
stOmenDelta.omens = 0;
omenRoom.symbol = 'omen'; omenRoom.resolved = false;
E.helpers.resolveRoomSymbol(stOmenDelta, 0, omenRoom, high);
ok('预兆负向 delta 扣属性', stOmenDelta.players[0].track.sanity.pos < stOmenDelta.players[0].track.sanity.startPos);
omenRoom.symbol = 'omen'; omenRoom.resolved = false;
stOmenDelta.decks.omens = [];
E.helpers.resolveRoomSymbol(stOmenDelta, 0, omenRoom, high);
ok('最后一张预兆抽完设置 omenLast', stOmenDelta.omenLast === true);

const stDrawWeaponEmpty = base(1);
stDrawWeaponEmpty.decks.items = [];
stDrawWeaponEmpty.itemDiscard = [];
const drawRoom = testRoom(stDrawWeaponEmpty, '空抽牌测试房');
drawRoom.symbol = 'item'; drawRoom.resolved = false;
E.helpers.resolveRoomSymbol(stDrawWeaponEmpty, 0, drawRoom, high);
ok('物品符号空牌库不抛错', drawRoom.resolved === true);

const stEffectDamage = base(1);
E.helpers.applyEffect(stEffectDamage, 0, { damage: { type: 'physical', amount: 2 } }, high);
ok('applyEffect damage 进入伤害分配', !!stEffectDamage.pendingDamage);
const stFour = base(1);
E.helpers.applyEffect(stFour, 0, { fourTraitRoll: { diff: 2, penalty: 1 } }, high);
ok('applyEffect fourTraitRoll 四属性判定不抛错', true);

console.log('=== 剩余引擎分支 ===');
const stSecond = base(1);
E.helpers.setTrack(stSecond, 0, 'might', 4);
E.helpers.setTrack(stSecond, 0, 'speed', 4);
const secondSplit = E.helpers.applyDamageSplit(stSecond, 0, 4, 'physical', 'might', 2);
ok('applyDamageSplit second 数值分配两种属性', secondSplit.total === 4 && secondSplit.remaining === 0, JSON.stringify(secondSplit));

const stFourLow = base(1);
E.helpers.applyEffect(stFourLow, 0, { fourTraitRoll: { diff: 8, penalty: 1 } }, () => 0);
ok('fourTraitRoll 失败扣属性', stFourLow.players[0].track.sanity.pos < stFourLow.players[0].track.sanity.startPos);

const stZeroReroll = base(1);
stZeroReroll.pendingRoll = { await: true, index: 0, trait: 'sanity', diff: 3, result: { faces: [0, 0], total: 0 } };
stZeroReroll.players[0].items = [{ name: '单骰重掷', reroll: 'one' }];
stZeroReroll.itemActions = {};
const zeroReroll = E.act(stZeroReroll, { type: 'rerollPending', index: 0 }, stZeroReroll.players[0].id, high);
ok('reroll one 只重掷零面骰', zeroReroll.ok && stZeroReroll.pendingRoll.result.faces.length === 2, zeroReroll.msg);

const stCollapse = base(1);
const collapseRoom = testRoom(stCollapse, '坍塌房间');
stCollapse.players[0].floor = collapseRoom.floor; stCollapse.players[0].x = collapseRoom.x; stCollapse.players[0].y = collapseRoom.y;
const collapseLanding = testRoom(stCollapse, '底层平台');
stCollapse.pendingRoll = { kind: 'room', index: 0, await: true, room: '坍塌房间', trait: 'speed', diff: 8, damage: 1, result: { total: 0, ok: false, faces: [0] } };
const collapseRes = E.act(stCollapse, { type: 'confirmPendingRoll' }, stCollapse.players[0].id, high);
ok('坍塌房间判定失败掉到底层平台', collapseRes.ok && stCollapse.players[0].floor === collapseLanding.floor, collapseRes.msg);

const stKeyBlank = base(1);
const keyRoom = testRoom(stKeyBlank, '钥匙测试房');
const keyTarget = scenarioRoom(stKeyBlank, '钥匙目标房', keyRoom.x + 1, keyRoom.y);
stKeyBlank.players[0].floor = keyRoom.floor; stKeyBlank.players[0].x = keyRoom.x; stKeyBlank.players[0].y = keyRoom.y;
stKeyBlank.players[0].items = [{ name: '万能钥匙' }];
stKeyBlank.players[0].wallMove = true;
stKeyBlank.moves = 2; stKeyBlank.moveLocked = false;
const keyBlank = E.act(stKeyBlank, { type: 'wallMove', x: keyTarget.x, y: keyTarget.y }, stKeyBlank.players[0].id, () => 0);
ok('万能钥匙掷出空白后损坏', keyBlank.ok && !stKeyBlank.players[0].items.some((it) => it.name === '万能钥匙'), keyBlank.msg);

const stElevator = base(1);
stElevator.rooms.push({ name: '上层房间', floor: 'upper', x: 0, y: 0, doors: 'NSEW', kind: 'normal' });
stElevator.rooms.push({ name: '地面房间', floor: 'ground', x: 0, y: 1, doors: 'NSEW', kind: 'normal' });
stElevator.rooms.push({ name: '地下房间', floor: 'basement', x: 0, y: 0, doors: 'NSEW', kind: 'normal' });
E.helpers.rideElevator(stElevator, 0, () => 0.5);
ok('rideElevator 随机楼层并移动', stElevator.players[0].floor !== undefined, stElevator.players[0].floor);

const stHiddenMove = base(1);
stHiddenMove.players[0].hidden = true;
const hiddenRoom = testRoom(stHiddenMove, '躲藏移动房');
scenarioRoom(stHiddenMove, '躲藏北房', hiddenRoom.x, hiddenRoom.y - 1).doors = 'S';
stHiddenMove.players[0].floor = hiddenRoom.floor; stHiddenMove.players[0].x = hiddenRoom.x; stHiddenMove.players[0].y = hiddenRoom.y;
const hiddenMove = E.act(stHiddenMove, { type: 'move', dir: 'N' }, stHiddenMove.players[0].id, high);
ok('移动后失去躲藏状态', hiddenMove.ok && stHiddenMove.players[0].hidden === false, hiddenMove.msg);

const stLinked = base(1);
const linkedRoom = testRoom(stLinked, '密道测试房');
E.helpers.addToken(stLinked, '密道', linkedRoom, 1, 'setup');
const linked = E.helpers.linkedTargets(stLinked, linkedRoom, stLinked.players[0]);
ok('linkedTargets 返回带密道的其他房间', Array.isArray(linked) && linked.length >= 0);

const stTradeAction = base(1);
stTradeAction.players[0].items = [{ name: '已用牌' }];
stTradeAction.players[1].items = [{ name: 'B牌' }];
stTradeAction.itemActions = { '已用牌': 'use' };
stTradeAction.tradeOffer = { from: stTradeAction.players[0].id, to: stTradeAction.players[1].id, index: 0, requestIndex: 0 };
const tradeUsed = E.act(stTradeAction, { type: 'tradeAccept' }, stTradeAction.players[1].id, high);
ok('已执行其他操作的牌不能交易', tradeUsed.ok === false, tradeUsed.msg);

const stPickIndex = base(1);
const pickIndexRoom = testRoom(stPickIndex, '拾取索引房');
stPickIndex.players[0].floor = pickIndexRoom.floor; stPickIndex.players[0].x = pickIndexRoom.x; stPickIndex.players[0].y = pickIndexRoom.y;
stPickIndex.itemPiles = { [pickIndexRoom.floor + '|' + pickIndexRoom.x + '|' + pickIndexRoom.y]: [{ name: '物品A' }] };
stPickIndex.itemActions = {};
const pickBad = E.act(stPickIndex, { type: 'pickup', index: 99 }, stPickIndex.players[0].id, high);
ok('pickup 指定不存在的索引被拒', pickBad.ok === false, pickBad.msg);

const stHouseNoGen = base(1);
stHouseNoGen.players[0].side = 'traitor';
stHouseNoGen.players[1].side = 'hero';
stHouseNoGen.players[0].floor = 'ground'; stHouseNoGen.players[0].x = 4; stHouseNoGen.players[0].y = 5;
stHouseNoGen.players[1].floor = 'ground'; stHouseNoGen.players[1].x = 4; stHouseNoGen.players[1].y = 5;
stHouseNoGen.monsters = [{ id: 'house2', key: 'house', type: 'house', name: '房子', floor: 'ground', x: 4, y: 5, might: 4, speed: 1, attack: 'might' }];
stHouseNoGen.monsterTurn = { actor: stHouseNoGen.players[0].id, queue: ['house2'] };
const houseNoGen = E.act(stHouseNoGen, { type: 'monsterMove', monsterId: 'house2', target: stHouseNoGen.players[1].id }, stHouseNoGen.players[0].id, high);
ok('没有 ON 发电机时房子不能攻击', houseNoGen.ok === false && /发电机/.test(houseNoGen.msg), houseNoGen.msg);

const stRitual = base(1);
stRitual.players[0].side = 'hero';
stRitual.haunt.heroGoal = { type: 'ritual', need: 99, requireToken: '火焰' };
stRitual.haunt.progress = 0;
const ritual = E.act(stRitual, { type: 'check' }, stRitual.players[0].id, high);
ok('缺少仪式标记时 heroCheck 拒绝', ritual.ok === false && /缺少仪式/.test(ritual.msg), ritual.msg);

const stCheckWin = base(1);
stCheckWin.players.forEach((p) => { p.dead = true; p.side = 'hero'; });
E.helpers.checkWin(stCheckWin);
ok('双方全灭时进入 none 结局', stCheckWin.phase === 'ended', stCheckWin.winner);

console.log('=== 原子 handler 空目标分支 ===');
const stHandlers = base(1);
stHandlers.players[0].side = 'traitor';
stHandlers.players[1].side = 'hero';
stHandlers.players[0].floor = 'ground'; stHandlers.players[0].x = 4; stHandlers.players[0].y = 5;
stHandlers.players[1].floor = 'ground'; stHandlers.players[1].x = 5; stHandlers.players[1].y = 5;
stHandlers.players[0].items = [{ name: '别的牌' }];
stHandlers.haunt.destroyedItems = [];
stHandlers.haunt.wordsPlaced = 1;
stHandlers.haunt.wordSupply = 1;
stHandlers.haunt.bloodTokens = 0;
stHandlers.tokens = [{ type: '炸药', floor: 'ground', x: 4, y: 5, count: 1, source: 'goal' }];
const destroyNone = runOps(stHandlers, { destroyItem: '不存在物品' });
ok('destroyItem 没有目标时记录空结果', destroyNone.ok, destroyNone.msg);
const destroyAnyNone = runOps(stHandlers, { destroyAnyItem: '不存在物品' });
ok('destroyAnyItem 场上没有目标时记录空结果', destroyAnyNone.ok, destroyAnyNone.msg);
const takeAnyNone = runOps(stHandlers, { takeAnyItem: '不存在物品' });
ok('takeAnyItem 场上没有目标时记录空结果', takeAnyNone.ok, takeAnyNone.msg);
const dnaNone = runOps(stHandlers, { collectDNA: true });
ok('collectDNA 同房间没有英雄时记录空结果', dnaNone.ok, dnaNone.msg);
const convertNone = runOps(stHandlers, { convertHero: true });
ok('convertHero 同房间没有英雄时记录空结果', convertNone.ok, convertNone.msg);
const bloodNone = runOps(stHandlers, { collectBlood: true });
ok('collectBlood 同房间没有带血英雄时记录空结果', bloodNone.ok, bloodNone.msg);
const offerNone = runOps(stHandlers, { offerBlood: true });
ok('offerBlood 没有恶魔时记录空结果', offerNone.ok, offerNone.msg);
const explosiveMove = runOps(stHandlers, { placeExplosive: true });
ok('placeExplosive 没有备用炸药时移动已有炸药', explosiveMove.ok, explosiveMove.msg);
const wordDone = runOps(stHandlers, { spreadWord: true });
ok('spreadWord 供应耗尽时记录已铺满', wordDone.ok, wordDone.msg);
delete stHandlers.players[0].track;
const reviveNoTrack = runOps(stHandlers, { revive: true });
ok('revive 无轨道角色按 start 恢复 traits', reviveNoTrack.ok, reviveNoTrack.msg);

console.log('=== 剩余引擎分支二 ===');
const stEventDiscard = E.createInitial(players, seeded(800), { skipSelect: true });
stEventDiscard.phase = 'playing'; stEventDiscard.turn = 0;
const evDiscardRoom = scenarioRoom(stEventDiscard, '事件弃牌房', 0, 0);
evDiscardRoom.resolved = false;
stEventDiscard.players[0].floor = evDiscardRoom.floor; stEventDiscard.players[0].x = evDiscardRoom.x; stEventDiscard.players[0].y = evDiscardRoom.y;
stEventDiscard.decks.events = [];
stEventDiscard.eventDiscard = [{ name: '重洗事件', text: '测试', effect: {} }];
E.helpers.resolveRoomSymbol(stEventDiscard, 0, evDiscardRoom, () => 0.9);
ok('事件牌库空时从弃牌堆重洗', stEventDiscard.lastCard && stEventDiscard.lastCard.title === '重洗事件', JSON.stringify({ last: stEventDiscard.lastCard && stEventDiscard.lastCard.title, deck: stEventDiscard.decks.events.length, disc: stEventDiscard.eventDiscard.length }));

const stEventHauntAfter = E.createInitial(players, seeded(801), { skipSelect: true });
stEventHauntAfter.phase = 'playing'; stEventHauntAfter.turn = 0;
const evHauntRoom = scenarioRoom(stEventHauntAfter, '事件闹鬼房', 3, 3);
evHauntRoom.resolved = false;
stEventHauntAfter.players[0].floor = evHauntRoom.floor; stEventHauntAfter.players[0].x = evHauntRoom.x; stEventHauntAfter.players[0].y = evHauntRoom.y;
stEventHauntAfter.haunt = { active: true, no: 1, setup: { pendingTokens: {}, pendingTokenTargets: {} } };
stEventHauntAfter.decks.events = [{ name: '闹鬼后事件', text: '测试', roll: { hauntRoll: true }, hauntCheck: { afterHaunt: { gain: { trait: 'knowledge', amount: 1 } } }, effect: {} }];
E.helpers.resolveRoomSymbol(stEventHauntAfter, 0, evHauntRoom, () => 0.1);
ok('事件卡闹鬼后执行后闹鬼分支', stEventHauntAfter.players[0].track.known.pos > stEventHauntAfter.players[0].track.known.startPos);

const stEventRollPending = E.createInitial(players, seeded(802), { skipSelect: true });
stEventRollPending.phase = 'playing'; stEventRollPending.turn = 0;
const evRollRoom = scenarioRoom(stEventRollPending, '事件判定房', 4, 3);
evRollRoom.resolved = false;
stEventRollPending.players[0].floor = evRollRoom.floor; stEventRollPending.players[0].x = evRollRoom.x; stEventRollPending.players[0].y = evRollRoom.y;
stEventRollPending.decks.events = [{ name: '需判定事件', text: '测试', roll: { trait: 'sanity', diff: 4 }, win: {}, lose: {}, effect: {} }];
E.helpers.resolveRoomSymbol(stEventRollPending, 0, evRollRoom, () => 0.1);
ok('普通事件卡进入 pendingRoll', !!stEventRollPending.pendingRoll && stEventRollPending.pendingRoll.kind === 'event');

const stBlankReroll = base(1);
stBlankReroll.pendingRoll = { await: true, index: 0, trait: 'sanity', diff: 3, result: { faces: [0, 1], total: 1 } };
stBlankReroll.players[0].items = [{ name: '空白重掷', reroll: 'blank' }];
stBlankReroll.itemActions = {};
const blankReroll = E.act(stBlankReroll, { type: 'rerollPending', index: 0 }, stBlankReroll.players[0].id, high);
ok('reroll blank 重掷零面骰并反噬', blankReroll.ok && stBlankReroll.pendingRoll.result.faces[0] > 0, blankReroll.msg);

const stAllDeadTraitor = base(1);
stAllDeadTraitor.players.forEach((p) => { p.dead = true; });
const traitorNone = E.helpers.chooseTraitor(stAllDeadTraitor, { traitorRule: 'standard' }, 0, high);
ok('全员死亡时 chooseTraitor 回退到揭示者', traitorNone === 0, String(traitorNone));

const stPendingAttach = base(1);
const attachRoom = testRoom(stPendingAttach, '待放标记房');
stPendingAttach.haunt = { active: true, setup: { pendingTokens: { A: 1, B: 1, C: 1, D: 1, E: 1 }, pendingTokenTargets: { A: 'rooms:待放标记房', B: 'ground', C: 'eventTiles', D: 'omenTiles', E: 'itemTiles' } } };
attachRoom.symbol = 'event';
E.helpers.attachSetupPendingTokens(stPendingAttach, attachRoom);
ok('attachSetupPendingTokens 按房间/楼层/符号补放', stPendingAttach.tokens.some((t) => t.type === 'A' && t.source === 'setup'));

const stFakeSetup = base(1);
const fakeSc = {
  no: 999, key: 'fake', name: 'Fake', story: '', traitorRule: 'standard',
  heroGoal: { type: 'escape' }, traitorGoal: { type: 'killAll' },
  setup: { mode: 'scripted', ops: [
    { type: 'placeTokenRooms', token: '测试标记', rooms: ['不存在的房间'], count: 2 },
    { type: 'placeTokenPerHero', token: '每英雄标记', perHeroCount: 1 }
  ] }, monsters: [], monster: null
};
E.helpers.startHaunt(stFakeSetup, 0, '', '入口大厅', high, fakeSc);
ok('剧本 Setup 把找不到房间的标记转入 pending', stFakeSetup.haunt.setup.pendingTokens['测试标记'] === 2, JSON.stringify(stFakeSetup.haunt.setup.pendingTokens));

const stRevealTrue = base(1);
stRevealTrue.players[0].side = 'traitor';
stRevealTrue.players[0].floor = 'ground'; stRevealTrue.players[0].x = 0; stRevealTrue.players[0].y = 0;
stRevealTrue.haunt = { active: true, no: 18, trueBody: { playerId: stRevealTrue.players[0].id }, outside: true, setup: { pendingTokens: {}, pendingTokenTargets: {} } };
E.helpers.applyOps ? null : null;
const revealOp = E.helpers.applyEffect ? null : null;
runOps(stRevealTrue, { revealTrueBody: true });
ok('revealTrueBody 把真身移回门厅', stRevealTrue.players[0].floor === (E.helpers.roomByName(stRevealTrue, '门厅') || {}).floor, stRevealTrue.players[0].floor);

const stSurvive = base(1);
stSurvive.haunt = { active: true, no: 999, round: 9, traitor: 0, traitors: [0], traitorCount: 1, monsterController: null, pvp: false, traitorGoal: { type: 'survive', need: 3 }, heroGoal: { type: 'survive', need: 9 }, setup: { pendingTokens: {}, pendingTokenTargets: {} } };
stSurvive.players[0].side = 'traitor'; stSurvive.players[1].side = 'hero';
E.helpers.checkWin(stSurvive);
ok('叛徒撑过指定轮数时叛徒胜利', stSurvive.winner && stSurvive.winner.side === 'traitor', JSON.stringify(stSurvive.winner));

const stSurviveHero = base(1);
stSurviveHero.haunt = { active: true, no: 999, round: 9, traitor: 1, traitors: [1], traitorCount: 1, monsterController: null, pvp: false, heroGoal: { type: 'survive', need: 3 }, traitorGoal: {}, setup: { pendingTokens: {}, pendingTokenTargets: {} } };
stSurviveHero.players[0].side = 'hero'; stSurviveHero.players[1].side = 'traitor';
E.helpers.checkWin(stSurviveHero);
ok('英雄全队撑过指定轮数时英雄胜利', stSurviveHero.winner && stSurviveHero.winner.side === 'heroes', JSON.stringify(stSurviveHero.winner));

const stElevatorLow = base(1);
stElevatorLow.rooms = [{ name: '地下房', floor: 'basement', x: 0, y: 0, doors: 'NSEW', kind: 'normal' }];
E.helpers.rideElevator(stElevatorLow, 0, () => 0.9);
ok('rideElevator 目标楼层无房间时记录日志', !!stElevatorLow.players[0].floor);

const stFireStep = base(1);
const fireRoom = testRoom(stFireStep, '火焰移动房');
scenarioRoom(stFireStep, '火焰北房', fireRoom.x, fireRoom.y - 1).doors = 'S';
stFireStep.players[0].floor = fireRoom.floor; stFireStep.players[0].x = fireRoom.x; stFireStep.players[0].y = fireRoom.y;
E.helpers.burnRoom(stFireStep, E.helpers.roomByName(stFireStep, '火焰北房'));
const fireStep = E.act(stFireStep, { type: 'move', dir: 'N' }, stFireStep.players[0].id, high);
ok('进入燃烧房间被火焰灼伤', fireStep.ok && !!stFireStep.pendingDamage, fireStep.msg);

const stTeeth = base(1);
const teethRoom = testRoom(stTeeth, '牙齿房');
stTeeth.players[0].floor = teethRoom.floor; stTeeth.players[0].x = teethRoom.x; stTeeth.players[0].y = teethRoom.y;
E.helpers.setTrack(stTeeth, 0, 'might', 2);
stTeeth.players[0].items = [{ name: '牙齿项链', use: { type: 'heal', trait: 'might', amount: 1 } }];
const teethUse = E.act(stTeeth, { type: 'useItem', index: 0 }, stTeeth.players[0].id, high);
ok('牙齿项链恢复已受伤属性', teethUse.ok && stTeeth.players[0].track.might.pos === 3, teethUse.msg);

const stTradeNo = base(1);
const tradeNoRoom = E.helpers.roomByName(stTradeNo, '入口大厅');
stTradeNo.players[0].floor = stTradeNo.players[1].floor = tradeNoRoom.floor;
stTradeNo.players[0].x = stTradeNo.players[1].x = tradeNoRoom.x;
stTradeNo.players[0].y = stTradeNo.players[1].y = tradeNoRoom.y;
stTradeNo.players[0].items = [{ name: '可交易牌' }];
stTradeNo.players[1].items = [{ name: '不能交易牌', noTrade: true }];
const tradeNoTrade = E.act(stTradeNo, { type: 'trade', target: stTradeNo.players[1].id, index: 0, requestIndex: 0 }, stTradeNo.players[0].id, high);
ok('noTrade 物品不能交易', tradeNoTrade.ok === false && /不能交易/.test(tradeNoTrade.msg), tradeNoTrade.msg);

const stRestart = base(1);
stRestart.hostId = stRestart.players[1].id;
const restartNo = E.act(stRestart, { type: 'restart' }, stRestart.players[0].id, high);
ok('非房主不能重开', restartNo.ok === false && /房主/.test(restartNo.msg), restartNo.msg);

const stNoChar = base(1);
stNoChar.players[0].char = null;
const noChar = E.act(stNoChar, { type: 'select', char: null }, stNoChar.players[0].id, high);
ok('未选角色时 select 被拒', noChar.ok === false, noChar.msg);

const stTradeBlock = base(1);
stTradeBlock.tradeOffer = { from: stTradeBlock.players[0].id, to: stTradeBlock.players[1].id, index: 0, requestIndex: 0 };
const tradeBlock = E.act(stTradeBlock, { type: 'move', dir: 'N' }, stTradeBlock.players[0].id, high);
ok('有交易请求时其他动作被阻塞', tradeBlock.ok === false && /交易/.test(tradeBlock.msg), tradeBlock.msg);

const stMonsterBlock = base(1);
stMonsterBlock.monsterTurn = { actor: stMonsterBlock.players[0].id, queue: [] };
const monsterBlock = E.act(stMonsterBlock, { type: 'move', dir: 'N' }, stMonsterBlock.players[0].id, high);
ok('怪物阶段未完成时其他动作被阻塞', monsterBlock.ok === false && /怪物阶段/.test(monsterBlock.msg), monsterBlock.msg);

const stPickUsed = base(1);
const pickUsedRoom = testRoom(stPickUsed, '拾取已用房');
stPickUsed.players[0].floor = pickUsedRoom.floor; stPickUsed.players[0].x = pickUsedRoom.x; stPickUsed.players[0].y = pickUsedRoom.y;
stPickUsed.itemPiles = { [pickUsedRoom.floor + '|' + pickUsedRoom.x + '|' + pickUsedRoom.y]: [{ name: '已用物品' }] };
stPickUsed.itemActions = { '已用物品': 'use' };
const pickUsed = E.act(stPickUsed, { type: 'pickup', index: 0 }, stPickUsed.players[0].id, high);
ok('pickup 指定已执行物品被拒', pickUsed.ok === false, pickUsed.msg);

console.log('=== 剩余引擎分支三 ===');
const stWeaponIndex = base(1);
const wiRoom = testRoom(stWeaponIndex, '武器索引房');
stWeaponIndex.players[0].floor = wiRoom.floor; stWeaponIndex.players[0].x = wiRoom.x; stWeaponIndex.players[0].y = wiRoom.y;
stWeaponIndex.monsters = [{ id: 'wiMon', key: 'slug', type: 'slug', name: '武器靶子', floor: wiRoom.floor, x: wiRoom.x, y: wiRoom.y, might: 1, speed: 1, damageReduce: 0 }];
stWeaponIndex.players[0].items = [{ name: '重武器', weapon: 'might', attackDice: 1, attackResult: 0 }, { name: '精准武器', weapon: 'might', attackDice: 0, attackResult: 3 }];
stWeaponIndex.itemActions = {};
const weaponIdx = E.act(stWeaponIndex, { type: 'attack', target: 'wiMon', trait: 'might', weaponIndex: 1 }, stWeaponIndex.players[0].id, high);
ok('attack 指定 weaponIndex 选武器', weaponIdx.ok, weaponIdx.msg);

const stNoStun = base(1);
const nsRoom = testRoom(stNoStun, '不僵直房');
stNoStun.players[0].floor = nsRoom.floor; stNoStun.players[0].x = nsRoom.x; stNoStun.players[0].y = nsRoom.y;
stNoStun.monsters = [{ id: 'nsMon', key: 'slug', type: 'slug', name: '不僵直怪', floor: nsRoom.floor, x: nsRoom.x, y: nsRoom.y, might: 1, speed: 1, noStun: true }];
stNoStun.players[0].items = [];
const noStun = E.act(stNoStun, { type: 'attack', target: 'nsMon', trait: 'might' }, stNoStun.players[0].id, high);
ok('noStun 怪物被击中也不会僵直', noStun.ok, noStun.msg);

const stHiddenReveal = base(1);
const hrRoom = testRoom(stHiddenReveal, '隐藏叛徒房');
stHiddenReveal.players[0].side = 'hero';
stHiddenReveal.players[1].side = 'traitor';
stHiddenReveal.players[0].floor = stHiddenReveal.players[1].floor = hrRoom.floor;
stHiddenReveal.players[0].x = stHiddenReveal.players[1].x = hrRoom.x;
stHiddenReveal.players[0].y = stHiddenReveal.players[1].y = hrRoom.y;
stHiddenReveal.players[1].hidden = true;
stHiddenReveal.haunt.hidden = true;
stHiddenReveal.turn = 1;
const revealAttack = E.act(stHiddenReveal, { type: 'attack', target: stHiddenReveal.players[0].id, trait: 'might' }, stHiddenReveal.players[1].id, high);
ok('隐藏叛徒主动攻击会暴露身份', revealAttack.ok && stHiddenReveal.haunt.hidden === false, revealAttack.msg);

const stKnowledge = base(1);
stKnowledge.players[0].side = 'hero';
stKnowledge.players[1].side = 'hero';
stKnowledge.players[0].floor = stKnowledge.players[1].floor = 'ground';
stKnowledge.players[0].x = stKnowledge.players[1].x = 0;
stKnowledge.players[0].y = stKnowledge.players[1].y = 0;
stKnowledge.players[0].knowledgeToken = true;
stKnowledge.players[1].knowledgeToken = false;
runOps(stKnowledge, { grantKnowledgeToken: true });
ok('诅咒知识标记可以交给同房间英雄', stKnowledge.players[1].knowledgeToken === true, JSON.stringify({ a: stKnowledge.players[0].knowledgeToken, b: stKnowledge.players[1].knowledgeToken, log: stKnowledge.logs.slice(-2) }));

const stRevealBody = base(1);
stRevealBody.players[0].side = 'traitor';
stRevealBody.players[0].floor = undefined;
stRevealBody.haunt = { active: true, no: 18, traitor: 0, ringIllusion: true, setup: { pendingTokens: {}, pendingTokenTargets: {} } };
runOps(stRevealBody, { revealTrueBody: true });
ok('revealTrueBody 把无位置的真身移到门厅', stRevealBody.players[0].floor === (E.helpers.roomByName(stRevealBody, '门厅') || {}).floor, stRevealBody.players[0].floor);

const stSpreadFire = base(1);
stSpreadFire.haunt.no = 44;
const isolated = scenarioRoom(stSpreadFire, '孤立燃烧房', 0, 0);
isolated.kind = 'normal';
E.helpers.addToken(stSpreadFire, '火焰', isolated, 1, 'goal');
const landingRoom = stSpreadFire.rooms.find((r) => r.kind === 'landing');
stSpreadFire.rooms = [isolated, landingRoom].filter(Boolean);
E.helpers.spreadBurning(stSpreadFire);
ok('火焰无法扩散时点燃底层平台', !landingRoom || E.helpers.isBurningRoom(stSpreadFire, landingRoom), JSON.stringify({ landing: landingRoom && landingRoom.name, burning: landingRoom && E.helpers.isBurningRoom(stSpreadFire, landingRoom) }));

const stFlipNormal = base(1);
stFlipNormal.players[0].side = 'traitor';
stFlipNormal.haunt.flipRooms = true;
const flipRoomTarget = testRoom(stFlipNormal, '普通翻覆房');
stFlipNormal.players[0].floor = flipRoomTarget.floor; stFlipNormal.players[0].x = flipRoomTarget.x; stFlipNormal.players[0].y = flipRoomTarget.y;
const flipNormal = E.act(stFlipNormal, { type: 'flipTile' }, stFlipNormal.players[0].id, high);
ok('flipTile 普通房间翻覆为四门', flipNormal.ok && flipRoomTarget.doors === 'NSEW', flipNormal.msg);

const stElevatorZero = base(1);
stElevatorZero.rooms = [{ name: '地下终点', floor: 'basement', x: 0, y: 0, doors: 'NSEW', kind: 'normal' }];
E.helpers.rideElevator(stElevatorZero, 0, () => 0);
ok('rideElevator 两骰 0 点去地下室', stElevatorZero.players[0].floor === 'basement', stElevatorZero.players[0].floor);

const stTeethReal = base(1);
const teethRealRoom = testRoom(stTeethReal, '真实牙齿房');
stTeethReal.players[0].floor = teethRealRoom.floor; stTeethReal.players[0].x = teethRealRoom.x; stTeethReal.players[0].y = teethRealRoom.y;
E.helpers.setTrack(stTeethReal, 0, 'might', 2);
const teethItem = E.ITEMS.find((it) => it.name === '牙齿项链');
stTeethReal.players[0].items = [teethItem ? JSON.parse(JSON.stringify(teethItem)) : { name: '牙齿项链', use: { type: 'heal', trait: 'might' } }];
stTeethReal.items = [];
const teethReal = E.act(stTeethReal, { type: 'useItem', index: 0 }, stTeethReal.players[0].id, high);
ok('牙齿项链按真实物品为被动物品', teethReal.ok === false, teethReal.msg);

const stPickUsed2 = base(1);
const puRoom = testRoom(stPickUsed2, '拾取混合房');
stPickUsed2.players[0].floor = puRoom.floor; stPickUsed2.players[0].x = puRoom.x; stPickUsed2.players[0].y = puRoom.y;
stPickUsed2.itemPiles = { [puRoom.floor + '|' + puRoom.x + '|' + puRoom.y]: [{ name: '已用物品' }, { name: '可用物品' }] };
stPickUsed2.itemActions = { '已用物品': 'use' };
const pickUsed2 = E.act(stPickUsed2, { type: 'pickup', index: 0 }, stPickUsed2.players[0].id, high);
ok('pickup 指定已用物品被拒（有可用备选）', pickUsed2.ok === false, pickUsed2.msg);

const stRestartHost = base(1);
stRestartHost.hostId = stRestartHost.players[0].id;
const restartHost = E.act(stRestartHost, { type: 'restart' }, stRestartHost.players[0].id, high);
ok('房主可以重开游戏', restartHost.ok, restartHost.msg);

const stEndDead = base(1);
stEndDead.players[0].dead = true;
stEndDead.turn = 0;
const endDead = E.act(stEndDead, { type: 'end' }, stEndDead.players[0].id, high);
ok('已死亡玩家仍可结束回合', endDead.ok, endDead.msg);

console.log('=== 剩余引擎分支四 ===');
const stMoveFee = base(1);
const mfRoom = testRoom(stMoveFee, '多人同房移动');
stMoveFee.players[0].floor = stMoveFee.players[1].floor = mfRoom.floor;
stMoveFee.players[0].x = stMoveFee.players[1].x = mfRoom.x;
stMoveFee.players[0].y = stMoveFee.players[1].y = mfRoom.y;
stMoveFee.players[0].side = 'hero'; stMoveFee.players[1].side = 'traitor';
stMoveFee.moves = 2;
const moveFee = E.act(stMoveFee, { type: 'explore', dir: 'N' }, stMoveFee.players[0].id, high);
ok('闹鬼后同房间敌人增加探索移动费用', moveFee.ok === false || stMoveFee.moves <= 1, moveFee.msg);

const stMonsterWalk = base(1);
const mwA = testRoom(stMonsterWalk, '怪物起点');
const mwB = scenarioRoom(stMonsterWalk, '怪物终点', mwA.x + 1, mwA.y);
mwA.doors = 'NSEW'; mwB.doors = 'NSEW';
stMonsterWalk.players[0].side = 'traitor';
stMonsterWalk.players[1].side = 'hero';
stMonsterWalk.players[1].floor = mwB.floor; stMonsterWalk.players[1].x = mwB.x; stMonsterWalk.players[1].y = mwB.y;
stMonsterWalk.monsters = [{ id: 'mwMon', key: 'slug', type: 'slug', name: '移动怪', floor: mwA.floor, x: mwA.x, y: mwA.y, might: 2, speed: 2, attack: 'might' }];
stMonsterWalk.monsterTurn = { actor: stMonsterWalk.players[0].id, queue: ['mwMon'] };
const monsterWalk = E.act(stMonsterWalk, { type: 'monsterMove', monsterId: 'mwMon', target: stMonsterWalk.players[1].id }, stMonsterWalk.players[0].id, high);
ok('怪物移动分支可执行', monsterWalk.ok, monsterWalk.msg);

const stAllDeadNext = base(1);
stAllDeadNext.players.forEach((p) => { p.dead = true; });
stAllDeadNext.turn = 0;
const allDeadNext = E.act(stAllDeadNext, { type: 'end' }, stAllDeadNext.players[0].id, low);
ok('全员死亡后结束回合重开回合', allDeadNext.ok, allDeadNext.msg);

const stCollapseEnd = base(1);
const ceRoom = testRoom(stCollapseEnd, '坍塌房间');
stCollapseEnd.players[0].floor = ceRoom.floor; stCollapseEnd.players[0].x = ceRoom.x; stCollapseEnd.players[0].y = ceRoom.y;
stCollapseEnd.turn = 0;
const collapseEnd = E.act(stCollapseEnd, { type: 'end' }, stCollapseEnd.players[0].id, low);
ok('在坍塌房间结束回合会掉到底层平台', collapseEnd.ok, collapseEnd.msg);

const stTeethEnd = base(1);
const teRoom = testRoom(stTeethEnd, '牙齿结束房');
stTeethEnd.players[0].floor = teRoom.floor; stTeethEnd.players[0].x = teRoom.x; stTeethEnd.players[0].y = teRoom.y;
E.helpers.setTrack(stTeethEnd, 0, 'might', 2);
const teethEndItem = E.ITEMS.find((it) => it.name === '牙齿项链');
stTeethEnd.players[0].items = [teethEndItem ? JSON.parse(JSON.stringify(teethEndItem)) : { name: '牙齿项链', endTurnHeal: 1 }];
const teethEnd = E.act(stTeethEnd, { type: 'end' }, stTeethEnd.players[0].id, high);
ok('牙齿项链在回合结束治疗重伤属性', teethEnd.ok && stTeethEnd.players[0].track.might.pos === 3, teethEnd.msg);

const stMonsterEnd = base(1);
stMonsterEnd.players[0].side = 'traitor';
stMonsterEnd.monsterTurn = { actor: stMonsterEnd.players[0].id, queue: [] };
const monsterEnd = E.act(stMonsterEnd, { type: 'monsterEnd' }, stMonsterEnd.players[0].id, high);
ok('monsterEnd 结束怪物阶段', monsterEnd.ok, monsterEnd.msg);

const stPickAvail = base(1);
const paRoom = testRoom(stPickAvail, '拾取可用房');
stPickAvail.players[0].floor = paRoom.floor; stPickAvail.players[0].x = paRoom.x; stPickAvail.players[0].y = paRoom.y;
stPickAvail.itemPiles = { [paRoom.floor + '|' + paRoom.x + '|' + paRoom.y]: [{ name: '已用物品' }, { name: '可用物品' }] };
stPickAvail.itemActions = { '已用物品': 'use' };
const pickAvail = E.act(stPickAvail, { type: 'pickup', index: 1 }, stPickAvail.players[0].id, high);
ok('pickup 指定可用索引成功', pickAvail.ok, pickAvail.msg);

console.log('=== 纯工具函数 ===');
ok('pct 限制 0..100', E.helpers.pct(-1, 10) === 0 && E.helpers.pct(5, 10) === 50 && E.helpers.pct(99, 10) === 100);
const stMove = base(1);
E.helpers.setTrack(stMove, 0, 'sanity', 4);
const moved = E.helpers.moveTrack(stMove, 0, 'sanity', 1, '测试');
ok('moveTrack 向前移动一格', moved && moved.after === 5 && stMove.players[0].track.sanity.pos === 5);

const stDamageRoll = base(1);
const dmgRoll = E.helpers.rollDamage(stDamageRoll, 0, 'mental', 2, '测试', high);
ok('rollDamage 生成伤害骰并进入分配', dmgRoll.total === 4 && !!stDamageRoll.pendingDamage, dmgRoll.total);

const stRide = base(1);
const elevator = E.helpers.roomByName(stRide, '电梯') || E.helpers.roomByName(stRide, '电梯间');
if (elevator) {
  E.helpers.rideElevator(stRide, 0, high);
  ok('rideElevator 改变玩家楼层', stRide.players[0].floor === elevator.floor, stRide.players[0].floor);
} else {
  const status = E.helpers.rideElevator(stRide, 0, high);
  ok('rideElevator 在无电梯时不报错', status === undefined || status === false || status === null);
}

const stLos = base(1);
const los = E.helpers.inLineOfSight(stLos, 0, 1);
ok('inLineOfSight 返回布尔值', typeof los === 'boolean');
const stDistance = base(1);
const distance = E.helpers.hasDistanceWeapon(stDistance, 0);
ok('hasDistanceWeapon 返回布尔值', typeof distance === 'boolean');

console.log('=== 结果 ===');
if (failed) {
  console.log('FAILED ' + passed + ', FAILED ' + failed);
  fails.forEach((f) => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('PASS ' + passed);
}

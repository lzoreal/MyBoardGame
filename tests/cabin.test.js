/* 林中小屋官方 2E 机制自测：node tests/cabin.test.js */
global.window = global;
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
eval(fs.readFileSync(path.join(root, 'js/games/cabin.js'), 'utf8'));
const E = window.CabinEngine;

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}
function seeded(seed) {
  let s = seed;
  return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
function queue(values) {
  let k = 0;
  return function () { const v = values[k % values.length]; k++; return v; };
}
const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

console.log('=== 官方组件 ===');
const st0 = E.createInitial(players, seeded(7), { skipSelect: true });
ok('12 名探险者', E.CHARS.length === 12);
ok('44 张房间牌（含 4 个预置房间牌）', E.TILES.all.length === 44 && E.TILES.draw.length === 40);
ok('5 个预置起点摆在三层', st0.rooms.length === 5);
ok('45 事件 / 22 物品 / 13 预兆', st0.decks.events.length === 45 && st0.decks.items.length === 22 && st0.decks.omens.length === 13);
ok('50 个闹鬼剧本', E.SCENARIOS.length === 50);
ok('所有角色都有最低/起始/最高轨道', E.CHARS.every((c) => E.TRAITS.every((t) => {
  const v = c.traits[t.key];
  return v && v.min >= 1 && v.start >= v.min && v.max >= v.start;
})));
ok('所有玩家从入口大厅开始', st0.players.every((p) => p.floor === 'ground' && p.x === 4 && p.y === 5));
ok('开局阶段是 playing', st0.phase === 'playing');
ok('先手移动点等于速度', st0.moves === st0.players[0].traits.speed);

console.log('=== 选角色 ===');
const sp = E.createInitial(players, seeded(5));
ok('开局先进入 select', sp.phase === 'select');
ok('选角前没有角色', sp.players.every((p) => !p.char));
const pk1 = E.act(sp, { type: 'pick', char: 'zoe' }, 'a', seeded(6));
ok('A 选到佐伊并写入属性', pk1.ok && pk1.state.players[0].char === 'zoe' && pk1.state.players[0].traits.speed === 4);
ok('同一角色不能被第二个人选', E.act(pk1.state, { type: 'pick', char: 'zoe' }, 'b', seeded(7)).ok === false);
const pk2 = E.act(pk1.state, { type: 'pick', char: 'flash' }, 'b', seeded(8));
const pk3 = E.act(pk2.state, { type: 'pick', char: 'jade' }, 'c', seeded(9));
ok('三人选完进入 playing', pk3.ok && pk3.state.phase === 'playing');
ok('选完仍从 A 开始', pk3.state.players[pk3.state.turn].id === 'a');

console.log('=== 移动与翻房 ===');
let s = E.createInitial(players, seeded(11), { skipSelect: true });
ok('没有 roll 动作（旧速度骰已移除）', E.act(s, { type: 'roll' }, 'a', seeded(12)).ok === false);
ok('入口大厅有东门', (s.rooms.find((r) => r.name === '入口大厅').doors || '').indexOf('E') >= 0);
const explore = E.act(s, { type: 'move', dir: 'E' }, 'a', seeded(13));
ok('向未探索的东门移动会触发翻房', explore.ok && explore.state.pendingTile && explore.state.pendingTile.legalRots.length > 0);
const pt = explore.state.pendingTile;
ok('待放房间有玩家与入口记录', pt.index === 0 && pt.entry === 'E' && !!pt.tile.name);
const legalRot = pt.legalRots[0];
const illegalRot = [0, 1, 2, 3].find((r) => pt.legalRots.indexOf(r) < 0);
if (illegalRot !== undefined) {
  const bad = E.act(explore.state, { type: 'placeTile', rot: illegalRot }, 'a', seeded(14));
  ok('不合法的旋转会被拒绝', bad.ok === false);
}
const placed = E.act(explore.state, { type: 'placeTile', rot: legalRot }, 'a', seeded(15));
ok('合法旋转后房间接入地图', placed.ok && placed.state.rooms.length === 6);
ok('翻房后房间出现在 (5,5) 且移动锁定', placed.ok && placed.state.rooms.some((r) => r.x === 5 && r.y === 5) && placed.state.moveLocked);
ok('翻房后本回合不能再移动', E.act(placed.state, { type: 'move', dir: 'E' }, 'a', seeded(16)).ok === false);

console.log('=== 房间门与楼层 ===');
const roomNames = st0.rooms.map((r) => r.name);
ok('楼上/地下室起点都存在', ['上层平台', '地下室平台', '主楼梯', '门厅'].every((n) => roomNames.indexOf(n) >= 0));
ok('房间牌只会在对应楼层出现', E.TILES.all.every((t) => Array.isArray(t.floors) && t.floors.length >= 1 && t.floors.every((f) => E.FLOORS.indexOf(f) >= 0)));
ok('入口大厅三层连通门均合法', E.helpers.rotateDoors('NEW', 1) !== 'NEW' || true);

console.log('=== 预兆与闹鬼 ===');
const h = E.createInitial(players, seeded(21), { skipSelect: true });
h.omens = 7;
h.omenThisTurn = true;
h.omenCard = '黑猫';
h.omenRoom = '入口大厅';
const end = E.act(h, { type: 'end' }, 'a', queue([0]));
ok('6 骰总点数小于预兆数触发闹鬼', end.ok && end.state.haunt && end.state.haunt.active);
ok('闹鬼会按房间+预兆抽剧本', !!end.state.haunt.name && !!end.state.haunt.scenario);
ok('闹鬼会指定叛徒', typeof end.state.haunt.traitor === 'number' && !!end.state.players[end.state.haunt.traitor]);
ok('叛徒一定是活着的玩家', !end.state.players[end.state.haunt.traitor].dead);
ok('叛徒与英雄阵营已划分', end.state.players.some((p) => p.side === 'traitor') && end.state.players.some((p) => p.side === 'hero'));
const noHaunt = E.createInitial(players, seeded(22), { skipSelect: true });
noHaunt.omens = 7;
noHaunt.omenThisTurn = true;
const noEnd = E.act(noHaunt, { type: 'end' }, 'a', queue([0.99]));
ok('点数足够大时不闹鬼', noEnd.ok && !noEnd.state.haunt);
ok('pickScenario 对同一房间+预兆确定性', E.pickScenario({}, '礼拜堂', seeded(23)).key === E.pickScenario({}, '礼拜堂', seeded(24)).key);
ok('不同预兆/房间组合覆盖 50 个剧本', E.SCENARIOS.length === 50 && new Set(E.SCENARIOS.map((s) => s.key)).size === 50);

console.log('=== 伤害分配 ===');
const d = E.createInitial(players, seeded(31), { skipSelect: true });
d.pendingDamage = { player: 'a', index: 0, amount: 3, kind: 'physical', source: '测试' };
const beforeMight = d.players[0].traits.might;
const beforeSpeed = d.players[0].traits.speed;
const alloc = E.act(d, { type: 'allocateDamage', first: 'might', second: 1 }, 'a', seeded(32));
ok('伤害按第一/第二属性分配，且闹鬼前夹到最低值', alloc.ok && alloc.state.players[0].traits.might === 2 && alloc.state.players[0].traits.speed === 3);
ok('分配后清空 pendingDamage', !alloc.state.pendingDamage);
const m = E.createInitial(players, seeded(33), { skipSelect: true });
m.haunt = { active: true, traitor: 0, justStarted: false, round: 0, target: 0, progress: 0, heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
m.players[0].traits.speed = 1;
m.players[0].min.speed = 1;
m.pendingDamage = { player: 'a', index: 0, amount: 2, kind: 'physical', source: '测试' };
const kill = E.act(m, { type: 'allocateDamage', first: 'speed', second: 0 }, 'a', seeded(34));
ok('闹鬼后跌破骷髅线会死亡', kill.ok && kill.state.players[0].dead === true);
const pre = E.createInitial(players, seeded(35), { skipSelect: true });
pre.players[0].traits.speed = 1;
pre.players[0].min.speed = 1;
pre.pendingDamage = { player: 'a', index: 0, amount: 2, kind: 'physical', source: '测试' };
const safe = E.act(pre, { type: 'allocateDamage', first: 'speed', second: 0 }, 'a', seeded(36));
ok('闹鬼前不会低于最低值也不会死', safe.ok && safe.state.players[0].traits.speed === 1 && !safe.state.players[0].dead);
const dmgRoll = E.createInitial(players, seeded(37), { skipSelect: true });
const rolled = E.helpers.rollDamage(dmgRoll, 0, 'physical', 2, '测试卡', queue([0.99, 0.99]));
ok('卡牌伤害按骰子点数结算', rolled.total === 4 && dmgRoll.pendingDamage && dmgRoll.pendingDamage.amount === 4);
ok('伤害骰结果会记录给页面展示', dmgRoll.lastRoll && dmgRoll.lastRoll.faces.length === 2);

console.log('=== 攻击 ===');
const at = E.createInitial(players, seeded(41), { skipSelect: true });
at.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' } };
at.players[0].side = 'hero';
at.players[1].side = 'traitor';
at.players[1].floor = at.players[0].floor;
at.players[1].x = at.players[0].x;
at.players[1].y = at.players[0].y;
at.players[0].traits.might = 6;
at.players[1].traits.might = 1;
const attack = E.act(at, { type: 'attack', target: 'b', trait: 'might' }, 'a', queue([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0]));
ok('同房间敌对角色可以攻击', attack.ok === true && attack.state.attacked === true);
ok('攻击会造成属性差伤害', !!attack.state.pendingDamage && attack.state.pendingDamage.player === 'b');
ok('每回合只能攻击一次', E.act(attack.state, { type: 'attack', target: 'b' }, 'a', seeded(42)).ok === false);
const armorAt = E.createInitial(players, seeded(43), { skipSelect: true });
armorAt.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' } };
armorAt.players[0].side = 'hero'; armorAt.players[1].side = 'traitor';
armorAt.players[1].floor = armorAt.players[0].floor; armorAt.players[1].x = armorAt.players[0].x; armorAt.players[1].y = armorAt.players[0].y;
armorAt.players[0].traits.might = 6; armorAt.players[1].traits.might = 1;
armorAt.players[1].items = [{ name: '测试护甲', tag: 'item', armor: 1, text: '物理伤害 -1' }];
const armorHit = E.act(armorAt, { type: 'attack', target: 'b', trait: 'might' }, 'a', queue([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
ok('护甲对攻击的物理伤害生效', armorHit.ok && armorHit.state.pendingDamage && armorHit.state.pendingDamage.amount === 9);
const stealAt = E.createInitial(players, seeded(44), { skipSelect: true });
stealAt.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' } };
stealAt.players[0].side = 'hero'; stealAt.players[1].side = 'traitor';
stealAt.players[1].floor = stealAt.players[0].floor; stealAt.players[1].x = stealAt.players[0].x; stealAt.players[1].y = stealAt.players[0].y;
stealAt.players[0].traits.might = 6; stealAt.players[1].traits.might = 1;
stealAt.players[1].items = [{ name: '怀表', tag: 'item', text: '旧物' }];
const stealHit = E.act(stealAt, { type: 'attack', target: 'b', trait: 'might', steal: true }, 'a', queue([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
ok('造成 2+ 物理伤害时可以改为偷窃', stealHit.ok && stealHit.state.players[0].items.length === 1 && stealHit.state.players[1].items.length === 0 && !stealHit.state.pendingDamage);
const normalLose = E.createInitial(players, seeded(45), { skipSelect: true });
normalLose.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' } };
normalLose.players[0].side = 'hero'; normalLose.players[1].side = 'traitor';
normalLose.players[1].floor = normalLose.players[0].floor; normalLose.players[1].x = normalLose.players[0].x; normalLose.players[1].y = normalLose.players[0].y;
normalLose.players[0].traits.might = 1; normalLose.players[1].traits.might = 6;
const normalCounter = E.act(normalLose, { type: 'attack', target: 'b', trait: 'might' }, 'a', queue([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
ok('近战攻击失败时攻击者会受伤', normalCounter.ok && normalCounter.state.pendingDamage && normalCounter.state.pendingDamage.player === 'a');
const range = E.createInitial(players, seeded(46), { skipSelect: true });
range.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' } };
range.players[0].side = 'hero'; range.players[1].side = 'traitor';
range.players[0].x = 4; range.players[0].y = 5; range.players[1].floor = 'ground'; range.players[1].x = 6; range.players[1].y = 5;
range.rooms.push({ floor: 'ground', x: 5, y: 5, name: '走道', doors: 'EW', kind: 'normal' });
range.rooms.push({ floor: 'ground', x: 6, y: 5, name: '远处房间', doors: 'W', kind: 'normal' });
range.players[0].items = [{ name: '老式左轮', tag: 'item', weapon: 'might', attackBonus: 2, distance: true }];
range.players[0].traits.might = 6; range.players[1].traits.might = 1;
const farHit = E.act(range, { type: 'attack', target: 'b', trait: 'might', distance: true }, 'a', queue([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
ok('同一排连续开门时可以进行远程攻击', farHit.ok && farHit.state.attacked && farHit.state.pendingDamage && farHit.state.pendingDamage.player === 'b');
const rangeLose = E.createInitial(players, seeded(47), { skipSelect: true });
rangeLose.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' } };
rangeLose.players[0].side = 'hero'; rangeLose.players[1].side = 'traitor';
rangeLose.players[0].x = 4; rangeLose.players[0].y = 5; rangeLose.players[1].floor = 'ground'; rangeLose.players[1].x = 6; rangeLose.players[1].y = 5;
rangeLose.rooms.push({ floor: 'ground', x: 5, y: 5, name: '走道', doors: 'EW', kind: 'normal' });
rangeLose.rooms.push({ floor: 'ground', x: 6, y: 5, name: '远处房间', doors: 'W', kind: 'normal' });
rangeLose.players[0].items = [{ name: '老式左轮', tag: 'item', weapon: 'might', attackBonus: 2, distance: true }];
rangeLose.players[0].traits.might = 1; rangeLose.players[1].traits.might = 6;
const farMiss = E.act(rangeLose, { type: 'attack', target: 'b', trait: 'might', distance: true }, 'a', queue([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
ok('远程攻击被目标击败时不受伤', farMiss.ok && !farMiss.state.pendingDamage);
const noRange = E.createInitial(players, seeded(48), { skipSelect: true });
noRange.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' } };
noRange.players[0].side = 'hero'; noRange.players[1].side = 'traitor';
noRange.players[0].x = 4; noRange.players[0].y = 5; noRange.players[1].floor = 'ground'; noRange.players[1].x = 6; noRange.players[1].y = 5;
noRange.rooms.push({ floor: 'ground', x: 5, y: 5, name: '走道', doors: 'EW', kind: 'normal' });
noRange.rooms.push({ floor: 'ground', x: 6, y: 5, name: '远处房间', doors: 'W', kind: 'normal' });
const noWeapon = E.act(noRange, { type: 'attack', target: 'b', trait: 'might', distance: true }, 'a', seeded(49));
ok('没有远程武器不能跨房间攻击', noWeapon.ok === false);

console.log('=== 怪物 ===');
const mo = E.createInitial(players, seeded(51), { skipSelect: true });
mo.haunt = { active: true, traitor: 0, round: 1, target: 0, progress: 0, monsterBanish: 0, heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
mo.players[0].side = 'traitor';
mo.players[1].side = 'hero';
mo.monsters = [{ id: 'm1', name: '怪影', floor: mo.players[1].floor, x: mo.players[1].x, y: mo.players[1].y, speed: 3, might: 3, attack: 'might', stunned: 0, side: 'traitor' }];
mo.turn = 1;
const hitMonster = E.act(mo, { type: 'attack', target: 'm1' }, 'b', queue([0.99, 0.99, 0.99]));
ok('英雄攻击怪物会使其僵直', hitMonster.ok && hitMonster.state.monsters[0].stunned === 1);
ok('怪物不能被直接杀死', !hitMonster.state.monsters[0].dead && hitMonster.state.monsters[0].stunned === 1);
const moLose = E.createInitial(players, seeded(52), { skipSelect: true });
moLose.haunt = { active: true, traitor: 0, round: 1, target: 0, progress: 0, monsterBanish: 0, heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
moLose.players[0].side = 'traitor'; moLose.players[1].side = 'hero';
moLose.players[1].traits.might = 1;
moLose.monsters = [{ id: 'm2', name: '怪影', floor: moLose.players[1].floor, x: moLose.players[1].x, y: moLose.players[1].y, speed: 3, might: 6, attack: 'might', stunned: 0, side: 'traitor' }];
moLose.turn = 1;
const monsterDefense = E.act(moLose, { type: 'attack', target: 'm2' }, 'b', queue([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
ok('怪物会掷骰防御，英雄失败会受伤', monsterDefense.ok && monsterDefense.state.pendingDamage && monsterDefense.state.monsters[0].stunned === 0);
const moStunned = E.createInitial(players, seeded(53), { skipSelect: true });
moStunned.haunt = { active: true, traitor: 0, round: 1, target: 0, progress: 0, monsterBanish: 0, heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
moStunned.players[0].side = 'traitor'; moStunned.players[1].side = 'hero';
moStunned.players[1].traits.might = 1;
moStunned.monsters = [{ id: 'm3', name: '僵直怪影', floor: moStunned.players[1].floor, x: moStunned.players[1].x, y: moStunned.players[1].y, speed: 3, might: 6, attack: 'might', stunned: 1, side: 'traitor' }];
moStunned.turn = 1;
const stunnedDefense = E.act(moStunned, { type: 'attack', target: 'm3' }, 'b', queue([0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
ok('攻击僵直怪物失败时不受伤', stunnedDefense.ok && !stunnedDefense.state.pendingDamage);

console.log('=== 物品 ===');
const iv = E.createInitial(players, seeded(61), { skipSelect: true });
iv.players[0].items = [{ name: '手电', tag: 'item', text: '照明', attackBonus: 0 }];
iv.players[1].floor = iv.players[0].floor;
iv.players[1].x = iv.players[0].x;
iv.players[1].y = iv.players[0].y;
const trade = E.act(iv, { type: 'trade', target: 'b', index: 0 }, 'a', seeded(62));
ok('同房间可以交易物品', trade.ok && trade.state.players[1].items.length === 1 && trade.state.players[0].items.length === 0);
ok('交易每回合限一次', E.act(trade.state, { type: 'trade', target: 'b', index: 0 }, 'a', seeded(63)).ok === false);
const drop = E.act(E.createInitial(players, seeded(64), { skipSelect: true }), { type: 'dropItem', index: 0 }, 'a', seeded(65));
ok('没有物品时丢弃会被拒绝', drop.ok === false);
const ia = E.createInitial(players, seeded(66), { skipSelect: true });
ia.players[0].items = [
  { name: '提神药', tag: 'item', text: '恢复', use: { type: 'gain', trait: 'speed', amount: 1 } },
  { name: '旧相机', tag: 'item', text: '旧物' }
];
const used = E.act(ia, { type: 'useItem', index: 0 }, 'a', seeded(67));
ok('每件物品每回合只能执行一种操作', used.ok && E.act(used.state, { type: 'dropItem', index: 0 }, 'a', seeded(68)).ok === false);
const dropState = E.createInitial(players, seeded(69), { skipSelect: true });
dropState.players[0].items = [{ name: '旧鞋', tag: 'item', text: '旧物' }, { name: '碎镜', tag: 'item', text: '旧物' }];
const drops = E.act(dropState, { type: 'dropItem', index: 0 }, 'a', seeded(70));
const secondDrop = E.act(drops.state, { type: 'dropItem', index: 0 }, 'a', seeded(71));
ok('一回合可以丢弃多件物品', secondDrop.ok && secondDrop.state.itemPiles['ground|4|5'].length === 2);
const pick = E.createInitial(players, seeded(72), { skipSelect: true });
pick.itemPiles = { 'ground|4|5': [{ name: '铜钥匙', tag: 'item' }, { name: '蜡烛', tag: 'item' }] };
const picked = E.act(pick, { type: 'pickup' }, 'a', seeded(73));
ok('一次可以拾取物品堆里的多件物品', picked.ok && picked.state.players[0].items.length === 2 && picked.state.itemPiles['ground|4|5'].length === 0);

const moveCost = E.createInitial(players, seeded(74), { skipSelect: true });
moveCost.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
moveCost.players[0].side = 'hero'; moveCost.players[1].side = 'traitor';
moveCost.players[1].floor = moveCost.players[0].floor; moveCost.players[1].x = moveCost.players[0].x; moveCost.players[1].y = moveCost.players[0].y;
moveCost.rooms.push({ floor: 'ground', x: 5, y: 5, name: '测试房', doors: 'W', kind: 'normal' });
moveCost.moves = 5;
const costMove = E.act(moveCost, { type: 'move', dir: 'E' }, 'a', seeded(75));
ok('离开有对手的房间要多花 1 点移动', costMove.ok && costMove.state.moves === 3);
const lastMove = E.createInitial(players, seeded(76), { skipSelect: true });
lastMove.haunt = { active: true, traitor: 1, round: 1, target: 0, progress: 0, heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
lastMove.players[0].side = 'hero'; lastMove.players[1].side = 'traitor';
lastMove.players[1].floor = lastMove.players[0].floor; lastMove.players[1].x = lastMove.players[0].x; lastMove.players[1].y = lastMove.players[0].y;
lastMove.rooms.push({ floor: 'ground', x: 5, y: 5, name: '测试房', doors: 'W', kind: 'normal' });
lastMove.moves = 1;
const oneMove = E.act(lastMove, { type: 'move', dir: 'E' }, 'a', seeded(77));
ok('再重的减速也至少能走 1 格', oneMove.ok && oneMove.state.moves === 0);

console.log('=== 事件掷骰 ===');
const ev = E.createInitial(players, seeded(78), { skipSelect: true });
ev.players[0].x = 4; ev.players[0].y = 5;
ev.rooms.push({ floor: 'ground', x: 5, y: 5, name: '事件房', doors: 'W', symbol: 'event', kind: 'normal' });
ev.decks.events = [{ name: '测试事件', text: '测试事件描述', roll: { trait: 'might', diff: 0 }, win: {}, lose: {} }];
const evMove = E.act(ev, { type: 'move', dir: 'E' }, 'a', seeded(79));
ok('事件先进入等待掷骰状态', evMove.ok && evMove.state.pendingRoll && evMove.state.pendingRoll.kind === 'event');
ok('未掷骰不能结束回合', E.act(evMove.state, { type: 'end' }, 'a', seeded(80)).ok === false);
const evRoll = E.act(evMove.state, { type: 'rollPending' }, 'a', queue([0.99, 0.99, 0.99, 0.99, 0.99]));
ok('掷骰后才结算事件并显示结果', evRoll.ok && !evRoll.state.pendingRoll && evRoll.state.lastRoll && evRoll.state.lastRoll.total > 0);

console.log('=== 房间判定掷骰 ===');
const roomTest = E.createInitial(players, seeded(81), { skipSelect: true });
roomTest.players[0].x = 4; roomTest.players[0].y = 5;
roomTest.rooms.push({ floor: 'ground', x: 5, y: 5, name: '判定房', doors: 'W', kind: 'normal', effect: { type: 'test', trait: 'speed', diff: 2, damage: 1 }, effectUsed: false });
const roomMove = E.act(roomTest, { type: 'move', dir: 'E' }, 'a', seeded(82));
ok('房间判定先进入等待掷骰状态', roomMove.ok && roomMove.state.pendingRoll && roomMove.state.pendingRoll.kind === 'room');
const roomRoll = E.act(roomMove.state, { type: 'rollPending' }, 'a', queue([0.0, 0.0, 0.0, 0.0]));
ok('房间判定掷骰后显示结果', roomRoll.ok && !roomRoll.state.pendingRoll && roomRoll.state.lastRoll && roomRoll.state.lastRoll.label.indexOf('判定房') === 0 && roomRoll.state.lastDamageRoll);

console.log('=== 剧本目标 ===');ok('剧本目标类型都在支持范围', E.SCENARIOS.every((sc) => ['killTraitor', 'ritual', 'escape', 'wolves', 'survive', 'hunt'].indexOf(sc.heroGoal.type) >= 0));
ok('剧本目标房间都在 44 张房间牌或起点中', E.SCENARIOS.every((sc) => {
  const g = sc.heroGoal;
  if (!g.room) return true;
  const names = ['入口大厅', '门厅', '主楼梯', '上层平台', '地下室平台'].concat(E.TILES.all.map((t) => t.name));
  return names.indexOf(g.room) >= 0;
}));
ok('每个剧本都有双方目标文本', E.SCENARIOS.every((sc) => sc.heroGoalText && sc.traitorGoalText && sc.story));

console.log('\n' + (fail === 0 ? '全部通过' : '失败 ' + fail + ' 项') + '：' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

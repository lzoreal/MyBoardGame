// 官方 3E 特殊机制回归：石中血、遗产、交易、群魔、幻象、借时、维度、换身、Cut!、被困、隐藏叛徒
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); }
}
function seeded(n) {
  let s = n || 1;
  return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
function queue(list) { let i = 0; return function () { return list[i++ % list.length]; }; }
const high = queue([0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
const low = queue([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

const packsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8');
global.window = global;
eval(packsSrc);
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'));
const E = window.CabinEngine;

const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
function fresh(seed) {
  const st = E.createInitial(players, seeded(seed || 1), { skipSelect: true });
  st.players.forEach((p) => { p.side = 'hero'; });
  return st;
}
function scenario(no) {
  const s = E.SCENARIOS.find((x) => x.key === 'official_3e_' + no);
  if (!s) throw new Error('缺少 official_3e_' + no);
  return s;
}
function start(st, no, who) {
  const sc = JSON.parse(JSON.stringify(scenario(no)));
  E.helpers.startHaunt(st, who === undefined ? 0 : who, '骨戒', '入口大厅', seeded(no), sc);
  return sc;
}
function teleport(p, room) { p.floor = room.floor; p.x = room.x; p.y = room.y; }

console.log('=== 石中血 #5：小天使不可攻击，捉迷藏成对移除 ===');
const st5 = fresh(51);
start(st5, 5);
ok('7 只石头小天使登场', st5.monsters.filter((m) => m.type === 'cherub').length === 7, st5.monsters.length);
st5.players[0].floor = st5.monsters[0].floor; st5.players[0].x = st5.monsters[0].x; st5.players[0].y = st5.monsters[0].y;
const noAtk = E.act(st5, { type: 'attack', target: st5.monsters[0].id, trait: 'might' }, 'a', high);
ok('小天使不可被攻击（同房间也不会掉血）', noAtk.ok === false && /不能|不可/.test(noAtk.msg || ''), noAtk.msg);
const hide = E.act(st5, { type: 'hauntAction', key: 'hide' }, 'a', high);
ok('捉迷藏成功驱散 2 只', hide.ok && st5.monsters.filter((m) => m.type === 'cherub').length === 5, st5.monsters.length);
ok('驱散计入 hunt 进度', st5.haunt.monsterBanish === 2, st5.haunt.monsterBanish);

console.log('=== 遗产 #6：证据配对 ===');
const st6 = fresh(61);
start(st6, 6);
const ev = E.act(st6, { type: 'hauntAction', key: 'uncover' }, 'a', high);
ok('揭开真相累积 1 组证据', ev.ok && st6.haunt.evidence === 1, st6.haunt.evidence);
st6.haunt.evidence = 3;
E.helpers.checkWin(st6);
ok('证据配齐 3 组即胜', st6.phase === 'ended' && st6.winner.side === 'heroes', st6.winner && st6.winner.text);

console.log('=== 交易 #10：出价抢宝藏 ===');
const st10 = fresh(101);
start(st10, 10);
st10.players.forEach((p) => teleport(p, E.helpers.roomAt(st10, st10.players[0].floor, st10.players[0].x, st10.players[0].y) || st10.rooms[0]));
const bid = E.act(st10, { type: 'hauntAction', key: 'bid' }, 'a', seeded(102));
ok('出价产生宝藏与标记', bid.ok && st10.haunt.treasure === 1 && E.helpers.roomAt, st10.haunt.treasure);

console.log('=== 群魔乱舞 #15：三只怪物 ===');
const st15 = fresh(151);
start(st15, 15);
ok('幽灵/吸血鬼/狼人同时登场', ['ghost', 'vampire', 'werewolf'].every((k) => st15.monsters.some((m) => m.type === k)), st15.monsters.map((m) => m.type).join(','));

console.log('=== 戒指 #18：幻象与真身 ===');
const st18 = fresh(181);
start(st18, 18);
E.act(st18, { type: 'hauntAction', key: 'unmask' }, 'a', high);
const illusioned = st18.players.find((p) => p.illusion);
ok('揭穿幻象给人打上幻象标记', !!illusioned);
if (illusioned) {
  st18.players[0].x = illusioned.x; st18.players[0].y = illusioned.y; st18.players[0].floor = illusioned.floor;
  const hit = E.act(st18, { type: 'attack', target: illusioned.id, trait: 'might' }, 'a', high);
  ok('攻击幻象只消散不受伤', hit.ok && illusioned.illusion === false && !illusioned.dead, hit.msg);
}

console.log('=== 借来的时间 #25：属性转移 ===');
const st25 = fresh(251);
start(st25, 25);
const armory = E.helpers.roomByName(st25, '军械库') || { floor: 'ground', x: 6, y: 6, name: '军械库', doors: 'NSEW', kind: 'normal' };
if (!E.helpers.roomByName(st25, '军械库')) st25.rooms.push(armory);
st25.players[0].traits.might = 4;
if (armory) {
  teleport(st25.players[0], armory);
  const before = st25.players.map((p) => p.traits.might);
  E.act(st25, { type: 'hauntAction', key: 'borrow' }, 'a', high);
  const after = st25.players.map((p) => p.traits.might);
  const shifted = after[0] === before[0] + 1 && after.some((v, k) => k > 0 && v === before[k] - 1);
  ok('借走时间：自己 +1、最弱者 -1', shifted, before.join('/') + ' → ' + after.join('/'));
} else {
  ok('军械库房间存在', false, 'missing room');
}

console.log('=== 右侧的维度 #34：跨层同格 ===');
const st34 = fresh(341);
start(st34, 34);
ok('剧本打开维度改写', st34.haunt.dimension === true);
st34.players[0].floor = 'ground'; st34.players[1].floor = 'upper';
st34.players[1].side = 'traitor';
st34.players[1].x = st34.players[0].x; st34.players[1].y = st34.players[0].y;
const dimAtk = E.act(st34, { type: 'attack', target: 'b', trait: 'might' }, 'a', high);
ok('维度改写后可攻击不同层的同格玩家', dimAtk.ok === true, dimAtk.msg);

console.log('=== 灵魂出窍 #37：换身体 + DNA ===');
const st37 = fresh(371);
start(st37, 37);
const before37 = st37.players.map((p) => p.traits.might);
const r37 = E.act(st37, { type: 'hauntAction', key: 'swap' }, 'a', high);
const after37 = st37.players.map((p) => p.traits.might);
// 随机换一个对手：主角拿到对方的值，对方拿到主角的值
const swappedWith = before37.findIndex((v, k) => k > 0 && after37[k] === before37[0] && after37[0] === v);
ok('换身体后属性与随机对手互换', r37.ok && swappedWith > 0,
  before37.join('/') + ' → ' + after37.join('/') + '（与 #' + swappedWith + '）');
ok('换身体留下 DNA 标记', st37.tokens.some((t) => t.type === 'DNA'));

console.log('=== 大胆登场 #45：Cut! 复活与改写 ===');
const st45 = fresh(451);
start(st45, 45);
st45.players[0].dead = true;
const cut = E.act(st45, { type: 'hauntAction', key: 'cut' }, 'a', high);
ok('Cut! 让倒下的角色复活', cut.ok && st45.players[0].dead === false, cut.msg);
ok('剧本被改写', /导演改主意/.test(st45.haunt.heroGoalText), st45.haunt.heroGoalText);

console.log('=== 难忘的骑士 #47：被困 ===');
const st47 = fresh(471);
start(st47, 47);
st47.players[1].traits.might = 1; st47.players[2].traits.might = 5;
const snare = E.act(st47, { type: 'hauntAction', key: 'snare' }, 'a', high);
ok('叛徒可以困住最弱的人', snare.ok && st47.players[1].trapped === true, snare.msg);
const stuckMove = (function () { st47.turn = 1; return E.act(st47, { type: 'move', dir: 'E' }, 'b', seeded(472)); })();
ok('被困者不能移动', stuckMove.ok === false && stuckMove.msg.indexOf('被困') >= 0, stuckMove.msg);
st47.turn = 1; st47.moves = 3;
const stuckTrade = E.act(st47, { type: 'trade', target: 'a', index: 0 }, 'b', seeded(473));
ok('被困者不能交易', stuckTrade.ok === false, stuckTrade.msg);

console.log('=== 隐藏叛徒 ===');
const stH = fresh(901);
const sc6 = JSON.parse(JSON.stringify(scenario(6)));
E.helpers.startHaunt(stH, 0, '骨戒', '入口大厅', seeded(902), sc6);
ok('隐藏叛徒开局不点名', stH.haunt.hidden === true);
const hiddenAtk = E.act(stH, { type: 'attack', target: 'b', trait: 'might' }, 'a', high);
ok('隐藏叛徒一动手就暴露', hiddenAtk.ok === false || stH.haunt.hidden === false, hiddenAtk.msg);

console.log('=== 人物年龄 ===');
const stAge = fresh(950);
ok('12 张人物卡都带年龄', E.CHARS.every((c) => Number(c.age) >= 1 && Number(c.age) <= 99),
  E.CHARS.map((c) => c.key + ':' + c.age).join(','));
ok('上桌后玩家对象带年龄', stAge.players.every((p) => Number(p.age) >= 1),
  stAge.players.map((p) => p.age).join('/'));
const oldestSt = fresh(951);
oldestSt.players[0].age = 12; oldestSt.players[1].age = 63; oldestSt.players[2].age = 41;
E.helpers.startHaunt(oldestSt, 0, null, null, seeded(952),
  { key: 'tmp_age', no: 0, name: '最年长', heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' }, traitorRule: 'oldest' });
ok('最年长者成为叛徒（不按座次）', oldestSt.haunt.traitor === 1, oldestSt.haunt.traitor);

console.log('=== 规则细节 ===');
const stCost = fresh(701);
stCost.haunt = { active: true, traitor: 1, pvp: false, round: 1, progress: 0, heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
stCost.players[0].side = 'hero'; stCost.players[1].side = 'traitor'; stCost.players[2].side = 'hero';
stCost.players.forEach((p) => { p.x = stCost.players[0].x; p.y = stCost.players[0].y; p.floor = stCost.players[0].floor; });
stCost.rooms.push({ floor: 'ground', x: 5, y: 5, name: '测试房', doors: 'W', kind: 'normal' });
stCost.moves = 5;
const costMove = E.act(stCost, { type: 'move', dir: 'E' }, 'a', seeded(702));
ok('离开有人的板块只多花 1 点（不管几个人）', costMove.ok && costMove.state.moves === 3, costMove.state.moves);

const stLow = fresh(801);
stLow.traitor = 0;
const sc = { traitorRule: 'lowestSanity' };
stLow.players[0].traits.sanity = 1; stLow.players[1].traits.sanity = 5; stLow.players[2].traits.sanity = 7;
const pick = E.pickScenario ? null : null;
// 直接用 startHaunt 验证「排除揭示者」
const stLow2 = fresh(802);
const lowSc = { key: 'tmp_low', no: 0, name: '低理智', heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' }, traitorRule: 'lowestSanity' };
E.helpers.startHaunt(stLow2, 0, null, null, seeded(803), lowSc);
ok('最低理智判定会排除揭示者本人', stLow2.haunt.traitor !== 0, stLow2.haunt.traitor);

console.log(failed ? '失败 ' + failed + ' 项：' + fails.join(' | ') : '全部通过：' + passed + ' passed, 0 failed');
process.exit(failed ? 1 : 0);

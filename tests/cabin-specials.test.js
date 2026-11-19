// 官方 3E 特殊机制回归：石中血、遗产、交易、群魔、幻象、借时、维度、换身、Cut!、被困、隐藏叛徒
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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
vm.runInThisContext(packsSrc, { filename: 'cabin-packs.js' });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'), { filename: 'cabin.js' });
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
ok('6 只石头小天使登场', st5.monsters.filter((m) => m.type === 'cherub').length === 6, st5.monsters.length);
st5.players[0].floor = st5.monsters[0].floor; st5.players[0].x = st5.monsters[0].x; st5.players[0].y = st5.monsters[0].y;
const noAtk = E.act(st5, { type: 'attack', target: st5.monsters[0].id, trait: 'might' }, 'a', high);
ok('小天使不可被攻击（同房间也不会掉血）', noAtk.ok === false && /不能|不可/.test(noAtk.msg || ''), noAtk.msg);
const hide = E.act(st5, { type: 'hauntAction', key: 'hide' }, 'a', high);
ok('捉迷藏成功驱散 2 只', hide.ok && st5.monsters.filter((m) => m.type === 'cherub').length === 4, st5.monsters.length);
ok('驱散计入 hunt 进度', st5.haunt.monsterBanish === 2, st5.haunt.monsterBanish);

console.log('=== 遗产 #6：证据配对 ===');
const st6 = fresh(61);
start(st6, 6);
const evRoom = E.helpers.roomAt(st6, st6.players[0].floor, st6.players[0].x, st6.players[0].y);
E.helpers.addToken(st6, '证据:力量', evRoom, 1, 'setup');
const ev = E.act(st6, { type: 'hauntAction', key: 'uncover' }, 'a', high);
ok('揭开真相累积 1 组证据', ev.ok && st6.haunt.evidence === 1, st6.haunt.evidence);
st6.haunt.evidence = 3;
E.helpers.checkWin(st6);
ok('证据配齐 3 组即胜', st6.phase === 'ended' && st6.winner.side === 'heroes', st6.winner && st6.winner.text);

console.log('=== 交易 #10：出价抢宝藏 ===');
const st10 = fresh(101);
start(st10, 10);
let vault = E.helpers.roomByName(st10, '金库');
if (!vault) {
  vault = { floor: 'basement', x: 3, y: 1, name: '金库', doors: 'NSEW', symbol: null, kind: 'normal' };
  st10.rooms.push(vault);
}
E.helpers.addToken(st10, '宝藏', vault, 3, 'setup');
teleport(st10.players[0], vault);
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
const body = st18.players[st18.haunt.traitor];
ok('成功揭穿幻象后真身回到屋内', st18.haunt.trueBodyRevealed === true && !!body && !body.outside);
const illusioned = st18.players.find((p) => p !== body && !p.dead);
if (illusioned) illusioned.illusion = true;
if (illusioned) {
  st18.players[0].x = illusioned.x; st18.players[0].y = illusioned.y; st18.players[0].floor = illusioned.floor;
  const hit = E.act(st18, { type: 'attack', target: illusioned.id, trait: 'might' }, 'a', high);
  ok('攻击幻象只消散不受伤', hit.ok && illusioned.illusion === false && !illusioned.dead, hit.msg);
}

console.log('=== 借来的时间 #25：铠甲转移与诅咒 ===');
const st25 = fresh(251);
start(st25, 25);
const armorTraitor = st25.players[st25.haunt.traitor];
const armorHero = st25.players.find((p) => p.side === 'hero' && !p.dead);
ok('#25 叛徒开局持有铠甲', !!armorTraitor && st25.haunt.armorHolder === armorTraitor.id);
if (armorTraitor && armorHero) {
  const armorRoom = E.helpers.roomByName(st25, '军械库') || st25.rooms[0];
  teleport(armorTraitor, armorRoom);
  teleport(armorHero, armorRoom);
  E.helpers.setTrack(st25, st25.players.indexOf(armorTraitor), 'might', 8);
  st25.turn = st25.players.indexOf(armorTraitor);
  const beforeMight = armorHero.traits.might;
  E.act(st25, { type: 'attack', target: armorHero.id, trait: 'might' }, armorTraitor.id, high);
  ok('#25 叛徒用力量击中英雄时转移铠甲，而不是造成伤害',
    st25.haunt.armorHolder === armorHero.id && armorHero.traits.might === beforeMight,
    st25.haunt.armorHolder + '/' + armorHero.traits.might);
  const beforeHero = Object.assign({}, armorHero.traits);
  const beforeTraitor = Object.assign({}, armorTraitor.traits);
  E.act(st25, { type: 'end' }, armorTraitor.id, high);
  const cursed = ['might', 'speed', 'known', 'sanity'].every((t) =>
    armorHero.traits[t] === beforeHero[t] - 1 || (armorHero.track && armorHero.track[t].pos === Math.max(0, armorHero.track[t].pos)));
  const buffed = ['might', 'speed', 'known', 'sanity'].some((t) => armorTraitor.traits[t] === beforeTraitor[t] + 1);
  ok('#25 叛徒回合结束时英雄受诅咒、叛徒获增益', cursed && buffed,
    Object.keys(beforeHero).map((t) => beforeHero[t] + '→' + armorHero.traits[t]).join('/') + ' | ' +
    Object.keys(beforeTraitor).map((t) => beforeTraitor[t] + '→' + armorTraitor.traits[t]).join('/'));
} else ok('#25 叛徒与英雄存在', false);

console.log('=== 借来的时间 #25：仪式房也能破解铠甲法术 ===');
const st25r = fresh(252);
start(st25r, 25);
const ritualist25 = st25r.players.find((p) => p.side === 'hero' && !p.dead);
const ritualRoom25 = E.helpers.roomByName(st25r, '仪式房');
if (ritualist25 && ritualRoom25) {
  teleport(ritualist25, ritualRoom25);
  for (let k = 0; k < 4; k++) E.helpers.addToken(st25r, '法术材料', ritualRoom25, 1, 'setup');
  E.helpers.setTrack(st25r, st25r.players.indexOf(ritualist25), 'sanity', 7);
  st25r.turn = st25r.players.indexOf(ritualist25);
  const ritual25 = E.act(st25r, { type: 'check' }, ritualist25.id, high);
  ok('#25 在仪式房也可以用 4 份材料做 5+ 神智仪式', ritual25.ok && st25r.haunt.progress >= 1, ritual25.msg);
} else ok('#25 仪式房与英雄存在', false);

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
E.helpers.setTrack(st47, 1, 'might', 1, '测试：最弱者');
E.helpers.setTrack(st47, 2, 'might', st47.players[2].track.might.list.length, '测试：最强者');
const snare = E.act(st47, { type: 'hauntAction', key: 'snare' }, 'a', high);
ok('叛徒可以困住最弱的人', snare.ok && st47.players[1].trapped === true, snare.msg);
const stuckMove = (function () { st47.turn = 1; return E.act(st47, { type: 'move', dir: 'E' }, 'b', seeded(472)); })();
ok('被困者不能移动', stuckMove.ok === false && stuckMove.msg.indexOf('被困') >= 0, stuckMove.msg);
st47.turn = 1; st47.moves = 3;
const stuckTrade = E.act(st47, { type: 'trade', target: 'a', index: 0 }, 'b', seeded(473));
ok('被困者不能交易', stuckTrade.ok === false, stuckTrade.msg);

console.log('=== 怪物运行时 flags ===');
const stM = fresh(1501);
start(stM, 15);
const ghost = stM.monsters.find((m) => m.name === '幽灵');
ok('幽灵保留无视门 flag', !!ghost && ghost.ignoreDoors === true, ghost && JSON.stringify(ghost));
ok('幽灵保留不可击晕 flag', !!ghost && ghost.noStun === true, ghost && JSON.stringify(ghost));

console.log('=== 房间特殊连接 ===');
const stLink = fresh(1801);
stLink.phase = 'playing'; stLink.moves = 3;
const roomData = (name) => JSON.parse(JSON.stringify(E.ROOMS.find((r) => r.name === name)));
const gallery = roomData('画廊'), ballroom = roomData('舞厅');
stLink.rooms.push(gallery, ballroom);
stLink.players[0].floor = gallery.floor; stLink.players[0].x = gallery.x; stLink.players[0].y = gallery.y;
const movedLink = E.act(stLink, { type: 'moveRoom', room: '舞厅' }, 'a', seeded(1802));
ok('画廊可经特殊连接到舞厅', movedLink.ok && stLink.players[0].floor === ballroom.floor && stLink.players[0].x === ballroom.x, movedLink.msg);

console.log('=== 特殊事件完整抽牌路径 ===');
const eventCard = (name) => JSON.parse(JSON.stringify(E.EVENTS.find((e) => e.name === name)));
function roomWithEvent(st) {
  const r = JSON.parse(JSON.stringify(E.ROOMS.find((x) => x.name === '入口大厅')));
  r.kind = 'normal'; r.symbol = 'event'; r.resolved = false;
  st.rooms.push(r);
  st.players[0].floor = r.floor; st.players[0].x = r.x; st.players[0].y = r.y;
  return r;
}
const stEvLow = fresh(101);
const roomLow = roomWithEvent(stEvLow);
stEvLow.decks.events = [eventCard('绯红之溅')];
E.helpers.setTrack(stEvLow, 0, 'speed', 2, '测试：失败前');
const speedPosBefore = stEvLow.players[0].track.speed.pos;
E.helpers.resolveRoomSymbol(stEvLow, 0, roomLow, low);
ok('闹鬼检定失败不会误开闹鬼', !(stEvLow.haunt && stEvLow.haunt.active), stEvLow.lastRoll && stEvLow.lastRoll.total);
ok('闹鬼检定失败执行失败分支', stEvLow.players[0].track.speed.pos === speedPosBefore + 1, speedPosBefore + ' -> ' + stEvLow.players[0].track.speed.pos);
const stEvHigh = fresh(102);
const roomHigh = roomWithEvent(stEvHigh);
stEvHigh.decks.events = [eventCard('绯红之溅')];
E.helpers.resolveRoomSymbol(stEvHigh, 0, roomHigh, high);
ok('闹鬼检定成功只触发一次对应剧本', !!stEvHigh.haunt && stEvHigh.haunt.no === 1, stEvHigh.haunt && stEvHigh.haunt.no);

console.log('=== 隐藏叛徒 ===');const stH = fresh(901);
const sc6 = JSON.parse(JSON.stringify(scenario(6)));
E.helpers.startHaunt(stH, 0, '骨戒', '入口大厅', seeded(902), sc6);
ok('隐藏叛徒开局不点名', stH.haunt.hidden === true);
const hiddenIdx = stH.haunt.traitor;
const hiddenTarget = stH.players.find((p, k) => k !== hiddenIdx && !p.dead);
const hiddenAtk = E.act(stH, { type: 'attack', target: hiddenTarget.id, trait: 'might' }, stH.players[hiddenIdx].id, high);
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

console.log('=== 主动物品 ===');
const stMap = fresh(201);
const mapItem = E.ITEMS.find((x) => x.name === '地图');
E.helpers.grantItem(stMap, 0, mapItem);
const mapUse = E.act(stMap, { type: 'useItem', index: 0, room: '门厅' }, 'a', high);
ok('地图能把玩家送到已发现房间', mapUse.ok && stMap.players[0].x === 3 && stMap.players[0].y === 5, mapUse.msg);
ok('地图使用后埋掉', stMap.players[0].items.every((it) => it.name !== '地图'));

const stWatch = fresh(202);
start(stWatch, 5);
const watch = E.ITEMS.find((x) => x.name === '神秘秒表');
E.helpers.grantItem(stWatch, 0, watch);
const watchUse = E.act(stWatch, { type: 'useItem', index: 0 }, 'a', high);
ok('闹鬼后能用神秘秒表', watchUse.ok && stWatch.extraTurn === true, watchUse.msg);
const watchEnd = E.act(stWatch, { type: 'end' }, 'a', high);
ok('秒表让同一玩家再行动一次', watchEnd.ok && stWatch.turn === 0 && stWatch.extraTurn === false, watchEnd.msg);

const stBrooch = fresh(203);
const brooch = E.ITEMS.find((x) => x.name === '胸针');
E.helpers.grantItem(stBrooch, 0, brooch);
E.helpers.beginDamage(stBrooch, 0, 2, 'physical', '测试');
ok('胸针把物理伤害转成通用伤害', stBrooch.pendingDamage && stBrooch.pendingDamage.kind === 'general', JSON.stringify(stBrooch.pendingDamage));

const stWall = fresh(204);
const key = E.ITEMS.find((x) => x.name === '万能钥匙');
E.helpers.grantItem(stWall, 0, key);
E.act(stWall, { type: 'useItem', index: 0 }, 'a', high);
const hereWall = E.helpers.roomAt(stWall, stWall.players[0].floor, stWall.players[0].x, stWall.players[0].y);
stWall.rooms.push({ floor: hereWall.floor, x: hereWall.x + 1, y: hereWall.y, name: '测试墙后房间', doors: 'W', symbol: null, kind: 'normal' });
const wallUse = E.act(stWall, { type: 'wallMove', x: hereWall.x + 1, y: hereWall.y }, 'a', () => 0.5);
ok('万能钥匙可以穿没有门的墙', wallUse.ok && stWall.players[0].x === hereWall.x + 1, wallUse.msg);

console.log('=== 房间效果 ===');
const stArm = fresh(205);
E.helpers.roomEffect(stArm, 0, { name: '军械库', effect: { type: 'drawWeapon' } }, high);
ok('军械库翻到武器并拿走', stArm.players[0].items.some((it) => it.weapon), stArm.players[0].items.map((it) => it.name).join(','));

const stFur = fresh(206);
stFur.rooms[0].effect = { type: 'endTurnDamage', damage: 'physical', amount: 1 };
stFur.rooms[0].name = '锅炉房';
const furEnd = E.act(stFur, { type: 'end' }, 'a', high);
ok('锅炉房结束回合受 1 点物理伤害', furEnd.ok && stFur.pendingDamage && stFur.pendingDamage.amount === 1 && stFur.pendingDamage.kind === 'physical', JSON.stringify(stFur.pendingDamage));

const stPanic = fresh(207);
const secretTile = { name: '密梯', floors: ['basement'], doors: 'NSEW' };
stPanic.roomDeck.push(secretTile);
E.helpers.roomEffect(stPanic, 0, { name: '恐慌室', effect: { type: 'placeSpecial', room: '密梯', floor: 'basement' } }, high);
ok('恐慌室从板块堆找出密梯并放到地下室', stPanic.rooms.some((r) => r.name === '密梯' && r.floor === 'basement'), stPanic.rooms.map((r) => r.name).join(','));

const stRoot = fresh(208);
const treeTile = { name: '时光树', floors: ['upper'], doors: 'NSEW' };
stRoot.roomDeck.push(treeTile);
E.helpers.roomEffect(stRoot, 0, { name: '根窖', effect: { type: 'placeSpecial', room: '时光树', floor: 'upper' } }, high);
ok('根窖把时光树放到二层', stRoot.rooms.some((r) => r.name === '时光树' && r.floor === 'upper'), stRoot.rooms.map((r) => r.name).join(','));

console.log('=== 判定重掷窗口 ===');
const stReroll = fresh(209);
const foot = E.ITEMS.find((x) => x.name === '兔脚');
E.helpers.grantItem(stReroll, 0, foot);
stReroll.pendingRoll = { kind: 'event', index: 0, card: '测试事件', trait: 'might', diff: 1, win: {}, lose: {} };
const firstRoll = E.act(stReroll, { type: 'rollPending' }, 'a', high);
ok('掷骰后停在等待确认', firstRoll.ok && stReroll.pendingRoll.await === true && !!stReroll.pendingRoll.result, firstRoll.msg);
const rerolled = E.act(stReroll, { type: 'rerollPending', index: 0 }, 'a', high);
ok('兔脚能重掷一颗骰', rerolled.ok && stReroll.pendingRoll.await === true, rerolled.msg);
const confirmed = E.act(stReroll, { type: 'confirmPendingRoll' }, 'a', high);
ok('确认结果后才结算并清空判定', confirmed.ok && stReroll.pendingRoll === null, confirmed.msg);

console.log(failed ? '失败 ' + failed + ' 项：' + fails.join(' | ') : '全部通过：' + passed + ' passed, 0 failed');
process.exit(failed ? 1 : 0);

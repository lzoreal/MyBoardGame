// 3E 剩余机制回归：猫又/恶魔犬/构造体动态数值、#7 镜界、#17 纸条、#18 真身、#24 暗女王、#26 长老女王、#4 火焰
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

global.window = global;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8'), { filename: 'cabin-packs.js' });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'), { filename: 'cabin.js' });
const E = window.CabinEngine;
const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

function fresh(seed) {
  const st = E.createInitial(players, seeded(seed || 1), { skipSelect: true });
  st.players.forEach((p) => { p.side = 'hero'; });
  return st;
}
function scenario(no) {
  return E.SCENARIOS.find((x) => x.key === 'official_3e_' + no);
}
function start(st, no, who) {
  const sc = JSON.parse(JSON.stringify(scenario(no)));
  E.helpers.startHaunt(st, who === undefined ? 0 : who, '骨戒', '入口大厅', seeded(no), sc);
  return sc;
}
function teleport(p, room) { p.floor = room.floor; p.x = room.x; p.y = room.y; }

console.log('=== 怪物动态数值 ===');
const st32 = fresh(321); start(st32, 32);
const bakeneko = st32.monsters.find((m) => m.type === 'bakeneko');
const cats = st32.monsters.filter((m) => m.type === 'undeadcat' && !m.dead).length;
ok('猫又力量 = 基础 3 + 亡灵猫数量（上限 8）', !!bakeneko && E.helpers.monsterStat(st32, bakeneko, 'might') === Math.min(8, 3 + cats), bakeneko && E.helpers.monsterStat(st32, bakeneko, 'might') + ' / cats ' + cats);

const st42 = fresh(421); start(st42, 42);
const dog = st42.monsters.find((m) => m.type === 'dog');
const food = E.helpers.countTokens(st42, '食物');
ok('恶魔犬力量 = 基础 4 + 食物数量', !!dog && E.helpers.monsterStat(st42, dog, 'might') === 4 + food, dog && E.helpers.monsterStat(st42, dog, 'might') + ' / food ' + food);

const st50 = fresh(501); start(st50, 50);
const construct = st50.monsters.find((m) => m.type === 'construct');
st50.haunt.numberTrack = 6;
ok('构造体速度 = 数字轨道', !!construct && E.helpers.monsterStat(st50, construct, 'speed') === 6);

console.log('=== 镜中倒影 #7：猜线索破镜 ===');
const st7 = fresh(71); start(st7, 7);
const mr = st7.haunt.mirrorRealm;
ok('#7 Setup 建立镜界线索', !!(mr && mr.trait && mr.omen && mr.room));
const breakR = E.act(st7, { type: 'hauntAction', key: 'break_spell', guess: { trait: mr.trait, omen: mr.omen, room: mr.room } }, 'a', high);
ok('#7 三中三后镜界破碎并放出揭示者', breakR.ok && !st7.haunt.mirrorRealm && st7.players[st7.haunt.revealer].trapped === false, breakR.msg);
ok('#7 每猜中一项都产生破咒标记', E.helpers.countTokens(st7, '破咒') === 3, E.helpers.countTokens(st7, '破咒'));

console.log('=== DIE 纸条 #17：合法传递 ===');
const st17 = fresh(171); start(st17, 17);
const holder = st17.players.find((p) => p.id === st17.haunt.dieNote.holder);
const target = st17.players.find((p) => p !== holder && !p.dead && p.side === 'hero');
holder.hooray = true;
target.floor = holder.floor; target.x = holder.x; target.y = holder.y;
const pass = (() => {
  st17.turn = st17.players.indexOf(holder);
  return E.act(st17, { type: 'hauntAction', key: 'pass_note', target: target.id }, holder.id, high);
})();
ok('#17 纸条可以交给同房间英雄', pass.ok && st17.haunt.dieNote.holder === target.id && target.note === 'DIE', pass.msg);
ok('#17 原持有人不再保留纸条', holder.note === null);

console.log('=== 戒指 #18：揭穿真身 ===');
const st18 = fresh(181); start(st18, 18);
const unmask = E.act(st18, { type: 'hauntAction', key: 'unmask' }, 'a', high);
const body = st18.players[st18.haunt.traitor];
ok('#18 成功后真身回屋、幻象清空', unmask.ok && st18.haunt.trueBodyRevealed && !body.outside && !st18.players.some((p) => p.illusion), unmask.msg);

console.log('=== 暗女王 #24：第五片火焰降临 ===');
const st24 = fresh(241); start(st24, 24);
const fireRoom = st24.rooms.find((r) => r.symbol === 'omen') || E.helpers.roomAt(st24, st24.players[0].floor, st24.players[0].x, st24.players[0].y) || st24.rooms[0];
teleport(st24.players[0], fireRoom);
E.helpers.addToken(st24, '精灵之火', fireRoom, 5, 'setup');
const pick = E.act(st24, { type: 'hauntAction', key: 'pickflame' }, 'a', high);
ok('#24 四片火焰触发暗女王登场', pick.ok && st24.monsters.some((m) => m.type === 'darkqueen'), pick.msg);

console.log('=== 长老女王 #26：仪式推进触发 ===');
const st26 = fresh(261); start(st26, 26);
const hero26 = st26.players.find((p) => !p.dead && p.side === 'hero');
const ritualRoom = E.helpers.roomByName(st26, '仪式房');
if (ritualRoom && hero26) {
  teleport(hero26, ritualRoom);
  E.helpers.addToken(st26, '祭坛', ritualRoom, 1, 'setup');
  st26.turn = st26.players.indexOf(hero26);
  const check = E.act(st26, { type: 'check' }, hero26.id, high);
  ok('#26 第一次仪式推进唤醒长老女王', check.ok && st26.haunt.progress >= 1 && st26.monsters.some((m) => m.type === 'elderqueen'), check.msg);
} else {
  ok('#26 仪式房与英雄存在', false);
}

console.log('=== 火焰 #32：着火板块结束回合受伤 ===');
const stFire = fresh(322); start(stFire, 32);
const burning = stFire.rooms.find((r) => E.helpers.countTokens(stFire, '火焰', { room: r }) > 0) || stFire.rooms.find((r) => r.kind === 'start');
ok('#32 可以构造着火板块', !!burning);
if (burning) {
  E.helpers.addToken(stFire, '火焰', burning, 1, 'setup');
  const heroFire = stFire.players.find((p) => !p.dead && p.side === 'hero');
  teleport(heroFire, burning);
  stFire.turn = stFire.players.indexOf(heroFire);
  const end = E.act(stFire, { type: 'end' }, heroFire.id, high);
  ok('#32 在着火板块结束回合受到伤害', end.ok && !!stFire.pendingDamage, end.msg);
}

console.log('=== 怪物专属击倒规则 ===');
const st48 = fresh(481); start(st48, 48);
const host = st48.monsters.find((m) => m.type === 'host');
if (host) {
  const room = E.helpers.roomAt(st48, host.floor, host.x, host.y);
  teleport(st48.players[0], room);
  E.helpers.setTrack(st48, 0, 'might', 8);
  host.might = 1;
  const hit = E.act(st48, { type: 'attack', target: host.id, trait: 'might' }, 'a', high);
  ok('#48 击败房主后头骨交给攻击者', hit.ok && (st48.players[0].items || []).some((it) => it.name === '头骨'), hit.msg + ' ' + st48.lastRoll.total + ':' + st48.lastRoll.foe);
} else ok('#48 房主在场', false);

const st33 = fresh(331); start(st33, 33);
const photographer = st33.monsters.find((m) => m.type === 'photographer');
if (photographer) {
  const room = E.helpers.roomAt(st33, photographer.floor, photographer.x, photographer.y);
  teleport(st33.players[0], room);
  E.helpers.setTrack(st33, 0, 'might', 8);
  photographer.might = 1;
  photographer.sanity = 1;
  const hit = E.act(st33, { type: 'attack', target: photographer.id, trait: 'might' }, 'a', high);
  ok('#33 幽灵摄影师被力量击伤即消灭', hit.ok && photographer.dead === true, hit.msg + ' ' + st33.lastRoll.total + ':' + st33.lastRoll.foe);
} else ok('#33 幽灵摄影师在场', false);

console.log('=== 攻击骰重掷窗口 ===');
const stR = fresh(333); start(stR, 33);
const shooter = stR.players.find((p) => !p.dead && p.side === 'hero');
const photoR = stR.monsters.find((m) => m.type === 'photographer');
shooter.items = (shooter.items || []).concat([{ name: '兔脚', key: 'rabbit_foot', reroll: 'one' }]);
const roomR = E.helpers.roomAt(stR, photoR.floor, photoR.x, photoR.y);
teleport(shooter, roomR);
stR.turn = stR.players.indexOf(shooter);
const attackPending = E.act(stR, { type: 'attack', target: photoR.id, trait: 'might' }, shooter.id, high);
ok('攻击先进入可重掷窗口', attackPending.ok && stR.pendingRoll && stR.pendingRoll.kind === 'attack');
if (stR.pendingRoll) {
  const idx = shooter.items.findIndex((it) => it.reroll);
  const rr = E.act(stR, { type: 'rerollPending', index: idx }, shooter.id, high);
  ok('攻击骰可以用兔脚重掷', rr.ok && shooter.items.some((it) => it.reroll));
  const cf = E.act(stR, { type: 'confirmPendingRoll' }, shooter.id, high);
  ok('确认攻击结果后清空窗口', cf.ok && !stR.pendingRoll);
}

console.log('=== 隐藏叛徒 #2：暴露时回满并加力量 ===');
const st2 = fresh(221); start(st2, 2, 0);
const hiddenTraitor = st2.players[st2.haunt.traitor];
const hiddenTarget = st2.players.find((p, i) => i !== st2.haunt.traitor && p.side === 'hero');
if (hiddenTraitor && hiddenTarget) {
  const room2 = E.helpers.roomByName(st2, '入口大厅') || st2.rooms[0];
  teleport(hiddenTraitor, room2);
  teleport(hiddenTarget, room2);
  E.helpers.setTrack(st2, st2.haunt.traitor, 'might', 0);
  E.helpers.setTrack(st2, st2.players.indexOf(hiddenTarget), 'might', 8);
  st2.turn = st2.haunt.traitor;
  const revealAttack = E.act(st2, { type: 'attack', target: hiddenTarget.id, trait: 'might' }, hiddenTraitor.id, high);
  ok('#2 隐藏叛徒攻击英雄后暴露', revealAttack.ok && st2.haunt.hidden === false, revealAttack.msg);
  ok('#2 暴露时恢复全部属性并 +1 力量', E.helpers.traitVal(st2, st2.haunt.traitor, 'might') >= 1, E.helpers.traitVal(st2, st2.haunt.traitor, 'might'));
} else ok('#2 隐藏叛徒与英雄存在', false);

console.log('=== 发电机 #41：每台只能过载一次 ===');
const st41 = fresh(411); start(st41, 41);
const generators = st41.monsters.filter((m) => m.type === 'generator' && !m.dead);
const electrician = st41.players.find((p) => p.side === 'hero' && !p.dead);
if (electrician && generators.length >= 3) {
  for (let k = 0; k < 5; k++) {
    st41.turn = st41.players.indexOf(electrician);
    st41.haunt.used = {}; st41.haunt.turnUsed = {};
    const sabotage = E.act(st41, { type: 'hauntAction', key: 'sabotage' }, electrician.id, high);
    ok('#41 破坏电子设备第 ' + (k + 1) + ' 次成功', sabotage.ok, sabotage.msg);
  }
  ok('#41 五次破坏后数字轨道为 5', st41.haunt.numberTrack === 5, st41.haunt.numberTrack);
  for (let k = 0; k < 3; k++) {
    const gen = generators[k];
    const genRoom = E.helpers.roomAt(st41, gen.floor, gen.x, gen.y);
    teleport(electrician, genRoom);
    st41.turn = st41.players.indexOf(electrician);
    st41.haunt.used = {}; st41.haunt.turnUsed = {};
    const overload = E.act(st41, { type: 'hauntAction', key: 'overload' }, electrician.id, high);
    ok('#41 第 ' + (k + 1) + ' 台发电机成功过载', overload.ok && gen.overloaded === true, overload.msg);
    ok('#41 过载后发电机 ON 变 OFF', gen.on === false, gen.on);
  }
  ok('#41 三台发电机各生成一枚过载标记', E.helpers.countTokens(st41, '过载发电机') >= 3, E.helpers.countTokens(st41, '过载发电机'));
  const repeat = (() => {
    const gen = generators[0];
    const genRoom = E.helpers.roomAt(st41, gen.floor, gen.x, gen.y);
    teleport(electrician, genRoom);
    st41.turn = st41.players.indexOf(electrician);
    st41.haunt.used = {}; st41.haunt.turnUsed = {};
    return E.act(st41, { type: 'hauntAction', key: 'overload' }, electrician.id, high);
  })();
  ok('#41 同一台发电机不能重复过载', !repeat.ok, repeat.msg);
} else ok('#41 三名玩家与至少三台发电机存在', false);

console.log('=== #22 地下行动：逃出不需要额外物品 ===');
const st22 = fresh(222); start(st22, 22);
const escaper = st22.players.find((p) => p.side === 'hero' && !p.dead);
if (escaper) {
  escaper.items = [];
  teleport(escaper, E.helpers.roomByName(st22, '入口大厅') || st22.rooms[0]);
  ok('#22 入口大厅空手也能完成逃脱目标',
    E.helpers.isGoalDone(st22, st22.haunt.heroGoal) === true);
} else ok('#22 英雄存在', false);

console.log('=== #31 一线鬼机：带 4 件物品才能逃出 ===');
const st31 = fresh(311); start(st31, 31);
const escape31 = st31.players.find((p) => p.side === 'hero' && !p.dead);
if (escape31) {
  const hall31 = E.helpers.roomByName(st31, '入口大厅') || st31.rooms[0];
  teleport(escape31, hall31);
  const four = [{ name: '物品1' }, { name: '物品2' }, { name: '物品3' }, { name: '物品4' }];
  escape31.items = four.slice();
  ok('#31 带 4 件物品时满足逃脱目标', E.helpers.isGoalDone(st31, st31.haunt.heroGoal) === true);
  escape31.items = four.slice(0, 3);
  ok('#31 只有 3 件物品时不满足逃脱目标', E.helpers.isGoalDone(st31, st31.haunt.heroGoal) === false);
} else ok('#31 英雄存在', false);

console.log('=== #43 躲猫猫：数字轨道拖到 0 ===');
const st43 = fresh(431); start(st43, 43);
st43.haunt.numberTrack = 2;
st43.damageSinceMonsterTurn = false;
const hero43 = st43.players.find((p) => p.side === 'hero' && !p.dead);
if (hero43) {
  st43.monsterTurn = { actor: hero43.id, queue: [] };
  E.act(st43, { type: 'monsterEnd' }, hero43.id, high);
  ok('#43 狼人嚎叫后数字轨道归零，英雄撑到黎明',
    st43.phase === 'ended' && !!st43.winner && st43.winner.side === 'heroes',
    st43.haunt.numberTrack + '/' + (st43.winner && st43.winner.side));
} else ok('#43 英雄存在', false);

console.log('=== #43 官方躲藏规则 ===');
const st43h = fresh(432); start(st43h, 43);
const hiding = st43h.players.find((p) => p.side === 'hero' && !p.dead);
const wolf = st43h.monsters.find((m) => m.type === 'werewolf');
if (hiding && wolf) {
  st43h.turn = st43h.players.indexOf(hiding);
  E.helpers.setTrack(st43h, st43h.players.indexOf(hiding), 'speed', 7);
  const hide = E.act(st43h, { type: 'hauntAction', key: 'hide' }, hiding.id, high);
  ok('#43 躲藏行动成功后获得隐藏状态', hide.ok && hiding.hidden === true, hide.msg);
  const wolfRoom = E.helpers.roomAt(st43h, wolf.floor, wolf.x, wolf.y);
  teleport(hiding, wolfRoom);
  st43h.monsterTurn = { actor: hiding.id, queue: [wolf.id] };
  const attackHidden = E.act(st43h, { type: 'monsterMove', monsterId: wolf.id, target: hiding.id }, hiding.id, high);
  ok('#43 狼人不能攻击已躲藏的英灵', !attackHidden.ok, attackHidden.msg);
  st43h.monsterTurn = null;
} else ok('#43 英雄与狼人存在', false);

console.log('=== #43 狼人真实攻击与伤害 ===');
const st43atk = fresh(433); start(st43atk, 43);
const prey = st43atk.players.find((p) => p.side === 'hero' && !p.dead);
const wolfAtk = st43atk.monsters.find((m) => m.type === 'werewolf');
if (prey && wolfAtk) {
  const wolfRoom = E.helpers.roomAt(st43atk, wolfAtk.floor, wolfAtk.x, wolfAtk.y);
  teleport(prey, wolfRoom);
  const beforeMight = E.helpers.traitVal(st43atk, st43atk.players.indexOf(prey), 'might');
  st43atk.monsterTurn = { actor: prey.id, queue: [wolfAtk.id] };
  st43atk.monsterMoveRolls = { werewolf: 99 };
  const attack = E.act(st43atk, { type: 'monsterMove', monsterId: wolfAtk.id, target: prey.id }, prey.id, queue([0.99, 0]));
  const afterMight = E.helpers.traitVal(st43atk, st43atk.players.indexOf(prey), 'might');
  ok('#43 狼人命中后进入伤害分配，力量在分配前不提前扣减',
    attack.ok && !!st43atk.pendingDamage && afterMight === beforeMight,
    attack.msg + ' ' + beforeMight + '->' + afterMight + ' pending=' + !!st43atk.pendingDamage);
} else ok('#43 攻击测试前置存在', false);

console.log('=== 常规探索：有门且相邻为空时进入 pendingTile ===');
const stEx = fresh(434);
stEx.players.forEach((p) => { p.side = 'hero'; });
const explorer = stEx.players[0];
stEx.rooms.push({
  name: '测试起点', floor: 'ground', x: 0, y: 0, doors: 'E', kind: 'normal',
  symbol: null, effect: null, special: null, revealed: true, resolved: true
});
explorer.floor = 'ground'; explorer.x = 0; explorer.y = 0;
stEx.turn = 0; stEx.moves = 2; stEx.moveLocked = false;
const explore = E.act(stEx, { type: 'move', dir: 'E' }, explorer.id, high);
ok('探索合法门后生成待放置房间', explore.ok && !!stEx.pendingTile, explore.msg);

console.log('=== #4 官方 13+ 神智仪式 ===');
const st4 = fresh(441); start(st4, 4);
const ritualist = st4.players[0];
const realtor = st4.monsters.find((m) => m.type === 'demon_realtor');
if (ritualist && realtor) {
  const realtorRoom = E.helpers.roomAt(st4, realtor.floor, realtor.x, realtor.y);
  teleport(ritualist, realtorRoom);
  E.helpers.addToken(st4, '火焰', realtorRoom, 1, 'setup');
  E.helpers.setTrack(st4, 0, 'sanity', 7);
  st4.turn = 0;
  const ritual = E.act(st4, { type: 'hauntAction', key: 'perform_ritual' }, ritualist.id, high);
  ok('#4 13+ 仪式成功直接解救中介', ritual.ok && st4.phase === 'ended' && st4.winner && st4.winner.side === 'heroes', ritual.msg + ' ' + (st4.lastRoll && st4.lastRoll.total));
} else ok('#4 中介与英雄存在', false);

console.log('=== #4 仪式失败：恶魔尖叫伤害所有英雄 ===');
const st4f = fresh(442); start(st4f, 4);
const failRitualist = st4f.players[0];
const failRealtor = st4f.monsters.find((m) => m.type === 'demon_realtor');
if (failRitualist && failRealtor) {
  const realtorRoom = E.helpers.roomAt(st4f, failRealtor.floor, failRealtor.x, failRealtor.y);
  teleport(failRitualist, realtorRoom);
  E.helpers.addToken(st4f, '火焰', realtorRoom, 1, 'setup');
  E.helpers.setTrack(st4f, 0, 'sanity', 2);
  st4f.turn = 0;
  const failed = E.act(st4f, { type: 'hauntAction', key: 'perform_ritual' }, failRitualist.id, low);
  const heroes = st4f.players.filter((p) => p.side === 'hero' && !p.dead).length;
  const pending = (st4f.pendingDamage ? 1 : 0) + (st4f.damageQueue ? st4f.damageQueue.length : 0);
  ok('#4 仪式失败后每名英雄都进入 1 点精神伤害队列',
    failed.ok && pending === heroes &&
    (!st4f.pendingDamage || (st4f.pendingDamage.kind === 'mental' && st4f.pendingDamage.amount === 1)),
    failed.msg + ' pending=' + pending + '/' + heroes);
} else ok('#4 失败仪式前置存在', false);

console.log('=== #47 逃脱传送门失败：knowledge 别名必须加到 known ===');
const st47 = fresh(471); start(st47, 47);
const portalHero = st47.players.find((p) => p.side === 'hero' && !p.dead);
if (portalHero) {
  const portalRoom = E.helpers.roomAt(st47, portalHero.floor, portalHero.x, portalHero.y);
  E.helpers.addToken(st47, '传送门', portalRoom, 1, 'setup');
  portalHero.trapped = true;
  const hi = st47.players.indexOf(portalHero);
  E.helpers.setTrack(st47, hi, 'known', 6);
  st47.turn = hi;
  const beforeKnown = E.helpers.traitVal(st47, hi, 'known');
  const beforePos = portalHero.track.known.pos;
  const escape = E.act(st47, { type: 'hauntAction', key: 'escape_portal' }, portalHero.id, low);
  const afterKnown = E.helpers.traitVal(st47, hi, 'known');
  const afterPos = portalHero.track.known.pos;
  ok('#47 失败档的 knowledge 别名实际推进 known 轨道，不产生 NaN',
    escape.ok && Number.isFinite(afterKnown) && afterPos === beforePos + 1,
    escape.msg + ' pos ' + beforePos + '->' + afterPos + ' value ' + beforeKnown + '->' + afterKnown);
} else ok('#47 英雄存在', false);

console.log('=== #35 太空鼻涕虫：盐才能烧虫巢 ===');
const st35 = fresh(351); start(st35, 35);
const nestRoom = st35.rooms.find((r) => E.helpers.countTokens(st35, '虫巢', { room: r }) > 0);
const salted = st35.players.find((p) => p.side === 'hero' && !p.dead && (p.items || []).some((it) => it.name === '盐' || it.key === '盐'));
if (nestRoom && salted) {
  teleport(salted, nestRoom);
  E.helpers.setTrack(st35, st35.players.indexOf(salted), 'might', 8);
  st35.turn = st35.players.indexOf(salted);
  const burn = E.act(st35, { type: 'hauntAction', key: 'burn_nest' }, salted.id, high);
  ok('#35 持盐英雄可以烧毁虫巢', burn.ok && E.helpers.countTokens(st35, '已毁虫巢') >= 1, burn.msg);
  st35.players.forEach((p) => { p.items = (p.items || []).filter((it) => !(it.name === '盐' || it.key === '盐')); });
  const nextNest = st35.rooms.find((r) => E.helpers.countTokens(st35, '虫巢', { room: r }) > 0);
  if (nextNest) {
    teleport(salted, nextNest);
    st35.haunt.turnUsed = {};
    const noSalt = E.act(st35, { type: 'hauntAction', key: 'burn_nest' }, salted.id, high);
    ok('#35 没有盐不能烧虫巢', !noSalt.ok, noSalt.msg);
  } else ok('#35 第二个虫巢存在', false);
} else ok('#35 虫巢与持盐英雄存在', false);

console.log('=== #42 驱魔：每只幽灵只能被驱魔一次 ===');
const st42x = fresh(4211); start(st42x, 42);
const ghost = st42x.monsters.find((m) => m.type === 'ghost');
const exorcist = st42x.players.find((p) => p.side === 'hero' && !p.dead);
if (ghost && exorcist) {
  const room = st42x.rooms.find((r) => r.symbol === 'event') || st42x.rooms.find((r) => r.kind !== 'start') || st42x.rooms[0];
  room.symbol = 'event';
  ghost.floor = room.floor; ghost.x = room.x; ghost.y = room.y;
  teleport(exorcist, room);
  E.helpers.setTrack(st42x, st42x.players.indexOf(exorcist), 'sanity', 8);
  st42x.turn = st42x.players.indexOf(exorcist);
  const before = st42x.monsters.filter((m) => m.type === 'ghost').length;
  const ex = E.act(st42x, { type: 'hauntAction', key: 'exorcise' }, exorcist.id, high);
  ok('#42 驱魔会移除一只幽灵', ex.ok && st42x.monsters.filter((m) => m.type === 'ghost').length === before - 1, ex.msg + ' ghosts ' + before);
  ok('#42 驱魔生成被驱魔的幽灵标记', E.helpers.countTokens(st42x, '被驱魔的幽灵') === 1, E.helpers.countTokens(st42x, '被驱魔的幽灵'));
} else ok('#42 幽灵与英雄存在', false);

console.log('=== #37 关闭机器人：必须有机器人在场并移除 ===');
const st37x = fresh(3711); start(st37x, 37);
const robot = st37x.monsters.find((m) => m.type === 'security');
const closer = st37x.players.find((p) => p.side === 'hero' && !p.dead);
if (robot && closer) {
  const room = E.helpers.roomAt(st37x, robot.floor, robot.x, robot.y);
  teleport(closer, room);
  E.helpers.setTrack(st37x, st37x.players.indexOf(closer), 'might', 8);
  st37x.turn = st37x.players.indexOf(closer);
  const before = st37x.monsters.filter((m) => m.type === 'security').length;
  const off = E.act(st37x, { type: 'hauntAction', key: 'disable_robot' }, closer.id, high);
  ok('#37 关闭机器人会移除该机器人', off.ok && st37x.monsters.filter((m) => m.type === 'security').length === before - 1, off.msg);
  ok('#37 关闭机器人生成已关闭标记', E.helpers.countTokens(st37x, '已关闭机器人') === 1, E.helpers.countTokens(st37x, '已关闭机器人'));
  const fake = E.act(st37x, { type: 'hauntAction', key: 'disable_robot' }, closer.id, high);
  ok('#37 没有机器人在场时不能关闭', !fake.ok, fake.msg);
} else ok('#37 机器人与英雄存在', false);

console.log('=== #24 拾火：携带到礼拜堂，目标按礼拜堂实际火焰计数 ===');
const st24x = fresh(2411); start(st24x, 24);
const picker = st24x.players.find((p) => p.side === 'hero' && !p.dead);
const chapel = st24x.rooms.find((r) => r.name === '礼拜堂');
if (picker && chapel) {
  const flameRoom = st24x.rooms.find((r) => E.helpers.countTokens(st24x, '精灵之火', { room: r }) > 0);
  if (flameRoom) {
    teleport(picker, flameRoom);
    E.helpers.setTrack(st24x, st24x.players.indexOf(picker), 'sanity', 8);
    st24x.turn = st24x.players.indexOf(picker);
    const boardBefore = E.helpers.countTokens(st24x, '精灵之火');
    const pick = E.act(st24x, { type: 'hauntAction', key: 'pickflame' }, picker.id, high);
    ok('#24 拾火成功并进入携带状态', pick.ok && picker.carryingFlame === true, pick.msg);
    ok('#24 拾火把火焰从板块移到人物板上', E.helpers.countTokens(st24x, '精灵之火') === boardBefore - 1, E.helpers.countTokens(st24x, '精灵之火') + ' / ' + boardBefore);
    teleport(picker, chapel);
    st24x.haunt.turnUsed = {};
    st24x.turn = st24x.players.indexOf(picker);
    const drop1 = E.act(st24x, { type: 'hauntAction', key: 'drop_flame' }, picker.id, high);
    ok('#24 到礼拜堂放下火焰才计入目标', drop1.ok && E.helpers.countTokens(st24x, '精灵之火', { room: chapel }) === 1, drop1.msg);
    const secondRoom = st24x.rooms.find((r) => st24x.tokens.some((t) => t.type === '精灵之火' && t.source !== 'goal' && t.floor === r.floor && t.x === r.x && t.y === r.y));
    if (secondRoom) {
      teleport(picker, secondRoom);
      st24x.haunt.turnUsed = {};
      st24x.turn = st24x.players.indexOf(picker);
      E.act(st24x, { type: 'hauntAction', key: 'pickflame' }, picker.id, high);
      teleport(picker, chapel);
      st24x.haunt.turnUsed = {};
      st24x.turn = st24x.players.indexOf(picker);
      const drop2 = E.act(st24x, { type: 'hauntAction', key: 'drop_flame' }, picker.id, high);
      ok('#24 第二盏火焰带到礼拜堂后达成目标', drop2.ok && st24x.phase === 'ended', drop2.msg + ' chapel ' + E.helpers.countTokens(st24x, '精灵之火', { room: chapel }));
    } else ok('#24 第二盏火焰存在', false);
  } else ok('#24 初始火焰房存在', false);
} else ok('#24 英雄与礼拜堂存在', false);

console.log('=== #47 传送门：任意板块可关闭，脱困是独立行动 ===');
const st47x = fresh(4711); start(st47x, 47);
const trappedHero = st47x.players.find((p) => p.side === 'hero' && !p.dead && p.trapped);
const anyRoom = st47x.rooms.find((r) => r.symbol !== 'omen') || st47x.rooms[0];
if (trappedHero && anyRoom) {
  E.helpers.addToken(st47x, '传送门', anyRoom, 1, 'setup');
  teleport(trappedHero, anyRoom);
  E.helpers.setTrack(st47x, st47x.players.indexOf(trappedHero), 'known', 8);
  st47x.turn = st47x.players.indexOf(trappedHero);
  const close = E.act(st47x, { type: 'hauntAction', key: 'seal' }, trappedHero.id, high);
  ok('#47 任意非预兆板块也能关闭传送门', close.ok && E.helpers.countTokens(st47x, '已关闭传送门') === 1, close.msg);
  ok('#47 关闭传送门本身不解除被困', trappedHero.trapped === true);
  E.helpers.addToken(st47x, '传送门', anyRoom, 1, 'setup');
  st47x.haunt.turnUsed = {};
  st47x.turn = st47x.players.indexOf(trappedHero);
  const escape = E.act(st47x, { type: 'hauntAction', key: 'escape_portal' }, trappedHero.id, high);
  ok('#47 脱困行动成功后才解除被困', escape.ok && trappedHero.trapped === false && trappedHero.heroToken === false, escape.msg);
  ok('#47 脱困后英雄标记交给叛徒', st47x.haunt.traitorHeroTokens === 1, st47x.haunt.traitorHeroTokens);
  E.helpers.addToken(st47x, '传送门', anyRoom, 1, 'setup');
  E.helpers.setTrack(st47x, st47x.players.indexOf(trappedHero), 'sanity', 8);
  st47x.haunt.turnUsed = {};
  st47x.turn = st47x.players.indexOf(trappedHero);
  const sealSanity = E.act(st47x, { type: 'hauntAction', key: 'seal', trait: 'sanity' }, trappedHero.id, high);
  ok('#47 关闭传送门可以用神智判定', sealSanity.ok && E.helpers.countTokens(st47x, '已关闭传送门') === 2, sealSanity.msg);
  const helper = st47x.players.find((q) => q.side === 'hero' && !q.dead && q !== trappedHero);
  if (helper) {
    const st47y = fresh(4712); start(st47y, 47);
    const hero47y = st47y.players.find((q) => q.side === 'hero' && !q.dead);
    const helper47y = st47y.players.find((q) => q.side === 'hero' && !q.dead && q !== hero47y);
    const room47y = st47y.rooms.find((r) => r.symbol !== 'omen') || st47y.rooms[0];
    E.helpers.addToken(st47y, '传送门', room47y, 1, 'setup');
    teleport(hero47y, room47y);
    helper47y.floor = hero47y.floor; helper47y.x = hero47y.x; helper47y.y = hero47y.y;
    E.helpers.setTrack(st47y, st47y.players.indexOf(hero47y), 'known', 1);
    st47y.turn = st47y.players.indexOf(hero47y);
    const sealBonus = E.act(st47y, { type: 'hauntAction', key: 'seal', trait: 'known' }, hero47y.id, high);
    ok('#47 同房间有其他英雄时关闭传送门 +2', sealBonus.ok && E.helpers.countTokens(st47y, '已关闭传送门') === 1, sealBonus.msg);
  }
} else ok('#47 被困英雄与板块存在', false);

console.log('=== #44/#50 官方全局供应标记 ===');
const st44x = fresh(4411); start(st44x, 44);
const hero44 = st44x.players.find((p) => p.side === 'hero' && !p.dead);
const roomA44 = st44x.rooms[0];
const roomB44 = st44x.rooms.find((r) => r !== roomA44 && !E.helpers.isBurningRoom(st44x, r));
if (hero44 && roomB44) {
  teleport(hero44, roomB44);
  E.helpers.setTrack(st44x, st44x.players.indexOf(hero44), 'sanity', 8);
  st44x.turn = st44x.players.indexOf(hero44);
  const fire = E.act(st44x, { type: 'hauntAction', key: 'setfire' }, hero44.id, high);
  ok('#44 可以在别的板块点火', fire.ok && E.helpers.isBurningRoom(st44x, roomB44), fire.msg);
  ok('#44 点火不消耗置于一旁的 5 枚火焰标记',
    st44x.haunt.setup.setAsideTokens['火焰'] === 5, st44x.haunt.setup.setAsideTokens['火焰']);
} else ok('#44 英雄与未着火板块存在', false);

const st50x = fresh(5011); start(st50x, 50);
const hero50 = st50x.players.find((p) => p.side === 'hero' && !p.dead);
const roomB50 = st50x.rooms.find((r) => r !== st50x.rooms[0]);
if (hero50 && roomB50) {
  hero50.items = (hero50.items || []).concat([{ name: '炸药祭品', key: '炸药祭品' }]);
  teleport(hero50, roomB50);
  E.helpers.setTrack(st50x, st50x.players.indexOf(hero50), 'might', 8);
  st50x.turn = st50x.players.indexOf(hero50);
  const plant = E.act(st50x, { type: 'hauntAction', key: 'plant_charge' }, hero50.id, high);
  ok('#50 烧掉物品后可以在任意板块安放炸药',
    plant.ok && E.helpers.countTokens(st50x, '炸药', { goalOnly: true }) === 1, plant.msg);
  ok('#50 安放从置于一旁的供应中扣除一枚',
    st50x.haunt.setup.setAsideTokens['炸药'] === 2, st50x.haunt.setup.setAsideTokens['炸药']);
} else ok('#50 英雄与板块存在', false);

const st44spread = fresh(4412); start(st44spread, 44);
const spreadHero = st44spread.players.find((p) => p.side === 'hero' && !p.dead);
const burnRoom = st44spread.rooms.find((r) => !E.helpers.isBurningRoom(st44spread, r));
if (spreadHero && burnRoom) {
  E.helpers.burnRoom(st44spread, burnRoom);
  const before = st44spread.rooms.filter((r) => E.helpers.isBurningRoom(st44spread, r)).length;
  st44spread.monsterTurn = { actor: spreadHero.id, queue: [] };
  E.act(st44spread, { type: 'monsterEnd' }, spreadHero.id, high);
  const after = st44spread.rooms.filter((r) => E.helpers.isBurningRoom(st44spread, r)).length;
  ok('#44 怪物回合结束时火势向相邻板块扩散', after > before, before + '→' + after);
} else ok('#44 火势扩散前置存在', false);

const st50devour = fresh(5012); start(st50devour, 50);
const traitor50 = st50devour.players[st50devour.haunt.traitor];
const devourRoom = st50devour.rooms.find((r) => r.kind !== 'landing');
if (traitor50 && devourRoom) {
  teleport(traitor50, devourRoom);
  E.helpers.setTrack(st50devour, st50devour.players.indexOf(traitor50), 'might', 8);
  st50devour.turn = st50devour.players.indexOf(traitor50);
  const devour = E.act(st50devour, { type: 'hauntAction', key: 'devour_room' }, traitor50.id, high);
  ok('#50 构造体吞噬当前房间', devour.ok && devourRoom.consumed === true, devour.msg);
} else ok('#50 叛徒与房间存在', false);


console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.join('\n'));
process.exitCode = failed ? 1 : 0;

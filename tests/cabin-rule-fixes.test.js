// 已确认剧本目标、行动与事件标记修正的回归
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); }
}
function seeded(n) { let s = n || 1; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function high() { return 0.99; }
const packsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8');
global.window = global;
vm.runInThisContext(packsSrc, { filename: 'cabin-packs.js' });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'), { filename: 'cabin.js' });
const E = window.CabinEngine;

function scenario(no) { return E.SCENARIOS.find((x) => x.no === no); }
function start(no, n = 3) {
  const ids = Array.from({ length: n }, (_, i) => ({ id: 'r' + i, name: 'R' + i }));
  const st = E.createInitial(ids, seeded(no * 31 + n), { skipSelect: true });
  E.helpers.startHaunt(st, 0, '骨戒', '入口大厅', seeded(no * 17 + n), JSON.parse(JSON.stringify(scenario(no))));
  return st;
}

console.log('=== 2 人局不再补虚拟玩家 ===');
{
  const st = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seeded(1), { skipSelect: true });
  ok('2 人局仍是 2 人', st.players.length === 2, st.players.length);
}

console.log('=== #2 摧毁戒指 ===');
{
  const st = start(2);
  const revealer = st.players[st.haunt.revealer];
  ok('#2 揭示者拿到骨戒', (revealer.items || []).some((it) => it.name === '骨戒'), (revealer.items || []).map((x) => x.name).join(','));
  const r = E.act(st, { type: 'hauntAction', key: 'destroy_ring' }, revealer.id, high);
  ok('#2 摧毁戒指行动成功', r.ok === true, r.msg);
  ok('#2 骨戒进入销毁列表', (st.haunt.destroyedItems || []).includes('骨戒'), st.haunt.destroyedItems);
  ok('#2 英雄达成目标', st.phase === 'ended' && st.winner && st.winner.side === 'heroes', st.winner && st.winner.text);
}

console.log('=== #14 数字轨道 ===');
{
  const st = start(14);
  ok('#14 初始轨道为 4', st.haunt.numberTrack === 4, st.haunt.numberTrack);
  const r = E.act(st, { type: 'hauntAction', key: 'cast_spell' }, st.players[st.haunt.revealer].id, high);
  ok('#14 施法让轨道下降 1', r.ok === true && st.haunt.numberTrack === 3, st.haunt.numberTrack);
}

console.log('=== #19 / #37 行动标记 ===');
{
  const st = start(19);
  const p = st.players[st.haunt.revealer];
  const room = E.helpers.roomAt(st, p.floor, p.x, p.y);
  E.helpers.addToken(st, '录像带', room, 1, 'setup');
  const r = E.act(st, { type: 'hauntAction', key: 'destroy_tape' }, p.id, high);
  ok('#19 摧毁录像带生成已毁标记', r.ok === true && E.helpers.countTokens(st, '已毁录像带') === 1, r.msg);
  const st37 = start(37, 3);
  const p37 = st37.players[st37.haunt.revealer];
  const r37 = E.act(st37, { type: 'hauntAction', key: 'disable_robot' }, p37.id, high);
  ok('#37 关闭机器人生成已关闭标记', r37.ok === true && E.helpers.countTokens(st37, '已关闭机器人') === 1, r37.msg);
  const traitor37 = st37.players[st37.haunt.traitor];
  const hero37 = st37.players.find((q, i) => i !== st37.haunt.traitor && q.side === 'hero' && !q.dead);
  traitor37.floor = hero37.floor; traitor37.x = hero37.x; traitor37.y = hero37.y;
  const dna = E.act(st37, { type: 'hauntAction', key: 'collect_dna' }, traitor37.id, high);
  ok('#37 叛徒可采集同房间英雄 DNA', dna.ok === true && st37.haunt.dnaCollected[hero37.id] === true, dna.msg);
}
{
  const st46 = start(46, 3);
  const traitor46 = st46.players[st46.haunt.traitor];
  const hero46 = st46.players.find((q, i) => i !== st46.haunt.traitor && q.side === 'hero' && !q.dead);
  traitor46.floor = hero46.floor; traitor46.x = hero46.x; traitor46.y = hero46.y;
  const infect = E.act(st46, { type: 'hauntAction', key: 'infect_hero' }, traitor46.id, high);
  ok('#46 叛徒可把同房间英雄变成毛发怪', infect.ok === true && hero46.side === 'traitor' && hero46.hairMonster === true, infect.msg);
}

console.log('=== 楼梯连接 ===');
{
  const st = start(8);
  const p = st.players[st.haunt.revealer];
  const stair = E.helpers.roomByName(st, '主楼梯');
  p.floor = stair.floor; p.x = stair.x; p.y = stair.y;
  const r = E.act(st, { type: 'stair' }, p.id, high);
  const upper = E.helpers.roomByName(st, '上层平台');
  ok('主楼梯只连到上层平台，不再门厅/楼梯间错配', r.ok === true && p.floor === upper.floor && p.x === upper.x && p.y === upper.y, r.msg);
}

console.log('=== 特殊房间 ===');
{
  const st = start(8, 3);
  const p = st.players[st.haunt.revealer];
  const base = E.ROOMS.find((r) => r.name === '洗衣滑道');
  st.rooms.push(Object.assign({}, base, { floor: 'ground', x: 2, y: 2, rot: 0, revealed: true, kind: 'normal' }));
  p.floor = 'ground'; p.x = 2; p.y = 2;
  E.act(st, { type: 'end' }, p.id, high);
  ok('洗衣滑道只在结束回合时滑落', p.floor === 'basement' && p.x === 4 && p.y === 6, p.floor + ',' + p.x + ',' + p.y);

  const st2 = start(8, 3);
  const p2 = st2.players[st2.haunt.revealer];
  const collapsed = E.ROOMS.find((r) => r.name === '坍塌房间');
  st2.rooms.push(Object.assign({}, collapsed, { floor: 'ground', x: 2, y: 2, rot: 0, revealed: true, kind: 'normal' }));
  p2.floor = 'ground'; p2.x = 2; p2.y = 2;
  E.act(st2, { type: 'end' }, p2.id, high);
  ok('坍塌房间不在放置时重复判定，只在结束回合判定', st2.pendingRoll === null || st2.pendingRoll === undefined, st2.pendingRoll);
}

console.log('=== custom 目标不再被 Setup 标志直接满足 ===');
{
  const st36 = start(36);
  E.helpers.checkWin(st36);
  ok('#36 觉悟不会因 Setup 标志直接获胜', st36.phase !== 'ended', st36.winner && st36.winner.text);

  const st50 = start(50);
  E.helpers.checkWin(st50);
  ok('#50 吞噬房子不会因 Setup 标志直接获胜', st50.phase !== 'ended', st50.winner && st50.winner.text);
  st50.rooms.forEach((r) => { if (r.kind !== 'landing') r.consumed = true; });
  E.helpers.checkWin(st50);
  ok('#50 所有非平台房间都被吞噬后才判叛徒胜', st50.phase === 'ended' && st50.winner && st50.winner.side === 'traitor', st50.winner && st50.winner.text);

  const st13 = start(13);
  const tr13 = st13.players[st13.haunt.traitor];
  const ritual = E.helpers.roomByName(st13, '仪式房');
  tr13.floor = ritual.floor; tr13.x = ritual.x; tr13.y = ritual.y;
  const adv = E.act(st13, { type: 'hauntAction', key: 'advance_ritual' }, tr13.id, high);
  ok('#13 推进仪式会降低数字轨道', adv.ok === true && st13.haunt.numberTrack === 2, st13.haunt.numberTrack);
  st13.haunt.numberTrack = 0;
  E.helpers.checkWin(st13);
  ok('#13 轨道归零才唤醒沉睡之她', st13.phase === 'ended' && st13.winner && st13.winner.side === 'traitor', st13.winner && st13.winner.text);
}

console.log('=== #27 / #32 / #39 / #49 custom 目标 ===');
{
  const st27 = start(27);
  const tr27 = st27.players[st27.haunt.traitor];
  st27.turn = st27.haunt.traitor;
  ok('#27 Setup 给出外星文字供应与已放 1 个', st27.haunt.wordSupply === 5 && st27.haunt.wordsPlaced === 1, st27.haunt.wordSupply + '/' + st27.haunt.wordsPlaced);
  const w = E.act(st27, { type: 'hauntAction', key: 'spread_word' }, tr27.id, high);
  ok('#27 铺下一个外星文字', w.ok === true && st27.haunt.wordsPlaced === 2, w.msg);
  st27.haunt.wordsPlaced = st27.haunt.wordSupply;
  E.helpers.checkWin(st27);
  ok('#27 全部铺完后叛徒获胜', st27.phase === 'ended' && st27.winner && st27.winner.side === 'traitor', st27.winner && st27.winner.text);

  const st32 = start(32);
  const tr32 = st32.players[st32.haunt.traitor];
  st32.turn = st32.haunt.traitor;
  st32.monsterTurn = { actor: tr32.id, queue: [], awaitingDamage: false };
  const fire = E.act(st32, { type: 'hauntAction', key: 'spread_fire' }, tr32.id, high);
  ok('#32 死亡叛徒在怪物阶段可以点火', fire.ok === true && st32.haunt.burnedFloors && st32.haunt.burnedFloors[tr32.floor] === true, fire.msg);
  st32.haunt.burnedFloors = { upper: true, ground: true, basement: true };
  E.helpers.checkWin(st32);
  ok('#32 三层烧起来后叛徒获胜', st32.phase === 'ended' && st32.winner && st32.winner.side === 'traitor', st32.winner && st32.winner.text);

  const st39 = start(39);
  const tr39 = st39.players[st39.haunt.traitor];
  st39.turn = st39.haunt.traitor;
  const t = E.act(st39, { type: 'hauntAction', key: 'drain_time' }, tr39.id, high);
  ok('#39 时间流逝降低数字轨道', t.ok === true && st39.haunt.numberTrack === 4, st39.haunt.numberTrack);
  st39.haunt.numberTrack = 0;
  E.helpers.checkWin(st39);
  ok('#39 轨道归零后时间耗尽', st39.phase === 'ended' && st39.winner && st39.winner.side === 'traitor', st39.winner && st39.winner.text);

  const st49 = start(49);
  const tr49 = st49.players[st49.haunt.traitor];
  st49.turn = st49.haunt.traitor;
  const hero49 = st49.players.find((q) => q.side === 'hero' && q.blood > 0);
  tr49.floor = hero49.floor; tr49.x = hero49.x; tr49.y = hero49.y;
  const blood = E.act(st49, { type: 'hauntAction', key: 'collect_blood' }, tr49.id, high);
  ok('#49 从同房间英雄取得血液', blood.ok === true && st49.haunt.bloodCollected === 1, blood.msg);
  const demon = st49.monsters.find((m) => m.name === '恶魔' && !m.dead);
  tr49.floor = demon.floor; tr49.x = demon.x; tr49.y = demon.y;
  st49.haunt.turnUsed = {};
  const offer = E.act(st49, { type: 'hauntAction', key: 'offer_blood' }, tr49.id, high);
  ok('#49 把血献给恶魔', offer.ok === true && st49.haunt.bloodOffered === 1, offer.msg);
  st49.haunt.bloodOffered = st49.haunt.bloodHeroes;
  E.helpers.checkWin(st49);
  ok('#49 献上所有英雄之血后叛徒获胜', st49.phase === 'ended' && st49.winner && st49.winner.side === 'traitor', st49.winner && st49.winner.text);
}

console.log('=== 事件 token 效果 ===');
{
  const st = start(8);
  const p = st.players[st.haunt.revealer];
  E.helpers.applyEffect(st, st.players.indexOf(p), { ops: [{ token: '祝福' }] }, high);
  ok('一线希望的祝福标记被放到玩家房间', E.helpers.countTokens(st, '祝福', { room: E.helpers.roomAt(st, p.floor, p.x, p.y) }) === 1);
}

console.log('=== #50 Setup 标志与目标键一致 ===');
{
  const st = start(50);
  ok('#50 Setup 写入 devour_the_house', st.haunt.setup.flags.devour_the_house === true, Object.keys(st.haunt.setup.flags).join(','));
  ok('#50 叛徒目标读取 devour_the_house', JSON.stringify(st.haunt.traitorGoal).includes('devour_the_house'));
}

console.log('=== #3 多叛徒 / #5 数量 / #13 属性 / #15 死亡叛徒 ===');
{
  const st3 = start(3, 6);
  ok('#3 六人局有两个叛徒', st3.haunt.traitors && st3.haunt.traitors.length === 2, JSON.stringify(st3.haunt.traitors));
  ok('#3 六人局两个「1」疾病标记', (st3.haunt.setup.diseaseOneIds || []).length === 2, JSON.stringify(st3.haunt.setup.diseaseOneIds));
  ok('#3 两名玩家实际是叛徒阵营', st3.players.filter((p) => p.side === 'traitor').length === 2, st3.players.map((p) => p.side).join(','));

  const st3small = start(3, 4);
  ok('#3 四人局只有一个叛徒', st3small.haunt.traitors.length === 1, JSON.stringify(st3small.haunt.traitors));

  const st5 = start(5, 3);
  ok('#5 三人局共 6 只小天使', st5.monsters.filter((m) => m.key === 'cherub').length === 6, st5.monsters.length);

  const st13 = start(13, 3);
  const tr13 = st13.players[st13.haunt.traitor];
  ok('#13 叛徒力量 +1', tr13.track.might.pos === tr13.track.might.startPos + 1, tr13.track.might.pos);
  ok('#13 叛徒速度 +1', tr13.track.speed.pos === tr13.track.speed.startPos + 1, tr13.track.speed.pos);
  ok('#13 叛徒其余属性恢复', tr13.track.known.pos === tr13.track.known.startPos && tr13.track.sanity.pos === tr13.track.sanity.startPos, JSON.stringify(tr13.track));

  const st15 = start(15, 3);
  ok('#15 叛徒角色已死亡', st15.players[st15.haunt.traitor].dead === true, st15.players.map((p) => p.dead).join(','));
  ok('#15 怪物控制者已记录', st15.haunt.monsterController === st15.haunt.traitor, st15.haunt.monsterController);
  st15.turn = 2;
  st15.haunt.justStarted = false;
  const r15 = E.act(st15, { type: 'end' }, st15.players[2].id, high);
  ok('#15 回合结束进入怪物阶段', r15.ok && !!st15.monsterTurn && st15.monsterTurn.actor === st15.players[st15.haunt.traitor].id, st15.monsterTurn && st15.monsterTurn.actor);
  const st15w = start(15, 3);
  st15w.players.filter((p) => p.side === 'hero').forEach((p) => { p.dead = true; });
  E.helpers.checkWin(st15w);
  ok('#15 英雄全灭时怪物控制者获胜', st15w.phase === 'ended' && st15w.winner && st15w.winner.side === 'traitor', st15w.winner && st15w.winner.text);

  const st6 = start(6, 3);
  ok('#6 证据标记实际分布到地图', (st6.haunt.setup.evidenceTokens || []).length === 8, JSON.stringify(st6.haunt.setup.evidenceTokens));
  ok('#6 证据标记覆盖多个区域', new Set((st6.haunt.setup.evidenceTokens || []).map((e) => e.floor)).size >= 2, JSON.stringify(st6.haunt.setup.evidenceTokens));

  const st7 = start(7, 3);
  ok('#7 镜界状态已建立', !!st7.haunt.mirrorRealm && st7.players[st7.haunt.revealer].trapped === true, JSON.stringify(st7.haunt.mirrorRealm));

  const st17 = start(17, 3);
  ok('#17 纸条已发到具体英雄', !!st17.haunt.dieNote && !!st17.haunt.dieNote.holder && st17.players.find((p) => p.id === st17.haunt.dieNote.holder).note === 'DIE', JSON.stringify(st17.haunt.dieNote));

  const st18 = start(18, 3);
  ok('#18 叛徒离场且真身已记录', st18.players[st18.haunt.traitor].outside === true && st18.haunt.trueBody === st18.haunt.traitor, st18.haunt.trueBody);
}

console.log('---');
console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.join('\n'));
process.exitCode = failed ? 1 : 0;

// 已确认剧本目标、行动与事件标记修正的回归
const fs = require('fs');
const path = require('path');
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
eval(packsSrc);
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'));
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
  E.helpers.addToken(st, '录像带', room, 1);
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
  st50.haunt.devouredFloors = { upper: true, ground: true, basement: true };
  E.helpers.checkWin(st50);
  ok('#50 三层都被吞噬后才判叛徒胜', st50.phase === 'ended' && st50.winner && st50.winner.side === 'traitor', st50.winner && st50.winner.text);

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

console.log('---');
console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.join('\n'));
process.exitCode = failed ? 1 : 0;

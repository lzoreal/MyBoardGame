/* 官方 3E 剧本包自测：node tests/cabin-official.test.js */
global.window = global;
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

eval(fs.readFileSync(path.join(root, 'js/games/cabin-packs.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'js/games/cabin.js'), 'utf8'));
const E = window.CabinEngine;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); }
}

const official = E.SCENARIOS.filter((s) => s.key.indexOf('official_3e_') === 0);
const byKey = (k) => E.SCENARIOS.find((s) => s.key === k);
function seeded(n) {
  let s = n || 1;
  return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
function queue(list) { let i = 0; return function () { return list[i++ % list.length]; }; }
const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];

console.log('=== 官方剧本包 ===');
ok('官方剧本 50 条全部载入', official.length === 50, official.length);
ok('45 条按剧本卡触发', official.filter((s) => s.trigger && s.trigger.card).length === 45);
ok('5 条按事件触发', official.filter((s) => s.trigger && s.trigger.event).length === 5);
ok('编号 1–50 无缺口', official.map((s) => s.no).sort((a, b) => a - b).join(',').split(',').length === 50);

ok('诅咒 + 骨戒 → 永远的朋友', E.pickScenario({ scenarioCard: '诅咒' }, '*', '骨戒').key === 'official_3e_2',
  E.pickScenario({ scenarioCard: '诅咒' }, '*', '骨戒').key);
ok('待售 + 骨戒 → 美丽花园', E.pickScenario({ scenarioCard: '待售' }, '*', '骨戒').key === 'official_3e_29',
  E.pickScenario({ scenarioCard: '待售' }, '*', '骨戒').key);
ok('超自然调查员 + 骨戒 → 这枚戒指真不错', E.pickScenario({ scenarioCard: '超自然调查员' }, '*', '骨戒').key === 'official_3e_18',
  E.pickScenario({ scenarioCard: '超自然调查员' }, '*', '骨戒').key);
ok('诅咒 + 圣徽 → 镜头记录', E.pickScenario({ scenarioCard: '诅咒' }, '*', '圣徽').key === 'official_3e_19');
ok('待售 + 骷髅 → 地下行动', E.pickScenario({ scenarioCard: '待售' }, '*', '骷髅').key === 'official_3e_22');
ok('无剧本卡时不误命中官方剧本', E.pickScenario(null, '门厅', '骨戒').key !== 'official_3e_2');

const sh = official.find((s) => s.key === 'official_3e_50');
ok('地下屋剧本带翻覆与分层目标', !!sh && sh.flipRooms === true && sh.heroGoal.type === 'rig');
const wasp = official.find((s) => s.key === 'official_3e_39');
ok('大蜂后怪物面板四项属性', !!wasp && wasp.monster && wasp.monster.might === 6 && wasp.monster.known === 5);
ok('随机剧本卡落在 6 张之内', ['无', '待售', '诅咒', '神秘邀请', '离奇失踪', '超自然调查员'].indexOf(
  E.createInitial(players, () => 0.5).scenarioCard) >= 0);

console.log('=== 事件直接触发 ===');
const evState = E.createInitial(players, seeded(7), { skipSelect: true });
ok('事件牌池包含官方 5 张', ['绯红之溅', '一管尘', '诡异镜子', '说茄子', '房子饿了'].every((n) =>
  evState.decks.events.some((c) => c.name === n)));
evState.haunt = null;
E.helpers.maybeEventHaunt(evState, 0, '说茄子', '入口大厅', seeded(9));
ok('「说茄子」直接触发官方剧本 #33', evState.haunt && evState.haunt.active && evState.haunt.scenario === 'official_3e_33',
  evState.haunt && evState.haunt.scenario);
ok('事件触发的闹鬼被标记', evState.haunt && evState.haunt.fromEvent === '说茄子');
const evNone = E.createInitial(players, seeded(8), { skipSelect: true });
evNone.haunt = null;
E.helpers.maybeEventHaunt(evNone, 0, '书架低语', '入口大厅', seeded(9));
ok('非官方事件不会触发闹鬼', evNone.haunt === null);

console.log('=== 英雄互攻（混战） ===');
const ffa = E.createInitial(players, seeded(11), { skipSelect: true });
ffa.haunt = { active: true, traitor: -1, pvp: true, round: 1, progress: 0, justStarted: false, used: {},
  heroGoal: { type: 'killAll' }, traitorGoal: { type: 'killAll' } };
ffa.players.forEach((p) => { p.x = ffa.players[0].x; p.y = ffa.players[0].y; p.floor = ffa.players[0].floor; });
const pvpHit = E.act(ffa, { type: 'attack', target: 'b', trait: 'might' }, 'a', queue([0.99, 0.99, 0, 0, 0, 0, 0, 0]));
ok('混战里可以攻击同为英雄的玩家', pvpHit.ok === true, pvpHit.msg);
const noPvp = E.createInitial(players, seeded(12), { skipSelect: true });
noPvp.haunt = { active: true, traitor: 1, pvp: false, round: 1, progress: 0, justStarted: false, used: {},
  heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'killAll' } };
noPvp.players.forEach((p) => { p.x = noPvp.players[0].x; p.y = noPvp.players[0].y; p.floor = noPvp.players[0].floor; });
const noPvpHit = E.act(noPvp, { type: 'attack', target: 'b', trait: 'might' }, 'a', seeded(1));
ok('普通剧本仍不能攻击自己人', noPvpHit.ok === false && noPvpHit.msg.indexOf('自己人') >= 0, noPvpHit.msg);
const last = E.createInitial(players, seeded(13), { skipSelect: true });
last.haunt = { active: true, traitor: -1, pvp: true, round: 1, progress: 0, justStarted: false, used: {},
  heroGoal: { type: 'killAll' }, traitorGoal: { type: 'killAll' } };
last.players[1].dead = true; last.players[2].dead = true;
E.helpers.checkWin(last);
ok('混战只剩一人即判胜', last.phase === 'ended' && /最后活着/.test(last.winner.text), last.winner && last.winner.text);

console.log('全部' + (fail ? '失败' : '通过') + '：' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

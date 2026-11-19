/* 诡镇原创内容包试点测试 */
global.window = global.window || {};
require('../js/games/arkham.js');
require('../js/games/arkham-pilot-pack.js');
const E = global.window.ArkhamEngine;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name + (extra ? ' = ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' = ' + extra : '')); }
}
function rng() { return 0.5; }

console.log('— 试点包注册');
ok('新增调查员', E.INVESTIGATORS.some((x) => x.id === 'pilotArchivist'));
ok('新增卡牌', !!E.CARDS.pilotLetter);
ok('新增剧本', !!E.SCENARIOS.pilot);
ok('剧本顺序在主线之后', E.SCENARIOS.pilot.order > E.SCENARIOS.abyss.order);

console.log('— 开局与 setup');
const st = E.createInitial([], rng, { investigator: 'pilotArchivist', scenario: 'pilot' });
ok('起点为旧邮局', st.inv.location === 'postoffice', st.inv.location);
ok('分拣室有 1 个线索', st.locations.sorting.clues === 1, st.locations.sorting.clues);
ok('setup 猎犬已入场', st.enemies.length === 1 && st.enemies[0].name === '雾中的猎犬', st.enemies[0] && st.enemies[0].name);
ok('猎犬带标签', st.enemies[0].tags && st.enemies[0].tags.indexOf('hound') >= 0);

console.log('— 调查员能力与卡牌');
st.inv.actions = 3;
const move = E.act(st, { type: 'move', to: 'sorting' }, st.inv.id, () => 0.999);
ok('移动到分拣室', move.ok === true && st.inv.location === 'sorting');
ok('首次进入新地点获得资源', st.inv.resources === 6, st.inv.resources);

st.inv.hand = ['pilotLetter'];
st.inv.actions = 3;
st.inv.resources = 5;
const play = E.act(st, { type: 'play', index: 0 }, st.inv.id, rng);
ok('试点卡牌效果执行', play.ok === true && st.flags.pilotLetter === true);
ok('试点卡牌进入弃牌堆', st.inv.discard.indexOf('pilotLetter') >= 0);

console.log('— 密谋与首领');
st.inv.clues = 2;
st.inv.actions = 3;
const adv = E.act(st, { type: 'advanceAct' }, st.inv.id, rng);
ok('集齐线索推进密谋', adv.ok === true && st.act.stage === 2, st.act.stage);
const boss = st.enemies.find((e) => e.boss && e.health > 0);
ok('守门人在锅炉房出现', !!boss && boss.location === 'boiler', boss && boss.name);

console.log('— 试点章胜利');
st.inv.location = 'boiler';
st.inv.actions = 3;
st.inv.stats.combat = 10;
boss.health = 1;
const win = E.act(st, { type: 'fight', enemy: boss.id }, st.inv.id, () => 0.999);
ok('击败守门人完成试点', win.ok === true && st.phase === 'ended' && st.resolution.result === 'win', st.resolution && st.resolution.result);

console.log('\n通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);

/* 诡镇引擎内容包契约测试 */
global.window = global.window || {};
require('../js/games/arkham.js');
const E = global.window.ArkhamEngine;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name + (extra ? ' = ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' = ' + extra : '')); }
}
function rng() { return 0.5; }

console.log('— 注册内容包');
const probeEnemy = {
  name: '探针守卫', fight: 2, evade: 2, health: 3, damage: 1, horror: 1
};
const probeInv = {
  id: 'probeInv', name: '测试调查员', role: '测试', color: '#888',
  stats: { will: 3, int: 3, combat: 3, agi: 3 }, health: 6, sanity: 6,
  ability: '', abilityText: '', deck: ['probeCard']
};
const probeScenario = {
  id: 'probe', chapter: '测试章', name: '契约测试', subtitle: '测试',
  start: 'lab', intro: '测试开局',
  locations: {
    lab: { name: '实验室', clues: 0, shroud: 2, links: ['hall'] },
    hall: { name: '走廊', clues: 0, shroud: 2, links: ['lab'] }
  },
  encounters: [],
  act: [{ label: '测试第一幕', clues: 0 }],
  agenda: [{ doom: 4, label: '测试议程' }],
  tokenRules: { skull: () => 5 },
  setup: [
    { op: 'spawnEnemy', enemy: 'probeEnemy', locations: ['lab'], tags: ['probe'] },
    { op: 'addClues', at: 'lab', amount: 1 }
  ]
};
ok('注册内容包成功', E.registerContent({
  cards: { probeCard: { id: 'probeCard', name: '探针', type: 'event', cost: 1, effect: 'probeEffect', text: '' } },
  investigators: [probeInv],
  enemies: { probeEnemy: probeEnemy },
  scenarios: { probe: probeScenario }
}));
ok('新卡已进入卡池', !!E.CARDS.probeCard);
ok('新调查员已进入名单', E.INVESTIGATORS.some((x) => x.id === 'probeInv'));
ok('新剧本已进入名单', !!E.SCENARIOS.probe);

console.log('— Setup 与钩子');
E.registerHook('gameStart', (state) => { state.flags.probeStart = true; });
const st = E.createInitial([], rng, { investigator: 'probeInv', scenario: 'probe' });
ok('剧本 setup 生成了敌人', st.enemies.length === 1, st.enemies.length);
ok('setup 敌人挂上标签', st.enemies[0].tags && st.enemies[0].tags.indexOf('probe') >= 0);
ok('setup 补放了线索', st.locations.lab.clues === 1, st.locations.lab.clues);
ok('gameStart 钩子触发', st.flags.probeStart === true);
ok('剧本 tokenRule 覆盖骷髅', E.helpers.tokenMod(st, 'skull') === 5, E.helpers.tokenMod(st, 'skull'));

console.log('— 卡牌效果与自定义动作');
E.registerCardEffect('probeEffect', (state, inv) => { inv.clues += 1; state.flags.probeEffect = true; });
st.inv.hand = ['probeCard'];
st.inv.discard = [];
st.inv.resources = 5;
st.inv.actions = 3;
const play = E.act(st, { type: 'play', index: 0 }, st.inv.id, rng);
ok('自定义卡牌效果执行', play.ok === true && st.inv.clues === 1 && st.flags.probeEffect === true);
ok('事件牌进入弃牌堆', st.inv.discard.indexOf('probeCard') >= 0);

E.registerAction('probeAction', (state, action, inv) => {
  inv.resources += Number(action.amount) || 1;
  return { ok: true, state: state };
});
const action = E.act(st, { type: 'probeAction', amount: 2 }, st.inv.id, rng);
ok('自定义动作执行', action.ok === true && st.inv.resources === 6, st.inv.resources);

console.log('— 剧本钩子');
E.registerHook('enemyDefeated', (state, payload) => {
  state.flags.probeKill = payload.enemy.name;
});
E.registerHook('enterLocation', (state, payload) => {
  state.flags.probeEnter = payload.to.id;
});
E.registerEncounterEffect('probeEncounter', (state) => {
  state.flags.probeEncounter = true;
});
E.helpers.takeDamage; // 保持 API 存在
const enemy = st.enemies[0];
enemy.health = 1;
st.inv.location = 'lab';
st.inv.actions = 3;
st.phase = 'investigation';
const before = st.enemies.length;
const fight = E.act(st, { type: 'fight', enemy: enemy.id }, st.inv.id, () => 0.999);
ok('战斗击败 setup 敌人', fight.ok === true && st.enemies.filter((x) => x.health > 0).length === 0, st.enemies.length);
ok('enemyDefeated 钩子触发', st.flags.probeKill === '探针守卫', st.flags.probeKill);
ok('击败后标签计数增加', st.defeatedTags && st.defeatedTags.probe === 1, st.defeatedTags && st.defeatedTags.probe);

console.log('— 地点与遭遇扩展');
st.inv.actions = 3;
st.phase = 'investigation';
const move = E.act(st, { type: 'move', to: 'hall' }, st.inv.id, rng);
ok('移动到新地点', move.ok === true && st.inv.location === 'hall');
ok('enterLocation 钩子触发', st.flags.probeEnter === 'hall', st.flags.probeEnter);

st.inv.actions = 0;
st.encounter.deck = [{ key: 'probeEnc', name: '探针遭遇', effect: 'probeEncounter' }];
st.encounter.discard = [];
const endTurn = E.act(st, { type: 'endTurn' }, st.inv.id, rng);
ok('遭遇效果注册后执行', endTurn.ok === true && st.flags.probeEncounter === true);

console.log('\n通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);

/* 林中小屋 3E（纯第三版数据）自测：node tests/cabin.test.js */
global.window = global;
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/games/cabin-packs.js'), 'utf8'), { filename: 'cabin-packs.js' });
vm.runInThisContext(fs.readFileSync(path.join(root, 'js/games/cabin.js'), 'utf8'), { filename: 'cabin.js' });
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
function make(rand) {
  return E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], rand || seeded(7), { skipSelect: true });
}

console.log('=== 3E 组件 ===');
ok('人物正好 12 名', E.CHARS.length === 12);
ok('每名人物都有年龄', E.CHARS.every((c) => Number(c.age) >= 1 && Number(c.age) <= 99));
ok('剧本正好 50 条', E.SCENARIOS.length === 50);
ok('房间牌 46 张（不含起始）', E.TILES.draw.length === 46);
ok('事件牌 43 张', E.EVENTS.length === 43);
ok('物品牌 22 张', E.ITEMS.length === 22);
ok('预兆牌 9 张', E.OMENS.length === 9);
ok('剧本卡 5 张', E.SCENARIO_CARDS.length === 5);
ok('剧本卡里没有「无」', E.SCENARIO_CARDS.indexOf('无') < 0);

console.log('=== 房间 ===');
const rooms = E.TILES.draw;
ok('门位只用 N/E/S/W', rooms.every((r) => /^[NESW]*$/.test(r.doors)));
ok('每间房最多四扇门', rooms.every((r) => r.doors.length <= 4));
ok('符号只有事件/物品/预兆/无', rooms.every((r) => !r.symbol || ['event', 'item', 'omen'].indexOf(r.symbol) >= 0));
ok('三层都有房间', E.TILES.ground.length > 0 && E.TILES.upper.length > 0 && E.TILES.basement.length > 0);
ok('房间名不重复', new Set(rooms.map((r) => r.name)).size === rooms.length);
ok('起始房不进入抽牌堆', rooms.every((r) => !r.start));

console.log('=== 开局 ===');
const st = make();
ok('开局 5 个起始房间', st.rooms.length === 5);
ok('房间牌堆 46 张', st.roomDeck.length === 46);
ok('事件堆 43 张', st.decks.events.length === 43);
ok('物品堆 22 张', st.decks.items.length === 22);
ok('预兆堆 9 张', st.decks.omens.length === 9);
ok('剧本卡在 5 张里', E.SCENARIO_CARDS.indexOf(st.scenarioCard) >= 0);
ok('角色分配带年龄', st.players.every((p) => p.age >= 1));
ok('起始房间覆盖三层平台', st.rooms.some((r) => r.floor === 'upper') && st.rooms.some((r) => r.floor === 'basement'));

console.log('=== 3E 闹鬼判定 ===');
const st2 = make(function () { return 0.99; });
st2.omenThisTurn = true;
st2.omens = 3;
st2.decks.omens = [];
st2.omenCard = '骷髅';
st2.omenRoom = '图书室';
E.act(st2, { type: 'end' }, 'a', () => 0.99);
ok('骰数等于预兆数（3 骰共 6 点）', st2.logs.some((l) => l.indexOf('3 骰共 6 点') >= 0));
ok('总点数 ≥5 触发闹鬼', !!(st2.haunt && st2.haunt.active));

const st3 = make(function () { return 0; });
st3.omenThisTurn = true;
st3.omens = 3;
E.act(st3, { type: 'end' }, 'a', () => 0);
ok('总点数 <5 不触发', !(st3.haunt && st3.haunt.active));

const st4 = make(function () { return 0; });
st4.omenThisTurn = true;
st4.omens = 2;
st4.omenLast = true;
st4.decks.omens = [];
E.act(st4, { type: 'end' }, 'a', () => 0);
ok('最后一张预兆抽完，0 点也强制闹鬼', !!(st4.haunt && st4.haunt.active));

console.log('=== 剧本匹配 ===');
const st5 = make();
st5.scenarioCard = '诅咒';
st5.omens = 1;
const sc = E.pickScenario(st5, '图书室', '骨戒');
ok('诅咒 + 骨戒 命中 2 号剧本', sc && sc.no === 2);
st5.scenarioCard = '待售';
ok('待售 + 骨戒 命中 29 号剧本', E.pickScenario(st5, '图书室', '骨戒').no === 29);
st5.scenarioCard = '超自然调查员';
ok('超自然调查员 + 骨戒 命中 18 号剧本', E.pickScenario(st5, '图书室', '骨戒').no === 18);

const eventTriggers = E.SCENARIOS.filter((s) => s.trigger && s.trigger.event);
ok('事件直接触发的剧本 5 条', eventTriggers.length === 5);
ok('事件名都能在对局事件牌里找到', eventTriggers.every((s) => E.EVENTS.some((e) => e.name === s.trigger.event)));
ok('预兆触发的剧本用的都是 3E 九张预兆', E.SCENARIOS.filter((s) => s.trigger && s.trigger.omen).every((s) => E.OMENS.some((o) => o.name === s.trigger.omen)));

console.log('=== 卡牌文案 ===');
ok('事件名不重复', new Set(E.EVENTS.map((e) => e.name)).size === E.EVENTS.length);
ok('物品名不重复', new Set(E.ITEMS.map((e) => e.name)).size === E.ITEMS.length);
ok('预兆名不重复', new Set(E.OMENS.map((e) => e.name)).size === E.OMENS.length);
ok('每张事件都有中文正文', E.EVENTS.every((e) => e.text && e.text.length > 5));
ok('每张物品都有中文正文', E.ITEMS.every((e) => e.text && e.text.length > 5));
ok('每张预兆都有中文正文', E.OMENS.every((e) => e.text && e.text.length > 5));
ok('预兆卡都标了 omen', E.OMENS.every((o) => o.omen === true));
ok('剧本卡都有触发条件', E.SCENARIOS.every((s) => s.trigger && (s.trigger.omen || s.trigger.event)));

console.log(fail ? '失败 ' + fail + '，通过 ' + pass : '全部通过：' + pass + ' passed, 0 failed');
process.exit(fail ? 1 : 0);

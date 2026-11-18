/* 林中小屋规则自测：node tests/cabin.test.js */
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

console.log('=== 开局 ===');
const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const st0 = E.createInitial(players, seeded(7), { skipSelect: true });
ok('三人开局', st0.players.length === 3);
ok('每人有一套角色', st0.players.every((p) => p.charName && p.traits.might > 0));
ok('都在前厅', st0.players.every((p) => p.floor === 'ground' && p.x === 2 && p.y === 2));
ok('预置房间 5 间（前厅 + 两组楼梯）', st0.rooms.length === 5);
ok('三个骰池都有牌', st0.decks.events.length > 0 && st0.decks.items.length > 0 && st0.decks.omens.length > 0);
ok('先手是 A', st0.players[st0.turn].id === 'a');

console.log('=== 选角色 ===');
const sp = E.createInitial(players, seeded(5));
ok('开局先进入选角色阶段', sp.phase === 'select');
ok('角色池 6 个', E.CHARS.length === 6);
ok('一开始都没有角色', sp.players.every((p) => !p.char));
const pk1 = E.act(sp, { type: 'pick', char: 'zoe' }, 'a', seeded(6));
ok('A 选到佐伊', pk1.ok === true && pk1.state.players[0].char === 'zoe');
ok('同一个角色不能被第二个人选', E.act(pk1.state, { type: 'pick', char: 'zoe' }, 'b', seeded(7)).ok === false);
const pk2 = E.act(pk1.state, { type: 'pick', char: 'flash' }, 'b', seeded(8));
const pk3 = E.act(pk2.state, { type: 'pick', char: 'jade' }, 'c', seeded(9));
ok('三人选完自动开局', pk3.ok === true && pk3.state.phase === 'playing');
ok('开局都在前厅', pk3.state.players.every((p) => p.x === 2 && p.y === 2));
ok('选完从 A 开始', pk3.state.players[pk3.state.turn].id === 'a');
ok('角色属性生效', pk3.state.players[0].traits.known === 5);

console.log('=== 剧本库 ===');
ok('剧本总数 50', E.SCENARIOS.length === 50);
ok('每个剧本字段齐全', E.SCENARIOS.every((s) => s.key && s.name && s.story && s.heroGoalText && s.traitorGoalText && s.heroGoal && s.heroGoal.type));
ok('目标类型都在支持范围内', E.SCENARIOS.every((s) => ['killTraitor', 'ritual', 'escape', 'wolves', 'survive'].indexOf(s.heroGoal.type) >= 0));
ok('剧本 key 不重复', new Set(E.SCENARIOS.map((s) => s.key)).size === E.SCENARIOS.length);
ok('剧本名不重复', new Set(E.SCENARIOS.map((s) => s.name)).size === E.SCENARIOS.length);
const ALL_ROOMS = ['前厅'].concat([].concat(E.TILES.ground, E.TILES.upper, E.TILES.basement).map((t) => t.name));
ok('仪式房间都在房间库里', E.SCENARIOS.every((s) => s.heroGoal.type !== 'ritual' || ALL_ROOMS.indexOf(s.heroGoal.room) >= 0));
ok('逃跑房间都在房间库里', E.SCENARIOS.every((s) => s.heroGoal.type !== 'escape' || ['前厅'].concat(ALL_ROOMS).indexOf(s.heroGoal.room || '前厅') >= 0));
const pickChapel = E.pickScenario({}, '礼拜堂', seeded(11));
ok('抽到礼拜堂时优先礼拜堂剧本', pickChapel.heroGoal.room === '礼拜堂');
const noRoom = E.pickScenario({}, null, seeded(12));
ok('没有房间线索时也能抽出剧本', !!noRoom && !!noRoom.key);
ok('同一局不会重复抽同一个剧本', E.pickScenario({ lastScenario: noRoom.key }, null, seeded(13)).key !== noRoom.key);

console.log('=== 掷骰与探索 ===');
let s = E.act(st0, { type: 'roll' }, 'a', seeded(11));
ok('A 掷速度成功', s.ok === true);
ok('拿到移动点', s.state.moves >= 0 && s.state.rolled === true);
s = E.act(s.state, { type: 'move', dir: 'N' }, 'a', seeded(12));
ok('从后门往北走 = 探索新房间', s.ok === true);
ok('新房间进去了', s.ok && s.state.players[0].y === 1);
ok('房间数 +1', s.state.rooms.length === 6);
ok('进新房后移动归零', s.state.moves === 0);
ok('新房间有牌可查', s.state.lastCard !== null);

const bad = E.act(s.state, { type: 'move', dir: 'S' }, 'a', seeded(13));
ok('移动点用完被拦下', bad.ok === false);

const noDoor = E.act(s.state, { type: 'move', dir: 'W' }, 'a', seeded(14));
ok('没有门的方向被拦下', noDoor.ok === false);

console.log('=== 回合推进 ===');
s = E.act(s.state, { type: 'end' }, 'a', seeded(15));
ok('换到 B', s.state.players[s.state.turn].id === 'b');
ok('新回合可以再掷', s.state.rolled === false);
const wrong = E.act(s.state, { type: 'roll' }, 'a', seeded(16));
ok('B 的回合 A 不能动', wrong.ok === false);

console.log('=== 闹鬼触发 ===');
const st1 = E.createInitial(players, seeded(21), { skipSelect: true });
st1.omens = 20;   // 6 颗骰最多 12 点，必然 < 20 → 必进闹鬼
st1.decks.ground = [{ name: '储藏室', doors: 'NS', symbol: 'omen' }];
st1.ptr.ground = 0;
let r = E.act(st1, { type: 'roll' }, 'a', seeded(22));
r = E.act(r.state, { type: 'move', dir: 'N' }, 'a', seeded(23));
ok('抽到预兆', r.ok && r.state.omens === 21);
ok('闹鬼开始', !!r.state.haunt && r.state.haunt.active === true);
ok('抽预兆的人成叛徒', r.state.haunt.traitor === 0);
ok('有剧本名', !!r.state.haunt.name && r.state.haunt.heroGoalText.length > 0);
ok('叛徒一定被标记在日志', r.state.logs.some((l) => l.indexOf('叛徒') >= 0));
ok('剧本字段齐全（页面要用）', ['name', 'story', 'heroGoalText', 'traitorGoalText', 'progress', 'traitor', 'heroGoal'].every((k) => k in r.state.haunt));
ok('英雄目标带类型', !!r.state.haunt.heroGoal.type);

console.log('=== 战斗 ===');
const st2 = JSON.parse(JSON.stringify(r.state));
st2.players[1].floor = st2.players[0].floor;
st2.players[1].x = st2.players[0].x;
st2.players[1].y = st2.players[0].y;
st2.turn = 1; st2.rolled = true; st2.moves = 2;
const atk = E.act(st2, { type: 'attack', target: 'a' }, 'b', seeded(31));
ok('同房间可以攻击', atk.ok === true);
ok('有人受伤或有人被挡', atk.state.logs.some((l) => l.indexOf('攻击') >= 0));
ok('攻击后属性不小于 0', atk.state.players.every((p) => E.TRAITS.every((t) => p.traits[t.key] >= 0)));

const far = E.act(r.state, { type: 'attack', target: 'c' }, 'a', seeded(33));
ok('不同房间不能打', far.ok === false);

console.log('=== 只让英雄做剧本判定 ===');
const st3 = JSON.parse(JSON.stringify(r.state));
st3.haunt.heroGoal = { type: 'ritual', room: '前厅', trait: 'known', diff: 3, need: 2 };
st3.turn = 0; st3.rolled = true; st3.moves = 3;
const tr = E.act(st3, { type: 'check' }, 'a', seeded(41));
ok('叛徒不能做仪式判定', tr.ok === false);
st3.turn = 1;
let hero = E.act(st3, { type: 'check' }, 'b', seeded(42));
ok('英雄在前厅可以做判定', hero.ok === true);
ok('判定计入进度', hero.state.haunt.progress >= 0);

console.log('=== 死亡判定 ===');
const st4 = JSON.parse(JSON.stringify(r.state));
st4.players[1].traits.might = 1;
st4.players[1].traits.speed = 1;
st4.players[0].traits.might = 9;
st4.players[1].floor = st4.players[0].floor; st4.players[1].x = st4.players[0].x; st4.players[1].y = st4.players[0].y;
st4.turn = 1; st4.rolled = true; st4.moves = 2;
const fight = E.act(st4, { type: 'attack', target: 'a' }, 'b', seeded(51));
ok('力量为 1 的一方扛不住', fight.state.players.some((p) => p.dead === true));
ok('有人倒下会写进日志', fight.state.logs.some((l) => l.indexOf('倒下') >= 0));

console.log('=== 楼梯 ===');
const st5 = E.createInitial(players, seeded(61), { skipSelect: true });
st5.turn = 0; st5.rolled = true; st5.moves = 3;
st5.players[0].x = 1; st5.players[0].y = 1;
const up = E.act(st5, { type: 'stair' }, 'a', seeded(62));
ok('站在大楼梯上可以上楼', up.ok === true && up.state.players[0].floor === 'upper');
const down = E.act(up.state, { type: 'stair' }, 'a', seeded(63));
ok('二层大楼梯还能下楼', down.ok === true && down.state.players[0].floor === 'ground');

console.log('=== 重开只有房主能点 ===');
const st6 = E.createInitial(players, seeded(71), { skipSelect: true });
st6.hostId = 'a';
const re = E.act(st6, { type: 'restart' }, 'b', seeded(72));
ok('非房主不能重开', re.ok === false);
const re2 = E.act(st6, { type: 'restart' }, 'a', seeded(73));
ok('房主可以重开（回到选角色）', re2.ok === true && re2.state.phase === 'select');

console.log('=== 撑过 N 轮 / 带东西到指定房间 ===');
const st7 = JSON.parse(JSON.stringify(r.state));
st7.haunt.heroGoal = { type: 'survive', need: 1 };
st7.haunt.round = 0;
st7.turn = st7.players.length - 1;
st7.rolled = true; st7.moves = 1;
const sv = E.act(st7, { type: 'end' }, st7.players[st7.turn].id, seeded(81));
ok('全队撑过轮数就获胜', sv.state.phase === 'ended' && sv.state.winner.side === 'heroes');

const st8 = JSON.parse(JSON.stringify(r.state));
st8.haunt.heroGoal = { type: 'escape', room: '酒窖', need: 2 };
st8.players[1].items = [{ name: '铁撬', bonus: 'might', tag: '' }, { name: '手电筒', bonus: 'known', tag: '' }];
st8.players[1].x = 3;
st8.players[1].y = 2;
st8.rooms.push({ floor: st8.players[1].floor, x: 3, y: 2, name: '酒窖', doors: 'NS', symbol: null, kind: 'normal' });
st8.turn = 1; st8.rolled = true; st8.moves = 0;
const esc = E.act(st8, { type: 'end' }, st8.players[1].id, seeded(82));
ok('带够东西到指定房间就获胜', esc.state.phase === 'ended' && esc.state.winner.side === 'heroes');

const st9 = JSON.parse(JSON.stringify(r.state));
st9.haunt.traitorGoal = { type: 'survive', need: 1 };
st9.haunt.round = 0;
st9.turn = st9.players.length - 1;
const tr9 = E.act(st9, { type: 'end' }, st9.players[st9.turn].id, seeded(83));
ok('叛徒撑过轮数也获胜', tr9.state.phase === 'ended' && tr9.state.winner.side === 'traitor');

console.log('\n' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail === 0 ? 0 : 1);


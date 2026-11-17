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
const st0 = E.createInitial(players, seeded(7));
ok('三人开局', st0.players.length === 3);
ok('每人有一套角色', st0.players.every((p) => p.charName && p.traits.might > 0));
ok('都在前厅', st0.players.every((p) => p.floor === 'ground' && p.x === 2 && p.y === 2));
ok('预置房间 5 间（前厅 + 两组楼梯）', st0.rooms.length === 5);
ok('三个骰池都有牌', st0.decks.events.length > 0 && st0.decks.items.length > 0 && st0.decks.omens.length > 0);
ok('先手是 A', st0.players[st0.turn].id === 'a');

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
const st1 = E.createInitial(players, seeded(21));
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
const st5 = E.createInitial(players, seeded(61));
st5.turn = 0; st5.rolled = true; st5.moves = 3;
st5.players[0].x = 1; st5.players[0].y = 1;
const up = E.act(st5, { type: 'stair' }, 'a', seeded(62));
ok('站在大楼梯上可以上楼', up.ok === true && up.state.players[0].floor === 'upper');
const down = E.act(up.state, { type: 'stair' }, 'a', seeded(63));
ok('二层大楼梯还能下楼', down.ok === true && down.state.players[0].floor === 'ground');

console.log('=== 重开只有房主能点 ===');
const st6 = E.createInitial(players, seeded(71));
st6.hostId = 'a';
const re = E.act(st6, { type: 'restart' }, 'b', seeded(72));
ok('非房主不能重开', re.ok === false);
const re2 = E.act(st6, { type: 'restart' }, 'a', seeded(73));
ok('房主可以重开', re2.ok === true && re2.state.phase === 'playing');

console.log('\n' + (fail === 0 ? '全部通过' : fail + ' 项失败'));
process.exit(fail === 0 ? 0 : 1);

// 50 个剧本真实引擎运行：开局、Setup、闹鬼、真实回合、真实剧本行动
// 目标是否达成不在这里直接构造；独立验收见 cabin-scenario-acceptance.test.js
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); }
}
function seeded(n) { let s = n || 1; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
function high() { return 0.99; }
const packsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8');
global.window = global;
eval(packsSrc);
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'));
const E = window.CabinEngine;

function scenario(no) { return E.SCENARIOS.find((x) => x.no === no); }
function makeState(no, n = 3) {
  const ids = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
  const st = E.createInitial(ids, seeded(no * 97 + n), { skipSelect: true });
  E.helpers.startHaunt(st, 0, '骨戒', '入口大厅', seeded(no * 31 + n), JSON.parse(JSON.stringify(scenario(no))));
  return st;
}
function firstRoom(st, floor) {
  return st.rooms.find((r) => r.floor === floor) || st.rooms.find((r) => r.floor === 'ground');
}

console.log('=== 50 剧本真实引擎运行 ===');
for (const sc of E.SCENARIOS) {
  const tag = '#' + sc.no + ' ' + sc.name;
  let st;
  try {
    st = makeState(sc.no, 3);
  } catch (e) {
    ok(tag + ' 开局不抛异常', false, e.message);
    continue;
  }
  ok(tag + ' 进入闹鬼', !!(st.haunt && st.haunt.active), st.phase);
  ok(tag + ' Setup 使用中文译本', !/[A-Za-z]{4,}/.test((sc.setup.heroText || '') + (sc.setup.traitorText || '')) && !!sc.setup.summary, sc.setup.summary);
  ok(tag + ' Setup 已执行', !!(st.haunt.setup && st.haunt.setup.summary), st.haunt.setup && st.haunt.setup.summary);
  ok(tag + ' 有玩家行动入口', st.players.length === 3 && st.phase === 'playing', st.phase);
  ok(tag + ' 英雄目标数据存在', !!st.haunt.heroGoal);
  ok(tag + ' 叛徒目标数据符合阵营', !!st.haunt.traitorGoal || st.haunt.traitorRule === 'noTraitor' || st.haunt.traitorRule === 'freeForAll');

  // 跑一个真实回合：当前玩家结束回合；若进入怪物阶段，跑完怪物阶段
  try {
    const r = E.act(st, { type: 'end' }, st.players[st.turn].id, high);
    ok(tag + ' 真实结束回合不抛异常', !!r, r && r.msg);
    if (st.monsterTurn) {
      const actor = st.monsterTurn.actor;
      const queue = (st.monsterTurn.queue || []).slice();
      queue.forEach((id) => E.act(st, { type: 'monsterSkip', monsterId: id }, actor, high));
      E.act(st, { type: 'monsterEnd' }, actor, high);
      ok(tag + ' 怪物阶段可结束', !st.monsterTurn, '怪物阶段仍在进行');
    }
  } catch (e) {
    ok(tag + ' 真实结束回合不抛异常', false, e.message);
  }

  // 真实跑一个剧本行动：按行动条件布置玩家/房间/标记/物品
  const actions = (st.haunt && st.haunt.actions) || [];
  const action = actions.find((a) => !a.side || a.side === 'traitor' || a.side === 'hero');
  if (action) {
    try {
      const side = action.side || 'hero';
      let actor = st.players.find((p) => !p.dead && p.side === side);
      if (!actor && side === 'traitor' && st.players[st.haunt.traitor]) actor = st.players[st.haunt.traitor];
      if (!actor && side === 'hero') actor = st.players.find((p) => !p.dead && p.side === 'hero');
      if (actor) {
        if (action.where === 'room') {
          let room = E.helpers.roomByName(st, action.room);
          if (!room) {
            room = { floor: 'ground', x: 2, y: 1, name: action.room, doors: 'NEW', symbol: null, kind: 'normal' };
            st.rooms.push(room);
          }
          actor.floor = room.floor; actor.x = room.x; actor.y = room.y;
        } else if (action.where === 'symbol') {
          const symbol = action.symbol || 'event';
          let room = st.rooms.find((r) => r.symbol === symbol);
          if (!room) {
            room = { floor: 'ground', x: 1, y: 1, name: '测试' + symbol + '房', doors: 'NEW', symbol, kind: 'normal' };
            st.rooms.push(room);
          }
          actor.floor = room.floor; actor.x = room.x; actor.y = room.y;
        } else if (action.where === 'floors' && action.floors && action.floors.length) {
          const room = firstRoom(st, action.floors[0]);
          if (room) { actor.floor = room.floor; actor.x = room.x; actor.y = room.y; }
        }
        if (action.requireToken) {
          const room = E.helpers.roomByName(st, action.room) || firstRoom(st, actor.floor);
          E.helpers.addToken(st, action.requireToken, room, 1);
        }
        if (action.requireItem) actor.items = (actor.items || []).concat([{ name: action.requireItem, key: action.requireItem }]);
        if (action.dead) actor.dead = true;
        st.haunt.turnUsed = {};
        st.turn = st.players.indexOf(actor);
        const r = E.act(st, { type: 'hauntAction', key: action.key }, actor.id, high);
        ok(tag + ' 真实剧本行动可执行', !!r && r.ok === true, r && r.msg);
      }
    } catch (e) {
      ok(tag + ' 真实剧本行动可执行', false, e.message);
    }
  }
}

console.log('---');
console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.join('\n'));
process.exitCode = failed ? 1 : 0;

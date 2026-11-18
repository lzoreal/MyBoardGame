// 50 个剧本真实引擎运行：开局、Setup、闹鬼、一次实际行动、英雄/叛徒目标分别结算
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
function forceGoal(st, g) {
  if (!g) return;
  const h = st.haunt;
  if (g.type === 'anyOf') { forceGoal(st, g.goals[0]); return; }
  if (g.type === 'allOf') { g.goals.forEach((x) => forceGoal(st, x)); return; }
  if (g.type === 'killAll') {
    st.players.forEach((p) => { if (p.side === 'hero') p.dead = true; });
    return;
  }
  if (g.type === 'killTraitor') {
    const tr = st.players[h.traitor];
    if (tr) tr.dead = true;
    else h.sideCounts = Object.assign({}, h.sideCounts, { traitor: 0 });
    return;
  }
  if (g.type === 'possessItem') {
    const holder = (h.pvp && st.players.filter((p) => !p.dead && p.side === 'hero').length === 1)
      ? st.players.find((p) => !p.dead && p.side === 'hero')
      : st.players[h.traitor];
    if (holder) holder.items = (holder.items || []).concat([{ name: g.item, key: g.item }]);
    return;
  }
  if (g.type === 'convertAll') {
    st.players.forEach((p) => { if (!p.dead) p.side = 'traitor'; });
    return;
  }
  if (g.type === 'tokens') {
    if (g.perHero && g.token === 'DNA') {
      h.dnaCollected = {};
      st.players.filter((p) => p.side === 'hero').forEach((p) => { h.dnaCollected[p.id] = true; });
      return;
    }
    const need = g.perHero ? st.players.filter((p) => !p.dead && p.side === 'hero').length : (g.need || 1);
    const room = firstRoom(st, 'ground');
    E.helpers.addToken(st, g.token, room, need);
    return;
  }
  if (g.type === 'evidence') { h.evidence = g.need || 1; return; }
  if (g.type === 'treasure') { h.treasure = g.need || 1; return; }
  if (g.type === 'hunt') { h.monsterBanish = g.need || 1; return; }
  if (g.type === 'ritual') { h.progress = g.need || 1; return; }
  if (g.type === 'escape') {
    let room = E.helpers.roomByName(st, g.room || '入口大厅');
    if (!room) {
      room = { floor: 'ground', x: 2, y: 2, name: g.room || '入口大厅', doors: 'NEW', symbol: null, kind: 'normal' };
      st.rooms.push(room);
    }
    const hero = st.players.find((p) => !p.dead && p.side === 'hero');
    if (hero) {
      hero.floor = room.floor; hero.x = room.x; hero.y = room.y;
      const need = g.need || 0;
      while ((hero.items || []).filter((it) => !it.omen).length < need) hero.items = (hero.items || []).concat([{ name: '临时物品' }]);
    }
    return;
  }
  if (g.type === 'placeTokens' && g.pairs) {
    g.pairs.forEach((it) => E.helpers.addToken(st, it.token, E.helpers.roomByName(st, it.room) || firstRoom(st, 'ground'), g.need || 1));
    return;
  }
  if (g.type === 'rig') {
    E.FLOORS.forEach((f) => E.helpers.addToken(st, g.token, firstRoom(st, f), 1));
    if ((g.need || 0) > E.FLOORS.length) E.helpers.addToken(st, g.token, firstRoom(st, 'ground'), (g.need || 0) - E.FLOORS.length);
    return;
  }
  if (g.type === 'trackZero') {
    if (g.track === 'number') h.numberTrack = 0;
    else {
      const hero = st.players.find((p) => !p.dead && p.side === 'hero');
      if (hero && hero.track[g.track]) hero.track[g.track].pos = 0;
    }
    return;
  }
  if (g.type === 'destroyItem') { h.destroyedItems = (h.destroyedItems || []).concat([g.item]); return; }
  if (g.type === 'survive') { h.round = Math.max(h.round || 0, g.need || 1); return; }
  if (g.type === 'custom') {
    if (g.key === 'wake_sleeping_one' || g.key === 'time_runs_out') h.numberTrack = 0;
    else if (g.key === 'enlightenment') {
      const tr = st.players[h.traitor];
      if (tr && tr.track.sanity) tr.track.sanity.pos = tr.track.sanity.list.length - 1;
    } else if (g.key === 'devour_the_house') {
      h.devouredFloors = { upper: true, ground: true, basement: true };
    } else if (g.key === 'spread_alien_words') {
      h.wordSupply = 5; h.wordsPlaced = 5;
    } else if (g.key === 'burn_the_house') {
      h.burnedFloors = { upper: true, ground: true, basement: true };
    } else if (g.key === 'bring_blood_person_blood') {
      h.bloodHeroes = 1; h.bloodOffered = 1;
    } else {
      h.custom = h.custom || {}; h.custom[g.key] = true;
    }
    return;
  }
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
  ok(tag + ' Setup 已执行', !!(st.haunt.setup && st.haunt.setup.summary), st.haunt.setup && st.haunt.summary);
  ok(tag + ' 有玩家行动入口', st.players.length === 3 && st.phase === 'playing', st.phase);

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

  // 英雄目标（自由混战使用 ffaGoal）
  const hst = makeState(sc.no, 3);
  try {
    if (hst.haunt.pvp) {
      const last = hst.players.find((p) => p.side === 'hero') || hst.players[0];
      hst.players.forEach((p) => { if (p !== last) p.dead = true; });
    }
    const goal = hst.haunt.pvp ? hst.haunt.ffaGoal : hst.haunt.heroGoal;
    if (goal) forceGoal(hst, goal);
    E.helpers.checkWin(hst);
    ok(tag + ' 英雄/混战目标可结算', hst.phase === 'ended' && hst.winner && hst.winner.side !== 'traitor', hst.winner && hst.winner.text);
  } catch (e) {
    ok(tag + ' 英雄/混战目标可结算', false, e.message);
  }

  // 叛徒目标
  if (sc.traitorGoal) {
    const tst = makeState(sc.no, 3);
    try {
      forceGoal(tst, tst.haunt.traitorGoal);
      E.helpers.checkWin(tst);
      ok(tag + ' 叛徒目标可结算', tst.phase === 'ended' && tst.winner && tst.winner.side === 'traitor', tst.winner && tst.winner.text);
    } catch (e) {
      ok(tag + ' 叛徒目标可结算', false, e.message);
    }
  }
}

console.log('---');
console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.join('\n'));
process.exitCode = failed ? 1 : 0;

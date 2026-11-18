// 私有联机安全与 P0 规则回归
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); }
}
function seeded(n) {
  let s = n || 1;
  return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

const root = path.join(__dirname, '..');
const packsSrc = fs.readFileSync(path.join(root, 'js', 'games', 'cabin-packs.js'), 'utf8');
global.window = global;
eval(packsSrc);
eval(fs.readFileSync(path.join(root, 'js', 'games', 'cabin.js'), 'utf8'));
const E = window.CabinEngine;

const sql = fs.readFileSync(path.join(root, 'sql', 'rooms-private.sql'), 'utf8');
const net = fs.readFileSync(path.join(root, 'js', 'net.js'), 'utf8');

console.log('=== 私有联机 SQL ===');
ok('加入房间不会覆盖已有 token', !/on conflict\s*\(\s*code\s*,\s*pid\s*\)\s*do update[\s\S]{0,160}token_hash\s*=\s*excluded\.token_hash/i.test(sql));
ok('join 会校验原 token 并拒绝接管', /这个玩家身份已被占用/.test(sql));
ok('join 在数据库事务里写成员与玩家席位', /perform pg_advisory_xact_lock/.test(sql) && /v_players \|\| jsonb_build_array/.test(sql));
ok('客户端 secret 写函数已移除', /drop function if exists public\.cabin_set_secret/.test(sql));
ok('Cabin 房间状态只能走受控 RPC', /create or replace function public\.cabin_push_state/.test(sql));
ok('服务端按 state.turn 判断当前行动者', /v_turn_idx := coalesce\(\(v_old\.state->>'turn'\)::int, 0\)/.test(sql) && /array\['players', v_turn_idx::text, 'id'\]/.test(sql));
ok('大厅阶段不允许成员绕过 start 直接写 playing', /phase', ''\) = 'lobby' and p_action <> 'start'/.test(sql));
ok('非 Cabin 房间保留旧直写策略', /rooms_legacy_write/.test(sql));
ok('揭露隐藏身份时会从 secrets 重建阵营', /从 secrets 重建阵营/.test(sql) && /coalesce\(secret, '\{\}'::jsonb\) into v_sec/.test(sql));
ok('公开状态只下发阵营聚合人数', /sideCounts/.test(sql));
ok('net.js 不再直接 UPDATE rooms', /sb\.rpc\('cabin_push_state'/.test(net));

console.log('=== #12 自由混战：护符 + 最后存活 ===');
const st12 = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(1201), { skipSelect: true });
st12.players.forEach((p) => { p.side = 'hero'; });
const sc12 = E.SCENARIOS.find((x) => x.key === 'official_3e_12');
E.helpers.startHaunt(st12, 0, '房子饿了', '入口大厅', seeded(1202), JSON.parse(JSON.stringify(sc12)));
st12.players[1].dead = true;
st12.players[2].dead = true;
st12.players[0].items = [];
E.helpers.checkWin(st12);
ok('最后一人没有奇怪护符时不判胜', st12.phase !== 'ended');
const amulet = E.ITEMS.find((x) => x.name === '奇怪护符') || { name: '奇怪护符' };
E.helpers.grantItem(st12, 0, amulet);
E.helpers.checkWin(st12);
ok('持护符的最后一人获胜', st12.phase === 'ended' && /混战/.test(st12.winner.text || ''), st12.winner && st12.winner.text);
const st12b = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(1203), { skipSelect: true });
st12b.players.forEach((p) => { p.side = 'hero'; p.dead = true; });
E.helpers.startHaunt(st12b, 0, '房子饿了', '入口大厅', seeded(1204), JSON.parse(JSON.stringify(sc12)));
E.helpers.checkWin(st12b);
ok('全员倒下不会判英雄获胜', st12b.phase === 'ended' && st12b.winner.side === 'none', st12b.winner && st12b.winner.side);

console.log('=== 隐藏叛徒：聚合人数参与胜负 ===');
const st2 = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(201), { skipSelect: true });
const sc2 = E.SCENARIOS.find((x) => x.key === 'official_3e_2');
E.helpers.startHaunt(st2, 0, '骨戒', '入口大厅', seeded(202), JSON.parse(JSON.stringify(sc2)));
st2.haunt.sideCounts = { hero: 0, traitor: 1 };
st2.players[0].side = 'traitor';
st2.players[0].dead = false;
st2.players[1].dead = true;
st2.players[2].dead = true;
E.helpers.checkWin(st2);
ok('公开 sideCounts=0 时叛徒判胜', st2.phase === 'ended' && st2.winner.side === 'traitor', st2.winner && st2.winner.side);

console.log('=== 移动点不足时不能移动 ===');
const stm = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(301), { skipSelect: true });
stm.haunt = { active: true, pvp: false };
stm.players.forEach((p) => { p.side = 'hero'; });
stm.moves = 1;
const here = stm.rooms.find((r) => r.kind === 'start') || stm.rooms[0];
let dir = null, target = null;
for (const d of ['N', 'S', 'E', 'W']) {
  const delta = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[d];
  const r = E.helpers.roomAt(stm, here.floor, here.x + delta[0], here.y + delta[1]);
  if (r) { dir = d; target = r; break; }
}
stm.players[0].floor = here.floor; stm.players[0].x = here.x; stm.players[0].y = here.y;
stm.players[1].floor = here.floor; stm.players[1].x = here.x; stm.players[1].y = here.y;
const blocked = dir ? E.act(stm, { type: 'move', dir: dir }, 'a', seeded(302)) : { ok: false, msg: '没有相邻房间' };
ok('需要 2 点但只剩 1 点时拒绝移动', blocked.ok === false && /移动点不够/.test(blocked.msg || ''), blocked.msg);

console.log('=== 剧本行动：整局一次是全桌共享 ===');
const st45 = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(451), { skipSelect: true });
const sc45 = E.SCENARIOS.find((x) => x.key === 'official_3e_45');
E.helpers.startHaunt(st45, 0, '骨戒', '入口大厅', seeded(452), JSON.parse(JSON.stringify(sc45)));
st45.turn = 0;
st45.players[0].side = 'hero';
const cutA = E.act(st45, { type: 'hauntAction', key: 'cut' }, 'a', () => 0.99);
ok('A 第一次使用 Cut 成功', cutA.ok, cutA.msg);
st45.turn = 1;
st45.players[1].side = 'hero';
const cutB = E.act(st45, { type: 'hauntAction', key: 'cut' }, 'b', () => 0.99);
ok('B 不能重复使用整局一次行动', cutB.ok === false && /整局/.test(cutB.msg || ''), cutB.msg);

console.log('=== 天使羽毛：待判定时可用 ===');
const stF = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(501), { skipSelect: true });
stF.players.forEach((p) => { p.side = 'hero'; });
stF.turn = 0;
const feather = E.ITEMS.find((x) => x.name === '天使羽毛');
ok('物品牌里有天使羽毛', !!feather, E.ITEMS.filter((x) => /羽毛/.test(x.name)).map((x) => x.name).join(','));
if (feather) {
  stF.players[0].items = [JSON.parse(JSON.stringify(feather))];
  stF.pendingRoll = { kind: 'event', index: 0, trait: 'speed', diff: 4, await: true };
  const use = E.act(stF, { type: 'useItem', index: 0, value: 6 }, 'a', seeded(502));
  ok('pendingRoll 状态允许使用天使羽毛', use.ok && stF.pendingRoll && stF.pendingRoll.forced === 6, use.msg);
}

console.log('---');
if (failed) {
  console.log('FAILED ' + failed + ': ' + fails.join('; '));
  process.exit(1);
}
console.log('PASS ' + passed);

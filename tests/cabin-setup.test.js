// 50 个官方剧本的 Setup 执行器回归：3/4/5/6 人局都要实际跑一遍
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); }
}
function seeded(n) {
  let s = n || 1;
  return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}
const packsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8');
global.window = global;
eval(packsSrc);
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'));
const E = window.CabinEngine;

function players(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ id: 's' + (i + 1), name: 'P' + (i + 1) });
  return out;
}
function byPlayers(obj, n, fallback) {
  if (obj === undefined || obj === null) return fallback;
  if (typeof obj === 'number') return obj;
  return obj[String(n)] === undefined ? fallback : obj[String(n)];
}
function monsterCount(op, n) {
  if (op.perHero) return n * (op.perHeroCount || 1);
  return byPlayers(op.countByPlayers, n, op.count === undefined ? 1 : op.count);
}

ok('50 个剧本全部是 scripted Setup', E.SCENARIOS.length === 50 && E.SCENARIOS.every((s) => s.setup && s.setup.mode === 'scripted'));
ok('每个 scripted Setup 都有 ops', E.SCENARIOS.every((s) => Array.isArray(s.setup.ops) && s.setup.ops.length > 0));

for (const n of [3, 4, 5, 6]) {
  for (const sc of E.SCENARIOS) {
    const tag = '#' + sc.no + '/' + n + 'p';
    let st;
    try {
      st = E.createInitial(players(n), seeded(sc.no * 97 + n), { skipSelect: true });
      E.helpers.startHaunt(st, 0, '骨戒', '入口大厅', seeded(sc.no * 13 + n), sc);
    } catch (e) {
      ok(tag + ' 不抛异常', false, e.message);
      continue;
    }
    const h = st.haunt;
    ok(tag + ' setup 已执行', h && h.setup && h.setup.mode === 'scripted');
    if (!h || !h.setup) continue;
    if (sc.setup.numberTrackByPlayers) ok(tag + ' 数字轨道按人数', h.numberTrack === sc.setup.numberTrackByPlayers[String(n)], h.numberTrack);
    if (sc.setup.numberTrack !== undefined) ok(tag + ' 数字轨道固定值', h.numberTrack === sc.setup.numberTrack, h.numberTrack);

    for (const op of sc.setup.ops) {
      if (op.type === 'placeMonster') {
        const def = typeof op.monster === 'object' ? op.monster : ((sc.monsters || []).find((m) => m.key === op.monster || m.name === op.monster) || sc.monster);
        const key = def && (def.key || def.name);
        const have = st.monsters.filter((m) => (m.key || m.name) === key).length;
        const want = monsterCount(op, n);
        ok(tag + ' 怪物 ' + (key || '?') + ' ×' + want, have >= want, 'have=' + have);
      } else if (op.type === 'placeMonsterPerHero') {
        const def = typeof op.monster === 'object' ? op.monster : sc.monster;
        const key = def && (def.key || def.name);
        const have = st.monsters.filter((m) => (m.key || m.name) === key).length;
        ok(tag + ' 每个英雄一只 ' + (key || '?'), have >= n, 'have=' + have);
      } else if (op.type === 'placeToken' || op.type === 'placeTokenPerHero') {
        const want = op.type === 'placeTokenPerHero'
          ? n * (op.perHeroCount || 1)
          : byPlayers(op.countByPlayers, n, op.count || 1);
        const placed = E.helpers.countTokens(st, op.token);
        const pending = (h.setup.pendingTokens && h.setup.pendingTokens[op.token]) || 0;
        ok(tag + ' 标记 ' + op.token + ' ×' + want, placed + pending >= want, 'placed=' + placed + ',pending=' + pending);
      } else if (op.type === 'placeSpecialRoom') {
        ok(tag + ' 特殊房间 ' + op.room, !!E.helpers.roomByName(st, op.room));
      } else if (op.type === 'ensureSymbolTiles') {
        const want = byPlayers(op.countByPlayers, n, op.count || 3);
        const have = st.rooms.filter((r) => r.symbol === op.symbol).length;
        ok(tag + ' 补足 ' + op.symbol + ' 板块 ×' + want, have >= want, 'have=' + have);
      } else if (op.type === 'ensureTiles') {
        const want = byPlayers(op.countByPlayers, n, op.count || 3);
        const have = st.rooms.filter((r) => r.kind !== 'landing' && r.kind !== 'start' && !r.symbol).length;
        ok(tag + ' 补足普通板块 ×' + want, have >= want, 'have=' + have);
      } else if (op.type === 'movePlayers') {
        const room = E.helpers.roomByName(st, op.room);
        const list = op.who === 'traitor' ? [h.traitor] : (op.who === 'revealer' ? [h.revealer] : st.players.map((p, i) => i));
        ok(tag + ' 移动 ' + (op.who || 'all') + ' 到 ' + op.room, !!room && list.every((i) => st.players[i] && st.players[i].floor === room.floor && st.players[i].x === room.x && st.players[i].y === room.y));
      } else if (op.type === 'flipRoom') {
        const idx = op.who === 'traitor' ? h.traitor : h.revealer;
        const room = st.rooms.find((r) => {
          const p = st.players[idx];
          return p && r.floor === p.floor && r.x === p.x && r.y === p.y;
        });
        ok(tag + ' 翻面 ' + (op.who || 'revealer') + ' 板块', !!room && !!room.flipped);
      } else if (op.type === 'assignNumbers') {
        const vals = st.players.map((p) => h.setup.numberTokens[p.id]);
        ok(tag + ' 每人一个数字标记', vals.every((v) => v >= 1 && v <= n), vals.join(','));
        ok(tag + ' 恰有一个 1 号', vals.filter((v) => v === 1).length === 1, vals.join(','));
      } else if (op.type === 'assignDisease') {
        ok(tag + ' 每人 3 个疾病标记', st.players.every((p) => p.disease === 3));
        const ones = n >= 6 ? 2 : 1;
        ok(tag + ' 疾病 1 号数量 ' + ones, (h.setup.diseaseOneIds || []).length === ones, JSON.stringify(h.setup.diseaseOneIds));
      } else if (op.type === 'assignDNA') {
        ok(tag + ' 每名英雄一份 DNA', st.players.every((p) => !!p.dna));
      } else if (op.type === 'assignBlood') {
        ok(tag + ' 每名英雄一个血标记', st.players.filter((p) => p.side === 'hero').every((p) => !!p.blood));
      } else if (op.type === 'trapHeroes') {
        ok(tag + ' 英雄被困标记', st.players.filter((p) => p.side === 'hero').every((p) => !!p.trapped));
      } else if (op.type === 'custom') {
        ok(tag + ' custom ' + op.key, h.setup.flags[op.key] !== undefined);
      }
    }
    if (sc.no === 5) {
      const have = st.monsters.filter((m) => m.key === 'cherub').length;
      ok(tag + ' 石像小天使总数 ' + (n * 2), have === n * 2, 'have=' + have);
    }
    if (sc.no === 37) {
      const have = st.monsters.filter((m) => m.key === 'security').length;
      ok(tag + ' 安全机器人总数 ' + (n + 1), have === n + 1, 'have=' + have);
    }
  }
}

console.log('---');

// 待放标记：新板块接入地图时会自动补放
{
  const sc = E.SCENARIOS.find((x) => x.no === 19);
  const st = E.createInitial(players(4), seeded(1901), { skipSelect: true });
  E.helpers.startHaunt(st, 0, '骨戒', '入口大厅', seeded(1902), JSON.parse(JSON.stringify(sc)));
  const pending = st.haunt.setup.pendingTokens['录像带'] || 0;
  ok('#19 Setup 把未翻出的录像带标记记为待放', pending > 0, 'pending=' + pending);
  const before = E.helpers.countTokens(st, '录像带');
  E.helpers.attachSetupPendingTokens(st, { name: '测试房', floor: 'basement', x: 0, y: 0, kind: 'normal' });
  ok('#19 新板块接入后自动补放一枚录像带',
    E.helpers.countTokens(st, '录像带') === before + 1 && (st.haunt.setup.pendingTokens['录像带'] || 0) === pending - 1,
    'before=' + before + ',after=' + E.helpers.countTokens(st, '录像带'));
}

console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.slice(0, 40).join('\n'));
process.exitCode = failed ? 1 : 0;

/* ============================================================
   卡卡颂（Carcassonne）基础版规则引擎
   ------------------------------------------------------------
   板块：72 张（含 1 张起始板块），19 种版式
   边缘：N/E/S/W 四边，C=城市 R=道路 F=农田
   回合：抽板块 → 旋转拼放 → 可选放米宝 → 结算完成的地物 → 下一位
   计分：
     · 完成城市：每块 2 分，每个盾徽 +2
     · 完成道路：每块 1 分
     · 完成修道院：9 分
     · 终局未完成：城市每块 1 分（盾 +1）、道路每块 1 分、修道院 1+相邻板块数
     · 农田：终局每座相邻的完成城市 3 分
   米宝：每位玩家 7 个，城市/道路/修道院结算后收回，农夫留到终局
   ============================================================ */

window.CarcassonneEngine = (function () {
  const DIRS = ['n', 'e', 's', 'w'];
  const DX = [0, 1, 0, -1];
  const DY = [-1, 0, 1, 0];

  const TYPES = [
    /* 0 */ { key: 'cross4', edges: 'RRRR', city: [], road: [[0], [1], [2], [3]] },
    /* 1 */ { key: 'city3r', edges: 'CCCR', city: [[0, 1, 2]], road: [[3]], shield: 1 },
    /* 2 */ { key: 'city2road2', edges: 'CCRR', city: [[0, 1]], road: [[2, 3]] },
    /* 3 */ { key: 'city1r3', edges: 'CRRR', city: [[0]], road: [[1], [2], [3]] },
    /* 4 */ { key: 'city1road', edges: 'CRFR', city: [[0]], road: [[1, 3]] },
    /* 5 */ { key: 'city1curve', edges: 'CRRF', city: [[0]], road: [[1, 2]] },
    /* 6 */ { key: 'allcity', edges: 'CCCC', city: [[0, 1, 2, 3]], shield: 1 },
    /* 7 */ { key: 'city1', edges: 'CFFF', city: [[0]] },
    /* 8 */ { key: 'city2sep', edges: 'CCFF', city: [[0], [1]] },
    /* 9 */ { key: 'city2join', edges: 'CCFF', city: [[0, 1]] },
    /* 10 */ { key: 'city2opp', edges: 'CFCF', city: [[0], [2]] },
    /* 11 */ { key: 'city2oppjoin', edges: 'CFCF', city: [[0, 2]] },
    /* 12 */ { key: 'city3', edges: 'CCCF', city: [[0, 1, 2]], shield: 1 },
    /* 13 */ { key: 'monastery', edges: 'FFFF', city: [], road: [], mon: true },
    /* 14 */ { key: 'monastery3r', edges: 'RRRF', city: [], road: [[0], [1], [2]], mon: true },
    /* 15 */ { key: 'roadStraight', edges: 'RFRF', city: [], road: [[0, 2]] },
    /* 16 */ { key: 'roadCurve', edges: 'RRFF', city: [], road: [[0, 1]] },
    /* 17 */ { key: 'monastery1r', edges: 'RFFF', city: [], road: [[0]], mon: true },
    /* 18 */ { key: 'start', edges: 'CFRF', city: [[0]], road: [[2]], start: true }
  ];

  // 官方 72 张的构成（含起始板块）
  const COUNTS = [1, 3, 5, 3, 5, 4, 1, 5, 2, 5, 3, 3, 4, 4, 4, 9, 8, 2, 1];
  const MEEPLE_PER_PLAYER = 7;
  const COLORS = ['#e2564a', '#3f7fe0', '#f0b429', '#2f9e63', '#8b5cf6'];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function rotateDir(d, r) { return (d + r) % 4; }
  function edgeAt(type, dir, r) {
    return type.edges[(dir - r + 4) % 4];
  }
  function rotatedSegs(list, r) {
    return (list || []).map((seg) => seg.map((d) => rotateDir(d, r)));
  }

  /** 某个已放置板块的四边与各类地物（已按旋转换算） */
  function featuresOf(tile) {
    const type = TYPES[tile.t];
    return {
      edges: [0, 1, 2, 3].map((d) => edgeAt(type, d, tile.r)),
      city: rotatedSegs(type.city, tile.r),
      road: rotatedSegs(type.road, tile.r),
      mon: !!type.mon,
      shield: type.shield || 0,
      start: !!type.start
    };
  }

  function key(x, y) { return x + ',' + y; }
  function inst(x, y, kind, i) { return x + ',' + y + ':' + kind + (i == null ? '' : i); }

  /** 返回所有地物的 union-find 分组 */
  function groups(state) {
    const parent = {};
    const find = (a) => {
      if (parent[a] == null) parent[a] = a;
      while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
      return a;
    };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    const cells = state.board;

    Object.keys(cells).forEach((k) => {
      const tile = cells[k];
      const f = featuresOf(tile);
      f.city.forEach((_, i) => find(inst(tile.x, tile.y, 'C', i)));
      f.road.forEach((_, i) => find(inst(tile.x, tile.y, 'R', i)));
      if (f.mon) find(inst(tile.x, tile.y, 'M'));
      find(inst(tile.x, tile.y, 'F'));
    });

    Object.keys(cells).forEach((k) => {
      const tile = cells[k];
      const f = featuresOf(tile);
      for (let d = 0; d < 4; d++) {
        const nx = tile.x + DX[d], ny = tile.y + DY[d];
        const nb = cells[key(nx, ny)];
        if (!nb) continue;
        const nf = featuresOf(nb);
        const od = (d + 2) % 4;
        const code = f.edges[d];
        if (code !== nf.edges[od]) continue;
        if (code === 'C') {
          const i = f.city.findIndex((s) => s.indexOf(d) >= 0);
          const j = nf.city.findIndex((s) => s.indexOf(od) >= 0);
          if (i >= 0 && j >= 0) union(inst(tile.x, tile.y, 'C', i), inst(nx, ny, 'C', j));
        } else if (code === 'R') {
          const i = f.road.findIndex((s) => s.indexOf(d) >= 0);
          const j = nf.road.findIndex((s) => s.indexOf(od) >= 0);
          if (i >= 0 && j >= 0) union(inst(tile.x, tile.y, 'R', i), inst(nx, ny, 'R', j));
        } else if (code === 'F') {
          union(inst(tile.x, tile.y, 'F'), inst(nx, ny, 'F'));
        }
      }
    });

    const out = {};
    Object.keys(cells).forEach((k) => {
      const tile = cells[k];
      const f = featuresOf(tile);
      f.city.forEach((seg, i) => {
        const g = find(inst(tile.x, tile.y, 'C', i));
        if (!out[g]) out[g] = { kind: 'city', m: [], tiles: {}, edges: [], shields: 0 };
        out[g].m.push({ x: tile.x, y: tile.y, i: i });
        out[g].tiles[key(tile.x, tile.y)] = 1;
        out[g].shields += f.shield;
        seg.forEach((d) => out[g].edges.push({ x: tile.x, y: tile.y, d: d }));
      });
      f.road.forEach((seg, i) => {
        const g = find(inst(tile.x, tile.y, 'R', i));
        if (!out[g]) out[g] = { kind: 'road', m: [], tiles: {}, edges: [] };
        out[g].m.push({ x: tile.x, y: tile.y, i: i });
        out[g].tiles[key(tile.x, tile.y)] = 1;
        seg.forEach((d) => out[g].edges.push({ x: tile.x, y: tile.y, d: d }));
      });
      if (f.mon) {
        const g = find(inst(tile.x, tile.y, 'M'));
        if (!out[g]) out[g] = { kind: 'mon', m: [], tiles: {}, edges: [] };
        out[g].m.push({ x: tile.x, y: tile.y, i: 0 });
        out[g].tiles[key(tile.x, tile.y)] = 1;
      }
      const g = find(inst(tile.x, tile.y, 'F'));
      if (!out[g]) out[g] = { kind: 'field', m: [], tiles: {}, edges: [], cities: [] };
      out[g].m.push({ x: tile.x, y: tile.y, i: 0 });
      out[g].tiles[key(tile.x, tile.y)] = 1;
      f.city.forEach((seg, i) => out[g].cities.push(inst(tile.x, tile.y, 'C', i)));
    });
    Object.keys(out).forEach((g) => {
      out[g].complete = isComplete(state, out[g]);
      out[g].meepleUsers = meepleUsers(state, out[g]);
      out[g].pts = featurePoints(state, out[g]);
    });
    return out;
  }

  function isComplete(state, g) {
    if (g.kind === 'city' || g.kind === 'road') {
      return g.edges.every((e) => !!state.board[key(e.x + DX[e.d], e.y + DY[e.d])]);
    }
    if (g.kind === 'mon') {
      const m = g.m[0];
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          if (!state.board[key(m.x + dx, m.y + dy)]) return false;
        }
      }
      return true;
    }
    return false;
  }

  /** 农田：统计相邻的已完成城市（同一座城只算一次） */
  function farmCities(state, g, all) {
    if (g.kind !== 'field') return [];
    const idx = {};
    Object.keys(all).forEach((k) => {
      if (all[k].kind !== 'city') return;
      all[k].m.forEach((m) => { idx[inst(m.x, m.y, 'C', m.i)] = k; });
    });
    const seen = {};
    g.cities.forEach((c) => {
      const k = idx[c];
      if (k && all[k].complete) seen[k] = 1;
    });
    return Object.keys(seen);
  }

  function featurePoints(state, g) {
    if (g.kind === 'city') {
      const n = Object.keys(g.tiles).length;
      return g.complete ? (2 * n + 2 * g.shields) : (n + g.shields);
    }
    if (g.kind === 'road') return Object.keys(g.tiles).length;
    if (g.kind === 'mon') {
      const m = g.m[0];
      if (g.complete) return 9;
      let n = 1;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        if (state.board[key(m.x + dx, m.y + dy)]) n++;
      }
      return n;
    }
    return 0;
  }

  function meepleUsers(state, g) {
    return collectGroupMeeples(state, g).owners;
  }

  /** 收集某地物上的米宝：owners 为各家数量，tiles 用于回收 */
  function collectGroupMeeples(state, g) {
    const owners = {};
    const tiles = [];
    g.m.forEach((m) => {
      const tile = state.board[key(m.x, m.y)];
      if (!tile || !tile.meeple) return;
      if (tile.meeple.k !== g.kind) return;
      if (g.kind !== 'field' && tile.meeple.i !== m.i) return;
      owners[tile.meeple.p] = (owners[tile.meeple.p] || 0) + 1;
      tiles.push(tile);
    });
    return { owners: owners, tiles: tiles };
  }

  function pushLog(state, text) {
    state.logs = state.logs || [];
    state.logs.push(text);
    if (state.logs.length > 60) state.logs.shift();
  }

  function drawOne(state, rng) {
    if (!state.deck.length) return null;
    return state.deck.pop();
  }

  function createInitial(players, rng) {
    const deck = [];
    COUNTS.forEach((n, t) => { for (let i = 0; i < n; i++) deck.push(t); });
    // 起始板块不进牌堆
    const startIdx = 18;
    const di = deck.indexOf(startIdx);
    if (di >= 0) deck.splice(di, 1);
    shuffle(deck, rng);

    const ps = players.map((p, i) => ({
      id: p.id, name: p.name, color: COLORS[i % COLORS.length],
      score: 0, meeples: MEEPLE_PER_PLAYER
    }));

    const state = {
      players: ps,
      board: {},
      deck: deck,
      cur: null,
      turn: 0,
      phase: 'playing',
      step: 'place',
      last: null,
      logs: ['开局：起始板块已放在中央，从牌堆抽板块开始拼'],
      winner: null,
      hostId: ps.length ? ps[0].id : null
    };
    state.board[key(0, 0)] = { x: 0, y: 0, t: startIdx, r: 0, meeple: null };
    state.cur = drawOne(state, rng);
    ensurePlayable(state, rng);
    return state;
  }

  function neighborOk(state, x, y, r, t) {
    const type = TYPES[t];
    for (let d = 0; d < 4; d++) {
      const nb = state.board[key(x + DX[d], y + DY[d])];
      if (!nb) continue;
      const nf = featuresOf(nb);
      if (edgeAt(type, d, r) !== nf.edges[(d + 2) % 4]) return false;
    }
    return true;
  }

  function hasNeighbor(state, x, y) {
    for (let d = 0; d < 4; d++) {
      if (state.board[key(x + DX[d], y + DY[d])]) return true;
    }
    return false;
  }

  /** 所有可落子的空格与合法旋转（UI 用来画候选格） */
  function placements(state) {
    if (!state || state.phase !== 'playing' || state.step !== 'place' || state.cur == null) return [];
    const out = [];
    const seen = {};
    Object.keys(state.board).forEach((k) => {
      const tile = state.board[k];
      for (let d = 0; d < 4; d++) {
        const x = tile.x + DX[d], y = tile.y + DY[d];
        const ck = key(x, y);
        if (seen[ck] || state.board[ck]) continue;
        seen[ck] = 1;
        const rots = [];
        for (let r = 0; r < 4; r++) if (neighborOk(state, x, y, r, state.cur)) rots.push(r);
        if (rots.length) out.push({ x: x, y: y, rots: rots });
      }
    });
    return out;
  }

  /** 新板块上可供放米宝的地物 */
  function meepleOptions(state, x, y) {
    const tile = state.board[key(x, y)];
    if (!tile) return [];
    const f = featuresOf(tile);
    const all = groups(state);
    const blocked = (kind, i) => {
      const gk = Object.keys(all).find((k) => all[k].kind === kind &&
        all[k].m.some((m) => m.x === x && m.y === y && m.i === (kind === 'field' || kind === 'mon' ? 0 : i)));
      return gk ? Object.keys(collectGroupMeeples(state, all[gk]).owners).length > 0 : false;
    };
    const out = [];
    f.city.forEach((seg, i) => out.push({ k: 'city', i: i, label: '城市', blocked: blocked('city', i) }));
    f.road.forEach((seg, i) => out.push({ k: 'road', i: i, label: '道路', blocked: blocked('road', i) }));
    if (f.mon) out.push({ k: 'mon', i: 0, label: '修道院', blocked: blocked('mon', 0) });
    out.push({ k: 'field', i: 0, label: '农田', blocked: blocked('field', 0) });
    return out;
  }

  /** 结算所有已完成且有米宝的地物 */
  function resolve(state) {
    const all = groups(state);
    const done = [];
    Object.keys(all).forEach((k) => {
      const g = all[k];
      if (!g.complete) return;
      if (g.kind === 'field') return;
      const users = g.meepleUsers;
      if (!Object.keys(users).length) return;
      done.push({ g: g, users: users, pts: featurePoints(state, g) });
    });
    done.forEach((d) => {
      const top = Math.max.apply(null, Object.keys(d.users).map((p) => d.users[p]));
      const winners = Object.keys(d.users).filter((p) => d.users[p] === top);
      winners.forEach((p) => {
        const pl = state.players.find((x) => x.id === p);
        if (pl) pl.score += d.pts;
      });
      // 收回该地物上的所有米宝
      const got = collectGroupMeeples(state, d.g);
      got.tiles.forEach((tile) => {
        const owner = tile.meeple.p;
        tile.meeple = null;
        const pl = state.players.find((x) => x.id === owner);
        if (pl) pl.meeples += 1;
      });
      const names = winners.map((p) => (state.players.find((x) => x.id === p) || {}).name).join('、');
      pushLog(state, (d.g.kind === 'city' ? '城市' : d.g.kind === 'road' ? '道路' : '修道院') +
        '完成，' + names + ' +' + d.pts + ' 分');
    });
    return done.length;
  }

  function finalScore(state) {
    const all = groups(state);
    Object.keys(all).forEach((k) => {
      const g = all[k];
      if (g.kind === 'field') return;
      if (g.complete) return;
      const users = g.meepleUsers;
      if (!Object.keys(users).length) return;
      const pts = featurePoints(state, g);
      const top = Math.max.apply(null, Object.keys(users).map((p) => users[p]));
      Object.keys(users).filter((p) => users[p] === top).forEach((p) => {
        const pl = state.players.find((x) => x.id === p);
        if (pl) pl.score += pts;
      });
    });
    // 农田
    Object.keys(all).forEach((k) => {
      const g = all[k];
      if (g.kind !== 'field') return;
      const users = g.meepleUsers;
      if (!Object.keys(users).length) return;
      const cities = farmCities(state, g, all).length;
      if (!cities) return;
      const pts = cities * 3;
      const top = Math.max.apply(null, Object.keys(users).map((p) => users[p]));
      Object.keys(users).filter((p) => users[p] === top).forEach((p) => {
        const pl = state.players.find((x) => x.id === p);
        if (pl) pl.score += pts;
      });
    });

    let best = 0;
    state.players.forEach((p) => { if (p.score > state.players[best].score) best = state.players.indexOf(p); });
    state.winner = state.players[best].id;
    state.phase = 'ended';
    pushLog(state, '终局结算：' + state.players[best].name + ' 以 ' + state.players[best].score + ' 分获胜');
  }

  /** 抽到的板块如果哪里都放不下，按官方规则弃掉重抽 */
  function ensurePlayable(state, rng) {
    while (state.cur != null && placements(state).length === 0) {
      pushLog(state, '抽到的板块无处可放，弃掉重抽一张');
      state.cur = drawOne(state, rng);
    }
    if (state.cur == null) { finalScore(state); return false; }
    return true;
  }

  function nextTurn(state, rng) {
    state.step = 'place';
    if (!state.deck.length) { finalScore(state); return; }
    state.cur = drawOne(state, rng);
    state.turn = (state.turn + 1) % state.players.length;
    ensurePlayable(state, rng);
  }

  function act(state, action, pid, rng) {
    if (!state) return { ok: false, msg: '对局数据异常' };
    if (action.type === 'restart') {
      if (pid !== state.hostId) return { ok: false, msg: '只有房主能重开' };
      const fresh = createInitial(state.players.map((p) => ({ id: p.id, name: p.name })), rng);
      return { ok: true, state: fresh };
    }
    if (state.phase === 'ended') return { ok: false, msg: '这局已经结束了' };
    const cur = state.players[state.turn];
    if (!cur || (pid && cur.id !== pid)) return { ok: false, msg: '还没轮到你' };

    if (action.type === 'place') {
      if (state.step !== 'place') return { ok: false, msg: '现在不是拼板块的阶段' };
      if (state.cur == null) return { ok: false, msg: '牌堆已经空了' };
      const x = Number(action.x), y = Number(action.y), r = ((Number(action.rot) || 0) % 4 + 4) % 4;
      if (state.board[key(x, y)]) return { ok: false, msg: '这里已经有板块了' };
      if (!hasNeighbor(state, x, y)) return { ok: false, msg: '新板块必须挨着已有的板块' };
      if (!neighborOk(state, x, y, r, state.cur)) return { ok: false, msg: '边缘对不上，换个方向试试' };
      state.board[key(x, y)] = { x: x, y: y, t: state.cur, r: r, meeple: null };
      state.last = { x: x, y: y };
      state.step = 'meeple';
      pushLog(state, cur.name + ' 放下板块（' + (x) + ',' + (y) + '）');
      return { ok: true, state: state };
    }

    if (action.type === 'meeple') {
      if (state.step !== 'meeple') return { ok: false, msg: '先放板块再放米宝' };
      const last = state.last;
      const tile = state.board[key(last.x, last.y)];
      if (!tile) return { ok: false, msg: '找不到刚放下的板块' };
      if (action.k !== 'none') {
        if (cur.meeples <= 0) return { ok: false, msg: '米宝已经用完了' };
        const opts = meepleOptions(state, last.x, last.y);
        const hit = opts.find((o) => o.k === action.k && (action.k === 'field' || action.k === 'mon' || o.i === Number(action.i || 0)));
        if (!hit) return { ok: false, msg: '这个地物不能放米宝' };
        if (hit.blocked) return { ok: false, msg: '这里已经有米宝了' };
        tile.meeple = { p: cur.id, k: action.k, i: Number(action.i || 0), x: last.x, y: last.y };
        cur.meeples -= 1;
        pushLog(state, cur.name + ' 在' + hit.label + '上放了米宝');
      }
      resolve(state);
      nextTurn(state, rng);
      return { ok: true, state: state };
    }

    return { ok: false, msg: '这个操作不支持' };
  }

  return {
    TYPES: TYPES,
    COLORS: COLORS,
    createInitial: createInitial,
    act: act,
    placements: placements,
    meepleOptions: meepleOptions,
    featuresOf: featuresOf,
    groups: groups,
    keys: { key: key },
    DIRS: DIRS
  };
})();

/* ============================================================
   卡坦岛（Catan）—— 3-4 人 · 官方基础规则
   19 块地形 + 9 个港口（4 个 3:1 通用 + 5 个 2:1 指定）、
   银行每种资源 19 张、掷 7 弃一半（向下取整）并由掷骰者选强盗位置与抢夺对象、
   玩家间可自由互市、发展卡当回合买入不可当回合打出且每回合限 1 张、
   最长道路不可穿过对手村落 / 城市、10 分获胜
   ============================================================ */
window.CatanEngine = (function () {
  const RES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
  const RES_NAME = { wood: '木', brick: '砖', sheep: '羊', wheat: '麦', ore: '矿' };
  const RES_HEX = { wood: '#3f8b54', brick: '#c4693f', sheep: '#8fc46a', wheat: '#e2b83c', ore: '#7b7c86', desert: '#e6d9b8' };
  const COST = {
    road: { wood: 1, brick: 1 },
    settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
    city: { wheat: 2, ore: 3 },
    dev: { sheep: 1, wheat: 1, ore: 1 }
  };
  const DEV_DECK = []
    .concat(Array(14).fill('knight'))
    .concat(Array(5).fill('vp'))
    .concat(Array(2).fill('road'))
    .concat(Array(2).fill('plenty'))
    .concat(Array(2).fill('monopoly'));

  function shuffle(a, rand) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function corners(hex) {
    const cx = hex.x, cy = hex.y;
    return [
      [cx, cy - 2], [cx + 1, cy - 1], [cx + 1, cy + 1],
      [cx, cy + 2], [cx - 1, cy + 1], [cx - 1, cy - 1]
    ].map((p) => p[0] + ',' + p[1]);
  }

  function buildBoard(rand) {
    const rows = [
      { r: -2, q0: 0, q1: 2 },
      { r: -1, q0: -1, q1: 2 },
      { r: 0, q0: -2, q1: 2 },
      { r: 1, q0: -2, q1: 1 },
      { r: 2, q0: -2, q1: 0 }
    ];
    const hexes = [];
    rows.forEach((row) => {
      for (let q = row.q0; q <= row.q1; q++) {
        hexes.push({ id: 'h' + hexes.length, q: q, r: row.r, x: 2 * q + row.r, y: 3 * row.r, res: null, num: 0, robber: false });
      }
    });

    const pool = ['wood', 'wood', 'wood', 'wood', 'brick', 'brick', 'brick',
      'sheep', 'sheep', 'sheep', 'sheep', 'wheat', 'wheat', 'wheat', 'wheat',
      'ore', 'ore', 'ore', 'desert'];
    const bag = shuffle(pool, rand);
    const nums = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12], rand);
    let ni = 0;
    hexes.forEach((h, i) => {
      h.res = bag[i];
      if (h.res === 'desert') { h.num = 0; h.robber = true; }
      else h.num = nums[ni++];
    });

    const verts = {};
    const edges = {};
    hexes.forEach((h) => {
      const cs = corners(h);
      cs.forEach((v) => {
        verts[v] = verts[v] || { id: v, x: Number(v.split(',')[0]), y: Number(v.split(',')[1]), hexes: [], edges: [], building: null };
        if (verts[v].hexes.indexOf(h.id) < 0) verts[v].hexes.push(h.id);
      });
      for (let k = 0; k < 6; k++) {
        const a = cs[k], b = cs[(k + 1) % 6];
        const key = a < b ? a + '|' + b : b + '|' + a;
        edges[key] = edges[key] || { id: key, v: [a, b], hexes: [], owner: null };
        if (edges[key].hexes.indexOf(h.id) < 0) edges[key].hexes.push(h.id);
        ['a', 'b'].forEach((side) => {
          const v = side === 'a' ? a : b;
          if (verts[v].edges.indexOf(key) < 0) verts[v].edges.push(key);
        });
      }
    });

    Object.keys(verts).forEach((vid) => { verts[vid].adj = []; });
    Object.keys(edges).forEach((eid) => {
      const e = edges[eid];
      verts[e.v[0]].adj.push(e.v[1]);
      verts[e.v[1]].adj.push(e.v[0]);
    });

    return { hexes: hexes, verts: verts, edges: edges };
  }

  // 9 个港口：沿 18 条海岸边等距取 9 个
  function buildPorts(st, rand) {
    const coast = Object.keys(st.edges)
      .filter((eid) => st.edges[eid].hexes.length === 1)
      .sort((a, b) => {
        const ma = midOf(st.edges[a]), mb = midOf(st.edges[b]);
        return Math.atan2(ma[1], ma[0]) - Math.atan2(mb[1], mb[0]);
      });
    const types = shuffle([
      { type: '3:1', res: null }, { type: '3:1', res: null },
      { type: '3:1', res: null }, { type: '3:1', res: null },
      { type: '2:1', res: 'wood' }, { type: '2:1', res: 'brick' },
      { type: '2:1', res: 'sheep' }, { type: '2:1', res: 'wheat' },
      { type: '2:1', res: 'ore' }
    ], rand);
    const ports = [];
    for (let i = 0; i < 9; i++) {
      const idx = Math.floor(i * coast.length / 9);
      const eid = coast[Math.min(idx, coast.length - 1)];
      const e = st.edges[eid];
      ports.push({
        id: 'po' + i, e: eid, v: e.v.slice(),
        x: midOf(e)[0], y: midOf(e)[1],
        type: types[i].type, res: types[i].res
      });
    }
    return ports;
  }

  function midOf(e) {
    const p = e.v[0].split(',').map(Number), q = e.v[1].split(',').map(Number);
    return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  }

  function createInitial(players, rand) {
    rand = rand || Math.random;
    const list = (players || []).slice(0, 4).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 3) list.push({ id: 'p' + list.length, name: '玩家 ' + (list.length + 1) });

    const board = buildBoard(rand);
    const robberHex = (board.hexes.find((h) => h.robber) || board.hexes[0]).id;

    const st = {
      game: 'catan',
      phase: 'setup',
      hostId: null,
      turn: 0,
      round: 0,
      setupStep: 0,
      setupRound: 1,
      players: list.map((p) => ({
        id: p.id, name: p.name, res: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
        dev: [], devNew: [], knights: 0, points: 0, vpCards: 0, devPlayed: false
      })),
      hexes: board.hexes,
      verts: board.verts,
      edges: board.edges,
      robberHex: robberHex,
      devDeck: shuffle(DEV_DECK, rand),
      bank: { wood: 19, brick: 19, sheep: 19, wheat: 19, ore: 19 },
      dice: null,
      robberPending: false,
      robberStage: null,
      discardOwed: {},
      stealFrom: [],
      tradeOffer: null,
      pendingDev: null,
      longestOwner: null,
      armyOwner: null,
      winner: null,
      lastCard: null,
      logs: []
    };
    st.ports = buildPorts(st, rand);
    pushLog(st, '开局：先各自放 2 个村落 + 2 条路（第 2 轮放下后立刻收资源）');
    pushLog(st, '岛上有 9 个港口：4 个 3:1 通用港与 5 个 2:1 专属港');
    return st;
  }

  function pushLog(st, line) {
    st.logs.push(line);
    if (st.logs.length > 32) st.logs = st.logs.slice(-32);
  }

  function hexById(st, id) { return st.hexes.find((h) => h.id === id); }
  function vertOf(st, id) { return st.verts[id]; }
  function edgeOf(st, id) { return st.edges[id]; }
  function playerOf(st, pid) { return st.players.find((p) => p.id === pid); }
  function resTotal(p) { return RES.reduce((s, r) => s + (p.res[r] || 0), 0); }

  function canPlaceSettlement(st, vid, pid) {
    const v = vertOf(st, vid);
    if (!v || v.building) return false;
    if (v.adj.some((a) => {
      const nb = vertOf(st, a);
      return nb && nb.building;
    })) return false;
    if (st.phase === 'playing' && !v.edges.some((eid) => edgeOf(st, eid).owner === pid)) return false;
    return true;
  }

  function canPlaceRoad(st, eid, pid, free) {
    const e = edgeOf(st, eid);
    if (!e || e.owner) return false;
    if (free) return true;
    return e.v.some((vid) => {
      const v = vertOf(st, vid);
      if (v.building && v.building.owner !== pid) return false;
      if (v.building && v.building.owner === pid) return true;
      return v.edges.some((other) => edgeOf(st, other).owner === pid);
    });
  }

  function gainRes(st, pid, res) {
    const p = playerOf(st, pid);
    if (p && st.bank[res] > 0) { p.res[res] += 1; st.bank[res] -= 1; return true; }
    return false;
  }

  // 掷骰产资源：先统计需求，银行不够则该资源全员不发放（官方处理）
  function produceForSum(st, sum) {
    const demand = {};
    st.hexes.filter((h) => h.num === sum && !h.robber).forEach((h) => {
      corners(h).forEach((vid) => {
        const v = vertOf(st, vid);
        if (!v || !v.building || !h.res || h.res === 'desert') return;
        const times = v.building.type === 'city' ? 2 : 1;
        demand[h.res] = (demand[h.res] || 0) + times;
        (demand['_' + h.res] = demand['_' + h.res] || []).push({ pid: v.building.owner, n: times });
      });
    });
    RES.forEach((r) => {
      const need = demand[r] || 0;
      if (!need) return;
      if (st.bank[r] < need) {
        pushLog(st, '银行 ' + RES_NAME[r] + ' 不足（需 ' + need + '，剩 ' + st.bank[r] + '），本轮无人拿到');
        return;
      }
      (demand['_' + r] || []).forEach((it) => {
        const p = playerOf(st, it.pid);
        if (!p) return;
        p.res[r] += it.n;
        st.bank[r] -= it.n;
        pushLog(st, p.name + ' 收 ' + RES_NAME[r] + ' ×' + it.n);
      });
    });
  }

  // 最长道路：DFS，不能穿过对手的村落 / 城市
  function longestRoad(st, pid) {
    const g = {};
    Object.keys(st.edges).forEach((eid) => {
      const e = st.edges[eid];
      if (e.owner !== pid) return;
      (g[e.v[0]] = g[e.v[0]] || []).push(e.v[1]);
      (g[e.v[1]] = g[e.v[1]] || []).push(e.v[0]);
    });
    let best = 0;
    const walk = (v, seen, len) => {
      if (len > best) best = len;
      (g[v] || []).forEach((nb) => {
        if (seen[nb]) return;
        const nbv = vertOf(st, nb);
        if (nbv.building && nbv.building.owner !== pid) return;
        seen[nb] = true;
        walk(nb, seen, len + 1);
        delete seen[nb];
      });
    };
    Object.keys(g).forEach((v) => walk(v, { [v]: true }, 0));
    return best;
  }

  function pointsOf(st, p) {
    let pts = 0;
    Object.keys(st.verts).forEach((vid) => {
      const v = st.verts[vid];
      if (!v.building || v.building.owner !== p.id) return;
      pts += v.building.type === 'city' ? 2 : 1;
    });
    pts += (p.vpCards || 0);
    if (st.longestOwner === p.id) pts += 2;
    if (st.armyOwner === p.id) pts += 2;
    p.points = pts;
    return pts;
  }

  function refreshPoints(st) {
    const lr = {};
    st.players.forEach((p) => { lr[p.id] = longestRoad(st, p.id); });
    let best = 0;
    st.players.forEach((p) => { if (lr[p.id] > best) best = lr[p.id]; });
    if (best >= 5) {
      if (!st.longestOwner || lr[st.longestOwner] < best) {
        st.players.forEach((p) => { if (lr[p.id] === best) st.longestOwner = p.id; });
      }
    } else st.longestOwner = null;
    let armyBest = 0;
    st.players.forEach((p) => { if (p.knights > armyBest) armyBest = p.knights; });
    if (armyBest >= 3) {
      if (!st.armyOwner || (playerOf(st, st.armyOwner) || { knights: 0 }).knights < armyBest) {
        const top = st.players.filter((p) => p.knights === armyBest)[0];
        if (top) st.armyOwner = top.id;
      }
    } else st.armyOwner = null;
    st.players.forEach((p) => pointsOf(st, p));
    const win = st.players.find((p) => p.points >= 10);
    if (win && st.phase !== 'ended') {
      st.phase = 'ended';
      st.winner = win.id;
      pushLog(st, win.name + ' 达到 ' + win.points + ' 分，拿下卡坦岛');
    }
  }

  function payCost(st, p, what) {
    const cost = COST[what];
    for (const r of Object.keys(cost)) if ((p.res[r] || 0) < cost[r]) return false;
    Object.keys(cost).forEach((r) => { p.res[r] -= cost[r]; st.bank[r] += cost[r]; });
    return true;
  }

  // 玩家在某资源上的最优兑换率（2 / 3 / 4）
  function tradeRatio(st, p, res) {
    let best = 4;
    (st.ports || []).forEach((po) => {
      const onPort = po.v.some((vid) => {
        const v = vertOf(st, vid);
        return v && v.building && v.building.owner === p.id;
      });
      if (!onPort) return;
      if (po.type === '2:1' && po.res === res) best = Math.min(best, 2);
      if (po.type === '3:1') best = Math.min(best, 3);
    });
    return best;
  }

  function startTurn(st) {
    const p = st.players[st.turn];
    if (p) {
      p.dev = p.dev.concat(p.devNew);
      p.devNew = [];
      p.devPlayed = false;
    }
    st.dice = null;
    st.robberPending = false;
    st.robberStage = null;
  }

  function nextTurn(st) {
    st.turn = (st.turn + 1) % st.players.length;
    if (st.turn === 0) st.round += 1;
    startTurn(st);
  }

  function settleDiscards(st) {
    const anyLeft = Object.keys(st.discardOwed).some((k) => st.discardOwed[k] > 0);
    if (!anyLeft) {
      st.robberStage = 'place';
      pushLog(st, '弃牌完毕：由掷骰者选择强盗放到哪块地');
    }
  }

  function setupPlace(st, i, action) {
    const { v, e } = action;
    if (!v || !e) return { ok: false, msg: '要同时放村落和道路' };
    if (!canPlaceSettlement(st, v, st.players[i].id)) return { ok: false, msg: '这个点不能建村落' };
    if (vertOf(st, v).edges.indexOf(e) < 0) return { ok: false, msg: '道路要贴着刚放的村落' };
    if (st.edges[e].owner) return { ok: false, msg: '这条边上已经有路了' };
    st.verts[v].building = { owner: st.players[i].id, type: 'settlement' };
    st.edges[e].owner = st.players[i].id;
    pushLog(st, st.players[i].name + ' 放下村落和第一条路');

    // 官方：第 2 轮放下的村落立刻按相邻地形收一次资源
    if (st.setupRound === 2) {
      vertOf(st, v).hexes.forEach((hid) => {
        const h = hexById(st, hid);
        if (h && h.res && h.res !== 'desert') gainRes(st, st.players[i].id, h.res);
      });
      pushLog(st, st.players[i].name + ' 收到开局资源');
    }

    st.setupStep += 1;
    const totalSteps = st.players.length * 2;
    if (st.setupStep >= totalSteps) {
      st.phase = 'playing';
      st.turn = 0;
      st.round = 1;
      startTurn(st);
      pushLog(st, '开局摆放完成，开始掷骰');
      refreshPoints(st);
      return { ok: true, state: st };
    }
    if (st.setupStep === st.players.length) {
      st.setupRound = 2;
      st.turn = st.players.length - 1;
      pushLog(st, '第 1 轮放完，倒序开始第 2 轮');
    } else if (st.setupRound === 1) {
      st.turn = (st.turn + 1) % st.players.length;
    } else {
      st.turn = (st.turn + st.players.length - 1) % st.players.length;
    }
    return { ok: true, state: st };
  }

  function act(st, action, pid, rand) {
    rand = rand || Math.random;
    const i = st.players.findIndex((p) => p.id === pid);
    if (i < 0) return { ok: false, msg: '你不在这一桌' };
    if (action.type === 'restart') {
      if (st.hostId && pid !== st.hostId) return { ok: false, msg: '只有房主能重开' };
      const fresh = createInitial(st.players, rand);
      fresh.hostId = st.hostId;
      fresh.logs = ['房主重开了一局'].concat(fresh.logs);
      return { ok: true, state: fresh };
    }
    if (st.phase === 'ended') return { ok: false, msg: '这一局已经结束了' };

    // 掷 7 弃牌：所有超额玩家都要处理，未轮到自己也能交牌
    if (action.type === 'discard') {
      const need = st.discardOwed[pid];
      if (!need) return { ok: false, msg: '你不需要弃牌' };
      const give = action.res || {};
      let total = 0;
      for (const r of RES) {
        const n = Number(give[r] || 0);
        if (n < 0 || n > (st.players[i].res[r] || 0)) return { ok: false, msg: '弃牌数量不合法' };
        total += n;
      }
      if (total !== need) return { ok: false, msg: '要弃 ' + need + ' 张' };
      RES.forEach((r) => {
        const n = Number(give[r] || 0);
        st.players[i].res[r] -= n;
        st.bank[r] += n;
      });
      st.discardOwed[pid] = 0;
      pushLog(st, st.players[i].name + ' 弃掉 ' + total + ' 张资源');
      settleDiscards(st);
      return { ok: true, state: st };
    }

    if (st.phase !== 'setup' && st.turn !== i && action.type !== 'tradeRespond') {
      return { ok: false, msg: '还没轮到你' };
    }
    const p = st.players[i];

    if (st.phase === 'setup') {
      if (action.type !== 'place') return { ok: false, msg: '开局阶段只能放村落和道路' };
      return setupPlace(st, i, action);
    }

    if (action.type === 'roll') {
      if (st.dice) return { ok: false, msg: '这一回合已经掷过了' };
      if (st.robberStage) return { ok: false, msg: '先把强盗的事处理完' };
      const d1 = action.dice ? action.dice[0] : 1 + Math.floor(rand() * 6);
      const d2 = action.dice ? action.dice[1] : 1 + Math.floor(rand() * 6);
      st.dice = [d1, d2];
      const sum = d1 + d2;
      pushLog(st, p.name + ' 掷出 ' + d1 + ' + ' + d2 + ' = ' + sum);
      if (sum === 7) {
        st.robberPending = true;
        st.robberStage = 'discard';
        const owed = {};
        st.players.forEach((x) => {
          const tot = resTotal(x);
          const need = tot > 7 ? Math.floor(tot / 2) : 0;
          if (need > 0) owed[x.id] = need;
        });
        st.discardOwed = owed;
        pushLog(st, '掷到 7：手牌超过 7 张的人各弃一半');
        if (!Object.keys(owed).length) st.robberStage = 'place';
      } else {
        produceForSum(st, sum);
        refreshPoints(st);
      }
      return { ok: true, state: st };
    }

    if (action.type === 'robber') {
      if (st.robberStage !== 'place' && st.robberStage !== 'stealKnight') return { ok: false, msg: '现在不用动强盗' };
      if (st.robberStage === 'place' && Object.keys(st.discardOwed).some((k) => st.discardOwed[k] > 0)) {
        return { ok: false, msg: '还有人没弃牌' };
      }
      const h = hexById(st, action.hex);
      if (!h) return { ok: false, msg: '没有这块地' };
      if (h.id === st.robberHex) return { ok: false, msg: '强盗必须换一块地' };
      st.hexes.forEach((x) => { x.robber = false; });
      h.robber = true;
      st.robberHex = h.id;
      st.robberPending = false;
      pushLog(st, p.name + ' 把强盗放到 ' + RES_NAME[h.res] + ' ' + (h.num || '沙漠'));
      const victims = [];
      corners(h).forEach((vid) => {
        const v = vertOf(st, vid);
        if (v && v.building && v.building.owner !== p.id && resTotal(playerOf(st, v.building.owner)) > 0) {
          if (victims.indexOf(v.building.owner) < 0) victims.push(v.building.owner);
        }
      });
      st.stealFrom = victims;
      if (!victims.length) {
        st.robberStage = null;
      } else if (victims.length === 1) {
        stealCard(st, p, victims[0], rand);
        st.robberStage = null;
      } else {
        st.robberStage = 'steal';
        pushLog(st, '这块地旁边有 ' + victims.length + ' 个对手，请选择抢谁');
      }
      return { ok: true, state: st };
    }

    if (action.type === 'steal') {
      if (st.robberStage !== 'steal') return { ok: false, msg: '现在不能抢牌' };
      if (st.stealFrom.indexOf(action.from) < 0) return { ok: false, msg: '只能抢这块地旁边的人' };
      const vp = playerOf(st, action.from);
      if (!vp) return { ok: false, msg: '没有这个玩家' };
      stealCard(st, p, vp.id, rand);
      st.robberStage = null;
      return { ok: true, state: st };
    }

    if (action.type === 'build') {
      const what = action.what;
      if (what === 'road') {
        if (!canPlaceRoad(st, action.e, p.id)) return { ok: false, msg: '这条路接不上你的地盘' };
        if (!payCost(st, p, 'road')) return { ok: false, msg: '资源不够（木 1 + 砖 1）' };
        st.edges[action.e].owner = p.id;
        pushLog(st, p.name + ' 修了一条路');
      } else if (what === 'settlement') {
        if (!canPlaceSettlement(st, action.v, p.id)) return { ok: false, msg: '这个点不能建村落' };
        if (!payCost(st, p, 'settlement')) return { ok: false, msg: '资源不够（木砖羊麦各 1）' };
        st.verts[action.v].building = { owner: p.id, type: 'settlement' };
        pushLog(st, p.name + ' 建了一个村落');
      } else if (what === 'city') {
        const v = vertOf(st, action.v);
        if (!v || !v.building || v.building.owner !== p.id || v.building.type !== 'settlement') {
          return { ok: false, msg: '只能把自己的村落升级成城市' };
        }
        if (!payCost(st, p, 'city')) return { ok: false, msg: '资源不够（麦 2 + 矿 3）' };
        v.building.type = 'city';
        pushLog(st, p.name + ' 把村落升级成城市');
      } else if (what === 'dev') {
        if (!st.devDeck.length) return { ok: false, msg: '发展卡抽完了' };
        if (!payCost(st, p, 'dev')) return { ok: false, msg: '资源不够（羊麦矿各 1）' };
        const card = st.devDeck.shift();
        if (card === 'vp') {
          p.vpCards = (p.vpCards || 0) + 1;
          pushLog(st, p.name + ' 抽到胜利点卡（+1 分）');
        } else {
          p.devNew.push(card);
          pushLog(st, p.name + ' 抽到一张发展卡（当回合不能用）');
        }
      }
      refreshPoints(st);
      return { ok: true, state: st };
    }

    if (action.type === 'trade') {
      const give = action.give, get = action.get;
      if (!give || !get || give === get) return { ok: false, msg: '换的资源不对' };
      if (!RES.includes(give) || !RES.includes(get)) return { ok: false, msg: '资源不存在' };
      const ratio = tradeRatio(st, p, give);
      if ((p.res[give] || 0) < ratio) return { ok: false, msg: '按你的港口兑率需要 ' + ratio + ' 张' + RES_NAME[give] };
      if (st.bank[get] < 1) return { ok: false, msg: '银行没有' + RES_NAME[get] + '了' };
      p.res[give] -= ratio; st.bank[give] += ratio;
      p.res[get] += 1; st.bank[get] -= 1;
      pushLog(st, p.name + ' 用 ' + ratio + ' 张' + RES_NAME[give] + ' 从银行换了 1 张' + RES_NAME[get]);
      return { ok: true, state: st };
    }

    // 玩家间互市：发起 → 对方接受 / 拒绝
    if (action.type === 'offer') {
      const give = action.give, get = action.get;
      if (!RES.includes(give) || !RES.includes(get) || give === get) return { ok: false, msg: '交易内容不合法' };
      const nGive = Math.max(1, Number(action.nGive || 1));
      const nGet = Math.max(1, Number(action.nGet || 1));
      if ((p.res[give] || 0) < nGive) return { ok: false, msg: '你没有这么多' + RES_NAME[give] };
      const target = action.to && action.to !== 'all' ? action.to : null;
      if (target && !playerOf(st, target)) return { ok: false, msg: '没有这个玩家' };
      st.tradeOffer = { from: p.id, to: target, give: give, nGive: nGive, get: get, nGet: nGet };
      pushLog(st, p.name + ' 提议：' + nGive + ' 张' + RES_NAME[give] + ' 换 ' + nGet + ' 张' + RES_NAME[get]);
      return { ok: true, state: st };
    }

    if (action.type === 'tradeRespond') {
      const o = st.tradeOffer;
      if (!o) return { ok: false, msg: '没有待处理的交易' };
      if (o.from === pid) return { ok: false, msg: '不能自己回应自己的交易' };
      if (o.to && o.to !== pid) return { ok: false, msg: '这单不是发给你的' };
      if (!action.accept) {
        pushLog(st, p.name + ' 拒绝了交易');
        if (o.to) st.tradeOffer = null;
        return { ok: true, state: st };
      }
      const from = playerOf(st, o.from);
      if (!from) return { ok: false, msg: '发起者不在了' };
      if ((from.res[o.give] || 0) < o.nGive) return { ok: false, msg: '对方资源不够了' };
      if ((p.res[o.get] || 0) < o.nGet) return { ok: false, msg: '你的资源不够' };
      from.res[o.give] -= o.nGive; p.res[o.give] += o.nGive;
      p.res[o.get] -= o.nGet; from.res[o.get] += o.nGet;
      pushLog(st, p.name + ' 接受交易：' + o.nGet + ' 张' + RES_NAME[o.get] + ' 换 ' + o.nGive + ' 张' + RES_NAME[o.give]);
      st.tradeOffer = null;
      return { ok: true, state: st };
    }

    if (action.type === 'cancelOffer') {
      if (!st.tradeOffer || st.tradeOffer.from !== pid) return { ok: false, msg: '没有你发起的交易' };
      st.tradeOffer = null;
      pushLog(st, p.name + ' 撤回了交易提议');
      return { ok: true, state: st };
    }

    if (action.type === 'playDev') {
      const card = action.card;
      if (p.devPlayed) return { ok: false, msg: '一回合只能打 1 张发展卡' };
      const idx = p.dev.indexOf(card);
      if (idx < 0) return { ok: false, msg: card === 'knight' ? '手里没有骑士（当回合买的卡不能用）' : '手里没有这张发展卡' };
      if (p.devNew.indexOf(card) >= 0 && p.dev.indexOf(card) < 0) return { ok: false, msg: '当回合买的发展卡不能当回合打出' };
      if (card === 'knight') {
        if (!action.hex || !hexById(st, action.hex)) return { ok: false, msg: '骑士要先选一块地放强盗' };
        p.dev.splice(idx, 1);
        p.devPlayed = true;
        p.knights += 1;
        st.robberStage = 'stealKnight';
        pushLog(st, p.name + ' 打出骑士');
        st.robberPending = false;
        st.hexes.forEach((x) => { x.robber = false; });
        const h = hexById(st, action.hex);
        h.robber = true;
        st.robberHex = h.id;
        const victims = [];
        corners(h).forEach((vid) => {
          const v = vertOf(st, vid);
          if (v && v.building && v.building.owner !== p.id && resTotal(playerOf(st, v.building.owner)) > 0) {
            if (victims.indexOf(v.building.owner) < 0) victims.push(v.building.owner);
          }
        });
        st.stealFrom = victims;
        if (victims.length === 1) {
          stealCard(st, p, victims[0], rand);
          st.robberStage = null;
        } else if (!victims.length) {
          st.robberStage = null;
        } else {
          st.robberStage = 'steal';
        }
        refreshPoints(st);
        return { ok: true, state: st };
      }
      if (card === 'road') {
        if (!action.e || !canPlaceRoad(st, action.e, p.id, true)) return { ok: false, msg: '这条路放不下' };
        p.dev.splice(idx, 1);
        p.devPlayed = true;
        st.edges[action.e].owner = p.id;
        pushLog(st, p.name + ' 用发展卡免费修了一条路');
      } else if (card === 'monopoly') {
        if (!action.res || !RES.includes(action.res)) return { ok: false, msg: '选一种资源' };
        p.dev.splice(idx, 1);
        p.devPlayed = true;
        let total = 0;
        st.players.forEach((x) => {
          if (x.id === p.id) return;
          total += x.res[action.res];
          x.res[action.res] = 0;
        });
        p.res[action.res] += total;
        pushLog(st, p.name + ' 用垄断拿走全场 ' + total + ' 张' + RES_NAME[action.res]);
      } else if (card === 'plenty') {
        if (!action.res || !RES.includes(action.res)) return { ok: false, msg: '选一种资源' };
        if (st.bank[action.res] < 2) return { ok: false, msg: '银行剩下的不够 2 张' };
        p.dev.splice(idx, 1);
        p.devPlayed = true;
        p.res[action.res] += 2;
        st.bank[action.res] -= 2;
        pushLog(st, p.name + ' 用丰饶之年拿到 2 张' + RES_NAME[action.res]);
      }
      refreshPoints(st);
      return { ok: true, state: st };
    }

    if (action.type === 'end') {
      if (st.robberStage === 'place' || st.robberStage === 'steal') return { ok: false, msg: '先处理完强盗' };
      if (Object.keys(st.discardOwed).some((k) => st.discardOwed[k] > 0)) return { ok: false, msg: '还有人没弃牌' };
      pushLog(st, p.name + ' 结束回合');
      nextTurn(st);
      return { ok: true, state: st };
    }

    return { ok: false, msg: '不认识的动作' };
  }

  function stealCard(st, thief, victimId, rand) {
    const vp = playerOf(st, victimId);
    if (!vp) return;
    const pool = [];
    RES.forEach((r) => { for (let k = 0; k < vp.res[r]; k++) pool.push(r); });
    if (!pool.length) return;
    const got = pool[Math.floor(rand() * pool.length)];
    vp.res[got] -= 1;
    thief.res[got] += 1;
    pushLog(st, thief.name + ' 从 ' + vp.name + ' 手里抢了 1 张' + RES_NAME[got]);
  }

  return {
    createInitial: createInitial,
    act: act,
    RES: RES,
    RES_NAME: RES_NAME,
    RES_HEX: RES_HEX,
    COST: COST,
    corners: corners,
    longestRoad: longestRoad,
    pointsOf: pointsOf,
    tradeRatio: tradeRatio
  };
})();

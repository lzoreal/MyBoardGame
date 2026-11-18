/* ============================================================
   璀璨宝石（Splendor）—— 2-4 人
   拿宝石 → 买发展卡（卡本身给永久宝石折扣）→ 凑贵族
   先到 15 分获胜；同分时发展卡少的赢
   ============================================================ */
window.SplendorEngine = (function () {
  const COLORS = ['w', 'u', 'g', 'r', 'k'];
  const COLOR_NAME = { w: '白', u: '蓝', g: '绿', r: '红', k: '黑', gold: '金' };
  const COLOR_HEX = { w: '#f4f1e6', u: '#4a7ec9', g: '#2f9e63', r: '#d0433a', k: '#4a4453', gold: '#e8c257' };

  const T1 = [
    [1, 1, 1, 1, 0], [2, 1, 0, 0, 0], [3, 0, 0, 0, 0], [2, 2, 0, 0, 0],
    [1, 2, 0, 0, 0], [1, 1, 0, 0, 1], [2, 1, 1, 0, 0], [1, 3, 0, 0, 0]
  ];
  const T2 = [
    [3, 2, 2, 0, 1], [2, 2, 3, 0, 1], [0, 3, 0, 5, 2], [4, 2, 0, 0, 2],
    [2, 2, 2, 0, 3], [5, 3, 0, 0, 3]
  ];
  const T3 = [
    [3, 3, 3, 5, 4], [7, 0, 0, 0, 4], [6, 3, 0, 0, 5], [3, 6, 3, 0, 4]
  ];

  const NOBLES = [
    { id: 'n1', name: '白蓝贵族', need: { w: 4, u: 4 }, pts: 3 },
    { id: 'n2', name: '绿红贵族', need: { g: 4, r: 4 }, pts: 3 },
    { id: 'n3', name: '黑红贵族', need: { k: 4, r: 4 }, pts: 3 },
    { id: 'n4', name: '白绿贵族', need: { w: 4, g: 4 }, pts: 3 },
    { id: 'n5', name: '三色贵族', need: { u: 3, g: 3, k: 3 }, pts: 3 }
  ];

  function buildCards() {
    const cards = {};
    let seq = 0;
    const make = (tier, ci, row) => {
      const color = COLORS[ci];
      const others = COLORS.filter((c) => c !== color);
      const cost = {};
      let ptr = 0;
      others.forEach((c) => { if (row[ptr] > 0) cost[c] = row[ptr]; ptr += 1; });
      const id = 'c' + (seq++);
      cards[id] = { id: id, tier: tier, color: color, cost: cost, pts: row[4], art: COLOR_NAME[color] };
    };
    COLORS.forEach((c, ci) => T1.forEach((row) => make(1, ci, row)));
    COLORS.forEach((c, ci) => T2.forEach((row) => make(2, ci, row)));
    COLORS.forEach((c, ci) => T3.forEach((row) => make(3, ci, row)));
    return cards;
  }

  function shuffle(a, rand) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function createInitial(players, rand) {
    rand = rand || Math.random;
    const list = (players || []).slice(0, 4).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家 ' + (list.length + 1) });
    const n = list.length;
    const bankEach = n >= 4 ? 7 : n === 3 ? 5 : 4;

    const CARDS = buildCards();
    const decks = { 1: [], 2: [], 3: [] };
    Object.keys(CARDS).forEach((id) => decks[CARDS[id].tier].push(id));
    [1, 2, 3].forEach((t) => { decks[t] = shuffle(decks[t], rand); });

    const board = { 1: [], 2: [], 3: [] };
    [1, 2, 3].forEach((t) => { board[t] = decks[t].slice(0, 4); decks[t] = decks[t].slice(4); });

    const tokens = {};
    COLORS.forEach((c) => { tokens[c] = bankEach; });
    tokens.gold = 5;

    const noblePool = shuffle(NOBLES.map((x) => x.id), rand).slice(0, n === 4 ? 5 : 3);

    return {
      game: 'splendor',
      phase: 'playing',
      hostId: null,
      turn: 0,
      round: 1,
      players: list.map((p) => ({
        id: p.id, name: p.name,
        tokens: { w: 0, u: 0, g: 0, r: 0, k: 0, gold: 0 },
        cards: [], nobles: [], pts: 0
      })),
      bank: tokens,
      board: board,
      decks: decks,
      nobles: noblePool,
      cards: CARDS,
      pendingReturn: null,
      noblePick: null,
      finalRound: false,
      winner: null,
      lastCard: null,
      logs: ['开局：' + n + ' 人，每人目标 15 分；宝石池每种 ' + bankEach + ' 颗']
    };
  }

  function pushLog(st, line) {
    st.logs.push(line);
    if (st.logs.length > 30) st.logs = st.logs.slice(-30);
  }

  function cardOf(st, id) { return st.cards[id]; }

  function bonuses(st, p) {
    const b = { w: 0, u: 0, g: 0, r: 0, k: 0 };
    (p.cards || []).forEach((id) => {
      const c = cardOf(st, id);
      if (c) b[c.color] += 1;
    });
    return b;
  }

  function canAfford(st, p, id) {
    const c = cardOf(st, id);
    const b = bonuses(st, p);
    let lack = 0;
    Object.keys(c.cost).forEach((color) => {
      const want = Math.max(0, c.cost[color] - (b[color] || 0));
      if (p.tokens[color] < want) lack += want - p.tokens[color];
    });
    return lack <= p.tokens.gold;
  }

  function pay(st, p, id) {
    const c = cardOf(st, id);
    const b = bonuses(st, p);
    let goldUsed = 0;
    Object.keys(c.cost).forEach((color) => {
      const want = Math.max(0, c.cost[color] - (b[color] || 0));
      const payNow = Math.min(p.tokens[color], want);
      p.tokens[color] -= payNow;
      st.bank[color] += payNow;
      goldUsed += want - payNow;
    });
    if (goldUsed > 0) {
      p.tokens.gold -= goldUsed;
      st.bank.gold += goldUsed;
    }
  }

  function refreshPts(st, p) {
    let pts = 0;
    p.cards.forEach((id) => { pts += cardOf(st, id).pts; });
    p.nobles.forEach((id) => {
      const nb = NOBLES.find((x) => x.id === id);
      pts += nb ? nb.pts : 0;
    });
    p.pts = pts;
  }

  function checkNobles(st, p) {
    const b = bonuses(st, p);
    for (let i = 0; i < st.nobles.length; i++) {
      const nb = NOBLES.find((x) => x.id === st.nobles[i]);
      if (!nb) continue;
      let ok = true;
      Object.keys(nb.need).forEach((c) => { if ((b[c] || 0) < nb.need[c]) ok = false; });
      if (ok) {
        p.nobles.push(nb.id);
        st.nobles.splice(i, 1);
        pushLog(st, p.name + ' 迎来「' + nb.name + '」，+' + nb.pts + ' 分');
        return true;
      }
    }
    return false;
  }

  function nobleCandidates(st, p) {
    const b = bonuses(st, p);
    return st.nobles.filter((id) => {
      const nb = NOBLES.find((x) => x.id === id);
      if (!nb) return false;
      return Object.keys(nb.need).every((c) => (b[c] || 0) >= nb.need[c]);
    });
  }

  function awardNoble(st, p, id) {
    const nb = NOBLES.find((x) => x.id === id);
    if (!nb) return;
    const idx = st.nobles.indexOf(id);
    if (idx < 0) return;
    st.nobles.splice(idx, 1);
    p.nobles.push(id);
    pushLog(st, p.name + ' 迎来「' + nb.name + '」，+' + nb.pts + ' 分');
  }

  function fillBoard(st, tier) {
    const row = st.board[tier];
    while (row.length < 4 && st.decks[tier].length) row.push(st.decks[tier].shift());
  }

  function nextTurn(st) {
    st.turn = (st.turn + 1) % st.players.length;
    if (st.turn === 0) st.round += 1;
  }

  function scoreAndEnd(st) {
    st.players.forEach((p) => refreshPts(st, p));
    let top = st.players[0];
    st.players.forEach((p) => {
      if (p.pts > top.pts) top = p;
      else if (p.pts === top.pts && p.cards.length < top.cards.length) top = p;
    });
    st.phase = 'ended';
    st.winner = top.id;
    pushLog(st, p2name(top) + ' 以 ' + top.pts + ' 分获胜（15 分回合已打完）');
  }
  function p2name(p) { return p.name; }

  // 官方：回合末手牌（含金）超过 10 颗要退回；多个贵族同时达标由玩家选 1 个
  function finishTurn(st) {
    const p = st.players[st.turn];
    const extra = tokenTotal(p) - 10;
    if (extra > 0) {
      st.pendingReturn = { pid: p.id, count: extra };
      pushLog(st, p.name + ' 宝石超过 10 颗，要退回 ' + extra + ' 颗');
      return;
    }
    settleTurn(st);
  }

  function settleTurn(st) {
    const p = st.players[st.turn];
    refreshPts(st, p);
    const cands = nobleCandidates(st, p);
    if (cands.length > 1) {
      st.noblePick = { pid: p.id, ids: cands };
      pushLog(st, p.name + ' 有 ' + cands.length + ' 位贵族愿意来访，选 1 位');
      return;
    }
    if (cands.length === 1) awardNoble(st, p, cands[0]);
    refreshPts(st, p);
    if (p.pts >= 15) st.finalRound = true;
    if (st.finalRound && st.turn === st.players.length - 1) {
      scoreAndEnd(st);
      return;
    }
    nextTurn(st);
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
    if (st.phase !== 'playing') return { ok: false, msg: '这一局已经结束了' };
    if (i !== st.turn) return { ok: false, msg: '还没轮到你' };
    const p = st.players[i];

    if (st.pendingReturn) {
      if (st.pendingReturn.pid !== pid) return { ok: false, msg: '等对方退回多余宝石' };
      if (action.type !== 'return') return { ok: false, msg: '先退回多余的宝石' };
      const add = action.tokens || {};
      let total = 0;
      for (const c of COLORS.concat('gold')) {
        const n = Number(add[c] || 0);
        if (n < 0 || n > p.tokens[c]) return { ok: false, msg: '退回数量不合法' };
        total += n;
      }
      if (total !== st.pendingReturn.count) return { ok: false, msg: '要退回 ' + st.pendingReturn.count + ' 颗' };
      COLORS.concat('gold').forEach((c) => {
        const n = Number(add[c] || 0);
        p.tokens[c] -= n;
        st.bank[c] += n;
      });
      st.pendingReturn = null;
      pushLog(st, p.name + ' 退回了 ' + total + ' 颗宝石');
      settleTurn(st);
      return { ok: true, state: st };
    }

    if (st.noblePick) {
      if (st.noblePick.pid !== pid) return { ok: false, msg: '等对方选贵族' };
      if (action.type !== 'pickNoble') return { ok: false, msg: '先选一位贵族' };
      if (st.noblePick.ids.indexOf(action.id) < 0) return { ok: false, msg: '这位贵族不在候选里' };
      awardNoble(st, p, action.id);
      st.noblePick = null;
      refreshPts(st, p);
      if (p.pts >= 15) st.finalRound = true;
      if (st.finalRound && st.turn === st.players.length - 1) scoreAndEnd(st);
      else nextTurn(st);
      return { ok: true, state: st };
    }

    if (action.type === 'take') {
      const colors = (action.colors || []).filter((c) => COLORS.indexOf(c) >= 0);
      if (colors.length === 2 && colors[0] === colors[1]) {
        if (st.bank[colors[0]] < 4) return { ok: false, msg: '同色要池里剩 4 颗才能拿 2 颗' };
        p.tokens[colors[0]] += 2;
        st.bank[colors[0]] -= 2;
        pushLog(st, p.name + ' 拿了 2 颗' + COLOR_NAME[colors[0]] + '宝石');
      } else {
        const uniq = Array.from(new Set(colors));
        if (uniq.length !== 3) return { ok: false, msg: '一次要拿 3 种不同的宝石' };
        for (const c of uniq) if (st.bank[c] < 1) return { ok: false, msg: COLOR_NAME[c] + '宝石不够了' };
        uniq.forEach((c) => { p.tokens[c] += 1; st.bank[c] -= 1; });
        pushLog(st, p.name + ' 拿了 ' + uniq.map((c) => COLOR_NAME[c]).join('、') + ' 宝石');
      }
      finishTurn(st);
      return { ok: true, state: st };
    }

    if (action.type === 'reserve') {
      const id = action.id;
      const tier = id ? cardOf(st, id) && cardOf(st, id).tier : 0;
      if (!tier) return { ok: false, msg: '没有这张卡' };
      const idx = st.board[tier].indexOf(id);
      if (idx < 0) return { ok: false, msg: '这张卡不在场上' };
      if ((p.reserved || []).length >= 3) return { ok: false, msg: '最多只能预留 3 张' };
      st.board[tier].splice(idx, 1);
      p.reserved = p.reserved || [];
      p.reserved.push(id);
      if (st.bank.gold > 0) { st.bank.gold -= 1; p.tokens.gold += 1; }
      fillBoard(st, tier);
      pushLog(st, p.name + ' 预留了「' + cardTitle(st, id) + '」');
      finishTurn(st);
      return { ok: true, state: st };
    }

    if (action.type === 'buy') {
      const id = action.id;
      const c = id ? cardOf(st, id) : null;
      if (!c) return { ok: false, msg: '没有这张卡' };
      const rowIdx = st.board[c.tier].indexOf(id);
      const own = (p.reserved || []).indexOf(id);
      if (rowIdx < 0 && own < 0) return { ok: false, msg: '这张卡不在你手上' };
      if (!canAfford(st, p, id)) return { ok: false, msg: '宝石不够买这张' };
      pay(st, p, id);
      if (rowIdx >= 0) { st.board[c.tier].splice(rowIdx, 1); fillBoard(st, c.tier); }
      else p.reserved.splice(own, 1);
      p.cards.push(id);
      st.lastCard = { title: p.name + ' 买下「' + cardTitle(st, id) + '」', text: '永久 ' + COLOR_NAME[c.color] + ' 折扣 +1' + (c.pts ? '，+' + c.pts + ' 分' : ''), tone: 'good' };
      pushLog(st, p.name + ' 买下「' + cardTitle(st, id) + '」（' + (c.pts ? '+' + c.pts + ' 分' : '0 分') + '）');
      finishTurn(st);
      return { ok: true, state: st };
    }

    return { ok: false, msg: '不认识的动作' };
  }

  function cardTitle(st, id) {
    const c = cardOf(st, id);
    if (!c) return '?';
    return COLOR_NAME[c.color] + '卡 ' + c.tier + '级' + (c.pts ? '·' + c.pts + '分' : '');
  }

  function tokenTotal(p) {
    return COLORS.reduce((s, c) => s + p.tokens[c], 0) + p.tokens.gold;
  }

  return {
    createInitial: createInitial,
    act: act,
    COLORS: COLORS,
    COLOR_NAME: COLOR_NAME,
    COLOR_HEX: COLOR_HEX,
    NOBLES: NOBLES,
    cardOf: cardOf,
    cardTitle: cardTitle,
    bonuses: bonuses,
    canAfford: canAfford,
    tokenTotal: tokenTotal
  };
})();

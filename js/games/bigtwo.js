/* ============================================================
   大老二（Big Two）—— 4 人 52 张，经典香港规则
   牌序：3<4<…<K<A<2；同点比花色 ♦<♣<♥<♠
   牌型：单张 / 一对 / 三张 / 顺子(5) / 同花(5) / 葫芦(5) /
         四条带一(5) / 同花顺(5)
   五张牌型大小：顺子 < 同花 < 葫芦 < 四条 < 同花顺
   ============================================================ */
window.BigTwoEngine = (function () {
  const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  const SUITS = ['♦', '♣', '♥', '♠'];
  const RANK_LABEL = RANKS;

  function card(id) {
    return { id: id, r: Math.floor(id / 4), s: id % 4, label: RANKS[Math.floor(id / 4)] + SUITS[id % 4] };
  }
  function strength(id) { return Math.floor(id / 4) * 4 + (id % 4); }

  function sortHand(ids) { return ids.slice().sort((a, b) => strength(a) - strength(b)); }

  function shuffle(arr, rand) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function countRank(ids) {
    const m = {};
    ids.forEach((id) => { const r = Math.floor(id / 4); m[r] = (m[r] || 0) + 1; });
    return m;
  }

  // 解析牌型；不合法返回 null
  function combo(ids) {
    if (!ids || !ids.length) return null;
    const n = ids.length;
    const rk = countRank(ids);
    const ranks = Object.keys(rk).map(Number);
    const maxS = Math.max.apply(null, ids.map((id) => id % 4));

    if (n === 1) return { type: 'single', n: 1, key: strength(ids[0]), cards: ids.slice() };
    if (n === 2 && ranks.length === 1) return { type: 'pair', n: 2, key: ranks[0] * 4 + maxS, cards: ids.slice() };
    if (n === 3 && ranks.length === 1) return { type: 'triple', n: 3, key: ranks[0] * 4 + maxS, cards: ids.slice() };
    if (n !== 5) return null;

    const suits = ids.map((id) => id % 4);
    const sameSuit = suits.every((s) => s === suits[0]);
    const sortedRanks = ranks.slice().sort((a, b) => a - b);
    let straight = sortedRanks.length === 5 && sortedRanks[4] <= 11;
    if (straight) {
      for (let i = 1; i < 5; i++) if (sortedRanks[i] !== sortedRanks[i - 1] + 1) straight = false;
    }
    if (sameSuit && straight) return { type: 'straightflush', n: 5, cat: 5, key: sortedRanks[4], cards: ids.slice() };

    if (straight) return { type: 'straight', n: 5, cat: 1, key: sortedRanks[4], cards: ids.slice() };
    if (sameSuit) return { type: 'flush', n: 5, cat: 2, key: strength(ids.reduce((m, id) => (strength(id) > strength(m) ? id : m), ids[0])), cards: ids.slice() };

    const groups = Object.keys(rk).map(Number).map((r) => ({ r: r, c: rk[r] }));
    const three = groups.find((g) => g.c === 3);
    const pair = groups.find((g) => g.c === 2);
    if (three && pair) return { type: 'full', n: 5, cat: 3, key: three.r, cards: ids.slice() };
    const four = groups.find((g) => g.c === 4);
    if (four) return { type: 'four', n: 5, cat: 4, key: four.r, cards: ids.slice() };
    return null;
  }

  function beats(a, b) {
    if (!a || !b) return false;
    if (a.n !== b.n) return false;
    if (a.n < 5) return a.type === b.type && a.key > b.key;
    if (a.cat !== b.cat) return a.cat > b.cat;
    return a.key > b.key;
  }

  function createInitial(players, rand) {
    rand = rand || Math.random;
    const list = (players || []).slice(0, 4).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家 ' + (list.length + 1) });

    const deck = shuffle(Array.from({ length: 52 }, (_, i) => i), rand);
    const n = list.length;
    const hands = [];
    const per = Math.floor(52 / n);
    for (let i = 0; i < n; i++) hands.push(sortHand(deck.slice(i * per, (i + 1) * per)));
    // 余牌（2/3 人局）直接弃掉，保证牌局能跑完
    const rest = deck.slice(n * per);

    const first = Math.floor(rand() * n);
    // 官方：首局由持最小牌（♦3）的人先出，且第一手必须带 ♦3
    let lead = first, needLowest = false;
    if (per === 13) {
      const k = hands.findIndex((h) => h.indexOf(0) >= 0);
      if (k >= 0) { lead = k; needLowest = true; }
    }
    return {
      game: 'bigtwo',
      phase: 'playing',
      hostId: null,
      turn: lead,
      round: 1,
      players: list,
      hands: hands,
      lastPlay: null,
      passes: 0,
      needLowest: needLowest,
      winner: null,
      outs: [],
      logs: ['开局：' + list.length + ' 人，' + per + ' 张一手' + (rest.length ? '（余 ' + rest.length + ' 张不用）' : '')]
        .concat(needLowest ? ['由持 ♦3 的 ' + list[lead].name + ' 先出，第一手必须带 ♦3'] : []),
      lastCard: null
    };
  }

  function nextTurn(st) {
    st.turn = (st.turn + 1) % st.players.length;
    if (st.turn === 0) st.round += 1;
  }

  function pushLog(st, line) {
    st.logs.push(line);
    if (st.logs.length > 30) st.logs = st.logs.slice(-30);
  }

  function act(st, action, pid, rand) {
    rand = rand || Math.random;
    const i = st.players.findIndex((p) => p.id === pid);
    if (i < 0) return { ok: false, msg: '你不在这一桌' };
    if (st.phase !== 'playing') return { ok: false, msg: '这一局已经结束了' };
    if (action.type === 'restart') {
      if (pid !== st.hostId && st.hostId) return { ok: false, msg: '只有房主能重开' };
      const fresh = createInitial(st.players, rand);
      fresh.hostId = st.hostId;
      fresh.logs = ['房主重开了一局'].concat(fresh.logs);
      return { ok: true, state: fresh };
    }
    if (i !== st.turn) return { ok: false, msg: '还没轮到你' };

    if (action.type === 'pass') {
      st.passes += 1;
      pushLog(st, st.players[i].name + ' 不要');
      if (st.lastPlay && st.passes >= st.players.length - 1) {
        const owner = st.lastPlay.pid;
        st.lastPlay = null;
        st.passes = 0;
        st.turn = st.players.findIndex((p) => p.id === owner);
        st.lastCard = { title: '重新起牌', text: '三家都不要，' + st.players[st.turn].name + ' 重新出牌', tone: 'good' };
        pushLog(st, '三家都不要 → ' + st.players[st.turn].name + ' 重新起牌');
      } else {
        nextTurn(st);
      }
      return { ok: true, state: st };
    }

    if (action.type === 'play') {
      const ids = (action.cards || []).map(Number);
      if (!ids.length) return { ok: false, msg: '先选牌' };
      const hand = st.hands[i];
      for (const id of ids) if (hand.indexOf(id) < 0) return { ok: false, msg: '有牌不在你手上' };
      if (new Set(ids).size !== ids.length) return { ok: false, msg: '选重了同一张牌' };
      const c = combo(ids);
      if (!c) return { ok: false, msg: '这手牌不成牌型' };
      if (st.needLowest && !ids.includes(0)) return { ok: false, msg: '首局第一手必须带 ♦3' };
      if (st.lastPlay && !beats(c, st.lastPlay.combo)) return { ok: false, msg: '压不过桌面上的牌' };

      st.needLowest = false;
      st.hands[i] = sortHand(hand.filter((id) => ids.indexOf(id) < 0));
      st.lastPlay = { pid: pid, combo: c, cards: ids.slice() };
      st.passes = 0;
      const who = st.players[i].name;
      st.lastCard = {
        title: who + ' 出 ' + TYPE_LABEL[c.type],
        text: ids.map((id) => card(id).label).join(' '),
        tone: 'good'
      };
      pushLog(st, who + ' 出' + TYPE_LABEL[c.type] + '：' + ids.map((id) => card(id).label).join(' '));

      if (st.hands[i].length === 0) {
        st.phase = 'ended';
        st.winner = pid;
        st.outs = st.players.map((p, k) => ({ id: p.id, name: p.name, left: st.hands[k].length }))
          .sort((a, b) => a.left - b.left);
        pushLog(st, who + ' 出完了所有牌，拿下这一局');
        return { ok: true, state: st };
      }
      nextTurn(st);
      return { ok: true, state: st };
    }

    return { ok: false, msg: '不认识的动作' };
  }

  const TYPE_LABEL = {
    single: '单张', pair: '一对', triple: '三张', straight: '顺子',
    flush: '同花', full: '葫芦', four: '四条带一', straightflush: '同花顺'
  };

  return {
    createInitial: createInitial,
    act: act,
    combo: combo,
    beats: beats,
    sortHand: sortHand,
    card: card,
    TYPE_LABEL: TYPE_LABEL,
    RANKS: RANK_LABEL,
    SUITS: SUITS,
    strength: strength
  };
})();

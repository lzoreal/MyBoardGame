/* ============================================================
   UNO 规则引擎（简化官方规则）
   ---------------------------------------------------------
   108 张牌：四色 0×1、1-9×2、禁手×2、反转×2、+2×2，外加 4 张变色、4 张变色+4。
   出牌要颜色或点数相同；变色牌自己指定颜色；+2/+4 让下家摸牌并跳过。
   抽一张后，如果这张能出，可以接着出，也可以结束回合（简化处）。
   ============================================================ */

window.UnoEngine = (function () {
  const COLORS = ['r', 'y', 'g', 'b'];
  const ACTIONS = { skip: '禁手', rev: '反转', d2: '+2', wild: '变色', wd4: '变色+4' };

  function buildDeck() {
    const d = [];
    COLORS.forEach((c) => {
      d.push({ c: c, v: '0' });
      for (let n = 1; n <= 9; n++) { d.push({ c: c, v: String(n) }); d.push({ c: c, v: String(n) }); }
      ['skip', 'rev', 'd2'].forEach((v) => { d.push({ c: c, v: v }); d.push({ c: c, v: v }); });
    });
    for (let i = 0; i < 4; i++) { d.push({ c: 'w', v: 'wild' }); d.push({ c: 'w', v: 'wd4' }); }
    return d;
  }

  function shuffle(arr, rand) {
    const rnd = rand || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function label(card) {
    if (!card) return '';
    if (card.c === 'w') return ACTIONS[card.v] || '变色';
    return (card.v.length === 1 ? card.v : (ACTIONS[card.v] || card.v));
  }

  function okColor(c) { return COLORS.indexOf(c) >= 0; }

  function playable(card, top, color) {
    if (!card) return false;
    if (card.c === 'w') return true;
    if (!top) return true;
    return card.c === color || card.v === top.v;
  }

  function pushLog(state, text) {
    state.logs = (state.logs || []).concat(text);
    if (state.logs.length > 30) state.logs = state.logs.slice(-30);
  }

  function createInitial(players, rand) {
    const rnd = rand || Math.random;
    const list = (players || []).slice(0, 6).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家' + (list.length + 1) });

    const deck = shuffle(buildDeck(), rnd);
    const hands = list.map(() => deck.splice(0, 7));
    let top = null;
    while (deck.length) {
      const c = deck.pop();
      if (c.c !== 'w' && /^\d$/.test(c.v)) { top = c; break; }
      deck.unshift(c);
    }

    return {
      game: 'uno',
      phase: 'playing',
      hostId: list[0].id,
      players: list,
      turn: 0,
      dir: 1,
      deck: deck,
      discard: [top],
      hands: hands,
      color: top ? top.c : 'r',
      winner: null,
      drawnPlayable: false,
      last: null,
      logs: ['开局：' + (top ? '首张是 ' + label(top) : '摸牌堆见底') + '，从 ' + list[0].name + ' 开始']
    };
  }

  function topCard(state) {
    return state.discard[state.discard.length - 1];
  }

  function drawTo(state, seat, n, rand) {
    const rnd = rand || Math.random;
    const got = [];
    for (let k = 0; k < n; k++) {
      if (!state.deck.length) {
        if (state.discard.length <= 1) break;
        const top = state.discard.pop();
        const rest = state.discard.splice(0, state.discard.length);
        state.deck = shuffle(rest, rnd);
        state.discard = [top];
      }
      if (!state.deck.length) break;
      const card = state.deck.pop();
      state.hands[seat].push(card);
      got.push(card);
    }
    return got;
  }

  function seatPlus(state, i, step) {
    const n = state.players.length;
    return ((i + step * state.dir) % n + n) % n;
  }

  function advance(state, step) {
    state.turn = seatPlus(state, state.turn, step);
    state.drawnPlayable = false;
  }

  function finish(state, cur) {
    state.phase = 'ended';
    state.winner = cur.id;
    pushLog(state, cur.name + ' 出完了手里所有的牌，获胜！');
  }

  function act(state, action, pid, rand) {
    const rnd = rand || Math.random;
    if (!state) return { ok: false, msg: '对局数据异常' };

    if (action.type === 'restart') {
      if (pid !== state.hostId) return { ok: false, msg: '只有房主能重开' };
      const next = createInitial(state.players, rnd);
      next.hostId = state.hostId;
      next.logs = ['重新开局'].concat(next.logs || []);
      return { ok: true, state: next };
    }

    if (state.phase !== 'playing') return { ok: false, msg: '这局已经结束了' };

    const cur = state.players[state.turn];
    if (!cur || cur.id !== pid) return { ok: false, msg: '还没轮到你出牌' };
    const hand = state.hands[state.turn];
    const top = topCard(state);

    if (action.type === 'draw') {
      if (state.drawnPlayable) return { ok: false, msg: '刚抽的牌还能出，出牌或结束回合' };
      const got = drawTo(state, state.turn, 1, rnd);
      if (!got.length) return { ok: false, msg: '牌堆空了，没有牌可摸' };
      const card = got[0];
      pushLog(state, cur.name + ' 摸了一张牌');
      if (playable(card, top, state.color)) {
        state.drawnPlayable = true;
        return { ok: true, state: state };
      }
      advance(state, 1);
      return { ok: true, state: state };
    }

    if (action.type === 'endTurn') {
      if (!state.drawnPlayable) return { ok: false, msg: '现在不能跳过回合' };
      pushLog(state, cur.name + ' 结束回合');
      advance(state, 1);
      return { ok: true, state: state };
    }

    if (action.type !== 'play') return { ok: false, msg: '这个操作不支持' };

    const i = Math.floor(Number(action.i));
    if (!(i >= 0 && i < hand.length)) return { ok: false, msg: '手上没有这张牌' };
    const card = hand[i];
    if (!playable(card, top, state.color)) {
      return { ok: false, msg: '这张牌颜色和点数都对不上' };
    }
    if (card.c === 'w' && !okColor(action.color)) {
      return { ok: false, msg: '变色牌要先选一个颜色' };
    }

    hand.splice(i, 1);
    state.discard.push(card);
    state.color = card.c === 'w' ? action.color : card.c;
    state.last = { card: card, by: cur.id, color: state.color };
    pushLog(state, cur.name + ' 出了 ' + (card.c === 'w' ? label(card) + '（选 ' + colorName(state.color) + '）' : label(card)));

    if (!hand.length) { finish(state, cur); return { ok: true, state: state }; }

    let step = 1;
    if (card.v === 'skip') {
      pushLog(state, state.players[seatPlus(state, state.turn, 1)].name + ' 被禁手');
      step = 2;
    } else if (card.v === 'rev') {
      if (state.players.length === 2) {
        pushLog(state, '两人局里反转相当于禁手');
        step = 2;
      } else {
        state.dir = -state.dir;
        pushLog(state, '方向反转，现在是 ' + (state.dir === 1 ? '顺时针' : '逆时针'));
      }
    } else if (card.v === 'd2' || card.v === 'wd4') {
      const n = card.v === 'd2' ? 2 : 4;
      const victim = seatPlus(state, state.turn, 1);
      const got = drawTo(state, victim, n, rnd);
      pushLog(state, state.players[victim].name + ' 摸 ' + got.length + ' 张并跳过');
      step = 2;
    }

    advance(state, step);
    return { ok: true, state: state };
  }

  function colorName(c) {
    return { r: '红', y: '黄', g: '绿', b: '蓝' }[c] || '';
  }

  return {
    COLORS: COLORS,
    buildDeck: buildDeck,
    createInitial: createInitial,
    act: act,
    topCard: topCard,
    playable: playable,
    label: label,
    colorName: colorName
  };
})();

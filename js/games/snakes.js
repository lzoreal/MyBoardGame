/* ============================================================
   蛇梯棋规则引擎
   ---------------------------------------------------------
   2-4 人，1-100 共 100 格，掷骰前进。
   · 落到梯子底部 → 顺梯而上
   · 落到蛇头 → 被蛇带回蛇尾
   · 必须正好走到第 100 格才算到达终点，点数超出则原地不动
   引擎是纯函数：不碰 DOM、不碰网络。
   ============================================================ */

window.SnakesEngine = (function () {
  const LAST = 100;

  /* 梯子：从 → 到，蛇：头 → 尾 */
  const LADDERS = { 4: 25, 13: 46, 33: 49, 42: 60, 50: 69, 62: 81, 74: 92 };
  const SNAKES = { 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 99: 41 };

  const COLORS = ['#e2564a', '#3f7fe0', '#2f9e63', '#d9a13b'];

  function clampDice(v, rng) {
    const n = Number(v);
    if (n >= 1 && n <= 6 && Math.floor(n) === n) return n;
    return 1 + Math.floor((rng || Math.random)() * 6);
  }

  function createInitial(players) {
    const list = (players || []).slice(0, 4).map((p, i) => ({
      id: p.id,
      name: p.name,
      color: COLORS[i % COLORS.length],
      pos: 0,
      finished: false
    }));
    return {
      game: 'snakes',
      phase: 'playing',
      hostId: players && players[0] ? players[0].id : null,
      players: list,
      turn: 0,
      dice: null,
      lastMove: null,
      winner: null,
      round: 1,
      logs: ['游戏开始，从第 0 格出发，先到第 100 格者胜']
    };
  }

  function pushLog(state, text) {
    state.logs = (state.logs || []).concat(text);
    if (state.logs.length > 24) state.logs = state.logs.slice(-24);
  }

  function jumpLabel(state, from, to) {
    if (LADDERS[from] === to) return '顺着梯子上了 ' + to + ' 格';
    if (SNAKES[from] === to) return '被蛇带回 ' + to + ' 格';
    return '';
  }

  function advanceTurn(state) {
    const n = state.players.length;
    state.turn = (state.turn + 1) % n;
    if (state.turn === 0) state.round = (state.round || 1) + 1;
  }

  function act(state, action, pid, rng) {
    if (!state) return { ok: false, msg: '对局数据异常' };
    if (action.type === 'restart') {
      if (pid !== state.hostId) return { ok: false, msg: '只有房主能重开' };
      state.players.forEach((p) => { p.pos = 0; p.finished = false; });
      state.turn = 0; state.dice = null; state.lastMove = null; state.winner = null;
      state.phase = 'playing'; state.round = 1;
      pushLog(state, '重新开局，从第 0 格出发');
      return { ok: true, state: state };
    }
    if (state.phase !== 'playing') return { ok: false, msg: '这局已经结束了' };

    const cur = state.players[state.turn];
    if (!cur || cur.id !== pid) return { ok: false, msg: '还没轮到你掷骰子' };
    if (action.type !== 'roll') return { ok: false, msg: '这个操作不支持' };

    const dice = clampDice(action.dice, rng);
    const from = cur.pos;
    let to = from + dice;
    let blocked = false;

    if (to > LAST) {
      to = from;
      blocked = true;
      pushLog(state, cur.name + ' 掷出 ' + dice + ' 点，超出终点，原地不动');
    } else {
      const ladderTo = LADDERS[to];
      const snakeTo = SNAKES[to];
      if (ladderTo) {
        const info = jumpLabel(state, to, ladderTo);
        pushLog(state, cur.name + ' 掷出 ' + dice + ' 点：' + from + ' → ' + to + '，' + info);
        to = ladderTo;
      } else if (snakeTo) {
        const info = jumpLabel(state, to, snakeTo);
        pushLog(state, cur.name + ' 掷出 ' + dice + ' 点：' + from + ' → ' + to + '，' + info);
        to = snakeTo;
      } else {
        pushLog(state, cur.name + ' 掷出 ' + dice + ' 点：' + from + ' → ' + to);
      }
    }

    cur.pos = to;
    if (to >= LAST) {
      cur.finished = true;
      state.winner = cur.id;
      state.phase = 'ended';
      pushLog(state, cur.name + ' 到达第 100 格，获胜！');
    }

    state.dice = dice;
    state.lastMove = { pid: cur.id, dice: dice, from: from, to: to, blocked: blocked };
    if (state.phase === 'playing') advanceTurn(state);
    return { ok: true, state: state };
  }

  return {
    LAST: LAST,
    LADDERS: LADDERS,
    SNAKES: SNAKES,
    COLORS: COLORS,
    createInitial: createInitial,
    act: act
  };
})();

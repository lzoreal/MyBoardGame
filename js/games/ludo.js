/* ============================================================
   飞行棋（竞速版）规则引擎
   ---------------------------------------------------------
   2-4 人，每人一架飞机，绕 52 格跑道竞速。
   规则：
     · 停机坪（pos=0）时必须掷出 6 才能起飞到第 1 格
     · 落到别人所在的格子 → 撞机，对方回停机坪
     · 落到与自己同色的格子 → 顺风飞行，再前进 4 格
     · 必须精确到达第 52 格才算到达终点，超出则按多出的点数往回弹
     · 第一个到达终点的人获胜
   引擎是纯函数：不碰 DOM、不碰网络。
   ============================================================ */

window.LudoEngine = (function () {
  const PATH_LEN = 52;
  const COLORS = ['#e2564a', '#f0b429', '#3f7fe0', '#2f9e63'];

  function clampDice(v, rng) {
    const n = Number(v);
    if (n >= 1 && n <= 6 && Math.floor(n) === n) return n;
    return 1 + Math.floor((rng || Math.random)() * 6);
  }

  function createInitial(players, rng) {
    const list = (players || []).slice(0, 4).map((p, i) => ({
      id: p.id,
      name: p.name,
      color: COLORS[i % COLORS.length],
      pos: 0,
      finished: false
    }));
    return {
      game: 'ludo',
      phase: 'playing',
      hostId: players && players[0] ? players[0].id : null,
      players: list,
      turn: 0,
      dice: null,
      lastMove: null,
      winner: null,
      round: 1,
      logs: ['比赛开始，掷出 6 点才能起飞']
    };
  }

  function pushLog(state, text) {
    state.logs = (state.logs || []).concat(text);
    if (state.logs.length > 24) state.logs = state.logs.slice(-24);
  }

  /* 同色格：第 step 格的颜色由 (step-1)%4 决定，编号与玩家座位号一一对应 */
  function tileColorIndex(step) {
    return (step - 1) % 4;
  }

  function currentPlayer(state) {
    return state.players[state.turn] || null;
  }

  function advanceTurn(state) {
    const n = state.players.length;
    for (let k = 1; k <= n; k++) {
      const idx = (state.turn + k) % n;
      if (!state.players[idx].finished) {
        state.turn = idx;
        if (idx === 0) state.round = (state.round || 1) + 1;
        return;
      }
    }
    state.phase = 'ended';
  }

  function act(state, action, pid, rng) {
    if (!state || state.phase !== 'playing') return { ok: false, msg: '这局已经结束了' };
    if (action.type === 'restart') {
      if (pid !== state.hostId) return { ok: false, msg: '只有房主能重开' };
      state.players.forEach((p) => { p.pos = 0; p.finished = false; });
      state.turn = 0; state.dice = null; state.lastMove = null; state.winner = null;
      state.phase = 'playing'; state.round = 1;
      pushLog(state, '重新开局');
      return { ok: true, state: state };
    }

    const cur = currentPlayer(state);
    if (!cur) return { ok: false, msg: '对局数据异常' };
    if (cur.id !== pid) return { ok: false, msg: '还没轮到你走' };

    if (action.type !== 'roll') return { ok: false, msg: '这个操作不支持' };
    if (cur.finished) return { ok: false, msg: '你已经到达终点了' };

    const dice = clampDice(action.dice, rng);
    const seat = state.players.indexOf(cur);
    const from = cur.pos;
    const captured = [];
    let to = from;
    let jumped = false;
    let overshoot = false;

    if (from === 0) {
      if (dice === 6) {
        to = 1;
        pushLog(state, cur.name + ' 掷出 6 点，起飞！');
      } else {
        pushLog(state, cur.name + ' 掷出 ' + dice + ' 点，还没起飞');
      }
    } else {
      to = from + dice;
      if (to > PATH_LEN) {
        to = PATH_LEN - (to - PATH_LEN);
        overshoot = true;
      }
      /* 回弹落点不触发顺风飞行，只认掷骰正向落到的同色格 */
      if (!overshoot && to < PATH_LEN && tileColorIndex(to) === seat) {
        const before = to;
        to = Math.min(PATH_LEN, to + 4);
        jumped = true;
        pushLog(state, cur.name + ' 踩到同色格，顺风飞行 ' + before + ' → ' + to);
      }
      if (to < PATH_LEN) {
        state.players.forEach((q) => {
          if (q !== cur && q.pos === to && !q.finished) {
            q.pos = 0;
            captured.push(q.id);
          }
        });
        if (captured.length) {
          const names = captured.map((id) => (state.players.find((p) => p.id === id) || {}).name || '对手');
          pushLog(state, cur.name + ' 撞机！' + names.join('、') + ' 回到停机坪');
        }
      }
      if (!jumped && !captured.length) {
        pushLog(state, cur.name + ' 掷出 ' + dice + ' 点，' + from + ' → ' + to + (overshoot ? '（超出后回弹）' : ''));
      }
    }

    cur.pos = to;
    if (to === PATH_LEN) {
      cur.finished = true;
      if (!state.winner) {
        state.winner = cur.id;
        state.phase = 'ended';
        pushLog(state, cur.name + ' 到达终点，获得第一名！');
      }
    }

    state.dice = dice;
    state.lastMove = { pid: cur.id, dice: dice, from: from, to: to, jumped: jumped, captured: captured };

    if (state.phase !== 'ended') advanceTurn(state);
    return { ok: true, state: state };
  }

  return {
    PATH_LEN: PATH_LEN,
    COLORS: COLORS,
    createInitial: createInitial,
    act: act,
    tileColorIndex: tileColorIndex,
    currentPlayer: currentPlayer
  };
})();

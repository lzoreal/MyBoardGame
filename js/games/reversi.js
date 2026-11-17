/* ============================================================
   黑白棋（奥赛罗）规则引擎
   ---------------------------------------------------------
   8×8。夹住对方棋子即翻面，双方都无合法落点时结束，子多方胜。
   引擎是纯函数：不碰 DOM、不碰网络。
   ============================================================ */

window.ReversiEngine = (function () {
  const SIZE = 8;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function idx(x, y) { return y * SIZE + x; }

  function createInitial(players) {
    const list = (players || []).slice(0, 2).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家' + (list.length + 1) });

    const cells = new Array(SIZE * SIZE).fill(0);
    cells[idx(3, 3)] = 2;
    cells[idx(4, 4)] = 2;
    cells[idx(3, 4)] = 1;
    cells[idx(4, 3)] = 1;

    const st = {
      game: 'reversi',
      phase: 'playing',
      hostId: list[0].id,
      players: list,
      turn: 0,
      cells: cells,
      moves: [],
      winner: null,
      last: null,
      passes: 0,
      logs: ['黑棋先行，夹住白子就能翻面']
    };
    if (!legalMoves(st.cells, 1).length) advance(st);
    return st;
  }

  /* 逐方向收集被夹住的棋子 */
  function flipsAt(cells, x, y, mark) {
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return null;
    if (cells[idx(x, y)] !== 0) return null;
    const out = [];
    for (let d = 0; d < DIRS.length; d++) {
      const dx = DIRS[d][0], dy = DIRS[d][1];
      const line = [];
      let nx = x + dx, ny = y + dy;
      while (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
        const v = cells[idx(nx, ny)];
        if (v === 0) break;
        if (v === mark) {
          if (line.length) out.push.apply(out, line);
          break;
        }
        line.push(idx(nx, ny));
        nx += dx;
        ny += dy;
      }
    }
    return out.length ? out : null;
  }

  function legalMoves(cells, mark) {
    const out = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const f = flipsAt(cells, x, y, mark);
        if (f) out.push({ x: x, y: y, i: idx(x, y), flips: f });
      }
    }
    return out;
  }

  function counts(cells) {
    let black = 0, white = 0;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === 1) black++;
      else if (cells[i] === 2) white++;
    }
    return { black: black, white: white, empty: SIZE * SIZE - black - white };
  }

  function pushLog(state, text) {
    state.logs = (state.logs || []).concat(text);
    if (state.logs.length > 24) state.logs = state.logs.slice(-24);
  }

  /* 换手：对手无子可下就跳过；两边都没有就终局 */
  function advance(state) {
    const next = 1 - state.turn;
    if (legalMoves(state.cells, next + 1).length) {
      state.turn = next;
      return;
    }
    if (legalMoves(state.cells, state.turn + 1).length) {
      pushLog(state, state.players[next].name + ' 没有可下的位置，跳过一轮');
      return;
    }
    const c = counts(state.cells);
    state.phase = 'ended';
    state.turn = next;
    if (c.black === c.white) {
      state.winner = null;
      pushLog(state, '棋盘下满，双方各 ' + c.black + ' 子，和棋');
    } else {
      state.winner = c.black > c.white ? state.players[0].id : state.players[1].id;
      pushLog(state, '终局：黑 ' + c.black + ' : 白 ' + c.white + '，' +
        (c.black > c.white ? state.players[0].name : state.players[1].name) + ' 获胜');
    }
  }

  function act(state, action, pid) {
    if (!state) return { ok: false, msg: '对局数据异常' };

    if (action.type === 'restart') {
      if (pid !== state.hostId) return { ok: false, msg: '只有房主能重开' };
      const next = createInitial(state.players);
      next.hostId = state.hostId;
      next.logs = ['重新开局，黑棋先行'].concat(next.logs || []);
      return { ok: true, state: next };
    }

    if (state.phase !== 'playing') return { ok: false, msg: '这局已经结束了' };

    const cur = state.players[state.turn];
    if (!cur || cur.id !== pid) return { ok: false, msg: '还没轮到你下' };
    if (action.type !== 'place') return { ok: false, msg: '这个操作不支持' };

    const x = Math.floor(Number(action.x));
    const y = Math.floor(Number(action.y));
    if (!(x >= 0 && x < SIZE && y >= 0 && y < SIZE)) return { ok: false, msg: '落点不在棋盘上' };

    const mark = state.turn + 1;
    const flips = flipsAt(state.cells, x, y, mark);
    if (!flips) return { ok: false, msg: '这里下不了，要夹住至少一颗对方棋子' };

    state.cells[idx(x, y)] = mark;
    flips.forEach((i) => { state.cells[i] = mark; });
    state.moves.push({ x: x, y: y, mark: mark, flips: flips.length });
    state.last = { x: x, y: y, mark: mark, flips: flips.length };
    pushLog(state, cur.name + ' 落 (' + (x + 1) + ',' + (y + 1) + ')，翻 ' + flips.length + ' 子');

    advance(state);
    return { ok: true, state: state };
  }

  return {
    SIZE: SIZE,
    createInitial: createInitial,
    act: act,
    legalMoves: legalMoves,
    flipsAt: flipsAt,
    counts: counts,
    idx: idx
  };
})();

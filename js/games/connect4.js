/* ============================================================
   四子连珠（Connect 4）规则引擎
   ---------------------------------------------------------
   7 列 × 6 行。每列从最下面往上堆，横、竖、斜先连成四子者胜。
   ============================================================ */

window.Connect4Engine = (function () {
  const COLS = 7;
  const ROWS = 6;

  function idx(c, r) { return r * COLS + c; }

  function createInitial(players) {
    const list = (players || []).slice(0, 2).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家' + (list.length + 1) });
    return {
      game: 'connect4',
      phase: 'playing',
      hostId: list[0].id,
      players: list,
      turn: 0,
      cells: new Array(COLS * ROWS).fill(0),
      moves: [],
      winner: null,
      last: null,
      logs: ['先手先落子，横竖斜连成四子就赢']
    };
  }

  function pushLog(state, text) {
    state.logs = (state.logs || []).concat(text);
    if (state.logs.length > 24) state.logs = state.logs.slice(-24);
  }

  /* 某一列能落到的行号，满列返回 -1 */
  function dropRow(cells, col) {
    for (let r = 0; r < ROWS; r++) {
      if (!cells[idx(col, r)]) return r;
    }
    return -1;
  }

  /* 从落点向四个方向数，任意方向连续同色 >= 4 即胜 */
  function checkWin(cells, col, row, mark) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let d = 0; d < dirs.length; d++) {
      const dx = dirs[d][0], dy = dirs[d][1];
      let count = 1;
      for (let s = 1; s <= 3; s++) {
        const c = col + dx * s, r = row + dy * s;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
        if (cells[idx(c, r)] !== mark) break;
        count++;
      }
      for (let s = 1; s <= 3; s++) {
        const c = col - dx * s, r = row - dy * s;
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) break;
        if (cells[idx(c, r)] !== mark) break;
        count++;
      }
      if (count >= 4) return true;
    }
    return false;
  }

  function act(state, action, pid) {
    if (!state) return { ok: false, msg: '对局数据异常' };

    if (action.type === 'restart') {
      if (pid !== state.hostId) return { ok: false, msg: '只有房主能重开' };
      const next = createInitial(state.players);
      next.hostId = state.hostId;
      next.logs = ['重新开局'].concat(next.logs || []);
      return { ok: true, state: next };
    }

    if (state.phase !== 'playing') return { ok: false, msg: '这局已经结束了' };

    const cur = state.players[state.turn];
    if (!cur || cur.id !== pid) return { ok: false, msg: '还没轮到你落子' };
    if (action.type !== 'place') return { ok: false, msg: '这个操作不支持' };

    const col = Math.floor(Number(action.col));
    if (!(col >= 0 && col < COLS)) return { ok: false, msg: '列号不对' };
    const row = dropRow(state.cells, col);
    if (row < 0) return { ok: false, msg: '这一列已经满了' };

    const mark = state.turn + 1;
    state.cells[idx(col, row)] = mark;
    state.moves.push({ col: col, row: row, mark: mark });
    state.last = { col: col, row: row, mark: mark };
    pushLog(state, cur.name + ' 落到第 ' + (col + 1) + ' 列');

    if (checkWin(state.cells, col, row, mark)) {
      state.winner = cur.id;
      state.phase = 'ended';
      pushLog(state, cur.name + ' 连成四子，获胜！');
      return { ok: true, state: state };
    }
    if (state.moves.length >= COLS * ROWS) {
      state.phase = 'ended';
      state.winner = null;
      pushLog(state, '棋盘满了，和棋');
      return { ok: true, state: state };
    }

    state.turn = 1 - state.turn;
    return { ok: true, state: state };
  }

  return {
    COLS: COLS,
    ROWS: ROWS,
    createInitial: createInitial,
    act: act,
    checkWin: checkWin,
    dropRow: dropRow,
    idx: idx
  };
})();

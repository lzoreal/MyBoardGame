/* ============================================================
   五子棋规则引擎
   ---------------------------------------------------------
   15×15，两人对弈，先连成五子（含五子以上）者胜。
   引擎是纯函数：不碰 DOM、不碰网络。
   ============================================================ */

window.GomokuEngine = (function () {
  const SIZE = 15;

  function createInitial(players) {
    const list = (players || []).slice(0, 2).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家' + (list.length + 1) });
    return {
      game: 'gomoku',
      phase: 'playing',
      hostId: players && players[0] ? players[0].id : list[0].id,
      players: list,
      turn: 0,
      cells: new Array(SIZE * SIZE).fill(0),
      moves: [],
      winner: null,
      last: null,
      logs: ['黑棋先行，落子吧']
    };
  }

  function pushLog(state, text) {
    state.logs = (state.logs || []).concat(text);
    if (state.logs.length > 24) state.logs = state.logs.slice(-24);
  }

  function idx(x, y) {
    return y * SIZE + x;
  }

  /* 从落点向四个方向数，任意方向连续同色 >= 5 即胜 */
  function checkWin(cells, x, y, mark) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let d = 0; d < dirs.length; d++) {
      const dx = dirs[d][0];
      const dy = dirs[d][1];
      let count = 1;
      for (let s = 1; s <= 4; s++) {
        const nx = x + dx * s;
        const ny = y + dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
        if (cells[idx(nx, ny)] !== mark) break;
        count++;
      }
      for (let s = 1; s <= 4; s++) {
        const nx = x - dx * s;
        const ny = y - dy * s;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) break;
        if (cells[idx(nx, ny)] !== mark) break;
        count++;
      }
      if (count >= 5) return { win: true, dir: dirs[d], count: count };
    }
    return { win: false };
  }

  function act(state, action, pid) {
    if (!state) return { ok: false, msg: '对局数据异常' };
    if (action.type === 'restart') {
      if (pid !== state.hostId) return { ok: false, msg: '只有房主能重开' };
      state.phase = 'playing';
      state.cells = new Array(SIZE * SIZE).fill(0);
      state.moves = [];
      state.turn = 0;
      state.winner = null;
      state.last = null;
      pushLog(state, '重新开局，黑棋先行');
      return { ok: true, state: state };
    }
    if (state.phase !== 'playing') return { ok: false, msg: '这局已经结束了' };

    const cur = state.players[state.turn];
    if (!cur || cur.id !== pid) return { ok: false, msg: '还没轮到你落子' };
    if (action.type !== 'place') return { ok: false, msg: '这个操作不支持' };

    const x = Math.floor(Number(action.x));
    const y = Math.floor(Number(action.y));
    if (!(x >= 0 && x < SIZE && y >= 0 && y < SIZE)) return { ok: false, msg: '落点不在棋盘上' };
    if (state.cells[idx(x, y)]) return { ok: false, msg: '这里已经有子了' };

    const mark = state.turn + 1;
    state.cells[idx(x, y)] = mark;
    state.moves.push({ x: x, y: y, mark: mark });
    state.last = { x: x, y: y, mark: mark };

    const res = checkWin(state.cells, x, y, mark);
    if (res.win) {
      state.winner = cur.id;
      state.phase = 'ended';
      pushLog(state, cur.name + (mark === 1 ? '（黑）' : '（白）') + ' 连成五子，获胜！');
      return { ok: true, state: state };
    }
    if (state.moves.length >= SIZE * SIZE) {
      state.phase = 'ended';
      state.winner = null;
      pushLog(state, '棋盘满了，和棋');
      return { ok: true, state: state };
    }

    state.turn = 1 - state.turn;
    return { ok: true, state: state };
  }

  return {
    SIZE: SIZE,
    createInitial: createInitial,
    act: act,
    checkWin: checkWin,
    idx: idx
  };
})();

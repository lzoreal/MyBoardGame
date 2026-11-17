/* ============================================================
   跳棋（中国跳棋）规则引擎
   ---------------------------------------------------------
   星形棋盘 121 个孔位，2-6 人。
   · 走到相邻空孔
   · 隔一颗子跳到对面的空孔，可以连跳
   · 把 10 颗子全部走进对面三角区就赢
   孔位坐标与邻接关系由本引擎按几何算出来，页面直接拿来画。
   ============================================================ */

window.JumpEngine = (function () {
  const ROW_LEN = [1, 2, 3, 4, 13, 12, 11, 10, 9, 10, 11, 12, 13, 4, 3, 2, 1];
  const HY = Math.sqrt(3) / 2;

  /* ---------------- 棋盘几何 ---------------- */
  const HOLES = [];
  const POS = {}; // "x,y" -> hole index
  const key = (x, y) => (Math.round(x * 1000) / 1000) + ',' + (Math.round(y * 1000) / 1000);

  ROW_LEN.forEach((len, r) => {
    const off = (13 - len) / 2;
    for (let k = 0; k < len; k++) {
      const x = off + k;
      const y = r * HY;
      POS[key(x, y)] = HOLES.length;
      HOLES.push({ i: HOLES.length, x: x, y: y, row: r });
    }
  });

  /* 邻接：同层距离 1 的六个方向 */
  const ADJ = HOLES.map(() => []);
  for (let a = 0; a < HOLES.length; a++) {
    for (let b = a + 1; b < HOLES.length; b++) {
      const dx = HOLES[a].x - HOLES[b].x;
      const dy = HOLES[a].y - HOLES[b].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.96 && d < 1.04) {
        ADJ[a].push(b);
        ADJ[b].push(a);
      }
    }
  }

  /* 六个角区：按极角分 N / NE / SE / S / SW / NW */
  const SECTORS = [90, 30, -30, -90, -150, 150];
  const CX = 6, CY = 8 * HY;
  const ARMS = [[], [], [], [], [], []];
  HOLES.forEach((h) => {
    const r = Math.round(h.y / HY);
    const q = h.x - r / 2;
    const dq = q - 2;
    const dr = r - 8;
    const dist = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    if (dist <= 4) return;
    const ang = Math.atan2(-(h.y - CY), h.x - CX) * 180 / Math.PI;
    let best = 0, bestD = 1e9;
    for (let s = 0; s < 6; s++) {
      let diff = Math.abs(((ang - SECTORS[s] + 540) % 360) - 180);
      if (diff < bestD) { bestD = diff; best = s; }
    }
    ARMS[best].push(h.i);
  });

  /* 每个孔位的「隔子跳到哪儿」：中点必须是相邻孔 */
  const JUMPS = HOLES.map((h) => {
    const out = [];
    ADJ[h.i].forEach((mid) => {
      const tx = 2 * HOLES[mid].x - h.x;
      const ty = 2 * HOLES[mid].y - h.y;
      const to = POS[key(tx, ty)];
      if (to !== undefined) out.push({ over: mid, to: to });
    });
    return out;
  });

  const ARM_SETS = {
    2: [0, 3],
    3: [0, 2, 4],
    4: [0, 1, 3, 4],
    5: [0, 1, 2, 3, 4],
    6: [0, 1, 2, 3, 4, 5]
  };

  function createInitial(players) {
    const list = (players || []).slice(0, 6).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家' + (list.length + 1) });
    const n = list.length;
    const starts = ARM_SETS[n] || ARM_SETS[6];

    const holes = new Array(HOLES.length).fill(-1);
    starts.forEach((arm, seat) => {
      ARMS[arm].forEach((h) => { holes[h] = seat; });
    });

    return {
      game: 'jump',
      phase: 'playing',
      hostId: list[0].id,
      players: list,
      turn: 0,
      holes: holes,
      starts: starts,
      goals: starts.map((arm) => (arm + 3) % 6),
      chain: null,
      moves: [],
      winner: null,
      last: null,
      logs: [n + ' 人开局，把 10 颗子全部走进对面三角区']
    };
  }

  function pushLog(state, text) {
    state.logs = (state.logs || []).concat(text);
    if (state.logs.length > 24) state.logs = state.logs.slice(-24);
  }

  function isAdjacent(a, b) { return ADJ[a].indexOf(b) >= 0; }

  function jumpOver(from, to) {
    for (let j = 0; j < JUMPS[from].length; j++) {
      if (JUMPS[from][j].to === to) return JUMPS[from][j];
    }
    return null;
  }

  /* 某一颗子当前能走到的所有位置（给页面画提示点用） */
  function targets(state, from) {
    const out = [];
    ADJ[from].forEach((to) => {
      if (state.holes[to] === -1) out.push({ to: to, jump: false });
    });
    JUMPS[from].forEach((j) => {
      if (state.holes[j.over] !== -1 && state.holes[j.to] === -1) {
        out.push({ to: j.to, jump: true, over: j.over });
      }
    });
    return out;
  }

  function hasJump(state, from) {
    return JUMPS[from].some((j) => state.holes[j.over] !== -1 && state.holes[j.to] === -1);
  }

  function done(state, seat) {
    return ARMS[state.goals[seat]].every((h) => state.holes[h] === seat);
  }

  function nextTurn(state) {
    state.chain = null;
    state.turn = (state.turn + 1) % state.players.length;
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
    if (!cur || cur.id !== pid) return { ok: false, msg: '还没轮到你走' };

    if (action.type === 'endChain') {
      if (state.chain === null) return { ok: false, msg: '现在没有连跳' };
      nextTurn(state);
      pushLog(state, cur.name + ' 结束连跳');
      return { ok: true, state: state };
    }

    if (action.type !== 'move') return { ok: false, msg: '这个操作不支持' };

    const from = Number(action.from);
    const to = Number(action.to);
    if (!(from >= 0 && from < HOLES.length && to >= 0 && to < HOLES.length)) {
      return { ok: false, msg: '孔位不存在' };
    }
    if (state.holes[from] !== state.turn) return { ok: false, msg: '这不是你的棋子' };
    if (state.holes[to] !== -1) return { ok: false, msg: '目标孔位有子' };
    if (state.chain !== null && state.chain !== from) {
      return { ok: false, msg: '连跳中，只能继续移动这一颗' };
    }

    const jump = jumpOver(from, to);
    if (jump) {
      if (state.holes[jump.over] === -1) return { ok: false, msg: '中间没有子，跳不过去' };
      state.holes[from] = -1;
      state.holes[to] = state.turn;
      state.last = { from: from, to: to, jump: true };
      state.moves.push(state.last);
      pushLog(state, cur.name + ' 连跳一步');

      if (done(state, state.turn)) {
        state.phase = 'ended';
        state.winner = cur.id;
        state.chain = null;
        pushLog(state, cur.name + ' 全部到位，获胜！');
        return { ok: true, state: state };
      }
      if (hasJump(state, to)) {
        state.chain = to;
        return { ok: true, state: state };
      }
      nextTurn(state);
      return { ok: true, state: state };
    }

    if (!isAdjacent(from, to)) return { ok: false, msg: '只能走到相邻孔，或者隔一颗子跳' };

    state.holes[from] = -1;
    state.holes[to] = state.turn;
    state.last = { from: from, to: to, jump: false };
    state.moves.push(state.last);
    pushLog(state, cur.name + ' 走一步');

    if (done(state, state.turn)) {
      state.phase = 'ended';
      state.winner = cur.id;
      state.chain = null;
      pushLog(state, cur.name + ' 全部到位，获胜！');
      return { ok: true, state: state };
    }
    nextTurn(state);
    return { ok: true, state: state };
  }

  return {
    HOLES: HOLES,
    ADJ: ADJ,
    JUMPS: JUMPS,
    ARMS: ARMS,
    createInitial: createInitial,
    act: act,
    targets: targets,
    hasJump: hasJump,
    done: done
  };
})();

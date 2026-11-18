/* ============================================================
   花砖物语（Azul）—— 2-4 人
   每轮 5 个工厂各 4 块砖：选一色全拿，放进图案行（同色、容量 1..5），
   放不下的落到地板扣分。轮末把满行的一块贴上花砖墙，按行列连片计分。
   有人贴满一整行花砖墙 → 结算后分高者胜。
   ============================================================ */
window.AzulEngine = (function () {
  const COLORS = ['b', 'y', 'r', 'k', 'w'];
  const COLOR_NAME = { b: '蓝', y: '黄', r: '红', k: '黑', w: '白' };
  const COLOR_HEX = { b: '#3f7fd6', y: '#e8b31f', r: '#d2473c', k: '#3c3b45', w: '#f2efe4' };
  const FLOOR_PENALTY = [1, 1, 2, 2, 2, 3, 3];

  function shuffle(a, rand) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function wallColor(row, col) { return COLORS[(col + row) % 5]; }

  function newPlayer(p) {
    return {
      id: p.id,
      name: p.name,
      lines: [0, 1, 2, 3, 4].map(() => ({ color: null, count: 0 })),
      wall: [0, 1, 2, 3, 4].map(() => [false, false, false, false, false]),
      floor: [],
      score: 0,
      rowsDone: 0,
      firstMarker: false
    };
  }

  function createInitial(players, rand) {
    rand = rand || Math.random;
    const list = (players || []).slice(0, 4).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家 ' + (list.length + 1) });

    const bag = [];
    COLORS.forEach((c) => { for (let k = 0; k < 20; k++) bag.push(c); });

    const st = {
      game: 'azul',
      phase: 'playing',
      hostId: null,
      turn: 0,
      round: 1,
      players: list.map(newPlayer),
      bag: shuffle(bag, rand),
      factories: [[], [], [], [], []],
      center: [],
      first: 0,
      centerMarker: true,
      winner: null,
      lastCard: null,
      logs: ['开局：' + list.length + ' 人，' + bag.length + ' 块砖进袋']
    };
    refill(st, rand);
    return st;
  }

  function refill(st, rand) {
    const per = 4;
    st.factories.forEach((f, i) => {
      f.length = 0;
      for (let k = 0; k < per; k++) if (st.bag.length) f.push(st.bag.pop());
    });
    if (st.bag.empty) { /* 兼容 undefined，不影响牌局 */ }
    st.center = [];
  }

  function pushLog(st, line) {
    st.logs.push(line);
    if (st.logs.length > 30) st.logs = st.logs.slice(-30);
  }

  function scoreCell(st, p, row, col) {
    let h = 1, v = 1;
    for (let c = col - 1; c >= 0 && p.wall[row][c]; c--) h += 1;
    for (let c2 = col + 1; c2 < 5 && p.wall[row][c2]; c2++) h += 1;
    for (let r = row - 1; r >= 0 && p.wall[r][col]; r--) v += 1;
    for (let r2 = row + 1; r2 < 5 && p.wall[r2][col]; r2++) v += 1;
    if (h === 1 && v === 1) return 1;
    return (h > 1 ? h : 0) + (v > 1 ? v : 0);
  }

  function resolveRound(st) {
    st.players.forEach((p) => {
      p.lines.forEach((line, idx) => {
        if (line.count < idx + 1) return;
        const col = COLORS.indexOf(line.color);
        if (col < 0) return;
        const wallCol = (col - idx + 5) % 5;
        if (wallCol < 0 || wallCol > 4 || p.wall[idx][wallCol]) {
          p.floor.push(line.color); // 墙上已有同色，瓷砖作废
        } else {
          p.wall[idx][wallCol] = true;
          const got = scoreCell(st, p, idx, wallCol);
          p.score += got;
          pushLog(st, p.name + ' 在 ' + (idx + 1) + ' 行贴上' + COLOR_NAME[line.color] + '砖，+' + got + ' 分');
          if (p.wall[idx].every(Boolean)) {
            p.rowsDone += 1;
            pushLog(st, p.name + ' 补满一整行，本局将在此轮结算后结束');
          }
        }
        line.color = null;
        line.count = 0;
      });

      const floorCount = p.floor.length;
      if (floorCount > 0) {
        const pen = FLOOR_PENALTY[Math.min(floorCount - 1, FLOOR_PENALTY.length - 1)];
        p.score -= pen;
        p.floor.forEach((c) => st.bag.push(c));
        p.floor = [];
        pushLog(st, p.name + ' 地板 ' + floorCount + ' 块，扣 ' + pen + ' 分');
      }
      if (p.score < 0) p.score = 0;
    });

    const ended = st.players.some((p) => p.rowsDone > 0);
    if (ended) {
      // 官方终局奖励：每满行 +2、每满列 +7、每种 5 块齐全的颜色 +10
      st.players.forEach((p) => {
        let bonus = 0;
        for (let r = 0; r < 5; r++) if (p.wall[r].every(Boolean)) bonus += 2;
        for (let c = 0; c < 5; c++) {
          let full = true;
          for (let r = 0; r < 5; r++) if (!p.wall[r][c]) full = false;
          if (full) bonus += 7;
        }
        for (let k = 0; k < 5; k++) {
          let all = true;
          for (let r = 0; r < 5; r++) {
            const col = (k - r + 5) % 5;
            if (!p.wall[r][col]) all = false;
          }
          if (all) bonus += 10;
        }
        if (bonus > 0) {
          p.score += bonus;
          pushLog(st, p.name + ' 终局奖励 +' + bonus + ' 分');
        }
      });
      let best = st.players[0];
      st.players.forEach((p) => { if (p.score > best.score) best = p; });
      st.phase = 'ended';
      st.winner = best.id;
      pushLog(st, '对局结束：' + best.name + ' 以 ' + best.score + ' 分获胜');
      return;
    }

    const markerIdx = st.players.findIndex((p) => p.firstMarker);
    if (markerIdx >= 0) st.first = markerIdx;
    st.players.forEach((p) => { p.firstMarker = false; });
    st.centerMarker = true;
    st.round += 1;
    st.turn = st.first;
    refill(st, Math.random);
    pushLog(st, '第 ' + st.round + ' 轮开始，' + st.players[st.first].name + ' 先拿砖');
  }

  function take(st, p, src, color, lineIdx, rand) {
    let pool = null;
    if (src === 'center') {
      if (st.center.indexOf(color) < 0) return { ok: false, msg: '中间的台上没有这个颜色' };
      pool = st.center.slice();
      st.center = st.center.filter((c) => c !== color);
    } else {
      const fi = Number(String(src).slice(1));
      const f = st.factories[fi];
      if (!f || f.indexOf(color) < 0) return { ok: false, msg: '这个工厂没有这个颜色' };
      pool = f.slice();
      st.factories[fi] = f.filter((c) => c !== color);
      pool.filter((c) => c !== color).forEach((c) => st.center.push(c));
    }
    const taken = pool.filter((c) => c === color).length;
    // 官方：第一个从中间台拿砖的人收下先手标记，立刻 -1 分
    if (src === 'center' && st.centerMarker) {
      st.centerMarker = false;
      p.firstMarker = true;
      p.score -= 1;
      pushLog(st, p.name + ' 收下先手标记，-1 分（下轮由他先拿砖）');
    }

    const line = p.lines[lineIdx];
    if (!line) return { ok: false, msg: '没有这一行' };
    const cap = lineIdx + 1;
    const colorOk = line.count === 0 || line.color === color;
    const wallColFor = (COLORS.indexOf(color) - lineIdx + 5) % 5;
    const wallTaken = p.wall[lineIdx][wallColFor];
    if (colorOk && !wallTaken && line.count + taken <= cap) {
      line.color = color;
      line.count += taken;
      pushLog(st, p.name + ' 从 ' + (src === 'center' ? '中间' : '工厂') + ' 拿了 ' + taken + ' 块' + COLOR_NAME[color] +
        '，放进第 ' + cap + ' 行（' + line.count + '/' + cap + '）');
    } else {
      let fit = (colorOk && !wallTaken) ? Math.min(taken, cap - line.count) : 0;
      if (fit > 0) {
        line.color = color;
        line.count += fit;
      }
      for (let k = 0; k < taken - fit; k++) {
        if (p.floor.length < 7) p.floor.push(color);
        else st.bag.push(color);
      }
      pushLog(st, p.name + ' 拿 ' + taken + ' 块' + COLOR_NAME[color] + '，' + (fit > 0 ? '放进 ' + fit + ' 块，' : '') +
        '溢出 ' + (taken - fit) + ' 块落地板');
    }
    st.lastCard = null;

    const empty = st.factories.every((f) => f.length === 0) && st.center.length === 0;
    if (empty) resolveRound(st);
    else {
      st.turn = (st.turn + 1) % st.players.length;
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
    if (st.phase !== 'playing') return { ok: false, msg: '这一局已经结束了' };
    if (i !== st.turn) return { ok: false, msg: '还没轮到你' };
    if (action.type === 'take') {
      return take(st, st.players[i], action.src, action.color, Number(action.line), rand);
    }
    return { ok: false, msg: '不认识的动作' };
  }

  function wallScore(p) { return p.score; }

  return {
    createInitial: createInitial,
    act: act,
    COLORS: COLORS,
    COLOR_NAME: COLOR_NAME,
    COLOR_HEX: COLOR_HEX,
    FLOOR_PENALTY: FLOOR_PENALTY,
    wallColor: wallColor,
    wallScore: wallScore
  };
})();

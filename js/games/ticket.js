/* ============================================================
   车票之旅（Ticket to Ride · 美国原版地图）—— 2-5 人
   官方规则：45 节车厢、起手 4 张车厢卡 + 3 张车票（至少留 2）、
   明牌 5 张、抽到明置彩虹即本回合结束、回合三选一
   （抽 2 卡 / 占线 / 抽 3 张车票至少留 1）、
   灰线任意同色、彩线须同色、彩虹万能、2-3 人局双线只开一条、
   车厢 1/2/3/4/5/6 → 1/2/4/7/10/15 分、
   有人剩 0-2 节车厢则所有人再各走一回合后结算、
   未完成车票倒扣、最长连续路线 +10（并列各得 10）
   ============================================================ */
window.TicketEngine = (function () {
  const COLORS = ['p', 'w', 'u', 'y', 'g', 'k', 'r', 'o'];
  const COLOR_NAME = {
    p: '紫', w: '白', u: '蓝', y: '黄', g: '绿', k: '黑', r: '红', o: '橙',
    grey: '灰', loco: '彩虹'
  };
  const COLOR_HEX = {
    p: '#9b5bd6', w: '#f2efe4', u: '#3f7fd6', y: '#e8b31f', g: '#2f9e63',
    k: '#3c3b45', r: '#d2473c', o: '#e2833f', grey: '#9aa0a6', loco: '#c9a44c'
  };
  const POINTS = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 10, 6: 15 };

  // 36 座城市（经纬度投影到 1000×520 画布）
  const RAW = [
    ['SEA', '西雅图', 47.6, -122.3], ['POR', '波特兰', 45.5, -122.7],
    ['SFO', '旧金山', 37.8, -122.4], ['LAX', '洛杉矶', 34.0, -118.2],
    ['PHX', '凤凰城', 33.4, -112.1], ['LAS', '拉斯维加斯', 36.2, -115.1],
    ['SLC', '盐湖城', 40.8, -111.9], ['SFE', '圣塔菲', 35.7, -105.9],
    ['ELP', '埃尔帕索', 31.8, -106.5], ['DEN', '丹佛', 39.7, -105.0],
    ['HEL', '海伦娜', 46.6, -112.0], ['CGY', '卡尔加里', 51.0, -114.1],
    ['VAN', '温哥华', 49.3, -123.1], ['WIN', '温尼伯', 49.9, -97.1],
    ['DUL', '德卢斯', 46.8, -92.1], ['OMA', '奥马哈', 41.3, -95.9],
    ['KAN', '堪萨斯城', 39.1, -94.6], ['OKL', '俄克拉何马城', 35.5, -97.5],
    ['DAL', '达拉斯', 32.8, -96.8], ['HOU', '休斯顿', 29.8, -95.4],
    ['LRK', '小石城', 34.7, -92.3], ['NOL', '新奥尔良', 30.0, -90.1],
    ['NAS', '纳什维尔', 36.2, -86.8], ['STL', '圣路易斯', 38.6, -90.2],
    ['CHI', '芝加哥', 41.9, -87.6], ['PIT', '匹兹堡', 40.4, -80.0],
    ['TOR', '多伦多', 43.7, -79.4], ['SAU', '苏圣玛丽', 46.5, -84.3],
    ['MON', '蒙特利尔', 45.5, -73.6], ['BOS', '波士顿', 42.4, -71.1],
    ['NYC', '纽约', 40.7, -74.0], ['WAS', '华盛顿', 38.9, -77.0],
    ['RAL', '罗利', 35.8, -78.6], ['CHA', '查尔斯顿', 32.8, -79.9],
    ['ATL', '亚特兰大', 33.7, -84.4], ['MIA', '迈阿密', 25.8, -80.2]
  ];
  const CITIES = RAW.map(([id, name, lat, lon]) => ({
    id: id, name: name,
    x: Math.round((lon + 124) * 18.5),
    y: Math.round((52 - lat) * 19.26)
  }));

  // 100 段路线（78 处连接，其中 22 处为双线）
  const ROUTES = [
    ['ATL','NAS',1,'grey'],
    ['ATL','CHA',2,'grey'],
    ['ATL','RAL',2,'grey','d0'], ['ATL','RAL',2,'grey','d1'],
    ['ATL','NOL',4,'y','d0'], ['ATL','NOL',4,'o','d1'],
    ['ATL','MIA',5,'u'],
    ['BOS','MON',2,'grey','d0'], ['BOS','MON',2,'grey','d1'],
    ['BOS','NYC',2,'y','d0'], ['BOS','NYC',2,'r','d1'],
    ['CHI','STL',2,'g','d0'], ['CHI','STL',2,'w','d1'],
    ['CHI','DUL',3,'r'],
    ['CHI','PIT',3,'o','d0'], ['CHI','PIT',3,'k','d1'],
    ['CHI','OMA',4,'u'],
    ['CHI','TOR',4,'w'],
    ['CGY','VAN',3,'grey'],
    ['CGY','HEL',4,'grey'],
    ['CGY','SEA',4,'grey'],
    ['CGY','WIN',6,'w'],
    ['CHA','RAL',2,'grey'],
    ['CHA','MIA',4,'p'],
    ['DAL','HOU',1,'grey','d0'], ['DAL','HOU',1,'grey','d1'],
    ['DAL','LRK',2,'grey'],
    ['DAL','OKL',2,'grey','d0'], ['DAL','OKL',2,'grey','d1'],
    ['DAL','ELP',4,'r'],
    ['DEN','SFE',2,'grey'],
    ['DEN','SLC',3,'r','d0'], ['DEN','SLC',3,'y','d1'],
    ['DEN','HEL',4,'g'],
    ['DEN','KAN',4,'k','d0'], ['DEN','KAN',4,'o','d1'],
    ['DEN','OKL',4,'r'],
    ['DEN','OMA',4,'p'],
    ['DEN','PHX',5,'w'],
    ['DUL','OMA',2,'grey','d0'], ['DUL','OMA',2,'grey','d1'],
    ['DUL','SAU',3,'grey'],
    ['DUL','WIN',4,'k'],
    ['DUL','HEL',6,'o'],
    ['DUL','TOR',6,'p'],
    ['ELP','SFE',2,'grey'],
    ['ELP','PHX',3,'grey'],
    ['ELP','OKL',5,'y'],
    ['ELP','HOU',6,'g'],
    ['ELP','LAX',6,'k'],
    ['HEL','SLC',3,'p'],
    ['HEL','WIN',4,'u'],
    ['HEL','OMA',5,'r'],
    ['HEL','SEA',6,'y'],
    ['HOU','NOL',2,'grey'],
    ['KAN','OKL',2,'grey','d0'], ['KAN','OKL',2,'grey','d1'],
    ['KAN','OMA',2,'grey','d0'], ['KAN','OMA',2,'grey','d1'],
    ['KAN','STL',2,'u','d0'], ['KAN','STL',2,'p','d1'],
    ['LAS','LAX',2,'grey'],
    ['LAS','SLC',3,'o'],
    ['LAX','PHX',3,'grey'],
    ['LAX','SFO',3,'p','d0'], ['LAX','SFO',3,'y','d1'],
    ['LRK','OKL',2,'grey'],
    ['LRK','STL',2,'grey'],
    ['LRK','NAS',3,'w'],
    ['LRK','NOL',3,'g'],
    ['MIA','NOL',6,'r'],
    ['MON','NYC',3,'u'],
    ['MON','TOR',3,'grey'],
    ['MON','SAU',5,'k'],
    ['NAS','STL',2,'grey'],
    ['NAS','RAL',3,'k'],
    ['NAS','PIT',4,'y'],
    ['NYC','PIT',2,'g','d0'], ['NYC','PIT',2,'w','d1'],
    ['NYC','WAS',2,'k','d0'], ['NYC','WAS',2,'o','d1'],
    ['OKL','SFE',3,'u'],
    ['PHX','SFE',3,'grey'],
    ['PIT','RAL',2,'grey'],
    ['PIT','TOR',2,'grey'],
    ['PIT','WAS',2,'grey'],
    ['PIT','STL',5,'g'],
    ['POR','SEA',1,'grey','d0'], ['POR','SEA',1,'grey','d1'],
    ['POR','SFO',5,'p','d0'], ['POR','SFO',5,'g','d1'],
    ['POR','SLC',6,'u'],
    ['RAL','WAS',2,'grey','d0'], ['RAL','WAS',2,'grey','d1'],
    ['SAU','TOR',2,'grey'],
    ['SAU','WIN',6,'grey'],
    ['SEA','VAN',1,'grey','d0'], ['SEA','VAN',1,'grey','d1'],
    ['SFO','SLC',5,'w','d0'], ['SFO','SLC',5,'o','d1']
  ];

  // 官方 30 张目的地票
  const TICKETS = [
    ['DEN','ELP',4], ['HOU','KAN',5], ['ATL','NYC',6], ['CGY','SLC',7],
    ['CHI','NOL',7], ['DUL','HOU',8], ['HEL','LAX',8], ['NAS','SAU',8],
    ['ATL','MON',9], ['CHI','SFE',9], ['LAX','SEA',9], ['OKL','SAU',9],
    ['DUL','ELP',10], ['MIA','TOR',10], ['DAL','NYC',11], ['DEN','PIT',11],
    ['LRK','WIN',11], ['PHX','POR',11], ['BOS','MIA',12], ['HOU','WIN',12],
    ['MON','NOL',13], ['SFE','VAN',13], ['CGY','PHX',13], ['CHI','LAX',16],
    ['ATL','SFO',17], ['NAS','POR',17], ['LAX','MIA',20], ['MON','VAN',20],
    ['LAX','NYC',21], ['NYC','SEA',22]
  ];

  function shuffle(a, rand) {
    const arr = a.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function emptyHand() {
    const h = { loco: 0 };
    COLORS.forEach((c) => { h[c] = 0; });
    return h;
  }
  function fullDeck() {
    const d = [];
    COLORS.forEach((c) => { for (let k = 0; k < 12; k++) d.push(c); });
    for (let k = 0; k < 14; k++) d.push('loco');
    return d;
  }
  function routePoints(len) { return POINTS[len] || len; }
  function city(id) { return CITIES.find((c) => c.id === id); }

  function pushLog(st, line) {
    st.logs.push(line);
    if (st.logs.length > 32) st.logs = st.logs.slice(-32);
  }

  function createInitial(players, rand) {
    rand = rand || Math.random;
    const list = (players || []).slice(0, 5).map((p) => ({ id: p.id, name: p.name }));
    while (list.length < 2) list.push({ id: 'p' + list.length, name: '玩家 ' + (list.length + 1) });

    const routes = ROUTES.map((r, i) => ({
      id: 'r' + i, a: r[0], b: r[1], len: r[2], color: r[3], pair: r[4] || null, owner: null
    }));

    const deck = shuffle(fullDeck(), rand);
    const market = deck.splice(0, 5);
    const ticketDeck = shuffle(TICKETS.map((t, i) => ({ id: 't' + i, from: t[0], to: t[1], pts: t[2] })), rand);

    const st = {
      game: 'ticket',
      phase: 'setup',
      hostId: null,
      setupIdx: 0,
      turn: 0,
      round: 1,
      players: list.map((p) => ({
        id: p.id, name: p.name, trains: 45,
        hand: emptyHand(), tickets: [], pending: [],
        points: 0, longest: 0, completed: 0
      })),
      routes: routes,
      deck: deck,
      discard: [],
      market: market,
      ticketDeck: ticketDeck,
      drawsLeft: 2,
      ticketPick: null,
      finale: 0,
      winner: null,
      lastCard: null,
      logs: []
    };
    st.players.forEach((p) => {
      for (let k = 0; k < 4; k++) {
        const c = st.deck.pop();
        if (c) p.hand[c] = (p.hand[c] || 0) + 1;
      }
      for (let k = 0; k < 3 && st.ticketDeck.length; k++) p.pending.push(st.ticketDeck.pop());
    });
    pushLog(st, '开局：' + list.length + ' 人，各 45 节车厢、4 张车厢卡与 3 张车票');
    pushLog(st, '选择至少 2 张车票保留，其余放回票堆');
    return st;
  }

  // 从牌堆取一张，牌堆空了就把弃牌洗回去
  function drawFromDeck(st, rand) {
    if (!st.deck.length) {
      st.deck = shuffle(st.discard, rand);
      st.discard = [];
    }
    return st.deck.pop() || null;
  }

  function refillMarket(st, rand) {
    while (st.market.length < 5) {
      const c = drawFromDeck(st, rand);
      if (!c) break;
      st.market.push(c);
    }
    // 明牌区出现 3 张以上彩虹时整排弃掉重发（官方常见处理）
    if (st.market.filter((c) => c === 'loco').length >= 3) {
      st.discard.push.apply(st.discard, st.market);
      st.market = [];
      refillMarket(st, rand);
    }
  }

  function nextTurn(st) {
    if (st.finale > 0) {
      st.finale -= 1;
      if (st.finale === 0) {
        scoreAll(st);
        return;
      }
    }
    st.turn = (st.turn + 1) % st.players.length;
    if (st.turn === 0) st.round += 1;
    st.drawsLeft = 2;
    st.ticketPick = null;
  }

  function graphOf(st, p) {
    const g = {};
    st.routes.filter((r) => r.owner === p.id).forEach((r) => {
      (g[r.a] = g[r.a] || []).push({ to: r.b, len: r.len });
      (g[r.b] = g[r.b] || []).push({ to: r.a, len: r.len });
    });
    return g;
  }

  function longestFor(st, p) {
    const g = graphOf(st, p);
    let best = 0;
    const walk = (node, seen, len) => {
      if (len > best) best = len;
      (g[node] || []).forEach((e) => {
        if (seen[e.to]) return;
        seen[e.to] = true;
        walk(e.to, seen, len + e.len);
        delete seen[e.to];
      });
    };
    Object.keys(g).forEach((n) => {
      const seen = {}; seen[n] = true;
      walk(n, seen, 0);
    });
    return best;
  }

  function connected(st, p, from, to) {
    const g = graphOf(st, p);
    const seen = { [from]: true };
    const q = [from];
    while (q.length) {
      const n = q.shift();
      if (n === to) return true;
      (g[n] || []).forEach((e) => {
        if (!seen[e.to]) { seen[e.to] = true; q.push(e.to); }
      });
    }
    return false;
  }

  function scoreAll(st) {
    st.players.forEach((p) => {
      let total = p.points;
      let done = 0;
      p.tickets.forEach((t) => {
        const ok = connected(st, p, t.from, t.to);
        t.done = ok;
        if (ok) done += 1;
        total += ok ? t.pts : -t.pts;
      });
      p.completed = done;
      p.longest = longestFor(st, p);
      p.points = total;
      p.longestBonus = 0;
    });
    let bestLen = 0;
    st.players.forEach((p) => { if (p.longest > bestLen) bestLen = p.longest; });
    st.players.forEach((p) => {
      if (p.longest === bestLen && bestLen > 0) {
        p.points += 10;
        p.longestBonus = 10;
      }
    });
    let top = st.players[0];
    st.players.forEach((p) => {
      if (p.points > top.points) top = p;
      else if (p.points === top.points) {
        if (p.completed > top.completed) top = p;
        else if (p.completed === top.completed && p.longest > top.longest) top = p;
      }
    });
    st.phase = 'ended';
    st.winner = top.id;
    pushLog(st, '对局结束：' + top.name + ' 以 ' + top.points + ' 分获胜');
  }

  // 检查手牌能否占某条线（灰线任意单色，彩线须同色，彩虹万能）
  function canClaim(st, p, r, color) {
    if (!r || r.owner || p.trains < r.len) return false;
    if (st.players.length <= 3 && r.pair) {
      const sib = st.routes.find((x) => x.pair && x.id !== r.id && x.a === r.a && x.b === r.b);
      if (sib && sib.owner) return false;
    }
    const use = r.color === 'grey' ? (color || null) : r.color;
    if (!use || !COLORS.includes(use)) return false;
    const need = r.len - Math.min(p.hand[use] || 0, r.len);
    return p.hand.loco >= need;
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
    if (st.phase === 'ended') return { ok: false, msg: '这一局已经结束了' };

    if (st.phase === 'setup') {
      const sp = st.players[i];
      if (i !== st.setupIdx) return { ok: false, msg: '还没轮到你选票' };
      if (action.type !== 'keepTickets') return { ok: false, msg: '先选好要保留的车票' };
      const keep = (action.keep || []).map(Number).filter((k) => k >= 0 && k < sp.pending.length);
      if (keep.length < 2) return { ok: false, msg: '起手至少保留 2 张车票' };
      sp.pending.forEach((t, k) => {
        if (keep.includes(k)) sp.tickets.push({ from: t.from, to: t.to, pts: t.pts, done: false });
        else st.ticketDeck.unshift(t);
      });
      pushLog(st, sp.name + ' 保留了 ' + keep.length + ' 张车票');
      sp.pending = [];
      st.setupIdx += 1;
      if (st.setupIdx >= st.players.length) {
        st.phase = 'playing';
        st.turn = 0;
        st.drawsLeft = 2;
        pushLog(st, '开局选票完毕，开始行车');
      }
      return { ok: true, state: st };
    }

    if (i !== st.turn) return { ok: false, msg: '还没轮到你' };
    const p = st.players[i];

    // 抽完 3 张车票后必须做取舍
    if (st.ticketPick) {
      if (action.type !== 'keepTickets') return { ok: false, msg: '先选好要保留的车票' };
      const keep = (action.keep || []).map(Number).filter((k) => k >= 0 && k < st.ticketPick.length);
      if (keep.length < 1) return { ok: false, msg: '至少保留 1 张车票' };
      st.ticketPick.forEach((t, k) => {
        if (keep.includes(k)) p.tickets.push({ from: t.from, to: t.to, pts: t.pts, done: false });
        else st.ticketDeck.push(t);
      });
      pushLog(st, p.name + ' 保留 ' + keep.length + ' 张车票');
      st.ticketPick = null;
      nextTurn(st);
      return { ok: true, state: st };
    }

    if (action.type === 'draw') {
      if (st.drawsLeft <= 0) return { ok: false, msg: '这回合已经摸过牌了' };
      let got = null;
      if (action.idx != null) {
        const idx = Number(action.idx);
        got = st.market[idx];
        if (!got) return { ok: false, msg: '这张拿不到' };
        st.market.splice(idx, 1);
        refillMarket(st, rand);
      } else {
        got = drawFromDeck(st, rand);
        if (!got) return { ok: false, msg: '牌堆摸完了' };
      }
      p.hand[got] = (p.hand[got] || 0) + 1;
      st.drawsLeft -= 1;
      pushLog(st, p.name + ' 拿了 1 张' + COLOR_NAME[got] + '车厢卡');
      st.lastCard = {
        title: p.name + ' 摸牌',
        text: '拿到 ' + COLOR_NAME[got] + ' 车厢卡',
        tone: 'good'
      };
      if (got === 'loco') st.drawsLeft = 0;  // 抽到彩虹，本回合结束
      if (st.drawsLeft <= 0) nextTurn(st);
      return { ok: true, state: st };
    }

    if (action.type === 'tickets') {
      if (st.drawsLeft !== 2) return { ok: false, msg: '摸过卡就不能再抽车票' };
      const got = [];
      for (let k = 0; k < 3 && st.ticketDeck.length; k++) got.push(st.ticketDeck.pop());
      if (!got.length) return { ok: false, msg: '车票抽完了' };
      st.ticketPick = got;
      pushLog(st, p.name + ' 抽了 3 张车票');
      return { ok: true, state: st };
    }

    if (action.type === 'claim') {
      const r = st.routes.find((x) => x.id === action.id);
      if (!r) return { ok: false, msg: '没有这条路线' };
      if (r.owner) return { ok: false, msg: '这条路线已经有人占了' };
      if (st.players.length <= 3 && r.pair) {
        const sib = st.routes.find((x) => x.pair && x.id !== r.id && x.a === r.a && x.b === r.b);
        if (sib && sib.owner) return { ok: false, msg: '2-3 人局双线只能开一条' };
      }
      if (p.trains < r.len) return { ok: false, msg: '车厢不够了' };
      const use = r.color === 'grey' ? String(action.color || '') : r.color;
      if (!COLORS.includes(use)) return { ok: false, msg: r.color === 'grey' ? '灰线要先选一种颜色' : '颜色不对' };
      if (!canClaim(st, p, r, use)) return { ok: false, msg: '手牌不够占这条线' };
      const own = Math.min(p.hand[use] || 0, r.len);
      const loco = r.len - own;
      p.hand[use] -= own;
      p.hand.loco -= loco;
      if (own + loco > 0) st.discard.push.apply(st.discard,
        Array(own).fill(use).concat(Array(loco).fill('loco')));
      r.owner = p.id;
      r.usedColor = use;
      p.trains -= r.len;
      p.points += routePoints(r.len);
      st.lastCard = {
        title: p.name + ' 占了 ' + city(r.a).name + '—' + city(r.b).name,
        text: r.len + ' 节车厢，+' + routePoints(r.len) + ' 分（剩 ' + p.trains + ' 节）',
        tone: 'good'
      };
      pushLog(st, p.name + ' 占线 ' + city(r.a).name + '→' + city(r.b).name +
        '（' + r.len + ' 节 ' + COLOR_NAME[use] + '，+' + routePoints(r.len) + ' 分）');
      if (p.trains <= 2 && st.finale === 0) {
        st.finale = st.players.length;
        pushLog(st, p.name + ' 只剩 ' + p.trains + ' 节车厢，之后每人再走一回合');
      }
      nextTurn(st);
      return { ok: true, state: st };
    }

    return { ok: false, msg: '不认识的动作' };
  }

  return {
    createInitial: createInitial,
    act: act,
    CITIES: CITIES,
    ROUTES: ROUTES,
    TICKETS: TICKETS,
    COLORS: COLORS,
    COLOR_NAME: COLOR_NAME,
    COLOR_HEX: COLOR_HEX,
    POINTS: POINTS,
    city: city,
    connected: connected,
    canClaim: canClaim,
    routePoints: routePoints
  };
})();

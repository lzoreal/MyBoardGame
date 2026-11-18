/* ============================================================
   桌游合集通用外壳
   ---------------------------------------------------------
   负责：房间创建/加入、Supabase 订阅、回合权限、座位条、
        日志、结算层、本机热座模式。
   每个游戏页只提供：棋盘绘制 + 底部操作栏 + 一句规则说明。
   ============================================================ */

window.GameShell = (function () {
  const Net = window.Net;
  let cfg = null;
  let state = null;
  let code = null;
  let localMode = false;
  let baseId = Net.identity.id;
  let nickname = Net.identity.name || '';

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  function toast(msg, bad) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('bad', !!bad);
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2400);
  }

  /* ---------------- 上下文 ---------------- */
  function ctx() {
    const turnPlayer = state && state.players ? state.players[state.turn] : null;
    const myId = localMode ? (turnPlayer ? turnPlayer.id : baseId) : baseId;
    return {
      state: state,
      meId: myId,
      local: localMode,
      code: code,
      isHost: !!state && (localMode || state.hostId === baseId),
      isTurn: !!turnPlayer && turnPlayer.id === myId,
      send: send,
      setDice: setDice,
      punch: punch,
      toast: toast
    };
  }

  function setDice(value, spin) {
    cfg.board && cfg.board.dice && cfg.board.dice(value, spin);
  }

  function punch() {
    const el = $('boardInner');
    if (!el) return;
    el.classList.remove('punch');
    void el.offsetWidth;
    el.classList.add('punch');
  }

  /* ---------------- 座位 / 顶栏 / 日志 ---------------- */
  function seatColor(p, i) {
    if (cfg.seatColor) return cfg.seatColor(p, i, state);
    return p.color || ['#e2564a', '#3f7fe0', '#2f9e63', '#d9a13b'][i % 4];
  }

  function renderSeats() {
    const strip = $('seatStrip');
    if (!strip) return;
    strip.innerHTML = '';
    const players = (state && state.players) || [];

    players.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'seat' + (state && state.phase === 'playing' && state.turn === i ? ' active' : '');

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = seatColor(p, i);
      div.appendChild(dot);

      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = p.name + (p.id === baseId && !localMode ? '（你）' : '');
      div.appendChild(nm);

      if (cfg.seatTag) {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.textContent = cfg.seatTag(p, i, state);
        div.appendChild(tag);
      }

      const live = document.createElement('span');
      const online = localMode || p.id === baseId || (Net.hasClient && Net.isOnline(p.id));
      live.className = online ? 'on' : 'off';
      live.title = online ? '在线' : '离线';
      div.appendChild(live);

      strip.appendChild(div);
    });

    if (!localMode && state && state.phase === 'lobby') {
      for (let k = players.length; k < cfg.max; k++) {
        const div = document.createElement('div');
        div.className = 'seat empty';
        div.textContent = '等待加入…';
        strip.appendChild(div);
      }
    }
  }

  function renderTurnPill() {
    const pill = $('turnPill');
    if (!pill) return;
    if (!state) { pill.textContent = '未开局'; return; }
    if (state.phase === 'lobby') { pill.textContent = '等待开始'; return; }
    if (state.phase === 'ended') { pill.textContent = '已结束'; return; }
    pill.textContent = cfg.turnPill ? cfg.turnPill(state) : ('回合 ' + (state.round || 1));
  }

  function renderRoomPill() {
    const pill = $('roomPill');
    if (!pill) return;
    pill.innerHTML = '';
    const txt = document.createElement('span');
    txt.textContent = localMode ? '本机热座' : ('房间：' + (code || '—'));
    pill.appendChild(txt);
    if (!localMode && code) {
      const btn = document.createElement('button');
      btn.className = 'copy';
      btn.type = 'button';
      btn.textContent = '复制';
      btn.addEventListener('click', copyCode);
      pill.appendChild(btn);
    }
  }

  function renderLog() {
    const sheet = $('logSheet');
    if (!sheet) return;
    const body = sheet.querySelector('.logList');
    if (!body) return;
    body.innerHTML = '';
    const logs = (state && state.logs) || [];
    logs.slice().reverse().forEach((line) => {
      const li = document.createElement('li');
      li.textContent = line;
      body.appendChild(li);
    });
  }

  function copyCode() {
    if (!code) return;
    const done = () => toast('邀请码已复制：' + code);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code));
    } else {
      fallbackCopy(code);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('邀请码：' + text); } catch (e) { toast('复制失败：' + text, true); }
    document.body.removeChild(ta);
  }

  /* ---------------- 状态落地 ---------------- */
  function setState(st) {
    state = st;
    renderSeats();
    renderTurnPill();
    renderRoomPill();
    renderLog();
    if (!st) return;

    if (st.phase === 'lobby') {
      renderLobbyDock();
      if (cfg.onState) cfg.onState(st, ctx());
      return;
    }

    if (cfg.onState) cfg.onState(st, ctx());
    if (st.phase === 'ended') showWinner();
  }

  /* ---------------- 底部栏（等待开局阶段） ---------------- */
  function renderLobbyDock() {
    const info = $('dockInfo');
    const actions = $('dockActions');
    if (!info || !actions) return;

    info.innerHTML = '';
    const box = document.createElement('div');
    box.innerHTML = '<div class="ttl">等人齐再开局</div>' +
      '<div class="sub">' + (localMode ? '本机热座：换人操作同一台设备' :
        ('把邀请码 <b>' + esc(code || '') + '</b> 发给朋友，至少 ' + cfg.min + ' 人')) + '</div>';
    info.appendChild(box);

    actions.innerHTML = '';
    const isHost = localMode || (state && state.hostId === baseId);
    if (isHost) {
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.type = 'button';
      btn.textContent = '开始游戏';
      btn.disabled = !localMode && state.players.length < cfg.min;
      btn.addEventListener('click', startGame);
      actions.appendChild(btn);
    } else {
      const span = document.createElement('div');
      span.className = 'btn ghost';
      span.style.display = 'grid';
      span.style.placeItems = 'center';
      span.textContent = '等房主开始…';
      actions.appendChild(span);
    }
  }

  /* ---------------- 开局 ---------------- */
  function startGame() {
    if (localMode) return;
    Net.mutate((st) => {
      if (st.phase !== 'lobby') return null;
      if (st.hostId !== baseId) { toast('只有房主能开始', true); return null; }
      if (st.players.length < cfg.min) {
        toast('至少 ' + cfg.min + ' 人才能开始', true);
        return null;
      }
      const init = cfg.engine.createInitial(st.players.map((p) => ({ id: p.id, name: p.name })));
      init.hostId = st.hostId;
      init.logs = ['房间 ' + esc(code || '') + ' 开局'].concat(init.logs || []);
      return init;
    }).catch((e) => toast(e.message || '开局失败', true));
  }

  /* ---------------- 动作派发 ---------------- */
  function send(action, asPid) {
    if (!state) return false;

    if (localMode) {
      const seatIdx = state.phase === 'setup' && typeof state.setupIdx === 'number' ? state.setupIdx : state.turn;
      const pid = asPid || (state.players[seatIdx] ? state.players[seatIdx].id : null);
      const copy = JSON.parse(JSON.stringify(state));
      const r = cfg.engine.act(copy, action, pid, Math.random);
      if (!r.ok) { toast(r.msg, true); return false; }
      setState(r.state);
      return true;
    }

    Net.mutate((st) => {
      const r = cfg.engine.act(st, action, baseId, Math.random);
      if (!r.ok) { toast(r.msg, true); return null; }
      return r.state;
    }).catch((e) => toast(e.message || '同步失败', true));
    return true;
  }

  /* ---------------- 结算 ---------------- */
  function showWinner() {
    const layer = $('winnerLayer');
    if (!layer || !state) return;

    const title = cfg.winnerTitle ? cfg.winnerTitle(state) : '对局结束';
    const sub = cfg.winnerSub ? cfg.winnerSub(state) : '';
    const canAgain = localMode || state.hostId === baseId;

    layer.innerHTML =
      '<div class="winnerCard">' +
      '<div class="crown">🏆</div>' +
      '<h2>' + esc(title) + '</h2>' +
      '<p>' + esc(sub) + '</p>' +
      '<div class="actions">' +
      '<button class="btn ghost" type="button" id="winClose">看看棋盘</button>' +
      (canAgain ? '<button class="btn primary" type="button" id="winAgain">再来一局</button>' : '') +
      '</div></div>';
    layer.classList.remove('hidden');

    const close = $('winClose');
    if (close) close.addEventListener('click', () => layer.classList.add('hidden'));
    const again = $('winAgain');
    if (again) again.addEventListener('click', () => {
      layer.classList.add('hidden');
      if (localMode) {
        const st = cfg.engine.createInitial(state.players.map((p) => ({ id: p.id, name: p.name })));
        st.hostId = state.hostId;
        setState(st);
        return;
      }
      send({ type: 'restart' });
    });
  }

  /* ---------------- 开始面板 ---------------- */
  function openStartPanel(prefillCode) {
    const panel = $('startPanel');
    if (!panel) return;
    panel.innerHTML =
      '<div class="sheetCard">' +
      '<h2>' + esc(cfg.title) + '</h2>' +
      '<p class="sub">' + cfg.blurb + '</p>' +
      '<label class="field"><span>你的昵称</span>' +
      '<input id="spNick" maxlength="12" placeholder="例如 阿蒙" value="' + esc(nickname) + '"></label>' +
      '<div class="actions"><button class="btn primary" type="button" id="spCreate">创建房间</button></div>' +
      '<label class="field" style="margin-top:14px"><span>邀请码（加入时填）</span>' +
      '<input id="spCode" maxlength="5" placeholder="5 位，如 K7M2Q" value="' + esc(prefillCode || '') + '"></label>' +
      '<div class="actions">' +
      '<button class="btn ghost" type="button" id="spJoin">加入房间</button>' +
      '<button class="btn sm ghost" type="button" id="spLocal">本机试玩</button>' +
      '</div>' +
      '<p class="sub" style="margin:14px 0 0">' +
      '· 联机需要 Supabase 配置可用；本机试玩不联网，几个座位在同一台设备轮流操作。</p>' +
      '</div>';
    panel.classList.remove('hidden');

    const nickEl = $('spNick');
    const codeEl = $('spCode');
    nickEl.focus();
    codeEl.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    $('spCreate').addEventListener('click', () => {
      const nick = readNick();
      if (!nick) return;
      doCreate(nick);
    });
    $('spJoin').addEventListener('click', () => {
      const nick = readNick();
      if (!nick) return;
      const c = (codeEl.value || '').trim().toUpperCase();
      if (c.length !== 5) { toast('邀请码是 5 位', true); return; }
      doJoin(c);
    });
    $('spLocal').addEventListener('click', () => {
      const nick = readNick();
      if (!nick) return;
      panel.classList.add('hidden');
      startLocal(cfg.max);
    });
    codeEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('spJoin').click(); });
  }

  function readNick() {
    const v = ($('spNick').value || '').trim().slice(0, 12);
    if (!v) { toast('先填个昵称', true); $('spNick').focus(); return ''; }
    nickname = v;
    Net.setName(v);
    return v;
  }

  async function doCreate(nick) {
    if (!Net.CONFIG_OK || !Net.hasClient) { toast('Supabase 还没配置好，先用本机试玩', true); return; }
    try {
      const seed = {
        game: cfg.game,
        phase: 'lobby',
        hostId: baseId,
        players: [{ id: baseId, name: nick }],
        logs: ['房间已建立，等朋友加入'],
        createdAt: Date.now()
      };
      const c = await Net.createRoom(seed);
      code = c;
      $('startPanel').classList.add('hidden');
      Net.subscribe(c, (st) => setState(st), onStatus);
      setState(seed);
    } catch (e) {
      toast(e.message || '创建失败', true);
    }
  }

  async function doJoin(c) {
    if (!Net.CONFIG_OK || !Net.hasClient) { toast('Supabase 还没配置好，先用本机试玩', true); return; }
    try {
      const row = await Net.joinRoom(c);
      const st = row.state;
      if (!st || st.game !== cfg.game) throw new Error('这个邀请码不是「' + cfg.title + '」的房间');
      code = c;
      $('startPanel').classList.add('hidden');

      const joined = (st.players || []).some((p) => p.id === baseId);
      if (!joined) {
        if (st.phase !== 'lobby') throw new Error('这局已经开始了，等下一局吧');
        if (st.players.length >= cfg.max) throw new Error('房间满了（最多 ' + cfg.max + ' 人）');
        await Net.mutate((s) => {
          s.players.push({ id: baseId, name: nickname || ('玩家' + (s.players.length + 1)) });
          s.logs = (s.logs || []).concat((nickname || '玩家') + ' 加入了房间');
          if (s.logs.length > 24) s.logs = s.logs.slice(-24);
          return s;
        });
      }

      Net.subscribe(c, (st2) => setState(st2), onStatus);
      const fresh = await Net.fetchRoom(c);
      setState(fresh.state);
    } catch (e) {
      toast(e.message || '加入失败', true);
      openStartPanel(c);
    }
  }

  function onStatus(status) {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      toast('实时连接断开，正在重连…', true);
    }
  }

  /* ---------------- 本机热座 ---------------- */
  function startLocal(seats) {
    localMode = true;
    code = null;
    const players = [];
    const n = Math.max(cfg.min, Math.min(cfg.max, seats || cfg.max));
    for (let i = 0; i < n; i++) players.push({ id: 'L' + (i + 1), name: '玩家 ' + (i + 1) });
    const st = cfg.engine.createInitial(players);
    st.hostId = players[0].id;
    st.logs = ['本机热座：' + n + ' 人轮流操作'].concat(st.logs || []);
    setState(st);
  }

  /* ---------------- 规则查看 ---------------- */
  function installRules() {
    const bar = document.querySelector('.topbar');
    if (bar && !$('btnRules')) {
      const b = document.createElement('button');
      b.className = 'icon-btn';
      b.id = 'btnRules';
      b.type = 'button';
      b.setAttribute('aria-label', '查看规则');
      b.title = '查看规则';
      b.textContent = '?';
      const log = $('btnLog');
      if (log && log.parentNode === bar) bar.insertBefore(b, log);
      else bar.appendChild(b);
      b.addEventListener('click', () => {
        if (!$('rulesSheet')) buildRulesSheet();
        $('rulesSheet').classList.remove('hidden');
      });
    }
    if (!document.getElementById('rulesStyle')) {
      const style = document.createElement('style');
      style.id = 'rulesStyle';
      style.textContent =
        '.rulesBody{margin-top:6px;display:grid;gap:12px}' +
        '.rulesBody section h3{margin:0 0 5px;font-size:13px;letter-spacing:.5px;color:#8a7451}' +
        '.rulesBody section ul{margin:0;padding-left:18px;display:grid;gap:5px}' +
        '.rulesBody section li{font-size:13px;line-height:1.55;color:#4a4453}' +
        '.rulesBody section li b{color:#c86a2c}' +
        '.rulesBody .none{font-size:12px;color:#8d7a5c}';
      document.head.appendChild(style);
    }
  }

  function buildRulesSheet() {
    const sheet = document.createElement('div');
    sheet.className = 'sheet hidden';
    sheet.id = 'rulesSheet';
    const card = document.createElement('div');
    card.className = 'sheetCard';
    card.innerHTML =
      '<h2>' + esc(cfg.title || '') + ' · 规则</h2>' +
      '<p class="sub">' + esc(cfg.blurb || '') + '</p>' +
      '<div class="rulesBody"></div>' +
      '<div class="actions"><button class="btn ghost" type="button" id="rulesClose">收起</button></div>';
    sheet.appendChild(card);
    ($('app') || document.body).appendChild(sheet);

    const body = card.querySelector('.rulesBody');
    (cfg.rules || []).forEach((sec) => {
      const s = document.createElement('section');
      const h = document.createElement('h3');
      h.textContent = sec.h;
      s.appendChild(h);
      const ul = document.createElement('ul');
      (sec.items || []).forEach((it) => {
        const li = document.createElement('li');
        li.innerHTML = it;
        ul.appendChild(li);
      });
      s.appendChild(ul);
      body.appendChild(s);
    });
    if (!body.children.length) {
      const p = document.createElement('div');
      p.className = 'none';
      p.textContent = '这一款的细则就以上面这段为准。';
      body.appendChild(p);
    }

    const close = () => sheet.classList.add('hidden');
    card.querySelector('#rulesClose').addEventListener('click', close);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
  }

  /* ---------------- 启动 ---------------- */
  function boot(c) {
    cfg = c;
    document.title = c.title + ' · 萌趣街区';
    const app = $('app');
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'desktop') app.classList.add('force-desktop');

    const back = $('btnHome');
    if (back) back.addEventListener('click', () => { location.href = '../index.html'; });
    const logBtn = $('btnLog');
    if (logBtn) logBtn.addEventListener('click', () => $('logSheet').classList.remove('hidden'));
    const logClose = $('logClose');
    if (logClose) logClose.addEventListener('click', () => $('logSheet').classList.add('hidden'));

    $('logSheet').addEventListener('click', (e) => {
      if (e.target === $('logSheet')) $('logSheet').classList.add('hidden');
    });

    if (cfg.onMount) cfg.onMount();
    installRules();

    setInterval(() => { if (!localMode && state) renderSeats(); }, 5000);

    const room = (params.get('room') || '').trim().toUpperCase();
    if (params.get('local') === '1' || params.get('seats')) {
      startLocal(Number(params.get('seats')) || cfg.max);
      return;
    }
    if (room) { doJoin(room); return; }
    openStartPanel('');
  }

  return {
    boot: boot,
    send: send,
    toast: toast,
    getState: () => state,
    getCode: () => code,
    isLocal: () => localMode
  };
})();

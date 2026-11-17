/* ============================================================
   入口：视图切换、房间生命周期、动作派发
   ============================================================ */

(function () {
  const E = window.MonoEngine;
  const D = window.MonoData;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  let myId = window.Net.identity.id;
  let view = 'lobby';
  let curState = null;
  let gameId = 'monopoly';
  let uiMounted = false;
  let idleSince = Date.now();       // 当前状态最后一次变化的时间
  const SKIP_GRACE_MS = 30000;      // 轮到某人后 30 秒没动静且对方不在线，就跳过

  /* ---------------- 视图 ---------------- */
  // 大富翁交给 board-q.html；其余桌游各自有独立页面，房间生命周期由页面自己接管。
  const TABLE_PAGES = {
    monopoly: 'design/board-q.html',
    ludo: 'design/ludo.html',
    snakes: 'design/snakes.html',
    gomoku: 'design/gomoku.html',
    reversi: 'design/reversi.html',
    connect4: 'design/connect4.html',
    jump: 'design/jump.html',
    uno: 'design/uno.html'
  };

  function gotoTablePage(code, game) {
    const g = game || gameId || 'monopoly';
    const page = TABLE_PAGES[g] || TABLE_PAGES.monopoly;
    location.href = page + (code ? ('?room=' + encodeURIComponent(code)) : '');
  }

  function show(name) {
    ['lobby', 'room', 'table'].forEach((n) => {
      $('view-' + n).classList.toggle('hidden', n !== name);
    });
    view = name;
  }

  function toast(msg, bad) {
    if (window.MonoUI) window.MonoUI.toast(msg, bad);
    else console.warn(msg);
  }

  function openModal(html) {
    $('modal-box').innerHTML = html;
    $('modal').classList.remove('hidden');
  }

  function closeModal() {
    $('modal').classList.add('hidden');
  }

  function paintWho() {
    $('who-line').textContent = window.Net.identity.name || '';
  }

  /* ---------------- 大厅 ---------------- */
  function pickGame(g) {
    if (!window.Net.CONFIG_OK) {
      toast('先在 js/config.js 填好 Supabase 的 url 和 key', true);
      return;
    }
    gameId = g.id;

    // 飞行棋 / 蛇梯棋 / 五子棋：页面自带建房与加入面板，直接跳过去
    if (g.id !== 'monopoly') {
      location.href = TABLE_PAGES[g.id] || 'design/board-q.html';
      return;
    }

    const savedName = window.Net.identity.name || '';

    openModal(
      '<h3>' + esc(g.name) + '</h3>' +
      '<p class="sub">建一个新房间，或用朋友发来的邀请码加入</p>' +
      '<label class="field"><span>你的昵称</span>' +
      '<input type="text" id="set-nick" maxlength="12" placeholder="例如 阿蒙" value="' + esc(savedName) + '"></label>' +
      '<label class="field"><span>邀请码（加入时填）</span>' +
      '<input type="text" id="set-code" maxlength="5" placeholder="5 位，如 K7M2Q"></label>' +
      '<div class="modal-actions">' +
      '<button class="btn primary" id="go-create">创建房间</button>' +
      '<button class="btn" id="go-join">加入房间</button>' +
      '</div>'
    );

    $('set-nick').focus();

    $('set-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    $('go-create').addEventListener('click', () => {
      const nick = readNick();
      if (!nick) return;
      closeModal();
      doCreate(nick);
    });

    $('go-join').addEventListener('click', () => {
      const nick = readNick();
      if (!nick) return;
      const code = ($('set-code').value || '').trim().toUpperCase();
      if (code.length !== 5) { toast('邀请码是 5 位', true); return; }
      closeModal();
      doJoin(code, nick);
    });

    $('set-code').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') $('go-join').click();
    });
  }

  function readNick() {
    const v = ($('set-nick').value || '').trim().slice(0, 12);
    if (!v) { toast('先填个昵称', true); document.getElementById('set-nick').focus(); return ''; }
    window.Net.setName(v);
    paintWho();
    return v;
  }

  /* ---------------- 建房 / 加入 ---------------- */
  async function doCreate(nick) {
    try {
      const seed = {
        game: gameId,
        phase: 'lobby',
        hostId: myId,
        players: [{ id: myId, name: nick }],
        logs: ['房间已建立，等朋友加入'],
        createdAt: Date.now()
      };
      const code = await window.Net.createRoom(seed);
      localStorage.setItem('mbg:room', code);
      window.Net.subscribe(code, onState, onStatus);
      curState = seed;
      paintRoom(seed);
      show('room');
      gotoTablePage(code);
    } catch (e) {
      toast(e.message || '创建失败', true);
    }
  }

  async function doJoin(code, nick) {
    try {
      const row = await window.Net.joinRoom(code);
      const st = row.state;
      if (!st || !st.game) throw new Error('房间数据异常');
      gameId = st.game;

      const inRoom = st.players.some((p) => p.id === myId);
      if (!inRoom) {
        if (st.phase === 'playing' || st.phase === 'ended') throw new Error('这局已经开始了，等下一局吧');
        if (st.players.length >= 4) throw new Error('房间满了（最多 4 人）');
        await window.Net.mutate((s) => {
          s.players.push({ id: myId, name: nick });
          s.logs = (s.logs || []).concat(nick + ' 加入了房间');
          if (s.logs.length > 20) s.logs = s.logs.slice(-20);
          return s;
        });
      }

      localStorage.setItem('mbg:room', code);
      window.Net.subscribe(code, onState, onStatus);

      const fresh = await window.Net.fetchRoom(code);
      onState(fresh.state, fresh.version);
      gotoTablePage(code);
    } catch (e) {
      localStorage.removeItem('mbg:room');
      toast(e.message || '加入失败', true);
    }
  }

  /* ---------------- 状态回调 ---------------- */
  function onState(state) {
    curState = state;
    idleSince = Date.now();
    if (!state) return;

    // 自己是否被房主移出对局
    const me = (state.players || []).find((p) => p.id === myId);

    if (state.phase === 'playing' || state.phase === 'ended') {
      openTable();
      window.MonoUI.render(state, myId);
    } else {
      paintRoom(state);
      show('room');
    }

    if (me && me.kicked && (state.phase === 'playing' || state.phase === 'ended')) {
      toast('你已被房主移出对局', true);
      leaveRoom();
    }
  }

  function onStatus(status) {
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      toast('实时连接断开，正在重连…', true);
    }
  }

  /* ---------------- 房间等待界面 ---------------- */
  function paintRoom(state) {
    $('room-code').textContent = window.Net.getCode() || '—';

    const g = window.Lobby.findById(state.game);
    $('room-game-name').textContent = g ? g.name : '对局';

    const list = $('seat-list');
    list.innerHTML = '';

    const colors = D.COLORS;
    state.players.forEach((p, i) => {
      const li = document.createElement('li');
      li.className = 'seat';

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = colors[i % colors.length];
      li.appendChild(dot);

      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.innerHTML = esc(p.name) +
        (p.id === state.hostId ? '<em>房主</em>' : '') +
        (p.id === myId ? '<em>你</em>' : '');
      li.appendChild(nm);

      // 房主在等待页就能把占位不动的人请出去
      if (state.hostId === myId && p.id !== myId) {
        const kick = document.createElement('button');
        kick.className = 'mini kick';
        kick.type = 'button';
        kick.textContent = '移出';
        kick.addEventListener('click', () => {
          if (kick.dataset.arm === '1') {
            kick.dataset.arm = '';
            window.Net.mutate((s) => {
              const r = E.act(s, { type: 'kick', target: p.id }, myId, Math.random);
              if (!r.ok) { toast(r.msg || '移出失败', true); return null; }
              return r.state;
            }).catch((e) => toast(e.message || '移出失败', true));
            return;
          }
          kick.dataset.arm = '1';
          kick.textContent = '确认移出？';
          setTimeout(() => {
            if (kick.isConnected) { kick.dataset.arm = ''; kick.textContent = '移出'; }
          }, 8000);
        });
        li.appendChild(kick);
      }

      list.appendChild(li);
    });

    for (let k = state.players.length; k < 4; k++) {
      const li = document.createElement('li');
      li.className = 'seat empty';
      li.textContent = '等待加入…';
      list.appendChild(li);
    }

    const isHost = state.hostId === myId;
    const btn = $('btn-start');
    btn.classList.toggle('hidden', !isHost);
    btn.disabled = state.players.length < 2;

    $('room-hint').textContent = isHost
      ? (state.players.length < 2
          ? '把邀请码发给朋友，至少 2 人才能开始'
          : (state.players.length >= 4 ? '人满了，可以开始了' : '人齐了就点开始，也可以再多等几位'))
      : '等房主开始…';
  }

  /* ---------------- 牌桌 ---------------- */
  function openTable() {
    if (view !== 'table') {
      show('table');
    }
    if (!uiMounted) {
      window.MonoUI.mount({
        board: $('board'),
        canvas: $('fx'),
        onAction: dispatch
      });
      uiMounted = true;
      window.addEventListener('resize', () => window.MonoScene.resize());
    }
  }

  function dispatch(action) {
    if (!curState) return;
    window.Net.mutate((st) => {
      if (st.phase === 'ended') return null;
      const r = E.act(st, action, myId, Math.random);
      if (!r.ok) {
        toast(r.msg || '这一步不能这么做', true);
        return null;
      }
      return r.state;
    }).catch((e) => toast(e.message || '同步失败', true));
  }

  /* ---------------- 掉线自动跳过 ---------------- */
  // 判断依据是 Realtime Presence：对方既不在线，这个状态又静止了 30 秒，就替他跳过。
  // presence 还没建立起来（刚进房间）时一律不跳过，避免误伤。
  function autoSkipTick() {
    if (!curState || curState.phase !== 'playing') { idleSince = Date.now(); return; }
    if (!window.Net.hasClient || !window.Net.presenceActive()) { idleSince = Date.now(); return; }

    const p = curState.players[curState.turn];
    if (!p || p.bankrupt) { idleSince = Date.now(); return; }
    if (p.id === myId) { idleSince = Date.now(); return; }
    if (window.Net.isOnline(p.id)) { idleSince = Date.now(); return; }
    if (Date.now() - idleSince < SKIP_GRACE_MS) return;

    idleSince = Date.now();
    dispatch({ type: 'skipTurn' });
  }

  /* ---------------- 开局 ---------------- */
  function startGame() {
    window.Net.mutate((st) => {
      if (st.phase !== 'lobby') return null;
      if (st.hostId !== myId) { toast('只有房主能开始', true); return null; }
      if (st.players.length < 2) { toast('至少 2 人才能开始', true); return null; }

      const init = E.createInitial(
        st.players.map((p) => ({ id: p.id, name: p.name })),
        Math.random
      );
      init.hostId = st.hostId;
      return init;
    }).catch((e) => toast(e.message || '开局失败', true));
  }

  /* ---------------- 离开 / 复制 ---------------- */
  function leaveRoom() {
    window.Net.leave();
    localStorage.removeItem('mbg:room');
    curState = null;
    show('lobby');
  }

  function copyCode() {
    const code = window.Net.getCode();
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
    try { document.execCommand('copy'); toast('邀请码已复制：' + text); }
    catch (e) { toast('复制失败，请手动记下：' + text, true); }
    document.body.removeChild(ta);
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    paintWho();

    window.Lobby.render(pickGame);

    if (!window.Net.CONFIG_OK) {
      $('cfg-warn').classList.remove('hidden');
    }

    $('btn-start').addEventListener('click', startGame);
    $('btn-leave').addEventListener('click', leaveRoom);
    $('btn-quit').addEventListener('click', leaveRoom);
    $('btn-copy').addEventListener('click', copyCode);

    setInterval(autoSkipTick, 5000);

    $('modal').addEventListener('click', (e) => {
      if (e.target === $('modal')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });

    // 刷新后自动回到原房间
    const saved = localStorage.getItem('mbg:room');
    if (saved && window.Net.CONFIG_OK) {
      try {
        const row = await window.Net.joinRoom(saved);
        const inRoom = row.state && row.state.players &&
          row.state.players.some((p) => p.id === myId);
        if (inRoom) {
          gameId = row.state.game;
          window.Net.leave();
          gotoTablePage(saved);
          return;
        } else {
          localStorage.removeItem('mbg:room');
        }
      } catch (e) {
        localStorage.removeItem('mbg:room');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

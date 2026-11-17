/* ============================================================
   大富翁 · 界面层
   负责：画盘子、玩家卡、操作按钮、拍卖/交易/格子详情弹窗
   ============================================================ */

window.MonoUI = (function () {
  const D = window.MonoData;
  const E = window.MonoEngine;
  const T = D.TILES;

  let el = {};
  let tiles = [];
  let myId = '';
  let curState = null;
  let send = function () {};

  const $ = (id) => document.getElementById(id);
  const fmt = (v) => '$' + Number(v).toLocaleString('en-US');
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /* 11×11 外圈坐标 */
  function ringPos(i) {
    if (i <= 10) return { r: 11, c: 11 - i };
    if (i <= 20) return { r: 11 - (i - 10), c: 1 };
    if (i <= 30) return { r: 1, c: 1 + (i - 20) };
    return { r: 1 + (i - 30), c: 11 };
  }

  function me() { return curState ? curState.players.find((p) => p.id === myId) : null; }
  function turnPlayer() { return curState ? curState.players[curState.turn] : null; }
  function isMyTurn() {
    const p = turnPlayer();
    return !!(p && p.id === myId && !p.bankrupt);
  }

  /* ---------------- 弹窗 ---------------- */
  function openModal(html) {
    $('modal-box').innerHTML = html;
    $('modal').classList.remove('hidden');
  }

  function closeModal() {
    $('modal').classList.add('hidden');
  }

  function doAction(a) {
    closeModal();
    send(a);
  }

  /* ---------------- 建格子 ---------------- */
  function buildTiles() {
    el.board.querySelectorAll('.tile').forEach((n) => n.remove());
    tiles = [];

    T.forEach((t, i) => {
      const pos = ringPos(i);
      const node = document.createElement('div');
      node.className = 'tile';
      node.dataset.i = String(i);
      node.style.gridRow = String(pos.r);
      node.style.gridColumn = String(pos.c);

      const special = ['go', 'jail', 'free', 'gotojail'].indexOf(t.type) >= 0;
      if (special) node.classList.add('corner');
      if (t.type === 'chance') node.classList.add('chance');
      if (t.type === 'chest') node.classList.add('chest');
      if (t.type === 'tax') node.classList.add('tax');
      if (t.type === 'gotojail') node.classList.add('gotojail');
      if (t.type === 'free') node.classList.add('free');
      if (t.type === 'jail') node.classList.add('jail');

      let barColor = null;
      if (t.group) barColor = D.GROUPS[t.group].color;
      else if (t.type === 'rail') barColor = '#5b6570';
      else if (t.type === 'util') barColor = '#8e9aa6';

      if (barColor) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.background = barColor;
        node.appendChild(bar);
      }

      const body = document.createElement('div');
      body.className = 'body';
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = t.name;
      body.appendChild(nm);
      if (t.price) {
        const price = document.createElement('span');
        price.className = 'price';
        price.textContent = fmt(t.price);
        body.appendChild(price);
      }
      node.appendChild(body);

      node.addEventListener('click', () => openTileInfo(i));

      el.board.appendChild(node);
      tiles.push(node);
    });
  }

  /* ---------------- 刷新格子 ---------------- */
  function paintTiles(state) {
    T.forEach((t, i) => {
      const node = tiles[i];
      if (!node) return;

      let dot = node.querySelector('.owner-dot');
      let mort = node.querySelector('.mort');
      const pr = state.props[i];

      if (pr && pr.owner) {
        const owner = state.players.find((p) => p.id === pr.owner);
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'owner-dot';
          node.appendChild(dot);
        }
        dot.style.background = owner ? owner.color : '#888';
      } else if (dot) {
        dot.remove();
      }

      if (pr && pr.mortgaged) {
        if (!mort) {
          mort = document.createElement('div');
          mort.className = 'mort';
          node.appendChild(mort);
        }
      } else if (mort) {
        mort.remove();
      }
    });
  }

  /* ---------------- 玩家卡 ---------------- */
  function paintPlayers(state) {
    el.players.innerHTML = '';
    const curP = state.players[state.turn];

    state.players.forEach((p) => {
      const card = document.createElement('div');
      card.className = 'pcard';
      if (curP && p.id === curP.id && state.phase !== 'ended') card.classList.add('active');
      if (p.bankrupt) card.classList.add('out');

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;

      const box = document.createElement('div');
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = p.name + (p.id === myId ? '（你）' : '');

      const meta = document.createElement('div');
      meta.className = 'meta';
      const propCount = E.propsOf(state, p.id).length;
      const bits = [propCount + ' 块地产'];
      if (p.inJail) bits.push('狱中');
      if (p.cards > 0) bits.push('出狱卡 ×' + p.cards);
      if (p.kicked) bits.push('被移出');
      else if (p.bankrupt) bits.push('已出局');
      else if (p.id !== myId && window.Net && window.Net.isOnline && !window.Net.isOnline(p.id)) {
        bits.push('离线');
      }
      meta.textContent = bits.join(' · ');

      box.appendChild(nm);
      box.appendChild(meta);

      const money = document.createElement('div');
      money.className = 'money';
      money.textContent = fmt(p.money);

      card.appendChild(dot);
      card.appendChild(box);
      card.appendChild(money);

      // 房主可以把别的玩家移出对局（两步确认，不弹系统对话框）
      if (state.hostId === myId && p.id !== myId && !p.bankrupt && state.phase !== 'ended') {
        const kick = document.createElement('button');
        kick.className = 'mini kick';
        kick.type = 'button';
        kick.textContent = '移出';
        kick.addEventListener('click', () => {
          if (kick.dataset.arm === '1') {
            kick.dataset.arm = '';
            doAction({ type: 'kick', target: p.id });
            return;
          }
          kick.dataset.arm = '1';
          kick.textContent = '确认移出？';
          setTimeout(() => {
            if (kick.isConnected) {
              kick.dataset.arm = '';
              kick.textContent = '移出';
            }
          }, 8000);
        });
        card.appendChild(kick);
      }

      el.players.appendChild(card);
    });
  }

  /* ---------------- 顶部状态 ---------------- */
  function paintTurnbar(state) {
    const box = el.turnbar;
    box.innerHTML = '';

    const p = turnPlayer();
    if (state.phase === 'ended') {
      const w = state.players.find((x) => x.id === state.winner);
      box.style.borderLeftColor = w ? w.color : '#ccc';
      box.innerHTML = '<div class="tb-k">本局结束</div><div class="tb-main">' +
        (w ? w.name + ' 赢了' : '平局') + '</div>';
      return;
    }

    box.style.borderLeftColor = p ? p.color : '#ccc';

    const k = document.createElement('div');
    k.className = 'tb-k';
    k.textContent = '当前行动';

    const main = document.createElement('div');
    main.className = 'tb-main';
    main.textContent = p ? p.name + (p.id === myId ? '（你）' : '') : '—';

    const sub = document.createElement('div');
    sub.className = 'tb-sub';
    sub.textContent = phaseText(state, p);

    box.appendChild(k);
    box.appendChild(main);
    box.appendChild(sub);

    if (state.card) {
      const banner = document.createElement('div');
      banner.className = 'card-banner';
      banner.innerHTML = '<b>' + (state.card.deck === 'chance' ? '机会' : '命运') + '</b>：' +
        state.card.text;
      el.actions.appendChild(banner);
    }
  }

  function phaseText(state, p) {
    if (!p) return '';
    if (state.auction) {
      const a = state.auction;
      const cur = state.players.find((x) => x.id === a.queue[a.i]);
      return '正在拍卖 ' + T[a.ti].name + '，等 ' + (cur ? cur.name : '') + ' 出价';
    }
    if (state.trade) {
      const to = state.players.find((x) => x.id === state.trade.toId);
      return '有一笔交易等 ' + (to ? to.name : '') + ' 回应';
    }
    switch (state.turnPhase) {
      case 'awaitRoll':
        if (p.inJail) return '在监狱里，第 ' + (p.jailTurns + 1) + ' 次尝试（掷双骰才能出来）';
        return '等待掷骰子';
      case 'awaitBuy':
        return '停在了 ' + T[p.pos].name + '，可以买下';
      case 'awaitAuction':
        return '拍卖进行中';
      case 'awaitEnd':
        return '可以建房、抵押、交易，或结束回合';
      default:
        return '';
    }
  }

  /* ---------------- 操作区 ---------------- */
  function btn(label, cls, onClick, disabled) {
    const b = document.createElement('button');
    b.className = 'btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    if (disabled) b.disabled = true;
    b.addEventListener('click', onClick);
    return b;
  }

  function hintLine(text) {
    const d = document.createElement('div');
    d.className = 'hint-line';
    d.textContent = text;
    return d;
  }

  function paintActions(state) {
    // 卡牌横幅要保留在顶部
    const banner = el.actions.querySelector('.card-banner');
    el.actions.innerHTML = '';
    if (banner) el.actions.appendChild(banner);

    if (state.phase === 'ended') return;

    // 1. 拍卖优先级最高（可能轮到任何人出价）
    if (state.auction) { paintAuction(state); return; }

    // 2. 交易回应
    if (state.trade) {
      if (state.trade.toId === myId) {
        el.actions.appendChild(hintLine(
          '对方想用 ' + (state.trade.offerTiles.length ? state.trade.offerTiles.length + ' 块地' : '') +
          (state.trade.offerCash ? ' + ' + fmt(state.trade.offerCash) : '') + ' 换你的条件'));
        el.actions.appendChild(btn('接受交易', 'primary', () => doAction({ type: 'tradeRespond', accept: true })));
        el.actions.appendChild(btn('拒绝', '', () => doAction({ type: 'tradeRespond', accept: false })));
        return;
      }
      if (state.trade.fromId === myId) {
        el.actions.appendChild(hintLine('交易请求已发出，等对方回应…'));
        el.actions.appendChild(btn('取消交易', 'small', () => doAction({ type: 'tradeCancel' })));
        return;
      }
    }

    if (!isMyTurn()) {
      const p = turnPlayer();
      el.actions.appendChild(hintLine('等 ' + (p ? p.name : '对手') + ' 行动'));
      el.actions.appendChild(btn('发起交易', 'small', openTrade));
      return;
    }

    const m = me();

    if (state.turnPhase === 'awaitRoll') {
      if (m.inJail) {
        el.actions.appendChild(btn('掷骰子求双骰', 'primary', () => doAction({ type: 'roll' })));
        el.actions.appendChild(btn('缴 ' + fmt(E.JAIL_BAIL) + ' 保释', '', () => doAction({ type: 'jailPay' }),
          m.money < E.JAIL_BAIL));
        if (m.cards > 0) {
          el.actions.appendChild(btn('用出狱卡', '', () => doAction({ type: 'jailCard' })));
        }
      } else {
        el.actions.appendChild(btn('掷骰子', 'primary', () => doAction({ type: 'roll' })));
      }
      el.actions.appendChild(btn('发起交易', 'small', openTrade));

    } else if (state.turnPhase === 'awaitBuy') {
      const t = T[m.pos];
      el.actions.appendChild(btn('买下 ' + t.name + ' · ' + fmt(t.price), 'primary',
        () => doAction({ type: 'buy' }), m.money < t.price));
      el.actions.appendChild(btn('不买，拿去拍卖', '', () => doAction({ type: 'decline' })));
      el.actions.appendChild(hintLine('点棋盘上的格子可以查租金'));

    } else if (state.turnPhase === 'awaitEnd') {
      el.actions.appendChild(btn('结束回合', 'primary', () => doAction({ type: 'endTurn' })));
      el.actions.appendChild(btn('发起交易', 'small', openTrade));
      el.actions.appendChild(hintLine('点自己的地产可以建房 / 抵押'));

    } else if (state.turnPhase === 'awaitAuction') {
      el.actions.appendChild(hintLine('拍卖进行中…'));
    }
  }

  function paintAuction(state) {
    const a = state.auction;
    const box = document.createElement('div');
    box.className = 'auc-box';

    const title = document.createElement('div');
    title.className = 'auc-title';
    title.textContent = '拍卖：' + T[a.ti].name + '（原价 ' + fmt(T[a.ti].price) + '）';

    const price = document.createElement('div');
    price.className = 'auc-price';
    price.textContent = a.bid > 0 ? fmt(a.bid) : '暂无出价';

    const who = document.createElement('div');
    who.className = 'auc-who';
    const leader = a.leader ? state.players.find((x) => x.id === a.leader) : null;
    who.textContent = leader ? '当前最高：' + leader.name : '还没有人出价';

    box.appendChild(title);
    box.appendChild(price);
    box.appendChild(who);

    const bidderId = a.queue[a.i];
    const bidder = state.players.find((x) => x.id === bidderId);

    if (bidderId === myId) {
      const row = document.createElement('div');
      row.className = 'auc-input';

      const input = document.createElement('input');
      input.type = 'number';
      input.min = String(a.bid + 10);
      input.step = '10';
      input.value = String(a.bid + 10);
      input.id = 'bid-input';

      const go = btn('出价', 'primary small', () => {
        const v = Number($('bid-input').value);
        doAction({ type: 'bid', amount: v });
      });
      row.appendChild(input);
      row.appendChild(go);
      box.appendChild(row);

      box.appendChild(btn('放弃竞拍', 'small', () => doAction({ type: 'auctionPass' })));
    } else {
      const line = document.createElement('div');
      line.className = 'auc-who';
      line.textContent = '等 ' + (bidder ? bidder.name : '') + ' 出价（最低 ' + fmt(a.bid + 10) + '）';
      box.appendChild(line);
    }

    el.actions.appendChild(box);
  }

  /* ---------------- 日志 ---------------- */
  function paintLog(state) {
    el.log.innerHTML = '';
    const logs = (state.logs || []).slice(-14);
    for (let i = logs.length - 1; i >= 0; i--) {
      const li = document.createElement('li');
      li.textContent = logs[i];
      if (i === logs.length - 1) li.className = 'fresh';
      el.log.appendChild(li);
    }
  }

  /* ---------------- 格子详情 ---------------- */
  function openTileInfo(i) {
    const state = curState;
    if (!state) return;
    const t = T[i];
    const pr = state.props[i];
    const owner = pr && pr.owner ? state.players.find((p) => p.id === pr.owner) : null;

    let rows = '';

    if (t.type === 'prop') {
      rows += row('价格', fmt(t.price));
      rows += row('基础租金', fmt(t.rent[0]));
      rows += row('1 栋房 / 2 栋 / 3 栋', fmt(t.rent[1]) + ' / ' + fmt(t.rent[2]) + ' / ' + fmt(t.rent[3]));
      rows += row('4 栋房 / 旅馆', fmt(t.rent[4]) + ' / ' + fmt(t.rent[5]));
      rows += row('每栋造价', fmt(t.house));
      rows += row('整组垄断', '租金翻倍（未建房时）');
    } else if (t.type === 'rail') {
      rows += row('价格', fmt(t.price));
      rows += row('1/2/3/4 座车站', '$25 / $50 / $100 / $200');
    } else if (t.type === 'util') {
      rows += row('价格', fmt(t.price));
      rows += row('持有 1 家 / 2 家', '按骰点 4 倍 / 10 倍');
    } else if (t.type === 'tax') {
      rows += row('缴纳', fmt(t.tax));
    } else {
      rows += row('说明', t.note || '—');
    }

    if (pr) {
      rows += row('当前主人', owner ? esc(owner.name) : '银行');
      if (pr.houses > 0) rows += row('建筑', pr.houses === 5 ? '旅馆' : pr.houses + ' 栋房子');
      rows += row('状态', pr.mortgaged ? '已抵押' : '正常');
      if (owner && owner.id === myId) {
        rows += row('抵押可得', fmt(E.mortgageValue(i)));
        if (pr.mortgaged) rows += row('赎回花费', fmt(Math.ceil(E.mortgageValue(i) * 1.1)));
      }
    }

    let actions = '<button class="btn" onclick="MonoUI.close()">关闭</button>';

    if (owner && owner.id === myId && isMyTurn() && pr) {
      let extra = '';

      if (t.type === 'prop' && !pr.mortgaged) {
        const chk = E.canBuild(state, i);
        const canDo = chk.ok && me().money >= t.house;
        extra += '<button class="btn small" data-a="build" data-i="' + i + '"' +
          (canDo ? '' : ' disabled') + '>建房 ' + fmt(t.house) + '</button>';
        if (pr.houses > 0) {
          extra += '<button class="btn small" data-a="sellHouse" data-i="' + i + '">拆房回收</button>';
        }
      }
      if (pr.houses === 0 && !pr.mortgaged) {
        extra += '<button class="btn small" data-a="mortgage" data-i="' + i + '">抵押</button>';
      }
      if (pr.mortgaged) {
        extra += '<button class="btn small" data-a="unmortgage" data-i="' + i + '">赎回</button>';
      }

      if (extra) {
        actions = '<div class="modal-actions" style="flex-wrap:wrap">' + extra +
          '<button class="btn small" data-a="close">关闭</button></div>';
      }
    }

    openModal(
      '<h3>' + t.name + '</h3>' +
      '<p class="sub">' + (t.group ? D.GROUPS[t.group].name + '组' : typeName(t.type)) + '</p>' +
      '<div class="modal-rows">' + rows + '</div>' +
      (actions.indexOf('modal-actions') >= 0 ? actions :
        '<div class="modal-actions">' + actions + '</div>')
    );

    // 绑定格子操作
    $('modal-box').querySelectorAll('[data-a]').forEach((b) => {
      b.addEventListener('click', () => {
        const a = b.dataset.a;
        if (a === 'close') { closeModal(); return; }
        doAction({ type: a, tile: Number(b.dataset.i) });
      });
    });
  }

  function row(k, v) {
    return '<div class="mrow"><span>' + k + '</span><b>' + v + '</b></div>';
  }

  function typeName(type) {
    return {
      go: '起点', jail: '监狱', free: '免费停车', gotojail: '入狱',
      chance: '机会', chest: '命运', tax: '税费', rail: '车站', util: '公用事业'
    }[type] || '';
  }

  /* ---------------- 交易表单 ---------------- */
  function openTrade() {
    const state = curState;
    if (!state || !isMyTurn()) { toast('只能在自己的回合发起交易'); return; }

    const others = state.players.filter((p) => p.id !== myId && !p.bankrupt);
    if (!others.length) { toast('没有可以交易的对手'); return; }

    let targetId = others[0].id;

    function tileChecks(ownerId, listId) {
      const list = Object.keys(state.props)
        .filter((k) => state.props[k].owner === ownerId && state.props[k].houses === 0)
        .map(Number);
      if (!list.length) {
        return '<p class="sub" style="margin:4px 0">（没有可交易的地产）</p>';
      }
      return '<div class="check-list" id="' + listId + '">' + list.map((i) =>
        '<label class="check-row"><input type="checkbox" value="' + i + '">' +
        '<span class="swatch" style="background:' +
        (T[i].group ? D.GROUPS[T[i].group].color : '#8e9aa6') + '"></span>' +
        T[i].name + '</label>').join('') + '</div>';
    }

    function renderForm() {
      const m = me();
      const other = state.players.find((p) => p.id === targetId);

      openModal(
        '<h3>发起交易</h3>' +
        '<p class="sub">只有不含房子的地产可以交易</p>' +
        '<label class="field"><span>交易对象</span><select id="tr-target">' +
        others.map((p) => '<option value="' + p.id + '"' + (p.id === targetId ? ' selected' : '') + '>' +
          esc(p.name) + '</option>').join('') + '</select></label>' +

        '<div class="mrow"><span>你会得到</span><b>' + esc(other.name) + ' 的地产 + 现金</b></div>' +
        '<label class="field"><span>要对方出的现金（最多 ' + fmt(other.money) + '）</span>' +
        '<input type="number" id="tr-rcash" value="0" min="0" step="10"></label>' +
        '<div class="field"><span>要对方出的地产</span>' + tileChecks(other.id, 'tr-req') + '</div>' +

        '<div class="mrow"><span>你会给出</span><b>你的地产 + 现金</b></div>' +
        '<label class="field"><span>你出的现金（最多 ' + fmt(m.money) + '）</span>' +
        '<input type="number" id="tr-ocash" value="0" min="0" step="10"></label>' +
        '<div class="field"><span>你出的地产</span>' + tileChecks(myId, 'tr-offer') + '</div>' +

        '<div class="modal-actions">' +
        '<button class="btn primary" id="tr-send">发出交易请求</button>' +
        '<button class="btn" id="tr-cancel">取消</button></div>'
      );

      $('tr-target').addEventListener('change', (e) => {
        targetId = e.target.value;
        renderForm();
      });

      $('tr-cancel').addEventListener('click', closeModal);

      $('tr-send').addEventListener('click', () => {
        const box = $('modal-box');
        const pick = (listId) => {
          const list = $(listId);
          if (!list) return [];
          return Array.from(list.querySelectorAll('input:checked')).map((x) => Number(x.value));
        };

        doAction({
          type: 'tradePropose',
          toId: targetId,
          offerCash: Number($('tr-ocash').value) || 0,
          requestCash: Number($('tr-rcash').value) || 0,
          offerTiles: pick('tr-offer'),
          requestTiles: pick('tr-req')
        });
      });
    }

    renderForm();
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg, bad) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
  }

  /* ---------------- 挂载 ---------------- */
  function mount(opts) {
    el.board = opts.board;
    el.canvas = opts.canvas;
    el.turnbar = $('turnbar');
    el.players = $('players');
    el.actions = $('actions');
    el.log = $('log');

    send = opts.onAction;

    buildTiles();
    window.MonoScene.mount(opts.canvas, opts.board);

    window.addEventListener('resize', () => window.MonoScene.resize());

    // 弹窗关闭
    $('modal').addEventListener('click', (e) => {
      if (e.target === $('modal')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function render(state, actorId) {
    curState = state;
    myId = actorId;
    paintTiles(state);
    paintPlayers(state);
    paintTurnbar(state);
    paintActions(state);
    paintLog(state);
    window.MonoScene.update(state);
  }

  return {
    mount: mount,
    render: render,
    toast: toast,
    close: closeModal,
    isMyTurn: isMyTurn
  };
})();

/* ============================================================
   大富翁 · 规则引擎
   ---------------------------------------------------------
   纯函数式：act(state, action, actorId, rng) → { ok, msg, state }
   不碰 DOM、不碰网络，方便单测。所有骰子/卡牌随机由外部 rng 注入。
   ============================================================ */

window.MonoEngine = (function () {
  const D = window.MonoData;
  const T = D.TILES;
  const N = T.length;
  const START_MONEY = D.START_MONEY;
  const GO_BONUS = D.GO_BONUS;
  const JAIL_BAIL = 50;
  const HOTEL = 5;          // houses === 5 表示旅馆

  const isProperty = (t) => t.type === 'prop' || t.type === 'rail' || t.type === 'util';

  /* ---------------- 小工具 ---------------- */
  const ok = (st) => ({ ok: true, state: st });
  const fail = (msg) => ({ ok: false, msg });

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function log(st, text) {
    st.logs.push(text);
    if (st.logs.length > 80) st.logs = st.logs.slice(-80);
  }

  const cur = (st) => st.players[st.turn];
  const byId = (st, id) => st.players.find((p) => p.id === id);
  const propsOf = (st, id) =>
    Object.keys(st.props).filter((k) => st.props[k].owner === id).map(Number);

  function ownsGroup(st, id, group) {
    if (!group) return false;
    return T.every((t) => !t.group || t.group !== group || st.props[t.i].owner === id);
  }

  function groupTiles(group) {
    return T.filter((t) => t.group === group).map((t) => t.i);
  }

  /* ---------------- 创建对局 ---------------- */
  function createInitial(players, rng) {
    rng = rng || Math.random;
    const st = {
      game: 'monopoly',
      phase: 'playing',
      turn: 0,
      turnPhase: 'awaitRoll',
      needRollAgain: false,
      players: players.map((p, i) => ({
        id: p.id, name: p.name, color: D.COLORS[i % 4],
        pos: 0, money: START_MONEY,
        inJail: false, jailTurns: 0, cards: 0,
        bankrupt: false, doubles: 0
      })),
      props: {},
      lastRoll: null,
      card: null,
      auction: null,
      trade: null,
      logs: ['游戏开始，' + players[0].name + ' 先手'],
      decks: {
        chance: shuffle([...Array(D.CHANCE.length).keys()], rng),
        chest: shuffle([...Array(D.CHEST.length).keys()], rng)
      }
    };
    T.forEach((t) => {
      if (isProperty(t)) st.props[t.i] = { owner: null, houses: 0, mortgaged: false };
    });
    return st;
  }

  /* ---------------- 租金 ---------------- */
  function rentAt(st, ti, dice) {
    const t = T[ti];
    const pr = st.props[ti];
    if (!t || !pr || !pr.owner || pr.mortgaged) return 0;

    if (t.type === 'rail') {
      const n = Object.keys(st.props).filter(
        (k) => T[k].type === 'rail' && st.props[k].owner === pr.owner).length;
      return [0, 25, 50, 100, 200][Math.min(n, 4)] || 25;
    }
    if (t.type === 'util') {
      const n = Object.keys(st.props).filter(
        (k) => T[k].type === 'util' && st.props[k].owner === pr.owner).length;
      const mult = n >= 2 ? 10 : 4;
      return mult * Math.max(dice || 0, 0);
    }
    const r = t.rent;
    if (pr.houses === HOTEL) return r[5];
    if (pr.houses > 0) return r[pr.houses];
    return ownsGroup(st, pr.owner, t.group) ? r[0] * 2 : r[0];
  }

  function mortgageValue(ti) {
    const t = T[ti];
    return Math.floor((t.price || 0) / 2);
  }

  function netWorth(st, id) {
    const p = byId(st, id);
    if (!p) return 0;
    let m = p.money;
    propsOf(st, id).forEach((ti) => {
      const pr = st.props[ti];
      if (!pr.mortgaged) m += Math.floor(T[ti].price / 2);
      if (pr.houses > 0) {
        const cost = T[ti].house || 0;
        m += Math.floor(pr.houses * cost / 2);
      }
    });
    return m;
  }

  /* ---------------- 付款与清算 ---------------- */
  function liquidate(st, p, need) {
    // 1. 拆房回血（半价）
    let changed = true;
    while (p.money < need && changed) {
      changed = false;
      for (const ti of propsOf(st, p.id)) {
        const pr = st.props[ti];
        if (pr.houses > 0) {
          pr.houses -= 1;
          p.money += Math.floor((T[ti].house || 0) / 2);
          changed = true;
          if (p.money >= need) break;
        }
      }
    }
    // 2. 抵押
    changed = true;
    while (p.money < need && changed) {
      changed = false;
      for (const ti of propsOf(st, p.id)) {
        const pr = st.props[ti];
        if (!pr.mortgaged && pr.houses === 0) {
          pr.mortgaged = true;
          p.money += mortgageValue(ti);
          changed = true;
          if (p.money >= need) break;
        }
      }
    }
    return p.money >= need;
  }

  function pay(st, p, amount, creditorId) {
    if (amount <= 0) return true;
    if (p.money >= amount) {
      p.money -= amount;
      if (creditorId) {
        const c = byId(st, creditorId);
        if (c) c.money += amount;
      }
      return true;
    }
    liquidate(st, p, amount);
    if (p.money >= amount) {
      p.money -= amount;
      if (creditorId) {
        const c = byId(st, creditorId);
        if (c) c.money += amount;
      }
      return true;
    }
    return false;
  }

  function goBankrupt(st, p, creditorId) {
    propsOf(st, p.id).forEach((ti) => {
      const pr = st.props[ti];
      pr.houses = 0;
      if (creditorId) {
        pr.owner = creditorId;
      } else {
        pr.owner = null;
        pr.mortgaged = false;
      }
    });
    if (creditorId && p.money > 0) {
      const c = byId(st, creditorId);
      if (c) c.money += p.money;
    }
    p.money = 0;
    p.bankrupt = true;
    p.inJail = false;
    log(st, p.name + ' 破产出局');

    const alive = st.players.filter((x) => !x.bankrupt);
    if (alive.length === 1) {
      st.phase = 'ended';
      st.winner = alive[0].id;
      log(st, alive[0].name + ' 成为最后的赢家');
      return;
    }
    if (p.id === cur(st).id) advanceTurn(st);
  }

  /* ---------------- 移动 ---------------- */
  function movePlayer(st, p, steps, collectGo) {
    for (let i = 0; i < steps; i++) {
      p.pos = (p.pos + 1) % N;
      if (p.pos === 0 && collectGo) {
        p.money += GO_BONUS;
        log(st, p.name + ' 经过起点，领 $' + GO_BONUS);
      }
    }
  }

  function sendToJail(st, p) {
    p.pos = 10;
    p.inJail = true;
    p.jailTurns = 0;
    p.doubles = 0;
    st.needRollAgain = false;
    log(st, p.name + ' 进了监狱');
  }

  /* ---------------- 落地结算 ---------------- */
  function resolveLanding(st, p, dice, depth) {
    if (depth > 3) { st.turnPhase = 'awaitEnd'; return; }
    const t = T[p.pos];

    if (isProperty(t)) {
      const pr = st.props[p.pos];
      if (!pr.owner) { st.turnPhase = 'awaitBuy'; return; }
      if (pr.owner === p.id) { st.turnPhase = 'awaitEnd'; return; }
      if (pr.mortgaged) {
        log(st, p.name + ' 落在 ' + t.name + '（抵押中，免租）');
        st.turnPhase = 'awaitEnd';
        return;
      }
      const rent = rentAt(st, p.pos, dice);
      const owner = byId(st, pr.owner);
      log(st, p.name + ' 落在 ' + t.name + '，向 ' + owner.name + ' 付租金 $' + rent);
      if (!pay(st, p, rent, pr.owner)) { goBankrupt(st, p, pr.owner); return; }
      st.turnPhase = 'awaitEnd';
      return;
    }

    if (t.type === 'chance' || t.type === 'chest') { drawCard(st, p, t.type, depth); return; }

    if (t.type === 'tax') {
      log(st, p.name + ' 缴纳' + t.name + ' $' + t.tax);
      if (!pay(st, p, t.tax, null)) { goBankrupt(st, p, null); return; }
      st.turnPhase = 'awaitEnd';
      return;
    }

    if (t.type === 'gotojail') { sendToJail(st, p); st.turnPhase = 'awaitEnd'; return; }
    if (t.type === 'go') { log(st, p.name + ' 停在起点'); st.turnPhase = 'awaitEnd'; return; }
    if (t.type === 'jail') { st.turnPhase = 'awaitEnd'; return; }
    if (t.type === 'free') { log(st, p.name + ' 在免费停车歇一会儿'); st.turnPhase = 'awaitEnd'; return; }
    st.turnPhase = 'awaitEnd';
  }

  /* ---------------- 卡牌 ---------------- */
  function drawCard(st, p, deckName, depth) {
    const deckCfg = deckName === 'chance' ? D.CHANCE : D.CHEST;
    if (!st.decks[deckName].length) {
      st.decks[deckName] = shuffle([...Array(deckCfg.length).keys()], Math.random);
    }
    const idx = st.decks[deckName].shift();
    const card = deckCfg[idx];
    st.card = { deck: deckName, text: card.t, at: Date.now() };
    log(st, p.name + ' 抽到：' + card.t);
    applyCard(st, p, card, depth);
  }

  function applyCard(st, p, card, depth) {
    const a = card.a || {};

    if (a.type === 'money') {
      if (a.v > 0) {
        p.money += a.v;
      } else if (!pay(st, p, -a.v, null)) {
        goBankrupt(st, p, null);
        return;
      }
      st.turnPhase = 'awaitEnd';
      return;
    }

    if (a.type === 'move') {
      const steps = (a.to - p.pos + N) % N || N;
      movePlayer(st, p, steps, true);
      resolveLanding(st, p, st.lastRoll ? st.lastRoll.total : 0, depth + 1);
      return;
    }

    if (a.type === 'moveBack') {
      p.pos = (p.pos - a.n + N) % N;
      resolveLanding(st, p, 0, depth + 1);
      return;
    }

    if (a.type === 'nearestRail') {
      const rails = [5, 15, 25, 35];
      let target = rails.find((r) => r > p.pos);
      if (target === undefined) target = rails[0];
      movePlayer(st, p, (target - p.pos + N) % N || N, true);
      const pr = st.props[target];
      if (pr.owner && pr.owner !== p.id && !pr.mortgaged) {
        const rent = rentAt(st, target, 0) * 2;
        const owner = byId(st, pr.owner);
        log(st, p.name + ' 到 ' + T[target].name + '，付双倍租金 $' + rent + ' 给 ' + owner.name);
        if (!pay(st, p, rent, pr.owner)) { goBankrupt(st, p, pr.owner); return; }
        st.turnPhase = 'awaitEnd';
        return;
      }
      resolveLanding(st, p, 0, depth + 1);
      return;
    }

    if (a.type === 'jail') {
      sendToJail(st, p);
      st.turnPhase = 'awaitEnd';
      return;
    }

    if (a.type === 'jailCard') {
      p.cards += 1;
      st.turnPhase = 'awaitEnd';
      return;
    }

    if (a.type === 'repair') {
      let cost = 0;
      propsOf(st, p.id).forEach((ti) => {
        const pr = st.props[ti];
        if (pr.houses === HOTEL) cost += a.hotel;
        else cost += pr.houses * a.house;
      });
      if (cost > 0) {
        log(st, p.name + ' 维修房产支出 $' + cost);
        if (!pay(st, p, cost, null)) { goBankrupt(st, p, null); return; }
      }
      st.turnPhase = 'awaitEnd';
      return;
    }

    if (a.type === 'collect') {
      st.players.forEach((x) => {
        if (x.id === p.id || x.bankrupt) return;
        if (!pay(st, x, a.v, p.id)) goBankrupt(st, x, p.id);
      });
      st.turnPhase = 'awaitEnd';
      return;
    }

    st.turnPhase = 'awaitEnd';
  }

  /* ---------------- 回合流转 ---------------- */
  function advanceTurn(st) {
    let guard = 0;
    do {
      st.turn = (st.turn + 1) % st.players.length;
      guard++;
    } while (st.players[st.turn].bankrupt && guard <= st.players.length);
    st.turnPhase = 'awaitRoll';
    st.needRollAgain = false;
    log(st, '轮到 ' + cur(st).name);
  }

  function continueTurn(st, p) {
    if (st.needRollAgain && !p.inJail && p.id === cur(st).id) {
      st.turnPhase = 'awaitRoll';
    } else {
      st.turnPhase = 'awaitEnd';
    }
  }

  /* ---------------- 动作：掷骰 ---------------- */
  function doRoll(st, actorId, rng) {
    const p = cur(st);
    if (!p || p.id !== actorId) return fail('还没轮到你');
    if (st.turnPhase !== 'awaitRoll') return fail('现在不能掷骰子');
    if (p.bankrupt) return fail('你已经出局了');

    const d1 = 1 + Math.floor(rng() * 6);
    const d2 = 1 + Math.floor(rng() * 6);
    const total = d1 + d2;
    const dbl = d1 === d2;
    st.lastRoll = { d1: d1, d2: d2, total: total, by: p.name, double: dbl };
    log(st, p.name + ' 掷出 ' + d1 + ' + ' + d2 + ' = ' + total + (dbl ? '（双骰）' : ''));

    const fromJail = p.inJail;

    if (fromJail) {
      if (dbl) {
        p.inJail = false;
        p.jailTurns = 0;
        log(st, p.name + ' 掷出双骰，走出监狱');
      } else {
        p.jailTurns += 1;
        if (p.jailTurns >= 3) {
          p.inJail = false;
          p.jailTurns = 0;
          log(st, p.name + ' 三次没掷出双骰，缴 $' + JAIL_BAIL + ' 保释金');
          if (!pay(st, p, JAIL_BAIL, null)) { goBankrupt(st, p, null); return ok(st); }
        } else {
          log(st, p.name + ' 在监狱里没掷出双骰（第 ' + p.jailTurns + ' 次）');
          st.turnPhase = 'awaitEnd';
          st.needRollAgain = false;
          return ok(st);
        }
      }
    }

    if (!fromJail) {
      if (dbl) {
        p.doubles += 1;
        if (p.doubles >= 3) {
          log(st, p.name + ' 连续三次双骰，直接入狱');
          sendToJail(st, p);
          st.turnPhase = 'awaitEnd';
          return ok(st);
        }
        st.needRollAgain = true;
      } else {
        p.doubles = 0;
        st.needRollAgain = false;
      }
    } else {
      st.needRollAgain = false;
      p.doubles = 0;
    }

    movePlayer(st, p, total, true);
    resolveLanding(st, p, total, 0);

    if (st.turnPhase === 'awaitEnd' && !p.bankrupt) continueTurn(st, p);
    return ok(st);
  }

  /* ---------------- 动作：买地 / 拍卖 ---------------- */
  function doBuy(st, actorId) {
    const p = cur(st);
    if (!p || p.id !== actorId) return fail('还没轮到你');
    if (st.turnPhase !== 'awaitBuy') return fail('现在不是购买时机');
    const ti = p.pos;
    const t = T[ti];
    const pr = st.props[ti];
    if (!isProperty(t) || pr.owner) return fail('这块地不能买');
    if (p.money < t.price) return fail('现金不够，买不起');
    p.money -= t.price;
    pr.owner = p.id;
    log(st, p.name + ' 买下 ' + t.name + '，付 $' + t.price);
    continueTurn(st, p);
    return ok(st);
  }

  function startAuction(st, ti) {
    const ids = st.players.filter((x) => !x.bankrupt).map((x) => x.id);
    st.auction = { ti: ti, queue: ids, i: 0, bid: 0, leader: null };
    st.turnPhase = 'awaitAuction';
    log(st, T[ti].name + ' 无人购买，进入拍卖');
  }

  function doDecline(st, actorId) {
    const p = cur(st);
    if (!p || p.id !== actorId) return fail('还没轮到你');
    if (st.turnPhase !== 'awaitBuy') return fail('现在没有可放弃的购买');
    startAuction(st, p.pos);
    return ok(st);
  }

  function auctionCheck(st) {
    const a = st.auction;
    if (!a) return;
    if (a.queue.length === 0) { finishAuction(st, a.leader !== null); return; }
    if (a.queue.length === 1 && a.leader === a.queue[0]) { finishAuction(st, true); return; }
    if (a.i >= a.queue.length) a.i = 0;
  }

  function finishAuction(st, sold) {
    const a = st.auction;
    const ti = a.ti;
    const pr = st.props[ti];
    if (sold && a.leader) {
      const w = byId(st, a.leader);
      if (w && w.money >= a.bid && a.bid > 0) {
        w.money -= a.bid;
        pr.owner = w.id;
        log(st, w.name + ' 以 $' + a.bid + ' 拍下 ' + T[ti].name);
      } else {
        log(st, T[ti].name + ' 流拍');
      }
    } else {
      log(st, T[ti].name + ' 流拍');
    }
    st.auction = null;
    const p = cur(st);
    if (p && !p.bankrupt) continueTurn(st, p);
    else st.turnPhase = 'awaitEnd';
  }

  function doBid(st, actorId, amount) {
    const a = st.auction;
    if (!a) return fail('现在没有拍卖');
    if (a.queue[a.i] !== actorId) return fail('还没轮到你出价');
    const p = byId(st, actorId);
    const min = a.bid + 10;
    const val = Number(amount);
    if (!isFinite(val) || val < min) return fail('出价至少要 $' + min);
    if (val > p.money) return fail('现金不够');
    a.bid = val;
    a.leader = actorId;
    log(st, p.name + ' 出价 $' + val);
    a.i = (a.i + 1) % a.queue.length;
    auctionCheck(st);
    return ok(st);
  }

  function doAuctionPass(st, actorId) {
    const a = st.auction;
    if (!a) return fail('现在没有拍卖');
    if (a.queue[a.i] !== actorId) return fail('还没轮到你');
    const p = byId(st, actorId);
    log(st, p.name + ' 放弃竞拍');
    a.queue.splice(a.i, 1);
    if (a.queue.length && a.i >= a.queue.length) a.i = 0;
    auctionCheck(st);
    return ok(st);
  }

  /* ---------------- 动作：回合结束 / 监狱 ---------------- */
  function doEndTurn(st, actorId) {
    const p = cur(st);
    if (!p || p.id !== actorId) return fail('还没轮到你');
    if (st.turnPhase !== 'awaitEnd') return fail('现在还不能结束回合');
    p.doubles = 0;
    st.needRollAgain = false;
    advanceTurn(st);
    return ok(st);
  }

  function doJailPay(st, actorId) {
    const p = cur(st);
    if (!p || p.id !== actorId) return fail('还没轮到你');
    if (!p.inJail) return fail('你不在监狱里');
    if (p.money < JAIL_BAIL) return fail('现金不够缴保释金');
    p.money -= JAIL_BAIL;
    p.inJail = false;
    p.jailTurns = 0;
    log(st, p.name + ' 缴 $' + JAIL_BAIL + ' 保释出狱');
    st.turnPhase = 'awaitRoll';
    return ok(st);
  }

  function doJailCard(st, actorId) {
    const p = cur(st);
    if (!p || p.id !== actorId) return fail('还没轮到你');
    if (!p.inJail) return fail('你不在监狱里');
    if (p.cards <= 0) return fail('手里没有出狱卡');
    p.cards -= 1;
    p.inJail = false;
    p.jailTurns = 0;
    log(st, p.name + ' 使用出狱卡走出了监狱');
    st.turnPhase = 'awaitRoll';
    return ok(st);
  }

  /* ---------------- 动作：建房 / 抵押 ---------------- */
  function isTurnActor(st, actorId) {
    const p = cur(st);
    return p && p.id === actorId && !p.bankrupt;
  }

  function canBuild(st, ti) {
    const t = T[ti];
    const pr = st.props[ti];
    if (!t || !pr || t.type !== 'prop') return fail('这块地不能建房');
    if (!ownsGroup(st, pr.owner, t.group)) return fail('要先买下整组才能建房');
    if (pr.houses >= HOTEL) return fail('已经是旅馆了');
    if (pr.mortgaged) return fail('抵押中的地产不能建房');
    const group = groupTiles(t.group);
    const min = Math.min.apply(null, group.map((g) => st.props[g].houses));
    if (pr.houses + 1 > min + 1) return fail('必须均衡建造：先给组内房屋更少的地加房');
    return { ok: true };
  }

  function doBuild(st, actorId, ti) {
    if (!isTurnActor(st, actorId)) return fail('只能在自己的回合操作');
    const pr = st.props[ti];
    if (!pr || pr.owner !== actorId) return fail('这不是你的地产');
    const chk = canBuild(st, ti);
    if (!chk.ok) return fail(chk.msg);
    const cost = T[ti].house;
    const p = byId(st, actorId);
    if (p.money < cost) return fail('现金不够，建房要 $' + cost);
    p.money -= cost;
    pr.houses += 1;
    log(st, p.name + ' 在 ' + T[ti].name + (pr.houses === HOTEL ? ' 建了一座旅馆' : ' 建了第 ' + pr.houses + ' 栋房子') + '，付 $' + cost);
    return ok(st);
  }

  function doSellHouse(st, actorId, ti) {
    if (!isTurnActor(st, actorId)) return fail('只能在自己的回合操作');
    const pr = st.props[ti];
    if (!pr || pr.owner !== actorId) return fail('这不是你的地产');
    if (pr.houses <= 0) return fail('这块地上没有房子');
    const t = T[ti];
    const group = groupTiles(t.group);
    const max = Math.max.apply(null, group.map((g) => st.props[g].houses));
    if (pr.houses !== max) return fail('必须均衡拆除：先拆组内房屋最多的那块');
    pr.houses -= 1;
    const back = Math.floor(t.house / 2);
    byId(st, actorId).money += back;
    log(st, '拆掉一栋房子，回收 $' + back);
    return ok(st);
  }

  function doMortgage(st, actorId, ti) {
    if (!isTurnActor(st, actorId)) return fail('只能在自己的回合操作');
    const pr = st.props[ti];
    if (!pr || pr.owner !== actorId) return fail('这不是你的地产');
    if (pr.mortgaged) return fail('已经抵押过了');
    if (pr.houses > 0) return fail('请先拆掉房子再抵押');
    const t = T[ti];
    if (t.type === 'prop') {
      const others = groupTiles(t.group);
      if (others.some((g) => st.props[g].houses > 0)) return fail('组内还有房子，不能抵押');
    }
    pr.mortgaged = true;
    const v = mortgageValue(ti);
    byId(st, actorId).money += v;
    log(st, byId(st, actorId).name + ' 抵押 ' + t.name + '，获得 $' + v);
    return ok(st);
  }

  function doUnmortgage(st, actorId, ti) {
    if (!isTurnActor(st, actorId)) return fail('只能在自己的回合操作');
    const pr = st.props[ti];
    if (!pr || pr.owner !== actorId) return fail('这不是你的地产');
    if (!pr.mortgaged) return fail('这块地没有抵押');
    const cost = Math.ceil(mortgageValue(ti) * 1.1);
    const p = byId(st, actorId);
    if (p.money < cost) return fail('现金不够，赎回要 $' + cost);
    p.money -= cost;
    pr.mortgaged = false;
    log(st, p.name + ' 赎回 ' + T[ti].name + '，付 $' + cost);
    return ok(st);
  }

  /* ---------------- 动作：交易 ---------------- */
  function doTradePropose(st, actorId, payload) {
    if (!isTurnActor(st, actorId)) return fail('只能在自己的回合发起交易');
    const toId = payload.toId;
    if (!toId || toId === actorId) return fail('选一个交易对象');
    const me = byId(st, actorId);
    const other = byId(st, toId);
    if (!other || other.bankrupt) return fail('对方已经出局');

    const offerTiles = payload.offerTiles || [];
    const requestTiles = payload.requestTiles || [];
    for (const ti of offerTiles) {
      if (st.props[ti].owner !== actorId) return fail('你只能拿自己的地产去换');
      if (st.props[ti].houses > 0) return fail('带房子的地产不能交易');
    }
    for (const ti of requestTiles) {
      if (st.props[ti].owner !== toId) return fail('对方没有这块地');
      if (st.props[ti].houses > 0) return fail('带房子的地产不能交易');
    }
    const offerCash = Math.max(0, Number(payload.offerCash) || 0);
    const requestCash = Math.max(0, Number(payload.requestCash) || 0);
    if (offerCash > me.money) return fail('你拿不出这么多现金');
    if (requestCash > other.money) return fail('对方拿不出这么多现金');

    st.trade = {
      fromId: actorId, toId: toId,
      offerCash: offerCash, requestCash: requestCash,
      offerTiles: offerTiles, requestTiles: requestTiles,
      at: Date.now()
    };
    log(st, me.name + ' 向 ' + other.name + ' 发起交易');
    return ok(st);
  }

  function doTradeRespond(st, actorId, accept) {
    const tr = st.trade;
    if (!tr) return fail('现在没有待处理的交易');
    if (tr.toId !== actorId) return fail('这不是给你的交易');
    const from = byId(st, tr.fromId);
    const to = byId(st, tr.toId);

    if (!accept) {
      log(st, to.name + ' 拒绝了交易');
      st.trade = null;
      return ok(st);
    }
    if (tr.offerCash > from.money) return fail('发起方现金不足了');
    if (tr.requestCash > to.money) return fail('你的现金不足');

    from.money -= tr.offerCash;
    to.money += tr.offerCash;
    to.money -= tr.requestCash;
    from.money += tr.requestCash;

    tr.offerTiles.forEach((ti) => { st.props[ti].owner = to.id; });
    tr.requestTiles.forEach((ti) => { st.props[ti].owner = from.id; });

    log(st, '交易达成：' + from.name + ' 与 ' + to.name + ' 完成交换');
    st.trade = null;
    return ok(st);
  }

  function doTradeCancel(st, actorId) {
    if (!st.trade) return fail('现在没有待处理的交易');
    if (st.trade.fromId !== actorId) return fail('只有发起方能取消');
    st.trade = null;
    log(st, '交易已取消');
    return ok(st);
  }

  /* ---------------- 动作：掉线跳过 / 房主移出 ---------------- */
  function doSkipTurn(st, actorId) {
    if (st.phase !== 'playing') return fail('现在不在对局中');
    const p = cur(st);
    if (!p) return fail('没有当前玩家');
    if (p.id === actorId) return fail('不能跳过自己');
    if (p.bankrupt) return fail('这个玩家已经出局了');

    // 卡在半截的拍卖/交易一并了结，否则回合推不下去
    if (st.auction) finishAuction(st, st.auction.leader !== null);
    if (st.trade) {
      st.trade = null;
      log(st, '待处理的交易因对方掉线作废');
    }

    log(st, p.name + ' 掉线，跳过这一回合');
    advanceTurn(st);
    return ok(st);
  }

  function doKick(st, actorId, targetId) {
    if (actorId !== st.hostId) return fail('只有房主能移出玩家');
    if (!targetId || targetId === actorId) return fail('不能移出自己');

    const idx = st.players.findIndex((x) => x.id === targetId);
    if (idx < 0) return fail('这个人不在房间里');
    const p = st.players[idx];

    if (st.trade && (st.trade.fromId === targetId || st.trade.toId === targetId)) st.trade = null;
    if (st.auction) {
      st.auction.queue = st.auction.queue.filter((id) => id !== targetId);
      if (st.auction.i >= st.auction.queue.length) st.auction.i = 0;
    }

    // 还没开局：直接把座位清出来
    if (st.phase !== 'playing') {
      st.players.splice(idx, 1);
      log(st, p.name + ' 被房主请出了房间');
      return ok(st);
    }

    // 对局进行中：按出局处理，地产回到银行可再被买
    propsOf(st, targetId).forEach((ti) => {
      const pr = st.props[ti];
      pr.owner = null;
      pr.houses = 0;
      pr.mortgaged = false;
    });
    p.money = 0;
    p.bankrupt = true;
    p.kicked = true;
    log(st, p.name + ' 被房主移出对局');

    const alive = st.players.filter((x) => !x.bankrupt);
    if (alive.length === 1) {
      st.phase = 'ended';
      st.winner = alive[0].id;
      log(st, alive[0].name + ' 成为最后的赢家');
      return ok(st);
    }
    if (st.auction) auctionCheck(st);
    if (p.id === cur(st).id) advanceTurn(st);
    return ok(st);
  }

  /* ---------------- 总入口 ---------------- */
  function act(state, action, actorId, rng) {
    const st = JSON.parse(JSON.stringify(state));
    if (st.phase === 'ended') return fail('这局已经结束了');
    st.card = null;

    switch (action.type) {
      case 'roll':          return doRoll(st, actorId, rng || Math.random);
      case 'buy':           return doBuy(st, actorId);
      case 'decline':       return doDecline(st, actorId);
      case 'bid':           return doBid(st, actorId, action.amount);
      case 'auctionPass':   return doAuctionPass(st, actorId);
      case 'endTurn':       return doEndTurn(st, actorId);
      case 'jailPay':       return doJailPay(st, actorId);
      case 'jailCard':      return doJailCard(st, actorId);
      case 'build':         return doBuild(st, actorId, action.tile);
      case 'sellHouse':     return doSellHouse(st, actorId, action.tile);
      case 'mortgage':      return doMortgage(st, actorId, action.tile);
      case 'unmortgage':    return doUnmortgage(st, actorId, action.tile);
      case 'tradePropose':  return doTradePropose(st, actorId, action);
      case 'tradeRespond':  return doTradeRespond(st, actorId, action.accept);
      case 'tradeCancel':   return doTradeCancel(st, actorId);
      case 'skipTurn':      return doSkipTurn(st, actorId);
      case 'kick':          return doKick(st, actorId, action.target);
      default:              return fail('未知操作：' + action.type);
    }
  }

  return {
    act: act,
    createInitial: createInitial,
    rentAt: rentAt,
    netWorth: netWorth,
    ownsGroup: ownsGroup,
    mortgageValue: mortgageValue,
    canBuild: canBuild,
    propsOf: propsOf,
    groupTiles: groupTiles,
    HOTEL: HOTEL,
    JAIL_BAIL: JAIL_BAIL
  };
})();

/* 五款新桌游的规则单测（官方规则版）：node tests/newgames.test.js */
const fs = require('fs');
const p = 'D:/MyBoardGame/js/games/';
global.window = global;
['bigtwo.js', 'splendor.js', 'azul.js', 'ticket.js', 'catan.js']
  .forEach((f) => eval(fs.readFileSync(p + f, 'utf8')));

let fails = 0;
function seeded(n) {
  let v = n;
  return function () { v = (v * 1103515245 + 12345) & 0x7fffffff; return v / 0x7fffffff; };
}
function eq(a, b, tag) {
  if (a !== b) { console.log('  FAIL ' + tag + ': 期望 ' + b + '，实际 ' + a); fails++; }
  else console.log('  ok   ' + tag + ' = ' + a);
}
function ok(res, tag) {
  if (!res || res.ok !== true) { console.log('  FAIL ' + tag + ': ' + ((res && res.msg) || '无结果')); fails++; return null; }
  console.log('  ok   ' + tag); return res.state;
}
function bad(res, tag) {
  if (!res || res.ok !== false) { console.log('  FAIL ' + tag + ': 本应被拦下却通过'); fails++; }
  else console.log('  ok   ' + tag + ' 被拦下 — ' + res.msg);
}

/* ================= 大老二 ================= */
console.log('=== 大老二 ===');
{
  const B = window.BigTwoEngine;
  let st = B.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }], seeded(3));
  eq(st.hands.length, 4, '四人各一手牌');
  eq(st.hands[0].length, 13, '每人 13 张');
  eq(st.hands[st.turn].indexOf(0) >= 0, true, '持 ♦3 的人先出');

  eq(B.combo([0]).type, 'single', '单张识别');
  eq(B.combo([0, 1]).type, 'pair', '一对识别');
  eq(B.combo([0, 1, 2]).type, 'triple', '三条识别');
  eq(B.combo([0, 5, 10, 15, 16]).type, 'straight', '顺子识别');
  eq(B.combo([0, 8, 16, 24, 32]).type, 'flush', '同花识别');
  eq(B.combo([0, 1, 2, 4, 5]).type, 'full', '葫芦识别');
  eq(B.combo([0, 1, 2, 3, 4]).type, 'four', '四条带一识别');
  eq(B.combo([0, 4, 8, 12, 16]).type, 'straightflush', '同花顺识别');
  eq(B.combo([0, 1, 2, 3]), null, '四张不成牌型');
  eq(B.combo([20, 25, 30, 35, 49]), null, '含 2 的顺子不成立');

  eq(B.beats(B.combo([4, 5]), B.combo([0, 1])), true, '一对 4 压一对 3');
  eq(B.beats(B.combo([0, 1]), B.combo([4, 5])), false, '一对 3 压不过一对 4');
  eq(B.beats(B.combo([0, 1, 2, 4, 5]), B.combo([0, 8, 16, 24, 32])), true, '葫芦压同花');
  eq(B.beats(B.combo([0, 4, 8, 12, 16]), B.combo([0, 1, 2, 3, 4])), true, '同花顺压四条');

  const pid = st.players[st.turn].id;
  bad(B.act(st, { type: 'play', cards: [st.hands[st.turn][3]] }, pid, seeded(4)), '首手不带 ♦3 要拦下');
  st = ok(B.act(st, { type: 'play', cards: [0] }, pid, seeded(4)), '首手带 ♦3 起手');
  eq(!!st.lastPlay, true, '桌面有牌了');
  bad(B.act(st, { type: 'play', cards: [st.hands[st.turn][0]] }, pid, seeded(5)), '不是当前回合的人不能出');

  const nxt = st.players[st.turn].id;
  st = ok(B.act(st, { type: 'pass' }, nxt, seeded(6)), '下家选择不要');
  eq(st.passes, 1, '不要计数 +1');
}

/* ================= 璀璨宝石 ================= */
console.log('=== 璀璨宝石 ===');
{
  const S = window.SplendorEngine;
  let st = S.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seeded(7));
  eq(st.board[1].length, 4, '一级卡场上 4 张');
  eq(st.nobles.length, 3, '两人局 3 个贵族');
  eq(st.bank.w, 4, '两人局每种宝石 4 颗');
  eq(Object.keys(st.cards).length, 90, '发展卡共 90 张');
  eq(st.bank.gold, 5, '金块 5 颗');

  st = ok(S.act(st, { type: 'take', colors: ['w', 'u', 'g'] }, 'a', seeded(8)), 'A 拿三种宝石');
  eq(st.players[0].tokens.w, 1, 'A 拿到 1 颗白宝石');

  bad(S.act(st, { type: 'take', colors: ['w', 'w'] }, 'b', seeded(9)), '同色 2 颗要池里剩 4 颗');

  // 10 颗上限：手牌 10 颗再拿 3 颗，必须退回 3 颗
  st.turn = 0;
  st.players[0].tokens = { w: 2, u: 2, g: 2, r: 2, k: 1, gold: 1 };
  const takeRes = S.act(st, { type: 'take', colors: ['r', 'k', 'w'] }, 'a', seeded(10));
  eq(takeRes.ok, true, '第 11-13 颗先拿到手');
  st = takeRes.state;
  eq(!!st.pendingReturn, true, '超过 10 颗要退回');
  eq(st.pendingReturn.count, 3, '要退回 3 颗');
  st = ok(S.act(st, { type: 'return', tokens: { w: 1, u: 1, g: 1 } }, 'a', seeded(11)), '退回后回合结束');
  eq(!!st.pendingReturn, false, '退回完成');
  eq(S.tokenTotal(st.players[0]), 10, '手牌回到 10 颗');

  st.turn = 0;
  const cheap = st.board[1].find(function (id) {
    const c = S.cardOf(st, id);
    return Object.keys(c.cost).reduce(function (s, k) { return s + c.cost[k]; }, 0) >= 3;
  });
  eq(!!cheap, true, '场上有 3 费的一级卡');
  st.players[0].tokens = { w: 2, u: 2, g: 2, r: 0, k: 0, gold: 0 };
  bad(S.act(st, { type: 'buy', id: cheap }, 'a', seeded(12)), '宝石不够时买不了');
  st.players[0].tokens = { w: 5, u: 5, g: 5, r: 0, k: 0, gold: 0 };
  st = ok(S.act(st, { type: 'buy', id: cheap }, 'a', seeded(13)), '宝石够了能买卡');
  eq(st.players[0].cards.length, 1, '买到一张卡');

  st.turn = 0;
  st.pendingReturn = null;
  st.players[0].tokens = { w: 1, u: 1, g: 1, r: 1, k: 1, gold: 0 };
  st = ok(S.act(st, { type: 'reserve', id: st.board[2][0] }, 'a', seeded(14)), '能预留二级卡');
  eq(st.players[0].tokens.gold, 1, '预留拿 1 个金块');
  eq(st.bank.gold, 4, '金块池少一颗');
}

/* ================= 花砖物语 ================= */
console.log('=== 花砖物语 ===');
{
  const A = window.AzulEngine;
  let st = A.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], seeded(15));
  eq(st.factories.length, 5, '5 个工厂');
  eq(st.factories[0].length, 4, '每个工厂 4 块砖');
  eq(st.players[0].lines.length, 5, '5 条图案行');

  const c0 = st.factories[0][0];
  st = ok(A.act(st, { type: 'take', src: 'f0', color: c0, line: 0 }, 'a', seeded(16)), 'A 从 1 号工厂拿一色');
  eq(st.players[0].lines[0].color, c0, '图案行颜色正确');
  eq(st.players[0].firstMarker, false, '从工厂拿砖不拿先手标记');

  // 从中间台拿 → 拿先手标记并 -1 分
  let guard = 0;
  while (st.center.length === 0 && guard++ < 10) {
    const per = st.players[st.turn].id;
    const fi = st.factories.findIndex(function (f) { return f.length; });
    if (fi < 0) break;
    const col = st.factories[fi][0];
    const r = A.act(st, { type: 'take', src: 'f' + fi, color: col, line: 4 }, per, seeded(30 + guard));
    if (r.ok) st = r.state; else break;
  }
  const beforeScore = st.players[st.turn].score;
  const col2 = st.center[0];
  st = ok(A.act(st, { type: 'take', src: 'center', color: col2, line: 0 }, st.players[st.turn].id, seeded(40)), '从中间台拿砖');
  eq(st.players[st.turn === 0 ? 1 : 0].firstMarker || st.players.some(function (x) { return x.firstMarker; }), true, '有人拿到先手标记');
  eq(st.players.some(function (x) { return x.score < 0; }), true, '先手标记扣 1 分');

  eq(A.FLOOR_PENALTY.join(''), '1122233', '地板扣分表');
  eq(A.wallColor(0, 0), 'b', '第一行首格是蓝');
}

/* ================= 车票之旅 ================= */
console.log('=== 车票之旅 ===');
{
  const T = window.TicketEngine;
  eq(T.CITIES.length, 36, '原版 36 座城市');
  eq(T.ROUTES.length, 100, '100 段路线（含双线）');
  eq(T.TICKETS.length, 30, '30 张官方目的地票');
  eq(T.POINTS[6], 15, '6 节车厢 15 分');

  let st = T.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(19));
  eq(st.players.length, 3, '三人开局');
  eq(st.players[0].pending.length, 3, '每人 3 张起手车票待选');
  eq(st.market.length, 5, '场上 5 张明牌');
  eq(st.players[0].trains, 45, '每人 45 节车厢');
  eq(st.deck.length + st.market.length + st.players.reduce(function (s, x) {
    return s + x.hand.loco + T.COLORS.reduce(function (t, c) { return t + x.hand[c]; }, 0);
  }, 0), 110, '车厢卡共 110 张');
  eq(st.players[0].hand.loco + T.COLORS.reduce(function (t, c) { return t + st.players[0].hand[c]; }, 0), 4, '起手 4 张车厢卡');

  // 开局选票：每人至少留 2 张
  bad(T.act(st, { type: 'keepTickets', keep: [0] }, 'a', seeded(20)), '起手只留 1 张要拦下');
  st = ok(T.act(st, { type: 'keepTickets', keep: [0, 1] }, 'a', seeded(21)), 'A 保留 2 张');
  st = ok(T.act(st, { type: 'keepTickets', keep: [0, 2] }, 'b', seeded(22)), 'B 保留 2 张');
  st = ok(T.act(st, { type: 'keepTickets', keep: [1, 2] }, 'c', seeded(23)), 'C 保留 2 张');
  eq(st.phase, 'playing', '选票结束进入行车');
  eq(st.players[0].tickets.length, 2, 'A 手上 2 张车票');

  const pid = st.players[st.turn].id;
  st = ok(T.act(st, { type: 'draw', idx: 0 }, pid, seeded(24)), 'A 从明牌拿一张');
  eq(st.drawsLeft, 1, '还剩一次拿卡');
  bad(T.act(st, { type: 'tickets' }, pid, seeded(25)), '拿了卡不能这回合抽车票');
  st = ok(T.act(st, { type: 'draw', idx: 0 }, pid, seeded(26)), '第二次拿卡');
  eq(st.drawsLeft, 2, '换人后重新两抽');

  // 占线：给足卡，灰线要选颜色
  st.turn = 0;
  st.players[0].hand = { p: 9, w: 9, u: 9, y: 9, g: 9, k: 9, r: 9, o: 9, loco: 9 };
  const grey = st.routes.find(function (r) { return r.color === 'grey' && !r.owner; });
  bad(T.act(st, { type: 'claim', id: grey.id }, 'a', seeded(27)), '灰线不选颜色要拦下');
  st = ok(T.act(st, { type: 'claim', id: grey.id, color: 'w' }, 'a', seeded(28)), '灰线选白占线成功');
  eq(st.routes.find(function (r) { return r.id === grey.id; }).owner, 'a', '路线归 A');
  eq(st.players[0].trains, 45 - grey.len, '扣掉车厢');

  // 3 人局双线只开一条
  const dbl = st.routes.find(function (r) { return r.pair === 'd0' && !r.owner; });
  st.turn = 0;
  st = ok(T.act(st, { type: 'claim', id: dbl.id, color: dbl.color === 'grey' ? 'u' : dbl.color }, 'a', seeded(29)), 'A 占双线一侧');
  const sib = st.routes.find(function (r) { return r.pair === 'd1' && r.a === dbl.a && r.b === dbl.b; });
  st.turn = 1;
  st.players[1].hand = { p: 9, w: 9, u: 9, y: 9, g: 9, k: 9, r: 9, o: 9, loco: 9 };
  bad(T.act(st, { type: 'claim', id: sib.id, color: 'k' }, 'b', seeded(30)), '3 人局另一侧不能再占');

  // 抽 3 张车票至少留 1 张
  st.turn = 0;
  st.players[0].hand = { p: 0, w: 0, u: 0, y: 0, g: 0, k: 0, r: 0, o: 0, loco: 0 };
  st = ok(T.act(st, { type: 'tickets' }, 'a', seeded(31)), '抽 3 张车票');
  eq(st.ticketPick.length, 3, '抽到 3 张待选');
  bad(T.act(st, { type: 'keepTickets', keep: [] }, 'a', seeded(32)), '一张都不留要拦下');
  st = ok(T.act(st, { type: 'keepTickets', keep: [0] }, 'a', seeded(33)), '留 1 张后回合结束');
  eq(!!st.ticketPick, false, '待选清空');

  // 最长路线连通性
  eq(T.connected(st, st.players[0], grey.a, grey.b), true, '刚占的线两端连通');
}

/* ================= 卡坦岛 ================= */
console.log('=== 卡坦岛 ===');
{
  const C = window.CatanEngine;
  let st = C.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], seeded(23));
  eq(st.phase, 'setup', '开局先摆村落');
  eq(st.hexes.length, 19, '19 块地形');
  eq(st.ports.length, 9, '9 个港口');
  eq(st.ports.filter(function (x) { return x.type === '3:1'; }).length, 4, '4 个 3:1 通用港');
  eq(st.ports.filter(function (x) { return x.type === '2:1'; }).length, 5, '5 个 2:1 专属港');
  eq(st.bank.wood, 19, '银行每种资源 19 张');

  let guard = 0;
  while (st.phase === 'setup' && guard++ < 20) {
    const pid = st.players[st.turn].id;
    let done = false;
    const vids = Object.keys(st.verts);
    for (let i = 0; i < vids.length; i++) {
      const v = st.verts[vids[i]];
      if (v.building) continue;
      if (v.adj.some(function (a) { return st.verts[a].building; })) continue;
      const e = v.edges.find(function (eid) { return !st.edges[eid].owner; });
      if (!e) continue;
      const r = C.act(st, { type: 'place', v: vids[i], e: e }, pid, seeded(24 + guard));
      if (r.ok) { st = r.state; done = true; break; }
    }
    if (!done) { console.log('  FAIL 找不到合法落点'); fails++; break; }
  }
  eq(st.phase, 'playing', '两轮摆完进入正式局');
  eq(Object.keys(st.verts).filter(function (v) { return st.verts[v].building; }).length, 6, '两个村落 × 3 人 = 6 个');

  // 掷 7：手牌超 7 张要弃一半
  st.players[0].res = { wood: 4, brick: 3, sheep: 2, wheat: 0, ore: 0 };
  st.turn = 0;
  st = ok(C.act(st, { type: 'roll', dice: [3, 4] }, 'a', seeded(30)), '掷出 7');
  eq(st.robberStage, 'discard', '先处理弃牌');
  eq(st.discardOwed.a, 4, 'A 有 9 张要弃 4 张');
  bad(C.act(st, { type: 'discard', res: { wood: 1 } }, 'a', seeded(31)), '弃牌数量不对要拦下');
  st = ok(C.act(st, { type: 'discard', res: { wood: 4 } }, 'a', seeded(32)), 'A 弃 4 张');
  eq(st.robberStage, 'place', '弃完轮到放强盗');

  const target = st.hexes.find(function (h) { return !h.robber; });
  st = ok(C.act(st, { type: 'robber', hex: target.id }, 'a', seeded(33)), '把强盗移到别处');
  eq(target.robber, true, '强盗落在那块地');

  // 港口兑率：没有港口时 4:1
  st.players[0].res = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };
  eq(C.tradeRatio(st, st.players[0], 'wood'), 4, '没有港口时 4:1');
  st = ok(C.act(st, { type: 'trade', give: 'wood', get: 'ore' }, 'a', seeded(34)), '银行 4:1 换资源');
  eq(st.players[0].res.wood, 5, '扣掉 4 张木');

  // 玩家间交易
  st.players[1].res = { wood: 0, brick: 0, sheep: 3, wheat: 0, ore: 0 };
  st.turn = 0;
  st = ok(C.act(st, { type: 'offer', give: 'wood', nGive: 2, get: 'sheep', nGet: 1, to: 'b' }, 'a', seeded(35)), 'A 向 B 发起互市');
  st = ok(C.act(st, { type: 'tradeRespond', accept: true }, 'b', seeded(36)), 'B 接受互市');
  eq(st.players[0].res.wood, 3, 'A 少了 2 张木');
  eq(st.players[0].res.sheep, 10, 'A 多了 1 张羊');

  // 发展卡：当回合买不能当回合打
  st.turn = 0;
  st.players[0].res = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };
  st = ok(C.act(st, { type: 'build', what: 'dev' }, 'a', seeded(37)), '买一张发展卡');
  const fresh = st.players[0].devNew.length ? st.players[0].devNew[0] : null;
  if (fresh && fresh !== 'vp') {
    bad(C.act(st, { type: 'playDev', card: fresh, res: 'wood' }, 'a', seeded(38)), '当回合买的发展卡不能当回合打出');
  } else {
    console.log('  ok   抽到胜利点卡（直接计分，不当回合打出）');
  }

  // 骑士要选强盗位置
  st.players[0].dev = ['knight'];
  st.players[0].devPlayed = false;
  bad(C.act(st, { type: 'playDev', card: 'knight' }, 'a', seeded(39)), '骑士不选位置要拦下');

  // 修路
  st.players[0].res = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };
  const ownEdge = Object.keys(st.edges).find(function (eid) {
    const e = st.edges[eid];
    if (e.owner) return false;
    return e.v.some(function (vid) {
      const v = st.verts[vid];
      return v.building && v.building.owner === 'a';
    });
  });
  eq(!!ownEdge, true, '有贴着自家村落的路可修');
  st = ok(C.act(st, { type: 'build', what: 'road', e: ownEdge }, 'a', seeded(40)), '资源够能修路');
  eq(st.edges[ownEdge].owner, 'a', '路归 A');

  // 升城市
  const myV = Object.keys(st.verts).find(function (vid) {
    const v = st.verts[vid];
    return v.building && v.building.owner === 'a' && v.building.type === 'settlement';
  });
  st.players[0].res = { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 };
  st = ok(C.act(st, { type: 'build', what: 'city', v: myV }, 'a', seeded(41)), '村落升级成城市');
  eq(st.verts[myV].building.type, 'city', '类型变成城市');
  eq(C.pointsOf(st, st.players[0]) >= 2, true, '城市至少算 2 分');
}

console.log('\n' + (fails === 0 ? '全部通过' : fails + ' 项失败'));

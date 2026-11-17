/* 三款新桌游的规则单测：node tests/games.test.js */
const fs = require('fs');
const p = 'D:/MyBoardGame/js/games/';
global.window = global;
['ludo.js', 'gomoku.js', 'snakes.js', 'reversi.js', 'connect4.js', 'jump.js', 'uno.js']
  .forEach((f) => eval(fs.readFileSync(p + f, 'utf8')));

let fails = 0;
function eq(a, b, tag) {
  if (a !== b) { console.log(`  FAIL ${tag}: 期望 ${b}，实际 ${a}`); fails++; }
  else console.log(`  ok   ${tag} = ${a}`);
}
function ok(res, tag) {
  if (!res.ok) { console.log(`  FAIL ${tag}: ${res.msg}`); fails++; return null; }
  console.log(`  ok   ${tag}`); return res.state;
}
function bad(res, tag) {
  if (res.ok) { console.log(`  FAIL ${tag}: 本应被拦下却成功`); fails++; }
  else console.log(`  ok   ${tag} 被拦下 — ${res.msg}`);
}

/* ================= 飞行棋 ================= */
console.log('=== 飞行棋 ===');
{
  let st = window.LudoEngine.createInitial(
    [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }]);
  eq(st.players.length, 4, '四人开局');

  st = ok(window.LudoEngine.act(st, { type: 'roll', dice: 3 }, 'a'), 'A 掷 3 点');
  eq(st.players[0].pos, 0, '停机坪掷到非 6 不动');
  eq(st.players[st.turn].id, 'b', '轮到 B');

  st.players[1].pos = 0;
  st = ok(window.LudoEngine.act(st, { type: 'roll', dice: 6 }, 'b'), 'B 掷 6 点起飞');
  eq(st.players[1].pos, 1, '起飞到第 1 格');

  // 同色格飞行：座位 2（C）从 15 格落到 17 格，17 号格 (17-1)%4=0 → 不是 C 的同色格
  st.players[2].pos = 16;
  st.turn = 2;
  st = ok(window.LudoEngine.act(st, { type: 'roll', dice: 1 }, 'c'), 'C 落到 17 格');
  eq(st.players[2].pos, 17, '非同色格不加速');

  // 座位 2 的同色格是 3、7、11...；从 2 格掷 1 → 3 格，再 +4
  st.players[2].pos = 2;
  st.players[2].finished = false;
  st.turn = 2;
  st = ok(window.LudoEngine.act(st, { type: 'roll', dice: 1 }, 'c'), 'C 落到同色格 3');
  eq(st.players[2].pos, 7, '同色格顺风 +4');

  // 撞机：14 号格不是 A 的同色格
  st.players[0].pos = 11;
  st.players[1].pos = 14;
  st.turn = 0;
  st = ok(window.LudoEngine.act(st, { type: 'roll', dice: 3 }, 'a'), 'A 落到 14 撞 B');
  eq(st.players[0].pos, 14, 'A 停在 14 格');
  eq(st.players[1].pos, 0, 'B 被撞回停机坪');

  // 超出终点回弹：50 + 5 = 55 → 52-(55-52)=49，回弹不触发加速
  st.players[0].pos = 50;
  st.turn = 0;
  st = ok(window.LudoEngine.act(st, { type: 'roll', dice: 5 }, 'a'), 'A 超出终点');
  eq(st.players[0].pos, 49, '超出的点数往回弹');

  // 精确到达终点
  st.players[0].pos = 50;
  st.turn = 0;
  st = ok(window.LudoEngine.act(st, { type: 'roll', dice: 2 }, 'a'), 'A 精确到达 52');
  eq(st.players[0].finished, true, 'A 到达终点');
  eq(st.phase, 'ended', '有人到达即结束');
  eq(st.winner, 'a', 'A 是第一');

  // 不是自己回合
  let st2 = window.LudoEngine.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  bad(window.LudoEngine.act(st2, { type: 'roll', dice: 6 }, 'b'), 'B 抢跑');
}

/* ================= 五子棋 ================= */
console.log('=== 五子棋 ===');
{
  let st = window.GomokuEngine.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const G = window.GomokuEngine;
  const place = (x, y, who) => {
    const r = G.act(st, { type: 'place', x: x, y: y }, who);
    if (r.ok) st = r.state;
    return r;
  };

  bad(place(1, 1, 'b'), 'B 抢黑棋先手');
  ok(place(0, 7, 'a'), 'A 落子');
  ok(place(0, 0, 'b'), 'B 落子');
  ok(place(1, 7, 'a'), 'A 第二子');
  ok(place(1, 0, 'b'), 'B 第二子');
  bad(place(1, 7, 'a'), '同一格重复落子');
  ok(place(2, 7, 'a'), 'A 第三子');
  ok(place(2, 0, 'b'), 'B 第三子');
  ok(place(3, 7, 'a'), 'A 第四子');
  ok(place(3, 0, 'b'), 'B 第四子');
  let r = G.act(st, { type: 'place', x: 4, y: 7 }, 'a');
  st = r.state;
  eq(st.winner, 'a', 'A 连成五子获胜');
  eq(st.phase, 'ended', '对局结束');
  eq(G.checkWin(new Array(225).fill(0), 0, 0, 1).win, false, '空盘不算赢');
}

/* ================= 蛇梯棋 ================= */
console.log('=== 蛇梯棋 ===');
{
  const S = window.SnakesEngine;
  let st = S.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
  eq(st.players.length, 3, '三人开局');

  st.players[0].pos = 3;
  st.turn = 0;
  st = ok(S.act(st, { type: 'roll', dice: 1 }, 'a'), 'A 踩到梯子底 4');
  eq(st.players[0].pos, 25, '梯子带上到 25');

  st.players[1].pos = 26;
  st.turn = 1;
  st = ok(S.act(st, { type: 'roll', dice: 1 }, 'b'), 'B 踩到蛇头 27');
  eq(st.players[1].pos, 5, '蛇带回到 5');

  st.players[2].pos = 98;
  st.turn = 2;
  st = ok(S.act(st, { type: 'roll', dice: 5 }, 'c'), 'C 超出终点');
  eq(st.players[2].pos, 98, '超出终点原地不动');

  st.players[2].pos = 99;
  st.turn = 2;
  st = ok(S.act(st, { type: 'roll', dice: 1 }, 'c'), 'C 正好走到 100');
  eq(st.players[2].pos, 100, 'C 到达终点');
  eq(st.winner, 'c', 'C 获胜');
  eq(st.phase, 'ended', '对局结束');

  let st2 = S.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  bad(S.act(st2, { type: 'roll', dice: 4 }, 'b'), 'B 抢跑');
}

/* ================= 黑白棋 ================= */
console.log('=== 黑白棋 ===');
{
  const R = window.ReversiEngine;
  let st = R.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const c0 = R.counts(st.cells);
  eq(c0.black, 2, '开局黑 2 子');
  eq(c0.white, 2, '开局白 2 子');
  eq(st.turn, 0, '黑棋先行');

  const moves = R.legalMoves(st.cells, 1);
  eq(moves.length, 4, '开局黑棋有 4 个落点');

  bad(R.act(st, { type: 'place', x: 0, y: 0 }, 'b'), '白棋抢跑');
  bad(R.act(st, { type: 'place', x: 0, y: 0 }, 'a'), '没有夹住白子的位置被拦下');

  const mv = moves[0];
  st = ok(R.act(st, { type: 'place', x: mv.x, y: mv.y }, 'a'), '黑棋落在 (' + (mv.x + 1) + ',' + (mv.y + 1) + ')');
  const c1 = R.counts(st.cells);
  eq(c1.black + c1.white, 5, '落子后棋盘上 5 颗子');
  eq(c1.empty, 59, '剩余 59 个空位');
  eq(st.phase, 'playing', '对局继续');
}

/* ================= 四子连珠 ================= */
console.log('=== 四子连珠 ===');
{
  const C = window.Connect4Engine;
  let st = C.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  eq(st.cells.length, 42, '7×6 共 42 格');

  st = ok(C.act(st, { type: 'place', col: 0 }, 'a'), 'A 落到第 1 列');
  eq(st.cells[C.idx(0, 0)], 1, 'A 的子在最底层');
  eq(st.players[st.turn].id, 'b', '轮到 B');
  bad(C.act(st, { type: 'place', col: 0 }, 'a'), 'A 抢跑');

  ok(C.act(st, { type: 'place', col: 1 }, 'b'), 'B 落到第 2 列');
  ok(C.act(st, { type: 'place', col: 0 }, 'a'), 'A 第 2 子');
  ok(C.act(st, { type: 'place', col: 1 }, 'b'), 'B 第 2 子');
  ok(C.act(st, { type: 'place', col: 0 }, 'a'), 'A 第 3 子');
  ok(C.act(st, { type: 'place', col: 1 }, 'b'), 'B 第 3 子');
  let r = C.act(st, { type: 'place', col: 0 }, 'a');
  st = r.state;
  ok(r, 'A 第 4 子落下');
  eq(st.winner, 'a', 'A 竖向连成四子');
  eq(st.phase, 'ended', '对局结束');

  let st2 = C.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  for (let i = 0; i < 6; i++) st2.cells[C.idx(3, i)] = 1;
  bad(C.act(st2, { type: 'place', col: 3 }, 'a'), '满列落子被拦下');
}

/* ================= 跳棋 ================= */
console.log('=== 跳棋 ===');
{
  const J = window.JumpEngine;
  eq(J.HOLES.length, 121, '星形棋盘 121 个孔位');
  eq(J.ARMS.map((a) => a.length).join(','), '10,10,10,10,10,10', '六个角区各 10 孔');
  const deg = J.ADJ.reduce((s, a) => s + a.length, 0) / 2;
  ok({ ok: deg > 200, msg: '邻接边数 ' + deg }, '邻接边数 ' + deg);

  let st = J.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  const occupied = st.holes.filter((h) => h !== -1).length;
  eq(occupied, 20, '两人各 10 颗子');
  eq(st.goals[0], 3, 'A 的目标是南角');
  eq(st.goals[1], 0, 'B 的目标是北角');

  // 找一颗有相邻空位的子
  let from = -1, to = -1;
  for (let i = 0; i < st.holes.length && from < 0; i++) {
    if (st.holes[i] !== 0) continue;
    const t = J.targets(st, i);
    const step = t.find((x) => !x.jump);
    if (step) { from = i; to = step.to; }
  }
  st = ok(J.act(st, { type: 'move', from: from, to: to }, 'a'), 'A 走一步到相邻孔');
  eq(st.holes[from], -1, '原来位置空出来');
  eq(st.holes[to], 0, '新位置是 A 的子');

  // 构造隔子跳：把中间孔放一颗别人的子
  let jf = -1, jt = -1, jo = -1;
  for (let i = 0; i < st.holes.length && jf < 0; i++) {
    if (st.holes[i] !== 0) continue;
    for (let k = 0; k < J.JUMPS[i].length; k++) {
      const j = J.JUMPS[i][k];
      if (st.holes[j.over] === -1 && st.holes[j.to] === -1) { jf = i; jo = j.over; jt = j.to; break; }
    }
  }
  st.turn = 0;
  st.holes[jo] = 1;
  st = ok(J.act(st, { type: 'move', from: jf, to: jt }, 'a'), 'A 隔一颗子跳过去');
  eq(st.holes[jt], 0, '跳到了目标孔');

  // 胜利判定：把 10 颗子全放进目标角
  let st3 = J.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
  st3.holes = st3.holes.map((h) => (h === 0 ? -1 : h));
  J.ARMS[st3.goals[0]].forEach((h) => { st3.holes[h] = 0; });
  eq(J.done(st3, 0), true, '目标角塞满 10 颗子即完成');
}

/* ================= UNO ================= */
console.log('=== UNO ===');
{
  const U = window.UnoEngine;
  const deck = U.buildDeck();
  eq(deck.length, 108, '整副 108 张');
  const red = deck.filter((c) => c.c === 'r');
  eq(red.length, 25, '每种颜色 25 张');
  eq(deck.filter((c) => c.v === 'wd4').length, 4, '变色+4 共 4 张');

  let st = U.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]);
  eq(st.hands.length, 3, '三人开局');
  eq(st.hands[0].length, 7, '每人 7 张手牌');
  eq(st.deck.length, 108 - 21 - 1, '牌堆剩余 86 张');
  const top = U.topCard(st);
  ok({ ok: /^\d$/.test(top.v), msg: String(top.v) }, '首张是数字牌，方便开局');

  // 构造一手能出的牌：红色数字 5，桌面是红色
  st.color = 'r';
  st.hands[0] = [{ c: 'r', v: '5' }, { c: 'b', v: '9' }];
  st.discard = [{ c: 'r', v: '3' }];
  st.turn = 0;
  st.drawnPlayable = false;

  bad(U.act(st, { type: 'play', i: 1 }, 'a'), '蓝色 9 打不出');
  st = ok(U.act(st, { type: 'play', i: 0 }, 'a'), '红色 5 打出去（同色）');
  eq(st.hands[0].length, 1, '手牌少一张');
  eq(U.topCard(st).v, '5', '弃牌堆顶是 5');
  eq(st.players[st.turn].id, 'b', '轮到下家');

  // +2 让下家摸两张并跳过
  st.turn = 0;
  st.hands[0] = [{ c: 'r', v: 'd2' }, { c: 'g', v: '1' }];
  st.discard = [{ c: 'r', v: '7' }];
  st.color = 'r';
  const before = st.hands[1].length;
  st = ok(U.act(st, { type: 'play', i: 0 }, 'a'), '+2 打出');
  eq(st.hands[1].length, before + 2, '下家摸两张');
  eq(st.players[st.turn].id, 'c', '下家被跳过，轮到再下家');

  // 变色牌必须选色
  st.turn = 0;
  st.hands[0] = [{ c: 'w', v: 'wild' }, { c: 'b', v: '5' }];
  st.discard = [{ c: 'b', v: '2' }];
  st.color = 'b';
  bad(U.act(st, { type: 'play', i: 0 }, 'a'), '变色牌没选颜色被拦下');
  st = ok(U.act(st, { type: 'play', i: 0, color: 'y' }, 'a'), '变色牌选了黄色');
  eq(st.color, 'y', '桌面颜色变成黄');

  // 抽牌：抽到不能出的牌直接换手
  st.turn = 0;
  st.hands[0] = [];
  st.discard = [{ c: 'r', v: '4' }];
  st.color = 'r';
  st.deck = [{ c: 'b', v: '8' }];
  st = ok(U.act(st, { type: 'draw' }, 'a'), '摸到不能出的牌');
  eq(st.players[st.turn].id, 'b', '不能出就直接换手');

  // 出完手牌获胜
  st.turn = 0;
  st.hands[0] = [{ c: 'r', v: '6' }];
  st.discard = [{ c: 'r', v: '4' }];
  st.color = 'r';
  st.phase = 'playing';
  const r = U.act(st, { type: 'play', i: 0 }, 'a');
  ok(r, '打出最后一张');
  eq(r.state.winner, 'a', '出完手牌者胜');
  eq(r.state.phase, 'ended', '对局结束');
}

console.log('');
if (fails) { console.log(`${fails} 项失败`); process.exit(1); }
else console.log('测试完毕 (全部通过)');

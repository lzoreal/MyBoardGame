const fs = require('fs');
const path = 'D:/MyBoardGame/js/';
global.window = global;
eval(fs.readFileSync(path + 'data.js', 'utf8'));
eval(fs.readFileSync(path + 'engine.js', 'utf8'));

const E = window.MonoEngine;
const D = window.MonoData;

let seed = 12345;
function rng() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}

function check(st, tag) {
  const problems = [];
  st.players.forEach(p => {
    if (p.money < 0) problems.push(`${p.name} 现金为负 ${p.money}`);
    if (p.cards < 0) problems.push(`${p.name} 出狱卡为负`);
  });
  Object.keys(st.props).forEach(k => {
    const pr = st.props[k];
    const t = D.TILES[Number(k)];
    if (pr.houses < 0 || pr.houses > 5) problems.push(`格${k} 房屋数异常 ${pr.houses}`);
    if (pr.owner && !st.players.find(x => x.id === pr.owner)) problems.push(`格${k} 主人不存在`);
    if (pr.type !== undefined) problems.push('脏字段');
    if (pr.owner && t.type === 'prop' && pr.houses > 0 && pr.mortgaged) problems.push(`格${k} 有房又抵押`);
  });
  if (problems.length) {
    console.log(`[${tag}] 不变量被破坏：`, problems.slice(0, 6));
    process.exitCode = 1;
  }
}

// ---------- 场景 1：基本流程 ----------
{
  const st = E.createInitial([{ id: 'a', name: '阿蒙' }, { id: 'b', name: '老王' }, { id: 'c', name: '小李' }], rng);
  console.log('=== 场景1：初始状态 ===');
  console.log('玩家数', st.players.length, '现金', st.players[0].money, '地产槽位', Object.keys(st.props).length);

  // 强制先手落在 1 号地（老街）上：直接把 pos 设到 39，掷 2 点
  st.players[0].pos = 39;
  let r = E.act(st, { type: 'roll' }, 'a', () => 0.2); // 1+1? 0.2*6=1.2 → d1=1,d2=1 total2 双骰
  console.log('掷骰后 turnPhase =', r.state.turnPhase, '位置 =', r.state.players[0].pos);
  console.log('落地于', D.TILES[r.state.players[0].pos].name);

  const buyRes = E.act(r.state, { type: 'buy' }, 'a');
  console.log('购买结果:', buyRes.ok ? '成功' : buyRes.msg,
    '余额', buyRes.state.players[0].money,
    '主人', buyRes.state.props[1].owner);
  check(buyRes.state, '场景1');
}

// ---------- 场景 2：整组 + 建房 + 租金 ----------
{
  let st = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], rng);
  st.props[1].owner = 'a';
  st.props[3].owner = 'a';
  st.players[0].money = 2000;
  const b = E.act(st, { type: 'build', tile: 1 }, 'a');
  console.log('\n=== 场景2：建房 ===');
  console.log(b.ok ? '建了第1栋，房屋数=' + b.state.props[1].houses : '失败:' + b.msg);
  const b2 = E.act(b.state, { type: 'build', tile: 1 }, 'a');
  console.log('继续加同一块:', b2.ok ? '成功(违反均衡)' : '被拦下:' + b2.msg);
  const b3 = E.act(b.state, { type: 'build', tile: 3 }, 'a');
  console.log('改建另一块:', b3.ok ? '成功，房屋数=' + b3.state.props[3].houses : '失败:' + b3.msg);
  console.log('垄断租金(无房) rentAt(1) =', E.rentAt(b3.state, 1, 7), '(应为基础租金翻倍 4)');
  console.log('有房租金 rentAt(3) =', E.rentAt(b3.state, 3, 7), '(应为 20)');
}

// ---------- 场景 3：抵押与赎回 ----------
{
  let st = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], rng);
  st.props[1].owner = 'a';
  st.players[0].money = 0;
  const m = E.act(st, { type: 'mortgage', tile: 1 }, 'a');
  console.log('\n=== 场景3：抵押 ===');
  console.log(m.ok ? '抵押成功，现金=' + m.state.players[0].money + ' 抵押价=' + E.mortgageValue(1) : '失败:' + m.msg);
  const u = E.act(m.state, { type: 'unmortgage', tile: 1 }, 'a');
  console.log('赎回:', u.ok ? '成功，现金=' + u.state.players[0].money : '失败:' + u.msg);
}

// ---------- 场景 4：拍卖 ----------
{
  let st = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], rng);
  st.players[0].pos = 5;
  st.players[0].money = 500;
  st.turnPhase = 'awaitBuy';
  const d = E.act(st, { type: 'decline' }, 'a');
  console.log('\n=== 场景4：拍卖 ===');
  console.log('进入拍卖:', d.ok, '拍卖块 =', d.state.auction && d.state.auction.ti, '队列 =', JSON.stringify(d.state.auction.queue));
  let s2 = d.state;
  // A 出价 100 → 轮到 B
  const bid1 = E.act(s2, { type: 'bid', amount: 100 }, s2.auction.queue[s2.auction.i]);
  console.log('第一口价:', bid1.ok ? '成功 bid=' + bid1.state.auction.bid + ' 领先' + bid1.state.auction.leader : bid1.msg);
  s2 = bid1.state;
  const passB = E.act(s2, { type: 'auctionPass' }, s2.auction.queue[s2.auction.i]);
  console.log('B 放弃:', passB.ok ? 'ok 队列=' + JSON.stringify(passB.state.auction.queue) : passB.msg);
  s2 = passB.state;
  const passC = E.act(s2, { type: 'auctionPass' }, s2.auction.queue[s2.auction.i]);
  console.log('C 放弃:', passC.ok ? 'ok' : passC.msg, '拍卖结束?', passC.state.auction === null,
    '结果主人 =', passC.state.props[5].owner);
  check(passC.state, '场景4');
}

// ---------- 场景 5：随机对局压力测试 ----------
{
  console.log('\n=== 场景5：随机对局 600 步 ===');
  let st = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }], rng);
  let steps = 0, errCount = 0;
  const seedRng = () => rng();

  for (; steps < 600; steps++) {
    if (st.phase === 'ended') break;
    const p = st.players[st.turn];

    if (st.turnPhase === 'awaitRoll') {
      const res = E.act(st, { type: 'roll' }, p.id, seedRng);
      if (!res.ok) { errCount++; console.log('roll 失败', res.msg); break; }
      st = res.state;
    } else if (st.turnPhase === 'awaitBuy') {
      const act = rng() < 0.7 ? 'buy' : 'decline';
      const res = E.act(st, { type: act }, p.id);
      if (!res.ok) { errCount++; console.log(act, '失败', res.msg); break; }
      st = res.state;
    } else if (st.turnPhase === 'awaitAuction') {
      const a = st.auction;
      const who = a.queue[a.i];
      const amount = a.bid + 10 + Math.floor(rng() * 3) * 10;
      const res = rng() < 0.5
        ? E.act(st, { type: 'bid', amount: amount }, who)
        : E.act(st, { type: 'auctionPass' }, who);
      if (!res.ok) { errCount++; console.log('auction 失败', res.msg); break; }
      st = res.state;
    } else if (st.turnPhase === 'awaitEnd') {
      // 偶尔建房 / 结束回合
      if (rng() < 0.25) {
        const mine = E.propsOf(st, p.id);
        if (mine.length) {
          const ti = mine[Math.floor(rng() * mine.length)];
          E.act(st, { type: 'build', tile: ti }, p.id); // 失败也无所谓
        }
      }
      const res = E.act(st, { type: 'endTurn' }, p.id);
      if (!res.ok) { errCount++; console.log('endTurn 失败', res.msg, 'phase=', st.turnPhase); break; }
      st = res.state;
    } else {
      errCount++;
      console.log('未知 turnPhase', st.turnPhase);
      break;
    }
    if (steps % 100 === 0) check(st, '压力' + steps);
  }

  console.log('执行步数:', steps, '错误:', errCount);
  console.log('结束状态:', st.phase, '| 各玩家:');
  st.players.forEach(p => {
    console.log(`  ${p.name}: 现金 $${p.money} 位置${p.pos} 地产${E.propsOf(st, p.id).length}块 ${p.bankrupt ? '已破产' : ''} 出狱卡${p.cards}`);
  });
  const total = st.players.filter(x => !x.bankrupt).reduce((s, x) => s + E.netWorth(st, x.id), 0);
  console.log('存活玩家净资产合计:', total);
  check(st, '压力结束');
}

// ---------- 场景 6：掉线跳过 / 房主移出 ----------
{
  console.log('\n=== 场景6：掉线跳过与房主移出 ===');

  // 6.1 轮到 b 时 b 掉线，由 a 触发跳过
  let st = E.createInitial([{ id: 'a', name: '阿蒙' }, { id: 'b', name: '老王' }, { id: 'c', name: '小李' }], rng);
  st.players[1].pos = 1;
  st.props[1] = { owner: 'b', houses: 2, mortgaged: false };
  st.turn = 1;
  st.turnPhase = 'awaitBuy';
  const skip = E.act(st, { type: 'skipTurn' }, 'a');
  console.log('跳过结果:', skip.ok ? 'ok' : skip.msg,
    '| 当前玩家 =', skip.state.players[skip.state.turn].name,
    '| 轮次 =', skip.state.turn);
  if (!skip.ok) process.exitCode = 1;
  if (skip.state.turn === 1) { console.log('× 跳过失败：轮次没推进'); process.exitCode = 1; }
  check(skip.state, '场景6.1');

  // 6.2 自己不能跳过自己
  const selfSkip = E.act(st, { type: 'skipTurn' }, 'b');
  console.log('自己跳自己:', selfSkip.ok ? '× 不该允许' : '被拦下 — ' + selfSkip.msg);
  if (selfSkip.ok) process.exitCode = 1;

  // 6.3 等待房间里房主把人请出去，座位直接空出来
  let lobby = E.createInitial([{ id: 'a', name: '阿蒙' }, { id: 'b', name: '老王' }], rng);
  lobby.phase = 'lobby';
  lobby.hostId = 'a';
  const kickLobby = E.act(lobby, { type: 'kick', target: 'b' }, 'a');
  console.log('等待页移出:', kickLobby.ok ? 'ok 剩 ' + kickLobby.state.players.length + ' 人' : kickLobby.msg);
  if (!kickLobby.ok || kickLobby.state.players.length !== 1) process.exitCode = 1;

  // 6.4 非房主不能移出
  const noRight = E.act(lobby, { type: 'kick', target: 'b' }, 'b');
  console.log('非房主移人:', noRight.ok ? '× 不该允许' : '被拦下 — ' + noRight.msg);
  if (noRight.ok) process.exitCode = 1;

  // 6.5 对局中移出当前玩家：地产回银行、房屋清空、轮次推进
  let game = E.createInitial([{ id: 'a', name: '阿蒙' }, { id: 'b', name: '老王' }, { id: 'c', name: '小李' }], rng);
  game.hostId = 'a';
  game.props[1] = { owner: 'b', houses: 3, mortgaged: false };
  game.props[3] = { owner: 'b', houses: 0, mortgaged: true };
  game.turn = 1;
  game.turnPhase = 'awaitRoll';
  const kickGame = E.act(game, { type: 'kick', target: 'b' }, 'a');
  const kicked = kickGame.state.players.find((x) => x.id === 'b');
  console.log('对局中移出:', kickGame.ok ? 'ok' : kickGame.msg,
    '| b 出局 =', kicked && kicked.bankrupt,
    '| 1 号地主人 =', kickGame.state.props[1].owner,
    '| 1 号地房屋 =', kickGame.state.props[1].houses,
    '| 现在轮到 =', kickGame.state.players[kickGame.state.turn].name);
  if (!kickGame.ok) process.exitCode = 1;
  if (!kicked || !kicked.bankrupt) { console.log('× 被移出的人没标记出局'); process.exitCode = 1; }
  if (kickGame.state.props[1].owner !== null || kickGame.state.props[1].houses !== 0) {
    console.log('× 地产没回到银行'); process.exitCode = 1;
  }
  if (kickGame.state.turn === 1) { console.log('× 轮次没推进'); process.exitCode = 1; }
  check(kickGame.state, '场景6.5');
}

console.log('\n测试完毕', process.exitCode ? '(有失败)' : '(全部通过)');

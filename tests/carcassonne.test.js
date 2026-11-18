/* 卡卡颂引擎自测：开局、拼放、随机整局跑到终局 */
const assert = require('assert');
global.window = global;
require('../js/games/carcassonne.js');
const C = global.CarcassonneEngine;

function testBasic() {
  const st = C.createInitial([
    { id: 'a', name: '甲' }, { id: 'b', name: '乙' },
    { id: 'c', name: '丙' }, { id: 'd', name: '丁' }
  ], () => 0.5);
  assert.equal(st.players.length, 4);
  assert.equal(Object.keys(st.board).length, 1);
  assert.equal(st.deck.length + 2, 72, '72 张板块含起始与手上的一张');
  assert.equal(st.players[0].meeples, 7);
  const p = C.placements(st);
  assert.ok(p.length >= 2, '起始板块四周可落子');
  p.forEach((c) => assert.ok(c.rots.length >= 1));
}

function testCityScore() {
  const st = C.createInitial([{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], () => 0.5);
  st.cur = 7; // 单边城市 CFFF
  const r1 = C.act(st, { type: 'place', x: 0, y: -1, rot: 2 }, 'a');
  assert.ok(r1.ok, r1.msg);
  const r2 = C.act(st, { type: 'meeple', k: 'city', i: 0 }, 'a');
  assert.ok(r2.ok, r2.msg);
  assert.equal(st.players[0].score, 4, '两块城市 2×2 分');
  assert.equal(st.players[0].meeples, 7, '城市完成后米宝收回');
  assert.equal(st.board['0,-1'].meeple, null);
}

function testRoadScore() {
  const st = C.createInitial([{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], () => 0.5);
  // 起始板块南边是道路；放一张道路直板块接上，形成两端封闭的道路
  st.cur = 15; // roadStraight RFRF，旋转 0 时南北为道路
  const r1 = C.act(st, { type: 'place', x: 0, y: 1, rot: 0 }, 'a');
  assert.ok(r1.ok, r1.msg);
  const r2 = C.act(st, { type: 'meeple', k: 'road', i: 0 }, 'a');
  assert.ok(r2.ok, r2.msg);
  assert.equal(st.players[0].score, 0, '直路还有一端没接，暂不计分');
}

function testMonasteryScore() {
  const st = C.createInitial([{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }], () => 0.5);
  const keep = st.deck;
  st.board = {};
  st.board['0,0'] = { x: 0, y: 0, t: 13, r: 0, meeple: { p: 'a', k: 'mon', i: 0, x: 0, y: 0 } };
  st.players[0].meeples = 6;
  // 围满 8 格
  let n = 0;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    if (!dx && !dy) continue;
    st.board[dx + ',' + dy] = { x: dx, y: dy, t: 7, r: 0, meeple: null };
    n++;
  }
  st.deck = [];
  st.cur = 7;
  st.phase = 'playing';
  st.step = 'meeple';
  st.last = { x: 0, y: 0 };
  const r = C.act(st, { type: 'meeple', k: 'none' }, 'a');
  assert.ok(r.ok, r.msg);
  assert.ok(st.players[0].score >= 9, '修道院完成得 9 分');
}

function testFullGame() {
  const st = C.createInitial([
    { id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '丙' }
  ], () => 0.5);
  let guard = 0;
  while (st.phase !== 'ended' && guard++ < 400) {
    if (st.step === 'place') {
      const ps = C.placements(st);
      assert.ok(ps.length > 0, '还有可落子的位置');
      const cell = ps[Math.floor(Math.random() * ps.length)];
      const rot = cell.rots[Math.floor(Math.random() * cell.rots.length)];
      const r = C.act(st, { type: 'place', x: cell.x, y: cell.y, rot: rot }, st.players[st.turn].id);
      assert.ok(r.ok, r.msg);
    } else if (st.step === 'meeple') {
      const opts = C.meepleOptions(st, st.last.x, st.last.y).filter((o) => !o.blocked);
      let mv = { type: 'meeple', k: 'none' };
      if (opts.length && st.players[st.turn].meeples > 0 && Math.random() < 0.6) {
        const o = opts[Math.floor(Math.random() * opts.length)];
        mv = { type: 'meeple', k: o.k, i: o.i };
      }
      const r = C.act(st, mv, st.players[st.turn].id);
      assert.ok(r.ok, r.msg);
    } else break;
  }
  assert.equal(st.phase, 'ended', '牌堆耗尽后进入终局');
  assert.ok(Object.keys(st.board).length >= 60, '绝大多数板块都放下（放不下的按规则弃掉）');
  assert.ok(Object.keys(st.board).length <= 72, '板块数量不超过 72');
  assert.ok(st.winner, '有胜者');
  const totalMeeple = st.players.reduce((a, p) => a + p.meeples, 0);
  assert.ok(totalMeeple <= 21, '米宝没有凭空增加');
  console.log('整局完成，分数：', st.players.map((p) => p.name + ' ' + p.score).join(' / '));
  console.log('米宝剩余：', st.players.map((p) => p.meeples).join('/'));
}

testBasic();
testCityScore();
testRoadScore();
testMonasteryScore();
testFullGame();
console.log('carcassonne.test OK');

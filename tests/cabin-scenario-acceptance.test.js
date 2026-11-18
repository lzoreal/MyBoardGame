// 独立官方规则验收：期望值直接写官方规则，不从剧本 JSON 推导
// 覆盖本轮修复的 P0，以及 #6/#7/#17/#18 的状态落地
const fs = require('fs');
const path = require('path');
let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); }
}
function seeded(n) { let s = n || 1; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
const packsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8');
global.window = global;
eval(packsSrc);
eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'));
const E = window.CabinEngine;
function scenario(no) { return E.SCENARIOS.find((x) => x.no === no); }
function start(no, n) {
  const ids = Array.from({ length: n }, (_, i) => ({ id: 'a' + i, name: 'A' + i }));
  const st = E.createInitial(ids, seeded(no * 31 + n), { skipSelect: true });
  E.helpers.startHaunt(st, 0, '骨戒', '入口大厅', seeded(no * 17 + n), JSON.parse(JSON.stringify(scenario(no))));
  return st;
}
function monsters(st, key) { return st.monsters.filter((m) => (m.key || m.name) === key).length; }

// 官方 Setup 数量表，直接按官方卡写死
const CHERUB_TOTAL = { 3: 6, 4: 8, 5: 10, 6: 12 };
const SECURITY_TOTAL = { 3: 4, 4: 5, 5: 6, 6: 7 };
const DISEASE_TRAITORS = { 3: 1, 4: 1, 5: 1, 6: 2 };

console.log('=== #5 石中血：每名英雄 1 只 + 额外 3/4/5/6 只 ===');
for (const n of [3, 4, 5, 6]) {
  const st = start(5, n);
  ok('#5 ' + n + ' 人共 ' + CHERUB_TOTAL[n] + ' 只', monsters(st, 'cherub') === CHERUB_TOTAL[n], monsters(st, 'cherub'));
}

console.log('=== #37 一线鬼机：叛徒 1 台 + 每名英雄 1 台 ===');
for (const n of [3, 4, 5, 6]) {
  const st = start(37, n);
  ok('#37 ' + n + ' 人共 ' + SECURITY_TOTAL[n] + ' 台', monsters(st, 'security') === SECURITY_TOTAL[n], monsters(st, 'security'));
}

console.log('=== #3 尘埃：疾病 1 号数量与叛徒阵营 ===');
for (const n of [3, 4, 5, 6]) {
  const st = start(3, n);
  ok('#3 ' + n + ' 人 ' + DISEASE_TRAITORS[n] + ' 个叛徒', st.haunt.traitors.length === DISEASE_TRAITORS[n], JSON.stringify(st.haunt.traitors));
  ok('#3 ' + n + ' 人疾病 1 号数量正确', (st.haunt.setup.diseaseOneIds || []).length === DISEASE_TRAITORS[n], JSON.stringify(st.haunt.setup.diseaseOneIds));
  ok('#3 ' + n + ' 人叛徒阵营人数正确', st.players.filter((p) => p.side === 'traitor').length === DISEASE_TRAITORS[n], st.players.map((p) => p.side).join(','));
}

console.log('=== #13 圣地：叛徒恢复全部属性、力量 +1、速度 +1 ===');
{
  const st = start(13, 3);
  const tr = st.players[st.haunt.traitor];
  ok('#13 力量 +1', tr.track.might.pos === tr.track.might.startPos + 1, tr.track.might.pos);
  ok('#13 速度 +1', tr.track.speed.pos === tr.track.speed.startPos + 1, tr.track.speed.pos);
  ok('#13 知识恢复', tr.track.known.pos === tr.track.known.startPos, tr.track.known.pos);
  ok('#13 神智恢复', tr.track.sanity.pos === tr.track.sanity.startPos, tr.track.sanity.pos);
}

console.log('=== #15 群魔乱舞：叛徒角色死亡、怪物控制权转移 ===');
{
  const st = start(15, 3);
  ok('#15 叛徒角色死亡', st.players[st.haunt.traitor].dead === true, st.players.map((p) => p.dead).join(','));
  ok('#15 怪物控制者记录', st.haunt.monsterController === st.haunt.traitor, st.haunt.monsterController);
  st.turn = 2;
  st.haunt.justStarted = false;
  const r = E.act(st, { type: 'end' }, st.players[2].id, () => 0.99);
  ok('#15 回合结束进入怪物阶段', r.ok && st.monsterTurn && st.monsterTurn.actor === st.players[st.haunt.traitor].id, st.monsterTurn && st.monsterTurn.actor);
  const w = start(15, 3);
  w.players.filter((p) => p.side === 'hero').forEach((p) => { p.dead = true; });
  E.helpers.checkWin(w);
  ok('#15 英雄全灭时怪物控制者获胜', w.phase === 'ended' && w.winner && w.winner.side === 'traitor', w.winner && w.winner.text);
}

console.log('=== #6/#7/#17/#18 Setup 状态 ===');
{
  const st6 = start(6, 3);
  ok('#6 证据标记 8 个', (st6.haunt.setup.evidenceTokens || []).length === 8, JSON.stringify(st6.haunt.setup.evidenceTokens));
  ok('#6 证据分布多个区域', new Set((st6.haunt.setup.evidenceTokens || []).map((e) => e.floor)).size >= 2, JSON.stringify(st6.haunt.setup.evidenceTokens));
  const st7 = start(7, 3);
  ok('#7 镜界状态建立', !!st7.haunt.mirrorRealm && st7.players[st7.haunt.revealer].trapped === true, JSON.stringify(st7.haunt.mirrorRealm));
  const st17 = start(17, 3);
  ok('#17 纸条发给具体英雄', !!st17.haunt.dieNote && !!st17.haunt.dieNote.holder && st17.players.find((p) => p.id === st17.haunt.dieNote.holder).note === 'DIE', JSON.stringify(st17.haunt.dieNote));
  const st18 = start(18, 3);
  ok('#18 叛徒离场且真身记录', st18.players[st18.haunt.traitor].outside === true && st18.haunt.trueBody === st18.haunt.traitor, st18.haunt.trueBody);
}

console.log('---');
console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.join('\n'));
process.exitCode = failed ? 1 : 0;

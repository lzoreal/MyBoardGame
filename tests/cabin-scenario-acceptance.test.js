// 独立官方规则验收：期望值直接写官方规则，不从剧本 JSON 推导
// 覆盖本轮修复的 P0，以及 #6/#7/#17/#18 的状态落地
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let passed = 0, failed = 0;
const fails = [];
function ok(name, cond, extra) {
  if (cond) { passed++; console.log('  ok   ' + name); }
  else { failed++; fails.push(name + (extra === undefined ? '' : ' -> ' + extra)); console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); }
}
function seeded(n) { let s = n || 1; return function () { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
const packsSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin-packs.js'), 'utf8');
global.window = global;
vm.runInThisContext(packsSrc, { filename: 'cabin-packs.js' });
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'cabin.js'), 'utf8'), { filename: 'cabin.js' });
const E = window.CabinEngine;
const TRAITS = ['might', 'speed', 'known', 'sanity'];
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

console.log('=== 50 剧本 3–6 人开局不得自动判胜 ===');
{
  let ended = [];
  for (const sc of E.SCENARIOS) {
    for (const n of [3, 4, 5, 6]) {
      const st = start(sc.no, n);
      E.helpers.checkWin(st);
      if (st.phase === 'ended') ended.push('#' + sc.no + '/' + n + 'p:' + (st.winner && st.winner.side));
    }
  }
  ok('50 剧本 × 3–6 人 Setup 后均未自动结束', ended.length === 0, ended.join(','));
  const st24 = start(24, 5);
  ok('#24 5 人精灵之火仍只算实际拾取，不因 Setup 直接胜利', st24.phase === 'playing', st24.phase);
  const st50 = start(50, 3);
  ok('#50 3 人炸药 Setup 不满足每层爆破目标', st50.phase === 'playing', st50.phase);
}

console.log('=== #40 血肉行者归来：3–6 人双胞胎数量与猎杀目标一致 ===');
for (const n of [3, 4, 5, 6]) {
  const st = start(40, n);
  const need = st.haunt.heroGoal.needByPlayers[n];
  ok('#40 ' + n + ' 人双胞胎 ' + need + ' 只', st.monsters.filter((m) => m.type === 'twins').length === need,
    st.monsters.filter((m) => m.type === 'twins').length + '/' + need);
}

console.log('=== #34 维度改写必须由行动触发 ===');
{
  const st = start(34, 3);
  ok('#34 Setup 后不因维度标记直接胜利', st.phase === 'playing', st.phase);
  ok('#34 维度行动存在', !!(st.haunt.actions || []).find((a) => a.key === 'shift_dimension'));
}

console.log('=== 仪式型剧本的道具/地点前置 ===');
{
  const st4 = start(4, 3);
  ok('#4 仪式房真实在场', !!E.helpers.roomByName(st4, '仪式房'));
  const st16 = start(16, 3);
  ok('#16 遗骸 4 个', E.helpers.countTokens(st16, '遗骸', {}) === 4, E.helpers.countTokens(st16, '遗骸', {}));
  ok('#16 收集遗骸行动存在', (st16.haunt.actions || []).some((a) => a.key === 'collect_relic'));
  const st25 = start(25, 3);
  ok('#25 军械库真实在场', !!E.helpers.roomByName(st25, '军械库'));
  ok('#25 法术材料必须通过四次寻找行动获得，Setup 不直接放置',
    E.helpers.countTokens(st25, '法术材料', {}) === 0 &&
    ['find_sanity', 'find_might', 'find_known', 'find_speed'].every((k) => (st25.haunt.actions || []).some((a) => a.key === k)),
    E.helpers.countTokens(st25, '法术材料', {}));
  const st26 = start(26, 3);
  ok('#26 祭坛真实在场', E.helpers.countTokens(st26, '祭坛', {}) === 1, E.helpers.countTokens(st26, '祭坛', {}));
  const st29 = start(29, 3);
  ok('#29 仪式房真实在场', !!E.helpers.roomByName(st29, '仪式房'));
  ok('#29 妖精仍在场', st29.monsters.some((m) => !m.dead && m.type === 'fae'));
}

console.log('=== 伤害系统：类型与通用溢出 ===');
{
  const stG = start(2, 3);
  const p = stG.players[0];
  TRAITS.forEach((t) => { p.track[t].pos = 2; });
  const before = {};
  TRAITS.forEach((t) => { before[t] = p.track[t].pos; });
  const result = E.helpers.applyDamageSplit(stG, 0, 6, 'general', null, 0, { might: 6 });
  const lost = TRAITS.reduce((n, t) => n + (before[t] - p.track[t].pos), 0);
  ok('通用伤害溢出后总扣除严格等于 6', lost === 6, lost);
  ok('通用伤害不会重复计算到其他属性', result.total === 6, JSON.stringify(result));

  const st13 = start(13, 3);
  const tr = st13.players[st13.haunt.traitor];
  const ritual = E.helpers.roomByName(st13, '仪式房');
  tr.floor = ritual.floor; tr.x = ritual.x; tr.y = ritual.y;
  st13.turn = st13.players.indexOf(tr);
  E.act(st13, { type: 'hauntAction', key: 'advance_ritual' }, tr.id, () => 0);
  ok('#13 低档伤害类型为精神伤害', st13.pendingDamage && st13.pendingDamage.kind === 'mental', JSON.stringify(st13.pendingDamage));
  const sanityBefore = tr.track.sanity.pos;
  E.act(st13, { type: 'allocateDamage', first: 'sanity', second: 0 }, tr.id, () => 0.99);
  ok('#13 1 点精神伤害落在神智轨道', tr.track.sanity.pos === sanityBefore - 1, tr.track.sanity.pos);
}

const DAMAGE_TYPES = ['physical', 'mental', 'general'];
const badDamage = [];
for (const sc of E.SCENARIOS) {
  for (const a of sc.actions || []) {
    for (const tier of a.tiers || []) {
      const t = tier.do && tier.do.damage && tier.do.damage.type;
      if (t && DAMAGE_TYPES.indexOf(t) < 0) badDamage.push(sc.no + ':' + a.key + ':' + t);
    }
  }
}
ok('剧本行动伤害类型只用 physical/mental/general', badDamage.length === 0, badDamage.join(','));

const six = E.createInitial(Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, name: 'P' + i })), () => 0.5, { skipSelect: true });
ok('6 人局每名玩家都有四项属性轨道', six.players.every((p) => p.track && ['speed', 'might', 'sanity', 'known'].every((k) => p.track[k])), six.players.map((p) => !!p.track).join(','));
ok('6 人局使用 6 块不同人物板', new Set(six.players.map((p) => p.boardId)).size === 6, six.players.map((p) => p.boardId).join(','));

console.log('---');
console.log((failed ? 'FAILED ' : 'PASS ') + passed + (failed ? ', FAILED ' + failed : ''));
if (fails.length) console.log(fails.join('\n'));
process.exitCode = failed ? 1 : 0;

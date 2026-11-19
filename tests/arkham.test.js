/* 诡镇奇谈引擎单测 */
global.window = global.window || {};
require('../js/games/arkham.js');
const E = global.window.ArkhamEngine;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name + (extra ? ' = ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' = ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, a + ' / ' + b); }
function rngHigh() { return 0.999; }
function rngMid() { return 0.5; }

console.log('— 开局与检定');
let st = E.createInitial([], rngMid, { investigator: 'detective' });
eq('阶段为调查', st.phase, 'investigation');
eq('手牌 5 张', st.inv.hand.length, 5);
eq('行动 3 点', st.inv.actions, 3);
eq('起始地点', st.inv.location, 'study');
eq('书房线索 2', st.locations.study.clues, 2);
eq('混沌袋 14 枚', st.chaos.length, 14);

const inv = st.inv;
st = E.act(st, { type: 'investigate' }, inv.id, rngHigh).state;
ok('调查成功', !!st.lastTest && st.lastTest.success, st.lastTest.total + ' vs 2');
eq('书房线索减 1', st.locations.study.clues, 1);
eq('调查员线索 1', st.inv.clues, 1);
eq('调查消耗 1 行动', st.inv.actions, 2);

console.log('— 移动与敌人');
st = E.act(st, { type: 'move', to: 'hallway' }, inv.id, rngMid).state;
eq('移动到走廊', st.inv.location, 'hallway');
const badMove = E.act(st, { type: 'move', to: 'parlor' }, inv.id, rngMid);
eq('非法路线被拒', badMove.ok, false);

console.log('— 密谋推进与 Boss');
st.inv.clues = 3;
st = E.act(st, { type: 'advanceAct' }, inv.id, rngMid).state;
eq('密谋进入第二幕', st.act.stage, 2);
ok('Boss 出现在地下室', st.enemies.length === 1 && st.enemies[0].boss, st.enemies[0] && st.enemies[0].name);
st.inv.location = 'cellar';
st.inv.actions = 3;
let guard = 0;
while (st.phase !== 'ended' && guard++ < 20) {
  st.inv.actions = 3;
  st = E.act(st, { type: 'fight', enemy: st.enemies[0].id }, inv.id, rngHigh).state;
}
ok('击败 Boss 后胜利', st.phase === 'ended' && st.resolution.result === 'win', st.resolution && st.resolution.text);
eq('Boss 生命归零', st.enemies[0].health <= 0, true);

console.log('— 议程失败');
let st2 = E.createInitial([], rngMid, { investigator: 'reporter' });
st2.agenda.doom = 3;
st2.inv.actions = 0;
st2 = E.act(st2, { type: 'endTurn' }, st2.inv.id, rngMid).state;
ok('议程推进到第二幕', st2.agenda.stage === 2 || st2.phase === 'ended', st2.agenda.stage);
st2.agenda.doom = 7;
st2.phase = 'investigation'; st2.inv.actions = 0;
st2 = E.act(st2, { type: 'endTurn' }, st2.inv.id, rngMid).state;
eq('议程爆掉即失败', st2.resolution && st2.resolution.result, 'lose');

console.log('— 出牌');
let st3 = E.createInitial([], rngHigh, { investigator: 'scholar' });
st3.inv.hand = ['pistol'];
st3.inv.resources = 6;
st3 = E.act(st3, { type: 'play', index: 0 }, st3.inv.id, rngHigh).state;
ok('手枪作为资产入场', st3.inv.assets.indexOf('pistol') >= 0, st3.inv.assets.join(','));
eq('资源扣 3', st3.inv.resources, 3);
ok('资产提供战力加成', E.helpers.totalStat(st3, st3.inv, 'combat') === 3, E.helpers.totalStat(st3, st3.inv, 'combat'));

console.log('— 第二章：午夜狂欢');
let m = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight' });
eq('章节为第二章', m.scenario, 'midnight');
eq('城市地点 7 个', Object.keys(m.locations).length, 7);
eq('起点北区', m.inv.location, 'northside');
eq('五名邪教徒入场', m.enemies.filter((e) => e.cultist && e.health > 0).length, 5);
eq('初始没有 Boss', m.enemies.filter((e) => e.boss).length, 0);
eq('议程第一段 5 doom', m.agenda.max, 5);
eq('密谋目标 3 名', m.act.cultists, 3);
const noAdv = E.act(m, { type: 'advanceAct' }, m.inv.id, rngHigh);
eq('第二章不能手动推进密谋', noAdv.ok, false);

// 逐个解决 3 名邪教徒
const cultistLocs = ['university', 'downtown', 'easttown'];
for (let i = 0; i < 3; i++) {
  m.inv.location = cultistLocs[i];
  m.inv.actions = 3;
  const target = m.enemies.find((e) => e.cultist && e.location === cultistLocs[i] && e.health > 0);
  target.health = 1;
  m = E.act(m, { type: 'fight', enemy: target.id }, m.inv.id, rngHigh).state;
  eq('击败第 ' + (i + 1) + ' 名邪教徒', m.cultistsFound, i + 1);
}
eq('三名后密谋进入第二幕', m.act.stage, 2);
ok('主持者在南教堂现身', m.enemies.some((e) => e.boss && e.location === 'church' && e.health > 0));
eq('南教堂已揭示', m.locations.church.revealed, true);

const boss = m.enemies.find((e) => e.boss && e.health > 0);
m.inv.location = 'church';
m.inv.actions = 3;
boss.health = 1;
m = E.act(m, { type: 'fight', enemy: boss.id }, m.inv.id, rngHigh).state;
ok('击败主持者完成第二章', m.phase === 'ended' && m.resolution.result === 'win', m.resolution && m.resolution.text);

let r = E.createInitial([], rngHigh, { investigator: 'reporter', scenario: 'midnight' });
r = E.act(r, { type: 'resign' }, r.inv.id, rngHigh).state;
eq('可以撤退', r.resolution && r.resolution.result, 'resign');
ok('撤退文案提到撤离', /撤出/.test(r.resolution.text), r.resolution.text);

let mf = E.createInitial([], rngHigh, { investigator: 'scholar', scenario: 'midnight' });
mf.enemies = [];
mf.agenda.stage = 2; mf.agenda.max = 9; mf.agenda.doom = 8;
mf.inv.actions = 0;
mf = E.act(mf, { type: 'endTurn' }, mf.inv.id, rngHigh).state;
ok('午夜议程爆掉失败', mf.phase === 'ended' && mf.resolution.result === 'lose', mf.resolution && mf.resolution.text);

let mr = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight' });
mr = E.act(mr, { type: 'restart' }, mr.inv.id, rngHigh).state;
eq('重开保持第二章', mr.scenario, 'midnight');

console.log('— 调查员成长与第二章审问');
let up = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight', upgrades: { health: 1, combat: 1, will: 1 } });
eq('升级后生命上限 +1', up.inv.maxHealth, 10);
eq('升级后战力 +1', up.inv.stats.combat, 5);
eq('升级后意志 +1', up.inv.stats.will, 4);

let iq = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight' });
iq.inv.location = 'university';
iq.inv.actions = 3;
const qtarget = iq.enemies.find((e) => e.cultist && e.location === 'university');
qtarget.health = 1;
iq = E.act(iq, { type: 'fight', enemy: qtarget.id }, iq.inv.id, rngHigh).state;
ok('击败邪教徒后进入待审问', !!iq.pendingInterrogation, iq.pendingInterrogation && iq.pendingInterrogation.name);
iq.agenda.doom = 2;
iq = E.act(iq, { type: 'interrogate', choice: 'ritual' }, iq.inv.id, rngHigh).state;
eq('追问仪式让 doom −1', iq.agenda.doom, 1);
ok('审问结束后清空', iq.pendingInterrogation === null);

let rt = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight' });
rt.enemies = [];
rt.ritual.left = 1;
rt.inv.actions = 0;
rt = E.act(rt, { type: 'endTurn' }, rt.inv.id, rngHigh).state;
eq('仪式倒计时归零', rt.ritual.left, 0);
ok('归零后标记首领强化', rt.flags.ritualOver === true);

console.log('— 第三章：深渊之下');
let a = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'abyss' });
eq('第三章章节', a.scenario, 'abyss');
eq('深渊地点 6 个', Object.keys(a.locations).length, 6);
eq('起点洞口', a.inv.location, 'mouth');
eq('三座仪式节点', a.sigilsLeft, 3);
eq('初始没有吞噬者', a.enemies.filter((e) => e.boss).length, 0);
eq('潮水倒计时 10', a.ritual.left, 10);

for (const loc of ['tunnel', 'lake', 'rift']) {
  a.inv.location = loc;
  a.inv.actions = 3;
  a = E.act(a, { type: 'breakSigil', at: loc }, a.inv.id, rngHigh).state;
  ok('熄灭节点：' + loc, !a.locations[loc].sigil);
}
eq('节点全灭', a.sigilsLeft, 0);
eq('密谋进入第二幕', a.act.stage, 2);
ok('吞噬者在深渊边缘现身', a.enemies.some((e) => e.boss && e.location === 'edge'));

const dev = a.enemies.find((e) => e.boss && e.health > 0);
a.inv.location = 'edge';
a.inv.actions = 3;
dev.health = 1;
a = E.act(a, { type: 'fight', enemy: dev.id }, a.inv.id, rngHigh).state;
ok('击败吞噬者完成第三章', a.phase === 'ended' && a.resolution.result === 'win', a.resolution && a.resolution.text);

let af = E.createInitial([], rngHigh, { investigator: 'scholar', scenario: 'abyss' });
af.enemies = [];
af.agenda.stage = 2; af.agenda.max = 10; af.agenda.doom = 9;
af.inv.actions = 0;
af = E.act(af, { type: 'endTurn' }, af.inv.id, rngHigh).state;
ok('深渊议程爆掉失败', af.phase === 'ended' && af.resolution.result === 'lose', af.resolution && af.resolution.text);

console.log('— 第三章随机整局不崩');
for (let t = 0; t < 3; t++) {
  let s = E.createInitial([], Math.random, { investigator: ['detective', 'scholar', 'medium'][t], scenario: 'abyss' });
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < 120) {
    const here = s.enemies.find((e) => e.health > 0 && e.location === s.inv.location);
    let a = { type: 'endTurn' };
    if (s.inv.actions > 0) {
      if (here && here.boss) a = { type: 'fight', enemy: here.id };
      else if (s.locations[s.inv.location].sigil && s.act.stage === 1) a = { type: 'breakSigil', at: s.inv.location };
      else if (here) a = { type: 'fight', enemy: here.id };
      else a = { type: 'move', to: s.locations[s.inv.location].links[Math.floor(Math.random() * s.locations[s.inv.location].links.length)] };
    }
    const r = E.act(s, a, s.inv.id, Math.random);
    if (r.state) s = r.state;
  }
  ok('第三章第 ' + (t + 1) + ' 局跑到结束', s.phase === 'ended', s.resolution && s.resolution.result);
  ok('第三章生命值没有负数', s.inv.damage >= 0 && s.inv.horror >= 0, s.inv.damage + '/' + s.inv.horror);
}

for (let t = 0; t < 4; t++) {
  let s = E.createInitial([], Math.random, { investigator: ['detective', 'scholar', 'medium', 'reporter'][t], scenario: 'midnight' });
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < 120) {
    const here = s.enemies.find((e) => e.health > 0 && e.location === s.inv.location);
    let a = { type: 'endTurn' };
    if (s.inv.actions > 0) {
      a = here ? { type: 'fight', enemy: here.id } : { type: 'move', to: s.locations[s.inv.location].links[Math.floor(Math.random() * s.locations[s.inv.location].links.length)] };
      if (Math.random() < 0.08) a = { type: 'resign' };
    }
    const r = E.act(s, a, s.inv.id, Math.random);
    if (r.state) s = r.state;
  }
  ok('第二章第 ' + (t + 1) + ' 局跑到结束', s.phase === 'ended', s.resolution && s.resolution.result);
  ok('第二章生命值没有负数', s.inv.damage >= 0 && s.inv.horror >= 0, s.inv.damage + '/' + s.inv.horror);
}

for (let t = 0; t < 6; t++) {
  let s = E.createInitial([], Math.random, { investigator: ['detective', 'scholar', 'medium', 'reporter'][t % 4] });
  let steps = 0;
  while (s.phase !== 'ended' && steps++ < 120) {
    const a = s.inv.actions > 0 ? [
      { type: 'move', to: s.locations[s.inv.location].links[0] },
      { type: 'investigate' },
      { type: 'resource' },
      { type: 'draw' },
      { type: 'advanceAct' },
      { type: 'endTurn' }
    ][Math.floor(Math.random() * 6)] : { type: 'endTurn' };
    const r = E.act(s, a, s.inv.id, Math.random);
    if (r.state) s = r.state;
    if (s.inv.clues >= 3 && s.act.stage === 1) s = E.act(s, { type: 'advanceAct' }, s.inv.id, Math.random).state;
    if (s.phase === 'ended') break;
  }
  ok('第 ' + (t + 1) + ' 局跑到结束', s.phase === 'ended', s.resolution && s.resolution.result);
  ok('生命值没有被负数污染', s.inv.damage >= 0 && s.inv.horror >= 0, s.inv.damage + '/' + s.inv.horror);
}

console.log('— 新调查员与新卡');
eq('调查员共 6 名', E.INVESTIGATORS.length, 6);
ok('连发左轮已加入卡池', !!E.CARDS.revolver);
ok('旧词典已加入卡池', !!E.CARDS.book);
ok('医疗包已加入卡池', !!E.CARDS.medkit);
ok('旧念珠已加入卡池', !!E.CARDS.rosary);
ok('狠击已加入卡池', !!E.CARDS.vicious);
ok('侥幸已加入卡池', !!E.CARDS.lucky);

let gear = E.createInitial([], rngHigh, { investigator: 'guardian' });
gear.inv.hand = ['revolver'];
gear.inv.resources = 6;
gear.inv.actions = 3;
gear = E.act(gear, { type: 'play', index: 0 }, gear.inv.id, rngHigh).state;
eq('左轮提供 +2 战力', E.helpers.totalStat(gear, gear.inv, 'combat'), 6);
ok('左轮提供伤害加值', E.CARDS.revolver.damage === 1);

let smashState = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight' });
smashState.inv.location = 'university';
const smashTarget = smashState.enemies.find((e) => e.location === 'university');
smashTarget.health = 6; smashTarget.maxHealth = 6;
smashState.inv.actions = 3; smashState.inv.resources = 5; smashState.inv.hand = ['vicious'];
smashState = E.act(smashState, { type: 'play', index: 0 }, smashState.inv.id, rngHigh).state;
eq('狠击造成 3 点伤害', smashTarget.health, 3);

let luckyState = E.createInitial([], rngHigh, { investigator: 'scholar' });
luckyState.locations.study.shroud = 4;
luckyState.flags.lucky = true;
luckyState.inv.actions = 3;
luckyState = E.act(luckyState, { type: 'investigate' }, luckyState.inv.id, rngMid).state;
ok('侥幸提供 +2 并转为成功', luckyState.lastTest.success && luckyState.lastTest.bonus === 2, JSON.stringify(luckyState.lastTest));

let mull = E.createInitial([], rngHigh, { investigator: 'detective' });
mull = E.act(mull, { type: 'mulligan' }, mull.inv.id, rngHigh).state;
eq('重抽后仍是 5 张手牌', mull.inv.hand.length, 5);
eq('重抽保留 3 行动', mull.inv.actions, 3);
eq('重抽只能用一次', mull.mulliganAvailable, false);
const mull2 = E.act(mull, { type: 'mulligan' }, mull.inv.id, rngHigh);
eq('第二次重抽被拒', mull2.ok, false);

console.log('— 资产承伤与被动');
let soak = E.createInitial([], rngHigh, { investigator: 'scholar' });
soak.inv.hand = ['medkit']; soak.inv.resources = 5; soak.inv.actions = 3;
soak = E.act(soak, { type: 'play', index: 0 }, soak.inv.id, rngHigh).state;
E.helpers.takeDamage(soak, soak.inv, 2);
eq('医疗包承受 2 点伤害', soak.inv.damage, 0);
ok('医疗包耗尽后离场', soak.inv.assets.indexOf('medkit') < 0, soak.inv.assets.join(','));

let allyState = E.createInitial([], rngHigh, { investigator: 'detective' });
allyState.inv.hand = ['ally']; allyState.inv.resources = 5; allyState.inv.actions = 3;
allyState = E.act(allyState, { type: 'play', index: 0 }, allyState.inv.id, rngHigh).state;
E.helpers.takeDamage(allyState, allyState.inv, 1);
eq('老友替英雄承受 1 点伤害', allyState.inv.damage, 0);
ok('老友受伤后离场', allyState.inv.assets.indexOf('ally') < 0, allyState.inv.assets.join(','));

let guardState = E.createInitial([], rngHigh, { investigator: 'guardian' });
E.helpers.takeDamage(guardState, guardState.inv, 2);
eq('退伍保安每回合首次少受 1 点', guardState.inv.damage, 1);
E.helpers.takeDamage(guardState, guardState.inv, 2);
eq('同回合第二次不再减伤', guardState.inv.damage, 3);

let surv = E.createInitial([], rngHigh, { investigator: 'survivor' });
const resBefore = surv.inv.resources;
E.helpers.takeDamage(surv, surv.inv, 1);
eq('流浪者受伤获得 1 资源', surv.inv.resources, resBefore + 1);

let traumaState = E.createInitial([], rngHigh, { investigator: 'detective', trauma: 2 });
eq('2 点创伤降低生命上限', traumaState.inv.maxHealth, 8);
eq('2 点创伤降低理智上限', traumaState.inv.maxSanity, 4);

console.log('— 交战与借机攻击');
let eng = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight' });
eng.inv.location = 'university';
const engTarget = eng.enemies.find((e) => e.location === 'university');
engTarget.engaged = true;
eng.inv.actions = 3;
const engDamage = eng.inv.damage;
eng = E.act(eng, { type: 'move', to: 'downtown' }, eng.inv.id, rngHigh).state;
eq('离开交战时受到借机攻击', eng.inv.damage, engDamage + engTarget.damage);
eq('借机攻击后仍可移动', eng.inv.location, 'downtown');

let tired = E.createInitial([], rngHigh, { investigator: 'detective', scenario: 'midnight' });
tired.inv.location = 'university';
const tiredTarget = tired.enemies.find((e) => e.location === 'university');
tiredTarget.exhausted = true; tiredTarget.engaged = false;
tired.inv.actions = 0;
tired.encounter.deck = [{ key: 'ritual', name: '黑暗仪式', text: '议程 +1 doom。' }];
const tiredDamage = tired.inv.damage;
tired = E.act(tired, { type: 'endTurn' }, tired.inv.id, rngHigh).state;
eq('疲惫敌人本回合不攻击', tired.inv.damage, tiredDamage);
eq('敌影阶段结束后恢复', tiredTarget.exhausted, false);
eq('恢复后重新交战', tiredTarget.engaged, true);

console.log('\n通过 ' + pass + '，失败 ' + fail);
if (fail) process.exit(1);

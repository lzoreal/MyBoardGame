global.window = global;
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
eval(fs.readFileSync(path.join(root, 'js/games/cabin-packs.js'), 'utf8'));
eval(fs.readFileSync(path.join(root, 'js/games/cabin.js'), 'utf8'));
const E = window.CabinEngine;
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra === undefined ? '' : ' -> ' + extra)); } }

const st = E.createInitial([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], Math.random, { skipSelect: true });
const p = st.players[0];
console.log('=== 属性轨道 ===');
ok('安妮塔速度轨道按卡面 2·3·4·4·5·6·7·8', JSON.stringify(p.track.speed.list) === JSON.stringify([2,3,4,4,5,6,7,8]), JSON.stringify(p.track.speed.list));
ok('起始标记在 5', p.traits.speed === 5 && p.track.speed.pos === 5);
E.helpers.applyDamageSplit(st, 0, 2, 'physical', 'speed', 0);
ok('受 2 点伤害后走到第二个 4（数值只降 1）', p.traits.speed === 4 && p.track.speed.pos === 3, p.traits.speed + '/' + p.track.speed.pos);
E.helpers.healTrait(st, 0, 'speed', 99);
ok('治疗回到起始位置 5', p.traits.speed === 5 && p.track.speed.pos === 5);

console.log('=== General 伤害 ===');
const before = { might: p.track.might.pos, known: p.track.known.pos, sanity: p.track.sanity.pos };
E.helpers.applyDamageSplit(st, 0, 3, 'general', null, 0, { might: 1, known: 1, sanity: 1 });
ok('通用伤害能分到力量/知识/神智三条轨道', p.track.might.pos === before.might - 1 && p.track.known.pos === before.known - 1 && p.track.sanity.pos === before.sanity - 1);
ok('通用伤害没有动速度', p.track.speed.pos === 5);

console.log('=== 闹鬼前不死 / 闹鬼后到骷髅 ===');
p.track.sanity.pos = 1; p.traits.sanity = 2;
E.helpers.applyDamageSplit(st, 0, 5, 'mental', 'sanity', 0);
ok('闹鬼前伤害停在最低格，不死亡', p.track.sanity.pos === 1 && !p.dead);
st.haunt = { active: true, traitor: 1, actions: [], traitorRule: 'revealer' };
p.items = [{ name: '手电筒' }];
E.helpers.applyDamageSplit(st, 0, 1, 'mental', 'sanity', 0);
ok('闹鬼后走到骷髅即死亡', p.dead && p.corpse === true);
ok('死亡后牌仍留在人物板旁', p.items.length === 1 && p.items[0].name === '手电筒');

console.log('=== 尸体搜刮 ===');
const dead = st.players[0], looter = st.players[1];
looter.floor = dead.floor; looter.x = dead.x; looter.y = dead.y;
st.turn = 1; st.looted = false;
const loot = E.act(st, { type: 'lootCorpse', target: 0, index: 0 }, 'b', Math.random);
ok('同房间可以拿走尸体上的一张牌', loot.ok && looter.items.some((it) => it.name === '手电筒') && !dead.items.length);
const loot2 = E.act(st, { type: 'lootCorpse', target: 0, index: 0 }, 'b', Math.random);
ok('每回合只能搜刮一次', !loot2.ok);

console.log('=== 生日先手 ===');
st.now = '2026-06-05';
ok('6 月 5 日时安妮塔（6/11）的生日最近，先行动', E.helpers.firstByBirthday(st) === 0, E.helpers.firstByBirthday(st));

console.log('=== 双面人物板 ===');
const st2 = E.createInitial([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }], Math.random, {});
st2.players[0].char = null;
const pickA = E.act(st2, { type: 'pick', char: 'anita' }, 'x', Math.random);
ok('先选安妮塔成功', pickA.ok && st2.players[0].char === 'anita');
const pickB = E.act(st2, { type: 'pick', char: 'isa' }, 'y', Math.random);
ok('同一块黄色人物板的另一面被锁住', !pickB.ok);

console.log('=== 剧本卡选择 ===');
const st3 = E.createInitial([{ id: 'm', name: 'M' }, { id: 'n', name: 'N' }], Math.random, {});
st3.players.forEach((x, i) => { x.char = null; x.track = null; });
const sc = E.act(st3, { type: 'scenario', card: '诅咒' }, 'm', Math.random);
ok('选角阶段可以指定剧本卡', sc.ok && st3.scenarioCard === '诅咒');

console.log('=== 怪物规则打包 ===');
const P = window.CABIN_PACKS;
const cherub = P.scenarios.find((s) => s.key === 'official_3e_5').monster;
ok('不可被攻击的 noAttack 不再被构建器丢掉', cherub.noAttack === true);

console.log('=== 多人交易 ===');
const tst = E.createInitial([{ id: 'u', name: 'U' }, { id: 'v', name: 'V' }, { id: 'w', name: 'W' }], Math.random, { skipSelect: true });
tst.turn = 0;
tst.players[0].items = [{ name: '甲' }, { name: '乙' }];
tst.players[1].items = [{ name: '丙' }];
tst.players[1].floor = tst.players[0].floor; tst.players[1].x = tst.players[0].x; tst.players[1].y = tst.players[0].y;
const offer = E.act(tst, { type: 'tradeOffer', target: 'v', giveIndexes: [0, 1], wantIndexes: [] }, 'u', Math.random);
ok('一次交易可以打包多张牌', offer.ok);
const done = E.act(tst, { type: 'tradeAccept' }, 'v', Math.random);
ok('接收方确认后两张牌一起转移', done.ok && tst.players[1].items.filter((it) => it.name === '甲' || it.name === '乙').length === 2);

console.log('=== 放房后自动结束回合 ===');
const pst = E.createInitial([{ id: 'p1', name: 'P1' }, { id: 'p2', name: 'P2' }], Math.random, { skipSelect: true });
pst.turn = 0; pst.moves = 2; pst.pendingTile = {
  tile: { name: '测试空房', doors: 'NSEW', floors: ['ground'], symbol: null, effect: null, special: null },
  floor: 'ground', x: pst.players[0].x + 1, y: pst.players[0].y, entry: 'E', cost: 1, legalRots: [0], player: 'p1', index: 0
};
const placed = E.act(pst, { type: 'placeTile', rot: 0 }, 'p1', Math.random);
ok('没有符号的新房放完后回合直接结束', placed.ok && pst.turn !== 0);

console.log('=== 剧本行动整局一次 ===');
const h = { active: true, actions: [{ key: 'big', name: '大胆登场', once: 'game', ops: {} }], turnUsed: {}, gameUsed: {}, used: {} };
const hst = E.createInitial([{ id: 'h1', name: 'H1' }, { id: 'h2', name: 'H2' }], Math.random, { skipSelect: true });
hst.haunt = h; hst.turn = 0;
const a1 = E.act(hst, { type: 'hauntAction', key: 'big' }, 'h1', Math.random);
const a2 = E.act(hst, { type: 'hauntAction', key: 'big' }, 'h1', Math.random);
ok('once:game 行动整局只能做一次', a1.ok && !a2.ok, a2.msg);

console.log('=== 人数缩放字段 ===');
const scaled = P.scenarios.find((s) => s.monster && s.monster.counts);
ok('构建器保留 counts（本批官方数据未提供则跳过）', scaled === undefined || typeof scaled.monster.counts === 'object');

console.log('=== 怪物规则标记 ===');
ok('不可僵直类怪物已从规则文本识别出来', P.scenarios.filter((s) => s.monster && s.monster.noStun).length >= 5);
ok('受伤即消灭类怪物已识别', P.scenarios.filter((s) => s.monster && s.monster.oneHit).length >= 2);
ok('巨型毛发怪只能用力量攻击', (P.scenarios.find((s) => s.monster && s.monster.attackOnly) || { monster: {} }).monster.attackOnly === 'might');
ok('Spooky 不能离开图书室', (P.scenarios.find((s) => s.monster && s.monster.boundRoom) || { monster: {} }).monster.boundRoom === '图书室');

console.log('=== 人数缩放与官方原文 ===');
const s7 = P.scenarios.find((s) => s.no === 7);
ok('镜中倒影 3 人局为 2 只镜中人', s7.monster.counts && s7.monster.counts['3'] === 2 && s7.monster.counts['6'] === 5);
const s38 = P.scenarios.find((s) => s.no === 38);
ok('邪恶侍从 5 人局为 5 个邻居', s38.monster.counts && s38.monster.counts['5'] === 5);
const withOfficial = P.scenarios.filter((s) => s.official && s.official.hero && s.official.hero.setup);
ok('50 条剧本都带官方原文分区', P.scenarios.filter((s) => s.official).length === 50, String(P.scenarios.filter((s) => s.official).length));
ok('50 条剧本都带中文对照', P.scenarios.filter((s) => s.official && s.official.zh && s.official.zh.hero).length === 50, String(P.scenarios.filter((s) => s.official && s.official.zh && s.official.zh.hero).length));
const s13 = P.scenarios.find((s) => s.no === 13);
ok('圣地能读出英雄 Setup 与叛徒 Setup', !!(s13.official.hero.setup && s13.official.traitor.setup));

console.log('=== 内容合同 ===');
ok('50 条剧本都带 factions', P.scenarios.every((s) => s.factions && s.factions.type), String(P.scenarios.filter((s) => !s.factions).length));
const needGoal = P.scenarios.filter((s) => s.factions.type === 'traitor_vs_heroes' || s.factions.type === 'hidden_traitor');
ok('叛徒剧本都有显式 traitorGoal', needGoal.every((s) => s.traitorGoal), String(needGoal.filter((s) => !s.traitorGoal).map((s) => s.no)));
ok('运行时没有默认 killAll 或 killTraitor', P.scenarios.every((s) => !(s.traitorGoal === null && s.factions.type === 'traitor_vs_heroes')));
const eventEmpty = P.events.filter((e) => !e.roll && !e.effect && !e.tiers && !e.win && !e.lose);
ok('43 张事件没有空分支', eventEmpty.length === 0, eventEmpty.map((e) => e.name).join(','));
const itemFields = ['weapon','testTrait','attackDice','attackResult','testBonus','armor','use','distance','noNormalAttack','mentalReduce','defenseDice','physicalToSanity','eventDice','endTurnHeal','knowledgeWithSanity','damageConvert','fate','teleport','extraTurn','wallMove','reroll'];
const itemEmpty = P.items.filter((it) => !itemFields.some((f) => it[f] !== undefined));
ok('22 张物品没有纯文本卡', itemEmpty.length === 0, itemEmpty.map((it) => it.name).join(','));

console.log('\n' + (fail ? '失败 ' + fail + '，通过 ' + pass : '全部通过：' + pass + ' passed, 0 failed'));
process.exit(fail ? 1 : 0);


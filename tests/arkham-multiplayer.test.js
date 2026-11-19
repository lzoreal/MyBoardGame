/* 诡镇多调查员、投入、牌库与资产规则测试 */
global.window = global.window || {};
require('../js/games/arkham.js');
const E = global.window.ArkhamEngine;
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name + (extra ? ' = ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' = ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, a + ' / ' + b); }
function rng() { return 0.5; }

console.log('— 多调查员开局与回合');
let st = E.createInitial([], rng, { investigators: ['detective', 'scholar'], scenario: 'gathering' });
eq('两名调查员', st.players.length, 2);
eq('当前调查员是第一位', st.inv.id, 'detective');
eq('两名调查员各 5 张手牌', st.players[0].hand.length + '/' + st.players[1].hand.length, '5/5');
const wrongTurn = E.act(st, { type: 'investigate' }, 'scholar', rng);
eq('非当前调查员不能行动', wrongTurn.ok, false);

st = E.act(st, { type: 'endTurn' }, 'detective', rng).state;
eq('结束第一人后轮到第二人', st.inv.id, 'scholar');
eq('第二人仍有 3 行动', st.inv.actions, 3);
eq('第一人标记回合结束', st.players[0].turnDone, true);

st = E.act(st, { type: 'endTurn' }, 'scholar', rng).state;
eq('两人都结束后进入下一轮', st.round, 2);
eq('下一轮从第一人开始', st.inv.id, 'detective');
eq('议程每轮只推进 1', st.agenda.doom, 1);

console.log('— 当前调查员倒下自动换人');
let down = E.createInitial([], rng, { investigators: ['detective', 'scholar'], scenario: 'gathering' });
down.players[0].damage = down.players[0].maxHealth - 1;
E.helpers.takeDamage(down, down.players[0], 1);
eq('倒下后轮到下一位', down.inv.id, 'scholar');
eq('倒下者标记回合结束', down.players[0].turnDone, true);
eq('仍处于调查阶段', down.phase, 'investigation');

console.log('— 分项成长、牌组与创伤');
let build = E.createInitial([], rng, {
  investigators: ['detective', 'scholar'],
  decks: { detective: ['pistol', 'knife'], scholar: ['book', 'insight'] },
  upgradesById: { detective: { combat: 1 }, scholar: { int: 2 } },
  traumas: { detective: { physical: 2, mental: 1 } }
});
eq('按调查员应用战力升级', build.players[0].stats.combat, 5);
eq('按调查员应用智力升级', build.players[1].stats.int, 7);
eq('物理创伤降低生命上限', build.players[0].maxHealth, 7);
eq('精神创伤降低理智上限', build.players[0].maxSanity, 4);
eq('按调查员应用牌组（2 张全抽走）', build.players[0].deck.length, 0);

console.log('— 全员倒下才失败');
st.players[1].damage = st.players[1].maxHealth;
E.helpers.takeDamage(st, st.players[1], 1);
eq('一人倒下但游戏继续', st.phase, 'investigation');
eq('倒下调查员被标记', st.players[1].defeated, true);
st.players[0].damage = st.players[0].maxHealth;
E.helpers.takeDamage(st, st.players[0], 1);
eq('全员倒下才失败', st.phase, 'ended');
eq('失败结果', st.resolution.result, 'lose');

console.log('— 卡牌投入检定');
let commit = E.createInitial([], rng, { investigator: 'scholar' });
commit.inv.hand = ['insight'];
commit.inv.actions = 3;
commit.locations.study.shroud = 4;
const cRes = E.act(commit, { type: 'investigate', commit: [0] }, commit.inv.id, rng);
eq('投入后仍在调查阶段', cRes.ok, true);
eq('投入卡牌提供 +1', commit.lastTest.commitBonus, 1);
eq('投入卡牌已离手', commit.inv.hand.length, 0);
ok('投入卡牌进入弃牌堆', commit.inv.discard.indexOf('insight') >= 0);

console.log('— 牌库验证与自定义牌组');
ok('合法牌组', E.validateDeck(['pistol', 'pistol'], { maxCopies: 2 }).ok);
ok('未知卡牌被识别', E.validateDeck(['pistol', 'not-a-card']).unknown.length === 1);
ok('空牌组不合法', E.validateDeck([]).ok === false);
const customDeck = E.createInitial([], rng, { investigator: 'detective', deck: ['pistol'] });
eq('自定义牌组只有 1 张', customDeck.inv.deck.length, 0);
eq('抽到自定义牌组唯一一张', customDeck.inv.hand.length, 1);
const badDeck = E.createInitial([], rng, { investigator: 'detective', deck: ['not-a-card'] });
ok('非法牌组回退基础牌组', badDeck.inv.deck.length + badDeck.inv.hand.length > 1);
ok('非法牌组给出警告', badDeck.inv.deckWarnings.length === 1, badDeck.inv.deckWarnings[0]);

console.log('— 手牌上限');
let hand = E.createInitial([], rng, { investigator: 'detective' });
hand.inv.hand = ['pistol', 'knife', 'knife', 'flashlight', 'charm', 'ally', 'medkit', 'firstAid', 'calm', 'smash'];
hand = E.act(hand, { type: 'endTurn' }, hand.inv.id, rng).state;
eq('维护后手牌不超过 8', hand.inv.hand.length, 8);

console.log('— 资产主动使用与疲惫');
E.registerAssetEffect('probeTool', (state, inv) => {
  state.flags.probeTool = true;
  inv.resources += 1;
});
E.registerContent({ cards: { probeTool: { type: 'asset', name: '探针工具', cost: 0, actionEffect: 'probeTool', actionCost: 0, exhaust: true } } });
let asset = E.createInitial([], rng, { investigator: 'detective' });
asset.inv.hand = ['probeTool'];
asset.inv.resources = 5;
asset.inv.actions = 3;
asset = E.act(asset, { type: 'play', index: 0 }, asset.inv.id, rng).state;
eq('资产入场生成实例', asset.inv.assetInstances.length, 1);
asset = E.act(asset, { type: 'useAsset', index: 0 }, asset.inv.id, rng).state;
ok('资产效果执行', asset.flags.probeTool === true);
eq('资产使用后疲惫', asset.inv.assetInstances[0].exhausted, true);
const usedAgain = E.act(asset, { type: 'useAsset', index: 0 }, asset.inv.id, rng);
eq('疲惫资产不能再次使用', usedAgain.ok, false);
asset = E.act(asset, { type: 'endTurn' }, asset.inv.id, rng).state;
eq('维护阶段资产恢复', asset.inv.assetInstances[0].exhausted, false);

console.log('— 内建资产效果');
let flash = E.createInitial([], rng, { investigator: 'detective' });
flash.inv.hand = ['flashlight'];
flash.inv.resources = 5;
flash = E.act(flash, { type: 'play', index: 0 }, flash.inv.id, rng).state;
flash = E.act(flash, { type: 'useAsset', index: 0 }, flash.inv.id, rng).state;
eq('手电筒调查加成 +1', flash.lastTest.bonus, 1);
eq('手电筒使用后疲惫', flash.inv.assetInstances[0].exhausted, true);
let kit = E.createInitial([], rng, { investigator: 'detective' });
kit.inv.hand = ['medkit'];
kit.inv.resources = 5;
kit.inv.damage = 2;
kit = E.act(kit, { type: 'play', index: 0 }, kit.inv.id, rng).state;
kit = E.act(kit, { type: 'useAsset', index: 0 }, kit.inv.id, rng).state;
eq('医疗包回复 1 点伤害', kit.inv.damage, 1);
eq('医疗包剩余 1 次', kit.inv.assetInstances[0].uses, 1);

console.log('\n通过 ' + pass + '，失败 ' + fail);
process.exit(fail ? 1 : 0);

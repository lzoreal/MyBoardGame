// 为缺少合法推进入口的剧本补上可执行的剧本行动（仅补 token/rig/banish 目标，不写目标状态）
import fs from 'fs';
const file = 'content/cabin/scenarios/official-3e.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const byNo = Object.fromEntries(data.scenarios.map((s) => [s.no, s]));
const specs = [
  [3, 'study', '研究', '研究', 'known'],
  [7, 'break_spell', '破咒', '破咒', 'sanity'],
  [8, 'clean_room', '清洁房间', '符文', 'known'],
  [11, 'cook', '烹饪', '食物', 'known'],
  [23, 'shutdown', '关闭机器', '已关闭机器', 'known'],
  [30, 'claim_ring', '找到戒指', '戒指', 'known'],
  [33, 'smash_camera', '砸毁相机', '已毁相机', 'might'],
  [35, 'burn_nest', '焚烧虫巢', '已毁虫巢', 'might'],
  [50, 'plant_charge', '安放炸药', '炸药', 'might']
];
for (const [no, key, name, token, trait] of specs) {
  const sc = byNo[no];
  if (!sc) throw new Error('missing scenario ' + no);
  sc.actions = sc.actions || [];
  if (sc.actions.some((a) => a.key === key)) continue;
  sc.actions.push({
    key, name, trait, where: 'any', once: 'turn', side: 'hero',
    tiers: [{ at: 0, do: { token } }]
  });
}
// #8 Setup 放的是待清洁标记，目标计数应只统计清洁后产生的“符文”。
const sc8 = byNo[8];
for (const op of (sc8.setup && sc8.setup.ops) || []) {
  if (op.type === 'placeToken' && op.token === '符文') op.token = '污垢';
}
// #15：幽灵不可击晕，按剧本“驱散全部怪物”的入口补一个知识驱散行动。
const sc15 = byNo[15];
sc15.actions = sc15.actions || [];
for (const [key, name, type] of [
  ['banish_ghost', '驱散幽灵', 'ghost'],
  ['banish_vampire', '驱散吸血鬼', 'vampire'],
  ['banish_werewolf', '驱散狼人', 'werewolf']
]) {
  if (!sc15.actions.some((a) => a.key === key)) {
    sc15.actions.push({
      key, name, trait: 'known', where: 'any', once: 'turn', side: 'hero',
      tiers: [{ at: 7, do: { banish: { type } } }]
    });
  }
}
// #28：官方目标是用炸药炸掉不可击晕的大白幽灵鲨。
const sc28 = byNo[28];
sc28.actions = sc28.actions || [];
if (!sc28.actions.some((a) => a.key === 'detonate')) {
  sc28.actions.push({
    key: 'detonate', name: '引爆炸药', trait: 'known', where: 'any', once: 'turn', side: 'hero',
    tiers: [{ at: 7, do: { banish: { type: 'shark' } } }]
  });
}
// #38 的邻居数量按人数 3/4/5/6 配置，目标必须与配置数量一致。
const sc38 = byNo[38];
sc38.heroGoal = Object.assign({}, sc38.heroGoal, { needByPlayers: { 3: 3, 4: 4, 5: 5, 6: 6 } });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('patched goal actions');

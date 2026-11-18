/* 修正官方剧本里已经确认的目标语义和缺失的行动入口。
   只改动结构化目标/行动，不改故事、Setup 文本和卡牌原文。 */
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const FILE = path.join(ROOT, 'content', 'cabin', 'scenarios', 'official-3e.json');
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const list = Array.isArray(raw) ? raw : (raw.scenarios || []);
const byNo = (no) => list.find((s) => s.no === no);

// #2：英雄目标 = 摧毁戒指，或杀死叛徒
const s2 = byNo(2);
s2.heroGoal = { type: 'anyOf', goals: [{ type: 'destroyItem', item: '骨戒' }, { type: 'killTraitor' }] };
s2.heroGoalText = '摧毁戒指，或杀死叛徒';
s2.actions = [{
  key: 'destroy_ring', name: '摧毁戒指', trait: 'speed', where: 'any', once: 'turn', requireItem: '骨戒',
  tiers: [
    { at: 7, do: { destroyItem: '骨戒', win: 'heroes', winText: '戒指被摧毁，英雄获胜' } },
    { at: 0, do: { damage: { type: 'physical', amount: 6 }, teleportLanding: true } }
  ]
}];

// #14：英雄目标 = 数字轨道归零，不是收集 4 个咒语标记
const s14 = byNo(14);
s14.heroGoal = { type: 'trackZero', track: 'number', text: '把数字轨道降到 0' };
s14.heroGoalText = '把数字轨道降到 0；每回合可施法让轨道下降 1';
s14.actions = [{
  key: 'cast_spell', name: '施法推进', trait: 'sanity', where: 'any', once: 'turn',
  tiers: [{ at: 5, do: { numberTrack: -1 } }, { at: 0, do: { lose: { trait: 'sanity', amount: 1 } } }]
}];

// #19：英雄目标 = 摧毁 5 卷录像带，并从入口大厅逃出
const s19 = byNo(19);
s19.heroGoal = {
  type: 'allOf',
  goals: [
    { type: 'tokens', token: '已毁录像带', need: 5 },
    { type: 'escape', room: '入口大厅', need: 0 }
  ]
};
s19.heroGoalText = '摧毁全部 5 卷录像带，并从入口大厅逃出';
s19.actions = [{
  key: 'destroy_tape', name: '摧毁录像带', trait: 'might', where: 'any', once: 'turn', requireToken: '录像带',
  tiers: [{ at: 4, do: { token: '已毁录像带' } }, { at: 0, do: {} }]
}];

// #37：英雄目标 = 关闭全部机器人，并有人从入口大厅逃出
const s37 = byNo(37);
s37.heroGoal = {
  type: 'allOf',
  goals: [
    { type: 'tokens', token: '已关闭机器人', need: 3 },
    { type: 'escape', room: '入口大厅', need: 0 }
  ]
};
s37.heroGoalText = '关闭全部 3 台保安机器人，并有人从入口大厅逃出';
s37.actions = (s37.actions || []).filter((a) => a.key !== 'disable_robot' && a.key !== 'collect_dna').concat([{
  key: 'disable_robot', name: '关闭机器人', trait: 'might', where: 'any', once: 'turn',
  tiers: [{ at: 4, do: { token: '已关闭机器人' } }, { at: 0, do: { damage: { type: 'physical', amount: 1 } } }]
}, {
  key: 'collect_dna', name: '采集 DNA', trait: 'might', where: 'any', once: 'turn', side: 'traitor',
  tiers: [{ at: 4, do: { collectDNA: true } }, { at: 0, do: {} }]
}]);

// #46：叛徒把同房间英雄变成毛发怪；全部转化后达成 convertAll
const s46 = byNo(46);
s46.actions = (s46.actions || []).filter((a) => a.key !== 'infect_hero').concat([{
  key: 'infect_hero', name: '把英雄变成毛发怪', trait: 'might', where: 'any', once: 'turn', side: 'traitor',
  tiers: [{ at: 4, do: { convertHero: true } }, { at: 0, do: {} }]
}]);

// 补齐数据里的怪物定义；没有怪物的剧本写入空数组，避免“缺数据”和“没有怪物”混在一起
const monsterDefs = {
  4: { key: 'demon_realtor', name: '恶魔中介', count: 1, might: 5, speed: 4, sanity: 5, known: 5, attack: 'might' },
  11: { key: 'witch', name: '女巫', count: 1, might: 6, speed: 4, sanity: 6, known: 5, attack: 'might' },
  18: { key: 'illusion', name: '幻象', count: 1, might: 5, speed: 5, sanity: 5, known: 5, attack: 'might', disguised: true },
  40: { key: 'twins', name: '邪恶双胞胎', count: 1, might: 5, speed: 5, sanity: 5, known: 5, attack: 'might' }
};
list.forEach((s) => {
  if (!Array.isArray(s.monsters)) {
    if (monsterDefs[s.no]) s.monsters = [monsterDefs[s.no]];
    else if (!s.monster) s.monsters = [];
  }
});

fs.writeFileSync(FILE, JSON.stringify(raw, null, 2) + '\n');
console.log('rule fixes applied:', list.length, 'scenarios');

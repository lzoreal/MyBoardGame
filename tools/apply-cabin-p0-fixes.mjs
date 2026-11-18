import fs from 'node:fs';

const file = 'content/cabin/scenarios/official-3e.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const list = data.scenarios || data;
const byNo = (no) => list.find((s) => s.no === no);

// #5：每人 1 只，另按人数追加 3/4/5/6 只
const s5 = byNo(5);
s5.setup.ops = [
  { type: 'placeMonsterPerHero', monster: 'cherub' },
  { type: 'placeMonster', monster: 'cherub', room: 'nonHeroTiles', countByPlayers: { 3: 3, 4: 4, 5: 5, 6: 6 } },
  { type: 'custom', key: 'hideAndSeek', value: true }
];

// #13：恢复叛徒全部属性，并 +1 力量、+1 速度
const s13 = byNo(13);
s13.setup.ops = (s13.setup.ops || []).filter((op) => op.type !== 'healTraitor' && op.type !== 'grantTrait');
s13.setup.ops.push({ type: 'healTraitor' });
s13.setup.ops.push({ type: 'grantTrait', to: 'traitor', trait: 'might', amount: 1 });
s13.setup.ops.push({ type: 'grantTrait', to: 'traitor', trait: 'speed', amount: 1 });

// #3：保留 assignDisease；multiTraitor 由 assignDisease 实际分配两位叛徒
const s3 = byNo(3);
s3.factions = Object.assign({}, s3.factions, { traitorCount: 2 });
s3.setup.ops = s3.setup.ops.filter((op) => op.type === 'assignDisease' || op.type === 'placeMonster' || op.key === 'multiTraitor');

// #6：把 8 个属性证据标记实际放到不同区域
const s6 = byNo(6);
s6.setup.ops = [
  { type: 'assignNumbers' },
  { type: 'placeEvidence', count: 8 },
  { type: 'custom', key: 'evidencePairs', value: 3 }
];

// #7：镜界状态、揭示者被困
const s7 = byNo(7);
s7.setup.ops = s7.setup.ops.filter((op) => op.key !== 'mirrorRealm');
s7.setup.ops.push({ type: 'mirrorRealm' });

// #17：纸条真正发到一名英雄手里
const s17 = byNo(17);
s17.setup.ops = s17.setup.ops.filter((op) => op.key !== 'dieNote');
s17.setup.ops.push({ type: 'assignDieNote' });

// #18：叛徒离场，幻象中记录真身
const s18 = byNo(18);
s18.setup.ops = s18.setup.ops.filter((op) => op.key !== 'ringIllusion' && op.key !== 'trueBody');
s18.setup.ops.push({ type: 'ringIllusion' });

// #37：先在叛徒板块放 1 台，再给每名英雄 1 台
const s37 = byNo(37);
for (const op of s37.setup.ops || []) {
  if (op.type === 'placeMonster' && op.monster === 'security' && op.room === 'traitor' && op.count === undefined) {
    op.count = 1;
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('#5/#13/#3 Setup 修正已写入');

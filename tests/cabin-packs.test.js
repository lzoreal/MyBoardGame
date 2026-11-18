/* 内容包导入自测：node tests/cabin-packs.test.js */
global.window = global;
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

window.CABIN_PACKS = {
  characters: [{
    key: 'pack_test', name: '包测试', role: '测试员', art: '测',
    traits: {
      speed: { start: 4, min: 2, max: 7 },
      might: { start: 3, min: 2, max: 6 },
      known: { start: 5, min: 2, max: 8 },
      sanity: { start: 5, min: 2, max: 8 }
    }
  }],
  scenarios: [{
    no: 101, key: 'pack_scenario', name: '包剧本', story: '测试',
    trigger: { room: '厨房', omen: '婴啼' },
    traitorRule: 'revealer',
    heroGoal: { type: 'killTraitor' },
    traitorGoal: { type: 'killAll' },
    heroGoalText: '击败叛徒', traitorGoalText: '消灭所有英雄',
    priority: 20
  }, {
    no: 102, key: 'pack_scenario_low', name: '低优先剧本', story: '测试',
    trigger: { room: '厨房', omen: '婴啼' },
    traitorRule: 'revealer',
    heroGoal: { type: 'killTraitor' },
    traitorGoal: { type: 'killAll' },
    heroGoalText: '击败叛徒', traitorGoalText: '消灭所有英雄',
    priority: 5
  }]
};

eval(fs.readFileSync(path.join(root, 'js/games/cabin.js'), 'utf8'));
const E = window.CabinEngine;
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name); }
}

console.log('=== 内容包 ===');
ok('角色包被追加', E.CHARS.length === 13 && E.CHARS.some((c) => c.key === 'pack_test'));
ok('角色属性轨道完整', E.CHARS.find((c) => c.key === 'pack_test').traits.speed.start === 4);
ok('剧本包被追加', E.SCENARIOS.length === 52 && E.SCENARIOS.some((s) => s.key === 'pack_scenario'));
ok('精确房间+预兆命中自定义剧本', E.pickScenario(null, '厨房', '婴啼').key === 'pack_scenario');
ok('优先级高的精确剧本优先', E.pickScenario(null, '厨房', '婴啼').priority === 20);
ok('未命中时仍回退内置剧本', E.pickScenario(null, '门厅', '无名预兆').trigger === undefined);

console.log('全部' + (fail ? '失败' : '通过') + '：' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

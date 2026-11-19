# 诡镇奇谈引擎内容合同

本文件定义 `js/games/arkham.js` 当前可扩展的引擎边界。目标是：原创内容继续可玩，后续官方内容包通过注册接入，而不是继续修改引擎里的 `if` 分支。

## 设计原则

1. 引擎负责规则与状态机，内容包负责卡牌、调查员、敌人、地点、剧本和混沌袋。
2. 官方内容优先用数据描述；无法纯数据表达的特殊卡，用 `registerCardEffect()` 或 `registerAction()` 注册脚本。
3. 剧本的开局、推进、胜负和特殊事件，优先用 `setup` + `hooks` 描述。
4. 所有随机行为必须走传入的 `rng`，保证测试可复现。
5. 内容包不直接修改 UI；UI 只读引擎公开的 `CARDS / INVESTIGATORS / SCENARIOS` 等对象。

## 公开 API

| API | 用途 |
| --- | --- |
| `ArkhamEngine.registerContent(pack, opts)` | 注册内容包；默认合并，`opts.replace=true` 时替换对应集合 |
| `ArkhamEngine.registerCardEffect(name, fn)` | 注册卡牌效果，`fn(state, inv, card, id)` |
| `ArkhamEngine.registerAction(type, fn)` | 注册动作，`fn(state, action, inv, rng)`，必须返回 `{ok, state}` |
| `ArkhamEngine.registerEncounterEffect(name, fn)` | 注册遭遇效果，`fn(state, card, rng)` |
| `ArkhamEngine.registerHook(name, fn)` | 注册全局钩子，`fn(state, payload)` |
| `ArkhamEngine.helpers.tokenMod(state, token)` | 读取当前剧本的混沌标记修正 |
| `ArkhamEngine.createInitial(players, rng, opts)` | 开局；`opts = {investigator, scenario, upgrades, trauma}` |
| `ArkhamEngine.act(state, action, pid, rng)` | 执行动作 |

`registerContent` 支持的键：

```js
{
  cards: { id: cardDef },
  investigators: [investigatorDef],
  enemies: { key: enemyDef },
  encounters: [encounterDef],
  scenarios: { id: scenarioDef },
  locations: { id: locationDef }, // 仅补充全局地点表
  chaosBag: ['+1', '0', 'skull'],
  tokenLabels: { skull: '骷髅' },
  tokenMods: { skull: -2 }
}
```

## 卡牌

```js
{
  id: 'pistol',
  name: '旧式手枪',
  type: 'asset',              // asset | event
  cost: 3,
  combat: 1,                  // 资产提供的属性加值
  damage: 1,                  // 资产提供的额外伤害
  intellect: 0,
  agility: 0,
  will: 0,
  healthSoak: 0,              // 资产可承受的伤害
  sanitySoak: 0,              // 资产可承受的恐惧
  effect: 'healDamage',       // 事件牌效果名
  text: '...'
}
```

事件牌执行顺序：扣除资源 → 扣行动 → 从手牌移除 → 调 `CARD_EFFECTS[effect]` → 进弃牌堆。

自定义效果示例：

```js
ArkhamEngine.registerCardEffect('probeEffect', (state, inv, card, id) => {
  inv.clues += 1;
});
```

未注册的 `effect` 不会中断游戏，但会写入日志；正式内容包应保证每个事件牌都有处理器。

## 调查员

```js
{
  id: 'probeInv',
  name: '测试调查员',
  role: '测试',
  color: '#888',
  stats: { will: 3, int: 3, combat: 3, agi: 3 },
  health: 6,
  sanity: 6,
  ability: '',                 // 引擎内建 ability 标识；官方能力建议用钩子/动作实现
  abilityText: '',
  deck: ['probeCard']
}
```

当前引擎内建能力标识只有 `roland`、`wendy`、`scholar`、`guardian`、`survivor`、`medium` 相关的已有逻辑。新调查员若需要特殊能力，优先注册动作或钩子，不要把官方能力硬塞进引擎分支。

## 敌人

```js
{
  name: '探针守卫',
  fight: 2,
  evade: 2,
  health: 3,
  damage: 1,
  horror: 1,
  boss: false
}
```

`spawnEnemyDef(state, base, locId, extra)` 会把 `extra` 合并到敌人实例；`tags` 可用于剧本进度和钩子。

## 遭遇

```js
{
  key: 'probeEnc',
  name: '探针遭遇',
  text: '...',
  effect: 'probeEncounter',        // 优先走 ENCOUNTER_EFFECTS
  test: {
    stat: 'will',                  // will | int | combat | agi
    difficulty: 3,
    fail: { damage: 1, horror: 1, actions: -1, doom: 1, clues: 1, log: '...' },
    success: { ... }
  }
}
```

执行优先级：`effect` 处理器 → `test` 数据结算 → 旧原创遭遇的 `key` 分支。

注册遭遇效果：

```js
ArkhamEngine.registerEncounterEffect('probeEncounter', (state, card, rng) => {
  state.flags.probeEncounter = true;
});
```

`test` 的失败/成功结果支持 `damage`、`horror`、`actions`、`clues`、`doom`、`log`。

## 剧本

```js
{
  id: 'probe',
  chapter: '测试章',
  name: '契约测试',
  subtitle: '测试',
  start: 'lab',
  intro: '测试开局',
  locations: {
    lab: { name: '实验室', clues: 0, shroud: 2, links: [] }
  },
  encounters: [],
  act: [{ label: '测试第一幕', clues: 0 }],
  agenda: [{ doom: 4, label: '测试议程' }],
  boss: { key: 'probeEnemy', loc: 'lab', spawnText: '守卫出现' },
  ritual: { rounds: 0 },
  chaosBag: ['+1', '0', 'skull'],
  tokenRules: { skull: () => 5 },
  canResign: false,
  winText: '...',
  loseText: '...',
  setup: [
    { op: 'spawnEnemy', enemy: 'probeEnemy', locations: ['lab'], tags: ['probe'] },
    { op: 'addClues', at: 'lab', amount: 1 }
  ],
  hooks: {
    enemyDefeated(state, payload) {},
    actAdvanced(state, payload) {},
    end(state, payload) {}
  }
}
```

### setup 操作

| op | 字段 | 说明 |
| --- | --- | --- |
| `spawnEnemy` | `enemy`, `locations`, `entries`, `tags` | `enemy` 可为 `ENEMIES` 的 key 或完整定义；`entries` 支持逐地点指定 |
| `addClues` | `at`, `amount` | 给地点补线索 |
| `setFlag` | `key`, `value` | 写入 `state.flags` |
| `setAct` | `value` | 合并到 `state.act` |
| `setAgenda` | `value` | 合并到 `state.agenda` |
| `log` | `text` | 开局日志 |

### 剧本 UI 元数据

现有界面不再写死三章，以下字段会直接驱动开局页和结算页：

| 字段 | 用途 |
| --- | --- |
| `order` | 章节排序，数字越小越靠前 |
| `next` | 胜利后进入的下一章 id；`null` 表示没有下一章 |
| `xp` | 胜利获得的经验值 |
| `standalone` | 独立支线，不强制要求前序章节 |
| `how` | 开局页“这一章怎么玩”的说明 |
| `startLabel` | 开始按钮文案 |
| `winBig` | 结算页的大标题 |

`js/games/arkham-pilot-pack.js` 是一个独立原创试点包，示例了调查员、卡牌、敌人、遭遇、剧本 setup、剧本 UI 元数据的完整注册流程。

### 剧本钩子

- 剧本级：`sc.hooks.setup`、`sc.hooks.enemyDefeated`、`sc.hooks.actAdvanced`、`sc.hooks.enterLocation`、`sc.hooks.investigate`、`sc.hooks.end`。
- 全局级：`ArkhamEngine.registerHook('gameStart'|'enemyDefeated'|'actAdvanced'|'enterLocation'|'investigate'|'gameEnded', fn)`。
- 剧本钩子也会以 `scenario:<name>` 形式触发全局钩子，便于内容包监听。

钩子参数：

- `setup`: `{ scenario }`
- `enemyDefeated`: `{ enemy, tags }`
- `actAdvanced`: `{ stage }`
- `enterLocation`: `{ from, to, location }`
- `investigate`: `{ location, success }`
- `end` / `gameEnded`: `{ result, text }`

## 混沌袋与标记

- `scenario.chaosBag` 覆盖默认 14 枚混沌袋；否则使用 `CHAOS`。
- `scenario.tokenRules` 可把标记映射为数字或函数：`{ skull: 5, cultist: (state) => -3 }`。
- 未提供 `skull` 规则时，保留原动态规则：首领数 +2 取负。
- `tokenLabels` 用于 UI 文本；`tokenMods` 是全局默认修正。

## 自定义动作

```js
ArkhamEngine.registerAction('probeAction', (state, action, inv) => {
  inv.resources += Number(action.amount) || 1;
  return { ok: true, state: state };
});
```

自定义动作在 `restart` / `mulligan` 之后、内建动作之前执行。处理器自行检查阶段、行动点、目标和日志。

## 当前边界

这不是完整官方规则引擎，仍是单调查员、三章原创内容的状态机。官方内容接入前还需要补：

1. 多调查员与多人回合顺序。
2. 卡牌投入检定、牌库构筑、手牌上限、经验值。
3. 完整资产使用/疲劳、正式敌人移动与狩猎。
4. 官方剧本的 `custom` 目标执行器（当前依赖剧本钩子或自定义动作）。
5. 战役存档、创伤分项、卡牌/剧本解锁。

本合同的测试样例见 `tests/arkham-engine-contract.test.js`。

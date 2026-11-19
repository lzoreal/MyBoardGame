# Cabin 3E 引擎结构重构

## 这次改了什么

原来的 `applyOps()` 是一条三百多行的 if 链，所有剧本效果按对象属性顺序执行；新增一个剧本效果就要在函数中间再插一段。现在拆成两层：

1. **效果注册表**：`EFFECT_HANDLERS` 把每个原子效果（伤害、移动标记、数字轨道、生成怪物、改写目标等）注册成独立处理器。
2. **显式执行顺序**：`OP_ORDER` 规定效果执行顺序，不再依赖 JavaScript 对象属性顺序。
3. **目标注册表**：`CUSTOM_GOALS` 集中管理 `custom` 目标 key，剧本数据只声明 key，不再把语义散落在 `goalDone()` 的 if 链里。

`applyOps()` 现在只做三件事：接收状态上下文、按 `OP_ORDER` 遍历、把值交给对应处理器。

## 目录与边界

| 层 | 位置 | 职责 |
|---|---|---|
| 内容合同 | `content/cabin/scenarios/official-3e.json` | 剧本 Setup、目标、行动、怪物、文本 |
| 构建校验 | `tools/build-cabin-packs.mjs` | 拒绝非法行动、伤害类型、目标字段 |
| 效果层 | `js/games/cabin.js` 的 `EFFECT_HANDLERS` / `OP_ORDER` | 原子状态变更，不判断剧本编号 |
| 目标层 | `js/games/cabin.js` 的 `CUSTOM_GOALS` + `goalDone()` | 只读状态，判断胜负条件 |
| 行动层 | `js/games/cabin.js` 的 `scenarioAction()` | 校验前置、掷骰、选择 tier、调用效果层 |
| 回合/怪物层 | `endTurn()` / `monsterAct()` / `finishMonsterTurn()` | 回合、怪物阶段、触发时机 |
| 表现层 | `design/cabin.html` | 只消费引擎状态，不复制规则 |

## 新增一个剧本效果的做法

1. 在 `content/cabin/scenarios/official-3e.json` 里增加行动字段或 `do` 字段。
2. 在 `tools/build-cabin-packs.mjs` 里补字段校验，保证构建阶段拒绝非法数据。
3. 在 `EFFECT_HANDLERS` 注册处理器，并把 key 加入 `OP_ORDER`。
4. 在 `cabin-scenario-playthrough` 或 `cabin-mechanic-3e` 增加合法行动测试。

不再直接在 `applyOps()` 中间插 `if (ops.xxx)`。

## 新增一个自定义目标的做法

1. 数据里写 `{ "type": "custom", "key": "xxx" }`。
2. 在 `CUSTOM_GOALS` 注册 `xxx: ({ st, h, heroes, g }) => boolean`。
3. 目标判定只读状态，不产生副作用，不调用 `win()`。

## 仍然保留的边界

- `scenarioAction()` 中的 `#7` 镜界猜线索、`#17` DIE 纸条传递已迁到 `ACTION_SPECIALS` 注册表。
- `#32` 火焰、坍塌房间、洗衣滑道、DIE 纸条回合结束逻辑已迁到 `TURN_HOOKS`；`#43` 数字轨道递减和怪物回合结束伤害已迁到 `MONSTER_END_HOOKS`。
- 这仍是客户端引擎；联机防作弊需要服务端执行同一引擎，当前 `cabin_push_state` 不是规则权威。

## 验证

重构后 12 组测试全部通过，合计 1742 条断言；行为与重构前一致。后续结构改动必须以这组测试作为回归基线。

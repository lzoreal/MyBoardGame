# 林中小屋内容包

把 JSON 放进下面两个目录，push 到 `main` 后，GitHub Actions 会自动扫描、校验并生成 `js/games/cabin-packs.js`：

- `content/cabin/characters/`：角色包
- `content/cabin/scenarios/`：剧本包

以 `_` 开头的 JSON 不会参与构建，可用来保存示例。

本地预览前也可以手动执行：

```bash
node tools/build-cabin-packs.mjs
```

## 角色包

一个文件可以放一个角色，也可以放 `{ "characters": [ ... ] }`。

```json
{
  "characters": [
    {
      "key": "custom_reporter",
      "name": "新角色",
      "role": "职业",
      "art": "新",
      "traits": {
        "speed": { "start": 4, "min": 2, "max": 7 },
        "might": { "start": 3, "min": 2, "max": 6 },
        "known": { "start": 5, "min": 2, "max": 8 },
        "sanity": { "start": 5, "min": 2, "max": 8 }
      }
    }
  ]
}
```

- `key` 使用字母、数字、下划线、连字符，不能与现有角色重复。
- `art` 是角色头像上显示的 1–2 个字符。
- 四项属性都必须有 `start`、`min`、`max`，且 `min ≤ start ≤ max`。

## 剧本包

导入剧本必须写 `trigger`，否则无法在闹鬼时被选中。`room` 或 `omen` 可写 `"*"` 表示任意。

```json
{
  "scenarios": [
    {
      "key": "custom_kitchen_cry",
      "name": "示例剧本",
      "story": "厨房里传来不该存在的哭声。",
      "trigger": { "room": "厨房", "omen": "婴啼" },
      "traitorRule": "revealer",
      "heroGoal": { "type": "killTraitor" },
      "traitorGoal": { "type": "killAll" },
      "heroGoalText": "击败叛徒，让哭声停下",
      "traitorGoalText": "消灭所有英雄",
      "priority": 20
    }
  ]
}
```

- `trigger.room` / `trigger.omen` 要使用游戏内已有的房间名和预兆名。
- `trigger.card` 可选：写剧本卡名（`无`/`待售`/`诅咒`/`神秘邀请`/`离奇失踪`/`超自然调查员`）。开局会随机抽一张剧本卡，命中要求卡名一致；这个字段用于还原官方「同一预兆在不同剧本卡下触发不同剧本」的规则。
- `trigger.event` 可选：写事件卡名。抽到该事件卡时**立刻**触发闹鬼（跳过闹鬼检定），不需要预兆，也不看剧本卡。
- `actions[].tiers[].do` 支持的操作：`token`（放标记）、`progress`、`gain`/`lose`/`heal`/`damage`、`flip`（翻覆当前房间）、`banish`（驱散怪物并计入 hunt 进度，如 `{type:'cherub',count:2}`）、`removeMonster`/`removeMonsterCount`、`addMonster`、`trap`/`untrap`（被困：不能移动、不能交易；`trap:'weakest'` 选最弱者）、`evidence`（证据配对数）、`bid`（同房间按力量出价抢宝藏）、`treasure`、`dimension`（维度改写：跨层同格视为同格）、`disguise`（给随机对手打幻象标记）、`reveal`（公开隐藏叛徒）、`swapBody`（与随机对手交换角色属性）、`transfer`（`{from:'weakest'|玩家id, trait, amount}`）、`revive`、`rewrite`（改目标文本/`heroGoal`）、`win`。
- 目标类型：`killTraitor` / `killAll` / `survive` / `ritual` / `escape` / `hunt` / `tokens` / `rig` / `evidence`（证据配对组数）/ `treasure`（宝藏份数）/ `placeTokens`（`pairs:[{token,room}]` 指定房间放标记）/ `allOf`（`goals:[...]` 全部达成，用于「录像带 + 逃出」这类双条件）。
- 剧本字段 `dimension:true` 会让这一章全程按维度改写结算；`monster.noAttack:true` 表示该怪物不可被攻击（如 #5 的石头小天使，只能靠剧本行动成对移除）。
- 角色字段：`age` 为 1–99 的整数，上桌后写入玩家对象；`traitorRule:"oldest"` 用它选最年长者（排除揭示者本人，若都没有年龄才回退揭示者）。
- `actions[].dead:true` 允许已倒下的角色执行该行动（如 #45 的「Cut!」复活）。
- `traitorRule: "freeForAll"` 会自动打开 `pvp`：所有探险者都算英雄，可以互相攻击，只剩一人时判胜。
- `traitorRule` 可用：`revealer`、`lowestSanity`、`highestMight`、`highestSpeed`、`lowestSpeed`、`highestKnowledge`、`lowestMight`、`omenHolder`，以及 `hiddenTraitor`、`noTraitor`、`freeForAll`、`leftOfRevealer`、`oldest`、`mostOmens`、`seeEvent`。
- `heroGoal.type` / `traitorGoal.type` 可用：`killTraitor`、`killAll`、`survive`、`ritual`、`escape`、`hunt`、`tokens`、`rig`。
- `tokens`：`{ "type": "tokens", "token": "rune", "need": 5 }`，场上该标记达到 need 即英雄获胜。
- `rig`：`{ "type": "rig", "token": "bomb", "need": 3, "perFloor": true }`，每个楼层至少一个、且总数达标才算赢。
- `priority` 越大越优先；同一房间 + 预兆有多条自定义剧本时，取优先级最高的一条。
- 自定义剧本命中时会覆盖内置剧本的查表结果；没命中的时候仍走原来的 50 个剧本公式。

## 剧本行动 / 怪物面板 / 吞噬房间（可选）

```json
{
  "key": "custom_rune",
  "name": "示例剧本",
  "trigger": { "room": "*", "omen": "*" },
  "traitorRule": "leftOfRevealer",
  "heroGoal": { "type": "tokens", "token": "rune", "need": 3 },
  "heroGoalText": "放满 3 个符文",
  "traitorGoalText": "阻止英雄",
  "flipRooms": true,
  "actions": [
    {
      "key": "study",
      "name": "研习仪式",
      "trait": "known",
      "where": "room",
      "room": "图书室",
      "once": "turn",
      "tiers": [
        { "at": 5, "do": { "token": "rune" } },
        { "at": 0, "do": { "damage": { "type": "mental", "dice": 1 } } }
      ]
    }
  ],
  "monster": {
    "key": "keeper", "name": "家政工", "count": 3,
    "might": 5, "speed": 4, "sanity": 5, "known": 5, "attack": "might",
    "endTurn": { "damage": { "amount": 1, "type": "physical" } }
  }
}
```

- `actions[].where`：`any` / `room`（配 `room`）/ `symbol`（配 `symbol`：event、item、omen）/ `floors`（配 `floors` 数组）。
- `actions[].tiers` 按 `at` 从高到低取第一个满足的档位，都不满足时走 `miss`。
- 档位里可用：`token`（在当前房间放标记）、`progress`、`gain`/`lose`、`damage`（`dice` 或 `amount`）、`heal`、`flip`、`win`（`heroes` / `traitor`）。
- `flipRooms: true` 时叛徒可以把所在房间翻覆：四边都变成门、失去符号与文字（起点与平台不可翻）。
- 行动按钮出现在底栏，每回合每人每个行动一次；条件不满足时按钮置灰并说明原因。

校验失败时构建会直接报错，并指出文件和字段。

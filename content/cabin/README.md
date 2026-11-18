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
- `traitorRule` 可用：`revealer`、`lowestSanity`、`highestMight`、`lowestSpeed`、`highestKnowledge`、`lowestMight`、`omenHolder`。
- `heroGoal.type` / `traitorGoal.type` 可用：`killTraitor`、`killAll`、`survive`、`ritual`、`escape`、`hunt`。
- `priority` 越大越优先；同一房间 + 预兆有多条自定义剧本时，取优先级最高的一条。
- 自定义剧本命中时会覆盖内置剧本的查表结果；没命中的时候仍走原来的 50 个剧本公式。

校验失败时构建会直接报错，并指出文件和字段。

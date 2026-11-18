# 山中小屋 3E 规则引擎重构实施规格

- 版本：`cabin-3e/1` 草案
- 日期：2026-11-18
- 状态：已评审并进入实施；当前进度与未完成项见 `docs/cabin-3e/IMPLEMENTATION-STATUS.md`
- 范围：`D:\MyBoardGame` 的林中小屋（Cabin）内容包、规则引擎、联机状态与测试
- 不在范围：Q 版 UI 重做、牌面美术、非 Cabin 游戏

> 本规格只定义目标结构、接口、迁移顺序与验收方法。所有官方剧本数值、怪物数量、房间张量必须以第三版实体组件或经复核的官方文本为准；规格中的示例不替代官方规则。

---

## 0. 结论与实施原则

这次不再按“发现一个 bug 补一个分支”的方式改 `cabin.js`。第三版迁移按以下顺序推进：

1. 先冻结内容合同和基线，禁止构建器/运行时静默补默认规则。
2. 再把轨道、地图、效果、闹鬼、怪物拆成有明确输入输出的执行层。
3. 然后逐类把 43 事件 / 22 物品 / 9 预兆 / 51 房间 / 50 剧本的数据接进执行层。
4. 最后把联机状态拆成公开态与私有态，并把动作结算移到服务端。
5. UI 只换适配层，保留现有手机/电脑布局、卡面、棋子、大厅流程。

三条不可妥协的底线：

- **没有结构化规则的剧本必须构建失败**，不能默认 `killAll`。
- **玩家轨道位置是唯一真实数据**，`traits` 只是派生显示值。
- **秘密信息不得进入无权限客户端的内存**，不能只靠 CSS 隐藏。

---

## 1. 基线审计（2026-11-18 实测）

以下数据来自当前工作区，不是估计值。

### 1.1 内容数量

| 内容 | 当前数量 | 说明 |
|---|---:|---|
| 人物 | 12 | 6 块双面人物板，四条轨道、生日、年龄齐全 |
| 房间 | 51 | 46 张普通/特殊房牌 + 5 个起始节点（2 个 `start`、1 个 `grandStair`、2 个 `landing`） |
| 事件 | 43 | 31 张带 roll（其中 5 张为闹鬼检定） |
| 物品 | 22 | 仅 6 张有结构化能力字段（其中炸药只有 `weapon` 标记，范围攻击未执行）；其余 16 张纯文本 |
| 预兆 | 9 | 均带属性增减；2 张武器、1 张护甲，其余特殊能力仅文本 |
| 剧本 | 50 | 主目标有结构，叛徒目标 0 条、布置 0 条、阵营 0 条 |
| 官方规则 | 50 | 英文 OCR + 中文摘要齐全，但运行时完全未读取 |

### 1.2 必须阻断发布的实测缺口

| 模块 | 实测证据 | 直接后果 |
|---|---|---|
| 构建器 | `tools/build-cabin-packs.mjs:208` 使用 `s.traitorGoal || { type: 'killAll' }` | 缺叛徒目标的剧本会静默变成“杀光英雄” |
| 运行时 | `js/games/cabin.js:127-130` 再次用 `K`/`KA` 兜底 | 即使构建器修好，运行时仍会补默认目标 |
| 剧本 | 50/50 无 `setup`；50/50 无结构化 `traitorGoal`；50/50 无 `factions` | 布置、阵营、叛徒胜负没有进入执行流程 |
| 隐藏叛徒 | `chooseTraitor` 对 `hiddenTraitor` 直接选揭示者本人；没有编号抽签、没有揭示条件、没有揭示前互攻 | #2/#3/#6 的隐藏身份只是把 `traitor` 字段藏起来，不是规则 |
| 自由混战 | 仅用 `pvp: true` + “最后一人获胜”；没有独立行动、阵营与目标 | #9/#10/#11/#12 的目标文本没有执行 |
| 怪物数据 | 36 条单对象 `monster`、1 条数组 `monsters`、13 条无怪物 | 两套结构经过构建后字段不一致 |
| 怪物运行时 | `spawnOneMonster` 只复制 `noAttack/disguised/merged`；战斗代码却读取 `noStun/oneHit/ignoreDoors/damageReduce/attackOnly/boundRoom` | 这些能力是死字段 |
| 怪物行动 | `monsterAct` 用 `Math.max(1, 移动骰)`；无叛徒/混战剧本每名玩家回合后都开怪物阶段 | 移动骰 0 仍能走 1 格；怪物行动次数过多 |
| 轨道 | `traitVal` 读 `p.traits` 而不是 `p.track.pos`；`swapBodies` 只交换 `traits`；`transfer`/`revive` 直接写 `traits` | 轨道位置与判定值脱节，换身/借属性/复活后错位 |
| 物品 | 16/22 只有文本；`useItem` 只支持 `heal`/`gain` | 手电筒、兔脚、地图、万能钥匙等实际不能用 |
| 事件 | 14/43 所有分支为空；5 张特殊事件的分支未结构化为成功/失败/闹鬼后 | 抽到牌只能看文字，不能执行 |
| 特殊事件双触发 | `resolveRoomSymbol` 先按 6 骰 5+ 判定，随后无条件调用 `maybeEventHaunt` | 5 张事件即使判定失败也会直接开闹鬼 || 房间 | 仅 4 张有 `effect`、4 张有 `special`；8 条 `link` 被加载但引擎从未使用；`神秘电梯` 无任何执行分支 | 特殊连通、电梯、军械库等房间规则缺失 |
| 战斗 | `attackBonus` 同时当骰子数和结果加值使用 | 砍刀“结果 +1”会被当成多掷 1 骰 |
| 联机 | `rooms.state` 保存完整状态；`sql/rooms.sql` 对 `anon` 开放全表读写 | 任何拿到 anon key 的客户端都能读隐藏叛徒、目标和全部私有信息 |
| 测试 | CI 只跑 `cabin.test.js` 与 `cabin-packs.test.js` | 3E 规则、剧本、专项测试未进入 CI |
| 文档 | README 仍写“Second Edition、44 房间、45 事件、13 预兆” | 与当前 3E 数据不一致 |

现有 `tests/cabin-official.test.js` 直接调用 `maybeEventHaunt` 验证事件映射，没有经过 `resolveRoomSymbol` 的完整抽牌路径，因此“判定失败也会触发”没有被现有测试暴露。这正是“数据字段存在”不等于“执行链路正确”的例证。

### 1.3 房间数量必须先对账

审查给出的口径是“42 张普通房间牌 + 3 块起始实体板块”，当前仓库是“46 张非起始房牌 + 5 个起始节点”。两者不一致。

阶段 0 必须确定唯一来源（实体组件清单/官方组件页/逐张 OCR 复核），并回答：

- 多出的 4 张普通房牌是 3E 真实组件，还是旧版残留？
- 上层平台、底层平台是否属于“起始板块”，还是独立 landing 节点？
- `入口大厅`、`门厅`、`主楼梯` 与 3 块起始实体板块如何一一对应？

在对账完成前，不允许用“数量正确”作为验收结论。数据可以继续用，但必须挂 `pendingCountReview` 标记。

### 1.4 审查清单落实映射

| 审查优先级 | 项目 | 本规格对应 |
|---|---|---|
| P0 | 5 张特殊事件分支 | 3.5、4.4、6 阶段 3、附录 D.5 |
| P0 | 50 剧本双方目标 | 3.7、6 阶段 1/3、7.3 |
| P0 | 每剧本 Setup | 3.7 `setup`、4.4 `runScenarioSetup` |
| P0 | 隐藏叛徒 | 3.7 `hidden_traitor`、7.3、8 安全测试 |
| P0 | 自由混战 | 3.7 `free_for_all`、4.4 `resolveFactions` |
| P0 | 属性轨道 | 3.2、4.2、6 阶段 2 |
| P0 | 怪物 | 3.6、4.6、6 阶段 6 |
| P0 | 联机安全 | 3.8、5、6 阶段 7、7.5 |
| P1 | 房间与连接 | 3.3、4.3、6 阶段 5 |
| P1 | 房间效果 | 3.3 `abilities`、附录 B |
| P1 | 22 物品 | 3.5、附录 C.1 |
| P1 | 9 预兆 | 3.5、附录 C.3 |
| P1 | 战斗 | 3.5 `weapon`、4.2、6 阶段 2 |
| P1 | 官方规则接入 | 3.7 `rules`、3.8 公开投影 |
| P1 | 地图边界 | 4.3、6 阶段 5 |
| P2 | 统一 Schema | 3、5 |
| P2 | CI | 7.7 |
| P2 | 50 剧本覆盖 | 7.3、8 |
| P2 | 文档 | 5、6 阶段 8 |
| P2 | 版本一致 | 3.1 `schema`、3.8 `engineVersion` |

---

## 2. 目标架构

### 2.1 分层

```text
content/cabin/           权威内容（只描述规则，不写 JavaScript）
  schema/                机器可读 Schema
  characters/            12 人物
  rooms/                 房间与连接
  cards/                 事件 / 物品 / 预兆
  scenarios/             50 剧本（setup / factions / goals / monsters）
  rules/                 官方原文与中文，仅供展示与溯源

tools/
  validate-cabin-content.mjs   严格校验，不补默认值
  build-cabin-packs.mjs        只做校验、归一化、打包

js/games/cabin/
  engine.mjs             createInitial / act / viewFor 唯一入口
  state.mjs              状态构造、迁移、公开/私有分离
  traits.mjs             轨道唯一写入口
  content.mjs            内容索引与 ID 解析
  effects.mjs            触发器、条件、原子效果执行器
  cards.mjs              事件 / 物品 / 预兆
  map.mjs                房间图、边、寻路、视线
  rooms.mjs              房间触发时机与特殊房间
  combat.mjs             攻击、防御、武器、伤害
  haunt.mjs              触发、选剧本、布置、阵营、目标、胜负
  monsters.mjs           怪物运行时、行动、能力
  view.mjs               ClientView 投影（按玩家裁剪秘密）
  rng.mjs                可注入随机源

js/games/cabin-adapter.js    兼容层：window.CabinEngine -> engine.mjs
design/cabin.html            只调用适配层，不改现有布局
js/net.js                    公开态订阅 + 私有态读取
supabase/functions/cabin-action/  服务端动作结算
supabase/functions/_shared/cabin-core.mjs  与服务端共享的纯引擎副本
```

### 2.2 纯引擎约束

`engine.mjs` 及其依赖必须：

- 不读 `window`、DOM、localStorage、网络。
- 不直接使用 `Math.random`，随机源由参数注入。
- 输入 `(state, action, context, rng)`，输出 `{ ok, state, events, error }`。
- 所有状态变更可序列化；不存函数、DOM、类实例。
- 同一份代码可在浏览器和 Supabase Edge Function（Deno）运行。

`js/games/cabin-adapter.js` 负责把 `window.CABIN_PACKS` 注入引擎并暴露旧接口，避免 UI 大改。

### 2.3 统一 ID

所有内容使用稳定、不可随中文改名而变的 ID：

```text
char.anita
room.library
card.event.poor_yorick
card.item.chainsaw
card.omen.ring
monster.cherub
scenario.2
```

中文名只用于显示。迁移时保留旧 `key` 映射表，避免已有测试和 UI 断裂。

---

## 3. 数据合同

### 3.1 通用规则

每个内容对象必须包含：

```json
{
  "schema": "cabin-3e/1",
  "id": "scenario.2",
  "key": "official_3e_2",
  "source": {
    "edition": "3E",
    "book": "traitor",
    "page": 4,
    "verified": true
  }
}
```

`source.verified=false` 的对象允许进入开发库，但构建产物必须拒绝，或只在 `--allow-unverified` 下生成开发包。生产包不得包含未核实对象。

### 3.2 Character

```json
{
  "id": "char.anita",
  "name": "安妮塔·赫尔南德斯",
  "boardId": "yellow",
  "age": 12,
  "birthday": "06-11",
  "traits": {
    "speed":  { "track": [2,3,4,4,5,6,7,8], "startPos": 5 },
    "might":  { "track": [2,3,4,4,5,6,7],   "startPos": 3 },
    "known":  { "track": [3,4,4,5,6,7,8],   "startPos": 4 },
    "sanity": { "track": [3,4,5,6,7,8],     "startPos": 4 }
  }
}
```

规则：

- 每条轨道必须给出完整数组与 `startPos`，禁止用 `start/min/max` 推导轨道。
- 不允许两个人使用同一 `boardId`。
- 运行时只保存 `{list, pos}`；`traits` 数值由 `pos` 派生。

### 3.3 Room

```json
{
  "id": "room.gallery",
  "name": "画廊",
  "floor": "ground",
  "doors": "NESW",
  "symbol": "event",
  "kind": "normal",
  "links": [
    { "to": "room.ballroom", "type": "secretPassage", "bidirectional": true, "cost": 1 }
  ],
  "abilities": [
    {
      "trigger": { "type": "onDiscover" },
      "once": "room",
      "effects": [ { "op": "gainTrait", "target": "actor", "trait": "sanity", "amount": 1 } ]
    },
    {
      "trigger": { "type": "onEnter" },
      "condition": { "room": "room.armory" },
      "effects": [ { "op": "grantWeaponChoice", "traits": ["might","speed"] } ]
    }
  ]
}
```

要求：

- `doors` 只表示可旋转的门位，不再承载特殊连通。
- `links` 表示密道、电梯、楼梯等非门连接；双向必须成对校验。
- `abilities` 统一使用触发时机，不再用 `room.special` 字符串分支。
- 房间牌堆只包含 `kind != "start"` 的对象；起始节点由 `scenario` 或固定初始态提供。

### 3.4 效果 DSL

所有卡牌、房间、剧本、怪物能力共用同一套原子效果。禁止每种卡写一个独立函数。

```ts
type Effect =
  | { op: 'gainTrait'; target: Target; trait: Trait; amount: number }
  | { op: 'loseTrait'; target: Target; trait: Trait; amount: number }
  | { op: 'moveTrack'; target: Target; trait: Trait; delta: number }
  | { op: 'setTrack'; target: Target; trait: Trait; pos: number }
  | { op: 'healTrait'; target: Target; trait: Trait; amount: number | 'all' }
  | { op: 'damage'; target: Target; kind: DamageKind; amount?: number; dice?: number }
  | { op: 'preventDamage'; target: Target; kind: DamageKind; amount: number }
  | { op: 'convertDamage'; target: Target; from: DamageKind; to: DamageKind }
  | { op: 'reduceDamage'; target: Target; kind: DamageKind; amount: number }
  | { op: 'reroll'; target: Target; dice: 'all' | 'blank' | number; times: number }
  | { op: 'modifyDice'; target: Target; scope: CheckScope; amount: number }
  | { op: 'modifyResult'; target: Target; scope: CheckScope; amount: number }
  | { op: 'draw'; target: Target; deck: DeckKind; count: number }
  | { op: 'discard'; target: Target; card: CardRef }
  | { op: 'move'; target: Target; to: RoomRef | 'adjacent' | 'any'; cost?: number }
  | { op: 'teleport'; target: Target; to: RoomRef | 'any' }
  | { op: 'placeToken'; token: string; room: RoomRef; count: number }
  | { op: 'removeToken'; token: string; room: RoomRef; count: number }
  | { op: 'flipRoom'; room: RoomRef }
  | { op: 'reveal'; what: 'traitor' | 'objective' | 'token'; target: Target }
  | { op: 'swapTracks'; a: Target; b: Target }
  | { op: 'transferTrack'; from: Target; to: Target; trait: Trait; amount: number }
  | { op: 'revive'; target: Target }
  | { op: 'spawnMonster'; monster: MonsterRef; count: number; at: RoomRef }
  | { op: 'removeMonster'; monster: MonsterRef; count: number }
  | { op: 'startHaunt'; scenario: ScenarioRef }
  | { op: 'setProgress'; key: string; delta: number }
  | { op: 'win'; side: Faction; text: string }
  | { op: 'choose'; prompt: string; options: Effect[][] };
```

条件 DSL：

```ts
type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { phase: 'preHaunt' | 'haunt' }
  | { side: Faction }
  | { traitAtLeast: { target: Target; trait: Trait; value: number } }
  | { inRoom: { target: Target; room: RoomRef } }
  | { hasItem: { target: Target; item: ItemRef } }
  | { tokenCount: { token: string; room?: RoomRef; gte: number } }
  | { roundAtLeast: number }
  | { flag: string };
```

触发时机至少覆盖：

- `onAcquire`
- `onTraitCheckBefore`
- `onAttackBefore`
- `onDefenseBefore`
- `onDamageBefore`
- `onDamageAfter`
- `onTurnStart`
- `onTurnEnd`
- `onDiscover`
- `onEnter`
- `onEndTurnInRoom`
- `activeAction`

效果执行器必须返回 `EffectResult[]`，供 UI 逐条播放提示和动画；不得在效果函数里直接改 DOM。

### 3.5 Card（事件 / 物品 / 预兆）

统一结构：

```json
{
  "id": "card.item.chainsaw",
  "type": "item",
  "name": "电锯",
  "text": "武器；用它攻击时额外掷一骰。",
  "weapon": {
    "trait": "might",
    "attackDice": 1,
    "attackResult": 0,
    "defenseTrait": "might",
    "range": "same"
  },
  "abilities": [],
  "source": { "edition": "3E", "verified": true }
}
```

武器必须拆分：

- `attackDice`：增加攻击骰数。
- `attackResult`：攻击总点数加值。
- `range`：`same` / `lineOfSight` / `any`。
- `defenseTrait`：防守方使用的属性。

不允许继续用 `attackBonus` 混合两种语义。

事件必须使用显式分支：

```json
{
  "id": "card.event.say_cheese",
  "type": "event",
  "check": { "phase": "preHaunt", "dice": 6, "diff": 5 },
  "branches": [
    {
      "result": "success",
      "effects": [
        { "op": "startHaunt", "scenario": "scenario.33" }
      ]
    },
    {
      "result": "failure",
      "effects": [ { "op": "draw", "target": "actor", "deck": "item", "count": 1 } ]
    },
    {
      "phase": "postHaunt",
      "effects": [ { "op": "draw", "target": "actor", "deck": "item", "count": 1 } ]
    }
  ],
  "abilities": []
}
```

规则：

- 删除 `roll.hauntRoll` + 顶层 `hauntNo` + `maybeEventHaunt` 的隐式组合。
- 事件触发剧本只能出现在某个明确分支里，且整张牌只允许一个 `startHaunt`。
- 成功/失败/闹鬼后三分支都必须有结构化效果；允许空效果，但必须显式写 `[]`，不能靠缺失字段。
- 卡面文字 `text` 只用于显示，不参与执行。

### 3.6 Monster

统一只用数组，不再允许单对象：

```json
{
  "id": "monster.cherub",
  "name": "石头小天使",
  "attributes": { "might": 8, "speed": 4, "sanity": 8, "known": 8 },
  "counts": { "3": 1, "4": 2, "5": 3, "6": 4 },
  "spawn": { "placement": "scenario", "rooms": ["room.upperLanding"] },
  "movement": { "dice": 1, "zeroMeans": "skip", "ignoreDoors": false },
  "attack": { "trait": "might", "damage": "physical" },
  "flags": {
    "noAttack": true,
    "noStun": false,
    "oneHit": false,
    "ignoreDoors": false,
    "damageReduce": 0
  },
  "abilities": [
    {
      "trigger": { "type": "onEnterRoom", "room": "same" },
      "effects": [ { "op": "teleport", "target": "self", "to": "adjacent" } ]
    }
  ],
  "boundRoom": null
}
```

构建器必须把 `flags`、`abilities`、`movement` 全部写入运行时；运行时禁止再手工挑字段拷贝。

怪物行动阶段必须带：

```json
{ "ownerSide": "traitor", "actorId": "player-id", "turnMode": "afterTraitor|afterEachPlayer|none" }
```

`noTraitor` 剧本默认 `turnMode` 由剧本给定，不能自动“每名玩家后都行动”。

### 3.7 Scenario

```json
{
  "id": "scenario.2",
  "no": 2,
  "name": "永远的朋友",
  "trigger": {
    "kind": "omen",
    "scenarioCard": "诅咒",
    "omen": "骨戒",
    "event": null
  },
  "factions": {
    "type": "hidden_traitor",
    "traitorRule": "numberToken",
    "pvpBeforeReveal": true
  },
  "setup": [
    { "op": "setupNumberTokens", "range": "playerCount", "reveal": "selfOnly" },
    { "op": "setNumberTrack", "byPlayerCount": { "3": 6, "4": 5, "5": 4, "6": 3 } }
  ],
  "heroGoal": {
    "type": "anyOf",
    "goals": [
      { "type": "destroyItem", "item": "card.omen.ring" },
      { "type": "kill", "target": "traitor" }
    ],
    "text": "摧毁戒指，或杀死叛徒"
  },
  "traitorGoal": {
    "type": "allOf",
    "goals": [
      { "type": "killAll", "target": "heroes" },
      { "type": "numberTrackAtZero" }
    ],
    "text": "所有英雄死亡，或数字轨道归 0"
  },
  "monsters": [],
  "actions": [],
  "rules": {
    "hero": "…",
    "traitor": "…",
    "source": "official-3e-rules.json#2",
    "verified": true
  }
}
```

硬性要求：

- `factions.type` 必须是 `traitor_vs_heroes` / `hidden_traitor` / `no_traitor` / `free_for_all` 之一。
- `no_traitor` 时 `traitorGoal` 必须为 `null`，不能用文本冒充。
- `free_for_all` 必须提供 `playerGoal` 或 `goalsBySide`；不能复用英雄/叛徒二元判断。
- `hidden_traitor` 必须提供编号分配方式、揭示条件、揭示前后 PvP 规则。
- `setup` 必须显式存在，允许 `[]`，但不能缺字段。
- `monsters` 统一数组；数量缩放放 `counts`，不能靠运行时随机生成。
- `rules` 仅展示，不参与执行；执行只读结构化字段。

### 3.8 运行态与公开/私有状态

目标状态：

```ts
interface RoomState {
  schema: 'cabin-3e/1';
  revision: number;
  engineVersion: 3;
  contentHash: string;        // 构建产物 hash，房间创建时冻结
  phase: 'lobby' | 'select' | 'playing' | 'haunt' | 'ended';
  public: PublicState;
  secrets: PlayerSecrets[];   // 仅服务端与本人可见
}
```

`PublicState` 允许包含：

- 房间、公开门位、公开标记、公开怪物位置与已揭示属性。
- 玩家昵称、角色、轨道位置、公开物品、是否死亡、是否已揭示阵营。
- 回合、轮次、牌堆剩余数、公开日志、闹鬼是否开始、已公开剧本名。

`PlayerSecrets` 只包含：

- 本人隐藏阵营与目标。
- 隐藏编号/令牌。
- 本人可见的私有提示与私有日志。
- 未公开的手牌信息（若该剧本要求）。

投影函数：

```ts
viewFor(state, viewerId) -> ClientView
```

必须保证：

- 未揭示的 `side` 一律返回 `unknown`。
- 其他玩家的 `traitorGoal`、隐藏编号、私有标记不出现。
- 公开日志不能包含“X 是叛徒”等秘密，除非已揭示。
- `viewFor` 有单元测试，直接断言序列化结果不含敏感键。

---

## 4. 引擎接口

### 4.1 门面

```ts
createInitial(players, content, options, rng) -> GameState
act(state, action, ctx, rng) -> ActResult
viewFor(state, viewerId) -> ClientView
validateState(state) -> ValidationResult
```

`ctx`：

```ts
{
  actorId: string;
  role: 'player' | 'server';
  now: number;
}
```

`ActResult`：

```ts
{
  ok: boolean;
  state?: GameState;
  events: EngineEvent[];
  error?: { code: string; message: string; details?: unknown };
}
```

### 4.2 轨道接口

唯一允许的写入口：

```ts
moveTrack(state, playerId, trait, delta, reason) -> Mutation
damageTrack(state, playerId, trait, steps, reason) -> Mutation
healTrack(state, playerId, trait, steps, reason) -> Mutation
setTrackPosition(state, playerId, trait, pos, reason) -> Mutation
swapTracks(state, aId, bId) -> Mutation
reviveTracks(state, playerId) -> Mutation
```

每次调用必须：

1. 更新 `track.pos`。
2. 重新计算派生 `traits`。
3. 校验 `traits[trait] === track.list[track.pos - 1]`。
4. 把 `pos` 变化前后写入 `EngineEvent`，供 UI 播放轨道动画。

禁止任何模块直接写 `player.traits[...]`。`traitVal` 必须读 `track.pos`。

### 4.3 地图接口

```ts
neighbors(state, roomId) -> Edge[]
findPath(state, fromRoomId, toRoomId, opts) -> Path | null
lineOfSight(state, fromRoomId, toRoomId) -> boolean
distance(state, fromRoomId, toRoomId) -> number
```

边由三部分合并：

1. 相邻格 + 双向门位。
2. `links` 特殊连接。
3. 楼梯/电梯/剧本生成的动态连接。

玩家移动、怪物寻路、远程攻击、视线、房间连通全部只走这一套 API。

### 4.4 闹鬼接口

```ts
resolveTrigger(state, source) -> HauntTriggerResult
selectScenario(state, trigger) -> Scenario
runScenarioSetup(state, scenario) -> Mutation
resolveFactions(state, scenario) -> Mutation
evaluateObjectives(state) -> { heroes: boolean; traitor: boolean; players?: Record<string, boolean> }
resolveWinner(state) -> Winner | null
startHaunt(state, trigger) -> ActResult
```

`startHaunt` 不再包含“选人 + 发牌 + 生成怪物 + 判胜负”的全部逻辑，按上述步骤串行执行，每一步可单测。

官方原文与中文规则通过 `resolveScenarioRules(scenario)` 进入运行时，只投影到闹鬼开始后的公开/本人视图，供 UI 展示与溯源；执行器不得解析 OCR 文本。

### 4.5 卡牌接口

```ts
resolveCard(state, cardId, context, rng) -> CardResolution
applyEffects(state, effects, context) -> Mutation
registerEffect(op, handler) -> void
```

卡牌只描述效果，不直接调用 `applyDamage`/`gainTrait`；由效果执行器统一调用轨道、伤害、地图、闹鬼接口。

### 4.6 怪物接口

```ts
spawnMonster(state, monsterSpec, placement) -> MonsterRuntime
beginMonsterPhase(state, scenario) -> MonsterPhase
monsterAction(state, monsterId, action, rng) -> ActResult
```

运行时对象必须由 `{ ...monsterSpec, id, location, owner, status }` 完整展开，不允许逐字段白名单复制。

---

## 5. 文件级改动清单

| 文件 | 动作 | 验收 |
|---|---|---|
| `content/cabin/schema/*.schema.json` | 新增 Character/Room/Card/Monster/Scenario/State Schema | 构建器用同一 Schema 校验 |
| `content/cabin/**/*.json` | 按目标 Schema 迁移；补 50 剧本 setup/factions/traitorGoal；统一 monster 数组；补卡牌 abilities | 所有对象 `source.verified=true` |
| `tools/validate-cabin-content.mjs` | 新增，严格校验 ID 唯一、引用存在、效果 op 已注册、剧本编号 1–50 | `node tools/validate-cabin-content.mjs` 失败即阻断 |
| `tools/build-cabin-packs.mjs` | 删除 `killAll` 默认；统一 monster 数组；保留 flags/abilities；生成 version 与 hash | 缺字段直接 throw |
| `js/games/cabin.js` | 改为兼容门面或删除；不得继续承载全部规则 | UI 仍能通过 `window.CabinEngine` 调用 |
| `js/games/cabin/engine.mjs` | 新增纯引擎入口 | 浏览器与 Node 均可 import |
| `js/games/cabin/traits.mjs` | 新增轨道唯一写入口 | 轨道不变量测试全过 |
| `js/games/cabin/effects.mjs` | 新增效果执行器与注册表 | 所有 op 有单元测试 |
| `js/games/cabin/map.mjs` | 新增房间图与寻路 | 门/密道/楼梯/电梯共用 |
| `js/games/cabin/haunt.mjs` | 拆 Trigger/Selector/Setup/Faction/Goal/Winner | 50 剧本 contract 测试 |
| `js/games/cabin/monsters.mjs` | 新增怪物运行时与阶段 | 特殊技能不再丢字段 |
| `js/games/cabin/view.mjs` | 新增玩家投影 | 不含他人秘密 |
| `js/games/cabin-adapter.js` | UI 适配层 | `design/cabin.html` 只改脚本加载 |
| `js/net.js` | 公开态读写 + 私有态拉取 + 服务端动作调用 | 无直接写 `rooms.state` |
| `sql/rooms.sql` | 拆 `rooms` / `room_members` / `room_secrets` / `room_actions`；开 RLS | 第二个玩家 JWT 读不到秘密 |
| `supabase/functions/cabin-action/index.ts` | 新增动作验证与结算 | 伪造 actor、越权动作被拒 |
| `.github/workflows/cabin3e.yml` | 新增全量 CI | schema + unit + scenarios + security |
| `tests/cabin/*.test.mjs` | 新增分层测试 | 见第 8 节 |
| `README.md` | 更新 3E 数据、房间数量、测试与联机架构 | 不再出现 2E 数字 |
| `design/cabin.html` | 保留布局；接 `EngineEvent` 播放翻卡/轨道动画 | 手机/电脑 e2e 通过 |

---

## 6. 迁移顺序

### 阶段 0：冻结基线与合同

产出：

- 本规格评审通过。
- 房间数量对账结论（46/5 vs 42/3）。
- 50 剧本官方来源页码索引。
- 旧引擎行为快照测试（只锁现状，不锁 bug）。
- 新引擎 feature flag `engineVersion=3`。
- CI 先接现有全部 cabin 测试，防止重构中静默退化。

退出条件：

- 所有内容对象有 `source` 与 `verified` 状态。
- 当前数量差异有明确结论。
- 旧房间继续 legacy，新房间默认 v3；禁止原地迁移进行中的房间。

### 阶段 1：数据结构和构建器

产出：

- Schema 与验证器。
- 50 剧本补齐 `factions/setup/heroGoal/traitorGoal/monsters`。
- 怪物统一数组；卡牌补 `abilities/weapon`。
- 删除构建器与运行时两处默认 `killAll`。

退出条件：

- 任一剧本缺目标或 setup 时构建失败。
- `node tools/validate-cabin-content.mjs` 0 错误。
- 50 个剧本全部通过 contract 测试（字段、引用、目标类型）。

### 阶段 2：轨道与战斗

产出：

- 轨道 API 与不变量。
- 派生 `traits` 不再手写。
- 武器 `attackDice/attackResult/range` 拆分。
- 伤害、治疗、换身、转移、复活全部走轨道 API。

退出条件：

- 轨道操作后 `pos` 与显示值始终一致。
- `swapBodies`、`transfer`、`revive` 有专门测试，不再出现轨道错位。
- 砍刀 +1 结果、电锯 +1 骰、枪远程、弩速度攻防分别测试通过。

### 阶段 3：Haunt Engine

产出：

- Trigger Resolver、Scenario Selector、Setup Runner、Faction Resolver、Objective Engine、Winner Resolver。
- 5 张事件按成功/失败/闹鬼后分支执行，且只触发一次。
- 隐藏叛徒编号、揭示、PvP 规则。
- 无叛徒与自由混战独立胜负。

退出条件：

- 50/50 剧本完成一次自动化 setup + 目标达成模拟。
- 5 张特殊事件分别测试成功、失败、闹鬼后路径，断言 `startHaunt` 次数为 1 或 0。
- 无叛徒剧本不会每名玩家后都生成怪物阶段。

### 阶段 4：Card Engine

产出：

- 43 事件、22 物品、9 预兆全部有可执行定义。
- 触发器：`onTraitCheckBefore/onAttack/onDefense/onDamage/onTurnStart/onTurnEnd/activeAction`。
- 效果：重掷、改骰、改结果、伤害转换、减伤、传送、额外回合、范围攻击等。

退出条件：

- 每张非纯展示卡至少有一个 `ability` 或 `weapon/armor` 定义。
- 所有 op 有单测；未注册 op 构建失败。
- “只能看不能用”的卡为 0。

### 阶段 5：Room Engine

产出：

- 房间图、门/密道/电梯/楼梯统一。
- 房间时机：首次发现、进入、回合结束仍在、主动行动。
- 特殊房间改为 abilities，不再 switch 字符串。
- 房间数量对账完成。

退出条件：

- 玩家与怪物使用同一 `neighbors/findPath`。
- 8 条 `link` 全部可达且双向。
- 神秘电梯、军械库、锅炉房、恐慌室、根窖等有测试。
- 固定网格边界不再导致合法房间无法放置；边界规则写入地图配置。

### 阶段 6：Monster Engine

产出：

- 统一运行时对象，完整保留 flags/abilities。
- 剧本指定位置与数量，不再随机摆放。
- 同种怪物共享移动骰；0 正确处理。
- 行动顺序、owner、数量缩放、特殊攻击、融合、无视门、不可击晕等。

退出条件：

- 每个剧本怪物按剧本 setup 出现。
- `noStun/oneHit/ignoreDoors/damageReduce/attackOnly/boundRoom` 均有执行测试。
- 移动骰 0 不移动；无叛徒剧本怪物行动次数符合剧本。

### 阶段 7：私有状态与服务端权威

产出：

- Supabase Auth 匿名登录。
- `rooms` 公开态、`room_secrets` 私有态、`room_members` 成员表。
- Edge Function `cabin-action` 验证 actor、回合、动作合法性、随机结果。
- RLS：非本人无法读取 secrets；客户端无写权限。
- `viewFor` 投影与日志脱敏。

退出条件：

- 用玩家 B 的 JWT 直接 REST 查询玩家 A 的 secret，返回空/拒绝。
- 客户端内存中不存在未揭示叛徒身份。
- 伪造 `actorId`、越权攻击、非本人回合操作被服务端拒绝。
- 断线重连仍能拿到自己的秘密与公开态。

### 阶段 8：全量回归与 UI 接入

产出：

- `EngineEvent` 接入翻卡、轨道、伤害、剧本、怪物动画。
- 手机与电脑布局保留。
- 3/4/5/6 人真实联机 e2e。
- README、规则说明、开发文档更新。

退出条件：

- 第 9 节验收矩阵全部通过。
- 线上 Pages 验证通过。
- 旧房间可继续 legacy 完成，不会因新引擎部署中断。

---

## 7. 测试计划

### 7.1 内容合同测试

`tests/cabin/content.contract.test.mjs`

- ID 唯一、引用存在。
- 50 剧本编号 1–50 无缺口。
- 每个剧本有 `factions/setup/heroGoal`；非无叛徒必须有 `traitorGoal`。
- 每个 `hidden_traitor` 有编号分配与揭示规则。
- 每个 `free_for_all` 有多方目标。
- 每个怪物数组元素有完整属性与数量。
- 每条 `link` 双向存在；每条房间连接目标存在。
- 每个卡牌 ability 的 op 已注册。

### 7.2 单元测试

按模块拆：

- `traits.test.mjs`：轨道上下限、伤害、治疗、换身、转移、复活、死亡。
- `combat.test.mjs`：攻防骰、结果加值、远程、视线、武器、反击、护甲。
- `effects.test.mjs`：每个 op 的成功/失败/边界。
- `map.test.mjs`：门、密道、电梯、楼梯、寻路、视线、边界。
- `cards.events.test.mjs`：43 张逐张分支。
- `cards.items.test.mjs`：22 张逐张能力。
- `cards.omens.test.mjs`：9 张逐张能力与隐藏信息。
- `monsters.test.mjs`：统一运行时、0 移动、行动顺序、特殊 flags。
- `haunt.test.mjs`：5 事件路径、隐藏叛徒、无叛徒、混战。
- `view.test.mjs`：每个角色视角不含他人秘密。

### 7.3 剧本覆盖测试

每个剧本两条：

1. **Contract**：setup 可执行、双方目标可解析、怪物可生成、行动可调用。
2. **Playthrough**：使用确定性 RNG 和剧本策略 bot，执行合法动作直到结束；断言获胜方与目标一致。

对无法用 bot 自然完成的剧本，允许“场景夹具”直接布置到目标前一步，但最后一步必须由引擎动作完成，不能直接写 `winner`。

### 7.4 随机压力测试

- 1000 局 3–6 人随机合法动作，0 异常。
- 每次动作后跑 `validateState`：轨道一致、房间不重叠、引用存在、无负移动点、无未注册 op。

### 7.5 安全测试

- 使用两个匿名 JWT，玩家 B 查询 `room_secrets` 中玩家 A 的行必须为空。
- 玩家 B 调 Edge Function 冒充 A 的 `actorId` 必须 403。
- 非本人回合动作、非法目标、重复结算必须拒绝。
- 客户端收到的公开态 JSON 中搜索隐藏剧本目标关键词，必须不存在。

### 7.6 多人 e2e

- 3 / 4 / 5 / 6 人各一局。
- 覆盖：大厅、入座、开局、选角、移动、翻房、抽牌、闹鬼、隐藏叛徒揭示、怪物阶段、胜负。
- 手机 390×844 与桌面 1280×820 各跑一次关键路径。
- 断线 30 秒重连，不丢秘密、不重复行动。

### 7.7 CI

新增 `.github/workflows/cabin3e.yml`：

```yaml
- node tools/validate-cabin-content.mjs
- node tools/build-cabin-packs.mjs
- node tests/cabin/content.contract.test.mjs
- node tests/cabin/traits.test.mjs
- node tests/cabin/effects.test.mjs
- node tests/cabin/map.test.mjs
- node tests/cabin/cards.events.test.mjs
- node tests/cabin/cards.items.test.mjs
- node tests/cabin/cards.omens.test.mjs
- node tests/cabin/monsters.test.mjs
- node tests/cabin/haunt.test.mjs
- node tests/cabin/scenarios.contract.test.mjs
- node tests/cabin/scenarios.playthrough.test.mjs
- node tests/cabin/view.test.mjs
```

PR 阶段跑单元与 contract；`main` 跑全量 + 50 剧本 playthrough；安全测试用独立 staging Supabase 项目，不在生产库跑。

---

## 8. 验收矩阵

| 项目 | 合格标准 | 验证方式 |
|---|---|---|
| 人物 | 12 名、6 块板、四轨完整 | Schema + 内容测试 |
| 房间 | 以对账后的官方清单为准；普通牌/起始板块数量一致 | 内容合同测试 |
| 事件 | 43 张，所有分支可执行 | 逐张单测 |
| 物品 | 22 张，所有能力可执行 | 逐张单测 |
| 预兆 | 9 张，属性与特殊能力可执行 | 逐张单测 |
| 剧本 | 50 个，触发、布置、阵营、双方目标、胜负完整 | contract + playthrough |
| 怪物 | 剧本指定位置/数量/能力全部生效 | 怪物单测 + 剧本模拟 |
| 轨道 | 所有变化经统一 API；`pos` 与显示一致 | 不变量测试 |
| 地图 | 玩家/怪物共用图；密道/电梯/楼梯可用 | 地图单测 |
| 联机 | 秘密信息受服务端权限保护 | 双 JWT 安全测试 |
| UI | 现有手机/电脑布局保留 | Playwright e2e |
| 测试 | 以上全部进 CI | GitHub Actions |
| 旧房间 | legacy 可完成，不被新引擎破坏 | 回归测试 |

### 8.1 发布门禁

以下任一项不满足，禁止把新引擎设为默认：

- 50 剧本 contract 或 playthrough 有失败。
- 任一卡牌存在“只能看不能用”。
- 轨道不变量失败。
- 秘密信息能从公开态或网络响应读到。
- 3 人 e2e 不能完整走完一局。

---

## 9. 不该动的东西

- 现有 Q 版视觉、手机底栏两行、桌面地图、卡面弹窗、翻卡动画、角色选角面板。
- `design/games/shell.js` 的大厅/座位/房间码流程（只允许扩展状态投影）。
- 非 Cabin 游戏与引擎。
- 已经完成的 12 人物、50 规则中文、OCR 原文；这些是资产，不是重构对象。

引擎重构只改“数据如何被执行、状态如何被授权访问”，不重做交互。

---

## 10. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 50 剧本结构化工作量被低估 | 长期停在半成品 | 阶段 1 先做 schema 与 contract，逐剧本 PR；禁止一次性大爆炸 |
| 官方 OCR 有误 | 错误规则进入代码 | `source.verified` 门禁；英文只展示，结构化字段人工复核 |
| 房间数量口径冲突 | 验收标准不成立 | 阶段 0 对账，未结论前不宣称数量完成 |
| Supabase 免费/权限限制 | 服务端权威无法上线 | 阶段 7 前确认 Edge Function 与匿名 Auth 可用；不可用则不上线隐藏信息模式 |
| 纯引擎拆分影响现有 UI | 现有可玩版本回退 | 保留 legacy + feature flag；新房间 v3，旧房间不迁移 |
| 测试数量爆炸 | CI 太慢 | contract 快跑；playthrough 按标签分层，main/nightly 跑全量 |
| 服务端随机与客户端离线冲突 | 本地单机无法复现 | `rng` 注入；本地 dev 用 seeded RNG，线上用服务端 RNG |

---

## 11. 待确认决策

1. **房间数量唯一口径**：42+3 还是 46+5？以哪份实体清单为准？
2. **50 剧本结构化来源**：是否以当前 `official-3e-rules.json` 的 `zh` 摘要为唯一人工录入依据，还是重新逐页复核英文 OCR？
3. **联机安全上线范围**：隐藏叛徒/自由混战是否在服务端权威完成前暂停开放，还是继续只做好友局并明示“无秘密”？
4. **旧房间策略**：进行中的旧房间是否永久 legacy，还是允许房主手动升级？
5. **随机数**：线上是否全部服务端掷骰，客户端只播放结果？

---

## 12. 建议的 PR 切片

| PR | 内容 | 不含 |
|---|---|---|
| PR-0 | 规格、基线审计、房间数量对账、CI 接入现有测试 | 不改规则 |
| PR-1 | Schema + 验证器 + 删除两处 `killAll` 默认 | 不补 50 剧本内容 |
| PR-2 | 轨道 API + 派生值 + 换身/转移/复活修复 | 不改卡牌 |
| PR-3 | 效果 DSL + op 注册表 + 单测 | 不接 50 剧本 |
| PR-4 | 5 张特殊事件分支 + Haunt 六段拆分 | 不接全部剧本 setup |
| PR-5 | 50 剧本 factions/setup/goals/monsters 数据 | 不改怪物 AI |
| PR-6 | 43 事件 + 22 物品 + 9 预兆执行 | 不改房间 |
| PR-7 | 房间图 + link/电梯/楼梯 + 房间 ability | 不改联机 |
| PR-8 | 怪物统一运行时 + 行动顺序 + 特殊能力 | 不改 UI |
| PR-9 | 私有态/RLS/Edge Function/服务端随机 | 不改视觉 |
| PR-10 | EngineEvent 接入 UI + 全量 e2e + 文档 | 不做新玩法 |

每个 PR 必须独立通过：内容校验、相关单测、至少一局 3 人 e2e 冒烟。

---

## 附录 A：50 剧本当前状态清单

> `single/array/none` 表示当前怪物字段形态。所有行都缺 `setup/factions/traitorGoal`，不在表中重复标注。

| No | 名称 | 触发 | 叛徒规则 | 英雄目标 | 怪物 |
|---:|---|---|---|---|---|
| 2 | 永远的朋友 | 诅咒 + 骨戒 | hiddenTraitor | killTraitor | none |
| 4 | 解救房产中介 | 待售 + 野狗 | noTraitor | ritual | none |
| 5 | 石中血 | 超自然调查员 + 面具 | noTraitor | hunt | single |
| 6 | 遗产 | 神秘邀请 + 血匕首 | hiddenTraitor | evidence | none |
| 8 | 家政服务 | 神秘邀请 + 野狗 | noTraitor | tokens | single |
| 9 | 往事如烟 | 神秘邀请 + 石神像 | freeForAll | killAll | none |
| 10 | 一笔认真的交易 | 待售 + 铁十字 | freeForAll | treasure | none |
| 11 | 别被煮熟 | 离奇失踪 + 血匕首 | freeForAll | tokens | none |
| 13 | 圣地 | 离奇失踪 + 圣徽 | revealer | ritual | single |
| 14 | 物质不灭 | 待售 + 旧书 | leftOfRevealer | tokens | single |
| 15 | 群魔乱舞 | 超自然调查员 + 血匕首 | revealer | hunt | array |
| 16 | 来和我们玩 | 超自然调查员 + 旧书 | revealer | ritual | single |
| 17 | 转发此信，否则…… | 诅咒 + 血匕首 | revealer | hunt | single |
| 18 | 这枚戒指真不错 | 超自然调查员 + 骨戒 | revealer | killTraitor | none |
| 19 | 镜头记录 | 诅咒 + 圣徽 | revealer | tokens | single |
| 20 | 别说出口 | 诅咒 + 野狗 | oldest | killTraitor | single |
| 21 | 恐怖大师麦克马斯特为您呈现 | 离奇失踪 + 旧书 | revealer | killTraitor | single |
| 22 | 地下行动 | 待售 + 骷髅 | leftOfRevealer | escape | single |
| 23 | 入侵警报 | 诅咒 + 石神像 | revealer | tokens | single |
| 24 | 暗影假面舞会 | 神秘邀请 + 面具 | highestSpeed | tokens | single |
| 25 | 借来的时间 | 离奇失踪 + 铁十字 | leftOfRevealer | ritual | none |
| 26 | 家族的祝福 | 神秘邀请 + 圣徽 | revealer | ritual | single |
| 27 | 星辰之语 | 诅咒 + 面具 | revealer | killTraitor | none |
| 28 | 更大的房子 | 超自然调查员 + 石神像 | revealer | hunt | single |
| 29 | 美丽花园 | 待售 + 骨戒 | revealer | ritual | single |
| 30 | 至死不渝 | 离奇失踪 + 骨戒 | lowestSanity | tokens | single |
| 31 | 一线鬼机 | 超自然调查员 + 圣徽 | revealer | escape | single |
| 32 | 大灾变 | 超自然调查员 + 骷髅 | revealer | hunt | single |
| 34 | 右侧的维度 | 离奇失踪 + 石神像 | highestKnowledge | allOf | none |
| 35 | 太空鼻涕虫 | 离奇失踪 + 骷髅 | revealer | tokens | single |
| 36 | 寻得安宁 | 待售 + 圣徽 | lowestSanity | tokens | single |
| 37 | 灵魂出窍 | 神秘邀请 + 铁十字 | revealer | allOf | single |
| 38 | 邪恶侍从 | 神秘邀请 + 骨戒 | revealer | hunt | single |
| 39 | 蜂群意识 | 诅咒 + 旧书 | highestKnowledge | hunt | single |
| 40 | 血肉行者归来 | 待售 + 面具 | revealer | hunt | none |
| 41 | 机器中的神 | 待售 + 石神像 | revealer | tokens | single |
| 42 | 零食来袭 | 超自然调查员 + 野狗 | revealer | tokens | single |
| 43 | 躲猫猫与进食 | 离奇失踪 + 野狗 | mostOmens | survive | single |
| 44 | 缺失的缝线 | 离奇失踪 + 面具 | leftOfRevealer | tokens | single |
| 45 | 大胆登场 | 神秘邀请 + 旧书 | revealer | killTraitor | none |
| 46 | 幽灵发丝 | 诅咒 + 骷髅 | revealer | hunt | single |
| 47 | 难忘的骑士 | 超自然调查员 + 铁十字 | revealer | tokens | none |
| 48 | 别惹主人！ | 神秘邀请 + 骷髅 | highestMight | escape | single |
| 49 | 条款与条件 | 待售 + 血匕首 | revealer | killTraitor | single |
| 50 | 血肉与金属的味道 | 诅咒 + 铁十字 | revealer | rig | single |
| 1 | 尸堆如山·绯红杰克的归来 | 绯红之溅 | revealer | ritual | single |
| 3 | 尘埃 | 一管尘 | hiddenTraitor | tokens | single |
| 7 | 镜中倒影 | 诡异镜子 | noTraitor | tokens | single |
| 12 | 援手 | 房子饿了 | freeForAll | killAll | single |
| 33 | 对着镜头笑一个 | 说茄子 | seeEvent | tokens | single |

---

## 附录 B：当前房间特殊数据

| 房间 | 楼层 | `effect` | `special` | `link` |
|---|---|---|---|---|
| 礼拜堂 | ground | gain sanity 1 | — | — |
| 坍塌房间 | upper | — | collapsed | — |
| 画廊 | ground | — | — | 舞厅 |
| 游戏室 | ground | — | — | 舞厅 |
| 墓园 | upper | — | — | 地下洞穴 |
| 体育馆 | ground | gain speed 1 | — | — |
| 食品储藏室 | upper | gain might 1 | — | — |
| 洗衣滑道 | ground | — | coal | — |
| 图书室 | ground | gain known 1 | — | — |
| 神秘电梯 | ground | — | elevator | — |
| 地牢 | basement | — | — | 战利品室 |
| 根窖 | basement | — | — | 时光树 |
| 密梯 | upper | — | basementStairs | — |
| 时光树 | upper | — | — | 根窖 |
| 战利品室 | basement | — | — | 地牢 |
| 地下洞穴 | basement | — | — | 墓园 |

当前 8 条 `link` 是 4 组双向连接；引擎只加载未消费。`神秘电梯` 的 `elevator` 字段没有任何执行分支，必须迁移为 `abilities`。

---

## 附录 C：当前卡牌执行缺口

### C.1 16 张纯文本物品

天使羽毛、胸针、急救包、手电筒、耳机、皮夹克、幸运币、魔法相机、地图、镜子、神秘秒表、牙齿项链、兔脚、万能钥匙、古怪药、古怪护符。

另有炸药虽然带 `weapon` 标记，但范围攻击没有实际实现，必须补为主动/替代攻击能力。

这些牌必须补 `abilities`，并按触发时机接入：

- 手电筒：`onTraitCheckBefore` +2 骰，仅事件检定。
- 兔脚：`reroll` 单骰。
- 幸运币：重掷空白骰，每骰 1 点精神伤害。
- 胸针：`convertDamage` 物理/精神 → 通用。
- 牙齿项链：`onTurnEnd` 治疗一项重伤。
- 炸药：`areaAttack`。
- 地图/镜子/急救包/古怪药：主动埋牌效果。
- 万能钥匙：穿墙移动与空白骰弃牌。
- 神秘秒表：额外回合，闹鬼后可用。
- 魔法相机：知识判定改用神智。
- 耳机/皮夹克/天使羽毛/诡异玩偶：减伤、防御骰、改结果、重掷。

### C.2 14 张分支为空的事件

绯红之溅、诡异的感觉、一管尘、吱呀作响的门、吊死的人、诡异镜子、血肉苔、神秘液体、说茄子、断手、广播、电话、秘密电梯、房子饿了。

其中 5 张是特殊闹鬼事件：绯红之溅、一管尘、诡异镜子、说茄子、房子饿了。当前不仅缺分支，还存在“判定失败也触发”的双路径，必须在 Haunt Engine 阶段一并修掉。

### C.3 预兆

9 张均有属性 `delta`，但除铁十字护甲、骨戒/血匕首武器外，狗交易、石神像跳过事件、旧书改判定、面具推人、圣徽跳房、骷髅免死等特殊能力都只在文本里。需要迁移为 `abilities`，并处理隐藏信息。

---

## 附录 D：建议的首批验收用例

1. `scenario.5` 石中血：7 只小天使按剧本位置出现；不可攻击；捉迷藏成对移除；4 对后英雄胜。
2. `scenario.2` 永远的朋友：编号 1–N 私下分配；叛徒未揭示前可互攻；揭示后目标生效；数字轨道归 0 或英雄全灭判叛徒胜。
3. `scenario.9` 往事如烟：自由混战，无二元叛徒；只剩一人即胜。
4. `scenario.4` 解救房产中介：无叛徒；仪式房 3 次神智 5；怪物阶段不按每玩家触发。
5. `card.event.say_cheese`：6 骰 5+ 才开 #33；失败抽物品；闹鬼后抽物品；`startHaunt` 只调用一次。
6. `card.item.chainsaw`：+1 攻击骰，不加结果。
7. `card.item.machete`：+1 结果，不加骰。
8. `card.item.gun`：视线内远程，输时不受伤。
9. `room.mysteryElevator`：可到达另一层任意区域，且不触发翻房。
10. 换身：两名玩家四条轨道 `pos` 一起交换，随后判定值正确。
11. 借属性：转移后双方轨道 `pos` 与显示值一致。
12. 玩家 B JWT 查询玩家 A 秘密：空结果；公开 JSON 无隐藏目标。

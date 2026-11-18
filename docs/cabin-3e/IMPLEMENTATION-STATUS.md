# Cabin 3E 规则引擎重构 · 实施状态

更新时间：2026-11-18
对应规格：`docs/cabin-3e/ENGINE-REFACTOR-SPEC.md`

## 当前结论

第三版迁移已经从“只把规则写进 JSON”推进到“规则有运行入口、内容有硬合同、关键路径有自动化测试”。

- 5 组 Cabin 测试全部通过：**150 passed / 0 failed**
- 三用户真实联机回归：**12 / 12 passed**（房主 + DD + 手机三号）
- 内容审计：事件空分支 **0**，纯文本物品 **0**，剧本缺 factions **0**，缺 traitorGoal **0**，缺 setup 合同 **0**

## 已落地

### 1. 内容合同

- `factions.type` 强制为 `traitor_vs_heroes / hidden_traitor / cooperative / free_for_all`
- 删除构建器与运行时“缺 traitorGoal 就默认杀光英雄”的兜底
- 50 个剧本全部写入 `factions`
- 42 个有叛徒/隐藏叛徒的剧本写入显式 `traitorGoal`；8 个无叛徒/自由混战为 `null`
- 50 个剧本全部写入 `setup` 合同（`mode: manual` + 官方 OCR Setup 原文）
- 构建器拒绝缺 `setup`、缺 factions、非法 goal 的剧本

### 2. 属性轨道

- `player.track[trait]` 成为唯一真源，`player.traits[trait]` 只做派生显示
- 新增 `setTrack / moveTrack / healTrait / gainTrait / loseTraitDirect`
- 伤害、治疗、属性转移、身体交换、死亡、复活全部走轨道
- 闹鬼后轨道到骷髅触发死亡、掉落物品
- 身体交换同时交换人物板、角色名、年龄、生日和 `charTaken`

### 3. 剧本与事件

- 5 张特殊事件：`hauntCheck` 带 `scenarioNo`、成功/失败/已闹鬼三个分支
- 删除正常抽牌路径上的无条件 `maybeEventHaunt`，失败不会误开闹鬼
- 43 张事件空分支归零
- 新增无属性骰（`roll.trait: none` + `dice`）和 `fourTraitRoll`，支持“掷两骰/三骰”的事件
- 新增 `gainAny`、`healMany`、`healAll`、`teleport:any` 效果入口
- 隐藏叛徒从存活玩家随机抽签，不再默认揭示者

### 4. 卡牌与物品

- 武器拆成 `attackDice` 与 `attackResult`，攻击总值 = 骰子总和 + 结果加成
- 电锯、弩、枪、匕首走攻击骰；砍刀走结果 +1；炸药改为 `noNormalAttack`
- 22 张物品全部有至少一个结构化能力字段，纯文本物品归零
- 已执行：耳机精神伤害 -1、皮夹克防御骰、古怪护符物理后 +1 神智、手电筒事件判定 +2 骰、牙齿项链回合结束治疗、急救包/镜子/古怪药主动治疗、坍塌房间回合结束速度判定
- 新增主动入口：地图传送、神秘秒表额外回合、天使羽毛指定判定值、魔法相机改用神智做知识判定、万能钥匙穿墙模式
- 胸针现在会把物理/精神伤害自动转成等量通用伤害
- 房间效果新增：军械库翻物品牌直到武器并拿走、锅炉房结束回合受 1 点物理伤害、恐慌室从板块堆找密梯放地下室、根窖把时光树放二层
- 判定流程改为“掷出 → 可重掷 → 确认”；幸运币/兔脚/诡异玩偶可在结算前重掷，确认后才应用结果
- `trackZero` 目标已接入 `goalDone`，DNA 这类“每名英雄一份”的 `tokens` 目标支持 `perHero`

### 5. 房间与怪物

- 8 条特殊连接可走：画廊↔舞厅、游戏室↔舞厅、墓园↔地下洞穴、地牢↔战利品室、根窖↔时光树、战利品室↔地牢、地下洞穴↔墓园
- UI 点击非相邻但有 `link` 的房间会发送 `moveRoom`
- 怪物运行时统一 `sanity/known/rule/noStun/oneHit/ignoreDoors/damageReduce/attackOnly/endTurn/boundRoom`
- 同类型怪物共用一次移动骰；结果为 0 不再被强制改成 1
- 无叛徒/自由混战不再在每个玩家回合后都启动怪物阶段，只在一轮最后一名存活玩家后启动一次

### 6. 真实联机验收

`C:\Users\游梦\AppData\Local\Temp\cabin-e2e\e2e.mjs` 使用三个独立浏览器上下文：

- 阿蒙（房主，1440×900）
- DD（1280×820）
- 三号（手机 390×844）

本轮结果：`SUMMARY 12/12 passed; room=UVYKS`

覆盖：建房、三人入座、开始按钮、手机两行底栏、三人选角、DD 点击相邻房间移动、翻卡提示、翻卡动画截图、运行期无页面错误。

### 7. 私有状态与联机权限

- `rooms` 改为成员制 RLS，请求头 `x-player-token` 对应 `room_members` 才算成员
- `room_secrets` 每名玩家一行，只能读自己那一行
- 隐藏剧本写入时，触发器把 `side`、`traitor`、`traitorGoal`、`traitorGoalText` 拆到 secret，并从公开 `state` 删除
- `js/net.js` 建房子/加入走 `cabin_create_room / cabin_join_room`，读写时带令牌；Realtime 收不到私有行时用轮询兜底
- 房间节点点击改为棋盘容器事件委托，避免 render 重建节点导致“点了没反应”

## 仍未完成

以下缺口没有在本轮关闭，不能把当前状态称为“第三版完整迁移”：

1. **剧本 Setup 仍是手动模式**  
   50 个剧本都有 `setup` 合同和官方原文，但 `mode` 是 `manual`，怪物只先集中在闹鬼房间，没有按每个剧本的官方坐标自动摆放。  
   下一步需要逐条核实 50 份 Setup，写入 `placements`，再把 `mode` 改为 `scripted`。

2. **部分剧本目标仍是声明式**  
   `goalDone` 已支持 `killAll / anyOf / allOf / possessItem / convertAll`；`trackZero`、`custom` 仍没有通用执行器。

3. **隐藏叛徒的服务端私有状态已启用**  
   `sql/rooms-private.sql` 已在 Supabase 执行：`room_members` 成员令牌、`room_secrets` 私有表、`rooms` 成员制 RLS、隐藏叛徒拆分触发器、建房/加入/读写 secret 的 RPC。  
   `js/net.js` 已切换 `privateMode`：带 `x-player-token` 建房/加入/读写，隐藏剧本只合并自己的 secret；Realtime 不认自定义头，另加 2.5 秒令牌轮询兜底。  
   已验证：公开 `rooms.state` 不含 `side / traitor / traitorGoal`；英雄 secret 只有自己的 `side`；叛徒 secret 有 `traitor + traitorGoal`；非成员读 secret 被拒。

4. **重掷类物品已接入，但仍只覆盖判定**  
   幸运币、兔脚、诡异玩偶已能在“掷出后、确认前”重掷；攻击骰还没有同样的重掷窗口。

5. **房间效果已补四个关键房间**  
   军械库、锅炉房、恐慌室、根窖已执行；其余房间的 `effect` 仍以属性 +1 为主，特殊动作没有逐张补齐。

## 验证命令

```powershell
cd D:\MyBoardGame
node tools\build-cabin-packs.mjs
node tools/audit-cabin-content.mjs --summary
node tests\cabin.test.js
node tests\cabin-packs.test.js
node tests\cabin-official.test.js
node tests\cabin-3e-rules.test.js
node tests\cabin-specials.test.js
node --check js\games\cabin.js
```

联机回归：

```powershell
cd C:\Users\游梦\AppData\Local\Temp\cabin-e2e
node e2e.mjs
```

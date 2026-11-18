# Cabin 3E 规则引擎重构 · 实施状态

更新时间：2026-11-19
对应规格：`docs/cabin-3e/ENGINE-REFACTOR-SPEC.md`

## 当前结论

第三版迁移已经从“只把规则写进 JSON”推进到“规则有运行入口、内容有硬合同、关键路径有自动化测试”。

- 10 组 Cabin 测试全部通过：原 5 组 + `cabin-security.test.js`（20 项）+ `cabin-setup.test.js`（50 剧本 × 3/4/5/6 人，924 条断言）+ `cabin-rule-fixes.test.js`（49 项）+ `cabin-all-scenarios.test.js`（50 剧本真实运行，373 条断言）+ `cabin-scenario-acceptance.test.js`（独立官方规则验收，33 条断言）
- 三用户真实联机回归：**12 / 12 passed**（房主 + DD + 手机三号，room `X2Z2F`）
- 线上权限复测：身份接管被拒、错误令牌读 secret 被拒、大厅成员不能直写 playing、playing 中非当前行动者被拒
- 内容审计：事件空分支 **0**，纯文本物品 **0**，剧本缺 factions **0**，缺 traitorGoal **0**，缺 setup 合同 **0**，Setup 仍为 manual **0**，剧本缺怪物定义 **0**

### 本轮 P0 私有联机修复

- `cabin_join_room` 不再对已有 `(code,pid)` 覆盖 token；原令牌不匹配直接拒绝，无法用受害者 pid 接管身份
- 新成员加入在大厅阶段由数据库事务完成：advisory lock、人数/席位上限、state.players 同事务写入
- 删除客户端 `cabin_set_secret` 写入口；secret 只由 `cabin_split_hidden` 触发器写入
- 客户端不再直接 `UPDATE rooms` 提交 Cabin 状态，改走 `cabin_push_state`：按 `state.turn` 校验当前行动者、成员令牌、版本号、房主/游戏类型/玩家 ID/createdAt 不可变；大厅阶段只允许房主 `start`
- 开局 `startGame` 保留原房间 `createdAt`，避免服务端把正常开局判成“替换房间创建信息”而拒绝
- 隐藏叛徒从 hidden=true 变 false 时，只有叛徒本人 secret 允许触发；触发器会从 secrets 重建完整 side/traitor 字段，不再直接删 secret 留下残缺公开状态
- 隐藏状态公开 `haunt.sideCounts`（只给聚合人数，不给具体玩家阵营），`checkWin` / `killAll` 使用服务端聚合人数
- `#12 援手` 自由混战改为“持有奇怪护符的最后一人获胜”，全员倒下不再误判英雄胜
- 剧本 12 两只巨魔之手分别摆到入口大厅与底层平台，不再是 manual 随机集中
- 50 个剧本全部改为 `setup.mode = "scripted"`，由 `runScenarioSetup` 实际执行数字轨道、数字/疾病/DNA/血标记、怪物摆放、特殊房间、板块补足/移除、玩家位置、翻面、物品与剧本标志
- `#2` 目标改为“摧毁骨戒或杀死叛徒”，并新增 `destroy_ring` 行动；`#14` 改为数字轨道归零并新增 `cast_spell`；`#19` 增加摧毁录像带与入口大厅逃生；`#37` 增加关闭机器人、逐英雄采集 DNA；`#46` 增加把同房间英雄变成毛发怪
- 事件效果现在执行 `token` / `ops.token`，祝福、密道、障碍标记会真正落盘；密道标记参与房间连通
- 2 人局不再被 `createInitial` 自动补第三名虚拟玩家；桌面棋盘按 `100cqh - 44px` 计算，6 人局底栏不再遮挡最底排房间
- `#13` 新增推进仪式行动，数字轨道归零才唤醒沉睡之她；`#50` 新增逐层吞噬行动，三层都被吞噬后才判叛徒胜；`#36` 觉悟改为检查叛徒神智是否达到最大值，不再因 Setup 标志直接获胜
- `#27` 外星文字改为“叛徒持有供应、逐个铺进房间”，全部铺完才获胜；`#32` 逐层点火，三层烧起来才判“烧毁房子”；`#32` 死亡叛徒可在怪物阶段点火；`#39` 时间流逝行动把数字轨道降到 0 才判“时间耗尽”；`#49` 先夺血、再把血献给同房间恶魔，献齐所有英雄之血才获胜
- 洗衣滑道只在结束回合时滑落；坍塌房间只在结束回合做一次速度判定；神秘电梯进入时掷两骰并按结果换层；怪物寻路只沿真实楼梯连接，不再把三个平台视为完全互通

### 仍然存在的联机安全边界

`cabin_push_state` 只是把“任意成员可写整包状态”收窄为“当前行动者可提交”，**不是完整服务端规则引擎**。当前行动者仍可在自己的回合伪造属性、牌堆、怪物和结算字段。真正的 P0-4 闭环需要 Supabase Edge Function 或独立服务端：
加载完整私有状态 → 验证身份/回合 → 在服务端运行 `CabinEngine.act()` → 只回写服务端计算出的状态。
这一步尚未部署，不能宣称“客户端无法作弊”。


## 已落地

### 1. 内容合同

- `factions.type` 强制为 `traitor_vs_heroes / hidden_traitor / cooperative / free_for_all`
- 删除构建器与运行时“缺 traitorGoal 就默认杀光英雄”的兜底
- 50 个剧本全部写入 `factions`
- 42 个有叛徒/隐藏叛徒的剧本写入显式 `traitorGoal`；8 个无叛徒/自由混战为 `null`
- 50 个剧本全部写入 `setup` 合同，且全部为 `scripted` + 可执行 `setup.ops`；官方 Setup 原文保留用于展示，执行以 ops 为准
- 构建器拒绝缺 `setup`、缺 factions、非法 goal，以及 scripted 缺 `ops` / op 类型或必填字段非法的剧本

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

本轮结果：`SUMMARY 12/12 passed; room=X2Z2F`

覆盖：建房、三人入座、开始按钮、手机两行底栏、三人选角、DD 点击相邻房间移动、翻卡提示、翻卡动画截图、运行期无页面错误。

### 7. 私有状态与联机权限

- `rooms` 改为成员制 RLS，请求头 `x-player-token` 对应 `room_members` 才算成员
- `room_secrets` 每名玩家一行，只能读自己那一行
- 隐藏剧本写入时，触发器把 `side`、`traitor`、`traitorGoal`、`traitorGoalText` 拆到 secret，并从公开 `state` 删除
- `js/net.js` 建房子/加入走 `cabin_create_room / cabin_join_room`，读写时带令牌；Realtime 收不到私有行时用轮询兜底
- 房间节点点击改为棋盘容器事件委托，避免 render 重建节点导致“点了没反应”

## 仍未完成

以下缺口没有在本轮关闭，不能把当前状态称为“第三版完整迁移”：

1. **Setup 已自动执行，语义仍需真人逐剧本确认**
   50 个剧本现在都是 `scripted`，`runScenarioSetup` 会在闹鬼开始时执行 `setup.ops`，Setup 回归覆盖 3/4/5/6 人局共 924 条断言。
   如果 Setup 指定的板块尚未翻出，标记会进入 `pendingTokens`，并在该板块接入地图时自动补放；仍需真人按官方剧本卡确认“标记放在哪个板块/哪一层”的语义细节。

2. **部分剧本目标仍是声明式**  
   `goalDone` 已支持 `killAll / anyOf / allOf / possessItem / convertAll / destroyItem / trackZero / numberTrack / tokens perHero`；`custom` 仍只有 `haunt.custom[key]` 状态入口，没有完整剧本语义。

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
node tools\apply-cabin-translations.mjs
node tools\apply-cabin-p0-fixes.mjs
node tools\build-cabin-packs.mjs
node tools/audit-cabin-content.mjs --summary
node tests\cabin.test.js
node tests\cabin-packs.test.js
node tests\cabin-official.test.js
node tests\cabin-3e-rules.test.js
node tests\cabin-specials.test.js
node tests\cabin-security.test.js
node tests\cabin-setup.test.js
node tests\cabin-rule-fixes.test.js
node tests\cabin-all-scenarios.test.js
node tests\cabin-scenario-acceptance.test.js
node --check js\games\cabin.js
```

联机回归：

```powershell
cd C:\Users\游梦\AppData\Local\Temp\cabin-e2e
node e2e.mjs
```

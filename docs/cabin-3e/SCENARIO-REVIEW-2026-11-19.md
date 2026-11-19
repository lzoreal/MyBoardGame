# 山中小屋 3E 剧本逐条 Review（2026-11-19）

审查范围：`content/cabin/scenarios/official-3e.json` 的 50 个剧本，对照 `js/games/cabin.js` 的 `runScenarioSetup()`、`applyOps()`、`scenarioAction()`、`goalDone()`、`checkWin()`。本轮只做静态审查和脚本化复核，没有改代码，也没有把“测试通过”当成“规则完整”。

## 结论先说

1. 上一轮 Review 指出的两个引擎问题，在当前代码里已经不再成立：
   - `applyDamageSplit()` 已经有 `remaining` 递减和总量上限；
   - `normalizeDamageType()` 已把 `sanity` 归入 `mental`，`applyOps()` 不再把所有非 `mental` 都当 `physical`。
2. 本轮最确定的新问题是“Setup 标记被目标计数当成已完成”：
   - **#24「暗影假面舞会」**：5/6 人局 Setup 后 `精灵之火` 已有 4/5 个，目标只需要 4 个，`checkWin()` 会直接判英雄胜利。3/4 人不会立即结束，但目标 token 仍和开局供应 token 混用。
   - **#50「血肉与金属的味道」**：`炸药` 初始标记补放到三层后，3+ 人局可以直接满足 `rig perFloor`，不需要玩家执行 `plant_charge`。
   - **#11「别被煮熟」**：食物初始标记也会计入 `食物` 目标；因为它是 PvP，只有在最后一人时才触发，但最后一人可以靠开局食物直接满足献祭数量。
3. 更普遍的问题是 **`hunt` 目标按“命中/僵直次数”计数，而不是按被击败的怪物计数**：
   - `monsterBanish` 在怪物 `stunned=1` 时也加 1；
   - 同一只怪物可以在后续回合继续被攻击并重复加数；
   - `goalDone('hunt')` 只看这个计数，所以 #5、#15、#17、#28、#32、#38、#39、#40、#46 都可能靠反复打同一只怪物完成“杀死所有/杀死 N 只”的目标。
4. `runScenarioSetup()` 的 `custom` 分支基本只写 `h.setup.flags`，大量 key 在 `cabin.js` 中零引用。也就是说，Setup 看起来执行了，特殊机制并没有真正进入规则层。
5. 旧测试的 `PASS 50` 只能证明“每个剧本都能用某种行动链结束”，不能证明目标语义正确；#24 的 5/6 人自动胜利、#40 的 2 只双胞胎对 5 点猎杀目标，都没有被 3 人固定夹具覆盖。

## 引擎级确定性问题

### E1. `hunt` 把僵直当成击杀，且不区分怪物

位置：`js/games/cabin.js` 约 2396–2406、`goalDone()` 约 1949–1951。

```js
monster.stunned = 1;
st.haunt.monsterBanish = (st.haunt.monsterBanish || 0) + 1;
...
if (g.type === 'hunt') {
  const need = ...;
  return h.monsterBanish >= need;
}
```

影响：同一只怪物反复被击中就能累加目标进度；`hunt` 也不校验怪物类型。`goalDone` 没有“唯一怪物/已死亡”集合。

建议：
- 用 `defeatedMonsterIds` 或 `monsterKills` 记录唯一击杀；
- `stunned` 不增加猎杀计数，除非该剧本明确写“击退/驱散”；
- `hunt` 支持按怪物 key/type 过滤；
- #40 的目标应改为 `needByPlayers` 或“所有双胞胎”。

### E2. 目标 token 与 Setup 供应 token 没有区分

位置：`runScenarioSetup()` 的 `placeToken` / `addTokenTo` 与 `goalDone('tokens')`。

```js
st.tokens.push({ type: String(type), ... });
...
if (g.type === 'tokens') {
  return countTokens(st, g.token, g) >= need;
}
```

影响：Setup 放下的同名标记会被当成玩家已经收集/完成的目标标记。已实测：
- #24：5/6 人 Setup 后 `checkWin()` 直接英雄胜利；
- #50：补放三层后 3/4/5/6 人直接英雄胜利；
- #11：PvP 最后一人可以拿开局食物满足献祭。

建议：给 token 增加 `source: 'setup' | 'goal' | 'supply'` 或 `collected` 标志；目标计数只读 `source !== 'setup'` 的标记，或改用不同的 token 类型。

### E3. `custom` 字段大量只写不读

位置：`runScenarioSetup()` 约 1568–1579。

```js
} else if (op.type === 'custom') {
  ...
  h.setup.flags[op.key] = op.value === undefined ? true : op.value;
}
```

脚本统计：`cabin.js` 中对 Setup `custom.key` 的引用，以下 key 为 0 次（仅列代表）：

`awakenHer`(#13)、`bindFae`(#29)、`bloodOfBlooded`(#49)、`burial`(#16)、`burnBook`(#21)、`burnFiveRooms`(#44)、`cleanRooms`(#8)、`convertAllHeroes`(#46)、`cutScene`(#45)、`darkQueen`(#24)、`dimensionFriend`(#34)、`elderQueen`(#26)、`escapeWithItems`(#31)、`evidencePairs`(#6)、`exorcism`(#1)、`foodOfferings`(#11)、`generators`(#41)、`ghostShark`(#28)、`healOnReveal`(#2)、`killNeighbors`(#38)、`nameSyllables`(#20)、`pantry`(#42)、`portals`(#47)、`rescueRealtor`(#4)、`saltWeakness`(#35)、`secretStairs`(#30)、`skullToPanicRoom`(#48)、`smashCamera`(#33)、`spellMaterials`(#25)、`tapes`(#19)、`twinsIdentity`(#40)、`vault`(#10)、`weddingRing`(#30)。

这些不是“UI 没显示”这么简单：它们对应的目标/行动条件没有被规则层消费。

### E4. 固定房间的 Setup 标记被无限期挂起

位置：`setupRoomPool()` 约 1238–1295。`farBasement` 在没有远端地下室房间时返回空数组，`addTokenTo()` 转入 `pendingTokens`。

受影响：
- #10 金库/宝藏；
- #26 祭坛；
- #42 储藏室；
- #48 血房/头骨；
- #50 炸药（nonLanding 也会 pending）。

官方文本是“找出来放在底层/某个板块”，当前实现是“等以后翻到再放”，这和 Setup 预期不一致，也会让目标计数在开局看不到这些标记。

## 50 个剧本逐条结论

图例：
- **P0**：会直接错误结束游戏，或目标在合法人数下不可能完成；
- **P1**：核心特殊机制/胜利条件没有执行，正常操作可以绕过或无法完成；
- **P2**：Setup 字段/地点/物品约束缺失，规则不完整但不一定立即结束；
- **—**：本轮未发现确定性新 bug，仍只代表通用执行器覆盖。

| # | 剧本 | 结论 | 具体问题 |
|---|---|---|---|
| 1 | 尸堆如山·绯红杰克的归来 | P2 | `exorcism` 未消费；文本中的“驱魔圈 +1、0–6 伤害”没有实现；只剩通用 ritual 判定。 |
| 2 | 永远的朋友 | P1 | `assignNumbers` 把数字轨道设为 6，之后没有任何递减路径；叛徒备选目标 `trackZero number` 无法达成。`healOnReveal` 也未消费。 |
| 3 | 尘埃 | P2 | `multiTraitor` 未消费（虽然 `assignDisease` 实际分配了多叛徒）；疾病标记没有后续规则；`convertAll` 没有转化英雄的机制，只剩“杀光英雄”这种间接路径。 |
| 4 | 解救房产中介 | P1 | `rescueRealtor` 未消费；火焰标记不造成伤害、不限制房间、不参与失败结算；文本中的 3/2/1/0 火焰布置只有标记，没有效果。 |
| 5 | 石中血 | P1 | `hide` 允许 `where:any`，不要求与天使同房；`hunt` 按僵直次数计数，可反复打同一只天使。 |
| 6 | 遗产 | P1 | `evidencePairs` 未消费；`uncover` 允许任意房间成功即 `evidence+1`，不要求图库/图书室、不要求配对、不消耗证据 token。 |
| 7 | 镜中倒影 | P1 | `mirrorRealm` 只设置 `h.mirrorRealm` 和 `trapped`；没有猜测属性/预兆/房间、成功失败结算、镜界行动；`break_spell` 在 0 档也直接给 `破咒`。 |
| 8 | 家政服务 | P1 | `cleanRooms` 未消费；`clean_room` 允许任意房间成功即给 `符文`，不要求血房/焦屋/坍塌房间/杂物房/地下墓穴或污垢标记。 |
| 9 | 往事如烟 | P2 | `ffaNumberTrack` 未消费；PvP 目标只有最后存活，数字轨道没有实际作用。 |
| 10 | 一笔认真的交易 | P1 | `vault`/`bidTreasure` 未消费；`bid` 允许任意房间；金库位置、宝藏数字标记最高值放金库等 Setup 规则没有执行。 |
| 11 | 别被煮熟 | P1 | `foodOfferings` 未消费；`cook` 允许任意房间；开局食物 token 会计入 `食物` 目标，PvP 最后一人可跳过烹饪。 |
| 12 | 援手 | — | `ffaAmulet` 未消费，但 `possessItem` 目标可判定；本轮未发现新的确定性结算 bug。 |
| 13 | 圣地 | P2 | `awakenHer` 未消费；数字轨道 3 和 `advance_ritual` 能推进，但“唤醒沉睡之她”的独立语义没有执行。 |
| 14 | 物质不灭 | — | `spellProgress` 未消费；数字轨道 4 + `cast_spell` 可推进到 0；本轮未发现新的确定性结算 bug。 |
| 15 | 群魔乱舞 | P1 | `traitorBodyDead` 已消费；但 `hunt` 计数包含僵直，可反复打同一只怪物；`banish_*` 也不校验怪物位置。 |
| 16 | 来和我们玩 | P1 | `burial` 未消费；没有收集遗骸、在墓园安葬的前置；`ritual need1` 可直接通过通用判定完成。 |
| 17 | 转发此信，否则…… | P1 | `assignDieNote` 只把 `DIE` 写进 `h.dieNote`/`holder.note`，没有传递、触发、胜负判定；目标只要求猎杀 3 只，未要求符文或杀死叛徒。 |
| 18 | 这枚戒指真不错 | P1 | `ringIllusion` 只设置 `outside`/`trueBody`；`unmask` 成功只设置 `disguise:true`，没有幻象与真身交互、身份恢复或胜利条件。 |
| 19 | 镜头记录 | P1 | `tapes` 未消费；`destroy_tape` 允许任意房间；叛徒 `trackZero number` 数字轨道 6 没有任何递减动作。 |
| 20 | 别说出口 | P1 | `nameSyllables` 未消费；音节标记只放在事件板块；目标只有 `killTraitor`，没有“集齐音节/正确拼名”条件。 |
| 21 | 恐怖大师麦克马斯特为您呈现 | P1 | `burnBook` 未消费；没有烧书行动；目标只有 `killTraitor`，不要求处理 `旧书`。 |
| 22 | 地下行动 | P2 | `escapeHouse` 未消费；`removeBasement`/movePlayers 能执行；目标只检查在入口大厅，没有“逃出房子”的额外状态。 |
| 23 | 入侵警报 | P1 | `onTokens` 未消费；`shutdown` 允许任意房间，直接给 `已关闭机器`，不要求先有 `ON` 机器或关闭对应机器。 |
| 24 | 暗影假面舞会 | **P0** | 5/6 人 Setup 后 `精灵之火` 已有 4/5 个，目标 need4，`checkWin()` 直接英雄胜利；3/4 人也会把开局供应 token 计入目标。`darkQueen` 未消费。 |
| 25 | 借来的时间 | P2 | `spellMaterials` 未消费；`borrow` 只做属性转移，没有法术材料、次数或失败后果。ritual 目标本身可用通用判定完成。 |
| 26 | 家族的祝福 | P2 | `elderQueen` 未消费；`祭坛` 用 `farBasement`，开局通常进入 pending；没有祭坛/亲属特殊规则。 |
| 27 | 星辰之语 | — | `alienWordSupply` 有消费，`spread_word` 能推进 `spread_alien_words`；本轮未发现新的确定性结算 bug。 |
| 28 | 更大的房子 | P1 | `ghostShark` 未消费；`detonate` 允许任意房间，不要求炸药、鲨鱼位置或“引爆”前置。 |
| 29 | 美丽花园 | P2 | `bindFae` 未消费；没有束缚妖精的独立状态；ritual 目标本身可用通用判定完成。 |
| 30 | 至死不渝 | P1 | `secretStairs`/`weddingRing` 未消费；`claim_ring` 允许任意房间直接给 `戒指`，没有秘密楼梯、婚礼戒指或叛徒持有条件。 |
| 31 | 一线鬼机 | P2 | `escapeWithItems` 未消费；目标只检查携带物品数量，没有“鬼机”/物品类型/携带着条件。 |
| 32 | 大灾变 | P2 | `burnHouse` 的 custom 目标有实现；但 `spread_fire` 允许任意房间，不要求火焰标记或当前楼层已被点燃。 |
| 33 | 对着镜头笑一个 | P1 | `smashCamera` 未消费；`smash_camera` 允许任意房间，不要求持有/接近 `魔法相机` 或摄影师。 |
| 34 | 右侧的维度 | P1 | `dimensionFriend` 未消费；目标只有 `escape`，没有“维度改写生效”或“带同伴”条件。 |
| 35 | 太空鼻涕虫 | P1 | `saltWeakness` 未消费；`burn_nest` 允许任意房间，不要求盐、虫巢房间或虫巢标记位置。 |
| 36 | 寻得安宁 | P1 | 文本要“4 个幽灵得到安宁”，Setup 只放 3 个幽灵；`reconcile` 每次成功给 token，目标 need4，实际是在刷行动次数，不是处理 4 个幽灵。 |
| 37 | 灵魂出窍 | — | `dnaGoal` 未消费，但 `tokens DNA perHero` 与 `collectDNA` 能判定；本轮未发现新的确定性结算 bug。 |
| 38 | 邪恶侍从 | P1 | `killNeighbors` 未消费；`hunt needByPlayers` 匹配人数，但不校验怪物是否为邻居，且可反复打同一只怪物刷计数。 |
| 39 | 蜂群意识 | — | `timeRunsOut` 的 custom 目标有实现，`drainTime` 能降数字轨道；本轮未发现新的确定性结算 bug。 |
| 40 | 血肉行者归来 | **P0** | 目标固定 `hunt need5`，Setup 双胞胎数量是 2/3/4/5；3–5 人局怪物总数小于 5。`hunt` 又按僵直次数计数，测试可通过反复打同一只双胞胎凑到 5，但“杀死所有双胞胎”的语义错误。 |
| 41 | 机器中的神 | P1 | `generators` 未消费；`overload` 允许任意房间，不要求发电机、相邻房间或机器状态。 |
| 42 | 零食来袭 | P1 | `pantry` 未消费；`exorcise` 只要求事件符号，不要求储藏室、食物或幽灵；目标 3 个“被驱魔的幽灵”可以靠行动次数完成。 |
| 43 | 躲猫猫与进食 | — | `surviveUntilDawn` 未消费，但 `survive need6` 有判定；本轮未发现新的确定性结算 bug。 |
| 44 | 缺失的缝线 | P1 | `burnFiveRooms` 未消费；`setfire` 允许任意房间，不要求火焰标记、翻面房间或五个不同房间。 |
| 45 | 大胆登场 | P2 | `cutScene` 未消费；`cut` 只改 `heroGoalText`，不改变实际目标/胜负条件；重写剧本语义没有执行。 |
| 46 | 幽灵发丝 | P1 | `traitorHair`/`convertAllHeroes` 未消费；`infect_hero` 允许任意房间，不要求毛发、解药或接触；英雄目标 `hunt1` 不要求“持真解药”。 |
| 47 | 难忘的骑士 | P1 | `portals` 未消费；`seal` 只要求预兆符号，不要求传送门位置/相邻；`已关闭传送门` 与初始 `传送门` 是不同 token，但地点条件缺失。 |
| 48 | 别惹主人！ | P1 | `skullToPanicRoom` 未消费；目标只是“有人在恐慌室”，不要求携带 `头骨`；房主被击败后的头骨转移没有执行。 |
| 49 | 条款与条件 | P2 | `bloodOfBlooded` 未消费；`collect_blood`/`offer_blood` 可推进 custom 目标，但没有契约、血标记归属或“烧掉契约”的条件。 |
| 50 | 血肉与金属的味道 | **P0** | `炸药` 初始标记在补放到三层后直接满足 `rig perFloor`，3+ 人局无需 `plant_charge` 即英雄胜利；`plant_charge` 还允许任意房间，不要求楼层/炸药位置。 |

## 测试层面的盲区

1. `cabin-scenario-playthrough.test.js` 以 3 人局为主，未覆盖 #24 的 5/6 人自动胜利、#40 的 2 只双胞胎对 5 点猎杀目标、#50 的三层补放自动胜利。
2. 测试夹具会 `maxTrait`、`moveTo`、`item`、直接补房间；这些是执行前置，不等于玩家在正常 UI 操作下自然达成。
3. `hunt` 测试允许连续攻击同一只已僵直的怪物，导致 #40 这类目标“看起来 PASS”，实际语义错误。
4. 旧 `cabin-all-scenarios.test.js` 仍有直接加目标 token、直接设位置、直接设目标完成状态的用例；它们适合测判定器，不适合证明合法行动可完成剧本。
5. 缺少“Setup 后立即 checkWin”和“pending token 补放后立即 checkWin”的通用断言；这两个断言能直接抓到 #24/#50。

## 建议修复顺序

1. **P0**：先修 #24、#50 的目标 token 来源，再修 #40 的 `hunt` 计数/人数目标。
2. **P1**：把 `hunt` 改为唯一击杀计数；把 `monsterBanish` 拆成 `stunned` 与 `defeated`。
3. **P1**：把 `goalDone('tokens')` 改成只统计玩家获得的 token，Setup 供应 token 不计入。
4. **P1**：逐个消费 `custom` key，不能消费的从数据中删除或构建期报错；至少先为 #2/#6/#7/#8/#10/#11/#17/#18/#20/#21 建立行为测试。
5. **P2**：给 `placeToken` 的固定房间目标增加“强制找出并放置”或明确的 pending UI；不要在 Setup 阶段静默挂起。
6. **测试**：每个剧本至少补 3/4/5/6 人 Setup + checkWin、pending 补放 + checkWin、失败路径、同一怪物重复攻击的断言。

## 本轮没有改动代码

本报告只记录审查结论。没有修改 `cabin.js`、剧本 JSON、测试或页面；也没有提交或推送。

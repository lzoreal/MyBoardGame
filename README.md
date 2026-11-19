# MyBoardGame

好友联机桌游。纯前端 + Supabase，不写后端、不用买服务器。

结构分两层：

- **大厅（Lobby）**：进游戏先看到 14 张游戏卡，点哪张进哪个游戏，全部可玩、全部可联机：
  大富翁、飞行棋、蛇梯棋、五子棋、黑白棋、四子连珠、跳棋、UNO、林中小屋、大老二、璀璨宝石、花砖物语、车票之旅、卡坦岛、卡卡颂、诡镇奇谈。
- **大富翁（Monopoly）**：40 格经典棋盘，2～4 人，规则按经典完整版实现，房子和棋子是真 3D。
- **小游戏合集**：每个游戏一个页面 + 一个纯规则引擎，共用 `design/games/shell.js`（建房/加入/订阅/回合权限/座位条/结算）。
- **林中小屋（Cabin）**：官方 Second Edition 核心机制——3～6 人、12 名探险者、44 张房间牌（含 4 张预置房间牌，外加入口大厅）、45 事件 / 22 物品 / 13 预兆、50 个闹鬼剧本；移动点等于速度，翻房自行选择合法旋转，抽到卡即停止移动；抽预兆后回合结束掷 6 骰，总点数小于全场预兆数触发闹鬼，按「房间 + 预兆」查剧本决定叛徒；属性分最低/起始/最高轨道，物理/精神伤害分别分配，闹鬼后跌破骷髅线死亡；含怪物僵直、物品使用/交易/丢弃/拾取与剧本目标。卡面与剧本文案原创，不复制官方原文与插画。
- **大老二（Big Two）**：官方规则——4 人 52 张，首局持 ♦3 者先出且第一手必须带 ♦3；3 最小、2 最大，同点比花色 ♦<♣<♥<♠；单/对/三张，5 张拼顺子、同花、葫芦、四条、同花顺，顺子与同花顺不含 2。
- **璀璨宝石（Splendor）**：官方规则——拿 3 种不同色或同色 2 颗（池里要剩 4 颗），预留卡换金块；回合末手里最多 10 颗，超出要退回；同时满足多位贵族只能选 1 位；到 15 分后打完这一轮再结算（同分比发展卡少者）。
- **花砖物语（Azul）**：官方规则——先手标记在中间台，第一个从中间台拿砖的人 -1 分并成为下轮先手；墙格已被同色占据时不能再放该色进对应行；终局另加每满行 +2、每满列 +7、每种五块齐全 +10。
- **车票之旅（Ticket to Ride）**：美国原版地图 36 城、100 段路线（22 处双线）、30 张官方车票、110 张车厢卡；开局 3 张选票至少留 2 张；灰线必须声明颜色、彩线须同色、彩虹万能；2-3 人局双线只开一条；有人剩 0-2 节车厢后每人再走一回合，车票正负 + 最长路线 +10 结算。
- **卡坦岛（Catan）**：官方基础规则——19 块地形、9 个港口（4 个 3:1 + 5 个 2:1）、银行每种资源 19 张；第 2 轮村落立刻收开局资源；掷 7 时手牌超 7 张弃一半（向下取整），强盗由掷骰者选位置并自选抢夺对象；发展中当回合买不能打、每回合限 1 张；玩家可自由互市，也可按港口兑率与银行换；最长道路（5 条，遇对手建筑断开）+2、最大骑士团 +2，先到 10 分。
- **卡卡颂（Carcassonne）**：官方基础版——72 张板块（19 种版式）逐张旋转拼接，边缘必须完全对齐；每块可派 1 个米宝占城市 / 道路 / 修道院 / 农田，每人 7 个；完成城市每块 2 分（盾徽 +2）、完成道路每块 1 分、修道院 9 分；终局未完成按 1 分/块结算，农田每座相邻完成城市 3 分；无处可放的板块按规则弃掉重抽。
- **诡镇奇谈（Arkham Horror LCG 风格）**：单人调查战役，含第一章「集结号」、第二章「午夜狂欢」与第三章「深渊之下」。6 名原创调查员（不同属性与被动）、3 行动/回合；混沌袋 14 枚标记（含骷髅 / 信徒 / 石碑 / 自动失败 / 古神印记），属性 + 修正 ≥ 难度即成功；遭遇、交战、借机攻击、资产承伤、闪避、出牌与议程 doom；开局可重抽起手。第一章 6 个宅邸地点，集齐 3 线索推进密谋并在地下室击败食尸鬼祭司；第二章 7 个城区地点、5 名邪教徒，解决 3 名逼出南教堂主持者，击倒后可审问换取线索、资源或拖慢仪式，并带倒计时与撤退；第三章 6 个洞窟地点，靠近三座仪式节点做意志检定熄灭它们，再在深渊边缘击败吞噬者。经验可永久升级调查员，创伤会降低后续开局的生命/理智上限，胜负写入本地战役档，三章连续推进。卡面与剧本文案原创，不复制官方原文与插画。

## 目录

```
MyBoardGame/
├── index.html            三个视图：大厅 / 房间等待 / 牌桌
├── css/
│   ├── base.css          设计令牌、顶栏、大厅卡片、房间卡、按钮、弹窗
│   └── board.css         11×11 棋盘网格、40 格样式、3D 覆盖层、侧栏、拍卖盒
├── js/
│   ├── config.js         ← 你要填的只有这个文件（URL + Publishable key）
│   ├── data.js           40 格数据、8 个地产组、租金表、机会/命运卡牌
│   ├── engine.js         纯规则引擎：不碰 DOM、不碰网络，输入 state + action 输出新 state
│   ├── scene.js          3D 层（three.js）：房子、旅馆、棋子
│   ├── net.js            房间的建/查/写/订阅，乐观锁重试
│   ├── ui.js             棋盘渲染、玩家卡、操作区、格子详情、交易与拍卖弹窗
│   ├── lobby.js          大厅游戏注册表（16 款游戏）
│   ├── games/            小游戏纯规则引擎：ludo / snakes / gomoku / reversi / connect4 / jump / uno / cabin / bigtwo / splendor / azul / ticket / catan / carcassonne / arkham
│   └── main.js           入口：视图切换、房间生命周期、动作派发
├── design/
│   ├── board-q.html      大富翁主页面（Q 版透视棋盘）+ board-q.css
│   ├── games/            小游戏通用外壳 shell.js 与 games.css
│   ├── ludo / snakes / gomoku / reversi / connect4 / jump / uno / cabin.html
│   ├── bigtwo / splendor / azul / ticket / catan / carcassonne.html
│   ├── arkham.html       诡镇奇谈（单人战役：集结号 / 午夜狂欢 / 深渊之下）
│   └── preview/          三个预览壳（手机 / 桌面 / 宽屏）
├── sql/rooms.sql         ← 在 Supabase 里执行一次
├── content/cabin/        林中小屋角色包 / 剧本包 JSON
│   ├── characters/       角色包（自动扫描）
│   └── scenarios/        剧本包（自动扫描）
├── tools/build-cabin-packs.mjs 扫描内容包并生成 cabin-packs.js
├── .github/workflows/cabin-packs.yml push 后自动构建内容包
├── tests/engine.test.js  大富翁规则单测 + 600 步随机对局压力测试
├── tests/games.test.js   七款小游戏的规则单测
├── tests/cabin.test.js   林中小屋规则单测
├── tests/newgames.test.js 大老二 / 璀璨宝石 / 花砖物语 / 车票之旅 / 卡坦岛单测
├── tests/carcassonne.test.js 卡卡颂单测（含 72 张板块整局随机对局）
├── tests/arkham.test.js 诡镇奇谈单测（三章 / 审问 / 成长 / 议程 / 撤退 / 随机整局）
└── README.md
```

## 跑起来（15 分钟）

### 第 1 步：建 Supabase 项目

1. 打开 https://supabase.com/dashboard ，注册（免费）。
2. 点右上角 **New project**，选 Organization，填项目名（随便，比如 myboardgame）、
   数据库密码（自己记一下，本项目用不到，但以后会用到）、选离你近的 Region（亚洲选 Singapore 或 Tokyo）。
3. 点 **Create new project**，等 1～2 分钟，状态从 `Setting up` 变成 `Active`。

### 第 2 步：建表

进项目 → 左侧 **SQL Editor** → 右上角 **New query** →
把 `sql/rooms.sql` 全部内容粘进去 → **Run**。

出现 `Success. No rows returned` 就是成功了（建表脚本不返回数据，正常）。

核对：**Table Editor** 里能看到 `rooms` 表，列为 `code / state / version / updated_at`。

### 第 3 步：拿密钥

⚠ Supabase 在 2025 年改了密钥体系，老文档里的「Project Settings → API」**已经不存在了**，
现在是 **Settings → API Keys**：

| 你要的 | 路径 |
|---|---|
| Project URL | 项目首页顶部项目名下方；或右上角 **Connect** 按钮弹窗里 |
| Publishable key（推荐） | 齿轮 **Settings** → **API Keys** → `Publishable and secret API keys` 标签 → 复制 **Publishable key**，形如 `sb_publishable_xxx` |
| 旧式 anon key | 齿轮 **Settings** → **API Keys** → `Legacy API Keys` 标签 → 复制 **anon / public** 那条 JWT |

| 控制台里的名字 | 填到 config.js 的 |
|---|---|
| Project URL | `url` |
| Publishable key 或 anon key | `anonKey` |

```js
window.SUPABASE_CONFIG = {
  url: 'https://xxxxxxxxxxxx.supabase.co',
  anonKey: 'sb_publishable_xxxxxxxxxxxx'
};
```

**千万不要**用 `Secret keys` 或 `service_role` —— 它们会绕过 RLS，放进前端等于把数据库敞开。

### 第 4 步：本地跑

```powershell
cd D:\MyBoardGame
python -m http.server 8080
```

浏览器开 `http://localhost:8080/`。自己一个人测双人局，用**普通窗口 + 隐身窗口**（身份不冲突）：

- 窗口 A：填昵称 → 大厅点「大富翁」→ 创建房间 → 记邀请码
- 窗口 B：填昵称 + 邀请码 → 加入房间
- A 点「开始游戏」→ 两边轮流掷骰子

B 加入后 A 那边自动多出一张玩家卡，说明 Realtime 通了。

### 第 5 步：发布

推到 GitHub 仓库 → Settings → Pages → Source 选 `main` / `root` → 访问
`https://你的用户名.github.io/仓库名/`。发给朋友直接打开就能玩。

## 大富翁规则（实现范围）

参考经典版，按 40 格标准棋盘。街名换成了国内城市（广州/深圳/上海一带），避开原版 Atlantic City 街名的商标问题；**价格与租金数值按经典版**。

| 项 | 实现 |
|---|---|
| 初始资金 | $1,500 |
| 经过起点 | +$200 |
| 掷双骰 | 可再掷一次；连续三次双骰直接入狱 |
| 监狱 | 三种出路：缴 $50 保释、用出狱卡、掷双骰；第 3 次还没掷出双骰就强制缴 $50 |
| 所得税 | $200（**简化**：经典版是收入 10%，这里改固定值） |
| 奢侈税 | $100 |
| 建房 | 必须拥有整组；同组必须均衡开发（房数差不超过 1）；单格最多 4 房，第 5 级是旅馆 |
| 拆房 | 返还半价，同样受均衡规则约束 |
| 抵押 | 可得地价的一半；抵押期间不收租；赎回付 110%（含 10% 手续费） |
| 拍卖 | 放弃购地即进入拍卖，所有在场玩家轮流加价，最高价成交 |
| 交易 | 玩家之间可互相出价，用地产 + 现金组合换地 |
| 破产 | 现金不足时自动清算：先按半价拆房，再抵押地产；仍不够则破产，资产转移给债主或银行 |
| 掉线跳过 | 轮到某人后 30 秒他仍不在线，其他在线玩家会自动替他跳过这一回合 |
| 房主移出 | 房主可以把别人移出房间（等开局时座位直接空出来，对局中则按出局处理，地产退回银行） |
| 机会 / 命运 | 各 12 张：前进、后退、收钱、付钱、入狱、出狱卡、直达某格等 |

规则层是纯函数式的：`MonoEngine.act(state, action, actorId, rng)` 返回新 state，不改入参。
好处是能脱离界面跑测试（见下文），也方便以后把同一套规则搬到云端校验。

### 掉线怎么判断、跳过怎么触发

没有新增数据库字段，判断"谁在线"用的是 **Supabase Realtime Presence**：

1. 进房间时，客户端在房间频道里 `track({ pid, at })`，之后每 15 秒刷新一次
2. 读的时候遍历 `channel.presenceState()`，取 `pid` 且 `at` 在 45 秒内的，才算在线
3. 每 5 秒检查一次：如果**当前该行动的人不在线**，而且**这个状态已经静止了 30 秒**，
   就在线的人替他写一次 `skipTurn`

几个保守设计：

- presence 还没建立起来（刚进房间、通道还没 SUBSCRIBE）时，`presenceActive()` 为 false，一律不跳过
- 永远不会跳过自己（当前玩家就是我时直接放过）
- 对方离线但还在动（比如你替所有人操作）——状态一变就重置 30 秒计时，不会误跳
- 卡在半截的拍卖 / 未回应的交易，跳过时一并了结，否则回合推不下去

代价是：如果对方的浏览器在后台标签页被系统限流，心跳可能延迟，30 秒宽限 + 45 秒有效期能兜住大部分情况，
但极端情况下仍可能把一个"其实还开着网页但挂着没动"的人跳过。朋友局可以接受。

### 房主移出玩家

`kick` 动作只认 `state.hostId`，其他人调用会被引擎挡掉。行为分两种：

| 阶段 | 效果 |
|---|---|
| 等开局（lobby） | 直接从 `players` 里删掉，座位空出来给别人 |
| 对局中 | 标记 `bankrupt + kicked`，地产 owner 置空、房屋清零、抵押清除（回到银行可再被买），若轮到他则自动轮到下一位 |
| 移出后只剩一个人 | 直接判那个人赢，`phase` 变 `ended` |

被移出的人下一次收到状态变化会看到"你已被房主移出对局"并回到大厅；如果他刷新重进，
也会被同一段逻辑弹回大厅，不让他在牌桌上干看着。


## 房子为什么是 3D，又怎么能和格子对齐

做法是一张 WebGL 画布盖住整块棋盘，正交相机俯视，然后对**所有几何体统做一次剪切变换**：

```
y' = y + k·z      (k = 0.62)
```

剪切是线性仿射变换，等价于"从斜上方看"的投影。关键点是：**地面（z = 0）不发生任何位移**，
所以房子的底座和网页格子的像素坐标严格重合；只有随 z 长高的部分沿屏幕上方向偏移，
于是平棋盘上"长"出了立体建筑。

建筑位置不用 CSS 数学去镜像推算，而是直接读 `getBoundingClientRect()` 把每格的矩形换算成
three.js 世界坐标（`x = 格子中心 - 画布宽/2`，`y = 画布高/2 - 格子中心`），再反推底座位置。
这样窗口怎么缩放、格子怎么换行，房子都跟着走。

因为剪切方向统一朝屏幕上方，房子统一把底座放在格子下部 40% 处，往上长高，正好落在格子内部，
不会顶到上一格、也不会压住地名和价格。地名文字被 CSS 推到格子上半部分，给底部留出建房子的空间。

几何构成：

- 房子 = 长方体墙体（米白）+ 四棱锥屋顶（砖红）
- 旅馆 = 更宽的墙体 + 更高的四棱锥屋顶（金色）
- 棋子 = 圆柱底座 + 柱身 + 球头，颜色取玩家色

只在**状态变化或窗口尺寸变化**时重绘，不跑常驻 `requestAnimationFrame`，闲置时零开销。
three.js 用 CDN 的 UMD 版（`three@0.128.0`，全局 `THREE`），`scene.js` 里的 THREE 对象是懒创建的——
CDN 挂了也只是降级成纯 2D 棋盘，不会在载入时报错白屏。

## 数据怎么同步

一行数据就是整个房间：

```json
{
  "code": "K7M2Q",
  "version": 12,
  "state": {
    "phase": "playing",
    "turn": 0,
    "turnPhase": "awaitRoll",
    "players": [
      { "id": "p8x2k1", "name": "阿蒙", "pos": 5, "money": 1500, "inJail": false },
      { "id": "p3m9z7", "name": "老王", "pos": 25, "money": 780,  "inJail": false }
    ],
    "props": { "1": { "owner": "p8x2k1", "houses": 2, "mortgaged": false } },
    "logs": ["阿蒙 掷出 3 + 4 = 7"]
  }
}
```

一次操作的完整过程：

1. 玩家点按钮 → 前端用 `MonoEngine.act()` 算出新 state
2. `UPDATE rooms SET state = 新state, version = version + 1 WHERE code = 'XXXXX' AND version = 旧version`
3. 其他玩家通过 Realtime 收到这条 UPDATE，整体重绘
4. 如果第 2 步更新了 0 行（别人先写了），自动重读、重算、重写，最多 4 次

所以**客户端不是只发"我想掷骰子"这个意图，而是直接算好结果写进去**。
因为没有服务端校验，理论上改代码就能作弊——朋友局不用管这个。

## 测试

```powershell
node tests/engine.test.js
```

不需要装任何依赖。跑两类：

- **规则单测**：基本回合流程、均衡建房、抵押与赎回、拍卖流转、掉线跳过、房主移出
- **压力测试**：600 步随机对局，每步校验不变量——现金不为负、单格房数 0～5、
  地产主人必须是真实存在的玩家、轮次推进不卡死

最后一次跑的结果：0 错误，全部通过。

## 美术资源与许可

没有引入任何第三方美术素材，全部是代码画出来的：

| 东西 | 来源 |
|---|---|
| 棋盘、格子、色条、卡片、按钮 | 手写 CSS |
| 房子 / 旅馆 / 棋子 | three.js 基础几何体（Box / Cylinder / Sphere） |
| 字体 | 系统字体栈，不下载字体文件 |

第三方依赖只有两个，都是 MIT 许可、走 CDN：

- `three@0.128.0`：3D 渲染
- `@supabase/supabase-js@2`：数据库访问

想换成自己的美术风格，改 `css/base.css` 顶部的设计令牌（颜色、圆角、阴影）和
`js/scene.js` 里的 `COLORS` 就行。

## 林中小屋内容包

把 JSON 放进 `content/cabin/characters/` 或 `content/cabin/scenarios/`，push 到 `main` 后
`.github/workflows/cabin-packs.yml` 会自动扫描、校验、生成 `js/games/cabin-packs.js` 并回写仓库；
GitHub Pages 随后重新部署，页面加载时直接合并。

本地手动构建：

```bash
node tools/build-cabin-packs.mjs
```

- 角色包字段：`key/name/role/art/traits{speed,might,known,sanity}`，每项属性写 `start/min/max`。
- 剧本包字段：`key/name/story/trigger{room,omen}/traitorRule/heroGoal/traitorGoal/heroGoalText/traitorGoalText`。
- 剧本必须写 `trigger`，命中的自定义剧本会覆盖内置查表；没命中仍走原来的 50 个剧本公式。
- `content/cabin/README.md` 有完整格式和示例。

## 已知取舍

- **没有登录**。身份是 localStorage 里的随机 id，换设备或清缓存就等于换人。
  昵称和玩家名来自别人，渲染时统一做了 HTML 转义，避免被塞脚本。
- **在线判断靠 Presence，不落库**。好处是零额外写入；代价是刷新页面时会有一两秒的空窗，
  这期间别人不会拿你当"离线"去跳过（`presenceActive()` 兜着）。
- **移出的地产是退回银行，不是拍卖掉**。简化处理，避免再串一套拍卖流程。
- **同时写会撞车**。乐观锁会重试，极端情况（两人同一瞬间各写一次）可能有一方的动作被丢弃，
  表现为"点了没反应，再点一次"。
- **Publishable key 是公开的**。知道 URL 和 key 的人可以直接读写 `rooms` 表。朋友局无所谓；
  想收紧就改 `sql/rooms.sql` 里的策略，或者加一个房间密码字段做校验。
- **免费项目会自动暂停**。连续 7 天没有请求会进入 `Paused`，下次在 dashboard 点 **Restore project**，
  等 1～2 分钟恢复，数据不会丢。
- **大厅里另外三个游戏没有实现**。`js/lobby.js` 里 `ready: false`，只占个位置，点进去会提示敬请期待。
- **3D 层依赖 WebGL**。极老的设备或不支持 WebGL 的环境会自动退化成 2D 棋盘（房子看不见，地产状态改为看格子上的圆点）。

## 下一步可以加什么

- 把玩法扩到飞行棋 / UNO / 五子棋，只需要在 `lobby.js` 注册，加一套自己的 `engine` + `ui`
- Presence：显示"谁在线"，断线的人名字变灰
- 房间清理：定时删掉 `updated_at` 超过 24 小时的房间
- 规则服务端化：把 `MonoEngine.act` 搬到 Edge Function，前端只发意图

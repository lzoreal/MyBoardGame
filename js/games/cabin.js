/* ============================================================
   林中小屋（山中小屋 / 山屋惊魂 经典规则）
   ---------------------------------------------------------
   探索阶段：掷速度骰得移动点 → 走门 → 翻房间牌（可旋转拼图）
             新房间按房型抽 事件 / 物品 / 预兆 卡
   闹鬼检定：每抽到一张预兆，掷 6 颗骰，总点数 < 已抽预兆数 → 进入闹鬼
   闹鬼阶段：抽预兆者成为叛徒，其余玩家组成英雄联盟，
             按剧本目标对抗，属性降到 0 即死亡
   属性：力量 might / 速度 speed / 知识 known / 神智 sanity
   骰子：六面 0,0,1,1,2,2；判定 = 掷「属性点数」颗骰，总点数 ≥ 难度即成功
   ============================================================ */
window.CabinEngine = (function () {
  const W = 6;          // 每层 6 宽
  const H = 5;          // 每层 5 高
  const FLOORS = ['basement', 'ground', 'upper'];
  const FLOOR_LABEL = { basement: '地下室', ground: '一层', upper: '二层' };
  const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
  const DICE = [0, 0, 1, 1, 2, 2];
  const TRAITS = [
    { key: 'might', label: '力量' },
    { key: 'speed', label: '速度' },
    { key: 'known', label: '知识' },
    { key: 'sanity', label: '神智' }
  ];
  const MAX_TRAIT = 8;

  const CHARS = [
    { key: 'zoe', name: '佐伊', role: '小记者', art: '记', traits: { might: 3, speed: 4, known: 5, sanity: 5 } },
    { key: 'flash', name: '闪电', role: '摄影师', art: '闪', traits: { might: 5, speed: 4, known: 3, sanity: 4 } },
    { key: 'jade', name: '小玉', role: '女高中生', art: '玉', traits: { might: 4, speed: 5, known: 4, sanity: 3 } },
    { key: 'father', name: '神父', role: '驱魔人', art: '祷', traits: { might: 4, speed: 3, known: 5, sanity: 5 } },
    { key: 'brother', name: '大熊', role: '老猎人', art: '熊', traits: { might: 6, speed: 4, known: 3, sanity: 3 } },
    { key: 'sister', name: '静静', role: '小护士', art: '护', traits: { might: 3, speed: 4, known: 4, sanity: 5 } }
  ];

  /* ---------------- 房间牌库 ---------------- */
  const TILES = {
    ground: [
      { name: '厨房', doors: 'NE', symbol: 'event' },
      { name: '餐厅', doors: 'NS', symbol: 'item' },
      { name: '图书馆', doors: 'EW', symbol: 'item' },
      { name: '客厅', doors: 'NES', symbol: 'event' },
      { name: '温室', doors: 'NEW', symbol: 'item' },
      { name: '书房', doors: 'NSW', symbol: 'event' },
      { name: '礼拜堂', doors: 'NE', symbol: 'event' },
      { name: '储藏室', doors: 'EW', symbol: 'omen' },
      { name: '舞厅', doors: 'NSEW', symbol: 'event' },
      { name: '卧室', doors: 'NS', symbol: 'omen' }
    ],
    upper: [
      { name: '阁楼', doors: 'NS', symbol: 'event' },
      { name: '儿童房', doors: 'NE', symbol: 'omen' },
      { name: '主卧', doors: 'NSE', symbol: 'event' },
      { name: '画廊', doors: 'EW', symbol: 'item' },
      { name: '瞭望塔', doors: 'NS', symbol: 'event' },
      { name: '浴室', doors: 'NEW', symbol: 'item' },
      { name: '钟楼', doors: 'NS', symbol: 'omen' },
      { name: '密室', doors: 'EW', symbol: 'item' },
      { name: '走廊', doors: 'NSEW', symbol: 'event' },
      { name: '天文台', doors: 'NE', symbol: 'item' }
    ],
    basement: [
      { name: '锅炉房', doors: 'NS', symbol: 'event' },
      { name: '酒窖', doors: 'EW', symbol: 'item' },
      { name: '墓园', doors: 'NS', symbol: 'event' },
      { name: '洞穴', doors: 'NE', symbol: 'omen' },
      { name: '蒸汽管道', doors: 'NEW', symbol: 'event' },
      { name: '停尸间', doors: 'NS', symbol: 'omen' },
      { name: '地下湖', doors: 'EW', symbol: 'item' },
      { name: '废墟', doors: 'NSE', symbol: 'event' },
      { name: '祭坛', doors: 'NE', symbol: 'item' },
      { name: '隧道', doors: 'NSW', symbol: 'event' }
    ]
  };

  /* ---------------- 卡牌 ---------------- */
  const EVENTS = [
    { name: '书架的阴影', trait: 'sanity', diff: 4, pass: { trait: 'sanity', delta: 1 }, fail: { trait: 'sanity', delta: -1 }, text: '书架后有什么东西动了一下。' },
    { name: '楼梯的脚步声', trait: 'speed', diff: 4, pass: { trait: 'speed', delta: 1 }, fail: { trait: 'might', delta: -1 }, text: '空荡荡的楼梯上，脚步声越来越近。' },
    { name: '镜子里的脸', trait: 'sanity', diff: 5, pass: { trait: 'sanity', delta: 1 }, fail: { trait: 'sanity', delta: -2 }, text: '镜子里那张脸比你慢了半拍。' },
    { name: '突然的坍塌', trait: 'might', diff: 4, pass: { trait: 'might', delta: 1 }, fail: { trait: 'might', delta: -1 }, text: '天花板在吱嘎作响。' },
    { name: '老鼠群', trait: 'speed', diff: 3, pass: { trait: 'speed', delta: 1 }, fail: { trait: 'speed', delta: -1 }, text: '墙缝里涌出无数红眼睛。' },
    { name: '风声中的耳语', trait: 'sanity', diff: 3, pass: { trait: 'sanity', delta: 1 }, fail: { trait: 'known', delta: -1 }, text: '有人在耳边念你的名字。' },
    { name: '火焰喷发', trait: 'speed', diff: 5, pass: { trait: 'speed', delta: 1 }, fail: { trait: 'speed', delta: -2 }, text: '炉口的火舌猛地窜出来。' },
    { name: '古老的机关', trait: 'known', diff: 4, pass: { trait: 'known', delta: 1 }, fail: { trait: 'sanity', delta: -1 }, text: '墙上的符号连成了一条线。' },
    { name: '捕兽陷阱', trait: 'might', diff: 3, pass: { trait: 'might', delta: 1 }, fail: { trait: 'speed', delta: -1 }, text: '地板下弹起一排铁齿。' },
    { name: '幽灵的手', trait: 'sanity', diff: 4, pass: { trait: 'sanity', delta: 1 }, fail: { trait: 'might', delta: -1 }, text: '一只半透明的手按在你肩上。' },
    { name: '冰冷的雾气', trait: 'might', diff: 4, pass: { trait: 'might', delta: 1 }, fail: { trait: 'known', delta: -1 }, text: '白雾里什么都看不清。' },
    { name: '会呼吸的墙', trait: 'known', diff: 5, pass: { trait: 'known', delta: 1 }, fail: { trait: 'sanity', delta: -2 }, text: '墙纸下面一起一伏。' }
  ];

  const ITEMS = [
    { name: '铁撬', bonus: 'might', tag: '' },
    { name: '手电筒', bonus: 'known', tag: '' },
    { name: '急救包', bonus: 'might', tag: '', heal: 'might' },
    { name: '圣水', bonus: 'sanity', tag: '圣物' },
    { name: '圣经', bonus: 'sanity', tag: '圣物' },
    { name: '猎枪', bonus: 'might', tag: '' },
    { name: '蜡烛', bonus: 'known', tag: '圣物' },
    { name: '护身符', bonus: 'sanity', tag: '圣物' },
    { name: '登山绳', bonus: 'speed', tag: '' },
    { name: '油灯', bonus: 'known', tag: '圣物' }
  ];

  const OMENS = [
    { name: '黑猫', delta: { trait: 'sanity', value: 1 }, text: '一只黑猫从你脚边掠过。' },
    { name: '破碎的镜子', delta: { trait: 'sanity', value: -1 }, text: '镜子碎成了七片。' },
    { name: '褪色的老照片', delta: { trait: 'known', value: 1 }, text: '照片上的人和你长得一模一样。' },
    { name: '铁十字', delta: { trait: 'might', value: 1 }, text: '冰凉的铁十字硌得手心疼。' },
    { name: '婴儿的哭声', delta: { trait: 'sanity', value: -1 }, text: '空房间里传来婴儿的哭声。' },
    { name: '滴血的匕首', delta: { trait: 'might', value: 1 }, text: '刀刃还在滴血。' },
    { name: '无名信', delta: { trait: 'known', value: 1 }, text: '信纸上的字迹慢慢显出来。' },
    { name: '木乃伊的手', delta: { trait: 'speed', value: -1 }, text: '干枯的手抓住了你的脚踝。' }
  ];

  /* ---------------- 闹鬼剧本 ---------------- */
  const SCENARIOS = [
    { key: 'serpent', name: '巨蛇觉醒', story: '地下传来鳞片摩擦的声音，房子开始收紧。', heroGoalText: '击败叛徒（叛徒力量 +2）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 2 }, heroGoal: { type: 'killTraitor' } },
    { key: 'ritual', name: '亡者仪式', story: '礼拜堂的蜡烛自己点着了，墙上的影子多了一个。', heroGoalText: '在礼拜堂完成 3 次知识判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '礼拜堂', trait: 'known', diff: 4, need: 3 } },
    { key: 'escape', name: '赶在天亮前逃出', story: '天快亮了，门却怎么也打不开，除非你手里有东西。', heroGoalText: '任意英雄集齐 3 件物品并回到前厅', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'escape', room: '前厅', need: 3 } },
    { key: 'burn', name: '烧掉这栋房子', story: '只有把整栋房子点着，那个东西才会停止呼吸。', heroGoalText: '在锅炉房完成 2 次力量判定（难度 5）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '锅炉房', trait: 'might', diff: 5, need: 2 } },
    { key: 'wolves', name: '群狼围屋', story: '窗外全是绿莹莹的眼睛，它们听从一个声音的指挥。', heroGoalText: '击退 3 波狼群：任意房间力量判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'might', diff: 4, need: 3 }, traitorBuff: { might: 1 } },
    { key: 'whisper', name: '幽灵低语', story: '每个角落都在低声说同一句话：留下来。', heroGoalText: '完成 4 次神智判定（难度 3），任意房间', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'sanity', diff: 3, need: 4 }, traitorBuff: { might: 1 } },
    { key: 'grave', name: '墓园的召唤', story: '墓碑上的名字一个一个变成你们的名字。', heroGoalText: '在墓园完成 3 次神智判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '墓园', trait: 'sanity', diff: 4, need: 3 } },
    { key: 'clock', name: '钟楼停摆', story: '钟声停在十二点，再也没响过。', heroGoalText: '在钟楼完成 2 次知识判定（难度 5）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 2 }, heroGoal: { type: 'ritual', room: '钟楼', trait: 'known', diff: 5, need: 2 } },
    { key: 'lake', name: '地下湖的水鬼', story: '水面下有一张脸，一直跟着你走。', heroGoalText: '在地下湖完成 3 次力量判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '地下湖', trait: 'might', diff: 4, need: 3 } },
    { key: 'gallery', name: '画廊的画像', story: '画里的人不见了，画框里剩下你的背影。', heroGoalText: '完成 3 次神智判定（难度 4），任意房间', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'sanity', diff: 4, need: 3 }, traitorBuff: { might: 1 } },
    { key: 'attic', name: '阁楼上的孩子', story: '阁楼传来跳房子的声音，一步，两步。', heroGoalText: '击败叛徒（叛徒速度 +2）', traitorGoalText: '消灭所有英雄', traitorBuff: { speed: 2 }, heroGoal: { type: 'killTraitor' } },
    { key: 'ballroom', name: '舞厅的舞伴', story: '留声机自己转起来，所有人被请了一支舞。', heroGoalText: '全队撑过 4 轮', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'survive', need: 4 } },
    { key: 'winecellar', name: '酒窖的封坛', story: '坛子里封着的不是酒，是别的东西。', heroGoalText: '任意英雄带 2 件物品到酒窖', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'escape', room: '酒窖', need: 2 } },
    { key: 'chapel', name: '礼拜堂的圣像', story: '圣像的眼睛被人挖走了，换成了两颗黑曜石。', heroGoalText: '任意英雄带 2 件物品到礼拜堂', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'escape', room: '礼拜堂', need: 2 } },
    { key: 'wolfking', name: '狼王的契约', story: '它答应只要一个人留下，其余人都能走。', heroGoalText: '击败叛徒，但他只要撑过 5 轮就赢', traitorGoalText: '撑过 5 轮', heroGoal: { type: 'killTraitor' }, traitorGoal: { type: 'survive', need: 5 }, traitorBuff: { might: 2, sanity: 1 } },
    { key: 'tunnel', name: '隧道尽头', story: '隧道尽头有光，但那光在倒退。', heroGoalText: '在隧道完成 2 次知识判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '隧道', trait: 'known', diff: 4, need: 2 } },
    { key: 'altar', name: '祭坛献祭', story: '祭坛上的刀擦得很干净，说明它刚用过。', heroGoalText: '任意英雄带 3 件物品到祭坛', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'escape', room: '祭坛', need: 3 } },
    { key: 'greenhouse', name: '温室的藤蔓', story: '藤蔓在墙上写出你的名字，然后又擦掉。', heroGoalText: '击退 2 波藤蔓：任意房间力量判定（难度 5）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'might', diff: 5, need: 2 }, traitorBuff: { might: 1 } },
    { key: 'study', name: '书房的血字', story: '书桌上摊着一本日记，最后一页是你的字迹。', heroGoalText: '在书房完成 2 次神智判定（难度 5）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '书房', trait: 'sanity', diff: 5, need: 2 }, traitorBuff: { might: 1 } },
    { key: 'watchtower', name: '瞭望塔的守望', story: '从塔顶能看见整片森林，森林里全是同一个影子。', heroGoalText: '全队撑过 5 轮', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'survive', need: 5 } },
    { key: 'bloodwall', name: '血墙蔓延', story: '客厅的墙开始渗血，血迹自己往上爬。', heroGoalText: '在客厅完成 3 次知识判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '客厅', trait: 'known', diff: 4, need: 3 } },
    { key: 'hand', name: '墙里的手', story: '墙壁里伸出一只手，抓住谁就不松。', heroGoalText: '完成 3 次神智判定（难度 4），任意房间', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'wolves', trait: 'sanity', diff: 4, need: 3 } },
    { key: 'spider', name: '蛛网密布', story: '天花板垂下的不是灰，是网。', heroGoalText: '在储藏室完成 3 次力量判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '储藏室', trait: 'might', diff: 4, need: 3 } },
    { key: 'mirror', name: '镜中替身', story: '镜子里的你先眨了眨眼。', heroGoalText: '在浴室完成 3 次神智判定（难度 4）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'ritual', room: '浴室', trait: 'sanity', diff: 4, need: 3 } },
    { key: 'doll', name: '玩偶屋', story: '儿童房的玩偶围成一圈，中间躺着一个和你们一样大的。', heroGoalText: '在儿童房完成 3 次知识判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '儿童房', trait: 'known', diff: 4, need: 3 } },
    { key: 'musicbox', name: '八音盒', story: '八音盒一响，所有人的心跳就跟着节拍。', heroGoalText: '在主卧完成 2 次知识判定（难度 5）', traitorGoalText: '消灭所有英雄', traitorBuff: { sanity: 1 }, heroGoal: { type: 'ritual', room: '主卧', trait: 'known', diff: 5, need: 2 } },
    { key: 'organ', name: '管风琴的低音', story: '没人弹琴，低音却一直在数拍子。', heroGoalText: '在舞厅完成 2 次知识判定（难度 5）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '舞厅', trait: 'known', diff: 5, need: 2 } },
    { key: 'cave', name: '洞穴深处', story: '洞穴的石壁上有抓痕，抓痕比人还高。', heroGoalText: '在洞穴完成 3 次力量判定（难度 4）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'ritual', room: '洞穴', trait: 'might', diff: 4, need: 3 } },
    { key: 'rats', name: '鼠群', story: '地板下面全是跑动声，像整栋楼在挪窝。', heroGoalText: '击退 4 波鼠群：任意房间力量判定（难度 3）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'might', diff: 3, need: 4 } },
    { key: 'fog', name: '走廊的雾', story: '雾从走廊两头涌进来，方向感一起被吞掉了。', heroGoalText: '完成 4 次神智判定（难度 3），任意房间', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'sanity', diff: 3, need: 4 } },
    { key: 'possession', name: '附身', story: '密室里有人用你的声音背出你小时候的事。', heroGoalText: '在密室完成 2 次知识判定（难度 5）', traitorGoalText: '消灭所有英雄', traitorBuff: { sanity: 1, might: 1 }, heroGoal: { type: 'ritual', room: '密室', trait: 'known', diff: 5, need: 2 } },
    { key: 'puppet', name: '提线木偶', story: '看不见的线从屋顶垂下来，套住了谁的关节。', heroGoalText: '击败叛徒（叛徒速度 +2、神智 +1）', traitorGoalText: '消灭所有英雄', traitorBuff: { speed: 2, sanity: 1 }, heroGoal: { type: 'killTraitor' } },
    { key: 'cannibal', name: '食客', story: '餐厅的长桌上，主菜还在动。', heroGoalText: '击败叛徒（叛徒力量 +2）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 2 }, heroGoal: { type: 'killTraitor' } },
    { key: 'hangtree', name: '吊人树', story: '墓园那棵树上的绳子，每次看都多一根。', heroGoalText: '在墓园完成 2 次力量判定（难度 5）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'ritual', room: '墓园', trait: 'might', diff: 5, need: 2 } },
    { key: 'flood', name: '水位上涨', story: '水从地下室往上爬，一格一格地追。', heroGoalText: '全队撑过 4 轮', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'survive', need: 4 } },
    { key: 'fire', name: '走水', story: '厨房的火自己烧起来，正沿着墙往外跑。', heroGoalText: '任意英雄集齐 2 件物品并回到前厅', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'escape', room: '前厅', need: 2 } },
    { key: 'nightmare', name: '噩梦循环', story: '你们刚刚做过同样的事，连台词都一样。', heroGoalText: '全队撑过 5 轮', traitorGoalText: '消灭所有英雄', traitorBuff: { sanity: 1 }, heroGoal: { type: 'survive', need: 5 } },
    { key: 'watcher', name: '注视者', story: '走廊尽头站着一个不动的影子，你回头它也在。', heroGoalText: '完成 3 次神智判定（难度 4），任意房间', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'sanity', diff: 4, need: 3 }, traitorBuff: { sanity: 1 } },
    { key: 'mask', name: '面具', story: '卧室的墙上挂满面具，每张都朝你转了过来。', heroGoalText: '在卧室完成 2 次神智判定（难度 5）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '卧室', trait: 'sanity', diff: 5, need: 2 } },
    { key: 'stars', name: '星图错位', story: '天文台的星图和今晚的天空对不上，多了一颗。', heroGoalText: '在天文台完成 2 次知识判定（难度 5）', traitorGoalText: '消灭所有英雄', traitorBuff: { known: 1 }, heroGoal: { type: 'ritual', room: '天文台', trait: 'known', diff: 5, need: 2 } },
    { key: 'morgue', name: '停尸间名单', story: '停尸间的抽屉全开着，每个格子上都贴了你们的名字。', heroGoalText: '任意英雄带 3 件物品到停尸间', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'escape', room: '停尸间', need: 3 } },
    { key: 'steam', name: '蒸汽管道', story: '管道里的蒸汽会说话，说完就把走廊封死。', heroGoalText: '在蒸汽管道完成 2 次知识判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '蒸汽管道', trait: 'known', diff: 4, need: 2 } },
    { key: 'ruins', name: '废墟回声', story: '废墟里每句喊话都会回来，但回来的声音更近。', heroGoalText: '完成 3 次知识判定（难度 4），任意房间', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'wolves', trait: 'known', diff: 4, need: 3 } },
    { key: 'cradle', name: '阁楼的摇篮', story: '阁楼的摇篮自己在摇，摇的速度越来越快。', heroGoalText: '任意英雄带 2 件物品到阁楼', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'escape', room: '阁楼', need: 2 } },
    { key: 'kitchen', name: '厨房的刀', story: '厨房的刀一把把立起来，刀刃朝门。', heroGoalText: '在厨房完成 2 次力量判定（难度 4）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1 }, heroGoal: { type: 'ritual', room: '厨房', trait: 'might', diff: 4, need: 2 } },
    { key: 'banquet', name: '无尽宴会', story: '餐厅的客人一圈圈坐着，谁也没在吃东西。', heroGoalText: '在餐厅完成 3 次神智判定（难度 4）', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'ritual', room: '餐厅', trait: 'sanity', diff: 4, need: 3 } },
    { key: 'forbidden', name: '禁书', story: '图书馆最里层那本书，书脊上写着你的名字。', heroGoalText: '任意英雄带 3 件物品到图书馆', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'escape', room: '图书馆', need: 3 } },
    { key: 'vault', name: '保险箱', story: '保险箱里没有钱，只有一张写满人名的名单。', heroGoalText: '击败叛徒（叛徒力量 +1、速度 +1）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1, speed: 1 }, heroGoal: { type: 'killTraitor' } },
    { key: 'heart', name: '小屋的心脏', story: '所有的墙都在往同一个方向收缩，像一颗心在跳。', heroGoalText: '在前厅完成 3 次知识判定（难度 5）', traitorGoalText: '消灭所有英雄', traitorBuff: { might: 1, sanity: 1 }, heroGoal: { type: 'ritual', room: '前厅', trait: 'known', diff: 5, need: 3 } },
    { key: 'dawnbreak', name: '最后的天亮', story: '天光只照到塔顶那一小块，别的地方永远是夜。', heroGoalText: '任意英雄带 2 件物品到瞭望塔', traitorGoalText: '消灭所有英雄', heroGoal: { type: 'escape', room: '瞭望塔', need: 2 } }
  ];

  /* ---------------- 工具 ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function shuffle(list, rand) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function roll(n, rand) {
    let total = 0;
    const faces = [];
    for (let i = 0; i < Math.max(0, n); i++) {
      const v = DICE[Math.floor(rand() * 6)];
      faces.push(v);
      total += v;
    }
    return { total: total, faces: faces };
  }
  function pushLog(st, line) {
    st.logs = (st.logs || []).concat(line);
    if (st.logs.length > 40) st.logs = st.logs.slice(-40);
  }
  function roomAt(st, floor, x, y) {
    return st.rooms.find((r) => r.floor === floor && r.x === x && r.y === y) || null;
  }
  function roomByName(st, name) {
    return st.rooms.find((r) => r.name === name) || null;
  }
  function traitVal(st, i, key) {
    const p = st.players[i];
    return p && p.traits ? p.traits[key] : 0;
  }
  function alive(st, i) {
    const p = st.players[i];
    if (!p || p.dead) return false;
    return TRAITS.some((t) => (p.traits[t.key] || 0) > 0);
  }
  function nextTurn(st, from) {
    let i = from;
    for (let k = 0; k < st.players.length; k++) {
      i = (i + 1) % st.players.length;
      if (alive(st, i)) { st.turn = i; st.rolled = false; st.moves = 0; return; }
    }
    st.turn = from;
    st.rolled = false;
    st.moves = 0;
  }
  function boardDoor(st, floor, x, y, dir) {
    const r = roomAt(st, floor, x, y);
    if (!r) return false;
    return (r.doors || '').indexOf(dir) >= 0;
  }
  function rotateDoors(doors, times) {
    const order = ['N', 'E', 'S', 'W'];
    let out = '';
    for (const d of doors) {
      const i = (order.indexOf(d) + times) % 4;
      out += order[i];
    }
    return out;
  }
  function hasDelta(a) { return !!a; }

  function itemBonus(st, i, trait) {
    const p = st.players[i];
    return (p.items || []).filter((it) => it.bonus === trait).length;
  }

  /* ---------------- 开局 ---------------- */
  function makePlayer(id, name) {
    return {
      id: id,
      name: name,
      char: null,
      charName: '未选',
      role: '',
      art: '?',
      traits: { might: 0, speed: 0, known: 0, sanity: 0 },
      base: null,
      items: [],
      floor: 'ground',
      x: 2,
      y: 2,
      dead: false
    };
  }

  function assignCharacter(st, i, key) {
    const ch = CHARS.find((c) => c.key === key);
    if (!ch) return null;
    const p = st.players[i];
    p.char = ch.key;
    p.charName = ch.name;
    p.role = ch.role;
    p.art = ch.art;
    p.traits = { might: ch.traits.might, speed: ch.traits.speed, known: ch.traits.known, sanity: ch.traits.sanity };
    p.base = ch.traits;
    st.charTaken = st.charTaken || {};
    st.charTaken[ch.key] = i;
    return ch;
  }

  function startPlaying(st) {
    st.phase = 'playing';
    st.turn = 0;
    st.rolled = false;
    st.moves = 0;
    st.players.forEach((p) => {
      p.floor = 'ground';
      p.x = 2;
      p.y = 2;
    });
    pushLog(st, '人都选好了，所有人站在前厅，先掷速度骰再探索');
  }

  function createInitial(players, rand, opts) {
    rand = rand || Math.random;
    opts = opts || {};
    const list = (players || []).slice(0, 6).map((p) => makePlayer(p.id, p.name));
    while (list.length < 2) {
      list.push(makePlayer('p' + list.length, '玩家 ' + (list.length + 1)));
    }

    const rooms = [
      { floor: 'ground', x: 2, y: 2, name: '前厅', doors: 'NSEW', symbol: null, kind: 'start' },
      { floor: 'ground', x: 1, y: 1, name: '大楼梯', doors: 'NS', symbol: null, kind: 'stairs', to: 'upper' },
      { floor: 'upper', x: 1, y: 1, name: '大楼梯', doors: 'NS', symbol: null, kind: 'stairs', to: 'ground' },
      { floor: 'ground', x: 4, y: 3, name: '煤槽', doors: 'NS', symbol: null, kind: 'stairs', to: 'basement' },
      { floor: 'basement', x: 4, y: 3, name: '煤槽', doors: 'NS', symbol: null, kind: 'stairs', to: 'ground' }
    ];

    const st = {
      game: 'cabin',
      phase: 'select',
      hostId: null,
      turn: 0,
      round: 1,
      rolled: false,
      moves: 0,
      players: list,
      charTaken: {},
      rooms: rooms,
      decks: {
        ground: shuffle(TILES.ground, rand),
        upper: shuffle(TILES.upper, rand),
        basement: shuffle(TILES.basement, rand),
        events: shuffle(EVENTS, rand),
        items: shuffle(ITEMS, rand),
        omens: shuffle(OMENS, rand)
      },
      ptr: { ground: 0, upper: 0, basement: 0, events: 0, items: 0, omens: 0 },
      omens: 0,
      haunt: null,
      lastCard: null,
      lastRoll: null,
      winner: null,
      logs: [opts.skipSelect ? '开局：所有人站在前厅，先掷速度骰再探索' : '开局：先各自挑一个角色']
    };

    if (opts.skipSelect) {
      list.forEach((p, i) => assignCharacter(st, i, CHARS[i % CHARS.length].key));
      startPlaying(st);
    }
    return st;
  }

  /* ---------------- 抽卡 ---------------- */
  function draw(st, kind, rand) {
    const d = st.decks[kind];
    let i = st.ptr[kind] % d.length;
    const card = d[i];
    st.ptr[kind] = (i + 1) % d.length;
    if (st.ptr[kind] === 0 && kind !== 'ground' && kind !== 'upper' && kind !== 'basement') {
      st.decks[kind] = shuffle(st.decks[kind], rand);   // 抽完一轮重新洗
    }
    return card;
  }

  function applyDelta(st, i, trait, delta, reason) {
    const p = st.players[i];
    if (!p) return;
    p.traits[trait] = Math.max(0, Math.min(MAX_TRAIT, p.traits[trait] + delta));
    const label = (TRAITS.find((t) => t.key === trait) || {}).label || trait;
    pushLog(st, p.name + ' ' + (delta > 0 ? '+' : '') + delta + ' ' + label + (reason ? '（' + reason + '）' : ''));
    if (p.traits[trait] <= 0) {
      p.dead = true;
      pushLog(st, '☠ ' + p.name + ' 倒下了');
    }
  }

  function resolveSymbol(st, i, room, rand) {
    if (!room || !room.symbol) return;
    const p = st.players[i];
    const kind = room.symbol;
    room.resolved = true;

    if (kind === 'item') {
      const card = draw(st, 'items', rand);
      p.items = (p.items || []).concat(card);
      st.lastCard = {
        kind: 'item', title: card.name,
        text: '获得物品：' + card.name + '（' + ((TRAITS.find((t) => t.key === card.bonus) || {}).label) + '判定 +1 骰）' + (card.tag ? ' · ' + card.tag : ''),
        tone: 'good'
      };
      pushLog(st, p.name + ' 在' + room.name + '找到「' + card.name + '」');
      if (card.heal) applyDelta(st, i, card.heal, 1, '急救');
      return;
    }

    if (kind === 'omen') {
      const card = draw(st, 'omens', rand);
      p.items = (p.items || []).concat({ name: card.name, bonus: null, tag: '预兆' });
      st.omens += 1;
      if (card.delta) applyDelta(st, i, card.delta.trait, card.delta.value, card.name);
      st.lastCard = {
        kind: 'omen', title: card.name,
        text: '预兆：' + card.name + '。已抽到 ' + st.omens + ' 张预兆，准备进行闹鬼检定。',
        tone: 'bad'
      };
      pushLog(st, p.name + ' 在' + room.name + '抽到预兆「' + card.name + '」（预兆 ' + st.omens + '）');
      // 闹鬼检定：6 颗骰，总点数 < 预兆数 → 闹鬼开始
      const hr = roll(6, rand);
      st.lastRoll = { label: '闹鬼检定', faces: hr.faces, total: hr.total };
      pushLog(st, '闹鬼检定：6 颗骰共 ' + hr.total + ' 点，需 ≥ ' + st.omens + ' 点');
      if (hr.total < st.omens) startHaunt(st, i, rand, room.name);
      return;
    }

    // 事件
    const card = draw(st, 'events', rand);
    const dice = traitVal(st, i, card.trait) + itemBonus(st, i, card.trait);
    const r = roll(dice, rand);
    const ok = r.total >= card.diff;
    st.lastRoll = {
      label: card.name + ' · ' + ((TRAITS.find((t) => t.key === card.trait) || {}).label) + '判定',
      faces: r.faces, total: r.total, diff: card.diff, ok: ok
    };
    const eff = ok ? card.pass : card.fail;
    if (eff) applyDelta(st, i, eff.trait, eff.delta, card.name);
    st.lastCard = {
      kind: 'event', title: card.name,
      text: card.text + '\n' + ((TRAITS.find((t) => t.key === card.trait) || {}).label) + '判定 ' + r.total + ' / 难度 ' + card.diff + ' → ' + (ok ? '成功' : '失败'),
      tone: ok ? 'good' : 'bad'
    };
    pushLog(st, p.name + ' 在' + room.name + '遭遇「' + card.name + '」：' +
      ((TRAITS.find((t) => t.key === card.trait) || {}).label) + ' ' + r.total + '/' + card.diff + ' ' + (ok ? '成功' : '失败'));
  }

  function pickScenario(st, roomName, rand) {
    const pool = SCENARIOS.filter((s) => s.key !== st.lastScenario);
    const use = roomName ? pool.filter((s) => s.heroGoal.room === roomName) : [];
    const list = use.length ? use : pool;
    const sc = list[Math.floor(rand() * list.length)] || SCENARIOS[0];
    st.lastScenario = sc.key;
    return sc;
  }

  function startHaunt(st, i, rand, roomName) {
    const sc = pickScenario(st, roomName, rand);
    st.haunt = {
      active: true,
      scenario: sc.key,
      name: sc.name,
      story: sc.story,
      heroGoalText: sc.heroGoalText,
      traitorGoalText: sc.traitorGoalText,
      heroGoal: sc.heroGoal,
      traitorGoal: sc.traitorGoal || { type: 'killAll' },
      traitor: i,
      progress: 0,
      round: 0
    };
    const traitor = st.players[i];
    if (sc.traitorBuff) {
      Object.keys(sc.traitorBuff).forEach((k) => {
        traitor.traits[k] = Math.min(MAX_TRAIT, traitor.traits[k] + sc.traitorBuff[k]);
      });
    }
    pushLog(st, '★ 闹鬼！「' + sc.name + '」—— ' + traitor.name + ' 成为叛徒');
    st.lastCard = {
      kind: 'haunt', title: '★ 闹鬼：' + sc.name,
      text: sc.story + '\n叛徒：' + traitor.name + '\n英雄目标：' + sc.heroGoalText + '\n叛徒目标：' + sc.traitorGoalText,
      tone: 'bad'
    };
  }

  function win(st, side, text) {
    if (st.phase === 'ended') return;
    st.phase = 'ended';
    st.winner = { side: side, text: text };
    pushLog(st, '对局结束：' + text);
  }

  function checkWin(st) {
    if (st.phase === 'ended' || !st.haunt || !st.haunt.active) return;
    const h = st.haunt;
    const traitor = st.players[h.traitor];
    const heroes = st.players.filter((p, i) => i !== h.traitor);
    if (traitor.dead) { win(st, 'heroes', '叛徒倒下，英雄获胜'); return; }
    if (heroes.every((p) => p.dead)) { win(st, 'traitor', '英雄全灭，叛徒获胜'); return; }

    const goal = h.heroGoal;

    if (goal.type === 'escape') {
      const roomName = goal.room || '前厅';
      const hero = heroes.find((p) => !p.dead && !p.dead &&
        (p.items || []).filter((it) => it.tag !== '预兆').length >= goal.need &&
        roomAt(st, p.floor, p.x, p.y) && roomAt(st, p.floor, p.x, p.y).name === roomName);
      if (hero) win(st, 'heroes', hero.name + ' 达成了剧本目标');
      return;
    }

    if (goal.type === 'ritual' || goal.type === 'wolves') {
      if (h.progress >= goal.need) win(st, 'heroes', '英雄完成了目标，叛徒失败');
    }

    if (goal.type === 'survive') {
      if (h.round >= goal.need) win(st, 'heroes', '全队撑过了 ' + goal.need + ' 轮');
    }

    if (h.traitorGoal && h.traitorGoal.type === 'survive' && h.round >= h.traitorGoal.need) {
      win(st, 'traitor', '叛徒撑过了 ' + h.traitorGoal.need + ' 轮，契约生效');
    }
  }

  /* ---------------- 动作 ---------------- */
  function act(state, action, pid, rand) {
    rand = rand || Math.random;
    const st = clone(state);
    const i = st.players.findIndex((p) => p.id === pid);
    if (i < 0) return { ok: false, msg: '你不在这一局里' };
    const me = st.players[i];

    if (action.type === 'restart') {
      if (pid !== st.hostId) return { ok: false, msg: '只有房主能重开' };
      const fresh = createInitial(st.players.map((p) => ({ id: p.id, name: p.name })), rand);
      fresh.hostId = st.hostId;
      return { ok: true, state: fresh };
    }

    if (action.type === 'pick') {
      if (st.phase !== 'select') return { ok: false, msg: '现在不是选角色阶段' };
      if (st.players[st.turn].id !== pid) return { ok: false, msg: '轮到别人选角色' };
      const key = action.char;
      if (!key) return { ok: false, msg: '先点一个角色' };
      if (st.charTaken && st.charTaken[key] !== undefined) return { ok: false, msg: '这个角色已经被挑走了' };
      const ch = assignCharacter(st, i, key);
      if (!ch) return { ok: false, msg: '没有这个角色' };
      pushLog(st, me.name + ' 选了 ' + ch.name + '（' + ch.role + '）');
      const left = st.players.filter((p) => !p.char).length;
      if (left === 0) startPlaying(st);
      else st.turn = (st.turn + 1) % st.players.length;
      return { ok: true, state: st };
    }

    if (st.phase !== 'playing') return { ok: false, msg: '这一局已经结束了' };
    if (me.dead) return { ok: false, msg: '你已经倒下了' };
    if (st.players[st.turn].id !== pid) return { ok: false, msg: '还没轮到你' };

    switch (action.type) {
      case 'roll': {
        if (st.rolled) return { ok: false, msg: '这一回合已经掷过了' };
        const dice = me.traits.speed + itemBonus(st, i, 'speed');
        const r = roll(dice, rand);
        st.rolled = true;
        st.moves = r.total;
        st.lastRoll = { label: '速度掷骰', faces: r.faces, total: r.total };
        pushLog(st, me.name + ' 掷速度：' + r.faces.join('+') + ' = ' + r.total + ' 点移动');
        return { ok: true, state: st };
      }

      case 'move': {
        if (!st.rolled) return { ok: false, msg: '先掷速度骰' };
        if (st.moves <= 0) return { ok: false, msg: '移动点用完了' };
        const dir = action.dir;
        if (!DIRS[dir]) return { ok: false, msg: '方向不对' };
        if (!boardDoor(st, me.floor, me.x, me.y, dir)) return { ok: false, msg: '这边没有门' };
        const nx = me.x + DIRS[dir][0];
        const ny = me.y + DIRS[dir][1];
        if (nx < 0 || nx >= W || ny < 0 || ny >= H) return { ok: false, msg: '走出边界了' };

        const target = roomAt(st, me.floor, nx, ny);
        if (target) {
          if (!(target.doors || '').includes(OPP[dir])) return { ok: false, msg: '那间房没有对着这边的门' };
          st.moves -= 1;
          me.x = nx; me.y = ny;
          pushLog(st, me.name + ' 走进' + target.name + (target.kind === 'stairs' ? '（可换层）' : ''));
          return { ok: true, state: st };
        }

        // 探索：翻一张房间牌，旋转到能接上入口
        const kind = me.floor;
        if (st.ptr[kind] >= st.decks[kind].length) st.decks[kind] = shuffle(TILES[kind], rand);
        const tile = st.decks[kind][(st.ptr[kind]++) % st.decks[kind].length];
        let doors = '';
        let rot = 0;
        for (let k = 0; k < 4; k++) {
          const test = rotateDoors(tile.doors, k);
          if (test.includes(OPP[dir])) { doors = test; rot = k; break; }
        }
        if (!doors) { doors = tile.doors + OPP[dir]; rot = 0; }

        const room = {
          floor: kind, x: nx, y: ny, name: tile.name, doors: doors, rot: rot,
          symbol: tile.symbol || null, kind: 'normal'
        };
        st.rooms.push(room);
        st.moves = 0;                 // 进入新房间，本回合移动结束
        me.x = nx; me.y = ny;
        pushLog(st, me.name + ' 推开一扇门，发现了「' + tile.name + '」');
        resolveSymbol(st, i, room, rand);
        checkWin(st);
        return { ok: true, state: st };
      }

      case 'stair': {
        if (!st.rolled) return { ok: false, msg: '先掷速度骰' };
        if (st.moves <= 0) return { ok: false, msg: '移动点用完了' };
        const here = roomAt(st, me.floor, me.x, me.y);
        if (!here || here.kind !== 'stairs') return { ok: false, msg: '这里没有楼梯' };
        const link = roomAt(st, here.to, here.x, here.y);
        if (!link) return { ok: false, msg: '那边还没探索出来' };
        st.moves -= 1;
        me.floor = here.to;
        me.x = link.x; me.y = link.y;
        pushLog(st, me.name + ' 顺着' + here.name + '到了' + FLOOR_LABEL[here.to]);
        return { ok: true, state: st };
      }

      case 'attack': {
        const hi = st.haunt;
        if (!hi || !hi.active) return { ok: false, msg: '闹鬼之后才能动手' };
        const ti = st.players.findIndex((p) => p.id === action.target);
        if (ti < 0) return { ok: false, msg: '找不到这个对手' };
        const tp = st.players[ti];
        if (tp.dead) return { ok: false, msg: '对方已经倒下了' };
        if (tp.floor !== me.floor || tp.x !== me.x || tp.y !== me.y) return { ok: false, msg: '不在同一间房' };
        if (action.target === pid) return { ok: false, msg: '不能打自己' };

        const ar = roll(me.traits.might + itemBonus(st, i, 'might'), rand);
        const dr = roll(tp.traits.might + itemBonus(st, ti, 'might'), rand);
        st.lastRoll = { label: '力量对抗', faces: ar.faces, total: ar.total, foe: dr.total };
        const hit = ar.total >= dr.total;   // 平手算攻方赢
        pushLog(st, me.name + ' 攻击 ' + tp.name + '：力量 ' + ar.total + ' vs ' + dr.total + ' → ' + (hit ? '得手' : '被挡住'));
        if (hit) {
          const trait = tp.traits.speed >= tp.traits.might ? 'speed' : 'might';
          applyDelta(st, ti, trait, -1, '战斗受伤');
        } else {
          const trait = me.traits.speed >= me.traits.might ? 'speed' : 'might';
          applyDelta(st, i, trait, -1, '战斗反噬');
        }
        checkWin(st);
        return { ok: true, state: st };
      }

      case 'check': {
        // 剧本要求的判定（仪式 / 击退狼群）
        const hi = st.haunt;
        if (!hi || !hi.active) return { ok: false, msg: '闹鬼之后才需要做判定' };
        if (i === hi.traitor) return { ok: false, msg: '叛徒不能帮英雄完成仪式' };
        const goal = hi.heroGoal;
        if (goal.type !== 'ritual' && goal.type !== 'wolves') return { ok: false, msg: '这个剧本不需要判定' };
        if (goal.room) {
          const here = roomAt(st, me.floor, me.x, me.y);
          if (!here || here.name !== goal.room) return { ok: false, msg: '要在「' + goal.room + '」里做' };
        }
        const dice = traitVal(st, i, goal.trait) + itemBonus(st, i, goal.trait);
        const r = roll(dice, rand);
        const ok = r.total >= goal.diff;
        st.lastRoll = {
          label: (TRAITS.find((t) => t.key === goal.trait) || {}).label + '判定',
          faces: r.faces, total: r.total, diff: goal.diff, ok: ok
        };
        if (ok) {
          hi.progress += 1;
          pushLog(st, me.name + ' 完成一次判定（' + r.total + '/' + goal.diff + '），进度 ' + hi.progress + '/' + goal.need);
        } else {
          pushLog(st, me.name + ' 判定失败（' + r.total + '/' + goal.diff + '）');
          applyDelta(st, i, goal.trait, -1, '仪式反噬');
        }
        checkWin(st);
        return { ok: true, state: st };
      }

      case 'end': {
        pushLog(st, me.name + ' 结束回合');
        nextTurn(st, st.turn);
        if (st.turn === 0) {
          st.round += 1;
          if (st.haunt && st.haunt.active) st.haunt.round += 1;
        }
        checkWin(st);
        return { ok: true, state: st };
      }

      case 'clearCard': {
        // 只清理提示卡，不消耗回合
        st.lastCard = null;
        return { ok: true, state: st };
      }

      default:
        return { ok: false, msg: '未知动作' };
    }
  }

  return {
    createInitial: createInitial,
    act: act,
    CHARS: CHARS,
    TRAITS: TRAITS,
    TILES: TILES,
    SCENARIOS: SCENARIOS,
    pickScenario: pickScenario,
    FLOORS: FLOORS,
    FLOOR_LABEL: FLOOR_LABEL,
    W: W,
    H: H,
    DIRS: DIRS
  };
})();

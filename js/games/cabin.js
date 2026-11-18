/* ============================================================
   林中小屋（山中小屋 / 山屋惊魂 2E 官方机制）
   ---------------------------------------------------------
   官方核心规则：4 条属性轨道（速度/力量/知识/神智，含下限与上限）、
   移动 = 当前速度、推门翻房间并由玩家旋转拼接、事件/物品/预兆三类牌、
   抽预兆后在回合结束掷 6 骰，点数 < 全场预兆数触发闹鬼、
   按「房间 + 预兆」查表确定剧本、剧本决定叛徒、
   身体伤害在力量/速度间分配，精神伤害在知识/神智间分配，
   属性跌破下限即死亡（闹鬼前不会死）、战斗按点数差造成伤害、
   同房间可交易/丢弃/拾取物品、叛徒控制怪物。
   卡牌、角色、房间与 50 个剧本文字均为原创，仅复刻机制。
   ============================================================ */
window.CabinEngine = (function () {
  const W = 9;
  const H = 7;
  const FLOORS = ['basement', 'ground', 'upper'];
  const FLOOR_LABEL = { basement: '地下室', ground: '一层', upper: '二层' };
  const DIRS = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
  const OPP = { N: 'S', S: 'N', W: 'E', E: 'W' };
  const DICE = [0, 0, 1, 1, 2, 2];
  const TRAITS = [
    { key: 'speed', label: '速度', kind: 'physical' },
    { key: 'might', label: '力量', kind: 'physical' },
    { key: 'known', label: '知识', kind: 'mental' },
    { key: 'sanity', label: '神智', kind: 'mental' }
  ];
  const MAX_TRAIT = 8;

  function track(start, min, max) { return { start: start, min: min, max: max }; }

  const CHARS = [
    { key: 'zoe', name: '佐伊', role: '小记者', art: '记', age: 12, traits: { speed: track(4, 2, 7), might: track(3, 2, 6), known: track(5, 2, 8), sanity: track(5, 2, 8) } },
    { key: 'flash', name: '闪电', role: '摄影师', art: '闪', age: 28, traits: { speed: track(4, 2, 7), might: track(5, 2, 8), known: track(3, 1, 6), sanity: track(4, 2, 7) } },
    { key: 'jade', name: '小玉', role: '女高中生', art: '玉', age: 17, traits: { speed: track(5, 2, 8), might: track(4, 2, 6), known: track(4, 1, 7), sanity: track(3, 1, 6) } },
    { key: 'father', name: '神父', role: '驱魔人', art: '祷', age: 58, traits: { speed: track(3, 1, 6), might: track(4, 2, 6), known: track(5, 2, 8), sanity: track(5, 2, 8) } },
    { key: 'brother', name: '大熊', role: '老猎人', art: '熊', age: 63, traits: { speed: track(4, 2, 7), might: track(6, 2, 8), known: track(3, 1, 6), sanity: track(3, 1, 6) } },
    { key: 'sister', name: '静静', role: '小护士', art: '护', age: 24, traits: { speed: track(4, 2, 7), might: track(3, 2, 6), known: track(4, 2, 8), sanity: track(5, 2, 8) } },
    { key: 'lawyer', name: '何律师', role: '事务律师', art: '律', age: 41, traits: { speed: track(3, 1, 6), might: track(4, 2, 6), known: track(5, 2, 8), sanity: track(4, 2, 7) } },
    { key: 'boxer', name: '阿拳', role: '退役拳手', art: '拳', age: 36, traits: { speed: track(4, 2, 7), might: track(5, 2, 8), known: track(2, 1, 5), sanity: track(3, 1, 6) } },
    { key: 'prof', name: '古教授', role: '民俗学者', art: '学', age: 66, traits: { speed: track(2, 1, 5), might: track(2, 1, 5), known: track(6, 3, 8), sanity: track(4, 2, 7) } },
    { key: 'host', name: '小岚', role: '深夜主播', art: '播', age: 22, traits: { speed: track(5, 2, 8), might: track(2, 1, 5), known: track(4, 2, 7), sanity: track(4, 2, 7) } },
    { key: 'fireman', name: '老陈', role: '消防员', art: '消', age: 47, traits: { speed: track(3, 1, 6), might: track(6, 2, 8), known: track(3, 1, 6), sanity: track(3, 1, 6) } },
    { key: 'dealer', name: '琥珀', role: '古董商', art: '古', age: 52, traits: { speed: track(3, 1, 6), might: track(3, 2, 6), known: track(5, 2, 8), sanity: track(5, 2, 8) } }
  ];

  /* ---------------- 44 张房间牌 ---------------- */
  const ROOMS = [
    { name: '厨房', floors: ['ground'], doors: 'NE', symbol: 'event', text: '灶台还温着，锅里却只有灰。' },
    { name: '餐厅', floors: ['ground'], doors: 'NS', symbol: 'item', text: '长桌上的餐具摆得整整齐齐。' },
    { name: '客厅', floors: ['ground'], doors: 'NES', symbol: 'event', text: '沙发陷下去一个人形。' },
    { name: '温室', floors: ['ground'], doors: 'NEW', symbol: 'item', text: '玻璃顶下开满不该开的花。' },
    { name: '图书室', floors: ['ground'], doors: 'EW', symbol: 'item', effect: { type: 'gain', trait: 'known', amount: 1 }, text: '书脊上的字会跟着视线移动。' },
    { name: '储藏室', floors: ['ground'], doors: 'EW', symbol: 'omen', text: '罐头后面藏着不属于厨房的东西。' },
    { name: '舞厅', floors: ['ground'], doors: 'NSEW', symbol: 'event', text: '留声机还在转，舞池里没有脚印。' },
    { name: '卧室', floors: ['ground'], doors: 'NS', symbol: 'omen', text: '被子掀开一半，枕头是湿的。' },
    { name: '浴室', floors: ['ground'], doors: 'NEW', symbol: 'item', text: '镜子上有一层擦不掉的手印。' },
    { name: '礼拜堂', floors: ['ground'], doors: 'NE', symbol: 'event', effect: { type: 'gain', trait: 'sanity', amount: 1 }, text: '长椅朝向一尊没有脸的神像。' },
    { name: '书房', floors: ['ground'], doors: 'NSW', symbol: 'event', text: '书桌抽屉里有一本写到今天的日记。' },
    { name: '煤槽', floors: ['ground'], doors: 'NS', symbol: null, special: 'coal', text: '铁槽一路滑向地下室。' },
    { name: '坍塌房间', floors: ['ground'], doors: 'NE', symbol: 'event', special: 'collapsed', text: '地板缺了一大块，下面是黑。' },

    { name: '阁楼', floors: ['upper'], doors: 'NS', symbol: 'event', text: '灰尘里有一串刚踩出来的小脚印。' },
    { name: '儿童房', floors: ['upper'], doors: 'NE', symbol: 'omen', text: '玩具围成一圈，中间留着位置。' },
    { name: '主卧', floors: ['upper'], doors: 'NSE', symbol: 'event', text: '衣柜门虚掩着，里面有呼吸声。' },
    { name: '画廊', floors: ['upper'], doors: 'EW', symbol: 'item', text: '每幅画的眼睛都朝门口偏了一点。' },
    { name: '瞭望塔', floors: ['upper'], doors: 'NS', symbol: 'event', text: '窗外森林像一张正在收紧的网。' },
    { name: '钟楼', floors: ['upper'], doors: 'NS', symbol: 'omen', text: '钟摆停在十二点，齿轮还在咬。' },
    { name: '密室', floors: ['upper'], doors: 'EW', symbol: 'item', text: '门从里面反锁过很多次。' },
    { name: '走廊', floors: ['upper'], doors: 'NSEW', symbol: 'event', text: '地毯上的血迹一直延伸到楼梯口。' },
    { name: '天文台', floors: ['upper'], doors: 'NE', symbol: 'item', text: '星图里多了一颗不该存在的星。' },
    { name: '客房', floors: ['upper'], doors: 'NS', symbol: 'event', text: '床单还是温的，客人却不在。' },
    { name: '阳台', floors: ['upper'], doors: 'NE', symbol: 'event', text: '栏杆外没有院子，只有雾。' },
    { name: '缝纫室', floors: ['upper'], doors: 'EW', symbol: 'item', text: '人形针扎上穿着你的尺寸。' },
    { name: '音乐室', floors: ['upper'], doors: 'NE', symbol: 'omen', text: '钢琴自己按出一个和弦。' },

    { name: '锅炉房', floors: ['basement'], doors: 'NS', symbol: 'event', text: '炉门一开，火光里有人影。' },
    { name: '酒窖', floors: ['basement'], doors: 'EW', symbol: 'item', text: '酒桶上的标记不是酒庄的。' },
    { name: '墓园', floors: ['basement'], doors: 'NS', symbol: 'event', text: '地底埋着的墓碑比房子还老。' },
    { name: '洞穴', floors: ['basement'], doors: 'NE', symbol: 'omen', text: '石壁上的抓痕有三道。' },
    { name: '蒸汽管道', floors: ['basement'], doors: 'EW', symbol: 'event', text: '管道里传来数拍子的声音。' },
    { name: '停尸间', floors: ['basement'], doors: 'NS', symbol: 'omen', text: '抽屉上的标签写着你认识的人。' },
    { name: '地下湖', floors: ['basement'], doors: 'EW', symbol: 'item', text: '水面平得像另一扇门。' },
    { name: '废墟', floors: ['basement'], doors: 'NSE', symbol: 'event', text: '断墙后面还有一栋房子的轮廓。' },
    { name: '祭坛', floors: ['basement'], doors: 'NE', symbol: 'item', text: '石台上的刀刚擦过。' },
    { name: '隧道', floors: ['basement'], doors: 'NSW', symbol: 'event', text: '隧道尽头的光在往后退。' },
    { name: '保险库', floors: ['basement'], doors: 'EW', symbol: 'item', text: '铁门上有一圈指甲划出的痕。' },
    { name: '地下走廊', floors: ['basement'], doors: 'NSEW', symbol: 'event', text: '两侧的门都没有把手。' },
    { name: '骨堆', floors: ['basement'], doors: 'NE', symbol: 'omen', text: '骨头按身高排成一排。' },
    { name: '楼梯间', floors: ['basement'], doors: 'EW', symbol: null, special: 'basementStairs', text: '一段窄梯通向门厅的暗门。' },

    { name: '门厅', floors: ['ground'], doors: 'NEW', symbol: null, kind: 'start', start: true, text: '前门在身后关上了。' },
    { name: '主楼梯', floors: ['ground'], doors: 'SEW', symbol: null, kind: 'grandStair', start: true, text: '楼梯向上延伸进黑暗。' },
    { name: '上层平台', floors: ['upper'], doors: 'SEW', symbol: null, kind: 'landing', start: true, text: '楼梯在二层拐了个弯。' },
    { name: '地下室平台', floors: ['basement'], doors: 'NEW', symbol: null, kind: 'landing', start: true, text: '地下室的门在身后合拢。' }
  ];

  const TILES = {
    all: ROOMS,
    draw: ROOMS.filter((r) => !r.start),
    ground: ROOMS.filter((r) => r.floors.indexOf('ground') >= 0),
    upper: ROOMS.filter((r) => r.floors.indexOf('upper') >= 0),
    basement: ROOMS.filter((r) => r.floors.indexOf('basement') >= 0)
  };

  /* ---------------- 45 张事件牌 ---------------- */
  function EV(name, text, effect) { return { name: name, text: text, effect: effect }; }
  function EVR(name, text, trait, diff, win, lose) { return { name: name, text: text, roll: { trait: trait, diff: diff }, win: win, lose: lose }; }
  function G(trait, amount) { return { gain: { trait: trait, amount: amount } }; }
  function D(type, amount) { return { damage: { type: type, amount: amount, dice: amount } }; }
  function L(trait, amount) { return { lose: { trait: trait, amount: amount } }; }

  const EVENTS = [
    EVR('书架低语', '书脊后有人用气声念你的名字。', 'sanity', 4, G('sanity', 1), D('mental', 1)),
    EVR('楼梯脚步', '空楼梯上，脚步比你快一步。', 'speed', 4, G('speed', 1), D('physical', 1)),
    EVR('镜中脸', '镜里的脸比你慢半拍。', 'sanity', 5, G('sanity', 1), D('mental', 2)),
    EVR('天花板坍塌', '石灰像雨一样落下来。', 'might', 4, G('might', 1), D('physical', 1)),
    EVR('鼠群', '墙缝里涌出红眼睛。', 'speed', 3, G('speed', 1), L('speed', 1)),
    EVR('风中耳语', '风把同一句话送了三遍。', 'sanity', 3, G('sanity', 1), L('known', 1)),
    EVR('炉火喷发', '炉门自己弹开，火舌卷到脚边。', 'speed', 5, G('speed', 1), D('physical', 2)),
    EVR('墙上符号', '符号连成一条指向你的线。', 'known', 4, G('known', 1), D('mental', 1)),
    EVR('捕兽夹', '地板下弹起一排铁齿。', 'might', 3, G('might', 1), D('physical', 1)),
    EVR('幽灵之手', '半透明的手按在肩上。', 'sanity', 4, G('sanity', 1), L('might', 1)),
    EVR('冰冷雾气', '雾里连自己的手都看不清。', 'might', 4, G('might', 1), L('known', 1)),
    EVR('会呼吸的墙', '墙纸下面一起一伏。', 'known', 5, G('known', 1), D('mental', 2)),
    EVR('旧钢琴', '琴键自己按下，音准却是反的。', 'known', 4, G('known', 1), D('mental', 1)),
    EVR('摇椅', '空摇椅越摇越快。', 'sanity', 3, G('sanity', 1), L('sanity', 1)),
    EVR('血字', '墙上的字迹还没干。', 'known', 5, G('known', 1), D('mental', 2)),
    EVR('蛛网', '网线从天花板垂到门口。', 'speed', 3, G('speed', 1), L('speed', 1)),
    EVR('掉落画像', '画框砸下来，画中人却还在笑。', 'speed', 4, G('speed', 1), D('physical', 1)),
    EVR('毒气', '通风口喷出一股甜腻的味。', 'might', 4, G('might', 1), D('physical', 1)),
    EVR('黑暗走廊', '灯一盏盏灭，最后只剩你的呼吸。', 'sanity', 4, G('sanity', 1), L('sanity', 1)),
    EVR('铜管回声', '墙里传来一支走调的葬礼曲。', 'known', 3, G('known', 1), D('mental', 1)),
    EVR('抽屉里的信', '信封上写着“给还活着的人”。', 'known', 4, G('known', 1), L('sanity', 1)),
    EVR('地板塌陷', '脚下突然空了。', 'speed', 5, G('speed', 1), D('physical', 2)),
    EVR('食人花', '花蕊里有一排细齿。', 'might', 5, G('might', 1), D('physical', 2)),
    EVR('刺骨寒风', '风从没有窗的墙里吹进来。', 'might', 3, G('might', 1), L('speed', 1)),
    EVR('影子追赶', '影子先跑，脚步声才追上来。', 'speed', 4, G('speed', 1), D('physical', 1)),
    EVR('钟声', '钟声在脑子里敲，不在墙上敲。', 'sanity', 4, G('sanity', 1), D('mental', 1)),
    EVR('密室机关', '齿轮咬合，门缝里露出半张脸。', 'known', 5, G('known', 1), D('mental', 2)),
    EVR('餐桌残羹', '盘子里的东西还在冒热气。', 'sanity', 3, G('sanity', 1), L('might', 1)),
    EVR('井底哭声', '哭声从地板下面升上来。', 'sanity', 5, G('sanity', 1), D('mental', 2)),
    EVR('破窗', '玻璃自己碎了，风灌进来。', 'speed', 4, G('speed', 1), D('physical', 1)),
    EVR('猎犬吠叫', '狗叫声停在门外，抓门声却没停。', 'sanity', 4, G('sanity', 1), L('speed', 1)),
    EVR('楼梯扶手', '扶手像蛇一样扭了一下。', 'speed', 3, G('speed', 1), D('physical', 1)),
    EVR('灰烬', '灰里埋着一枚还温热的戒指。', 'known', 4, G('known', 1), L('sanity', 1)),
    EVR('旧地图', '地图上标着这栋房子，但没有出口。', 'known', 3, G('known', 1), D('mental', 1)),
    EVR('蜡烛熄灭', '所有蜡烛同时熄灭，又同时点着。', 'sanity', 4, G('sanity', 1), L('sanity', 1)),
    EVR('墙内抓挠', '抓挠声跟着你的脚步走。', 'might', 4, G('might', 1), D('physical', 1)),
    EVR('雨滴', '屋里下起了雨，只淋你一个人。', 'speed', 4, G('speed', 1), L('speed', 1)),
    EVR('玩具转动', '发条玩具一起转向门口。', 'sanity', 3, G('sanity', 1), L('sanity', 1)),
    EVR('老人咳嗽', '咳嗽声从空椅子里传出来。', 'sanity', 4, G('sanity', 1), D('mental', 1)),
    EVR('铁链声', '铁链在地上拖，越拖越近。', 'might', 4, G('might', 1), D('physical', 1)),
    EVR('酒气', '酒气浓得像有人刚从这里走过。', 'sanity', 3, G('sanity', 1), L('known', 1)),
    EVR('暗门', '门后不是房间，是一段向下的台阶。', 'known', 4, G('known', 1), D('mental', 1)),
    EVR('电击', '门把手上跳出一串蓝光。', 'speed', 5, G('speed', 1), D('physical', 2)),
    EVR('水淹', '水从门缝里漫进来，冰冷刺骨。', 'might', 4, G('might', 1), D('physical', 1)),
    EVR('无名墓碑', '墓碑上没有名字，只有今天的日期。', 'sanity', 5, G('sanity', 1), D('mental', 2)),
    EVR('绯红之溅', '墙上溅开的血还没干，而且它是温的。', 'sanity', 4, G('known', 1), D('mental', 1)),
    EVR('一管尘', '小瓶里的灰在动，像在呼吸。', 'sanity', 4, G('sanity', 1), D('mental', 2)),
    EVR('诡异镜子', '镜子里的房间比你身后多一扇门。', 'sanity', 5, G('known', 1), D('mental', 1)),
    EVR('说茄子', '快门响过之后，你的影子少了半秒。', 'speed', 4, G('speed', 1), D('mental', 1)),
    EVR('房子饿了', '四面墙同时向内收了一寸。', 'might', 4, G('might', 1), D('physical', 1))
  ];

  /* ---------------- 22 张物品牌 ---------------- */
  function I(name, text, opt) { return Object.assign({ name: name, text: text }, opt || {}); }
  const ITEMS = [
    I('铁撬', '生锈但结实，撬门或砸锁都用得上。', { weapon: 'might', attackBonus: 1 }),
    I('手电筒', '光柱能照到墙纸后面的字。', { testTrait: 'known', testBonus: 1 }),
    I('急救包', '纱布、碘酒和一卷胶带。', { use: { type: 'heal', trait: 'might', amount: 1 } }),
    I('猎枪', '枪管很长，后坐力也很大。', { weapon: 'might', attackBonus: 2 }),
    I('护身符', '摸上去有一点体温。', { testTrait: 'sanity', testBonus: 1 }),
    I('圣经', '扉页写着别人的名字。', { testTrait: 'sanity', testBonus: 1 }),
    I('登山绳', '足够把两个人从井里拉上来。', { testTrait: 'speed', testBonus: 1 }),
    I('防弹背心', '旧式背心，护住胸口。', { armor: 1, noSteal: true }),
    I('消防斧', '斧刃上沾着黑色的漆。', { weapon: 'might', attackBonus: 2 }),
    I('镇静剂', '一支过期但还算干净的小药瓶。', { use: { type: 'heal', trait: 'sanity', amount: 1 } }),
    I('怀表', '指针在倒着走。', { testTrait: 'speed', testBonus: 1 }),
    I('相机', '闪光灯亮起时，照片里多了一个人。', { testTrait: 'known', testBonus: 1 }),
    I('银匕首', '刀柄刻着一行看不懂的字。', { weapon: 'might', attackBonus: 1, testTrait: 'sanity', testBonus: 1 }),
    I('铁头盔', '很重，但能挡住落石。', { armor: 1, noSteal: true }),
    I('火把', '火焰不怕这里的风。', { testTrait: 'known', testBonus: 1, use: { type: 'gain', trait: 'might', amount: 1 } }),
    I('钩爪', '绳子连着三根铁钩。', { testTrait: 'speed', testBonus: 1 }),
    I('急救绷带', '一卷干净的绷带。', { use: { type: 'heal', trait: 'might', amount: 1 } }),
    I('十字架', '握紧时掌心会发烫。', { testTrait: 'sanity', testBonus: 1 }),
    I('老式左轮', '只剩三颗子弹。', { weapon: 'might', attackBonus: 2, distance: true }),
    I('护膝', '皮革已经磨得发亮。', { armor: 1, noSteal: true }),
    I('提灯', '灯油还有一半。', { testTrait: 'known', testBonus: 1 }),
    I('幸运硬币', '正面朝上时，你总觉得会没事。', { testTrait: 'sanity', testBonus: 1, use: { type: 'heal', trait: 'sanity', amount: 1 } })
  ];

  /* ---------------- 13 张预兆牌 ---------------- */
  function O(name, text, opt) { return Object.assign({ name: name, text: text, omen: true }, opt || {}); }
  const OMENS = [
    O('黑猫', '一只黑猫从脚边掠过，尾巴扫过脚踝。', { delta: { trait: 'sanity', amount: 1 } }),
    O('碎镜', '镜子碎成七片，每片里都有你。', { delta: { trait: 'sanity', amount: -1 } }),
    O('旧照片', '照片上的人和你穿同一件衣服。', { delta: { trait: 'known', amount: 1 } }),
    O('铁十字', '冰凉的铁十字硌得手心生疼。', { delta: { trait: 'might', amount: 1 } }),
    O('婴啼', '空房间里传来婴儿的哭声。', { delta: { trait: 'sanity', amount: -1 } }),
    O('血匕首', '刀刃还在滴血，刀柄却是干的。', { delta: { trait: 'might', amount: 1 }, weapon: 'might', attackBonus: 1 }),
    O('无名信', '信纸上的字迹慢慢显出来。', { delta: { trait: 'known', amount: 1 } }),
    O('木乃伊之手', '干枯的手抓住了脚踝。', { delta: { trait: 'speed', amount: -1 } }),
    O('音乐盒', '盒子自己在转，调子却像葬礼。', { delta: { trait: 'sanity', amount: 1 } }),
    O('乌鸦', '乌鸦停在窗台上，叫了一声你的名字。', { delta: { trait: 'known', amount: -1 } }),
    O('停摆的钟', '钟停在十二点，齿轮还在咬。', { delta: { trait: 'speed', amount: -1 } }),
    O('面具', '面具内侧有你的牙印。', { delta: { trait: 'sanity', amount: -1 } }),
    O('骨戒', '戒指内侧刻着一个日期。', { delta: { trait: 'might', amount: 1 } }),
    O('野狗', '一只野狗站在门口，无声地对你吠。', { delta: { trait: 'sanity', amount: -1 } }),
    O('石神像', '神像底座的空槽，正好放得下一张照片。', { delta: { trait: 'might', amount: 1 } }),
    O('旧书', '书页边角写着别人的批注，字迹和你的很像。', { delta: { trait: 'known', amount: 1 } }),
    O('圣徽', '金属的表面凉得像刚从地底下挖出来。', { delta: { trait: 'sanity', amount: 1 } }),
    O('骷髅', '头骨下颌还在轻轻开合。', { delta: { trait: 'known', amount: -1 } })
  ];

  /* ---------------- 50 个原创闹鬼剧本 ----------------
     机制与官方一致：房间 + 预兆查表、剧本决定叛徒、双方目标。
     剧情、目标文字均为原创。 */
  function S(no, key, name, story, rule, hero, traitor, heroText, traitorText, extra) {
    return Object.assign({
      no: no, key: key, name: name, story: story, traitorRule: rule,
      heroGoal: hero, traitorGoal: traitor || { type: 'killAll' },
      heroGoalText: heroText, traitorGoalText: traitorText
    }, extra || {});
  }
  const K = { type: 'killTraitor' };
  const KA = { type: 'killAll' };
  const SCENARIO_CARDS = ['无', '待售', '诅咒', '神秘邀请', '离奇失踪', '超自然调查员'];
  const SCENARIOS = [
    S(1, 'serpent', '巨蛇觉醒', '地下传来鳞片摩擦的声音，房子开始收紧。', 'revealer', K, KA, '击败叛徒，让巨蛇重新睡下', '消灭所有英雄'),
    S(2, 'mummy', '裹尸布', '地下室的门缝里伸出第一根绷带。', 'lowestSanity', K, KA, '在绷带缠满屋子前击败叛徒', '消灭所有英雄'),
    S(3, 'mirror', '镜中替身', '镜子里的人先眨了眨眼。', 'omenHolder', K, KA, '打碎镜子，击败镜中的叛徒', '消灭所有英雄'),
    S(4, 'doll', '玩偶屋', '儿童房的玩偶围成一圈，中间躺着一个和你们一样大的。', 'lowestMight', K, KA, '击败叛徒，烧掉中间的玩偶', '消灭所有英雄'),
    S(5, 'wolf', '狼王契约', '它答应只要一个人留下，其余人都能走。', 'highestMight', K, { type: 'survive', need: 5 }, '击败叛徒，撕毁契约', '撑过 5 轮，契约生效'),
    S(6, 'puppet', '提线木偶', '看不见的线从屋顶垂下来，套住了谁的关节。', 'lowestSpeed', K, KA, '砍断线，击败叛徒', '消灭所有英雄'),
    S(7, 'cannibal', '长桌食客', '餐厅的长桌上，主菜还在动。', 'revealer', K, KA, '击败叛徒，掀翻长桌', '消灭所有英雄'),
    S(8, 'vault', '名单', '保险箱里没有钱，只有一张写满人名的名单。', 'highestKnowledge', K, KA, '击败叛徒，烧掉名单', '消灭所有英雄'),
    S(9, 'watcher', '注视者', '走廊尽头站着一个不动的影子，你回头它也在。', 'lowestSanity', K, KA, '击败叛徒，让影子闭眼', '消灭所有英雄'),
    S(10, 'hand', '墙里的手', '墙壁里伸出一只手，抓住谁就不松。', 'revealer', K, KA, '击败叛徒，把手钉回墙里', '消灭所有英雄'),
    S(11, 'ritual_chapel', '礼拜堂的蜡烛', '礼拜堂的蜡烛自己点着了，墙上的影子多了一个。', 'revealer', { type: 'ritual', room: '礼拜堂', trait: 'known', diff: 4, need: 3 }, KA, '在礼拜堂完成 3 次知识判定（难度 4）', '消灭所有英雄'),
    S(12, 'ritual_boiler', '烧掉这栋房子', '只有把整栋房子点着，那个东西才会停止呼吸。', 'lowestSpeed', { type: 'ritual', room: '锅炉房', trait: 'might', diff: 5, need: 2 }, KA, '在锅炉房完成 2 次力量判定（难度 5）', '消灭所有英雄'),
    S(13, 'ritual_grave', '墓园点名', '墓碑上的名字一个一个变成你们的名字。', 'lowestSanity', { type: 'ritual', room: '墓园', trait: 'sanity', diff: 4, need: 3 }, KA, '在墓园完成 3 次神智判定（难度 4）', '消灭所有英雄'),
    S(14, 'ritual_clock', '钟楼停摆', '钟声停在十二点，再也没响过。', 'highestKnowledge', { type: 'ritual', room: '钟楼', trait: 'known', diff: 5, need: 2 }, KA, '在钟楼完成 2 次知识判定（难度 5）', '消灭所有英雄'),
    S(15, 'ritual_lake', '湖底的脸', '水面下有一张脸，一直跟着你走。', 'revealer', { type: 'ritual', room: '地下湖', trait: 'might', diff: 4, need: 3 }, KA, '在地下湖完成 3 次力量判定（难度 4）', '消灭所有英雄'),
    S(16, 'ritual_study', '书房的血字', '书桌上摊着一本日记，最后一页是你的字迹。', 'lowestMight', { type: 'ritual', room: '书房', trait: 'sanity', diff: 5, need: 2 }, KA, '在书房完成 2 次神智判定（难度 5）', '消灭所有英雄'),
    S(17, 'ritual_green', '温室藤蔓', '藤蔓在墙上写出你的名字，然后又擦掉。', 'revealer', { type: 'ritual', room: '温室', trait: 'might', diff: 5, need: 2 }, KA, '在温室完成 2 次力量判定（难度 5）', '消灭所有英雄'),
    S(18, 'ritual_kitchen', '厨房的刀', '厨房的刀一把把立起来，刀刃朝门。', 'lowestSanity', { type: 'ritual', room: '厨房', trait: 'might', diff: 4, need: 2 }, KA, '在厨房完成 2 次力量判定（难度 4）', '消灭所有英雄'),
    S(19, 'ritual_dining', '无尽宴会', '餐厅的客人一圈圈坐着，谁也没在吃东西。', 'omenHolder', { type: 'ritual', room: '餐厅', trait: 'sanity', diff: 4, need: 3 }, KA, '在餐厅完成 3 次神智判定（难度 4）', '消灭所有英雄'),
    S(20, 'ritual_ballroom', '最后一支舞', '留声机自己转起来，把所有人请进舞池。', 'revealer', { type: 'ritual', room: '舞厅', trait: 'speed', diff: 3, need: 3 }, KA, '在舞厅完成 3 次速度判定（难度 3）', '消灭所有英雄'),
    S(21, 'escape_foyer', '赶在天亮前', '天快亮了，前门却怎么也打不开。', 'revealer', { type: 'escape', room: '门厅', need: 3 }, KA, '任意英雄带 3 件物品回到门厅', '消灭所有英雄'),
    S(22, 'escape_wine', '封坛', '坛子里封着的不是酒，是别的东西。', 'lowestSpeed', { type: 'escape', room: '酒窖', need: 2 }, KA, '任意英雄带 2 件物品到酒窖', '消灭所有英雄'),
    S(23, 'escape_chapel', '无眼圣像', '圣像的眼睛被换成了两颗黑曜石。', 'highestKnowledge', { type: 'escape', room: '礼拜堂', need: 2 }, KA, '任意英雄带 2 件物品到礼拜堂', '消灭所有英雄'),
    S(24, 'escape_altar', '祭坛献祭', '祭坛上的刀擦得很干净，说明它刚用过。', 'lowestSanity', { type: 'escape', room: '祭坛', need: 3 }, KA, '任意英雄带 3 件物品到祭坛', '消灭所有英雄'),
    S(25, 'escape_library', '禁书', '图书室最里层那本书，书脊上写着你的名字。', 'revealer', { type: 'escape', room: '图书室', need: 3 }, KA, '任意英雄带 3 件物品到图书室', '消灭所有英雄'),
    S(26, 'escape_attic', '阁楼摇篮', '阁楼的摇篮自己在摇，速度越来越快。', 'lowestMight', { type: 'escape', room: '阁楼', need: 2 }, KA, '任意英雄带 2 件物品到阁楼', '消灭所有英雄'),
    S(27, 'escape_morgue', '停尸间名单', '每个抽屉上都贴着你们的名字。', 'lowestSanity', { type: 'escape', room: '停尸间', need: 3 }, KA, '任意英雄带 3 件物品到停尸间', '消灭所有英雄'),
    S(28, 'escape_tower', '塔顶的天光', '天光只照到塔顶那一小块，别的地方永远是夜。', 'revealer', { type: 'escape', room: '瞭望塔', need: 2 }, KA, '任意英雄带 2 件物品到瞭望塔', '消灭所有英雄'),
    S(29, 'survive_ballroom', '舞伴', '留声机把每个人请进同一支舞，谁也不许停。', 'revealer', { type: 'survive', need: 4 }, KA, '全队撑过 4 轮', '消灭所有英雄'),
    S(30, 'survive_flood', '水位上涨', '水从地下室往上爬，一格一格地追。', 'lowestSpeed', { type: 'survive', need: 4 }, KA, '全队撑过 4 轮，等水退去', '消灭所有英雄'),
    S(31, 'survive_nightmare', '噩梦循环', '你们刚刚做过同样的事，连台词都一样。', 'lowestSanity', { type: 'survive', need: 5 }, KA, '全队撑过 5 轮，打破循环', '消灭所有英雄'),
    S(32, 'survive_fog', '走廊的雾', '雾从走廊两头涌进来，方向感一起被吞掉。', 'omenHolder', { type: 'survive', need: 4 }, KA, '全队撑过 4 轮，等雾散', '消灭所有英雄'),
    S(33, 'survive_fire', '走水', '厨房的火自己烧起来，正沿着墙往外跑。', 'revealer', { type: 'survive', need: 3 }, KA, '全队撑过 3 轮，等火自己熄', '消灭所有英雄'),
    S(34, 'survive_deep', '深处的呼吸', '地下室每块石头都在呼吸。', 'highestMight', { type: 'survive', need: 5 }, KA, '全队撑过 5 轮', '消灭所有英雄'),
    S(35, 'survive_choir', '无人的合唱', '空房间里响起合唱，拍子越来越快。', 'lowestSpeed', { type: 'survive', need: 4 }, KA, '全队撑过 4 轮', '消灭所有英雄'),
    S(36, 'survive_cold', '停不下的雪', '屋里开始下雪，只落在你们肩上。', 'revealer', { type: 'survive', need: 3 }, KA, '全队撑过 3 轮', '消灭所有英雄'),
    S(37, 'hunt_hound', '猎犬群', '窗外全是绿莹莹的眼睛，它们听从一个声音的指挥。', 'revealer', { type: 'hunt', need: 3 }, KA, '击退 3 只影犬（攻击使其僵直）', '消灭所有英雄', { monsters: [{ key: 'hound', name: '影犬', count: 3, speed: 4, might: 4, attack: 'might' }] }),
    S(38, 'hunt_rats', '鼠潮', '地板下面全是跑动声，像整栋楼在挪窝。', 'lowestSanity', { type: 'hunt', need: 4 }, KA, '击退 4 只巨鼠', '消灭所有英雄', { monsters: [{ key: 'rat', name: '巨鼠', count: 4, speed: 5, might: 3, attack: 'might' }] }),
    S(39, 'hunt_spider', '蛛潮', '天花板垂下的不是灰，是网。', 'lowestSpeed', { type: 'hunt', need: 3 }, KA, '击退 3 只织网者', '消灭所有英雄', { monsters: [{ key: 'spider', name: '织网者', count: 3, speed: 4, might: 4, attack: 'might' }] }),
    S(40, 'hunt_ghost', '低语者', '每个角落都在低声说同一句话：留下来。', 'highestKnowledge', { type: 'hunt', need: 3 }, KA, '驱散 3 个低语者', '消灭所有英雄', { monsters: [{ key: 'ghost', name: '低语者', count: 3, speed: 5, might: 2, attack: 'sanity' }] }),
    S(41, 'hunt_zombie', '地下的手', '泥土里伸出第一只手，然后是第二只。', 'revealer', { type: 'hunt', need: 4 }, KA, '击退 4 个泥人', '消灭所有英雄', { monsters: [{ key: 'zombie', name: '泥人', count: 4, speed: 3, might: 5, attack: 'might' }] }),
    S(42, 'hunt_bat', '阁楼的翅膀', '头顶的黑暗突然分开，变成很多小块。', 'lowestMight', { type: 'hunt', need: 3 }, KA, '驱散 3 群蝙蝠', '消灭所有英雄', { monsters: [{ key: 'bat', name: '蝙蝠群', count: 3, speed: 6, might: 2, attack: 'sanity' }] }),
    S(43, 'hunt_golem', '石像行走', '庭院里的石像少了一座，走廊里多了一座。', 'highestMight', { type: 'hunt', need: 2 }, KA, '击退 2 座石像', '消灭所有英雄', { monsters: [{ key: 'golem', name: '石像', count: 2, speed: 3, might: 6, attack: 'might' }] }),
    S(44, 'hunt_doll', '针线人', '缝纫室的人形针扎开始自己走路。', 'lowestSanity', { type: 'hunt', need: 3 }, KA, '击退 3 个针线人', '消灭所有英雄', { monsters: [{ key: 'stitch', name: '针线人', count: 3, speed: 4, might: 3, attack: 'might' }] }),
    S(45, 'survive_traitor_wolf', '狼王的耐心', '它不急着动手，只想看你们先崩溃。', 'highestMight', K, { type: 'survive', need: 4 }, '击败叛徒，撕毁契约', '撑过 4 轮', {}),
    S(46, 'survive_traitor_clock', '钟楼倒数', '钟摆每响一次，房子就少一层。', 'highestKnowledge', K, { type: 'survive', need: 5 }, '击败叛徒，停住钟摆', '撑过 5 轮', {}),
    S(47, 'survive_traitor_flood', '水线', '水已经漫到楼梯口，叛徒在等它漫过你的脚。', 'lowestSpeed', K, { type: 'survive', need: 4 }, '击败叛徒，找到排水阀', '撑过 4 轮', {}),
    S(48, 'survive_traitor_grave', '墓园的钟声', '每一声钟响，墓碑就多一块。', 'lowestSanity', K, { type: 'survive', need: 5 }, '击败叛徒，砸掉钟', '撑过 5 轮', {}),
    S(49, 'survive_traitor_mirror', '镜中的倒计时', '镜子里的你已经开始倒数。', 'omenHolder', K, { type: 'survive', need: 4 }, '打碎镜子，击败叛徒', '撑过 4 轮', {}),
    S(50, 'survive_traitor_house', '房子的心跳', '所有墙都在往同一个方向收缩。', 'revealer', K, { type: 'survive', need: 5 }, '击败叛徒，让房子停止收缩', '撑过 5 轮', {})
  ];

  /* ---------------- 内容包（content/cabin/*.json 构建生成） ---------------- */
  function applyContentPacks() {
    const packs = (typeof window !== 'undefined' && window.CABIN_PACKS) ? window.CABIN_PACKS : null;
    if (!packs) return;
    const charKeys = {};
    CHARS.forEach((c) => { charKeys[c.key] = true; });
    (packs.characters || []).forEach((c) => {
      if (!c || !c.key || charKeys[c.key]) return;
      const traits = {};
      TRAITS.forEach((t) => {
        const v = (c.traits || {})[t.key] || {};
        const min = Number(v.min), start = Number(v.start), max = Number(v.max);
        if (!Number.isFinite(min) || !Number.isFinite(start) || !Number.isFinite(max) || min > start || start > max) return;
        traits[t.key] = track(start, min, max);
      });
      if (TRAITS.some((t) => !traits[t.key])) return;
      CHARS.push({
        key: c.key, name: c.name || c.key, role: c.role || '访客', art: c.art || '?',
        age: Number(c.age) || 0,
        traits: traits, custom: true
      });
      charKeys[c.key] = true;
    });
    const scenarioKeys = {};
    SCENARIOS.forEach((s) => { scenarioKeys[s.key] = true; });
    (packs.scenarios || []).forEach((s) => {
      if (!s || !s.key || scenarioKeys[s.key] || !s.trigger) return;
      const room = String(s.trigger.room || '').trim();
      const omen = String(s.trigger.omen || '').trim();
      const card = String(s.trigger.card || '').trim();
      const event = String(s.trigger.event || '').trim();
      if (!room && !omen && !event) return;
      SCENARIOS.push({
        no: Number(s.no) || 0,
        key: s.key,
        name: s.name || s.key,
        story: s.story || '',
        trigger: { room: room, omen: omen, card: card, event: event },
        traitorRule: s.traitorRule || 'revealer',
        heroGoal: s.heroGoal || K,
        traitorGoal: s.traitorGoal || KA,
        heroGoalText: s.heroGoalText || '完成剧本目标',
        traitorGoalText: s.traitorGoalText || '消灭所有英雄',
        priority: Number(s.priority) || 0,
        monsters: Array.isArray(s.monsters) ? s.monsters : undefined,
        actions: Array.isArray(s.actions) ? s.actions : undefined,
        monster: s.monster || undefined,
        flipRooms: !!s.flipRooms,
        dimension: !!s.dimension,
        custom: true
      });
      scenarioKeys[s.key] = true;
    });
  }
  applyContentPacks();

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
      faces.push(v); total += v;
    }
    return { total: total, faces: faces };
  }
  function pushLog(st, line) {
    st.logs = (st.logs || []).concat(line);
    if (st.logs.length > 60) st.logs = st.logs.slice(-60);
  }
  function roomAt(st, floor, x, y) {
    return st.rooms.find((r) => r.floor === floor && r.x === x && r.y === y) || null;
  }
  function roomByName(st, name) {
    return st.rooms.find((r) => r.name === name) || null;
  }
  function alive(st, i) {
    const p = st.players[i];
    return !!p && !p.dead;
  }
  function traitVal(st, i, key) {
    const p = st.players[i];
    return p && p.traits ? (p.traits[key] || 0) : 0;
  }
  function rotateDoors(doors, times) {
    const order = ['N', 'E', 'S', 'W'];
    let out = '';
    for (const d of doors) out += order[(order.indexOf(d) + times + 4) % 4];
    return out;
  }
  function doorsHas(doors, dir) { return (doors || '').indexOf(dir) >= 0; }
  function pct(a, b) { return Math.max(0, Math.min(100, Math.round(a / b * 100))); }

  function itemTestBonus(st, i, trait) {
    const p = st.players[i] || {};
    return (p.items || []).reduce((sum, it) => sum + (it.testTrait === trait && !itemActionOf(st, it) ? (it.testBonus || 0) : 0), 0);
  }
  function bestWeapon(st, i, trait) {
    const p = st.players[i] || {};
    const list = (p.items || []).filter((it) => it.weapon === trait && !itemActionOf(st, it)).sort((a, b) => (b.attackBonus || 0) - (a.attackBonus || 0));
    return list[0] || null;
  }
  function markTraitItems(st, i, trait) {
    const p = st.players[i] || {};
    (p.items || []).forEach((it) => {
      if (it.testTrait === trait && !itemActionOf(st, it)) markItemAction(st, it, 'use');
    });
  }
  function armorValue(st, i) {
    return (st.players[i].items || []).reduce((sum, it) => sum + (it.armor || 0), 0);
  }

  function testRoll(st, i, trait, diff, rand) {
    const dice = Math.max(1, traitVal(st, i, trait) + itemTestBonus(st, i, trait));
    const r = roll(dice, rand);
    markTraitItems(st, i, trait);
    return { trait: trait, diff: diff, total: r.total, faces: r.faces, ok: r.total >= diff, dice: dice };
  }

  function gainTrait(st, i, trait, amount, reason) {
    const p = st.players[i];
    if (!p) return;
    const max = p.max ? p.max[trait] : MAX_TRAIT;
    p.traits[trait] = Math.min(max, p.traits[trait] + amount);
    if (reason) pushLog(st, p.name + ' +' + amount + ' ' + labelOf(trait) + '（' + reason + '）');
  }
  function labelOf(trait) {
    const t = TRAITS.find((x) => x.key === trait);
    return t ? t.label : trait;
  }

  function dropItemsOnDeath(st, i) {
    const p = st.players[i];
    if (!p || !p.items || !p.items.length) return;
    const key = p.floor + '|' + p.x + '|' + p.y;
    const room = roomAt(st, p.floor, p.x, p.y);
    st.itemPiles = st.itemPiles || {};
    st.itemPiles[key] = (st.itemPiles[key] || []).concat(p.items);
    pushLog(st, '☠ ' + p.name + ' 的物品掉在「' + (room ? room.name : '原地') + '」：' + p.items.map((it) => it.name).join('、'));
    p.items = [];
  }

  function loseTraitDirect(st, i, trait, amount, reason) {
    const p = st.players[i];
    if (!p) return;
    const min = p.min ? p.min[trait] : 1;
    let next = p.traits[trait] - amount;
    if (st.haunt && st.haunt.active) {
      if (next < min) {
        p.traits[trait] = Math.max(0, next);
        if (!p.dead) {
          p.dead = true;
          dropItemsOnDeath(st, i);
        }
        pushLog(st, '☠ ' + p.name + ' 的' + labelOf(trait) + '跌破下限，倒下了');
      } else p.traits[trait] = next;
    } else {
      p.traits[trait] = Math.max(min, next);
    }
    if (reason) pushLog(st, p.name + ' -' + amount + ' ' + labelOf(trait) + '（' + reason + '）');
    checkWin(st);
  }

  function itemActionOf(st, item) {
    if (!item) return '';
    return (st.itemActions || {})[item.name] || '';
  }
  function markItemAction(st, item, action) {
    st.itemActions = st.itemActions || {};
    if (item && item.name) st.itemActions[item.name] = action;
  }

  function beginDamage(st, i, amount, kind, source) {
    amount = Math.max(0, amount || 0);
    if (!amount) return false;
    const p = st.players[i];
    if (!p || p.dead) return false;
    kind = kind || 'physical';
    if (kind === 'physical') amount = Math.max(0, amount - armorValue(st, i));
    if (!amount) {
      pushLog(st, p.name + ' 的护甲吸收了这次物理伤害');
      return false;
    }
    const entry = {
      player: p.id, index: i, amount: amount, kind: kind || 'physical',
      source: source || '', queueEnd: !!st.pendingEnd
    };
    if (st.pendingDamage) {
      st.damageQueue = st.damageQueue || [];
      st.damageQueue.push(entry);
      pushLog(st, p.name + ' 还有 ' + amount + ' 点' + (kind === 'mental' ? '精神' : '身体') + '伤害在队列中');
      return true;
    }
    st.pendingDamage = entry;
    pushLog(st, p.name + ' 受到 ' + amount + ' 点' + (kind === 'mental' ? '精神' : '身体') + '伤害（' + source + '），等待分配');
    return true;
  }

  function applyDamageSplit(st, i, amount, kind, first, second) {
    const p = st.players[i];
    const pair = kind === 'mental' ? ['known', 'sanity'] : ['might', 'speed'];
    const a = pair.indexOf(first) >= 0 ? first : pair[0];
    const b = a === pair[0] ? pair[1] : pair[0];
    const aAmt = Math.max(0, Math.min(amount, second === undefined ? amount : (amount - Math.max(0, Math.min(amount, second)))));
    const bAmt = Math.max(0, amount - aAmt);
    if (aAmt) loseTraitDirect(st, i, a, aAmt, '伤害分配');
    if (bAmt) loseTraitDirect(st, i, b, bAmt, '伤害分配');
  }

  /* ---------------- 开局 ---------------- */
  function makePlayer(id, name) {
    return {
      id: id, name: name, char: null, charName: '未选', role: '', art: '?',
      traits: { speed: 0, might: 0, known: 0, sanity: 0 },
      min: null, max: null, items: [], floor: 'ground', x: 4, y: 5,
      dead: false, side: 'hero', started: 0, age: 0
    };
  }

  function assignCharacter(st, i, key) {
    const ch = CHARS.find((c) => c.key === key);
    if (!ch) return null;
    const p = st.players[i];
    p.char = ch.key; p.charName = ch.name; p.role = ch.role; p.art = ch.art;
    p.age = Number(ch.age) || 0;
    p.traits = {}; p.min = {}; p.max = {}; p.start = {};
    TRAITS.forEach((t) => {
      p.traits[t.key] = ch.traits[t.key].start;
      p.min[t.key] = ch.traits[t.key].min;
      p.max[t.key] = ch.traits[t.key].max;
      p.start[t.key] = ch.traits[t.key].start;
    });
    st.charTaken[ch.key] = i;
    return ch;
  }

  function startPlaying(st) {
    st.phase = 'playing';
    st.turn = 0;
    st.rolled = true;
    st.moves = st.players[0] ? st.players[0].traits.speed : 0;
    st.players.forEach((p) => {
      p.floor = 'ground'; p.x = 4; p.y = 5; p.side = 'hero';
    });
    beginTurn(st, 0);
    pushLog(st, '选角完成：所有人站在入口大厅，按当前速度开始探索');
  }

  function beginTurn(st, i) {
    st.turn = i;
    const p = st.players[i];
    if (!p) return;
    st.moves = Math.max(1, p.traits.speed);
    st.rolled = true;
    st.moveLocked = false;
    st.attacked = false;
    st.usedItems = [];
    st.itemActions = {};
    st.traded = false;
    st.dropped = false;
    st.picked = false;
    st.taskRolled = false;
    st.pendingRoll = null;
    st.lastRoll = null;
    st.lastDamageRoll = null;
    st.lastCard = null;
    st.tradeOffer = null;
    st.monsterTurn = null;
    st.omenThisTurn = false;
    st.omenCard = null;
    st.omenRoom = null;
    if (st.haunt && st.haunt.active) st.haunt.used = {};
  }

  function createInitial(players, rand, opts) {
    rand = rand || Math.random;
    opts = opts || {};
    const list = (players || []).slice(0, 6).map((p) => makePlayer(p.id, p.name));
    while (list.length < 3) list.push(makePlayer('p' + list.length, '玩家 ' + (list.length + 1)));

    const rooms = [
      { floor: 'ground', x: 4, y: 5, name: '入口大厅', doors: 'NEW', symbol: null, kind: 'start' },
      { floor: 'ground', x: 3, y: 5, name: '门厅', doors: 'NEW', symbol: null, kind: 'start' },
      { floor: 'ground', x: 3, y: 4, name: '主楼梯', doors: 'SEW', symbol: null, kind: 'grandStair' },
      { floor: 'upper', x: 4, y: 1, name: '上层平台', doors: 'SEW', symbol: null, kind: 'landing' },
      { floor: 'basement', x: 4, y: 6, name: '地下室平台', doors: 'NEW', symbol: null, kind: 'landing' }
    ];

    const st = {
      game: 'cabin', phase: 'select', hostId: null, turn: 0, round: 1,
      rolled: true, moves: 0,
      players: list, charTaken: {}, rooms: rooms,
      roomDeck: shuffle(TILES.draw, rand), roomDiscard: [],
      decks: {
        events: shuffle(EVENTS, rand),
        items: shuffle(ITEMS, rand),
        omens: shuffle(OMENS, rand)
      },
      eventDiscard: [],
      omens: 0, haunt: null, tokens: [],
      scenarioCard: SCENARIO_CARDS[Math.floor(rand() * SCENARIO_CARDS.length)],
      monsters: [], pendingTile: null, pendingDamage: null, pendingRoll: null, pendingEnd: false,
      monsterTurn: null, tradeOffer: null,
      lastCard: null, lastRoll: null, winner: null,
      logs: [opts.skipSelect ? '开局：所有人站在入口大厅' : '开局：先各自挑一个角色']
    };

    if (opts.skipSelect) {
      list.forEach((p, i) => assignCharacter(st, i, CHARS[i % CHARS.length].key));
      startPlaying(st);
    }
    return st;
  }

  /* ---------------- 抽牌 ---------------- */
  function drawCard(st, kind, rand) {
    if (kind === 'events') {
      if (!st.decks.events.length) {
        st.decks.events = shuffle(st.eventDiscard.length ? st.eventDiscard : EVENTS, rand);
        st.eventDiscard = [];
      }
      const c = st.decks.events.shift();
      if (c) st.eventDiscard.push(c);
      return c;
    }
    if (!st.decks[kind] || !st.decks[kind].length) return null;
    return st.decks[kind].shift();
  }

  function grantItem(st, i, card) {
    const p = st.players[i];
    p.items = (p.items || []).concat(clone(card));
    return p.items[p.items.length - 1];
  }

  function applyEffect(st, i, eff, rand) {
    if (!eff) return;
    if (eff.gain) gainTrait(st, i, eff.gain.trait, eff.gain.amount, '卡牌');
    if (eff.lose) loseTraitDirect(st, i, eff.lose.trait, eff.lose.amount, '卡牌');
    if (eff.damage) {
      const dice = eff.damage.dice || 0;
      if (dice) rollDamage(st, i, eff.damage.type, dice, '卡牌', rand);
      else beginDamage(st, i, eff.damage.amount, eff.damage.type, '卡牌');
    }
    if (eff.heal) {
      const p = st.players[i];
      p.traits[eff.heal.trait] = Math.min(p.start[eff.heal.trait], p.traits[eff.heal.trait] + eff.heal.amount);
    }
  }

  function rollDamage(st, i, type, dice, source, rand) {
    const r = roll(Math.max(1, dice), rand);
    const dr = { label: '伤害骰 · ' + (source || '卡牌'), faces: r.faces, total: r.total };
    st.lastDamageRoll = dr;
    if (!st.lastRoll) st.lastRoll = dr;
    beginDamage(st, i, r.total, type || 'physical', source || '卡牌');
    pushLog(st, st.players[i].name + ' 承受 ' + r.total + ' 点' + (type === 'mental' ? '精神' : '物理') + '伤害');
    return r;
  }

  function resolveRoomSymbol(st, i, room, rand) {
    if (!room || !room.symbol || room.resolved || st.pendingRoll) return;
    room.resolved = true;
    const p = st.players[i];
    if (room.symbol === 'item') {
      const c = drawCard(st, 'items', rand);
      if (c) {
        grantItem(st, i, c);
        st.lastCard = { kind: 'item', title: c.name, text: '获得物品：' + c.name + '\n' + c.text, tone: 'good' };
        pushLog(st, p.name + ' 在' + room.name + '找到「' + c.name + '」');
      }
      st.moveLocked = true; st.moves = 0;
      return;
    }
    if (room.symbol === 'omen') {
      const c = drawCard(st, 'omens', rand);
      st.omens += 1;
      if (c) {
        grantItem(st, i, c);
        if (c.delta) {
          if (c.delta.amount > 0) gainTrait(st, i, c.delta.trait, c.delta.amount, c.name);
          else loseTraitDirect(st, i, c.delta.trait, -c.delta.amount, c.name);
        }
        st.omenCard = c.name; st.omenRoom = room.name;
        st.lastCard = { kind: 'omen', title: c.name, text: '预兆：' + c.name + '\n' + c.text + '\n回合结束时进行闹鬼检定（6 骰 < ' + st.omens + ' 即触发）', tone: 'bad' };
        pushLog(st, p.name + ' 在' + room.name + '抽到预兆「' + c.name + '」（全场预兆 ' + st.omens + '）');
      }
      st.omenThisTurn = true;
      st.moveLocked = true; st.moves = 0;
      return;
    }
    const c = drawCard(st, 'events', rand);
    if (c) {
      st.lastCard = { kind: 'event', title: c.name, text: c.text, tone: c.roll ? 'bad' : 'neutral', win: c.win, lose: c.lose, effect: c.effect };
      st.lastRoll = null;
      pushLog(st, p.name + ' 在' + room.name + '遇到事件「' + c.name + '」');
      if (c.roll) {
        st.pendingRoll = {
          kind: 'event', index: i, card: c.name, title: c.name, text: c.text,
          room: room.name, trait: c.roll.trait, diff: c.roll.diff,
          win: c.win, lose: c.lose
        };
        pushLog(st, c.name + '：需要掷 ' + labelOf(c.roll.trait) + '判定（' + c.roll.diff + '）');
      } else applyEffect(st, i, c.effect, rand);
      maybeEventHaunt(st, i, c.name, room.name, rand);
      st.moveLocked = true; st.moves = 0;
    }
  }

  /* 官方 3E 有 5 条剧本由特定事件卡直接触发（不再走闹鬼检定） */
  function maybeEventHaunt(st, i, eventName, roomName, rand) {
    if (!eventName || (st.haunt && st.haunt.active)) return;
    const hit = SCENARIOS.filter((s) => s.trigger && s.trigger.event &&
      s.trigger.event === eventName).sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
    if (!hit) return;
    pushLog(st, '事件「' + eventName + '」直接引发闹鬼');
    startHaunt(st, st.turn, eventName, roomName, rand, hit);
    st.haunt.fromEvent = eventName;
    if (st.haunt.justStarted) pushLog(st, '闹鬼由事件触发，本周不再进行闹鬼检定');
  }

  function roomEffect(st, i, room, rand) {
    if (!room || !room.effect || room.effectUsed) return;
    room.effectUsed = true;
    if (room.effect.type === 'gain') {
      gainTrait(st, i, room.effect.trait, room.effect.amount, room.name);
      pushLog(st, room.name + '：' + labelOf(room.effect.trait) + ' +' + room.effect.amount);
    }
    if (room.effect.type === 'test') {
      st.lastCard = { kind: 'room', title: room.name, text: '房间判定：' + labelOf(room.effect.trait) + '，难度 ' + room.effect.diff + '。' };
      st.pendingRoll = {
        kind: 'room', index: i, room: room.name,
        trait: room.effect.trait, diff: room.effect.diff, damage: room.effect.damage || 1
      };
      pushLog(st, room.name + '：需要掷 ' + labelOf(room.effect.trait) + '判定（' + room.effect.diff + '）');
      st.moveLocked = true; st.moves = 0;
    }
  }

  function resolvePendingRoll(st, i, rand) {
    const pr = st.pendingRoll;
    if (!pr) return { ok: false, msg: '没有待掷的骰子' };
    if (pr.index !== i) return { ok: false, msg: '不是你的判定' };
    if (st.turn !== i) return { ok: false, msg: '还没轮到你' };
    const me = st.players[i];
    const r = testRoll(st, i, pr.trait, pr.diff, rand);
    st.lastRoll = {
      label: (pr.card || pr.room) + ' · ' + labelOf(pr.trait) + '判定',
      faces: r.faces, total: r.total, diff: pr.diff, ok: r.ok, trait: pr.trait
    };
    st.pendingRoll = null;
    pushLog(st, (pr.card || pr.room) + '：' + labelOf(pr.trait) + ' ' + r.total + ' 对 ' + pr.diff + ' → ' + (r.ok ? '成功' : '失败'));
    if (pr.kind === 'event') applyEffect(st, i, r.ok ? pr.win : pr.lose, rand);
    else if (!r.ok) {
      rollDamage(st, i, 'physical', pr.damage || 1, pr.room, rand);
      if (pr.room === '坍塌房间') {
        const landing = roomByName(st, '地下室平台');
        if (landing) { me.floor = landing.floor; me.x = landing.x; me.y = landing.y; pushLog(st, me.name + ' 掉到地下室平台'); }
      }
    }
    st.moveLocked = true; st.moves = 0;
    return { ok: true, state: st };
  }


  function pickScenario(st, roomName, omenName) {
    const room = String(roomName || '').trim();
    const omen = String(omenName || '').trim();
    const card = String((st && st.scenarioCard) || '').trim();
    const custom = SCENARIOS.filter((s) => s.trigger && !s.trigger.event &&
      (!s.trigger.room || s.trigger.room === '*' || s.trigger.room === room) &&
      (!s.trigger.omen || s.trigger.omen === '*' || s.trigger.omen === omen) &&
      (!s.trigger.card || s.trigger.card === '*' || (!!card && s.trigger.card === card))
    ).sort((a, b) => (b.priority || 0) - (a.priority || 0));
    if (custom.length) return custom[0];
    const roomIdx = Math.max(0, ROOMS.findIndex((r) => r.name === roomName)) + 1;
    const omenIdx = Math.max(0, OMENS.findIndex((o) => o.name === omenName)) + 1;
    const no = ((roomIdx * 7 + omenIdx * 11) % 50);
    return SCENARIOS[no] || SCENARIOS[0];
  }

  function chooseTraitor(st, sc, revealer) {
    const aliveIdx = st.players.map((p, i) => i).filter((i) => !st.players[i].dead);
    const low = (trait) => aliveIdx.slice().sort((a, b) => traitVal(st, a, trait) - traitVal(st, b, trait))[0];
    const high = (trait) => aliveIdx.slice().sort((a, b) => traitVal(st, b, trait) - traitVal(st, a, trait))[0];
    const rule = sc.traitorRule || 'revealer';
    const others = aliveIdx.filter((i) => i !== revealer);
    const pick = (list, fn) => ((list.length ? list : aliveIdx).slice().sort(fn)[0]);
    let idx = revealer;
    if (rule === 'lowestSanity') idx = pick(others, (a, b) => traitVal(st, a, 'sanity') - traitVal(st, b, 'sanity'));
    else if (rule === 'highestMight') idx = high('might');
    else if (rule === 'highestSpeed') idx = high('speed');
    else if (rule === 'lowestSpeed') idx = low('speed');
    else if (rule === 'highestKnowledge') idx = pick(others, (a, b) => traitVal(st, b, 'known') - traitVal(st, a, 'known'));
    else if (rule === 'lowestMight') idx = low('might');
    else if (rule === 'omenHolder') idx = revealer;
    else if (rule === 'leftOfRevealer') {
      for (let k = 1; k <= st.players.length; k++) {
        const j = (revealer + k) % st.players.length;
        if (!st.players[j].dead) { idx = j; break; }
      }
    } else if (rule === 'mostOmens') {
      idx = aliveIdx.slice().sort((a, b) =>
        ((st.players[b].items || []).filter((it) => it.omen).length) -
        ((st.players[a].items || []).filter((it) => it.omen).length))[0];
    } else if (rule === 'oldest') {
      const ranked = (others.length ? others : aliveIdx).filter((i) => st.players[i].age);
      idx = ranked.length ? ranked.slice().sort((a, b) => st.players[b].age - st.players[a].age)[0] : revealer;
    } else if (rule === 'hiddenTraitor' || rule === 'seeEvent' || rule === 'revealer') {
      idx = revealer;
    } else if (rule === 'noTraitor' || rule === 'freeForAll') {
      return -1;
    }
    if (idx === undefined || idx < 0 || !st.players[idx] || st.players[idx].dead) {
      idx = aliveIdx.length ? aliveIdx[0] : revealer;
    }
    return idx;
  }

  function spawnMonsters(st, sc, rand) {
    const groups = (sc.monsters || []).slice();
    if (sc.monster) groups.push(sc.monster);
    if (!groups.length) return;
    groups.forEach((m) => {
      for (let k = 0; k < (m.count || 1); k++) spawnOneMonster(st, m, rand);
    });
  }

  function startHaunt(st, revealer, omenName, roomName, rand, scOverride) {
    const sc = scOverride || pickScenario(st, roomName, omenName);
    const traitor = chooseTraitor(st, sc, revealer);
    const tp = traitor >= 0 ? st.players[traitor] : null;
    st.players.forEach((p, i) => { p.side = i === traitor ? 'traitor' : 'hero'; });
    st.haunt = {
      active: true, scenario: sc.key, no: sc.no, name: sc.name, story: sc.story,
      traitorRule: sc.traitorRule, traitor: traitor,
      heroGoal: clone(sc.heroGoal), traitorGoal: clone(sc.traitorGoal),
      heroGoalText: sc.heroGoalText, traitorGoalText: sc.traitorGoalText,
      progress: 0, round: 0, startRound: st.round, monsterBanish: 0,
      revealer: revealer, omen: omenName, room: roomName, justStarted: true,
      actions: clone(sc.actions || []), monster: clone(sc.monster || null), used: {},
      flipRooms: !!sc.flipRooms, card: st.scenarioCard,
      pvp: sc.traitorRule === 'freeForAll' || !!sc.pvp,
      hidden: sc.traitorRule === 'hiddenTraitor',
      dimension: !!sc.dimension, evidence: 0, treasure: 0
    };
    spawnMonsters(st, sc, rand);
    if (tp && st.haunt.hidden) {
      pushLog(st, '★ 闹鬼：「' + sc.name + '」—— 有一个人已经不是原来的他');
      st.lastCard = { kind: 'haunt', title: '★ 闹鬼：' + sc.name, text: sc.story + '\n叛徒身份暂时未知（隐藏叛徒）\n英雄目标：' + sc.heroGoalText, tone: 'bad' };
    } else if (tp) {
      pushLog(st, '★ 闹鬼：「' + sc.name + '」—— ' + tp.name + ' 成为叛徒');
      st.lastCard = { kind: 'haunt', title: '★ 闹鬼：' + sc.name, text: sc.story + '\n叛徒：' + tp.name + '\n英雄目标：' + sc.heroGoalText + '\n叛徒目标：' + sc.traitorGoalText, tone: 'bad' };
    } else {
      const mode = sc.traitorRule === 'freeForAll' ? '全员混战，没有叛徒' : '全员合作，没有叛徒';
      pushLog(st, '★ 闹鬼：「' + sc.name + '」—— ' + mode);
      st.lastCard = { kind: 'haunt', title: '★ 闹鬼：' + sc.name, text: sc.story + '\n' + mode + '\n目标：' + sc.heroGoalText, tone: 'bad' };
    }
  }

  function startHauntIfNeeded(st, rand) {
    if (!st.omenThisTurn || (st.haunt && st.haunt.active)) return;
    const hr = roll(6, rand);
    st.lastRoll = { label: '闹鬼检定（6 骰）', faces: hr.faces, total: hr.total };
    pushLog(st, '闹鬼检定：' + hr.total + ' 对全场预兆 ' + st.omens);
    if (hr.total < st.omens) startHaunt(st, st.turn, st.omenCard, st.omenRoom, rand);
  }

  /* ---------------- 胜负 ---------------- */
  function win(st, side, text) {
    if (st.phase === 'ended') return;
    st.phase = 'ended';
    st.winner = { side: side, text: text };
    pushLog(st, '★ ' + (side === 'traitor' ? '叛徒' : '英雄') + '获胜：' + text);
  }

  function heroItemCount(p) {
    return (p.items || []).filter((it) => !it.omen).length;
  }

  /* ---------------- 通用标记 / 板块翻覆 ---------------- */
  function addToken(st, type, room, count) {
    st.tokens = st.tokens || [];
    st.tokens.push({
      type: String(type), floor: room.floor, x: room.x, y: room.y,
      count: Math.max(1, count || 1)
    });
    pushLog(st, '放置标记「' + type + '」于「' + room.name + '」' + ((count || 1) > 1 ? ' ×' + count : ''));
  }

  function countTokens(st, type, filter) {
    let list = (st.tokens || []).filter((t) => t.type === type);
    if (filter && filter.floor) list = list.filter((t) => t.floor === filter.floor);
    if (filter && filter.room) list = list.filter((t) => {
      const r = roomAt(st, t.floor, t.x, t.y);
      return r && r.name === filter.room;
    });
    return list.reduce((s, t) => s + (t.count || 1), 0);
  }

  function tokensByFloor(st, type) {
    const out = {};
    FLOORS.forEach((f) => { out[f] = countTokens(st, type, { floor: f }); });
    return out;
  }

  function flipRoom(st, room) {
    if (!room || room.kind === 'start' || room.kind === 'landing' || room.kind === 'grandStair') return false;
    room.flipped = true;
    room.doors = 'NSEW';
    room.symbol = null;
    room.symbolHidden = true;
    return true;
  }

  /* ---------------- 剧本特殊机制 ---------------- */
  function spawnOneMonster(st, m, rand) {
    const rooms = st.rooms.filter((r) => r.kind !== 'start');
    const room = rooms[Math.floor(rand() * rooms.length)] || st.rooms[0];
    const mm = {
      id: 'm' + (st.monsters.length + 1) + '_' + (m.key || 'mon'),
      type: m.key, name: m.name, floor: room.floor, x: room.x, y: room.y,
      speed: m.speed, might: m.might, sanity: m.sanity, known: m.known,
      attack: m.attack || 'might', rule: m.rule || null,
      stunned: 0, side: 'traitor',
      noAttack: !!m.noAttack, disguised: !!m.disguised, merged: 0
    };
    st.monsters.push(mm);
    return mm;
  }

  function swapBodies(st, a, b) {
    const pa = st.players[a], pb = st.players[b];
    if (!pa || !pb) return;
    TRATS_EACH(pa, pb);
    pushLog(st, pa.name + ' 与 ' + pb.name + ' 换了一具身体');
  }
  function TRATS_EACH(pa, pb) {
    ['might', 'speed', 'sanity', 'known'].forEach((t) => {
      const tmp = pa.traits[t]; pa.traits[t] = pb.traits[t]; pb.traits[t] = tmp;
    });
    const tmpId = pa.charKey; pa.charKey = pb.charKey; pb.charKey = tmpId;
  }

  function bidTreasure(st, room, rand) {
    const h = st.haunt;
    const bidders = st.players.filter((p) => !p.dead && p.floor === room.floor && p.x === room.x && p.y === room.y);
    if (!bidders.length) return;
    const rolls = bidders.map((p) => {
      const r = roll(traitVal(st, st.players.indexOf(p), 'might'), rand);
      return { p: p, total: r.total };
    });
    const best = rolls.slice().sort((a, b) => b.total - a.total)[0];
    h.treasure = (h.treasure || 0) + 1;
    best.p.treasure = (best.p.treasure || 0) + 1;
    addToken(st, '宝藏', room, 1);
    pushLog(st, '宝藏出价：' + rolls.map((x) => x.p.name + ' ' + x.total).join('、') + ' → ' + best.p.name + ' 夺得宝藏');
  }

  /* 剧本行动的结果结算：按 tiers 从高到低取第一个满足的档位 */
  function applyOps(st, i, ops, room, rand) {
    if (!ops) return;
    const h = st.haunt || {};
    const p = st.players[i];
    if (ops.progress && st.haunt) st.haunt.progress += ops.progress;
    if (ops.token) addToken(st, ops.token, room, ops.count || 1);
    if (ops.gain) gainTrait(st, i, ops.gain.trait, ops.gain.amount, '剧本');
    if (ops.lose) loseTraitDirect(st, i, ops.lose.trait, ops.lose.amount, '剧本');
    if (ops.heal) {
      TRAITS.forEach((t) => { p.traits[t.key] = Math.min(p.start[t.key], p.traits[t.key] + ops.heal); });
      pushLog(st, p.name + ' 恢复了 ' + ops.heal + ' 点属性');
    }
    if (ops.damage) {
      const kind = ops.damage.type === 'mental' ? 'mental' : 'physical';
      if (ops.damage.dice) rollDamage(st, i, kind, ops.damage.dice, '剧本', rand);
      else beginDamage(st, i, ops.damage.amount || 1, kind, '剧本');
    }
    if (ops.flip && room) flipRoom(st, room);
    if (ops.trap) {
      const who = ops.trap === true ? p
        : (ops.trap === 'weakest'
          ? st.players.filter((q) => !q.dead && q !== p).sort((a, b) => traitVal(st, st.players.indexOf(a), 'might') - traitVal(st, st.players.indexOf(b), 'might'))[0]
          : (st.players.find((q) => q.id === ops.trap) || p));
      if (who) {
        who.trapped = true;
        pushLog(st, who.name + ' 被「' + (ops.trapName || '困住') + '」标记，不能再移动或交易');
      }
    }
    if (ops.untrap) {
      const who = ops.untrap === true ? p : (st.players.find((q) => q.id === ops.untrap) || p);
      who.trapped = false;
      pushLog(st, who.name + ' 摆脱了被困');
    }
    if (ops.evidence && st.haunt) {
      st.haunt.evidence = (st.haunt.evidence || 0) + (typeof ops.evidence === 'number' ? ops.evidence : 1);
      pushLog(st, '证据配对 +' + (ops.evidence || 1) + '（当前 ' + st.haunt.evidence + '）');
    }
    if (ops.bid && room) bidTreasure(st, room, rand);
    if (ops.treasure) {
      p.treasure = (p.treasure || 0) + ops.treasure;
      if (room) addToken(st, '宝藏', room, ops.treasure);
    }
    if (ops.dimension && st.haunt) {
      st.haunt.dimension = true;
      pushLog(st, '维度改写：这一层从现在起按同一层处理');
    }
    if (ops.disguise) {
      const targets = st.players.filter((q) => !q.dead && q !== p);
      if (targets.length) {
        const t = targets[Math.floor((rand || Math.random)() * targets.length)];
        t.illusion = true;
        pushLog(st, '「' + t.name + '」看上去不太对——有一个幻象混了进来');
      }
    }
    if (ops.reveal && st.haunt) {
      st.haunt.hidden = false;
      const tr = st.players[st.haunt.traitor];
      pushLog(st, '真相揭露：叛徒是 ' + (tr ? tr.name : '？'));
    }
    if (ops.swapBody) {
      const targets = st.players.filter((q) => !q.dead && q !== p);
      if (targets.length) {
        const t = ops.swapBody === true ? targets[Math.floor((rand || Math.random)() * targets.length)]
          : (st.players.find((q) => q.id === ops.swapBody) || targets[0]);
        swapBodies(st, i, st.players.indexOf(t));
      }
    }
    if (ops.transfer) {
      const t = ops.transfer.from === 'weakest'
        ? st.players.filter((q) => !q.dead && q !== p).sort((a, b) => traitVal(st, st.players.indexOf(a), ops.transfer.trait || 'might') - traitVal(st, st.players.indexOf(b), ops.transfer.trait || 'might'))[0]
        : st.players.find((q) => q.id === ops.transfer.from);
      if (t) {
        TRAITS.forEach((tr) => {
          const amt = Math.max(0, Math.min(ops.transfer.amount || 1, t.traits[tr.key] - 1));
          if (!amt) return;
          t.traits[tr.key] -= amt;
          p.traits[tr.key] = Math.min(p.start[tr.key] * 2, p.traits[tr.key] + amt);
        });
        pushLog(st, p.name + ' 借走了 ' + t.name + ' 的属性');
      }
    }
    if (ops.revive) {
      p.dead = false;
      TRAITS.forEach((t) => { p.traits[t.key] = Math.max(1, p.start[t.key]); });
      pushLog(st, '「Cut!」—— ' + p.name + ' 重新站了起来');
    }
    if (ops.rewrite && st.haunt) {
      if (ops.rewrite.heroGoalText) st.haunt.heroGoalText = ops.rewrite.heroGoalText;
      if (ops.rewrite.heroGoal) st.haunt.heroGoal = clone(ops.rewrite.heroGoal);
      pushLog(st, '剧本被改写：' + (ops.rewrite.heroGoalText || '新的目标'));
    }
    if (ops.addMonster) spawnOneMonster(st, ops.addMonster, rand || Math.random);
    if (ops.removeMonster) {
      let need = ops.removeMonsterCount || 1;
      while (need-- > 0) {
        const idx = st.monsters.findIndex((m) => m.type === ops.removeMonster);
        if (idx < 0) break;
        pushLog(st, '「' + st.monsters[idx].name + '」被移除了');
        st.monsters.splice(idx, 1);
      }
    }
    if (ops.banish) {
      const type = ops.banish.type || ops.banish;
      const count = ops.banish.count || 1;
      let need = count;
      while (need-- > 0) {
        const idx = st.monsters.findIndex((m) => m.type === type);
        if (idx < 0) break;
        st.monsters.splice(idx, 1);
        st.haunt.monsterBanish = (st.haunt.monsterBanish || 0) + 1;
      }
      pushLog(st, '驱散了 ' + count + ' 个威胁（累计 ' + (st.haunt.monsterBanish || 0) + '）');
    }
    if (ops.win) win(st, ops.win, ops.winText || (ops.win === 'heroes' ? '剧本目标达成，英雄获胜' : '叛徒达成目标'));
  }

  function scenarioAction(st, i, action, rand) {
    const h = st.haunt;
    if (!h || !h.active) return { ok: false, msg: '闹鬼还没开始' };
    const list = h.actions || [];
    const def = list.find((a) => a.key === action.key) || list.find((a) => a.name === action.key);
    if (!def) return { ok: false, msg: '剧本里没有这个行动' };
    const p = st.players[i];
    if (!p || (p.dead && !def.dead)) return { ok: false, msg: '你已经倒下了' };
    if (def.side && def.side !== p.side) return { ok: false, msg: '这一步只有' + (def.side === 'traitor' ? '叛徒' : '英雄') + '能做' };
    h.used = h.used || {};
    const useKey = p.id + '|' + def.key;
    if (def.once !== 'game' && h.used[useKey]) return { ok: false, msg: '本回合已经做过这个行动' };
    const room = roomAt(st, p.floor, p.x, p.y);
    if (def.where === 'room' && (!room || room.name !== def.room)) return { ok: false, msg: '必须在「' + def.room + '」里做' };
    if (def.where === 'symbol') {
      const want = def.symbol || 'event';
      if (!room || room.symbol !== want) return { ok: false, msg: '必须在带「' + want + '」符号的房间做' };
    }
    if (def.where === 'floors' && def.floors && def.floors.indexOf(p.floor) < 0) {
      return { ok: false, msg: '这个楼层不能做' };
    }
    const r = testRoll(st, i, def.trait || 'known', 0, rand);
    st.lastRoll = { label: '剧本行动 · ' + def.name, faces: r.faces, total: r.total };
    h.used[useKey] = true;
    const tiers = (def.tiers || []).slice().sort((a, b) => (b.at || 0) - (a.at || 0));
    const hit = tiers.find((t) => r.total >= (t.at || 0));
    pushLog(st, p.name + ' 执行「' + def.name + '」：' + r.total);
    applyOps(st, i, hit ? hit.do : def.miss, room, rand);
    checkWin(st);
    return { ok: true, state: st };
  }

  function goalDone(st, g, hg, h, heroes) {
    if (!g) return false;
    if (g.type === 'tokens') return countTokens(st, g.token, g) >= (g.need || 1);
    if (g.type === 'evidence') return (h.evidence || 0) >= (g.need || 1);
    if (g.type === 'treasure') return (h.treasure || 0) >= (g.need || 1);
    if (g.type === 'hunt') return h.monsterBanish >= (g.need || 1);
    if (g.type === 'ritual') return h.progress >= (g.need || 1);
    if (g.type === 'escape') return heroes.some((p) => {
      const r = roomAt(st, p.floor, p.x, p.y);
      return r && r.name === g.room && heroItemCount(p) >= (g.need || 0);
    });
    if (g.type === 'killTraitor') { const tr = st.players[h.traitor]; return !!tr && tr.dead; }
    if (g.type === 'placeTokens' && g.pairs) {
      const want = g.pairs.map((it) => countTokens(st, it.token, { room: it.room }));
      return want.every((n) => n >= (g.need || 1));
    }
    if (g.type === 'rig') {
      const byFloor = tokensByFloor(st, g.token);
      const filled = FLOORS.filter((f) => byFloor[f] > 0).length;
      return (g.perFloor ? filled >= FLOORS.length : true) && countTokens(st, g.token, null) >= (g.need || 1);
    }
    return false;
  }

  function checkWin(st) {
    if (!st.haunt || !st.haunt.active || st.phase === 'ended') return;
    const h = st.haunt;
    const heroes = st.players.filter((p) => p.side === 'hero' && !p.dead);
    const traitor = st.players[h.traitor];
    const hg = h.heroGoal || {};
    const tg = h.traitorGoal || {};
    if (!heroes.length) {
      if (h.pvp) { win(st, 'heroes', '全员倒下，混战结束'); return; }
      if (traitor && !traitor.dead) win(st, 'traitor', '英雄全灭，叛徒获胜');
      else win(st, 'heroes', '叛徒与英雄均已倒下');
      return;
    }
    if (h.pvp && heroes.length === 1) {
      win(st, 'heroes', heroes[0].name + ' 是最后活着的人，混战获胜'); return;
    }
    if (hg.type === 'killTraitor' && traitor && traitor.dead) {
      win(st, 'heroes', '叛徒倒下，英雄达成目标'); return;
    }
    if (tg.type === 'killAll' && heroes.length === 0) {
      win(st, 'traitor', '英雄全灭，叛徒获胜'); return;
    }
    if (tg.type === 'survive' && h.round >= tg.need && traitor && !traitor.dead) {
      win(st, 'traitor', '叛徒撑过 ' + tg.need + ' 轮'); return;
    }
    if (hg.type === 'survive' && h.round >= hg.need) {
      win(st, 'heroes', '全队撑过 ' + hg.need + ' 轮'); return;
    }
    if (hg.type === 'ritual' && h.progress >= hg.need) {
      win(st, 'heroes', '仪式完成，英雄获胜'); return;
    }
    if (hg.type === 'hunt' && h.monsterBanish >= hg.need) {
      win(st, 'heroes', '所有威胁被驱散，英雄获胜'); return;
    }
    if (hg.type === 'tokens' && countTokens(st, hg.token, hg) >= hg.need) {
      win(st, 'heroes', '「' + hg.token + '」已放置 ' + hg.need + ' 个，英雄获胜'); return;
    }
    if (hg.type === 'rig') {
      const byFloor = tokensByFloor(st, hg.token);
      const filled = FLOORS.filter((f) => byFloor[f] > 0).length;
      const total = countTokens(st, hg.token, null);
      if ((hg.perFloor ? filled >= FLOORS.length : true) && total >= hg.need) {
        win(st, 'heroes', '「' + hg.token + '」已覆盖 ' + filled + ' 层，英雄获胜'); return;
      }
    }
    if (hg.type === 'evidence' && (h.evidence || 0) >= (hg.need || 1)) {
      win(st, 'heroes', '证据配齐 ' + hg.need + ' 组，英雄获胜'); return;
    }
    if (hg.type === 'treasure' && (h.treasure || 0) >= (hg.need || 1)) {
      win(st, 'heroes', '宝藏到手 ' + hg.need + ' 份，英雄获胜'); return;
    }
    if (hg.type === 'placeTokens' && hg.pairs) {
      const want = hg.pairs.map((it) => countTokens(st, it.token, { room: it.room }));
      if (want.every((n) => n >= (hg.need || 1))) {
        win(st, 'heroes', '所有指定房间的标记都已就位，英雄获胜'); return;
      }
    }
    if (hg.type === 'allOf' && Array.isArray(hg.goals)) {
      const all = hg.goals.every((g) => goalDone(st, g, hg, h, heroes));
      if (all) { win(st, 'heroes', hg.text || '所有目标同时达成，英雄获胜'); return; }
    }
    if (hg.type === 'escape') {
      const at = heroes.find((p) => {
        const r = roomAt(st, p.floor, p.x, p.y);
        return r && r.name === hg.room && heroItemCount(p) >= hg.need;
      });
      if (at) { win(st, 'heroes', at.name + ' 带够了物品，英雄获胜'); return; }
    }
  }

  /* ---------------- 移动 / 翻房间 ---------------- */
  function pendingGuard(st) {
    if (st.pendingDamage) return '先分配伤害';
    if (st.pendingTile) return '先旋转并放置房间';
    if (st.phase === 'ended') return '本章已结束';
    return '';
  }

  function drawRoomTile(st, floor, rand) {
    let guard = 0;
    while (st.roomDeck.length && guard++ < 60) {
      const tile = st.roomDeck.shift();
      if (tile.floors.indexOf(floor) >= 0) return tile;
      st.roomDiscard.push(tile);
    }
    if (!st.roomDeck.length && st.roomDiscard.length) {
      st.roomDeck = shuffle(st.roomDiscard.filter((t) => t.floors.indexOf(floor) >= 0), rand);
      st.roomDiscard = [];
      return st.roomDeck.shift() || null;
    }
    return null;
  }

  function beginExplore(st, i, dir, rand) {
    const me = st.players[i];
    const from = roomAt(st, me.floor, me.x, me.y);
    if (!from || !doorsHas(from.doors, dir)) return { ok: false, msg: '这面墙没有门' };
    if (st.moves <= 0 || st.moveLocked) return { ok: false, msg: '今天不能再移动了' };
    const d = DIRS[dir];
    const nx = me.x + d[0], ny = me.y + d[1];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { ok: false, msg: '房子到这里就到头了' };
    if (roomAt(st, me.floor, nx, ny)) return { ok: false, msg: '那边已经有房间了' };
    const tile = drawRoomTile(st, me.floor, rand);
    if (!tile) return { ok: false, msg: '这一层没有可翻的房间牌了' };
    const legal = [];
    for (let rot = 0; rot < 4; rot++) {
      if (doorsHas(rotateDoors(tile.doors, rot), OPP[dir])) legal.push(rot);
    }
    let cost = 1;
    if (st.haunt && st.haunt.active) {
      cost += st.players.filter((p, k) => k !== i && !p.dead && p.side !== me.side && p.floor === me.floor && p.x === me.x && p.y === me.y).length;
    }
    cost = Math.min(cost, st.moves);
    st.pendingTile = {
      tile: tile, floor: me.floor, x: nx, y: ny, entry: dir, cost: cost,
      legalRots: legal, player: me.id, index: i
    };
    pushLog(st, me.name + ' 推开' + labelOf(dir) + '边的门，翻出「' + tile.name + '」，选择旋转方向');
    return { ok: true, pending: true, state: st };
  }

  function placeTile(st, i, rot, rand) {
    const pt = st.pendingTile;
    if (!pt) return { ok: false, msg: '没有待放置的房间' };
    if (pt.index !== i) return { ok: false, msg: '不是你在放房间' };
    if (pt.legalRots.indexOf(rot) < 0) return { ok: false, msg: '这个方向接不上门' };
    const me = st.players[i];
    const tile = pt.tile;
    const doors = rotateDoors(tile.doors, rot);
    const room = {
      floor: pt.floor, x: pt.x, y: pt.y, name: tile.name, doors: doors,
      symbol: tile.symbol || null, effect: tile.effect || null, special: tile.special || null,
      kind: 'normal', rot: rot, revealed: true, resolved: false
    };
    st.rooms.push(room);
    me.x = pt.x; me.y = pt.y; me.floor = pt.floor;
    st.moves = Math.max(0, st.moves - (pt.cost || 1));
    st.pendingTile = null;
    pushLog(st, '「' + room.name + '」接入地图（旋转 ' + rot + '）');
    roomEffect(st, i, room, rand);
    if (room.special === 'collapsed' && !st.pendingRoll) {
      st.lastCard = { kind: 'room', title: '坍塌房间', text: '房间正在坍塌：掷速度骰，失败受 1 点物理伤害。' };
      st.pendingRoll = { kind: 'room', index: i, room: '坍塌房间', trait: 'speed', diff: 4, damage: 1 };
      pushLog(st, '坍塌房间：需要掷速度判定（4）');
      st.moveLocked = true; st.moves = 0;
    }
    resolveRoomSymbol(st, i, room, rand);
    if (room.special === 'coal') {
      const landing = roomByName(st, '地下室平台');
      if (landing) {
        me.floor = landing.floor; me.x = landing.x; me.y = landing.y;
        pushLog(st, me.name + ' 顺着煤槽滑到地下室平台');
      }
    }
    return { ok: true, state: st };
  }

  function moveToRoom(st, i, dir, rand) {
    const me = st.players[i];
    const from = roomAt(st, me.floor, me.x, me.y);
    if (!from || !doorsHas(from.doors, dir)) return { ok: false, msg: '这面墙没有门' };
    if (me.trapped) return { ok: false, msg: '你带着「被困」标记，先摆脱它才能移动' };
    if (st.moves <= 0) return { ok: false, msg: '移动点用完了' };
    if (st.moveLocked) return { ok: false, msg: '抽过牌，本回合不能再移动' };
    const d = DIRS[dir];
    const nx = me.x + d[0], ny = me.y + d[1];
    const target = roomAt(st, me.floor, nx, ny);
    if (!target) return beginExplore(st, i, dir, rand);
    if (!doorsHas(target.doors, OPP[dir])) return { ok: false, msg: '对面是假门' };
    let cost = 1;
    if (st.haunt && st.haunt.active) {
      const others = st.players.filter((p, k) => k !== i && !p.dead && p.floor === me.floor && p.x === me.x && p.y === me.y).length
        + st.monsters.filter((m) => m.floor === me.floor && m.x === me.x && m.y === me.y).length;
      if (others > 0) cost += 1;
    }
    if (st.moves < 1) return { ok: false, msg: '没有移动点' };
    cost = Math.min(cost, st.moves);
    st.moves -= cost;
    me.x = nx; me.y = ny;
    const rName = target.name;
    pushLog(st, me.name + ' 进入「' + rName + '」');
    if (target.special === 'coal') {
      const landing = roomByName(st, '地下室平台');
      if (landing) { me.floor = landing.floor; me.x = landing.x; me.y = landing.y; }
    }
    roomEffect(st, i, target, rand);
    resolveRoomSymbol(st, i, target, rand);
    return { ok: true, state: st };
  }

  function stairMove(st, i) {
    const me = st.players[i];
    const here = roomAt(st, me.floor, me.x, me.y);
    if (!here) return { ok: false, msg: '不在这里' };
    if (me.trapped) return { ok: false, msg: '带着「被困」标记，先摆脱它才能移动' };
    if (st.moves <= 0 || st.moveLocked) return { ok: false, msg: '没有移动点' };
    let targetName = '';
    if (here.name === '主楼梯') targetName = '上层平台';
    else if (here.name === '上层平台') targetName = '主楼梯';
    else if (here.special === 'basementStairs') targetName = '门厅';
    else if (here.name === '门厅') targetName = '楼梯间';
    if (!targetName) return { ok: false, msg: '这里没有楼梯' };
    const target = roomByName(st, targetName);
    if (!target) return { ok: false, msg: '楼梯另一端还没出现' };
    me.floor = target.floor; me.x = target.x; me.y = target.y;
    st.moves = Math.max(0, st.moves - 1);
    pushLog(st, me.name + ' 沿楼梯到「' + target.name + '」');
    return { ok: true, state: st };
  }

  /* ---------------- 伤害 / 战斗 ---------------- */
  /* 维度改写（#34）：所有板块按同一层处理 */
  function sameSpot(st, a, b) {
    if (!a || !b) return false;
    return a.x === b.x && a.y === b.y && (a.floor === b.floor || !!(st.haunt && st.haunt.dimension));
  }

  function inLineOfSight(st, from, to) {
    if (!from || !to || from.floor !== to.floor) return false;
    const dx = Math.sign(to.x - from.x);
    const dy = Math.sign(to.y - from.y);
    if (dx && dy) return false;
    const dist = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
    if (dist < 1) return false;
    const dir = dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N';
    for (let k = 1; k <= dist; k++) {
      const cur = roomAt(st, from.floor, from.x + dx * (k - 1), from.y + dy * (k - 1));
      const next = roomAt(st, from.floor, from.x + dx * k, from.y + dy * k);
      if (!cur || !next) return false;
      if (!doorsHas(cur.doors, dir) || !doorsHas(next.doors, OPP[dir])) return false;
    }
    return true;
  }

  function hasDistanceWeapon(st, i, trait) {
    const p = st.players[i];
    return (p.items || []).some((it) => it.distance && (!it.weapon || it.weapon === trait) && !itemActionOf(st, it));
  }

  function attack(st, i, targetId, trait, rand, opts) {
    opts = opts || {};
    if (!st.haunt || !st.haunt.active) return { ok: false, msg: '闹鬼后才能攻击' };
    if (st.attacked) return { ok: false, msg: '本回合已经攻击过了' };
    const me = st.players[i];
    const tr = trait || 'might';
    const targetP = st.players.find((p) => p.id === targetId);
    if (targetP) {
      if (targetP.dead) return { ok: false, msg: '目标已经倒下' };
      if (targetP.side === me.side && !(st.haunt && st.haunt.pvp)) return { ok: false, msg: '不能攻击自己人' };
      const same = sameSpot(st, me, targetP);
      const ranged = !same && !!opts.distance && hasDistanceWeapon(st, i, tr) && inLineOfSight(st, me, targetP);
      if (!same && !ranged) return { ok: false, msg: '不在同一房间，也没有可用的远程武器或视线' };
      if (targetP.illusion) {
        targetP.illusion = false;
        st.attacked = true;
        pushLog(st, me.name + ' 攻击 ' + targetP.name + '，那只是一个幻象，一碰就散了');
        return { ok: true, state: st };
      }
      if (st.haunt && st.haunt.hidden && me.side === 'traitor' && targetP.side !== 'traitor') {
        st.haunt.hidden = false;
        pushLog(st, '★ 隐藏叛徒暴露了：' + me.name);
      }
      const wpn = bestWeapon(st, i, tr);
      const ar = roll(traitVal(st, i, tr) + itemTestBonus(st, i, tr) + (wpn ? (wpn.attackBonus || 0) : 0), rand);
      const dr = roll(traitVal(st, st.players.indexOf(targetP), tr), rand);
      if (wpn) markItemAction(st, wpn, 'use');
      markTraitItems(st, i, tr);
      st.lastRoll = { label: me.name + (ranged ? ' 远程攻击 ' : ' 攻击 ') + targetP.name, faces: ar.faces, foeFaces: dr.faces, total: ar.total, foe: dr.total };
      const diff = ar.total - dr.total;
      const physical = (tr === 'might' || tr === 'speed');
      let stolen = null;
      if (diff > 0 && physical && !ranged && opts.steal && diff >= 2) {
        const victim = targetP.items || [];
        let pick = null;
        if (opts.stealIndex !== undefined && opts.stealIndex !== null) {
          const wanted = victim[opts.stealIndex];
          if (wanted && !wanted.noSteal && !wanted.noTrade) pick = wanted;
        } else {
          pick = victim.find((it) => !it.noSteal && !it.noTrade) || null;
        }
        if (pick) {
          targetP.items = victim.filter((it) => it !== pick);
          me.items = me.items.concat(pick);
          stolen = pick;
          markItemAction(st, pick, 'steal');
        }
      }
      pushLog(st, me.name + (ranged ? ' 远程攻击 ' : ' 攻击 ') + targetP.name + '：' + ar.total + ' 对 ' + dr.total + ' → ' +
        (stolen ? '抢走「' + stolen.name + '」' : (diff > 0 ? '得手 ' + diff : diff < 0 && !ranged ? '被反击 ' + Math.abs(diff) : '被挡')));
      st.attacked = true;
      if (diff > 0 && !stolen) {
        beginDamage(st, st.players.indexOf(targetP), diff, physical ? 'physical' : 'mental', me.name + ' 的攻击');
      } else if (diff < 0 && !ranged) {
        beginDamage(st, i, Math.abs(diff), physical ? 'physical' : 'mental', targetP.name + ' 的反击');
      }
      return { ok: true, state: st };
    }
    const monster = st.monsters.find((m) => m.id === targetId);
    if (!monster) return { ok: false, msg: '找不到目标' };
    if (monster.noAttack) return { ok: false, msg: '这个目标不能被攻击' };
    const same = sameSpot(st, me, monster);
    const ranged = !same && !!opts.distance && hasDistanceWeapon(st, i, tr) && inLineOfSight(st, me, monster);
    if (!same && !ranged) return { ok: false, msg: '不在同一房间，也没有可用的远程武器或视线' };
    if (tr !== 'might' && tr !== 'speed') return { ok: false, msg: '怪物没有这个精神属性，不能这样攻击' };
    if (monster[tr] === undefined) return { ok: false, msg: '怪物没有这个属性' };
    const wpnM = bestWeapon(st, i, tr);
    const ar = roll(traitVal(st, i, tr) + itemTestBonus(st, i, tr) + (wpnM ? (wpnM.attackBonus || 0) : 0), rand);
    const dr = roll(monster[tr], rand);
    if (wpnM) markItemAction(st, wpnM, 'use');
    markTraitItems(st, i, tr);
    const diff = ar.total - dr.total;
    st.lastRoll = { label: me.name + (ranged ? ' 远程攻击 ' : ' 攻击 ') + monster.name, faces: ar.faces, foeFaces: dr.faces, total: ar.total, foe: dr.total };
    st.attacked = true;
    if (diff > 0) {
      monster.stunned = 1;
      st.haunt.monsterBanish = (st.haunt.monsterBanish || 0) + 1;
      pushLog(st, me.name + (ranged ? ' 远程击中 ' : ' 击中 ') + monster.name + '，它僵直了（已驱散 ' + st.haunt.monsterBanish + '）');
    } else if (diff < 0 && !monster.stunned && !ranged) {
      beginDamage(st, i, Math.abs(diff), 'physical', monster.name + ' 的反击');
      pushLog(st, monster.name + ' 反击 ' + me.name + '，造成 ' + Math.abs(diff) + ' 点物理伤害');
    } else {
      pushLog(st, me.name + (ranged ? ' 的远程攻击被挡下' : ' 没能击中 ') + monster.name);
    }
    checkWin(st);
    return { ok: true, state: st };
  }

  /* ---------------- 剧本判定 ---------------- */
  function heroCheck(st, i, rand) {
    const h = st.haunt;
    if (!h || !h.active) return { ok: false, msg: '闹鬼后才能进行剧本判定' };
    if (i === h.traitor) return { ok: false, msg: '叛徒不能帮英雄完成仪式' };
    if (st.pendingDamage || st.pendingTile) return { ok: false, msg: pendingGuard(st) };
    const goal = h.heroGoal;
    if (goal.type !== 'ritual') return { ok: false, msg: '这个剧本不需要仪式判定' };
    if (st.taskRolled) return { ok: false, msg: '本回合已经做过一次剧本判定' };
    const me = st.players[i];
    const here = roomAt(st, me.floor, me.x, me.y);
    if (goal.room && (!here || here.name !== goal.room)) return { ok: false, msg: '要在「' + goal.room + '」里做' };
    const r = testRoll(st, i, goal.trait, goal.diff, rand);
    st.lastRoll = { label: '仪式 · ' + labelOf(goal.trait) + '判定', faces: r.faces, total: r.total, diff: goal.diff, ok: r.ok };
    st.taskRolled = true;
    if (r.ok) {
      h.progress += 1;
      pushLog(st, me.name + ' 在「' + (goal.room || '此处') + '完成仪式（' + h.progress + '/' + goal.need + '）');
    } else {
      pushLog(st, me.name + ' 的仪式失败，遭到反噬');
      beginDamage(st, i, 1, 'mental', '仪式反噬');
    }
    checkWin(st);
    return { ok: true, state: st };
  }

  /* ---------------- 怪物 ---------------- */
  function monsterRoom(st, m) { return roomAt(st, m.floor, m.x, m.y); }
  function pathStep(st, m, target) {
    const start = roomAt(st, m.floor, m.x, m.y);
    if (!start) return null;
    const q = [{ r: start, d: 0 }];
    const seen = { [start.x + ',' + start.y]: true };
    while (q.length) {
      const cur = q.shift();
      if (cur.d >= m.speed) continue;
      for (const dir of ['N', 'S', 'E', 'W']) {
        if (!doorsHas(cur.r.doors, dir)) continue;
        const d = DIRS[dir]; const nx = cur.r.x + d[0], ny = cur.r.y + d[1];
        const nr = roomAt(st, m.floor, nx, ny);
        if (!nr || seen[nx + ',' + ny]) continue;
        seen[nx + ',' + ny] = true;
        if (nx === target.x && ny === target.y) return { x: nx, y: ny };
        q.push({ r: nr, d: cur.d + 1 });
      }
    }
    return null;
  }

  function findMonsterPath(st, m, target) {
    if (m.floor !== target.floor) return null;
    const start = roomAt(st, m.floor, m.x, m.y);
    const goal = roomAt(st, target.floor, target.x, target.y);
    if (!start || !goal) return null;
    if (start.x === goal.x && start.y === goal.y) return [];
    const q = [{ r: start, path: [] }];
    const seen = { [start.x + ',' + start.y]: true };
    while (q.length) {
      const cur = q.shift();
      for (const dir of ['N', 'S', 'E', 'W']) {
        if (!doorsHas(cur.r.doors, dir)) continue;
        const d = DIRS[dir];
        const nx = cur.r.x + d[0], ny = cur.r.y + d[1];
        if (seen[nx + ',' + ny]) continue;
        const nr = roomAt(st, m.floor, nx, ny);
        if (!nr) continue;
        seen[nx + ',' + ny] = true;
        const path = cur.path.concat([{ x: nx, y: ny, room: nr }]);
        if (nx === goal.x && ny === goal.y) return path;
        q.push({ r: nr, path: path });
      }
    }
    return null;
  }

  function monsterAttackHero(st, m, target, rand) {
    const ti = st.players.findIndex((p) => p.id === target.id);
    if (ti < 0) return;
    const tr = (m.attack === 'speed' || m.attack === 'sanity' || m.attack === 'known') ? m.attack : 'might';
    if (m[tr] === undefined) return;
    const ar = roll(m[tr], rand);
    const dr = roll(traitVal(st, ti, tr), rand);
    const diff = ar.total - dr.total;
    st.lastRoll = { label: m.name + ' 攻击 ' + target.name + '（' + labelOf(tr) + '）', faces: ar.faces, foeFaces: dr.faces, total: ar.total, foe: dr.total };
    st.lastCard = { kind: 'monster', title: '怪物攻击 · ' + m.name, text: m.name + ' 扑向 ' + target.name + '。', tone: diff > 0 ? 'bad' : '' };
    pushLog(st, m.name + ' 攻击 ' + target.name + '：' + ar.total + ' 对 ' + dr.total + ' → ' + (diff > 0 ? '命中' : '被躲开'));
    if (diff > 0) beginDamage(st, ti, diff, (tr === 'might' || tr === 'speed') ? 'physical' : 'mental', m.name);
  }

  function finishMonsterTurn(st) {
    if (!st.monsterTurn) return;
    if (st.pendingDamage || (st.damageQueue && st.damageQueue.length)) {
      st.monsterTurn.awaitingDamage = true;
      return;
    }
    st.monsterTurn = null;
    if (st.phase === 'ended') return;
    const h = st.haunt;
    const keepCard = st.lastCard && st.lastCard.kind === 'monster' ? st.lastCard : null;
    const keepRoll = keepCard ? st.lastRoll : null;
    if (h && h.active && h.monster && h.monster.endTurn && h.monster.endTurn.damage) {
      const dmg = h.monster.endTurn.damage;
      pushLog(st, '（' + (h.monster.name || '怪物') + '）回合结束：英雄各受 ' + (dmg.amount || 1) + ' 点伤害');
      st.players.forEach((p, k) => {
        if (p.side === 'hero' && !p.dead) beginDamage(st, k, dmg.amount || 1, dmg.type === 'mental' ? 'mental' : 'physical', h.monster.name || '怪物');
      });
      checkWin(st);
      if (st.pendingDamage || (st.damageQueue && st.damageQueue.length)) {
        st.pendingEnd = true;
        return;
      }
    }
    nextTurn(st);
    if (keepCard && st.phase === 'playing') {
      st.lastCard = keepCard;
      st.lastRoll = keepRoll;
    }
    pushLog(st, '轮到 ' + st.players[st.turn].name);
  }

  function beginMonsterTurn(st, i) {
    const alive = st.monsters.filter((m) => !m.dead);
    if (!alive.length) return false;
    st.monsterTurn = { actor: st.players[i].id, queue: alive.map((m) => m.id), awaitingDamage: false };
    pushLog(st, '怪物阶段：' + st.players[i].name + ' 指挥 ' + alive.length + ' 只怪物行动');
    return true;
  }

  function monsterAct(st, i, action, rand) {
    const mt = st.monsterTurn;
    if (!mt) return { ok: false, msg: '现在不是怪物阶段' };
    if (st.players[i].id !== mt.actor) return { ok: false, msg: '只有叛徒能指挥怪物' };
    if (st.pendingDamage) return { ok: false, msg: '先分配伤害' };
    if (action.type === 'monsterEnd') {
      if (!mt.queue.length) { finishMonsterTurn(st); return { ok: true, state: st }; }
      mt.queue.forEach((id) => {
        const m = st.monsters.find((x) => x.id === id);
        if (m && m.stunned > 0) m.stunned -= 1;
      });
      mt.queue = [];
      finishMonsterTurn(st);
      return { ok: true, state: st };
    }
    if (action.type === 'monsterSkip') {
      const m = st.monsters.find((x) => x.id === action.monsterId);
      if (!m || mt.queue.indexOf(m.id) < 0) return { ok: false, msg: '这只怪物已经行动过了' };
      if (m.stunned > 0) m.stunned -= 1;
      mt.queue = mt.queue.filter((id) => id !== m.id);
      pushLog(st, m.name + ' 跳过行动');
      if (!mt.queue.length) finishMonsterTurn(st);
      return { ok: true, state: st };
    }
    const m = st.monsters.find((x) => x.id === action.monsterId);
    if (!m || mt.queue.indexOf(m.id) < 0) return { ok: false, msg: '这只怪物已经行动过了' };
    if (m.stunned > 0) {
      m.stunned -= 1;
      mt.queue = mt.queue.filter((id) => id !== m.id);
      pushLog(st, m.name + ' 还在僵直，跳过行动');
      if (!mt.queue.length) finishMonsterTurn(st);
      return { ok: true, state: st };
    }
    const target = st.players.find((p) => p.id === action.target && !p.dead && p.side === 'hero');
    if (!target) return { ok: false, msg: '没有这个英雄目标' };
    const path = findMonsterPath(st, m, target);
    if (path === null) {
      mt.queue = mt.queue.filter((id) => id !== m.id);
      pushLog(st, m.name + ' 无法到达 ' + target.name + '，跳过行动');
      if (!mt.queue.length) finishMonsterTurn(st);
      return { ok: true, state: st };
    }
    const steps = path.slice(0, Math.max(1, m.speed || 1));
    steps.forEach((p) => { m.x = p.x; m.y = p.y; });
    if (m.floor === target.floor && m.x === target.x && m.y === target.y) {
      monsterAttackHero(st, m, target, rand);
    } else if (steps.length) {
      pushLog(st, m.name + ' 向 ' + target.name + ' 移动了 ' + steps.length + ' 格');
    }
    mt.queue = mt.queue.filter((id) => id !== m.id);
    if (!mt.queue.length) finishMonsterTurn(st);
    return { ok: true, state: st };
  }


  /* ---------------- 回合 ---------------- */
  function nextTurn(st) {
    const from = st.turn;
    let i = st.turn;
    for (let k = 0; k < st.players.length; k++) {
      i = (i + 1) % st.players.length;
      if (!st.players[i].dead) {
        st.turn = i;
        if (i <= from) {
          st.round += 1;
          if (st.haunt && st.haunt.active) {
            st.haunt.round += 1;
            checkWin(st);
            if (st.phase === 'ended') return;
          }
        }
        beginTurn(st, i);
        return;
      }
    }
    st.turn = 0;
    beginTurn(st, 0);
  }

  function endTurn(st, i, rand) {
    if (st.pendingDamage) return { ok: false, msg: '先分配伤害' };
    if (st.pendingRoll) return { ok: false, msg: '先掷骰' };
    if (st.pendingTile) return { ok: false, msg: '先放置房间' };
    if (st.tradeOffer) return { ok: false, msg: '先处理交易请求' };
    if (st.phase === 'ended') return { ok: false, msg: '已经结束' };
    if (st.players[i] && st.players[i].dead) {
      startHauntIfNeeded(st, rand);
      checkWin(st);
      if (st.phase === 'ended') return { ok: true, state: st };
      if (st.haunt && st.haunt.active) st.haunt.justStarted = false;
      nextTurn(st);
      pushLog(st, '倒下的角色跳过回合，轮到 ' + st.players[st.turn].name);
      return { ok: true, state: st };
    }
    startHauntIfNeeded(st, rand);
    checkWin(st);
    if (st.phase === 'ended') return { ok: true, state: st };
    if (st.haunt && st.haunt.active && st.haunt.justStarted) {
      st.haunt.justStarted = false;
    } else if (st.haunt && st.haunt.active && st.players[i].side === 'traitor' && !st.monsterTurn) {
      if (beginMonsterTurn(st, i)) return { ok: true, state: st };
    }
    nextTurn(st);
    pushLog(st, '轮到 ' + st.players[st.turn].name);
    return { ok: true, state: st };
  }

  function allocateDamage(st, i, action, rand) {
    const pd = st.pendingDamage;
    if (!pd) return { ok: false, msg: '没有待分配的伤害' };
    if (pd.player !== st.players[i].id) return { ok: false, msg: '只有受伤者可以分配伤害' };
    const amount = pd.amount;
    let first = action.first || (pd.kind === 'mental' ? 'known' : 'might');
    let second = action.second;
    if (second === undefined) second = 0;
    applyDamageSplit(st, pd.index, amount, pd.kind, first, second);
    st.pendingDamage = null;
    if (st.damageQueue && st.damageQueue.length) {
      st.pendingDamage = st.damageQueue.shift();
      return { ok: true, state: st };
    }
    if (st.monsterTurn) {
      if (!st.pendingDamage && !(st.damageQueue && st.damageQueue.length)) finishMonsterTurn(st);
      checkWin(st);
      return { ok: true, state: st };
    }
    const end = st.pendingEnd;
    st.pendingEnd = false;
    if (end) {
      nextTurn(st);
      pushLog(st, '轮到 ' + st.players[st.turn].name);
    } else if (st.phase === 'playing' && st.players[st.turn].dead) {
      endTurn(st, st.turn, rand);
    }
    checkWin(st);
    return { ok: true, state: st };
  }

  function resolveTrade(st, i, action) {
    const offer = st.tradeOffer;
    if (!offer) return { ok: false, msg: '没有待处理的交易' };
    const me = st.players[i];
    if (me.trapped) return { ok: false, msg: '带着「被困」标记不能交易' };
    if (action.type === 'tradeCancel') {
      if (me.id !== offer.from) return { ok: false, msg: '只有发起者能撤回交易' };
      st.tradeOffer = null;
      pushLog(st, me.name + ' 撤回了交易');
      return { ok: true, state: st };
    }
    if (me.id !== offer.to) return { ok: false, msg: '只有接收方可以回应交易' };
    const from = st.players.find((p) => p.id === offer.from);
    if (action.type === 'tradeReject') {
      st.tradeOffer = null;
      pushLog(st, me.name + ' 拒绝了 ' + (from ? from.name : '对方') + ' 的交易');
      return { ok: true, state: st };
    }
    if (!from) return { ok: false, msg: '交易发起者不在了' };
    const item = from.items[offer.index];
    if (!item) { st.tradeOffer = null; return { ok: false, msg: '发起者已经没有这件物品' }; }
    if (item.noTrade) { st.tradeOffer = null; return { ok: false, msg: '这件物品不能交易' }; }
    let wanted = null;
    if (offer.requestIndex !== null && offer.requestIndex !== undefined && offer.requestIndex >= 0) {
      wanted = me.items[offer.requestIndex];
      if (!wanted) { st.tradeOffer = null; return { ok: false, msg: '接收方已经没有这件物品' }; }
      if (wanted.noTrade) { st.tradeOffer = null; return { ok: false, msg: '接收方的物品不能交易' }; }
      if (itemActionOf(st, wanted)) { st.tradeOffer = null; return { ok: false, msg: '接收方的物品本回合已经执行过其他操作' }; }
    }
    from.items.splice(offer.index, 1);
    me.items = me.items.concat(item);
    if (wanted) {
      me.items = me.items.filter((it) => it !== wanted);
      from.items = from.items.concat(wanted);
    }
    st.traded = true;
    markItemAction(st, item, 'trade');
    if (wanted) markItemAction(st, wanted, 'trade');
    st.tradeOffer = null;
    pushLog(st, from.name + ' 把「' + item.name + '」交给 ' + me.name +
      (wanted ? '，' + me.name + ' 把「' + wanted.name + '」交给 ' + from.name : '') +
      '（双方确认）');
    return { ok: true, state: st };
  }

  function makeTradeOffer(st, i, action) {
    if (st.traded) return { ok: false, msg: '本回合已经交易过' };
    if (st.tradeOffer) return { ok: false, msg: '已有待处理的交易' };
    const p = st.players[i];
    if (p.trapped) return { ok: false, msg: '带着「被困」标记不能交易' };
    const other = st.players.find((x) => x.id === action.target);
    if (!other || other.dead || other.floor !== p.floor || other.x !== p.x || other.y !== p.y) return { ok: false, msg: '只能和同房间的人交易' };
    const item = p.items[action.index];
    if (!item) return { ok: false, msg: '没有这件物品' };
    if (item.noTrade) return { ok: false, msg: '这件物品不能交易' };
    if (itemActionOf(st, item)) return { ok: false, msg: '这件物品本回合已经执行过其他操作' };
    let requestIndex = null;
    let requestName = '';
    if (action.requestIndex !== null && action.requestIndex !== undefined && action.requestIndex >= 0) {
      const wanted = other.items[action.requestIndex];
      if (!wanted) return { ok: false, msg: '对方没有这件物品' };
      if (wanted.noTrade) return { ok: false, msg: '对方这件物品不能交易' };
      if (itemActionOf(st, wanted)) return { ok: false, msg: '对方这件物品本回合已经执行过其他操作' };
      requestIndex = action.requestIndex;
      requestName = wanted.name;
    }
    st.tradeOffer = {
      from: p.id, to: other.id, index: action.index,
      itemName: item.name, fromName: p.name, toName: other.name,
      requestIndex: requestIndex, requestName: requestName
    };
    pushLog(st, p.name + ' 向 ' + other.name + ' 发起交易：' + item.name +
      (requestName ? ' 换 ' + requestName : '（纯赠送）'));
    return { ok: true, state: st };
  }

  /* ---------------- 主入口 ---------------- */
  function act(state, action, pid, rand) {
    rand = rand || Math.random;
    const st = state;
    if (!st) return { ok: false, msg: '没有对局' };
    action = action || {};
    const i = st.players.findIndex((p) => p.id === pid);
    if (i < 0) return { ok: false, msg: '找不到玩家' };

    if (action.type === 'restart') {
      if (st.hostId && pid !== st.hostId) return { ok: false, msg: '只有房主能重开' };
      return { ok: true, state: createInitial(st.players.map((p) => ({ id: p.id, name: p.name })), rand, {}) };
    }

    if (st.phase === 'select') {
      if (action.type === 'pick') {
        if (st.charTaken[action.char] !== undefined) return { ok: false, msg: '这个角色已经被选走' };
        assignCharacter(st, i, action.char);
        let next = -1;
        for (let k = 1; k <= st.players.length; k++) {
          const j = (i + k) % st.players.length;
          if (!st.players[j].char) { next = j; break; }
        }
        if (next < 0) startPlaying(st);
        else st.turn = next;
        return { ok: true, state: st };
      }
      return { ok: false, msg: '先选角色' };
    }

    if (st.phase === 'ended') return { ok: false, msg: '对局已经结束' };
    if (st.pendingDamage && action.type === 'allocateDamage') return allocateDamage(st, i, action, rand);
    if (st.pendingDamage) return { ok: false, msg: '先分配伤害' };
    if (st.pendingRoll && action.type === 'rollPending') return resolvePendingRoll(st, i, rand);
    if (st.pendingRoll) return { ok: false, msg: '先掷骰' };
    if (st.pendingTile && action.type !== 'placeTile') return { ok: false, msg: '先旋转并放置房间' };
    if (st.tradeOffer) {
      if (action.type === 'tradeAccept' || action.type === 'tradeReject' || action.type === 'tradeCancel') return resolveTrade(st, i, action);
      return { ok: false, msg: '先处理交易请求' };
    }
    if (st.monsterTurn) {
      if (action.type === 'monsterMove' || action.type === 'monsterEnd' || action.type === 'monsterSkip') return monsterAct(st, i, action, rand);
      return { ok: false, msg: '先完成怪物阶段' };
    }
    if (st.turn !== i) return { ok: false, msg: '还没轮到你' };
    if (st.players[i] && st.players[i].dead && action.type !== 'end' && action.type !== 'hauntAction') return { ok: false, msg: '你已经倒下，只能结束回合' };

    switch (action.type) {
      case 'monsterMove': return monsterAct(st, i, action, rand);
      case 'monsterEnd': return monsterAct(st, i, action, rand);
      case 'monsterSkip': return monsterAct(st, i, action, rand);
      case 'tradeOffer': return makeTradeOffer(st, i, action);
      case 'tradeAccept': return resolveTrade(st, i, action);
      case 'tradeReject': return resolveTrade(st, i, action);
      case 'tradeCancel': return resolveTrade(st, i, action);
      case 'placeTile': return placeTile(st, i, action.rot || 0, rand);
      case 'move': {
        const r = moveToRoom(st, i, action.dir, rand);
        return r;
      }
      case 'stair': return stairMove(st, i);
      case 'attack': return attack(st, i, action.target, action.trait, rand, action);
      case 'hauntAction': return scenarioAction(st, i, action, rand);
      case 'flipTile': {
        const h = st.haunt;
        if (!h || !h.active) return { ok: false, msg: '闹鬼还没开始' };
        if (!h.flipRooms) return { ok: false, msg: '这个剧本没有吞噬房间的规则' };
        if (st.players[i].side !== 'traitor') return { ok: false, msg: '只有叛徒能翻覆板块' };
        const room = roomAt(st, st.players[i].floor, st.players[i].x, st.players[i].y);
        if (!flipRoom(st, room)) return { ok: false, msg: '这个板块不能翻覆' };
        pushLog(st, '「' + room.name + '」被吞噬，四边都成了门');
        return { ok: true, state: st };
      }
      case 'check': return heroCheck(st, i, rand);
      case 'allocateDamage': return allocateDamage(st, i, action, rand);
      case 'useItem': {
        const p = st.players[i];
        const idx = action.index;
        const item = p.items[idx];
        if (!item) return { ok: false, msg: '没有这件物品' };
        if (!item.use) return { ok: false, msg: '这件物品没有主动效果' };
        if (itemActionOf(st, item)) return { ok: false, msg: '这件物品本回合已经执行过其他操作' };
        if (item.use.type === 'heal') { p.traits[item.use.trait] = Math.min(p.start[item.use.trait], p.traits[item.use.trait] + (item.use.amount || 1)); }
        else if (item.use.type === 'gain') gainTrait(st, i, item.use.trait, item.use.amount || 1, item.name);
        st.usedItems = (st.usedItems || []).concat(item.name);
        markItemAction(st, item, 'use');
        pushLog(st, p.name + ' 使用「' + item.name + '」');
        return { ok: true, state: st };
      }
      case 'dropItem': {
        const p = st.players[i];
        const item = p.items[action.index];
        if (!item) return { ok: false, msg: '没有这件物品' };
        if (item.noDrop) return { ok: false, msg: '这件物品不能丢弃' };        if (itemActionOf(st, item)) return { ok: false, msg: '这件物品本回合已经执行过其他操作' };
        p.items.splice(action.index, 1);
        const key = p.floor + '|' + p.x + '|' + p.y;
        st.itemPiles = st.itemPiles || {};
        st.itemPiles[key] = (st.itemPiles[key] || []).concat(item);
        markItemAction(st, item, 'drop');
        return { ok: true, state: st };
      }
      case 'pickup': {
        const p = st.players[i];
        const key = p.floor + '|' + p.x + '|' + p.y;
        const pile = (st.itemPiles && st.itemPiles[key]) || [];
        if (!pile.length) return { ok: false, msg: '这里没有物品堆' };
        const available = pile.filter((it) => !itemActionOf(st, it));
        if (!available.length) return { ok: false, msg: '这些物品本回合已经执行过其他操作' };
        let picked = available;
        if (action.index !== undefined && action.index !== null) {
          const one = pile[action.index];
          if (!one) return { ok: false, msg: '这件物品不在物品堆里' };
          if (itemActionOf(st, one)) return { ok: false, msg: '这件物品本回合已经执行过其他操作' };
          picked = [one];
        }
        p.items = p.items.concat(picked);
        st.itemPiles[key] = pile.filter((it) => picked.indexOf(it) < 0);
        picked.forEach((it) => markItemAction(st, it, 'pickup'));
        pushLog(st, p.name + ' 捡起了 ' + picked.map((it) => it.name).join('、'));
        return { ok: true, state: st };
      }
      case 'trade': return makeTradeOffer(st, i, action);
      case 'end': return endTurn(st, i, rand);
      default: return { ok: false, msg: '未知动作' };
    }
  }

  return {
    W: W, H: H, FLOORS: FLOORS, FLOOR_LABEL: FLOOR_LABEL, DICE: DICE,
    TRAITS: TRAITS, CHARS: CHARS, TILES: TILES, SCENARIOS: SCENARIOS,
    createInitial: createInitial, pickScenario: pickScenario, act: act,
    helpers: {
      roomAt: roomAt, roomByName: roomByName, labelOf: labelOf, pct: pct,      itemTestBonus: itemTestBonus, armorValue: armorValue, heroItemCount: heroItemCount,
      maybeEventHaunt: maybeEventHaunt, checkWin: checkWin, startHaunt: startHaunt,
      rotateDoors: rotateDoors, rollDamage: rollDamage, inLineOfSight: inLineOfSight,
      hasDistanceWeapon: hasDistanceWeapon,
      countTokens: countTokens, tokensByFloor: tokensByFloor, addToken: addToken
    }
  };
})();

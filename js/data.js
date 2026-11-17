/* ============================================================
   大富翁 · 棋盘数据
   ---------------------------------------------------------
   40 格经典结构：22 块有色地产 + 4 座车站 + 2 家公用事业
                + 3 机会 + 3 命运 + 2 税 + 起点/监狱/免费停车/入狱
   地名用国内城市，避免使用原版 Atlantic City 街名（商标问题）。
   租金表按经典数值比例，四档房屋 + 旅馆。
   ============================================================ */

window.MonoData = (function () {
  const COLORS = ['#e2564a', '#3f7fe0', '#2f9e63', '#d9a13b'];

  // 地产组：底色 + 中文名
  const GROUPS = {
    brown:  { name: '老城', color: '#8b5e3c' },
    lblue:  { name: '浅蓝', color: '#6fa8dc' },
    pink:   { name: '粉红', color: '#d97fb0' },
    orange: { name: '橙色', color: '#e8954a' },
    red:    { name: '红色', color: '#d9534f' },
    yellow: { name: '黄色', color: '#dfb62c' },
    green:  { name: '绿色', color: '#4f9e6e' },
    dblue:  { name: '深蓝', color: '#3f5fa8' }
  };

  // type: go | prop | rail | util | chance | chest | tax | jail | free | gotojail
  // rent: [基础, 1房, 2房, 3房, 4房, 旅馆]
  const TILES = [
    { i: 0,  type: 'go',       name: '起点',     note: '经过或停留领 $200' },
    { i: 1,  type: 'prop',     name: '老街',     group: 'brown',  price: 60,  house: 30,  rent: [2, 10, 30, 90, 160, 250] },
    { i: 2,  type: 'chest',    name: '命运' },
    { i: 3,  type: 'prop',     name: '解放路',   group: 'brown',  price: 60,  house: 30,  rent: [4, 20, 60, 180, 320, 450] },
    { i: 4,  type: 'tax',      name: '所得税',   tax: 200 },
    { i: 5,  type: 'rail',     name: '南方车站', price: 200 },
    { i: 6,  type: 'prop',     name: '广州大道', group: 'lblue',  price: 100, house: 50,  rent: [6, 30, 90, 270, 400, 550] },
    { i: 7,  type: 'chance',   name: '机会' },
    { i: 8,  type: 'prop',     name: '珠江路',   group: 'lblue',  price: 100, house: 50,  rent: [6, 30, 90, 270, 400, 550] },
    { i: 9,  type: 'prop',     name: '荔湾巷',   group: 'lblue',  price: 120, house: 50,  rent: [8, 40, 100, 300, 450, 600] },
    { i: 10, type: 'jail',     name: '监狱',     note: '路过仅参观' },
    { i: 11, type: 'prop',     name: '天河路',   group: 'pink',   price: 140, house: 100, rent: [10, 50, 150, 450, 625, 750] },
    { i: 12, type: 'util',     name: '电力公司', price: 150 },
    { i: 13, type: 'prop',     name: '越秀路',   group: 'pink',   price: 140, house: 100, rent: [10, 50, 150, 450, 625, 750] },
    { i: 14, type: 'prop',     name: '白云路',   group: 'pink',   price: 160, house: 100, rent: [12, 60, 180, 500, 700, 900] },
    { i: 15, type: 'rail',     name: '北方车站', price: 200 },
    { i: 16, type: 'prop',     name: '黄埔大道', group: 'orange', price: 180, house: 100, rent: [14, 70, 200, 550, 750, 950] },
    { i: 17, type: 'chest',    name: '命运' },
    { i: 18, type: 'prop',     name: '番禺路',   group: 'orange', price: 180, house: 100, rent: [14, 70, 200, 550, 750, 950] },
    { i: 19, type: 'prop',     name: '花都路',   group: 'orange', price: 200, house: 100, rent: [16, 80, 220, 600, 800, 1000] },
    { i: 20, type: 'free',     name: '免费停车', note: '休息一下' },
    { i: 21, type: 'prop',     name: '从化路',   group: 'red',    price: 220, house: 150, rent: [18, 90, 250, 700, 875, 1050] },
    { i: 22, type: 'chance',   name: '机会' },
    { i: 23, type: 'prop',     name: '增城路',   group: 'red',    price: 220, house: 150, rent: [18, 90, 250, 700, 875, 1050] },
    { i: 24, type: 'prop',     name: '南沙路',   group: 'red',    price: 240, house: 150, rent: [20, 100, 300, 750, 925, 1100] },
    { i: 25, type: 'rail',     name: '东方车站', price: 200 },
    { i: 26, type: 'prop',     name: '琶洲路',   group: 'yellow', price: 260, house: 150, rent: [22, 110, 330, 800, 975, 1150] },
    { i: 27, type: 'prop',     name: '知识路',   group: 'yellow', price: 260, house: 150, rent: [22, 110, 330, 800, 975, 1150] },
    { i: 28, type: 'util',     name: '自来水厂', price: 150 },
    { i: 29, type: 'prop',     name: '大学城路', group: 'yellow', price: 280, house: 150, rent: [24, 120, 360, 850, 1025, 1200] },
    { i: 30, type: 'gotojail', name: '入狱',     note: '直接进监狱' },
    { i: 31, type: 'prop',     name: '深圳湾',   group: 'green',  price: 300, house: 200, rent: [26, 130, 390, 900, 1100, 1275] },
    { i: 32, type: 'prop',     name: '前海路',   group: 'green',  price: 300, house: 200, rent: [26, 130, 390, 900, 1100, 1275] },
    { i: 33, type: 'chest',    name: '命运' },
    { i: 34, type: 'prop',     name: '福田路',   group: 'green',  price: 320, house: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
    { i: 35, type: 'rail',     name: '西方车站', price: 200 },
    { i: 36, type: 'chance',   name: '机会' },
    { i: 37, type: 'prop',     name: '外滩路',   group: 'dblue',  price: 350, house: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
    { i: 38, type: 'tax',      name: '奢侈税',   tax: 100 },
    { i: 39, type: 'prop',     name: '香江道',   group: 'dblue',  price: 400, house: 200, rent: [50, 200, 600, 1400, 1700, 2000] }
  ];

  /* 机会卡：a 是效果描述，由引擎执行 */
  const CHANCE = [
    { t: '前进到起点，领 $200',                     a: { type: 'move', to: 0 } },
    { t: '前进到外滩路，若经过起点领 $200',          a: { type: 'move', to: 37 } },
    { t: '前进到最近的火车站，付双倍租金',            a: { type: 'nearestRail' } },
    { t: '银行付你股息 $50',                        a: { type: 'money', v: 50 } },
    { t: '退后三格',                                a: { type: 'moveBack', n: 3 } },
    { t: '直接进监狱，不经过起点',                   a: { type: 'jail' } },
    { t: '房屋大修：每栋房子 $25，每座旅馆 $100',     a: { type: 'repair', house: 25, hotel: 100 } },
    { t: '获得一张出狱卡，可留着以后用',             a: { type: 'jailCard' } },
    { t: '前进到监狱（只是路过，不停留）',           a: { type: 'move', to: 10 } },
    { t: '交通罚单，缴 $100',                       a: { type: 'money', v: -100 } },
    { t: '前进到电力公司，按骰点付租',               a: { type: 'move', to: 12 } },
    { t: '竞赛奖金 $100',                           a: { type: 'money', v: 100 } }
  ];

  /* 命运卡 */
  const CHEST = [
    { t: '银行错误，退还你 $20',                    a: { type: 'money', v: 20 } },
    { t: '中了小额彩票 $100',                       a: { type: 'money', v: 100 } },
    { t: '支付医药费 $50',                          a: { type: 'money', v: -50 } },
    { t: '获得一张出狱卡',                          a: { type: 'jailCard' } },
    { t: '继承遗产 $100',                           a: { type: 'money', v: 100 } },
    { t: '缴纳税款 $100',                           a: { type: 'money', v: -100 } },
    { t: '生日礼金：每位玩家给你 $10',                a: { type: 'collect', v: 10 } },
    { t: '保险到期，领 $100',                       a: { type: 'money', v: 100 } },
    { t: '住院费用 $100',                           a: { type: 'money', v: -100 } },
    { t: '支付学费 $50',                            a: { type: 'money', v: -50 } },
    { t: '前进到起点，领 $200',                      a: { type: 'move', to: 0 } },
    { t: '旧物出售所得 $50',                        a: { type: 'money', v: 50 } }
  ];

  return { COLORS, GROUPS, TILES, CHANCE, CHEST, START_MONEY: 1500, GO_BONUS: 200 };
})();

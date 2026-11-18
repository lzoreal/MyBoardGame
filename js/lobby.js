/* ============================================================
   大厅：游戏列表
   ============================================================ */

window.Lobby = (function () {
  const GAMES = [
    {
      id: 'monopoly',
      name: '大富翁',
      artClass: 'mono',
      artText: 'MONO',
      desc: '经典地产经营。买地、收租、盖房子，把对手逼到破产。规则按经典版实现，含监狱、抵押、拍卖和交易。',
      meta: ['2-4 人', '60-90 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'ludo',
      name: '飞行棋',
      artClass: 'ludo',
      artText: 'LUDO',
      desc: '四人竞速。掷出 6 点起飞，踩到同色格顺风 +4，撞机把对手送回停机坪，先到终点者胜。',
      meta: ['2-4 人', '20 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'snakes',
      name: '蛇梯棋',
      artClass: 'snakes',
      artText: 'SNAKE',
      desc: '掷骰前进 100 格。踩梯子向上爬，遇蛇头被带回蛇尾，正好走到第 100 格才算赢。',
      meta: ['2-4 人', '15 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'gomoku',
      name: '五子棋',
      artClass: 'go',
      artText: 'GOMOKU',
      desc: '十五路棋盘，黑棋先行，横竖斜任意方向先连成五子者胜。',
      meta: ['2 人', '10 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'reversi',
      name: '黑白棋',
      artClass: 'rev',
      artText: 'REVERSI',
      desc: '八乘八奥赛罗。落子夹住对方棋子就翻面，两边都没位置可下时比子数，多者获胜。',
      meta: ['2 人', '15 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'connect4',
      name: '四子连珠',
      artClass: 'c4',
      artText: 'CONNECT 4',
      desc: '七列六行的落子游戏，棋子掉进该列最下面。横、竖、斜先连成四子者胜。',
      meta: ['2 人', '10 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'jump',
      name: '跳棋',
      artClass: 'jump',
      artText: 'JUMP',
      desc: '星形棋盘 121 孔。走一步或隔子跳，连跳可以一口气冲很远，先把 10 颗子送进对面三角区就赢。',
      meta: ['2-6 人', '25 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'uno',
      name: 'UNO',
      artClass: 'uno',
      artText: 'UNO',
      desc: '颜色与数字的博弈。变色牌自己选色，+2 与 +4 让下家摸牌跳过，出完最后一张牌就赢。',
      meta: ['2-6 人', '15 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'cabin',
      name: '林中小屋',
      artClass: 'cabin',
      artText: 'CABIN',
      desc: '经典山中小屋玩法：掷速度骰推门翻房间，抽事件、物品与预兆。预兆攒够会惊醒屋里的东西，抽到预兆的人成为叛徒，其余人按剧本目标对抗。',
      meta: ['2-6 人', '60 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'bigtwo',
      name: '大老二',
      artClass: 'bigtwo',
      artText: 'BIG 2',
      desc: '官方规则：首局持 ♦3 者先出且第一手必须带 ♦3。3 最小、2 最大，同点比花色；顺子与同花顺不能含 2。单张、一对、三张，或用 5 张拼顺子、同花、葫芦、四条、同花顺，先出完手牌者胜。',
      meta: ['4 人', '20 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'splendor',
      name: '璀璨宝石',
      artClass: 'splendor',
      artText: 'SPLENDOR',
      desc: '官方规则：拿 3 色或同色 2 颗（池里要剩 4 颗），预留卡换金。回合末手里最多 10 颗，超出要退回；同时满足多位贵族只能选 1 位。到 15 分后打完这一轮结算，同分比发展卡少者胜。',
      meta: ['2-4 人', '30 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'azul',
      name: '花砖物语',
      artClass: 'azul',
      artText: 'AZUL',
      desc: '官方规则：中间台带先手标记，第一个从中间台拿砖的人 -1 分并成为下轮先手。一色全拿进同色图案行，放不下掉地板扣分；墙格已有同色就不能再放。终局另加满行 +2、满列 +7、五色齐全 +10。',
      meta: ['2-4 人', '30 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'ticket',
      name: '车票之旅',
      artClass: 'ticket',
      artText: 'TICKET',
      desc: '美国原版地图：36 城、100 段路线（22 处双线）、30 张官方车票。开局 3 张选票留 2；灰线须声明颜色、彩虹万能；2-3 人局双线只开一条；有人剩 0-2 节车厢后每人再走一回合，车票正负 + 最长路线结算。',
      meta: ['2-5 人', '45 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'catan',
      name: '卡坦岛',
      artClass: 'catan',
      artText: 'CATAN',
      desc: '官方基础规则：19 块地形、9 个港口（4 个 3:1 + 5 个 2:1）、银行每种 19 张。掷 7 超 7 张弃一半、强盗自选位置与抢夺对象；发展中当回合买不能打、每回合限 1 张；可自由互市与按港口兑率换银行。最长道路与最大骑士团各 +2，先到 10 分。',
      meta: ['3-4 人', '60 分钟', '实时联机'],
      ready: true
    },
    {
      id: 'carcassonne',
      name: '卡卡颂',
      artClass: 'carc',
      artText: 'CARC',
      desc: '官方基础版：72 张板块拼成中世纪领地。抽板块、旋转拼接，再派米宝占城市、道路、修道院与农田。完成城市每块 2 分（盾徽 +2）、道路每块 1 分、修道院 9 分，终局农田每座完成城市 3 分。',
      meta: ['2-4 人', '35 分钟', '实时联机'],
      ready: true
    }
  ];

  function findById(id) {
    return GAMES.find((g) => g.id === id) || null;
  }

  function render(onPick) {
    const grid = document.getElementById('game-grid');
    grid.innerHTML = '';

    GAMES.forEach((g) => {
      const card = document.createElement('div');
      card.className = 'game-card' + (g.ready ? '' : ' disabled');

      const meta = g.meta.map((m) =>
        '<span class="tag' + (m === '实时联机' ? ' hot' : '') + '">' + m + '</span>').join('');

      card.innerHTML =
        '<div class="gc-art ' + g.artClass + '">' + g.artText + '</div>' +
        '<div class="gc-title">' + g.name + '</div>' +
        '<div class="gc-desc">' + g.desc + '</div>' +
        '<div class="gc-meta">' + meta + '</div>' +
        (g.ready ? '' : '<span class="gc-soon">敬请期待</span>');

      if (g.ready) {
        card.addEventListener('click', () => onPick(g));
      }

      grid.appendChild(card);
    });
  }

  return { GAMES: GAMES, findById: findById, render: render };
})();

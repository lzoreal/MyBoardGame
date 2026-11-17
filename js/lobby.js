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

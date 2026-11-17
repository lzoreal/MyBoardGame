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
      desc: '四人竞速，掷骰起飞，撞机回老家。',
      meta: ['2-4 人', '20 分钟'],
      ready: false
    },
    {
      id: 'uno',
      name: 'UNO',
      artText: 'UNO',
      artClass: 'uno',
      desc: '颜色与数字的博弈，剩最后一张牌时喊一声。',
      meta: ['2-6 人', '15 分钟'],
      ready: false
    },
    {
      id: 'gomoku',
      name: '五子棋',
      artClass: 'go',
      artText: 'GOMOKU',
      desc: '十五路棋盘，先连成五子者胜。',
      meta: ['2 人', '10 分钟'],
      ready: false
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
        '<div class="gc-art ' + g.artClass + '">' + (g.ready ? '' : '') + g.artText + '</div>' +
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

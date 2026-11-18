// 把 12 条「只在 notes 里」的官方剧本机制落成可驱动的 actions / goals / monsters。
// 运行：node tools/patch-official-specials.mjs
import fs from 'node:fs';

const FILE = 'content/cabin/scenarios/official-3e.json';
const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const arr = doc.scenarios || doc;
const get = (no) => {
  const s = arr.find((x) => x.no === no);
  if (!s) throw new Error('缺少剧本 #' + no);
  return s;
};
const dropNotes = (s) => { delete s.notes; };

// #5 石中血：7 只石头小天使不能被攻击，靠「捉迷藏」成对移除
{
  const s = get(5);
  s.monster = Object.assign(s.monster || {}, {
    count: 7, noAttack: true,
    rule: '不可被攻击；只能靠「捉迷藏」成对移除，进入视线即停'
  });
  s.heroGoal = { type: 'hunt', need: 4 };
  s.heroGoalText = '用「捉迷藏」成对移除石头小天使（4 对）';
  s.actions = [{
    key: 'hide', name: '捉迷藏', trait: 'speed', where: 'any', once: 'turn',
    tiers: [
      { at: 4, do: { banish: { type: 'cherub', count: 2 } } },
      { at: 0, do: { damage: { type: 'physical', amount: 1 } } }
    ]
  }];
  dropNotes(s);
}

// #6 遗产：揭开真相累积证据，配齐 3 组获胜
{
  const s = get(6);
  s.heroGoal = { type: 'evidence', need: 3 };
  s.heroGoalText = '在图库或图书室配对证据，配齐 3 组';
  s.actions = [{
    key: 'uncover', name: '揭开真相', trait: 'known', where: 'any', once: 'turn',
    tiers: [
      { at: 5, do: { evidence: 1 } },
      { at: 0, do: { note: '什么也没找到' } }
    ]
  }];
  dropNotes(s);
}

// #10 一笔认真的交易：全员混战，靠出价抢夺宝藏
{
  const s = get(10);
  s.heroGoal = { type: 'treasure', need: 3 };
  s.heroGoalText = '出价抢到 3 份宝藏（力量最高者得）';
  s.actions = [{
    key: 'bid', name: '出价', trait: 'might', where: 'any', once: 'turn',
    tiers: [{ at: 0, do: { bid: true } }]
  }];
  dropNotes(s);
}

// #15 群魔乱舞：三只怪物同时登场
{
  const s = get(15);
  delete s.monster;
  s.monsters = [
    { key: 'ghost', name: '幽灵', count: 1, might: 4, speed: 4, sanity: 5, known: 5, attack: 'sanity', rule: '无视门；不可击晕' },
    { key: 'vampire', name: '吸血鬼', count: 1, might: 5, speed: 4, sanity: 5, known: 5, attack: 'might' },
    { key: 'werewolf', name: '狼人', count: 1, might: 6, speed: 4, sanity: 4, known: 4, attack: 'might' }
  ];
  s.heroGoal = { type: 'hunt', need: 3 };
  s.heroGoalText = '驱散全部 3 只怪物';
  dropNotes(s);
}

// #18 这枚戒指真不错：幻象与真身
{
  const s = get(18);
  s.actions = [{
    key: 'unmask', name: '揭穿幻象', trait: 'sanity', where: 'any', once: 'turn',
    tiers: [
      { at: 5, do: { disguise: true } },
      { at: 0, do: { note: '幻象换了一张脸，你又一次认错人' } }
    ]
  }];
  dropNotes(s);
}

// #25 借来的时间：铠甲把别人的属性借走
{
  const s = get(25);
  s.actions = [{
    key: 'borrow', name: '借走时间', trait: 'sanity', where: 'room', room: '军械库', once: 'turn',
    tiers: [
      { at: 5, do: { transfer: { from: 'weakest', trait: 'might', amount: 1 } } },
      { at: 0, do: { damage: { type: 'mental', amount: 1 } } }
    ]
  }];
  dropNotes(s);
}

// #34 右侧的维度：所有板块按同一层处理
{
  const s = get(34);
  s.dimension = true;
  s.heroGoal = { type: 'allOf', text: '在维度改写下把同伴带出房子', goals: [{ type: 'escape', room: '入口大厅', need: 1 }] };
  s.heroGoalText = '在维度改写生效时抵达入口大厅';
  dropNotes(s);
}

// #37 灵魂出窍：换身体 + DNA 标记
{
  const s = get(37);
  s.actions = [{
    key: 'swap', name: '换一具身体', trait: 'sanity', where: 'any', once: 'turn',
    tiers: [
      { at: 4, do: { swapBody: true, token: 'DNA' } },
      { at: 0, do: { damage: { type: 'mental', amount: 1 } } }
    ]
  }];
  s.heroGoal = { type: 'allOf', text: '关掉机器人并在自己身体上留下 DNA 标记', goals: [
    { type: 'tokens', token: '已关闭机器人', need: 3 },
    { type: 'tokens', token: 'DNA', need: 3 }
  ] };
  s.heroGoalText = '关闭 3 台机器人，并留下 3 个 DNA 标记';
  dropNotes(s);
}

// #45 大胆登场：Cut! 复活并改写剧本
{
  const s = get(45);
  s.actions = [{
    key: 'cut', name: '“Cut!” 重来', trait: 'sanity', where: 'any', once: 'game', dead: true,
    tiers: [
      { at: 4, do: { revive: true, rewrite: { heroGoalText: '导演改主意了：在相机前活到最后一幕' } } },
      { at: 0, do: { damage: { type: 'mental', amount: 2 } } }
    ]
  }];
  dropNotes(s);
}

// #47 难忘的骑士：被困标记与关闭传送门
{
  const s = get(47);
  s.actions = [
    {
      key: 'seal', name: '关闭传送门', trait: 'known', where: 'symbol', symbol: 'omen', once: 'turn',
      tiers: [{ at: 4, do: { token: '已关闭传送门', untrap: true } }]
    },
    {
      key: 'snare', name: '困住某人', side: 'traitor', trait: 'sanity', where: 'any', once: 'turn',
      tiers: [{ at: 4, do: { trap: 'weakest', trapName: '被困' } }]
    }
  ];
  s.heroGoal = { type: 'tokens', token: '已关闭传送门', need: 3 };
  s.heroGoalText = '关闭 3 道传送门（关闭时自己摆脱被困）';
  dropNotes(s);
}

// #9 往事如烟 / #11 别被煮熟：全员混战已由 freeForAll→pvp 支持，去掉过时注记
dropNotes(get(9));
dropNotes(get(11));

fs.writeFileSync(FILE, JSON.stringify(doc, null, 2) + '\n');
console.log('已更新 12 条剧本机制；剩余 notes:', arr.filter((s) => s.notes).map((s) => '#' + s.no).join(',') || '无');

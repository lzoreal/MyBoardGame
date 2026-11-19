/* ============================================================
   诡镇奇谈（Arkham Horror LCG 风格）规则引擎
   ------------------------------------------------------------
   单人调查员、3 行动/回合、混沌袋检定、地点线索、遭遇牌、
   敌人交战、密谋/议程、第一章「集结号」完整流程与战役状态。
   卡面与剧本文案为原创，不复制官方插画与原文。
   ============================================================ */

window.ArkhamEngine = (function () {
  const CHAOS = ['+1', '0', '-1', '-1', '-1', '-2', '-2', '-3', '-4', 'skull', 'cultist', 'tablet', 'auto', 'elder'];
  const TOKEN_LABEL = {
    'skull': '骷髅', 'cultist': '信徒', 'tablet': '石碑', 'auto': '自动失败', 'elder': '古神印记'
  };
  const TOKEN_MOD = { 'skull': -2, 'cultist': -2, 'tablet': -3, 'auto': -99, 'elder': 1 };

  const CARDS = {
    pistol: { type: 'asset', name: '旧式手枪', cost: 3, combat: 1, damage: 1, text: '战力 +1，战斗造成 +1 伤害。' },
    flashlight: { type: 'asset', name: '手电筒', cost: 2, intellect: 2, text: '智力 +2（调查时）。' },
    knife: { type: 'asset', name: '小刀', cost: 1, combat: 1, text: '战力 +1。' },
    charm: { type: 'asset', name: '护身符', cost: 2, will: 1, sanitySoak: 2, text: '意志 +1，可抵消 2 点恐惧。' },
    ally: { type: 'asset', name: '老友', cost: 4, combat: 1, healthSoak: 1, sanitySoak: 1, text: '战力 +1，可各抵消 1 点伤害与恐惧。' },
    revolver: { type: 'asset', name: '连发左轮', cost: 4, combat: 2, damage: 1, text: '战力 +2，战斗造成 +1 伤害。' },
    book: { type: 'asset', name: '旧词典', cost: 3, intellect: 2, text: '智力 +2。' },
    medkit: { type: 'asset', name: '医疗包', cost: 2, healthSoak: 2, text: '可抵消 2 点伤害，耗尽后离场。' },
    rosary: { type: 'asset', name: '旧念珠', cost: 2, will: 1, sanitySoak: 2, text: '意志 +1，可抵消 2 点恐惧，耗尽后离场。' },
    firstAid: { type: 'event', name: '急救', cost: 2, effect: 'healDamage', text: '回复 2 点伤害。' },
    calm: { type: 'event', name: '镇静剂', cost: 1, effect: 'healHorror', text: '回复 2 点恐惧。' },
    smash: { type: 'event', name: '猛击', cost: 1, effect: 'smash', text: '对当前地点的敌人造成 2 点伤害。' },
    vicious: { type: 'event', name: '狠击', cost: 2, effect: 'smash3', text: '对当前地点的敌人造成 3 点伤害。' },
    lucky: { type: 'event', name: '侥幸', cost: 1, effect: 'lucky', text: '下一次检定 +2。' },
    insight: { type: 'event', name: '洞察', cost: 1, effect: 'clue', text: '在当前地点发现 1 个线索。' },
    dash: { type: 'event', name: '疾行', cost: 1, effect: 'evade', text: '自动闪避当前地点的一个敌人。' },
    windfall: { type: 'event', name: '外快', cost: 0, effect: 'money', text: '获得 3 点资源。' },
    notes: { type: 'event', name: '速记', cost: 0, effect: 'draw', text: '抽 2 张牌。' }
  };

  const INVESTIGATORS = [
    {
      id: 'detective', name: '罗伊·贝克', role: '私家侦探', color: '#3f7fe0',
      stats: { will: 3, int: 3, combat: 4, agi: 2 }, health: 9, sanity: 5, ability: 'roland',
      abilityText: '击败敌人后，可在所在地点发现 1 个线索。',
      deck: ['revolver', 'pistol', 'knife', 'knife', 'flashlight', 'charm', 'ally', 'medkit', 'firstAid', 'calm', 'vicious', 'smash', 'insight', 'insight', 'dash', 'lucky', 'windfall', 'notes']
    },
    {
      id: 'scholar', name: '黛西·沃', role: '图书管理员', color: '#8b5cf6',
      stats: { will: 2, int: 5, combat: 2, agi: 3 }, health: 5, sanity: 9, ability: 'scholar',
      abilityText: '每回合第一次调查少花 1 个行动点。',
      deck: ['flashlight', 'book', 'knife', 'charm', 'rosary', 'ally', 'medkit', 'calm', 'calm', 'insight', 'insight', 'insight', 'dash', 'lucky', 'notes', 'notes', 'smash', 'vicious']
    },
    {
      id: 'medium', name: '艾格尼丝·贝', role: '灵媒', color: '#e2564a',
      stats: { will: 4, int: 3, combat: 2, agi: 3 }, health: 6, sanity: 8, ability: 'agnes',
      abilityText: '每次受到恐惧后，对当前地点的敌人造成 1 点伤害。',
      deck: ['rosary', 'charm', 'knife', 'flashlight', 'ally', 'medkit', 'calm', 'calm', 'vicious', 'smash', 'insight', 'dash', 'dash', 'windfall', 'windfall', 'notes', 'lucky', 'pistol']
    },
    {
      id: 'reporter', name: '温蒂·亚当', role: '记者', color: '#2f9e63',
      stats: { will: 3, int: 3, combat: 2, agi: 4 }, health: 7, sanity: 7, ability: 'wendy',
      abilityText: '每回合第一次检定失败时，自动重抽一个混沌标记（自动失败除外）。',
      deck: ['knife', 'revolver', 'flashlight', 'charm', 'ally', 'medkit', 'calm', 'insight', 'insight', 'dash', 'dash', 'vicious', 'windfall', 'windfall', 'lucky', 'notes', 'pistol', 'book']
    },
    {
      id: 'guardian', name: '马克·哈里根', role: '退伍保安', color: '#c9a45c',
      stats: { will: 3, int: 2, combat: 4, agi: 2 }, health: 10, sanity: 6, ability: 'guardian',
      abilityText: '每回合第一次受到伤害时，少受 1 点伤害。',
      deck: ['revolver', 'revolver', 'knife', 'knife', 'medkit', 'ally', 'firstAid', 'firstAid', 'calm', 'smash', 'vicious', 'insight', 'dash', 'windfall', 'notes', 'notes', 'lucky', 'book']
    },
    {
      id: 'survivor', name: '诺拉·克莱', role: '流浪者', color: '#7a9e5a',
      stats: { will: 4, int: 2, combat: 3, agi: 4 }, health: 8, sanity: 7, ability: 'survivor',
      abilityText: '每次实际受到伤害后，获得 1 点资源。',
      deck: ['flashlight', 'flashlight', 'knife', 'knife', 'rosary', 'ally', 'medkit', 'firstAid', 'calm', 'calm', 'insight', 'insight', 'dash', 'dash', 'windfall', 'notes', 'notes', 'lucky']
    }
  ];

  const LOCATIONS = {
    study: { name: '书房', shroud: 2, clues: 2, x: 18, y: 52, links: ['hallway'], text: '一张堆满书稿的橡木桌，抽屉半开着。' },
    hallway: { name: '走廊', shroud: 1, clues: 1, x: 42, y: 52, links: ['study', 'foyer', 'attic', 'cellar'], text: '狭长的走廊，尽头有两扇门。' },
    foyer: { name: '门厅', shroud: 1, clues: 1, x: 66, y: 70, links: ['hallway', 'parlor'], text: '大门虚掩着，门外的雨声忽远忽近。' },
    parlor: { name: '客厅', shroud: 2, clues: 2, x: 80, y: 48, links: ['foyer'], text: '壁炉早已熄灭，地毯上有一道拖痕。' },
    attic: { name: '阁楼', shroud: 3, clues: 2, x: 42, y: 20, links: ['hallway'], text: '灰尘里堆着旧箱子，头顶有抓挠声。' },
    cellar: { name: '地下室', shroud: 4, clues: 2, x: 42, y: 84, links: ['hallway'], text: '潮气逼人，石阶通向更深的黑暗。' }
  };

  const ENEMIES = {
    rats: { name: '鼠群', fight: 1, evade: 2, health: 1, damage: 1, horror: 0 },
    ghoul: { name: '食尸鬼', fight: 3, evade: 2, health: 2, damage: 1, horror: 1 },
    ghost: { name: '游魂', fight: 4, evade: 3, health: 3, damage: 1, horror: 2 },
    priest: { name: '食尸鬼祭司', fight: 3, evade: 3, health: 4, damage: 1, horror: 1, boss: true },
    masked: { name: '蒙面主持者', fight: 4, evade: 3, health: 6, damage: 2, horror: 2, boss: true },
    larva: { name: '深渊幼虫', fight: 2, evade: 2, health: 2, damage: 1, horror: 0 },
    faceless: { name: '无面信徒', fight: 3, evade: 2, health: 3, damage: 1, horror: 2 },
    shadow: { name: '粘稠暗影', fight: 4, evade: 4, health: 3, damage: 0, horror: 2 },
    devourer: { name: '深渊吞噬者', fight: 5, evade: 3, health: 8, damage: 3, horror: 2, boss: true }
  };

  const ENCOUNTERS = [
    { key: 'rats', name: '鼠群涌动', text: '一群老鼠从墙缝里涌出来。' },
    { key: 'ghoul', name: '食尸鬼', text: '腐臭的气息逼近，它从阴影里爬出。' },
    { key: 'hands', name: '抓握之手', text: '意志检定（3）：失败受到 1 点伤害。' },
    { key: 'fear', name: '恐惧侵袭', text: '意志检定（4）：失败受到 2 点恐惧。' },
    { key: 'mist', name: '迷雾笼罩', text: '智力检定（3）：失败失去 1 个行动点。' },
    { key: 'ambush', name: '伏击', text: '敏捷检定（3）：失败受到 1 点伤害。' },
    { key: 'whisper', name: '疯狂低语', text: '意志检定（3）：失败受到 1 点恐惧，议程 +1  doom。' },
    { key: 'collapse', name: '地板坍塌', text: '敏捷检定（4）：失败受到 2 点伤害。' },
    { key: 'ritual', name: '黑暗仪式', text: '议程 +1 doom。' },
    { key: 'ghost', name: '游魂', text: '一个模糊的身影穿过墙壁。' }
  ];

  /* ---------- 第二章：午夜狂欢 ---------- */
  const CITY_LOCATIONS = {
    northside: { name: '北区', shroud: 2, clues: 1, x: 18, y: 32, links: ['university', 'downtown'], text: '湿漉漉的街道，煤气灯在雾里发黄。' },
    university: { name: '大学', shroud: 2, clues: 1, x: 40, y: 16, links: ['northside', 'downtown'], text: '图书馆还亮着灯，门缝里透出纸页翻动的声音。' },
    downtown: { name: '市中心', shroud: 2, clues: 1, x: 61, y: 36, links: ['northside', 'university', 'easttown', 'church'], text: '午夜前的最后一批行人匆匆走过十字路口。' },
    easttown: { name: '东城', shroud: 3, clues: 1, x: 82, y: 26, links: ['downtown', 'docks'], text: '仓库区一片死寂，只有铁皮在风里响。' },
    docks: { name: '码头', shroud: 3, clues: 1, x: 86, y: 64, links: ['easttown', 'church'], text: '潮水拍着木桩，雾气里有人影在卸货。' },
    riverside: { name: '河岸', shroud: 3, clues: 1, x: 20, y: 70, links: ['northside', 'church'], text: '河面浮着油光，对岸的钟声传得很慢。' },
    church: { name: '南教堂', shroud: 4, clues: 1, x: 54, y: 82, links: ['downtown', 'docks', 'riverside'], text: '废弃教堂的彩窗被人重新点亮，里面在举行什么。' }
  };

  const CULTISTS = [
    { name: '邪教徒·灰袍', fight: 3, evade: 2, health: 3, damage: 1, horror: 1 },
    { name: '邪教徒·疤脸', fight: 4, evade: 2, health: 4, damage: 2, horror: 1 },
    { name: '邪教徒·低语者', fight: 2, evade: 3, health: 3, damage: 1, horror: 2 },
    { name: '邪教徒·执灯人', fight: 3, evade: 3, health: 3, damage: 1, horror: 1 },
    { name: '邪教徒·掘墓人', fight: 4, evade: 3, health: 4, damage: 1, horror: 2 }
  ];

  /* ---------- 第三章：深渊之下 ---------- */
  const ABYSS_LOCATIONS = {
    mouth: { name: '洞口', shroud: 2, clues: 1, x: 18, y: 68, links: ['tunnel'], text: '海崖下的裂缝，冷风从里面吹出来。' },
    tunnel: { name: '潮湿通道', shroud: 2, clues: 1, x: 38, y: 80, links: ['mouth', 'lake'], sigil: true, text: '岩壁上刻着一圈圈螺旋，摸上去像还在呼吸。' },
    lake: { name: '地下湖', shroud: 3, clues: 1, x: 46, y: 52, links: ['tunnel', 'altar', 'rift'], sigil: true, text: '黑水一直漫到脚边，水面下有东西缓慢移动。' },
    altar: { name: '祭坛', shroud: 4, clues: 1, x: 66, y: 30, links: ['lake', 'rift'], text: '石台上摆着还没干透的供品，烛火是绿色的。' },
    rift: { name: '裂缝', shroud: 3, clues: 1, x: 84, y: 58, links: ['lake', 'altar', 'edge'], sigil: true, text: '地面裂开一道口子，底下传来潮水与心跳的声音。' },
    edge: { name: '深渊边缘', shroud: 5, clues: 0, x: 62, y: 88, links: ['rift'], text: '再往前就没有路了，只有一张正在张开的口。' }
  };

  const ABYSS_ENCOUNTERS = [
    { key: 'larva', name: '幼虫群', text: '细小的白色虫体从石缝里涌出来。' },
    { key: 'faceless', name: '无面信徒', text: '一个没有五官的人站在你面前。' },
    { key: 'shadow', name: '粘稠暗影', text: '影子贴着地面爬过来，带着海水味。' },
    { key: 'tide', name: '潮声', text: '意志检定（3）：失败受到 1 点恐惧。' },
    { key: 'slip', name: '石壁滑落', text: '敏捷检定（3）：失败受到 1 点伤害。' },
    { key: 'dark', name: '无光', text: '智力检定（3）：失败失去 1 个行动点。' },
    { key: 'chant', name: '深处低语', text: '意志检定（4）：失败受到 1 点恐惧，议程 +1 doom。' },
    { key: 'offering', name: '新的供品', text: '议程 +1 doom。' }
  ];

  const SCENARIOS = {
    gathering: {
      id: 'gathering', chapter: '第一章', name: '集结号', start: 'study',
      subtitle: '第一章 · 集结号',
      intro: '雨夜，你站在失踪屋主的房门前。书房里的笔记只写了半句话：“他们在地下室喂养它。”',
      locations: LOCATIONS, encounters: ENCOUNTERS,
      act: [
        { stage: 1, label: '第一幕 · 屋子里的低语', clues: 3, advanceText: '地下室的门开了' },
        { stage: 2, label: '第二幕 · 地下室的门' }
      ],
      agenda: [
        { label: '议程 · 黑暗逼近', doom: 4 },
        { label: '议程 · 房子醒了', doom: 7, lose: true }
      ],
      boss: { key: 'priest', loc: 'cellar', spawnText: '地下室的门开了，食尸鬼祭司在里面等着你' },
      winText: '食尸鬼祭司倒下了。你点燃了房子，在火光里走进雨夜。',
      loseText: '黑暗吞没了整栋房子，你没能撑到天亮。'
    },
    midnight: {
      id: 'midnight', chapter: '第二章', name: '午夜狂欢', start: 'northside',
      subtitle: '第二章 · 午夜狂欢',
      intro: '午夜前，五名戴兜帽的邪教徒散进了阿卡姆的街区。你知道其中三人聚在一起，正在准备一场仪式。找到他们，别让钟声敲完。',
      locations: CITY_LOCATIONS, encounters: ENCOUNTERS,
      act: [
        { stage: 1, label: '第一幕 · 猎杀邪教徒', cultists: 3, advanceText: '邪教徒的血引出了仪式主持者' },
        { stage: 2, label: '第二幕 · 仪式主持者' }
      ],
      agenda: [
        { label: '议程 · 午夜将至', doom: 5 },
        { label: '议程 · 仪式完成', doom: 9, lose: true }
      ],
      boss: { key: 'masked', loc: 'church', spawnText: '南教堂的彩窗亮起，蒙面主持者走上祭坛' },
      winText: '蒙面主持者倒下了。钟声停在午夜前一秒，你带着满身雨水离开教堂。',
      loseText: '钟声敲完，整座城市在雾里安静下来。',
      ritual: { rounds: 8, buffText: '午夜的钟声加快了，主持者变得更强' }
    },
    abyss: {
      id: 'abyss', chapter: '第三章', name: '深渊之下', start: 'mouth',
      subtitle: '第三章 · 深渊之下',
      intro: '仪式的源头在海崖下面。你沿着裂缝潜进去，三座刻着螺旋的仪式节点正在把潮水往上推；再晚一点，深渊里的东西就会爬出来。',
      locations: ABYSS_LOCATIONS, encounters: ABYSS_ENCOUNTERS,
      act: [
        { stage: 1, label: '第一幕 · 熄灭仪式节点', sigils: 3, advanceText: '三座节点熄灭，深渊吞噬者从裂缝里挤出' },
        { stage: 2, label: '第二幕 · 深渊之下' }
      ],
      agenda: [
        { label: '议程 · 潮声逼近', doom: 6 },
        { label: '议程 · 深渊苏醒', doom: 10, lose: true }
      ],
      boss: { key: 'devourer', loc: 'edge', spawnText: '深渊边缘的口张开了，深渊吞噬者从里面爬出来' },
      winText: '深渊吞噬者沉回裂缝。你把最后一座节点砸碎，潮水退回黑暗里。',
      loseText: '潮水漫过洞口，阿卡姆的街道在凌晨被海水吞没。',
      ritual: { rounds: 10, buffText: '潮水涨得更快，深渊吞噬者变得更强' }
    }
  };

  const MIDNIGHT_SPAWNS = [
    { loc: 'university', cultist: 0 },
    { loc: 'downtown', cultist: 1 },
    { loc: 'easttown', cultist: 2 },
    { loc: 'docks', cultist: 3 },
    { loc: 'riverside', cultist: 4 }
  ];

  /* ------------------------------------------------------------
     内容包 / 效果 / 动作 / 剧本钩子注册层
     官方内容或扩展包可以在不修改引擎的情况下注册：
     - cards / investigators / enemies / encounters / scenarios
     - chaosBag / tokenLabels / tokenMods
     - cardEffect / action / hook
     ------------------------------------------------------------ */
  const CARD_EFFECTS = {};
  const ACTION_HANDLERS = {};
  const ENCOUNTER_EFFECTS = {};
  const HOOKS = {};

  function registerCardEffect(name, fn) {
    if (typeof name === 'string' && typeof fn === 'function') CARD_EFFECTS[name] = fn;
  }

  function registerAction(type, fn) {
    if (typeof type === 'string' && typeof fn === 'function') ACTION_HANDLERS[type] = fn;
  }

  function registerEncounterEffect(name, fn) {
    if (typeof name === 'string' && typeof fn === 'function') ENCOUNTER_EFFECTS[name] = fn;
  }

  function registerHook(name, fn) {
    if (typeof name !== 'string' || typeof fn !== 'function') return;
    (HOOKS[name] || (HOOKS[name] = [])).push(fn);
  }

  function runHooks(name, state, payload) {
    const list = HOOKS[name] || [];
    list.forEach((fn) => {
      try { fn(state, payload); } catch (err) { log(state, '扩展钩子 ' + name + ' 失败：' + err.message); }
    });
  }

  function runScenarioHook(state, name, payload) {
    const sc = SCENARIOS[state.scenario];
    if (!sc) return;
    const fn = (sc.hooks && sc.hooks[name]) || (typeof sc[name] === 'function' ? sc[name] : null);
    if (fn) {
      try { fn(state, payload); } catch (err) { log(state, '剧本钩子 ' + name + ' 失败：' + err.message); }
    }
    runHooks('scenario:' + name, state, payload);
  }

  function replaceArray(target, source) {
    target.splice(0, target.length, ...(source || []));
  }

  function replaceObject(target, source) {
    Object.keys(target).forEach((k) => delete target[k]);
    Object.assign(target, source || {});
  }

  function registerContent(pack, opts) {
    if (!pack || typeof pack !== 'object') return false;
    const replace = !!(opts && opts.replace);
    if (pack.cards) {
      if (replace) replaceObject(CARDS, pack.cards);
      else Object.assign(CARDS, pack.cards);
    }
    if (pack.investigators) {
      if (replace) replaceArray(INVESTIGATORS, pack.investigators);
      else pack.investigators.forEach((x) => { if (!INVESTIGATORS.some((y) => y.id === x.id)) INVESTIGATORS.push(x); });
    }
    if (pack.enemies) {
      if (replace) replaceObject(ENEMIES, pack.enemies);
      else Object.assign(ENEMIES, pack.enemies);
    }
    if (pack.encounters) {
      if (replace) replaceArray(ENCOUNTERS, pack.encounters);
      else pack.encounters.forEach((x) => { if (!ENCOUNTERS.some((y) => y.key === x.key && y.name === x.name)) ENCOUNTERS.push(x); });
    }
    if (pack.scenarios) {
      if (replace) replaceObject(SCENARIOS, pack.scenarios);
      else Object.assign(SCENARIOS, pack.scenarios);
    }
    if (pack.locations) Object.assign(LOCATIONS, pack.locations);
    if (pack.chaosBag) replaceArray(CHAOS, pack.chaosBag);
    if (pack.tokenLabels) Object.assign(TOKEN_LABEL, pack.tokenLabels);
    if (pack.tokenMods) Object.assign(TOKEN_MOD, pack.tokenMods);
    return true;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function pickToken(state, rng) {
    const r = rng || Math.random;
    const i = Math.floor(r() * state.chaos.length);
    return state.chaos[i];
  }

  function tokenMod(state, token) {
    const rules = state && state.tokenRules;
    if (rules && typeof rules[token] === 'function') return rules[token](state);
    if (rules && rules[token] != null) return rules[token];
    if (TOKEN_MOD[token] != null) return TOKEN_MOD[token];
    return Number(token);
  }

  function skillTokenMod(state, token) {
    const rules = state && state.tokenRules;
    if (token === 'skull' && !(rules && rules.skull != null)) {
      return -Math.max(1, (state.enemies || []).filter((e) => e.boss).length + 2);
    }
    return tokenMod(state, token);
  }

  function tokenText(token) {
    return TOKEN_LABEL[token] || token;
  }

  function totalStat(state, inv, key) {
    let v = inv.stats[key];
    (inv.assets || []).forEach((a) => { if (CARDS[a] && CARDS[a][key]) v += CARDS[a][key]; });
    return v;
  }

  function log(state, text) {
    state.logs = state.logs || [];
    state.logs.push(text);
    if (state.logs.length > 80) state.logs.shift();
  }

  function locationOf(state, inv) { return state.locations[inv.location]; }
  function enemiesAt(state, locId) { return (state.enemies || []).filter((e) => e.location === locId && e.health > 0); }

  function makeEnemy(state, key, locId) {
    return spawnEnemyDef(state, ENEMIES[key], locId, { key: key });
  }

  function spawnEnemyDef(state, base, locId, extra) {
    const id = 'e' + (state.nextEnemyId = (state.nextEnemyId || 0) + 1);
    const e = Object.assign({
      id: id, key: base.name, name: base.name, fight: base.fight, evade: base.evade,
      health: base.health, maxHealth: base.health, damage: base.damage, horror: base.horror,
      location: locId, engaged: locId === state.inv.location, exhausted: false, boss: !!base.boss
    }, extra || {});
    state.enemies.push(e);
    return e;
  }

  function removeSoakAsset(state, inv, sa) {
    const i = inv.soakAssets.indexOf(sa);
    if (i >= 0) inv.soakAssets.splice(i, 1);
    const a = inv.assets.indexOf(sa.id);
    if (a >= 0) inv.assets.splice(a, 1);
    inv.discard.push(sa.id);
    log(state, sa.name + ' 已耗尽，离场');
  }

  function soakWithAssets(state, inv, type, amount) {
    let left = amount;
    for (let i = 0; i < inv.soakAssets.length && left > 0;) {
      const sa = inv.soakAssets[i];
      const pool = type === 'health' ? sa.health : sa.sanity;
      if (pool <= 0) { i++; continue; }
      const use = Math.min(left, pool);
      if (type === 'health') sa.health -= use;
      else sa.sanity -= use;
      left -= use;
      if (use) log(state, sa.name + ' 替你承受了 ' + use + ' 点' + (type === 'health' ? '伤害' : '恐惧'));
      const spent = (sa.healthMax > 0 && sa.health <= 0) || (sa.sanityMax > 0 && sa.sanity <= 0);
      if (spent) removeSoakAsset(state, inv, sa);
      else i++;
    }
    return left;
  }

  function takeDamage(state, inv, n) {
    if (!n) return;
    let left = n;
    if (inv.ability === 'guardian' && !state.flags.guardianUsed && left > 0) {
      left -= 1;
      state.flags.guardianUsed = true;
      log(state, '退伍保安的本能：本次少受 1 点伤害');
    }
    left = soakWithAssets(state, inv, 'health', left);
    if (left > 0) {
      inv.damage += left;
      if (inv.ability === 'survivor') {
        inv.resources += 1;
        log(state, '流浪者的韧性：受到伤害后获得 1 点资源');
      }
    }
    if (inv.damage >= inv.maxHealth) {
      inv.defeated = true;
      endGame(state, 'lose', '你倒下了。' + (state.loseText || ''));
    }
  }

  function takeHorror(state, inv, n) {
    if (!n) return;
    let left = n;
    left = soakWithAssets(state, inv, 'sanity', left);
    if (left > 0) inv.horror += left;
    if (inv.horror >= inv.maxSanity) {
      inv.defeated = true;
      endGame(state, 'lose', '你的精神崩溃了。' + (state.loseText || ''));
    }
    if (left > 0 && inv.ability === 'agnes' && state.phase !== 'ended') {
      const target = enemiesAt(state, inv.location)[0];
      if (target) { target.health -= 1; log(state, '灵媒的感应让 ' + target.name + ' 受到 1 点伤害'); if (target.health <= 0) killEnemy(state, target); }
    }
  }

  function killEnemy(state, enemy) {
    enemy.health = 0;
    enemy.engaged = false;
    log(state, enemy.name + ' 被击败');
    const inv = state.inv;
    if (inv.ability === 'roland' && state.locations[inv.location] && state.locations[inv.location].clues > 0) {
      state.locations[inv.location].clues -= 1;
      inv.clues += 1;
      log(state, '侦探的直觉：发现 1 个线索');
    }
    const tags = (enemy.tags || []).concat(enemy.cultist ? ['cultist'] : []);
    if (tags.length) {
      state.defeatedTags = state.defeatedTags || {};
      tags.forEach((tag) => { state.defeatedTags[tag] = (state.defeatedTags[tag] || 0) + 1; });
    }
    if (enemy.cultist) {
      state.cultistsFound = (state.cultistsFound || 0) + 1;
      log(state, '已解决 ' + state.cultistsFound + ' 名邪教徒');
      if (state.scenario === 'midnight') {
        state.pendingInterrogation = { name: enemy.name, location: enemy.location, id: enemy.id };
      }
      checkMidnightAct(state);
      if (state.phase === 'ended') return;
    }
    if (enemy.boss) {
      state.act.stage = 3;
      endGame(state, 'win', state.winText || '你活了下来。');
    }
    runScenarioHook(state, 'enemyDefeated', { enemy: enemy, tags: tags });
    runHooks('enemyDefeated', state, { enemy: enemy, tags: tags });
  }

  function checkMidnightAct(state) {
    if (state.scenario !== 'midnight') return;
    if (state.act.stage !== 1) return;
    const need = state.act.cultists || 3;
    if ((state.cultistsFound || 0) < need) return;
    state.act.stage = 2;
    state.act.label = SCENARIOS.midnight.act[1].label;
    const cfg = SCENARIOS.midnight;
    const boss = makeEnemy(state, cfg.boss.key, cfg.boss.loc);
    state.locations[cfg.boss.loc].revealed = true;
    if (state.flags.ritualOver) buffBoss(state, boss);
    log(state, cfg.act[1].label + '：' + cfg.boss.spawnText);
    if (boss) log(state, '仪式主持者现身：' + boss.name);
    runScenarioHook(state, 'actAdvanced', { stage: 2 });
    runHooks('actAdvanced', state, { stage: 2 });
  }

  function advanceAbyssAct(state) {
    if (state.scenario !== 'abyss') return;
    if (state.act.stage !== 1) return;
    state.act.stage = 2;
    state.act.label = SCENARIOS.abyss.act[1].label;
    const cfg = SCENARIOS.abyss;
    const boss = makeEnemy(state, cfg.boss.key, cfg.boss.loc);
    state.locations[cfg.boss.loc].revealed = true;
    if (state.flags.ritualOver) buffBoss(state, boss);
    log(state, cfg.act[1].label + '：' + cfg.boss.spawnText);
    if (boss) log(state, '深渊吞噬者现身：' + boss.name);
    runScenarioHook(state, 'actAdvanced', { stage: 2 });
    runHooks('actAdvanced', state, { stage: 2 });
  }

  function test(state, statKey, difficulty, rng, opts) {
    const inv = state.inv;
    const base = totalStat(state, inv, statKey);
    let bonus = 0;
    if (state.flags.lucky) {
      bonus = 2;
      state.flags.lucky = false;
      log(state, '侥幸：本次检定 +2');
    }
    let token = pickToken(state, rng);
    let mod = skillTokenMod(state, token);
    let total = base + mod + bonus;
    let success = token !== 'auto' && total >= difficulty;
    if (!success && token !== 'auto' && inv.ability === 'wendy' && !state.flags.wendyLuck) {
      state.flags.wendyLuck = true;
      token = pickToken(state, rng);
      mod = skillTokenMod(state, token);
      total = base + mod + bonus;
      success = token !== 'auto' && total >= difficulty;
      log(state, '温蒂的运气：重抽混沌标记');
    }
    state.lastTest = {
      stat: statKey, base: base, token: token, tokenText: tokenText(token),
      mod: mod, bonus: bonus, total: total, difficulty: difficulty, success: success
    };
    return success;
  }

  function startInvestigation(state, inv) {
    state.phase = 'investigation';
    inv.actions = 3;
  }

  function endGame(state, result, text) {
    if (state.phase === 'ended') return;
    state.phase = 'ended';
    state.resolution = { result: result, text: text };
    log(state, text);
    runScenarioHook(state, 'end', { result: result, text: text });
    runHooks('gameEnded', state, { result: result, text: text });
  }

  function applyEncounterOutcome(state, inv, spec) {
    if (!spec) return;
    if (spec.damage) takeDamage(state, inv, Number(spec.damage) || 0);
    if (state.phase === 'ended') return;
    if (spec.horror) takeHorror(state, inv, Number(spec.horror) || 0);
    if (state.phase === 'ended') return;
    if (spec.actions) inv.actions = Math.max(0, inv.actions + Number(spec.actions));
    if (spec.clues) inv.clues += Number(spec.clues);
    if (spec.doom) state.agenda.doom += Number(spec.doom);
    if (spec.log) log(state, spec.log);
  }

  function resolveEncounterSpec(state, card, rng) {
    const spec = card.test;
    const stat = typeof spec === 'string' ? 'will' : spec.stat || 'will';
    const difficulty = typeof spec === 'string' ? 3 : (spec.difficulty || 3);
    const success = test(state, stat, difficulty, rng);
    applyEncounterOutcome(state, state.inv, success ? spec.success : spec.fail);
    return success;
  }

  function spawnEncounter(state, card, rng) {
    const inv = state.inv;
    if (card.effect && ENCOUNTER_EFFECTS[card.effect]) {
      ENCOUNTER_EFFECTS[card.effect](state, card, rng);
      return;
    }
    if (card.test) {
      resolveEncounterSpec(state, card, rng);
      return;
    }
    if (card.key && ENEMIES[card.key] && !ENEMIES[card.key].boss) {
      const e = makeEnemy(state, card.key, inv.location);
      log(state, card.name + ' 出现在' + state.locations[inv.location].name + '，与你交战');
      return;
    }
    if (card.key === 'hands') {
      if (!test(state, 'will', 3, rng)) takeDamage(state, inv, 1);
      return;
    }
    if (card.key === 'fear') {
      if (!test(state, 'will', 4, rng)) takeHorror(state, inv, 2);
      return;
    }
    if (card.key === 'mist') {
      if (!test(state, 'int', 3, rng)) inv.actions = Math.max(0, inv.actions - 1);
      return;
    }
    if (card.key === 'ambush') {
      if (!test(state, 'agi', 3, rng)) takeDamage(state, inv, 1);
      return;
    }
    if (card.key === 'whisper') {
      if (!test(state, 'will', 3, rng)) { takeHorror(state, inv, 1); state.agenda.doom += 1; }
      return;
    }
    if (card.key === 'collapse') {
      if (!test(state, 'agi', 4, rng)) takeDamage(state, inv, 2);
      return;
    }
    if (card.key === 'tide') {
      if (!test(state, 'will', 3, rng)) takeHorror(state, inv, 1);
      return;
    }
    if (card.key === 'slip') {
      if (!test(state, 'agi', 3, rng)) takeDamage(state, inv, 1);
      return;
    }
    if (card.key === 'dark') {
      if (!test(state, 'int', 3, rng)) inv.actions = Math.max(0, inv.actions - 1);
      return;
    }
    if (card.key === 'chant') {
      if (!test(state, 'will', 4, rng)) { takeHorror(state, inv, 1); state.agenda.doom += 1; }
      return;
    }
    if (card.key === 'ritual' || card.key === 'offering') {
      state.agenda.doom += 1;
      log(state, '仪式推进：议程 +1 doom');
    }
  }

  function mythosPhase(state, rng) {
    state.phase = 'mythos';
    const inv = state.inv;
    if (!state.encounter.deck.length) {
      state.encounter.deck = shuffle(state.encounter.discard.splice(0), rng);
    }
    const card = state.encounter.deck.pop();
    state.encounter.discard.push(card);
    state.encounterCurrent = card;
    log(state, '遭遇：' + card.name);
    spawnEncounter(state, card, rng);
    if (state.phase === 'ended') return;
    state.agenda.doom += 1;
    if (state.agenda.doom >= state.agenda.max) advanceAgenda(state);
  }

  function advanceAgenda(state) {
    const stages = state.agenda.stages || [{ doom: 4 }, { doom: 9, lose: true }];
    if (state.agenda.stage < stages.length) {
      state.agenda.stage += 1;
      state.agenda.doom = 0;
      state.agenda.max = stages[state.agenda.stage - 1].doom;
      state.agenda.label = stages[state.agenda.stage - 1].label || state.agenda.label;
      log(state, '议程推进：' + (stages[state.agenda.stage - 1].label || '黑暗更浓了'));
    } else {
      endGame(state, 'lose', state.loseText || '你没能撑到天亮。');
    }
  }

  function enemyPhase(state) {
    state.phase = 'enemy';
    const inv = state.inv;
    (state.enemies || []).forEach((e) => {
      if (e.health <= 0) return;
      if (e.exhausted) {
        e.exhausted = false;
        e.engaged = e.location === inv.location;
        return;
      }
      if (e.location !== inv.location) { e.engaged = false; return; }
      e.engaged = true;
      log(state, e.name + ' 与你交战');
      takeDamage(state, inv, e.damage);
      if (state.phase === 'ended') return;
      takeHorror(state, inv, e.horror);
    });
  }

  function attackOfOpportunity(state) {
    const inv = state.inv;
    const engaged = enemiesAt(state, inv.location).filter((e) => e.engaged && !e.exhausted);
    for (const e of engaged) {
      log(state, e.name + ' 趁机攻击你');
      takeDamage(state, inv, e.damage);
      if (state.phase === 'ended') return true;
      takeHorror(state, inv, e.horror);
      if (state.phase === 'ended') return true;
    }
    return false;
  }

  function upkeep(state, rng) {
    state.phase = 'upkeep';
    const inv = state.inv;
    (state.enemies || []).forEach((e) => { e.exhausted = false; });
    drawCards(state, inv, 1);
    inv.resources += 1;
    inv.actions = 3;
    state.flags.wendyLuck = false;
    state.flags.scholarUsed = false;
    state.flags.guardianUsed = false;
    state.mulliganAvailable = false;
    tickRitual(state);
    state.round += 1;
    state.phase = 'investigation';
    mythosPhase(state, rng);
    if (state.phase !== 'ended') startInvestigation(state, inv);
  }

  function drawCards(state, inv, n) {
    for (let i = 0; i < n; i++) {
      if (!inv.deck.length) {
        if (!inv.discard.length) { log(state, '牌库和弃牌堆都空了'); inv.damage += 1; if (inv.damage >= inv.maxHealth) endGame(state, 'lose', inv.name + ' 倒下了。'); return; }
        inv.deck = shuffle(inv.discard.splice(0), Math.random);
        log(state, '弃牌堆洗回牌库');
      }
      inv.hand.push(inv.deck.pop());
    }
  }

  function spendAction(inv, n) {
    if (inv.actions < n) return false;
    inv.actions -= n;
    return true;
  }

  function playCard(state, inv, index) {
    const id = inv.hand[index];
    const c = CARDS[id];
    if (!c) return { ok: false, msg: '这张牌不存在' };
    if (inv.resources < c.cost) return { ok: false, msg: '资源不够' };
    if (!spendAction(inv, 1)) return { ok: false, msg: '行动点用完了' };
    inv.resources -= c.cost;
    inv.hand.splice(index, 1);
    if (c.type === 'asset') {
      inv.assets.push(id);
      if (c.healthSoak || c.sanitySoak) {
        inv.soakAssets.push({
          id: id, name: c.name,
          health: c.healthSoak || 0, healthMax: c.healthSoak || 0,
          sanity: c.sanitySoak || 0, sanityMax: c.sanitySoak || 0
        });
      }
      log(state, '打出资产：' + c.name);
      return { ok: true };
    }
    const effect = c.effect && CARD_EFFECTS[c.effect];
    if (effect) effect(state, inv, c, id);
    else if (c.effect) log(state, '卡牌效果未注册：' + c.effect);
    inv.discard.push(id);
    return { ok: true };
  }

  function registerDefaultCardEffects() {
    registerCardEffect('healDamage', (state, inv) => {
      inv.damage = Math.max(0, inv.damage - 2);
      log(state, '急救：回复 2 点伤害');
    });
    registerCardEffect('healHorror', (state, inv) => {
      inv.horror = Math.max(0, inv.horror - 2);
      log(state, '镇静：回复 2 点恐惧');
    });
    registerCardEffect('money', (state, inv) => {
      inv.resources += 3;
      log(state, '外快：+3 资源');
    });
    registerCardEffect('draw', (state, inv) => {
      drawCards(state, inv, 2);
      log(state, '速记：抽 2 张');
    });
    registerCardEffect('clue', (state, inv) => {
      const loc = locationOf(state, inv);
      if (loc.clues > 0) { loc.clues -= 1; inv.clues += 1; log(state, '洞察：发现 1 个线索'); }
    });
    registerCardEffect('lucky', (state) => {
      state.flags.lucky = true;
      log(state, '侥幸：下一次检定 +2');
    });
    const hit = (state, inv, dmg, label) => {
      const e = enemiesAt(state, inv.location)[0];
      if (!e) { log(state, '当前地点没有敌人，攻击落空'); return; }
      e.engaged = true;
      e.health -= dmg;
      log(state, label + '：' + e.name + ' 受到 ' + dmg + ' 点伤害');
      if (e.health <= 0) killEnemy(state, e);
    };
    registerCardEffect('smash', (state, inv) => hit(state, inv, 2, '猛击'));
    registerCardEffect('smash3', (state, inv) => hit(state, inv, 3, '狠击'));
    registerCardEffect('evade', (state, inv) => {
      const e = enemiesAt(state, inv.location)[0];
      if (e) { e.exhausted = true; e.engaged = false; log(state, '疾行：摆脱了 ' + e.name); }
    });
  }

  function buffBoss(state, boss) {
    if (!boss) return;
    boss.fight += 1;
    boss.maxHealth += 2;
    boss.health += 2;
    log(state, '仪式加速：' + boss.name + ' 战力 +1、生命 +2');
  }

  function tickRitual(state) {
    const r = state.ritual;
    if (!r || r.done) return;
    r.left = Math.max(0, r.left - 1);
    if (r.left > 0) return;
    r.done = true;
    state.flags.ritualOver = true;
    log(state, '倒计时归零：' + (state.scenario === 'midnight' ? '午夜的钟声敲响了' : '潮水漫上来了'));
    const boss = (state.enemies || []).find((e) => e.boss && e.health > 0);
    if (boss) buffBoss(state, boss);
    else log(state, '仪式加速，接下来现身的首领会更难对付');
  }

  function applySetupOps(state, sc, rng) {
    if (!Array.isArray(sc.setup)) return;
    sc.setup.forEach((op) => {
      if (!op || !op.op) return;
      if (op.op === 'spawnEnemy') {
        const locations = op.locations || (op.loc ? [op.loc] : []);
        const count = Math.max(1, Number(op.count) || locations.length || 1);
        const entries = op.entries || Array.from({ length: count }, (_, i) => ({
          loc: locations[i % Math.max(1, locations.length)],
          enemy: Array.isArray(op.enemy) ? op.enemy[i % op.enemy.length] : op.enemy
        }));
        entries.forEach((entry) => {
          const base = typeof entry.enemy === 'string' ? ENEMIES[entry.enemy] : entry.enemy;
          if (base) spawnEnemyDef(state, base, entry.loc || op.loc, Object.assign({}, op.tags ? { tags: op.tags } : {}, entry.extra || {}));
        });
      } else if (op.op === 'addClues') {
        const loc = state.locations[op.at];
        if (loc) loc.clues += Number(op.amount) || 0;
      } else if (op.op === 'setFlag') {
        state.flags[op.key] = op.value;
      } else if (op.op === 'setAct') {
        Object.assign(state.act, op.value || {});
      } else if (op.op === 'setAgenda') {
        Object.assign(state.agenda, op.value || {});
      } else if (op.op === 'log') {
        log(state, op.text || '');
      }
    });
  }

  function createInitial(players, rng, opts) {
    const invDef = INVESTIGATORS.find((x) => x.id === (opts && opts.investigator)) || INVESTIGATORS[0];
    const sc = SCENARIOS[(opts && opts.scenario)] || SCENARIOS.gathering;
    const locs = {};
    Object.keys(sc.locations).forEach((k) => {
      locs[k] = Object.assign({ id: k, clues: sc.locations[k].clues, clues0: sc.locations[k].clues, revealed: k === sc.start }, clone(sc.locations[k]));
    });
    const deck = shuffle(invDef.deck.slice(), rng);
    const up = (opts && opts.upgrades) || {};
    const stats = clone(invDef.stats);
    ['will', 'int', 'combat', 'agi'].forEach((k) => { stats[k] += Number(up[k]) || 0; });
    const trauma = Math.max(0, Number(opts && opts.trauma) || 0);
    const physicalTrauma = Math.ceil(trauma / 2);
    const mentalTrauma = Math.floor(trauma / 2);
    const inv = {
      id: invDef.id, name: invDef.name, role: invDef.role, color: invDef.color,
      stats: stats, maxHealth: Math.max(1, invDef.health + (Number(up.health) || 0) - physicalTrauma),
      maxSanity: Math.max(1, invDef.sanity + (Number(up.sanity) || 0) - mentalTrauma),
      damage: 0, horror: 0, resources: 5 + (Number(up.resources) || 0), clues: 0, location: sc.start,
      soakHealth: 0, soakSanity: 0, soakAssets: [],
      deck: deck, hand: [], discard: [], assets: [], actions: 3, defeated: false,
      ability: invDef.ability, abilityText: invDef.abilityText
    };
    const state = {
      phase: 'investigation', round: 1, inv: inv, trauma: trauma,
      locations: locs, enemies: [], nextEnemyId: 0,
      chaos: (sc.chaosBag || CHAOS).slice(), tokenRules: sc.tokenRules || {},
      encounter: { deck: shuffle(sc.encounters.slice(), rng), discard: [] },
      scenario: sc.id, scenarioName: sc.name, chapterLabel: sc.chapter, subtitle: sc.subtitle,
      act: {
        stage: 1, clues: sc.act[0].clues || 0, cultists: sc.act[0].cultists || 0,
        sigils: sc.act[0].sigils || 0, label: sc.act[0].label
      },
      agenda: { stage: 1, doom: 0, max: sc.agenda[0].doom, stages: clone(sc.agenda), label: sc.agenda[0].label },
      logs: [sc.intro],
      lastTest: null, encounterCurrent: null,
      flags: { wendyLuck: false, scholarUsed: false, guardianUsed: false, lucky: false },
      mulliganAvailable: true,
      resolution: null, cultistsFound: 0, defeatedTags: {},
      sigilsLeft: sc.act[0].sigils || 0,
      ritual: sc.ritual ? { left: sc.ritual.rounds, max: sc.ritual.rounds, done: false } : null,
      pendingInterrogation: null,
      winText: sc.winText, loseText: sc.loseText,
      hostId: inv.id
    };
    if (Array.isArray(sc.setup)) applySetupOps(state, sc, rng);
    else if (sc.id === 'midnight') {
      MIDNIGHT_SPAWNS.forEach((s) => {
        spawnEnemyDef(state, CULTISTS[s.cultist], s.loc, { cultist: true, key: 'cultist' });
      });
    }
    drawCards(state, inv, 5);
    runScenarioHook(state, 'setup', { scenario: sc });
    runHooks('gameStart', state, { scenario: sc });
    return state;
  }

  function act(state, action, pid, rng) {
    if (!state) return { ok: false, msg: '对局数据异常' };
    if (action.type === 'restart') {
      return {
        ok: true,
        state: createInitial([], rng, {
          investigator: action.investigator || state.inv.id,
          scenario: action.scenario || state.scenario,
          upgrades: action.upgrades || {},
          trauma: action.trauma != null ? action.trauma : state.trauma
        })
      };
    }
    if (state.phase === 'ended') return { ok: false, msg: '这一章已经结束了' };
    const inv = state.inv;
    if (action.type === 'mulligan') {
      if (!state.mulliganAvailable || state.round !== 1 || state.phase !== 'investigation' || inv.actions !== 3) {
        return { ok: false, msg: '只能在开局第一次行动前重抽起手' };
      }
      inv.deck = shuffle(inv.deck.concat(inv.hand), rng);
      inv.hand = [];
      drawCards(state, inv, 5);
      state.mulliganAvailable = false;
      log(state, '重抽起手：换了一组开场手牌');
      return { ok: true, state: state };
    }
    if (ACTION_HANDLERS[action.type]) {
      return ACTION_HANDLERS[action.type](state, action, inv, rng);
    }
    if (action.type === 'advanceAct') {
      if (state.act.stage !== 1) return { ok: false, msg: '密谋已经推进过了' };
      if (!state.act.clues) return { ok: false, msg: '这一章靠行动推进密谋' };
      if (inv.clues < state.act.clues) return { ok: false, msg: '线索还不够' };
      inv.clues -= state.act.clues;
      state.act.stage = 2;
      const sc = SCENARIOS[state.scenario] || SCENARIOS.gathering;
      state.act.label = sc.act[1].label;
      if (sc.boss) {
        const boss = makeEnemy(state, sc.boss.key, sc.boss.loc);
        state.locations[sc.boss.loc].revealed = true;
        log(state, '密谋推进：' + sc.boss.spawnText + '（' + boss.name + '）');
      }
      runScenarioHook(state, 'actAdvanced', { stage: 2 });
      runHooks('actAdvanced', state, { stage: 2 });
      return { ok: true, state: state };
    }

    if (action.type === 'resign') {
      const sc = SCENARIOS[state.scenario] || {};
      if (state.scenario !== 'midnight' && !sc.canResign) return { ok: false, msg: '这一章不能撤退' };
      const found = state.cultistsFound || 0;
      const text = typeof sc.resignText === 'function'
        ? sc.resignText(state)
        : (found === 0
          ? '你撤出了阿卡姆。仪式还在继续，钟声在雾里越敲越近。'
          : '你在午夜前撤出了阿卡姆，带走了 ' + found + ' 名邪教徒的战果。仪式还在继续。');
      endGame(state, 'resign', text);
      return { ok: true, state: state };
    }

    if (action.type === 'interrogate') {
      const p = state.pendingInterrogation;
      if (!p) return { ok: false, msg: '现在没有可以审问的人' };
      const choice = action.choice;
      if (choice === 'ritual') {
        state.agenda.doom = Math.max(0, state.agenda.doom - 1);
        log(state, '审问' + p.name + '：问出了仪式的下一步，议程 doom −1');
      } else if (choice === 'lair') {
        inv.clues += 2;
        log(state, '审问' + p.name + '：问出了据点位置，获得 2 个线索');
      } else if (choice === 'bribe') {
        inv.resources += 2;
        inv.horror = Math.max(0, inv.horror - 1);
        log(state, '审问' + p.name + '：拿到了钱和一句实话，资源 +2，恐惧 −1');
      } else {
        return { ok: false, msg: '审问方式不对' };
      }
      state.pendingInterrogation = null;
      return { ok: true, state: state };
    }

    if (action.type === 'breakSigil') {
      if (state.scenario !== 'abyss') return { ok: false, msg: '这一章没有仪式节点' };
      if (state.act.stage !== 1) return { ok: false, msg: '节点已经全部熄灭了' };
      const loc = state.locations[action.at];
      if (!loc || !loc.sigil || loc.id !== inv.location) return { ok: false, msg: '这里没有能熄灭的节点' };
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
      if (test(state, 'will', 4, rng)) {
        loc.sigil = false;
        state.sigilsLeft = Math.max(0, (state.sigilsLeft || 0) - 1);
        log(state, '熄灭了' + loc.name + '的仪式节点，还剩 ' + state.sigilsLeft + ' 座');
        if (state.sigilsLeft <= 0) advanceAbyssAct(state);
      } else {
        log(state, '仪式节点抗拒你的意志，你受到 1 点恐惧');
        takeHorror(state, inv, 1);
      }
      return { ok: true, state: state };
    }

    if (state.phase !== 'investigation') return { ok: false, msg: '现在不是你的行动阶段' };
    if (!inv.actions && action.type !== 'endTurn') return { ok: false, msg: '行动点用完了，结束回合吧' };

    if (action.type === 'move') {
      const cur = locationOf(state, inv);
      if (cur.links.indexOf(action.to) < 0) return { ok: false, msg: '这里走不过去' };
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
      if (attackOfOpportunity(state)) return { ok: true, state: state };
      inv.location = action.to;
      state.locations[action.to].revealed = true;
      (state.enemies || []).forEach((e) => {
        if (e.location !== inv.location) e.engaged = false;
        else if (!e.exhausted) e.engaged = true;
      });
      log(state, '移动到' + state.locations[action.to].name);
      const engaged = enemiesAt(state, inv.location).filter((e) => e.engaged);
      if (engaged.length) log(state, '进入' + state.locations[action.to].name + '：' + engaged.map((e) => e.name).join('、') + ' 与你交战');
      const toLoc = state.locations[action.to];
      runScenarioHook(state, 'enterLocation', { from: cur, to: toLoc, location: toLoc });
      runHooks('enterLocation', state, { from: cur, to: toLoc, location: toLoc });
      return { ok: true, state: state };
    }

    if (action.type === 'investigate') {
      const loc = locationOf(state, inv);
      if (loc.clues <= 0) return { ok: false, msg: '这里没有线索可查了' };
      const cost = inv.ability === 'scholar' && !state.flags.scholarUsed ? 0 : 1;
      if (!spendAction(inv, cost)) return { ok: false, msg: '行动点不够' };
      if (cost === 0) state.flags.scholarUsed = true;
      if (test(state, 'int', loc.shroud, rng)) {
        loc.clues -= 1;
        inv.clues += 1;
        log(state, '调查成功：在' + loc.name + '发现 1 个线索');
        runScenarioHook(state, 'investigate', { location: loc, success: true });
        runHooks('investigate', state, { location: loc, success: true });
      } else {
        log(state, '调查失败：' + loc.name + ' 没有给出答案');
        runScenarioHook(state, 'investigate', { location: loc, success: false });
        runHooks('investigate', state, { location: loc, success: false });
      }
      return { ok: true, state: state };
    }

    if (action.type === 'fight') {
      const e = (state.enemies || []).find((x) => x.id === action.enemy && x.health > 0);
      if (!e || e.location !== inv.location) return { ok: false, msg: '这里没有这个敌人' };
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
      e.engaged = true;
      if (test(state, 'combat', e.fight, rng)) {
        let dmg = 1;
        (inv.assets || []).forEach((a) => { if (CARDS[a].damage) dmg += CARDS[a].damage; });
        e.health -= dmg;
        log(state, '战斗命中：' + e.name + ' 受到 ' + dmg + ' 点伤害');
        if (e.health <= 0) killEnemy(state, e);
      } else {
        log(state, '战斗失手：' + e.name + ' 没有受伤');
      }
      return { ok: true, state: state };
    }

    if (action.type === 'evade') {
      const e = (state.enemies || []).find((x) => x.id === action.enemy && x.health > 0);
      if (!e || e.location !== inv.location) return { ok: false, msg: '这里没有这个敌人' };
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
      if (test(state, 'agi', e.evade, rng)) {
        e.exhausted = true;
        e.engaged = false;
        log(state, '闪避成功：甩开了 ' + e.name);
      } else {
        e.engaged = true;
        log(state, '闪避失败：' + e.name + ' 缠住了你');
      }
      return { ok: true, state: state };
    }

    if (action.type === 'draw') {
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
      drawCards(state, inv, 1);
      log(state, '抽了 1 张牌');
      return { ok: true, state: state };
    }

    if (action.type === 'resource') {
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
      inv.resources += 1;
      log(state, '拿到 1 点资源');
      return { ok: true, state: state };
    }

    if (action.type === 'play') {
      const r = playCard(state, inv, Number(action.index));
      return r.ok ? { ok: true, state: state } : r;
    }

    if (action.type === 'endTurn') {
      enemyPhase(state);
      if (state.phase === 'ended') return { ok: true, state: state };
      upkeep(state, rng);
      return { ok: true, state: state };
    }

    return { ok: false, msg: '这个操作不支持' };
  }

  registerDefaultCardEffects();

  return {
    INVESTIGATORS: INVESTIGATORS, CARDS: CARDS, LOCATIONS: LOCATIONS,
    ENEMIES: ENEMIES, ENCOUNTERS: ENCOUNTERS, SCENARIOS: SCENARIOS,
    CHAOS: CHAOS, TOKEN_LABEL: TOKEN_LABEL, TOKEN_MOD: TOKEN_MOD,
    createInitial: createInitial, act: act,
    registerContent: registerContent, registerCardEffect: registerCardEffect,
    registerAction: registerAction, registerHook: registerHook,
    registerEncounterEffect: registerEncounterEffect,
    helpers: { totalStat: totalStat, tokenText: tokenText, tokenMod: tokenMod, locationOf: locationOf, enemiesAt: enemiesAt, takeDamage: takeDamage, takeHorror: takeHorror }
  };
})();

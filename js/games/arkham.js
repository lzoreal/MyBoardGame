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
    firstAid: { type: 'event', name: '急救', cost: 2, effect: 'healDamage', text: '回复 2 点伤害。' },
    calm: { type: 'event', name: '镇静剂', cost: 1, effect: 'healHorror', text: '回复 2 点恐惧。' },
    smash: { type: 'event', name: '猛击', cost: 1, effect: 'smash', text: '对当前地点的敌人造成 2 点伤害。' },
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
      deck: ['pistol', 'pistol', 'knife', 'knife', 'flashlight', 'charm', 'ally', 'firstAid', 'firstAid', 'calm', 'smash', 'smash', 'insight', 'insight', 'dash', 'windfall', 'notes', 'notes']
    },
    {
      id: 'scholar', name: '黛西·沃', role: '图书管理员', color: '#8b5cf6',
      stats: { will: 2, int: 5, combat: 2, agi: 3 }, health: 5, sanity: 9, ability: 'scholar',
      abilityText: '每回合第一次调查少花 1 个行动点。',
      deck: ['flashlight', 'flashlight', 'knife', 'charm', 'charm', 'ally', 'firstAid', 'calm', 'calm', 'insight', 'insight', 'insight', 'dash', 'windfall', 'notes', 'notes', 'smash', 'smash']
    },
    {
      id: 'medium', name: '艾格尼丝·贝', role: '灵媒', color: '#e2564a',
      stats: { will: 4, int: 3, combat: 2, agi: 3 }, health: 6, sanity: 8, ability: 'agnes',
      abilityText: '每次受到恐惧后，对当前地点的敌人造成 1 点伤害。',
      deck: ['charm', 'charm', 'knife', 'flashlight', 'ally', 'firstAid', 'calm', 'calm', 'smash', 'smash', 'insight', 'dash', 'dash', 'windfall', 'windfall', 'notes', 'notes', 'pistol']
    },
    {
      id: 'reporter', name: '温蒂·亚当', role: '记者', color: '#2f9e63',
      stats: { will: 3, int: 3, combat: 2, agi: 4 }, health: 7, sanity: 7, ability: 'wendy',
      abilityText: '每回合第一次检定失败时，自动重抽一个混沌标记。',
      deck: ['knife', 'knife', 'flashlight', 'charm', 'ally', 'firstAid', 'calm', 'insight', 'insight', 'dash', 'dash', 'smash', 'windfall', 'windfall', 'notes', 'notes', 'pistol', 'pistol']
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
    masked: { name: '蒙面主持者', fight: 4, evade: 3, health: 6, damage: 2, horror: 2, boss: true }
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
      loseText: '钟声敲完，整座城市在雾里安静下来。'
    }
  };

  const MIDNIGHT_SPAWNS = [
    { loc: 'university', cultist: 0 },
    { loc: 'downtown', cultist: 1 },
    { loc: 'easttown', cultist: 2 },
    { loc: 'docks', cultist: 3 },
    { loc: 'riverside', cultist: 4 }
  ];

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

  function tokenMod(token) {
    if (TOKEN_MOD[token] != null) return TOKEN_MOD[token];
    return Number(token);
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

  function takeDamage(state, inv, n) {
    if (!n) return;
    let left = n;
    if (inv.soakHealth > 0) {
      const use = Math.min(left, inv.soakHealth);
      inv.soakHealth -= use;
      left -= use;
      if (use) log(state, '随从替你承受了 ' + use + ' 点伤害');
    }
    if (left > 0) inv.damage += left;
    if (inv.damage >= inv.maxHealth) {
      inv.defeated = true;
      endGame(state, 'lose', '你倒下了。' + (state.loseText || ''));
    }
  }

  function takeHorror(state, inv, n) {
    if (!n) return;
    let left = n;
    if (inv.soakSanity > 0) {
      const use = Math.min(left, inv.soakSanity);
      inv.soakSanity -= use;
      left -= use;
      if (use) log(state, '随从替你承受了 ' + use + ' 点恐惧');
    }
    if (left > 0) inv.horror += left;
    if (inv.horror >= inv.maxSanity) {
      inv.defeated = true;
      endGame(state, 'lose', '你的精神崩溃了。' + (state.loseText || ''));
    }
    if (left > 0 && inv.ability === 'agnes') {
      const target = enemiesAt(state, inv.location)[0];
      if (target) { target.health -= 1; log(state, '灵媒的感应让 ' + target.name + ' 受到 1 点伤害'); if (target.health <= 0) killEnemy(state, target); }
    }
  }

  function killEnemy(state, enemy) {
    enemy.health = 0;
    log(state, enemy.name + ' 被击败');
    const inv = state.inv;
    if (inv.ability === 'roland' && state.locations[inv.location] && state.locations[inv.location].clues > 0) {
      state.locations[inv.location].clues -= 1;
      inv.clues += 1;
      log(state, '侦探的直觉：发现 1 个线索');
    }
    if (enemy.cultist) {
      state.cultistsFound = (state.cultistsFound || 0) + 1;
      log(state, '已解决 ' + state.cultistsFound + ' 名邪教徒');
      checkMidnightAct(state);
      if (state.phase === 'ended') return;
    }
    if (enemy.boss) {
      state.act.stage = 3;
      endGame(state, 'win', state.winText || '你活了下来。');
    }
  }

  function checkMidnightAct(state) {
    if (state.scenario !== 'midnight') return;
    if (state.act.stage !== 1) return;
    const need = state.act.cultists || 3;
    if ((state.cultistsFound || 0) < need) return;
    state.act.stage = 2;
    const cfg = SCENARIOS.midnight;
    const boss = makeEnemy(state, cfg.boss.key, cfg.boss.loc);
    state.locations[cfg.boss.loc].revealed = true;
    log(state, cfg.act[1].label + '：' + cfg.boss.spawnText);
    if (boss) log(state, '仪式主持者现身：' + boss.name);
  }

  function test(state, statKey, difficulty, rng, opts) {
    const inv = state.inv;
    const base = totalStat(state, inv, statKey);
    let token = pickToken(state, rng);
    let mod = tokenMod(token);
    if (token === 'skull') mod = -Math.max(1, (state.enemies || []).filter((e) => e.boss).length + 2);
    let total = base + mod;
    let success = token !== 'auto' && total >= difficulty;
    if (!success && token !== 'auto' && inv.ability === 'wendy' && !state.flags.wendyLuck) {
      state.flags.wendyLuck = true;
      token = pickToken(state, rng);
      mod = token === 'skull' ? -Math.max(1, (state.enemies || []).filter((e) => e.boss).length + 2) : tokenMod(token);
      total = base + mod;
      success = token !== 'auto' && total >= difficulty;
      log(state, '温蒂的运气：重抽混沌标记');
    }
    state.lastTest = {
      stat: statKey, base: base, token: token, tokenText: tokenText(token),
      mod: mod, total: total, difficulty: difficulty, success: success
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
  }

  function spawnEncounter(state, card, rng) {
    const inv = state.inv;
    if (card.key === 'rats' || card.key === 'ghoul' || card.key === 'ghost') {
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
    if (card.key === 'ritual') {
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
      if (e.location !== inv.location) return;
      if (e.exhausted) { e.exhausted = false; return; }
      log(state, e.name + ' 发起攻击');
      takeDamage(state, inv, e.damage);
      if (state.phase === 'ended') return;
      takeHorror(state, inv, e.horror);
    });
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
      if (c.healthSoak) inv.soakHealth += c.healthSoak;
      if (c.sanitySoak) inv.soakSanity += c.sanitySoak;
      log(state, '打出资产：' + c.name);
      return { ok: true };
    }
    if (c.effect === 'healDamage') { inv.damage = Math.max(0, inv.damage - 2); log(state, '急救：回复 2 点伤害'); }
    if (c.effect === 'healHorror') { inv.horror = Math.max(0, inv.horror - 2); log(state, '镇静：回复 2 点恐惧'); }
    if (c.effect === 'money') { inv.resources += 3; log(state, '外快：+3 资源'); }
    if (c.effect === 'draw') { drawCards(state, inv, 2); log(state, '速记：抽 2 张'); }
    if (c.effect === 'clue') {
      const loc = locationOf(state, inv);
      if (loc.clues > 0) { loc.clues -= 1; inv.clues += 1; log(state, '洞察：发现 1 个线索'); }
    }
    if (c.effect === 'smash') {
      const e = enemiesAt(state, inv.location)[0];
      if (e) { e.health -= 2; log(state, '猛击：' + e.name + ' 受到 2 点伤害'); if (e.health <= 0) killEnemy(state, e); }
    }
    if (c.effect === 'evade') {
      const e = enemiesAt(state, inv.location)[0];
      if (e) { e.exhausted = true; e.engaged = false; log(state, '疾行：摆脱了 ' + e.name); }
    }
    inv.discard.push(id);
    return { ok: true };
  }

  function createInitial(players, rng, opts) {
    const invDef = INVESTIGATORS.find((x) => x.id === (opts && opts.investigator)) || INVESTIGATORS[0];
    const sc = SCENARIOS[(opts && opts.scenario)] || SCENARIOS.gathering;
    const locs = {};
    Object.keys(sc.locations).forEach((k) => {
      locs[k] = Object.assign({ id: k, clues: sc.locations[k].clues, clues0: sc.locations[k].clues, revealed: k === sc.start }, clone(sc.locations[k]));
    });
    const deck = shuffle(invDef.deck.slice(), rng);
    const inv = {
      id: invDef.id, name: invDef.name, role: invDef.role, color: invDef.color,
      stats: clone(invDef.stats), maxHealth: invDef.health, maxSanity: invDef.sanity,
      damage: 0, horror: 0, resources: 5, clues: 0, location: sc.start, soakHealth: 0, soakSanity: 0,
      deck: deck, hand: [], discard: [], assets: [], actions: 3, defeated: false,
      ability: invDef.ability, abilityText: invDef.abilityText
    };
    const state = {
      phase: 'investigation', round: 1, inv: inv,
      locations: locs, enemies: [], nextEnemyId: 0,
      chaos: CHAOS.slice(), encounter: { deck: shuffle(sc.encounters.slice(), rng), discard: [] },
      scenario: sc.id, scenarioName: sc.name, chapterLabel: sc.chapter, subtitle: sc.subtitle,
      act: { stage: 1, clues: sc.act[0].clues || 0, cultists: sc.act[0].cultists || 0, label: sc.act[0].label },
      agenda: { stage: 1, doom: 0, max: sc.agenda[0].doom, stages: clone(sc.agenda), label: sc.agenda[0].label },
      logs: [sc.intro],
      lastTest: null, encounterCurrent: null,
      flags: { wendyLuck: false },
      resolution: null, cultistsFound: 0,
      winText: sc.winText, loseText: sc.loseText,
      hostId: inv.id
    };
    if (sc.id === 'midnight') {
      MIDNIGHT_SPAWNS.forEach((s) => {
        spawnEnemyDef(state, CULTISTS[s.cultist], s.loc, { cultist: true, key: 'cultist' });
      });
    }
    drawCards(state, inv, 5);
    return state;
  }

  function act(state, action, pid, rng) {
    if (!state) return { ok: false, msg: '对局数据异常' };
    if (action.type === 'restart') {
      return { ok: true, state: createInitial([], rng, { investigator: action.investigator || state.inv.id, scenario: action.scenario || state.scenario }) };
    }
    if (state.phase === 'ended') return { ok: false, msg: '这一章已经结束了' };
    const inv = state.inv;
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
      return { ok: true, state: state };
    }

    if (action.type === 'resign') {
      if (state.scenario !== 'midnight') return { ok: false, msg: '这一章不能撤退' };
      const found = state.cultistsFound || 0;
      const text = found === 0
        ? '你撤出了阿卡姆。仪式还在继续，钟声在雾里越敲越近。'
        : '你在午夜前撤出了阿卡姆，带走了 ' + found + ' 名邪教徒的战果。仪式还在继续。';
      endGame(state, 'resign', text);
      return { ok: true, state: state };
    }

    if (state.phase !== 'investigation') return { ok: false, msg: '现在不是你的行动阶段' };
    if (!inv.actions && action.type !== 'endTurn') return { ok: false, msg: '行动点用完了，结束回合吧' };

    if (action.type === 'move') {
      const cur = locationOf(state, inv);
      if (cur.links.indexOf(action.to) < 0) return { ok: false, msg: '这里走不过去' };
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
      inv.location = action.to;
      state.locations[action.to].revealed = true;
      (state.enemies || []).forEach((e) => { if (e.location !== inv.location) e.engaged = false; });
      log(state, '移动到' + state.locations[action.to].name);
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
      } else {
        log(state, '调查失败：' + loc.name + ' 没有给出答案');
      }
      return { ok: true, state: state };
    }

    if (action.type === 'fight') {
      const e = (state.enemies || []).find((x) => x.id === action.enemy && x.health > 0);
      if (!e || e.location !== inv.location) return { ok: false, msg: '这里没有这个敌人' };
      if (!spendAction(inv, 1)) return { ok: false, msg: '行动点不够' };
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

  return {
    INVESTIGATORS: INVESTIGATORS, CARDS: CARDS, LOCATIONS: LOCATIONS,
    ENEMIES: ENEMIES, ENCOUNTERS: ENCOUNTERS, SCENARIOS: SCENARIOS,
    createInitial: createInitial, act: act,
    helpers: { totalStat: totalStat, tokenText: tokenText, locationOf: locationOf, enemiesAt: enemiesAt }
  };
})();

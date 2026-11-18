/* ============================================================
   林中小屋（山中小屋 / 山屋惊魂 3E 官方机制）
   ---------------------------------------------------------
   数据全部来自 content/cabin 的 3E 内容包：
   12 名调查员、46 间房牌 + 5 个起始房、43 张事件、22 张物品、9 张预兆、
   5 张剧本卡、50 个官方剧本。
   已实现：4 条属性（速度/力量/知识/神智）、移动 = 当前速度、推门翻房并旋转拼接、
   抽预兆后按全场预兆数掷骰、总点数 ≥5 闹鬼、最后一张预兆抽出即自动闹鬼、
   剧本卡 + 预兆查剧本、叛徒判定、物理/精神伤害分配、闹鬼后的死亡判定、
   同房间交易/丢弃/拾取、叛徒指挥怪物。
   尚未实现（见评审清单）：3E 的「轨道位置」属性模型、General 伤害的第四条轨道、
   房间放置后强制结束回合、尸体上的物品与掠夺、怪物移动掷骰与特殊规则、
   隐藏信息的服务端隔离。
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

  let CHARS = [];

  /* ---------------- 44 张房间牌 ---------------- */
  let ROOMS = [];
  let TILES = { draw: [], ground: [], upper: [], basement: [] };
  function rebuildRoomTiles() {
    TILES = {
      draw: ROOMS.filter((r) => !r.start),
      ground: ROOMS.filter((r) => r.floors.indexOf('ground') >= 0),
      upper: ROOMS.filter((r) => r.floors.indexOf('upper') >= 0),
      basement: ROOMS.filter((r) => r.floors.indexOf('basement') >= 0)
    };
  }

  let EVENTS = [];

  /* ---------------- 22 张物品牌 ---------------- */
  function I(name, text, opt) { return Object.assign({ name: name, text: text }, opt || {}); }
  let ITEMS = [];

  /* ---------------- 9 张预兆牌（内容包提供） ---------------- */
  function O(name, text, opt) { return Object.assign({ name: name, text: text, omen: true }, opt || {}); }
  let OMENS = [];

  /* ---------------- 剧本卡（官方 3E 共 5 张；「无」只用于事件直接触发，不参与随机） ---------------- */
  const SCENARIO_CARDS = ['待售', '诅咒', '神秘邀请', '离奇失踪', '超自然调查员'];
  let SCENARIOS = [];
  const K = { type: 'killTraitor' };
  const KA = { type: 'killAll' };

  /* ---------------- 内容包（content/cabin/*.json 构建生成） ---------------- */
  function applyContentPacks() {
    const packs = (typeof window !== 'undefined' && window.CABIN_PACKS) ? window.CABIN_PACKS : null;
    if (!packs) return;

    /* 人物：只用 3E 的 12 张，不再混入任何旧角色 */
    CHARS = (packs.characters || [])
      .filter((c) => c && c.key && c.traits)
      .map((c) => {
        const traits = {};
        TRAITS.forEach((t) => {
          const v = (c.traits || {})[t.key] || {};
          const min = Number(v.min), start = Number(v.start), max = Number(v.max);
          traits[t.key] = {
            start: start, min: min, max: max,
            track: Array.isArray(v.track) ? v.track.slice() : null,
            startPos: Number(v.startPos) || 0
          };
        });
        return {
          key: c.key, name: c.name || c.key, role: c.role || '调查员', art: c.art || '?',
          age: Number(c.age) || 0, birthday: c.birthday || '', boardId: c.boardId || '',
          traits: traits, custom: true
        };
      });

    /* 房间：46 间 3E 房牌 + 起始房间，门位按 N/E/S/W */
    ROOMS = (packs.rooms || []).map((r) => ({
      name: r.name,
      floors: [r.floor || 'ground'],
      doors: r.doors || '',
      symbol: r.symbol || null,
      effect: r.effect || null,
      special: r.special || null,
      link: r.link || null,
      text: r.text || '',
      start: !!r.start,
      kind: r.kind || (r.start ? 'start' : '')
    }));
    rebuildRoomTiles();

    EVENTS = (packs.events || []).map((e) => ({
      name: e.name, text: e.text || '', roll: e.roll || null,
      win: e.win || null, lose: e.lose || null, tiers: e.tiers || null,
      effect: e.effect || null, hauntNo: e.hauntNo || 0
    }));
    ITEMS = (packs.items || []).map((it) => Object.assign({}, it));
    OMENS = (packs.omens || []).map((o) => Object.assign({ omen: true }, o));

    /* 剧本：只用官方 3E 的 50 条 */
    SCENARIOS = (packs.scenarios || [])
      .filter((s) => s && s.key && s.trigger)
      .map((s) => ({
        no: Number(s.no) || 0,
        key: s.key,
        name: s.name || s.key,
        story: s.story || '',
        trigger: {
          room: String(s.trigger.room || '').trim(),
          omen: String(s.trigger.omen || '').trim(),
          card: String(s.trigger.card || '').trim(),
          event: String(s.trigger.event || '').trim()
        },
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
      }));
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

  function traitValueOf(p, trait) {
    const tr = p.track && p.track[trait];
    if (!tr) return p.traits[trait] || 0;
    return tr.list[Math.max(0, Math.min(tr.list.length - 1, tr.pos - 1))];
  }

  function gainTrait(st, i, trait, amount, reason) {
    const p = st.players[i];
    if (!p) return;
    const tr = p.track && p.track[trait];
    if (tr) {
      tr.pos = Math.max(1, Math.min(tr.list.length, tr.pos + amount));
      p.traits[trait] = tr.list[tr.pos - 1];
    } else {
      const max = p.max ? p.max[trait] : MAX_TRAIT;
      p.traits[trait] = Math.min(max, p.traits[trait] + amount);
    }
    if (reason) pushLog(st, p.name + ' +' + amount + ' ' + labelOf(trait) + '（' + reason + '）');
  }
  function healTrait(st, i, trait, amount) {
    const p = st.players[i];
    const tr = p && p.track && p.track[trait];
    if (tr) {
      tr.pos = Math.min(tr.startPos, tr.pos + Math.max(0, amount || 1));
      p.traits[trait] = tr.list[tr.pos - 1];
      return;
    }
    if (p) p.traits[trait] = Math.min(p.start[trait], p.traits[trait] + (amount || 1));
  }

  function labelOf(trait) {
    const t = TRAITS.find((x) => x.key === trait);
    return t ? t.label : trait;
  }

  function dropItemsOnDeath(st, i) {
    const p = st.players[i];
    if (!p) return;
    p.corpse = true;
    const room = roomAt(st, p.floor, p.x, p.y);
    pushLog(st, '☠ ' + p.name + ' 倒在「' + (room ? room.name : '原地') + '」，物品与预兆仍放在人物板旁，其他人可以在尸体上搜刮');
  }

  function lootCorpse(st, i, action) {
    const me = st.players[i];
    const dead = st.players[action.target];
    if (!me || !dead || !dead.dead) return { ok: false, msg: '没有这具尸体' };
    if (me.floor !== dead.floor || me.x !== dead.x || me.y !== dead.y) return { ok: false, msg: '必须在尸体所在的房间' };
    if (st.looted) return { ok: false, msg: '本回合已经搜刮过' };
    if (!dead.items || !dead.items.length) return { ok: false, msg: '这具尸体上没有可拿的牌' };
    const idx = action.index === undefined ? 0 : action.index;
    const item = dead.items[idx];
    if (!item) return { ok: false, msg: '没有这张牌' };
    dead.items.splice(idx, 1);
    me.items.push(item);
    st.looted = true;
    pushLog(st, me.name + ' 从 ' + dead.name + ' 的尸体上拿走了「' + item.name + '」');
    return { ok: true, state: st };
  }

  function loseTraitDirect(st, i, trait, amount, reason) {
    const p = st.players[i];
    if (!p) return;
    const tr = p.track && p.track[trait];
    if (tr) {
      tr.pos -= Math.max(0, amount);
      if (st.haunt && st.haunt.active) {
        if (tr.pos <= 0) {
          tr.pos = 0;
          p.traits[trait] = tr.list[0];
          if (!p.dead) {
            p.dead = true;
            dropItemsOnDeath(st, i);
            pushLog(st, '☠ ' + p.name + ' 的' + labelOf(trait) + '走到骷髅，倒下了');
          }
        } else {
          p.traits[trait] = tr.list[tr.pos - 1];
        }
      } else {
        tr.pos = Math.max(1, tr.pos);
        p.traits[trait] = tr.list[tr.pos - 1];
      }
    } else {
      const min = p.min ? p.min[trait] : 1;
      const next = p.traits[trait] - amount;
      if (st.haunt && st.haunt.active) {
        if (next < min) {
          p.traits[trait] = min;
          if (!p.dead) { p.dead = true; dropItemsOnDeath(st, i); }
          pushLog(st, '☠ ' + p.name + ' 的' + labelOf(trait) + '跌破下限，倒下了');
        } else p.traits[trait] = next;
      } else p.traits[trait] = Math.max(min, next);
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

  const DAMAGE_GROUPS = {
    physical: ['might', 'speed'],
    mental: ['known', 'sanity'],
    general: ['might', 'speed', 'known', 'sanity']
  };

  function dropCapacity(p, trait, hauntOn) {
    const tr = p.track && p.track[trait];
    if (tr) return hauntOn ? tr.pos : Math.max(0, tr.pos - 1);
    return Math.max(0, (p.traits[trait] || 0) - ((p.min && p.min[trait]) || 1) + (hauntOn ? 1 : 0));
  }

  function applyDamageSplit(st, i, amount, kind, first, second, parts) {
    const p = st.players[i];
    const hauntOn = !!(st.haunt && st.haunt.active);
    const allowed = DAMAGE_GROUPS[kind] || DAMAGE_GROUPS.physical;
    const alloc = {};
    if (parts && typeof parts === 'object') {
      allowed.forEach((t) => { if (Number(parts[t]) > 0) alloc[t] = Math.floor(Number(parts[t])); });
    } else {
      const a = allowed.indexOf(first) >= 0 ? first : allowed[0];
      const rest = Math.max(0, Math.min(amount, Number(second) || 0));
      alloc[a] = Math.max(0, amount - rest);
      if (rest) {
        const b = allowed.find((t) => t !== a) || a;
        alloc[b] = (alloc[b] || 0) + rest;
      }
    }
    let sum = TRAITS.reduce((n, t) => n + (alloc[t.key] || 0), 0);
    if (sum !== amount) {
      let gap = amount - sum;
      for (const t of allowed) {
        if (gap <= 0) break;
        const cap = dropCapacity(p, t, hauntOn);
        const cur = alloc[t] || 0;
        const take = Math.min(gap, Math.max(0, cap - cur));
        if (take > 0) { alloc[t] = cur + take; gap -= take; }
      }
    }
    for (const t of allowed) {
      let amt = alloc[t] || 0;
      if (!amt) continue;
      const cap = dropCapacity(p, t, hauntOn);
      if (amt > cap) {
        const overflow = amt - cap;
        amt = cap;
        for (const other of allowed) {
          if (overflow <= 0) break;
          if (other === t) continue;
          const ocap = dropCapacity(p, other, hauntOn) - (alloc[other] || 0);
          if (ocap <= 0) continue;
          const move = Math.min(overflow, ocap);
          alloc[other] = (alloc[other] || 0) + move;
          amt += 0;
        }
      }
      if (amt) loseTraitDirect(st, i, t, amt, '伤害分配');
    }
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
    if (ch.boardId && st.players.some((q, k) => k !== i && q.char && CHARS.find((c) => c.key === q.char) && CHARS.find((c) => c.key === q.char).boardId === ch.boardId)) {
      return null;
    }
    p.char = ch.key; p.charName = ch.name; p.role = ch.role; p.art = ch.art;
    p.age = Number(ch.age) || 0;
    p.birthday = ch.birthday || '';
    p.boardId = ch.boardId || '';
    p.traits = {}; p.min = {}; p.max = {}; p.start = {}; p.track = {};
    TRAITS.forEach((t) => {
      const tr = ch.traits[t.key] || {};
      let list = Array.isArray(tr.track) && tr.track.length ? tr.track.slice() : [];
      if (!list.length) {
        list = [tr.min, tr.min, Math.min(tr.max, tr.start), tr.start, tr.start, Math.min(tr.max, tr.start + 1), tr.max];
      }
      const startPos = (tr.startPos && tr.startPos > 0 && tr.startPos <= list.length) ? tr.startPos : (list.indexOf(tr.start) + 1 || Math.ceil(list.length / 2));
      p.track[t.key] = { list: list, pos: startPos, startPos: startPos, skull: 0 };
      p.traits[t.key] = list[startPos - 1];
      p.min[t.key] = list[0];
      p.max[t.key] = list[list.length - 1];
      p.start[t.key] = list[startPos - 1];
    });
    st.charTaken[ch.key] = i;
    return ch;
  }

  function firstByBirthday(st) {
    const now = st.now ? new Date(st.now) : new Date();
    const dayOf = (m, d) => {
      const acc = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
      return acc[m - 1] + d;
    };
    const today = dayOf(now.getMonth() + 1, now.getDate());
    let best = 0, bestGap = 999;
    st.players.forEach((p, i) => {
      const m = /^(\d{2})-(\d{2})$/.exec(p.birthday || '');
      if (!m) return;
      const day = dayOf(Number(m[1]), Number(m[2]));
      const gap = ((day - today) % 365 + 365) % 365;
      if (gap < bestGap) { bestGap = gap; best = i; }
    });
    return best;
  }

  function startPlaying(st, forceIndex) {
    st.phase = 'playing';
    st.turn = Number.isInteger(forceIndex) ? forceIndex : firstByBirthday(st);
    st.rolled = true;
    st.moves = st.players[st.turn] ? st.players[st.turn].traits.speed : 0;
    st.players.forEach((p) => {
      p.floor = 'ground'; p.x = 4; p.y = 5; p.side = 'hero';
    });
    beginTurn(st, st.turn);
    pushLog(st, '选角完成：' + (st.players[st.turn] ? st.players[st.turn].name + ' 的生日距离今天最近，先行动' : '按顺序开始探索'));
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
    st.newItems = [];
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
    if (st.haunt && st.haunt.active) st.haunt.turnUsed = {};
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
      { floor: 'basement', x: 4, y: 6, name: '底层平台', doors: 'NEW', symbol: null, kind: 'landing' }
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
      scenarioChoices: SCENARIO_CARDS.slice(),
      monsters: [], pendingTile: null, pendingDamage: null, pendingRoll: null, pendingEnd: false,
      monsterTurn: null, tradeOffer: null,
      lastCard: null, lastRoll: null, winner: null,
      logs: [opts.skipSelect ? '开局：所有人站在入口大厅' : '开局：先各自挑一个角色']
    };

    if (opts.skipSelect) {
      list.forEach((p, i) => assignCharacter(st, i, CHARS[i % CHARS.length].key));
      startPlaying(st, 0);
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
    st.newItems = st.newItems || [];
    st.newItems.push(card.name);
    return p.items[p.items.length - 1];
  }

  function pickWeapon(st, i, trait, index) {
    const p = st.players[i] || {};
    const list = (p.items || []).filter((it) => it.weapon === trait && !itemActionOf(st, it) &&
      (st.newItems || []).indexOf(it.name) < 0);
    if (index === null || index === undefined) return list.slice().sort((a, b) => (b.attackBonus || 0) - (a.attackBonus || 0))[0] || null;
    const it = (p.items || [])[index];
    if (!it || it.weapon !== trait) return null;
    if (itemActionOf(st, it)) return null;
    if ((st.newItems || []).indexOf(it.name) >= 0) return null;
    return it;
  }

  function applyEffect(st, i, eff, rand) {
    if (!eff) return;
    if (Array.isArray(eff.ops)) {
      eff.ops.forEach((one) => applyEffect(st, i, one, rand));
      if (!eff.gain && !eff.lose && !eff.damage && !eff.heal && !eff.draw) return;
    }
    if (eff.gain) gainTrait(st, i, eff.gain.trait, eff.gain.amount, '卡牌');
    if (eff.lose) loseTraitDirect(st, i, eff.lose.trait, eff.lose.amount, '卡牌');
    if (eff.damage) {
      const dice = eff.damage.dice || 0;
      if (dice) rollDamage(st, i, eff.damage.type, dice, '卡牌', rand);
      else beginDamage(st, i, eff.damage.amount, eff.damage.type, '卡牌');
    }
    if (eff.heal) healTrait(st, i, eff.heal.trait, eff.heal.amount);
    if (eff.draw) {
      const c = drawCard(st, eff.draw === 'omens' ? 'omens' : 'items', rand);
      if (c) {
        if (eff.draw === 'omens') {
          st.omens += 1;
          if (!st.decks.omens.length) st.omenLast = true;
        }
        grantItem(st, i, c);
        pushLog(st, st.players[i].name + ' 额外抽到「' + c.name + '」');
      }
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
    const p = st.players[i];
    if (p && p.side === 'traitor' && room.symbol === 'event') {
      room.resolved = true;
      pushLog(st, p.name + ' 是叛徒，忽略了「' + room.name + '」的事件符号');
      return;
    }
    room.resolved = true;
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
        /* 3E：最后一张预兆被抽出即自动闹鬼 */
        if (!st.decks.omens.length) st.omenLast = true;
        st.lastCard = { kind: 'omen', title: c.name, text: '预兆：' + c.name + '\n' + c.text + '\n' + (st.omenLast ? '这是最后一张预兆，回合结束时必定闹鬼。' : '回合结束时按全场预兆数掷骰闹鬼（≥5 触发）。'), tone: 'bad' };
        pushLog(st, p.name + ' 在' + room.name + '抽到预兆「' + c.name + '」（全场预兆 ' + st.omens + (st.omenLast ? '，已抽完' : '') + '）');
      }
      st.omenThisTurn = true;
      st.moveLocked = true; st.moves = 0;
      return;
    }
    const c = drawCard(st, 'events', rand);
    if (c) {
      st.lastCard = { kind: 'event', title: c.name, text: c.text, tone: (c.roll || c.tiers) ? 'bad' : 'neutral', win: c.win, lose: c.lose, tiers: c.tiers, effect: c.effect };
      st.lastRoll = null;
      pushLog(st, p.name + ' 在' + room.name + '遇到事件「' + c.name + '」');
      if (c.roll && c.roll.hauntRoll) {
        /* 3E 的「闹鬼检定」类事件：闹鬼前掷 6 骰，5+ 直接翻到对应剧本 */
        if (!(st.haunt && st.haunt.active)) {
          const hr = roll(6, rand);
          st.lastRoll = { label: c.name + ' · 闹鬼检定', faces: hr.faces, total: hr.total };
          pushLog(st, c.name + '：闹鬼检定 ' + hr.total + ' 点（5+ 触发）');
          if (hr.total >= 5 && c.hauntNo) {
            const sc = SCENARIOS.find((s) => Number(s.no) === Number(c.hauntNo));
            if (sc) startHaunt(st, i, c.name, room.name, rand, sc);
          }
        }
        applyEffect(st, i, c.effect, rand);
      } else if (c.roll) {
        st.pendingRoll = {
          kind: 'event', index: i, card: c.name, title: c.name, text: c.text,
          room: room.name, trait: c.roll.trait, diff: c.roll.diff,
          win: c.win, lose: c.lose, tiers: c.tiers
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
    const p = st.players[i];
    if (p && p.side === 'traitor' && room.effect.type === 'test') {
      room.effectUsed = true;
      pushLog(st, p.name + ' 是叛徒，忽略了「' + room.name + '」的房间伤害');
      return;
    }
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
    if (pr.kind === 'event') {
      if (Array.isArray(pr.tiers) && pr.tiers.length) {
        const hit = pr.tiers.filter((t) => r.total >= Number(t.at)).sort((a, b) => Number(b.at) - Number(a.at))[0] || pr.tiers[pr.tiers.length - 1];
        applyEffect(st, i, hit.effect, rand);
      } else {
        applyEffect(st, i, r.ok ? pr.win : pr.lose, rand);
      }
    }
    else if (!r.ok) {
      rollDamage(st, i, 'physical', pr.damage || 1, pr.room, rand);
      if (pr.room === '坍塌房间') {
        const landing = roomByName(st, '底层平台');
        if (landing) { me.floor = landing.floor; me.x = landing.x; me.y = landing.y; pushLog(st, me.name + ' 掉到底层平台'); }
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
    const n = st.players.length;
    const aliveIdx = st.players.map((p, i) => i).filter((i) => !st.players[i].dead);
    const dist = (i) => (i - revealer + n) % n;
    const tie = (a, b) => (dist(a) - dist(b)) || (a - b);
    const low = (trait) => aliveIdx.slice().sort((a, b) => (traitVal(st, a, trait) - traitVal(st, b, trait)) || tie(a, b))[0];
    const high = (trait) => aliveIdx.slice().sort((a, b) => (traitVal(st, b, trait) - traitVal(st, a, trait)) || tie(a, b))[0];
    const rule = sc.traitorRule || 'revealer';
    const others = aliveIdx.filter((i) => i !== revealer);
    const pick = (list, fn) => ((list.length ? list : aliveIdx).slice().sort((a, b) => fn(a, b) || tie(a, b))[0]);
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
      const scaled = m.counts ? m.counts[String(st.players.length)] : undefined;
      const count = scaled === undefined ? (m.count || 1) : scaled;
      for (let k = 0; k < count; k++) spawnOneMonster(st, m, rand);
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
    /* 3E：抽到本局最后一张预兆时，不再掷骰，回合结束直接闹鬼 */
    if (st.omenLast) {
      st.lastRoll = { label: '闹鬼（最后一张预兆）', faces: [], total: 0 };
      pushLog(st, '最后一张预兆已被抽出，闹鬼自动开始');
      startHaunt(st, st.turn, st.omenCard, st.omenRoom, rand);
      return;
    }
    /* 3E：骰数 = 全场已抽出的预兆数，总点数 ≥5 触发 */
    const dice = Math.max(1, st.omens);
    const hr = roll(dice, rand);
    st.lastRoll = { label: '闹鬼检定（' + dice + ' 骰）', faces: hr.faces, total: hr.total };
    pushLog(st, '闹鬼检定：' + dice + ' 骰共 ' + hr.total + ' 点，5+ 触发');
    if (hr.total >= 5) startHaunt(st, st.turn, st.omenCard, st.omenRoom, rand);
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
      TRAITS.forEach((t) => healTrait(st, i, t.key, ops.heal));
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
    h.turnUsed = h.turnUsed || {};
    h.gameUsed = h.gameUsed || {};
    const useKey = p.id + '|' + def.key;
    if (def.once === 'game') {
      if (h.gameUsed[useKey]) return { ok: false, msg: '这个行动整局只能做一次' };
    } else if (h.turnUsed[useKey] || h.used[useKey]) {
      return { ok: false, msg: '本回合已经做过这个行动' };
    }
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
    if (def.once === 'game') {
      h.gameUsed[useKey] = true;
      h.used[useKey] = true;
    } else {
      h.turnUsed[useKey] = true;
      h.used[useKey] = true;
    }
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
      st.roomDeck.push(tile);
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

  function regionStillOpen(st, floor, extraRoom) {
    const rooms = st.rooms.filter((r) => r.floor === floor).concat(extraRoom ? [extraRoom] : []);
    const byKey = {};
    rooms.forEach((r) => { byKey[r.x + ',' + r.y] = r; });
    const start = rooms.find((r) => r.kind === 'start' || r.kind === 'landing' || r.kind === 'grandStair') || rooms[0];
    if (!start) return false;
    const seen = {};
    const q = [start];
    seen[start.x + ',' + start.y] = true;
    while (q.length) {
      const cur = q.shift();
      for (const dir of ['N', 'S', 'E', 'W']) {
        if (!doorsHas(cur.doors, dir)) continue;
        const d = DIRS[dir];
        const nx = cur.x + d[0], ny = cur.y + d[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (!byKey[nx + ',' + ny]) return true;
        if (seen[nx + ',' + ny]) continue;
        seen[nx + ',' + ny] = true;
        q.push(byKey[nx + ',' + ny]);
      }
    }
    return false;
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
    if (!regionStillOpen(st, pt.floor, room)) {
      const tries = (pt.buryTries || 0) + 1;
      st.roomDeck.push(tile);
      const alt = tries <= 10 ? drawRoomTile(st, pt.floor, rand) : null;
      if (alt) {
        const legal = [];
        for (let r2 = 0; r2 < 4; r2++) {
          if (doorsHas(rotateDoors(alt.doors, r2), OPP[pt.entry])) legal.push(r2);
        }
        st.pendingTile = { tile: alt, floor: pt.floor, x: pt.x, y: pt.y, entry: pt.entry, cost: pt.cost, legalRots: legal, player: me.id, index: i, buryTries: tries };
        pushLog(st, '「' + tile.name + '」会把这一层封死，埋回牌堆底部，改翻「' + alt.name + '」');
        return { ok: true, pending: true, state: st };
      }
    }
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
      const landing = roomByName(st, '底层平台');
      if (landing) {
        me.floor = landing.floor; me.x = landing.x; me.y = landing.y;
        pushLog(st, me.name + ' 顺着煤槽滑到底层平台');
      }
    }
    if (!st.pendingRoll && !st.pendingDamage && !st.pendingTile) {
      st.moveLocked = true;
      st.moves = 0;
      return endTurn(st, i, rand);
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
      const landing = roomByName(st, '底层平台');
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
      const wpn = pickWeapon(st, i, tr, opts.weaponIndex);
      const ar = roll(traitVal(st, i, tr) + itemTestBonus(st, i, tr) + (wpn ? (wpn.attackBonus || 0) : 0), rand);
      const dr = roll(traitVal(st, st.players.indexOf(targetP), tr), rand);
      if (wpn) markItemAction(st, wpn, 'use');
      markTraitItems(st, i, tr);
      st.lastRoll = { label: me.name + (ranged ? ' 远程攻击 ' : ' 攻击 ') + targetP.name, faces: ar.faces, foeFaces: dr.faces, total: ar.total, foe: dr.total };
      const diff = ar.total - dr.total;
      const physical = (tr === 'might' || tr === 'speed');
      const stolen = null;
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
    if (monster.attackOnly && tr !== monster.attackOnly) return { ok: false, msg: '这个怪物只能用' + labelOf(monster.attackOnly) + '攻击' };
    const same = sameSpot(st, me, monster);
    const ranged = !same && !!opts.distance && hasDistanceWeapon(st, i, tr) && inLineOfSight(st, me, monster);
    if (!same && !ranged) return { ok: false, msg: '不在同一房间，也没有可用的远程武器或视线' };
    if (tr !== 'might' && tr !== 'speed') return { ok: false, msg: '怪物没有这个精神属性，不能这样攻击' };
    if (monster[tr] === undefined) return { ok: false, msg: '怪物没有这个属性' };
    const wpnM = pickWeapon(st, i, tr, opts.weaponIndex);
    const ar = roll(traitVal(st, i, tr) + itemTestBonus(st, i, tr) + (wpnM ? (wpnM.attackBonus || 0) : 0), rand);
    const dr = roll(monster[tr], rand);
    if (wpnM) markItemAction(st, wpnM, 'use');
    markTraitItems(st, i, tr);
    const diff = ar.total - dr.total;
    const monsterDiff = diff - (monster.damageReduce ? 1 : 0);
    st.lastRoll = { label: me.name + (ranged ? ' 远程攻击 ' : ' 攻击 ') + monster.name, faces: ar.faces, foeFaces: dr.faces, total: ar.total, foe: dr.total };
    st.attacked = true;
    if (monsterDiff > 0) {
      if (monster.oneHit) {
        monster.dead = true;
        st.haunt.monsterBanish = (st.haunt.monsterBanish || 0) + 1;
        pushLog(st, me.name + ' 击中 ' + monster.name + '，它当场被消灭（已驱散 ' + st.haunt.monsterBanish + '）');
      } else if (monster.noStun) {
        pushLog(st, me.name + ' 击中 ' + monster.name + '，但它不会僵直，攻击没有效果');
      } else {
        monster.stunned = 1;
        st.haunt.monsterBanish = (st.haunt.monsterBanish || 0) + 1;
        pushLog(st, me.name + (ranged ? ' 远程击中 ' : ' 击中 ') + monster.name + '，它僵直了（已驱散 ' + st.haunt.monsterBanish + '）');
      }
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

  const CABIN_LANDINGS = ['底层平台', '上层平台', '主楼梯'];

  function findMonsterPath(st, m, target) {
    const start = roomAt(st, m.floor, m.x, m.y);
    const goal = roomAt(st, target.floor, target.x, target.y);
    if (!start || !goal) return null;
    if (m.boundRoom && (start.name !== m.boundRoom || goal.name !== m.boundRoom)) return null;
    if (start.floor === goal.floor && start.x === goal.x && start.y === goal.y) return [];
    const q = [{ r: start, path: [] }];
    const seen = { [start.floor + '|' + start.x + ',' + start.y]: true };
    while (q.length) {
      const cur = q.shift();
      for (const dir of ['N', 'S', 'E', 'W']) {
        if (!doorsHas(cur.r.doors, dir)) continue;
        const d = DIRS[dir];
        const nx = cur.r.x + d[0], ny = cur.r.y + d[1];
        const key = cur.r.floor + '|' + nx + ',' + ny;
        if (seen[key]) continue;
        const nr = roomAt(st, cur.r.floor, nx, ny);
        if (!nr) continue;
        seen[key] = true;
        const path = cur.path.concat([{ floor: nr.floor, x: nx, y: ny, room: nr }]);
        if (nr.floor === goal.floor && nx === goal.x && ny === goal.y) return path;
        q.push({ r: nr, path: path });
      }
      if (CABIN_LANDINGS.indexOf(cur.r.name) >= 0) {
        for (const name of CABIN_LANDINGS) {
          const land = roomByName(st, name);
          if (!land || land === cur.r) continue;
          const key = land.floor + '|' + land.x + ',' + land.y;
          if (seen[key]) continue;
          seen[key] = true;
          const path = cur.path.concat([{ floor: land.floor, x: land.x, y: land.y, room: land }]);
          if (land.floor === goal.floor && land.x === goal.x && land.y === goal.y) return path;
          q.push({ r: land, path: path });
        }
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
    st.monsterMoveRolls = {};
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
    st.monsterMoveRolls = st.monsterMoveRolls || {};
    const typeKey = m.key || m.name;
    if (!st.monsterMoveRolls[typeKey]) {
      st.monsterMoveRolls[typeKey] = roll(Math.max(1, m.speed || 1), rand).total;
      pushLog(st, m.name + ' 的移动骰：' + st.monsterMoveRolls[typeKey] + ' 格');
    }
    const maxSteps = Math.max(1, st.monsterMoveRolls[typeKey]);
    const steps = path.slice(0, maxSteps);
    steps.forEach((p) => { m.floor = p.floor; m.x = p.x; m.y = p.y; });
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
    } else if (st.haunt && st.haunt.active && !st.monsterTurn) {
      const soloMode = st.haunt.traitorRule === 'noTraitor' || st.haunt.traitorRule === 'freeForAll';
      if (st.players[i].side === 'traitor' || soloMode) {
        if (beginMonsterTurn(st, i)) return { ok: true, state: st };
      }
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
    applyDamageSplit(st, pd.index, amount, pd.kind, first, second, action.parts);
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
    const giveIdx = Array.isArray(offer.giveIndexes) ? offer.giveIndexes : [offer.index];
    const wantIdx = Array.isArray(offer.wantIndexes) ? offer.wantIndexes : (offer.requestIndex >= 0 ? [offer.requestIndex] : []);
    const giveItems = giveIdx.map((k) => from.items[k]).filter(Boolean);
    const wantItems = wantIdx.map((k) => me.items[k]).filter(Boolean);
    if (giveItems.length !== giveIdx.length) { st.tradeOffer = null; return { ok: false, msg: '发起者已经没有这些牌' }; }
    if (wantItems.length !== wantIdx.length) { st.tradeOffer = null; return { ok: false, msg: '你已经没有这些牌' }; }
    for (const it of giveItems.concat(wantItems)) {
      if (it.noTrade) { st.tradeOffer = null; return { ok: false, msg: '「' + it.name + '」不能交易' }; }
      if (itemActionOf(st, it)) { st.tradeOffer = null; return { ok: false, msg: '「' + it.name + '」本回合已经执行过其他操作' }; }
    }
    from.items = from.items.filter((it) => giveItems.indexOf(it) < 0);
    me.items = me.items.filter((it) => wantItems.indexOf(it) < 0);
    me.items = me.items.concat(giveItems);
    from.items = from.items.concat(wantItems);
    st.traded = true;
    giveItems.concat(wantItems).forEach((it) => markItemAction(st, it, 'trade'));
    st.tradeOffer = null;
    pushLog(st, from.name + ' 与 ' + me.name + ' 完成交易：' +
      (giveItems.length ? from.name + ' 给出 ' + giveItems.map((x) => '「' + x.name + '」').join('、') : '无') + '；' +
      (wantItems.length ? me.name + ' 给出 ' + wantItems.map((x) => '「' + x.name + '」').join('、') : '无'));
    return { ok: true, state: st };
  }

  function makeTradeOffer(st, i, action) {
    if (st.traded) return { ok: false, msg: '本回合已经交易过' };
    if (st.tradeOffer) return { ok: false, msg: '已有待处理的交易' };
    const p = st.players[i];
    if (p.trapped) return { ok: false, msg: '带着「被困」标记不能交易' };
    const other = st.players.find((x) => x.id === action.target);
    if (!other || other.dead || other.floor !== p.floor || other.x !== p.x || other.y !== p.y) return { ok: false, msg: '只能和同房间的人交易' };
    const giveIdx = Array.isArray(action.giveIndexes) && action.giveIndexes.length ? action.giveIndexes.slice() : [action.index];
    const wantIdx = Array.isArray(action.wantIndexes) ? action.wantIndexes.slice() : (action.requestIndex >= 0 && action.requestIndex !== undefined ? [action.requestIndex] : []);
    const giveItems = giveIdx.map((k) => p.items[k]).filter(Boolean);
    if (giveItems.length !== giveIdx.length) return { ok: false, msg: '没有这些牌' };
    for (const item of giveItems) {
      if (item.noTrade) return { ok: false, msg: '「' + item.name + '」不能交易' };
      if (itemActionOf(st, item)) return { ok: false, msg: '「' + item.name + '」本回合已经执行过其他操作' };
    }
    const wantItems = wantIdx.map((k) => other.items[k]).filter(Boolean);
    if (wantItems.length !== wantIdx.length) return { ok: false, msg: '对方没有这些牌' };
    for (const item of wantItems) {
      if (item.noTrade) return { ok: false, msg: '「' + item.name + '」不能交易' };
      if (itemActionOf(st, item)) return { ok: false, msg: '「' + item.name + '」本回合已经执行过其他操作' };
    }
    st.tradeOffer = {
      from: p.id, to: other.id,
      giveIndexes: giveIdx, wantIndexes: wantIdx,
      giveNames: giveItems.map((x) => x.name), wantNames: wantItems.map((x) => x.name),
      index: giveIdx[0], itemName: giveItems[0] ? giveItems[0].name : '',
      requestIndex: wantIdx.length ? wantIdx[0] : -1, requestName: wantItems[0] ? wantItems[0].name : '',
      fromName: p.name, toName: other.name
    };
    pushLog(st, p.name + ' 向 ' + other.name + ' 发起交易：给出 ' +
      (giveItems.length ? giveItems.map((x) => '「' + x.name + '」').join('、') : '无') + '，要 ' +
      (wantItems.length ? wantItems.map((x) => '「' + x.name + '」').join('、') : '无'));
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
      if (action.type === 'scenario') {
        if (SCENARIO_CARDS.indexOf(action.card) < 0) return { ok: false, msg: '没有这张剧本卡' };
        st.scenarioCard = action.card;
        pushLog(st, '剧本卡选定：' + action.card);
        return { ok: true, state: st };
      }
      if (action.type === 'pick') {
        if (st.charTaken[action.char] !== undefined) return { ok: false, msg: '这个角色已经被选走' };
        const picked = assignCharacter(st, i, action.char);
        if (!picked) return { ok: false, msg: '这块双面人物板的另一面已经被选走' };
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
      case 'lootCorpse': return lootCorpse(st, i, action);
      case 'useItem': {
        const p = st.players[i];
        const idx = action.index;
        const item = p.items[idx];
        if (!item) return { ok: false, msg: '没有这件物品' };
        if (!item.use) return { ok: false, msg: '这件物品没有主动效果' };
        if (itemActionOf(st, item)) return { ok: false, msg: '这件物品本回合已经执行过其他操作' };
        if (item.use.type === 'heal') healTrait(st, i, item.use.trait, item.use.amount || 1);
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
    ROOMS: ROOMS, EVENTS: EVENTS, ITEMS: ITEMS, OMENS: OMENS, SCENARIO_CARDS: SCENARIO_CARDS,
    createInitial: createInitial, pickScenario: pickScenario, act: act,
    helpers: {
      roomAt: roomAt, roomByName: roomByName, labelOf: labelOf, pct: pct,      itemTestBonus: itemTestBonus, armorValue: armorValue, heroItemCount: heroItemCount,
      maybeEventHaunt: maybeEventHaunt, checkWin: checkWin, startHaunt: startHaunt,
      rotateDoors: rotateDoors, rollDamage: rollDamage, inLineOfSight: inLineOfSight,
      hasDistanceWeapon: hasDistanceWeapon,
      countTokens: countTokens, tokensByFloor: tokensByFloor, addToken: addToken,
      applyDamageSplit: applyDamageSplit, loseTraitDirect: loseTraitDirect, gainTrait: gainTrait,
      healTrait: healTrait, firstByBirthday: firstByBirthday, chooseTraitor: chooseTraitor
    }
  };
})();

#!/usr/bin/env node
/*
 * 扫描 content/cabin，校验角色包和剧本包，生成 js/games/cabin-packs.js。
 * 用法：node tools/build-cabin-packs.mjs
 * 线上由 .github/workflows/cabin-packs.yml 在 push 后自动执行。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(ROOT, 'content', 'cabin');
const OUT = path.join(ROOT, 'js', 'games', 'cabin-packs.js');
const TRAITS = ['speed', 'might', 'known', 'sanity'];
const TRAITOR_RULES = ['revealer', 'lowestSanity', 'highestMight', 'highestSpeed', 'lowestSpeed', 'highestKnowledge', 'lowestMight', 'omenHolder',
  'hiddenTraitor', 'noTraitor', 'freeForAll', 'leftOfRevealer', 'oldest', 'mostOmens', 'seeEvent'];
const GOAL_TYPES = ['killTraitor', 'killAll', 'survive', 'ritual', 'escape', 'hunt', 'tokens', 'rig', 'evidence', 'treasure', 'placeTokens', 'allOf'];

function fail(file, message) {
  throw new Error((file ? file + ': ' : '') + message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
  } catch (err) {
    fail(file, 'JSON 解析失败：' + err.message);
  }
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.json') && !name.startsWith('_'))
    .sort()
    .map((name) => path.join(dir, name));
}

function itemsOf(raw, field, file) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw[field])) return raw[field];
  if (raw && typeof raw === 'object') return [raw];
  fail(file, '内容必须是对象、数组，或带 "' + field + '" 数组的对象');
}

function requireString(value, label, file, max = 80) {
  if (typeof value !== 'string' || !value.trim()) fail(file, label + ' 必须是非空字符串');
  if (value.trim().length > max) fail(file, label + ' 超过 ' + max + ' 个字符');
  return value.trim();
}

function integer(value, label, file, min = 0, max = 999) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(file, label + ' 必须是 ' + min + '–' + max + ' 的整数');
  return n;
}

function validateCharacter(c, file, seen) {
  if (!c || typeof c !== 'object') fail(file, '角色必须是对象');
  const key = requireString(c.key, 'key', file, 40);
  if (!/^[A-Za-z0-9_-]+$/.test(key)) fail(file, 'key 只能包含字母、数字、下划线、连字符');
  if (seen.has(key)) fail(file, '角色 key 重复：' + key);
  seen.add(key);
  const name = requireString(c.name, 'name', file);
  const role = requireString(c.role, 'role', file);
  const art = requireString(c.art, 'art', file, 2);
  if (Array.from(art).length > 2) fail(file, 'art 最多 2 个字符');
  if (!c.traits || typeof c.traits !== 'object') fail(file, '缺少 traits');
  const traits = {};
  TRAITS.forEach((t) => {
    const v = c.traits[t];
    if (!v || typeof v !== 'object') fail(file, '缺少 traits.' + t);
    const min = integer(v.min, 'traits.' + t + '.min', file, 1, 10);
    const max = integer(v.max, 'traits.' + t + '.max', file, 1, 10);
    const start = integer(v.start, 'traits.' + t + '.start', file, 1, 10);
    if (min > max) fail(file, 'traits.' + t + '.min 不能大于 max');
    if (start < min || start > max) fail(file, 'traits.' + t + '.start 必须在 min–max 之间');
    let track = null;
    let startPos = 0;
    if (Array.isArray(v.track)) {
      if (v.track.length < 4 || v.track.length > 10) fail(file, 'traits.' + t + '.track 必须是 4–10 个数');
      track = v.track.map((n, k) => integer(n, 'traits.' + t + '.track[' + k + ']', file, 1, 10));
      for (let k = 1; k < track.length; k += 1) {
        if (track[k] < track[k - 1]) fail(file, 'traits.' + t + '.track 必须从低到高');
      }
      if (track[0] !== min || track[track.length - 1] !== max) fail(file, 'traits.' + t + '.track 首尾必须等于 min/max');
      startPos = track.indexOf(start) + 1;
      if (startPos <= 0) fail(file, 'traits.' + t + '.start 必须出现在 track 里');
    } else {
      startPos = 1;
    }
    traits[t] = { start, min, max, track, startPos };
  });
  const age = c.age === undefined ? 0 : integer(c.age, 'age', file, 1, 99);
  const birthday = typeof c.birthday === 'string' && /^\d{2}-\d{2}$/.test(c.birthday) ? c.birthday : '';
  const boardId = typeof c.boardId === 'string' ? c.boardId : '';
  return { key, name, role, art, age, birthday, boardId, traits, custom: true };
}

function validateGoal(goal, label, file) {
  if (!goal || typeof goal !== 'object') fail(file, label + ' 必须是对象');
  if (GOAL_TYPES.indexOf(goal.type) < 0) fail(file, label + '.type 不支持：' + goal.type);
  if (goal.type === 'ritual') {
    requireString(goal.room, label + '.room', file);
    if (TRAITS.indexOf(goal.trait) < 0) fail(file, label + '.trait 不支持：' + goal.trait);
    integer(goal.diff, label + '.diff', file, 1, 10);
    integer(goal.need, label + '.need', file, 1, 20);
  }
  if (goal.type === 'escape') {
    requireString(goal.room, label + '.room', file);
    integer(goal.need, label + '.need', file, 1, 20);
  }
  if (goal.type === 'tokens') {
    requireString(goal.token, label + '.token', file, 20);
    integer(goal.need, label + '.need', file, 1, 30);
  }
  if (goal.type === 'rig') {
    requireString(goal.token, label + '.token', file, 20);
    integer(goal.need, label + '.need', file, 1, 30);
  }
  if (goal.type === 'survive' || goal.type === 'hunt') integer(goal.need, label + '.need', file, 1, 30);
  if (goal.type === 'evidence' || goal.type === 'treasure') integer(goal.need, label + '.need', file, 1, 30);
  if (goal.type === 'placeTokens') {
    if (!Array.isArray(goal.pairs) || !goal.pairs.length) fail(file, label + '.pairs 必须是非空数组');
    goal.pairs.forEach((it, k) => {
      requireString(it.token, label + '.pairs[' + k + '].token', file);
      requireString(it.room, label + '.pairs[' + k + '].room', file);
    });
    integer(goal.need, label + '.need', file, 1, 30);
  }
  if (goal.type === 'allOf') {
    if (!Array.isArray(goal.goals) || !goal.goals.length) fail(file, label + '.goals 必须是非空数组');
    goal.goals.forEach((g, k) => validateGoal(g, label + '.goals[' + k + ']', file));
  }
  return goal;
}

function validateActions(list, label, file) {
  if (!Array.isArray(list)) fail(file, label + ' 必须是数组');
  return list.map((a, i) => {
    if (!a || typeof a !== 'object') fail(file, label + '[' + i + '] 必须是对象');
    const key = requireString(a.key, label + '[' + i + '].key', file, 40);
    if (!/^[A-Za-z0-9_-]+$/.test(key)) fail(file, label + '[' + i + '].key 只能包含字母、数字、下划线、连字符');
    const name = requireString(a.name, label + '[' + i + '].name', file, 40);
    const trait = a.trait === undefined ? 'known' : a.trait;
    if (TRAITS.indexOf(trait) < 0) fail(file, label + '[' + i + '].trait 必须是属性 key');
    const where = a.where === undefined ? 'any' : a.where;
    if (['any', 'room', 'symbol', 'floors'].indexOf(where) < 0) fail(file, label + '[' + i + '].where 不支持：' + where);
    if (where === 'room') requireString(a.room, label + '[' + i + '].room', file);
    if (Array.isArray(a.tiers)) {
      a.tiers.forEach((t, k) => {
        if (t.at === undefined) fail(file, label + '[' + i + '].tiers[' + k + '].at 必填');
      });
    }
    return {
      key, name, trait, where, room: a.room, symbol: a.symbol,
      floors: Array.isArray(a.floors) ? a.floors : undefined,
      once: a.once === 'game' ? 'game' : 'turn',
      dead: !!a.dead,
      side: a.side === 'traitor' || a.side === 'hero' ? a.side : undefined,
      tiers: a.tiers, miss: a.miss
    };
  });
}

function validateMonster(m, label, file) {
  if (!m || typeof m !== 'object') fail(file, label + ' 必须是对象');
  const name = requireString(m.name, label + '.name', file, 40);
  const key = typeof m.key === 'string' && m.key.trim() ? m.key.trim() : name;
  const count = integer(m.count === undefined ? 1 : m.count, label + '.count', file, 1, 20);
  const speed = integer(m.speed, label + '.speed', file, 1, 10);
  const might = integer(m.might, label + '.might', file, 1, 10);
  const attack = m.attack === undefined ? 'might' : m.attack;
  if (TRAITS.indexOf(attack) < 0) fail(file, label + '.attack 必须是属性 key');
  const noAttack = m.noAttack === true || /不可攻击|不可被攻击|不能攻击/.test(m.rule || '');
  const boundMatch = /不能离开(.+?)(；|;|。|$)/.exec(m.rule || '');
  const boundRoom = boundMatch ? boundMatch[1].trim() : '';
  let counts = null;
  if (m.counts && typeof m.counts === 'object') {
    counts = {};
    ['3', '4', '5', '6'].forEach((k) => {
      if (m.counts[k] !== undefined) counts[k] = integer(m.counts[k], label + '.counts.' + k, file, 0, 20);
    });
  }
  return { key, name, count, speed, might, attack, noAttack, counts, boundRoom };
}

function validateScenario(s, file, seen) {
  if (!s || typeof s !== 'object') fail(file, '剧本必须是对象');
  const key = requireString(s.key, 'key', file, 50);
  if (!/^[A-Za-z0-9_-]+$/.test(key)) fail(file, 'key 只能包含字母、数字、下划线、连字符');
  if (seen.has(key)) fail(file, '剧本 key 重复：' + key);
  seen.add(key);
  const name = requireString(s.name, 'name', file);
  const story = typeof s.story === 'string' ? s.story.trim() : '';
  if (!s.trigger || typeof s.trigger !== 'object') fail(file, '缺少 trigger（至少写 room 或 omen）');
  const room = typeof s.trigger.room === 'string' ? s.trigger.room.trim() : '';
  const omen = typeof s.trigger.omen === 'string' ? s.trigger.omen.trim() : '';
  const card = typeof s.trigger.card === 'string' ? s.trigger.card.trim() : '';
  const event = typeof s.trigger.event === 'string' ? s.trigger.event.trim() : '';
  if (!room && !omen && !card && !event) fail(file, 'trigger 至少要指定 room、omen、card 或 event；可用 "*" 表示任意');
  const trigger = { room, omen };
  if (card) trigger.card = card;
  if (event) trigger.event = event;
  const rule = s.traitorRule === undefined ? 'revealer' : s.traitorRule;
  if (TRAITOR_RULES.indexOf(rule) < 0) fail(file, 'traitorRule 不支持：' + rule);
  const heroGoal = validateGoal(s.heroGoal, 'heroGoal', file);
  const traitorGoal = validateGoal(s.traitorGoal || { type: 'killAll' }, 'traitorGoal', file);
  const heroGoalText = requireString(s.heroGoalText, 'heroGoalText', file, 200);
  const traitorGoalText = requireString(s.traitorGoalText, 'traitorGoalText', file, 200);
  const priority = s.priority === undefined ? 10 : integer(s.priority, 'priority', file, -999, 999);
  let monsters;
  if (s.monsters !== undefined) {
    if (!Array.isArray(s.monsters)) fail(file, 'monsters 必须是数组');
    monsters = s.monsters.map((m, i) => validateMonster(m, 'monsters[' + i + ']', file));
  }
  return {
    no: s.no === undefined ? 0 : integer(s.no, 'no', file, 0, 9999),
    key, name, story, trigger: trigger, traitorRule: rule,
    heroGoal, traitorGoal, heroGoalText, traitorGoalText,
    priority, monsters,
    actions: s.actions === undefined ? undefined : validateActions(s.actions, 'actions', file),
    monster: s.monster === undefined ? undefined : Object.assign(validateMonster(s.monster, 'monster', file),
      { sanity: s.monster.sanity === undefined ? undefined : integer(s.monster.sanity, 'monster.sanity', file, 1, 10),
        known: s.monster.known === undefined ? undefined : integer(s.monster.known, 'monster.known', file, 1, 10),
        rule: typeof s.monster.rule === 'string' ? s.monster.rule : undefined,
        noStun: /不可击晕|不被击晕|不会击晕|不僵直|不可僵直/.test(s.monster.rule || ''),
        oneHit: /受到任何伤害.*消灭|受到.*伤害.*消灭|被消灭而不是击晕|受伤.*即.*消灭/.test(s.monster.rule || ''),
        ignoreDoors: /无视门|穿门|不受门/.test(s.monster.rule || ''),
        damageReduce: /伤害减免|减伤|所有伤害 -1|减少.*伤害/.test(s.monster.rule || ''),
        attackOnly: (() => {
          const m2 = /只能被(力量|速度|知识|神智)攻击/.exec(s.monster.rule || '');
          return m2 ? ({ 力量: 'might', 速度: 'speed', 知识: 'known', 神智: 'sanity' })[m2[1]] : '';
        })(),
        endTurn: s.monster.endTurn }),
    flipRooms: !!s.flipRooms,
    dimension: !!s.dimension,
    custom: true
  };
}

function validateEvent(e, file, seen) {
  if (!e || typeof e !== 'object') fail(file, '事件必须是对象');
  const key = requireString(e.key, 'key', file, 60);
  if (seen.has(key)) fail(file, '事件 key 重复：' + key);
  seen.add(key);
  const name = requireString(e.name, 'name', file);
  const text = typeof e.text === 'string' ? e.text.trim() : '';
  let roll;
  if (e.roll) {
    const trait = e.roll.trait === 'none' ? 'none' : e.roll.trait;
    if (trait !== 'none' && TRAITS.indexOf(trait) < 0) fail(file, 'roll.trait 不支持：' + e.roll.trait);
    roll = { trait, diff: integer(e.roll.diff, 'roll.diff', file, 1, 10), hauntRoll: !!e.roll.hauntRoll };
  }
  let tiers;
  if (e.tiers !== undefined) {
    if (!Array.isArray(e.tiers) || !e.tiers.length) fail(file, 'tiers 必须是非空数组');
    tiers = e.tiers.map((t, i) => ({
      at: integer(t.at, 'tiers[' + i + '].at', file, 0, 20),
      effect: t.effect && typeof t.effect === 'object' ? t.effect : {}
    }));
  }
  return {
    key, name, text, roll, tiers, effect: e.effect || undefined,
    win: e.win || undefined, lose: e.lose || undefined,
    hauntNo: e.hauntNo === undefined ? 0 : integer(e.hauntNo, 'hauntNo', file, 0, 99)
  };
}

function validateItem(it, file, seen) {
  if (!it || typeof it !== 'object') fail(file, '物品必须是对象');
  const key = requireString(it.key, 'key', file, 60);
  if (seen.has(key)) fail(file, '物品 key 重复：' + key);
  seen.add(key);
  const name = requireString(it.name, 'name', file);
  const text = typeof it.text === 'string' ? it.text.trim() : '';
  const out = { key, name, text };
  ['weapon'].forEach((f) => { if (it[f] !== undefined) { if (TRAITS.indexOf(it[f]) < 0) fail(file, f + ' 必须是属性 key'); out[f] = it[f]; } });
  ['attackBonus', 'testBonus', 'armor'].forEach((f) => { if (it[f] !== undefined) out[f] = integer(it[f], f, file, -5, 9); });
  if (it.testTrait !== undefined) { if (TRAITS.indexOf(it.testTrait) < 0) fail(file, 'testTrait 必须是属性 key'); out.testTrait = it.testTrait; }
  if (it.use !== undefined) out.use = it.use;
  ['noSteal', 'noDrop', 'noTrade', 'distance'].forEach((f) => { if (it[f]) out[f] = true; });
  return out;
}

function validateOmen(o, file, seen) {
  if (!o || typeof o !== 'object') fail(file, '预兆必须是对象');
  const key = requireString(o.key, 'key', file, 60);
  if (seen.has(key)) fail(file, '预兆 key 重复：' + key);
  seen.add(key);
  const name = requireString(o.name, 'name', file);
  const out = { key, name, text: typeof o.text === 'string' ? o.text.trim() : '', omen: true };
  if (o.delta) {
    if (TRAITS.indexOf(o.delta.trait) < 0) fail(file, 'delta.trait 必须是属性 key');
    out.delta = { trait: o.delta.trait, amount: integer(o.delta.amount, 'delta.amount', file, -5, 5) };
  }
  if (o.weapon !== undefined) { if (TRAITS.indexOf(o.weapon) < 0) fail(file, 'weapon 必须是属性 key'); out.weapon = o.weapon; }
  if (o.attackBonus !== undefined) out.attackBonus = integer(o.attackBonus, 'attackBonus', file, 0, 9);
  return out;
}

function validateRoom(r, file, seen) {
  if (!r || typeof r !== 'object') fail(file, '房间必须是对象');
  const key = requireString(r.key, 'key', file, 60);
  if (seen.has(key)) fail(file, '房间 key 重复：' + key);
  seen.add(key);
  const name = requireString(r.name, 'name', file);
  const floor = r.floor;
  if (['basement', 'ground', 'upper'].indexOf(floor) < 0) fail(file, 'floor 不支持：' + floor);
  if (!/^[NESW]*$/.test(r.doors || '') || (r.doors || '').length > 4) fail(file, 'doors 只能是 N/E/S/W 组合');
  const symbol = r.symbol || null;
  if (symbol && ['event', 'item', 'omen'].indexOf(symbol) < 0) fail(file, 'symbol 不支持：' + symbol);
  return {
    key, name, en: r.en || '', floor, doors: r.doors || '', symbol,
    text: r.text || '', effect: r.effect || undefined, special: r.special || undefined,
    link: r.link || undefined, start: !!r.start, kind: r.kind || undefined
  };
}

function build() {
  const charDir = path.join(CONTENT, 'characters');
  const scenarioDir = path.join(CONTENT, 'scenarios');
  const roomDir = path.join(CONTENT, 'rooms');
  const cardDir = path.join(CONTENT, 'cards');
  const characters = [];
  const scenarios = [];
  const rooms = [];
  const events = [];
  const items = [];
  const omens = [];
  const charKeys = new Set();
  const scenarioKeys = new Set();
  const roomKeys = new Set();
  const eventKeys = new Set();
  const itemKeys = new Set();
  const omenKeys = new Set();

  listJson(charDir).forEach((file) => {
    const raw = readJson(file);
    itemsOf(raw, 'characters', file).forEach((c) => characters.push(validateCharacter(c, file, charKeys)));
  });
  listJson(scenarioDir).filter((file) => !/official-3e-rules\.json$/i.test(file)).forEach((file) => {
    const raw = readJson(file);
    itemsOf(raw, 'scenarios', file).forEach((s) => scenarios.push(validateScenario(s, file, scenarioKeys)));
  });
  listJson(roomDir).forEach((file) => {
    const raw = readJson(file);
    itemsOf(raw, 'rooms', file).forEach((r) => rooms.push(validateRoom(r, file, roomKeys)));
  });
  listJson(cardDir).forEach((file) => {
    if (/event/i.test(file)) {
      itemsOf(readJson(file), 'events', file).forEach((e) => events.push(validateEvent(e, file, eventKeys)));
    } else if (/item/i.test(file)) {
      itemsOf(readJson(file), 'items', file).forEach((it) => items.push(validateItem(it, file, itemKeys)));
    } else if (/omen/i.test(file)) {
      itemsOf(readJson(file), 'omens', file).forEach((o) => omens.push(validateOmen(o, file, omenKeys)));
    }
  });

  const data = { characters, scenarios, rooms, events, items, omens };
  const officialFile = path.join(scenarioDir, 'official-3e-rules.json');
  if (fs.existsSync(officialFile)) {
    const official = readJson(officialFile);
    scenarios.forEach((s) => {
      const o = official[String(s.no)];
      if (!o) return;
      s.official = {
        title: o.title || '',
        heroPage: o.heroPage,
        traitorPage: o.traitorPage,
        freeForAll: !!o.freeForAll,
        hero: o.hero || null,
        traitor: o.traitor || null,
        zh: o.zh || null,
      };
    });
  }
  const body = '/* AUTO-GENERATED by tools/build-cabin-packs.mjs. Do not edit by hand. */\n' +
    'window.CABIN_PACKS = ' + JSON.stringify(data, null, 2) + ';\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body, 'utf8');
  console.log('Cabin packs: ' + characters.length + ' character(s), ' + scenarios.length + ' scenario(s), ' +
    rooms.length + ' room(s), ' + events.length + ' event(s), ' + items.length + ' item(s), ' + omens.length + ' omen(s) -> ' + path.relative(ROOT, OUT));
}

build();

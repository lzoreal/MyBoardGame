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
const TRAITOR_RULES = ['revealer', 'lowestSanity', 'highestMight', 'lowestSpeed', 'highestKnowledge', 'lowestMight', 'omenHolder'];
const GOAL_TYPES = ['killTraitor', 'killAll', 'survive', 'ritual', 'escape', 'hunt'];

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
    traits[t] = { start, min, max };
  });
  return { key, name, role, art, traits, custom: true };
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
  if (goal.type === 'survive' || goal.type === 'hunt') integer(goal.need, label + '.need', file, 1, 30);
  return goal;
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
  return { key, name, count, speed, might, attack };
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
  if (!room && !omen) fail(file, 'trigger 至少要指定 room 或 omen；可用 "*" 表示任意');
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
    key, name, story, trigger: { room, omen }, traitorRule: rule,
    heroGoal, traitorGoal, heroGoalText, traitorGoalText,
    priority, monsters, custom: true
  };
}

function build() {
  const charDir = path.join(CONTENT, 'characters');
  const scenarioDir = path.join(CONTENT, 'scenarios');
  const characters = [];
  const scenarios = [];
  const charKeys = new Set();
  const scenarioKeys = new Set();

  listJson(charDir).forEach((file) => {
    const raw = readJson(file);
    itemsOf(raw, 'characters', file).forEach((c) => characters.push(validateCharacter(c, file, charKeys)));
  });
  listJson(scenarioDir).forEach((file) => {
    const raw = readJson(file);
    itemsOf(raw, 'scenarios', file).forEach((s) => scenarios.push(validateScenario(s, file, scenarioKeys)));
  });

  const data = { characters, scenarios };
  const body = '/* AUTO-GENERATED by tools/build-cabin-packs.mjs. Do not edit by hand. */\n' +
    'window.CABIN_PACKS = ' + JSON.stringify(data, null, 2) + ';\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, body, 'utf8');
  console.log('Cabin packs: ' + characters.length + ' character(s), ' + scenarios.length + ' scenario(s) -> ' + path.relative(ROOT, OUT));
}

build();

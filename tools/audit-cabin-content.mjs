import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const chars = read('content/cabin/characters/official-3e.json').characters;
const rooms = read('content/cabin/rooms/official-3e.json').rooms;
const events = read('content/cabin/cards/events-3e.json').events;
const items = read('content/cabin/cards/items-3e.json').items;
const omens = read('content/cabin/cards/omens-3e.json').omens;
const scenarios = read('content/cabin/scenarios/official-3e.json').scenarios;
const rules = read('content/cabin/scenarios/official-3e-rules.json');
const engine = fs.readFileSync(path.join(root, 'js/games/cabin.js'), 'utf8');
const builder = fs.readFileSync(path.join(root, 'tools/build-cabin-packs.mjs'), 'utf8');

const hasObj = (o) => !!o && (Array.isArray(o) ? o.length > 0 : Object.keys(o).length > 0);
const emptyEvent = (e) => !e.roll && !e.tiers?.length && !hasObj(e.effect) && !hasObj(e.win) && !hasObj(e.lose) && !e.hauntCheck;
const textOnlyItem = (it) => !it.weapon && !it.testTrait && !it.attackDice && !it.attackResult &&
  !it.testBonus && !it.armor && !it.use && !it.distance && !it.noNormalAttack &&
  !it.mentalReduce && !it.defenseDice && !it.physicalToSanity && !it.eventDice &&
  !it.endTurnHeal && !it.knowledgeWithSanity && !it.damageConvert && !it.fate &&
  !it.teleport && !it.extraTurn && !it.wallMove && !it.reroll;
const missing = (o, keys) => keys.filter((k) => o[k] === undefined || o[k] === null);

const report = {
  generatedAt: new Date().toISOString(),
  counts: {
    characters: chars.length,
    boards: new Set(chars.map((c) => c.boardId)).size,
    rooms: rooms.length,
    startRooms: rooms.filter((r) => r.start).length,
    nonStartRooms: rooms.filter((r) => !r.start).length,
    events: events.length,
    items: items.length,
    omens: omens.length,
    scenarios: scenarios.length,
    ruleCards: Object.keys(rules).length
  },
  gaps: {
    emptyEvents: events.filter(emptyEvent).map((e) => e.name),
    textOnlyItems: items.filter(textOnlyItem).map((it) => it.name),
    structuredItems: items.filter((it) => !textOnlyItem(it)).map((it) => it.name),
    roomsWithEffect: rooms.filter((r) => r.effect).map((r) => r.name),
    roomsWithSpecial: rooms.filter((r) => r.special).map((r) => r.name),
    roomsWithLink: rooms.filter((r) => r.link || r.links).map((r) => r.name),
    scenariosMissingFactions: scenarios.filter((s) => !s.factions).length,
    scenariosMissingSetup: scenarios.filter((s) => !s.setup).length,
    scenariosSetupManual: scenarios.filter((s) => s.setup && s.setup.mode === 'manual').map((s) => s.no),
    scenariosMissingTraitorGoal: scenarios.filter((s) => !s.traitorGoal && s.traitorRule !== 'noTraitor' && s.traitorRule !== 'freeForAll').length,
    scenariosMissingMonster: scenarios.filter((s) => !s.monster && !s.monsters).map((s) => s.no),
    monstersArrayShape: scenarios.filter((s) => s.monsters).map((s) => s.no),
    rulesMissingZh: Object.entries(rules).filter(([, v]) => !v.zh?.hero || !v.zh?.traitor).map(([k]) => k)
  },
  executableGaps: {
    builderKillAllDefault: (builder.match(/traitorGoal\s*\|\|\s*\{\s*type:\s*'killAll'/g) || []).length,
    runtimeKillAllDefault: (engine.match(/type:\s*'killAll'/g) || []).length,
    runtimeKillTraitorDefault: (engine.match(/type:\s*'killTraitor'/g) || []).length,
    unconditionalMaybeEventHaunt: (engine.match(/maybeEventHaunt\(st, i, c\.name, room\.name, rand\)/g) || []).length,
    directTrackPosWrites: (engine.match(/tr\.pos\s*=/g) || []).length,
    directTraitsWrites: (engine.match(/\.traits\[[^\]]+\]\s*[-+]?=/g) || []).length
  }
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--summary')) {
  console.log('\nSUMMARY');
  console.log(JSON.stringify({ counts: report.counts, executableGaps: report.executableGaps, gapCounts: Object.fromEntries(Object.entries(report.gaps).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])) }, null, 2));
}

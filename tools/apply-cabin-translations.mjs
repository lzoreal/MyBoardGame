import fs from 'node:fs';

const file = 'content/cabin/scenarios/official-3e.json';
const rulesFile = 'content/cabin/scenarios/official-3e-rules.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const rules = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
const list = data.scenarios || data;

let changed = 0;
for (const s of list) {
  const zh = rules[String(s.no)] && rules[String(s.no)].zh;
  if (!zh || !zh.hero) throw new Error('缺少中文规则译本：#' + s.no);
  s.setup = s.setup || {};
  s.setup.heroText = zh.hero;
  s.setup.traitorText = (zh.traitor || '').replace(/Spooky McMasters/g, '斯普基·麦克马斯特');
  s.story = String(s.story || '').replace(/Spooky/g, '斯普基');
  const summary = zh.hero.split('目标：')[0].replace(/^布置：/, '').trim();
  s.setup.summary = summary || zh.hero;
  s.setup.note = '官方 Setup 中文译本（布置 / 目标 / 胜利）';
  changed++;
}

fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('已写入中文 Setup 译本：' + changed + ' 个剧本');

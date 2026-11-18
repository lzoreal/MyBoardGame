// 给 12 张人物卡补年龄字段（内置 CHARS + 官方 3E 内容包），并保留 oldest 判定
import fs from 'node:fs';

const AGES = {
  // 内置 12 位（网页版原创卡面）
  zoe: 12, flash: 28, jade: 17, father: 58, brother: 63, sister: 24,
  lawyer: 41, boxer: 36, prof: 66, host: 22, fireman: 47, dealer: 52,
  // 官方 3E 12 位
  anita: 16, brittani: 26, dan: 42, warren: 47, isa: 10, jaden: 9,
  josef: 21, michelle: 20, oliver: 34, persephone: 30, sammy: 8, stephanie: 39
};

const ENGINE = 'js/games/cabin.js';
let src = fs.readFileSync(ENGINE, 'utf8');
let count = 0;
src = src.replace(/(\{ key: '([a-z]+)', name: '[^']*', role: '[^']*', art: '[^']*')(, traits:)/g, (m, head, key, tail) => {
  const age = AGES[key];
  if (!age) return m;
  count += 1;
  return head + ', age: ' + age + tail;
});
fs.writeFileSync(ENGINE, src);
console.log('内置 CHARS 写入年龄：' + count);

const CHAR_FILE = 'content/cabin/characters/official-3e.json';
const doc = JSON.parse(fs.readFileSync(CHAR_FILE, 'utf8'));
const list = doc.characters || doc;
let n = 0;
list.forEach((c) => {
  if (AGES[c.key]) { c.age = AGES[c.key]; n += 1; }
});
fs.writeFileSync(CHAR_FILE, JSON.stringify(doc, null, 2) + '\n');
console.log('官方 3E 角色写入年龄：' + n);

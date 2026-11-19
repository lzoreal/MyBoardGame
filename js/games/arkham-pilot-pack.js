/* 诡镇奇谈 · 原创内容包试点
   目的：验证 registerContent / 卡牌效果 / 调查员 / 敌人 / 剧本 setup / 遭遇数据
   都能从独立文件进入现有界面。这里全部为原创文本，不包含官方卡面或官方剧本原文。 */
(function () {
  const E = window.ArkhamEngine;
  if (!E) return;

  E.registerCardEffect('pilotLetter', (state, inv) => {
    inv.clues += 1;
    state.flags.pilotLetter = true;
  });

  E.registerHook('enterLocation', (state) => {
    if (state.inv.id !== 'pilotArchivist' || state.flags.pilotEnterUsed) return;
    state.flags.pilotEnterUsed = true;
    state.inv.resources += 1;
  });

  E.registerContent({
    cards: {
      pilotLetter: {
        type: 'event', name: '雾中来信', cost: 1, effect: 'pilotLetter',
        text: '在当前地点发现 1 个线索。'
      }
    },
    investigators: [
      {
        id: 'pilotArchivist', name: '林·维斯', role: '档案员', color: '#5f8f7a',
        stats: { will: 3, int: 4, combat: 2, agi: 3 }, health: 7, sanity: 8, ability: '',
        abilityText: '每局第一次进入新地点时，获得 1 点资源。',
        deck: [
          'pilotLetter', 'flashlight', 'book', 'knife', 'charm', 'rosary',
          'ally', 'medkit', 'calm', 'calm', 'insight', 'insight', 'dash',
          'lucky', 'notes', 'notes', 'windfall', 'smash'
        ]
      }
    ],
    enemies: {
      pilotHound: { name: '雾中的猎犬', fight: 3, evade: 2, health: 3, damage: 1, horror: 1 },
      pilotKeeper: { name: '锅炉房守门人', fight: 5, evade: 3, health: 6, damage: 2, horror: 1, boss: true }
    },
    scenarios: {
      pilot: {
        id: 'pilot', chapter: '试点章', name: '雾中来信', start: 'postoffice',
        subtitle: '试点章 · 雾中来信', order: 99, next: null, xp: 2, standalone: true,
        startLabel: '拆开信封',
        how: '每回合 3 个行动：移动、调查、战斗、闪避、打牌、抽牌、拿资源。先在旧邮局和分拣室集齐 2 个线索，推进密谋后会惊动锅炉房的守门人；击败他即可完成试点。分拣室开局有一只猎犬，进入前可以先准备好手牌。',
        intro: '一封没有邮戳的信在雨夜里被塞进旧邮局。分拣室里还有脚步声，但今晚不应该有人值班。',
        locations: {
          postoffice: { name: '旧邮局', shroud: 2, clues: 2, x: 18, y: 58, links: ['sorting'], text: '柜台落满灰，墙上的钟停在十一点四十七分。' },
          sorting: { name: '分拣室', shroud: 2, clues: 1, x: 46, y: 36, links: ['postoffice', 'boiler'], text: '信件堆成小山，最上面那封写着你的名字。' },
          boiler: { name: '锅炉房', shroud: 3, clues: 0, x: 74, y: 66, links: ['sorting'], text: '铁门后面很热，雾却从门缝里往外冒。' }
        },
        encounters: [
          { key: 'pilotMist', name: '雾中的脚步', test: { stat: 'will', difficulty: 3, fail: { horror: 1 } } },
          { key: 'pilotDamp', name: '湿透的信', test: { stat: 'int', difficulty: 2, fail: { actions: -1 } } },
          { key: 'pilotPipe', name: '管道爆裂', test: { stat: 'agi', difficulty: 3, fail: { damage: 1 } } }
        ],
        act: [
          { stage: 1, label: '第一幕 · 拆开信封', clues: 2, advanceText: '锅炉房的铁门自己打开了' },
          { stage: 2, label: '第二幕 · 锅炉房' }
        ],
        agenda: [
          { label: '议程 · 雾漫进邮局', doom: 5 },
          { label: '议程 · 信件被寄出', doom: 8, lose: true }
        ],
        boss: { key: 'pilotKeeper', loc: 'boiler', spawnText: '锅炉房的铁门被推开，守门人拖着铁钩走出来' },
        setup: [
          { op: 'spawnEnemy', enemy: 'pilotHound', loc: 'sorting', tags: ['hound'] }
        ],
        winText: '守门人倒下，雾中的信件在你手里化成灰。',
        loseText: '雾吞没了邮局，最后一封信被投进了黑暗。',
        winBig: '雾散了一角'
      }
    }
  });
})();

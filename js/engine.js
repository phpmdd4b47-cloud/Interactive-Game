/* 女巫升級計畫 — 規則引擎：擲骰、數值、狀態都在這裡算，AI 只負責寫劇情 */
(function () {
  const D = window.GAME_DATA;
  const rnd = (n) => 1 + Math.floor(Math.random() * n);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function newState(name) {
    return {
      v: 1, name: name || '徒弟',
      day: 1, slot: 0, loc: 'tower', from: null,
      level: 1, mp: 20, exp: 0, wanted: 0, favor: 10, lover: false,
      mats: {}, potions: [], items: {},
      clues: [], cluesTold: [], seen: {}, legendDone: [],
      flags: { carloDay: 0, mysteryDay: 0, chatDay: 0, cleaning: 0, pending: [] },
      nextPotionId: 1,
    };
  }

  const E = {
    S: null,
    init(name) { this.S = newState(name); return this.S; },
    load(obj) { this.S = Object.assign(newState(obj.name), obj); this.S.flags = Object.assign(newState().flags, obj.flags || {}); return this.S; },

    // ── 查詢 ──
    loc(id) { return D.LOCATIONS[id || this.S.loc]; },
    maxMp(lv) { return D.LEVELS[lv || this.S.level][1]; },
    needExp(lv) { return D.LEVELS[lv || this.S.level][0]; },
    slotName() { return D.SLOTS[this.S.slot]; },
    isLateNight() { return this.S.slot >= 3; },
    isNight() { return this.S.slot >= 2; },
    stage() { return D.HECATE.stageName(this.S.favor); },
    wantedStage() { return D.WANTED_STAGE(this.S.wanted); },
    dangerNow(id) { return Math.min(3, this.loc(id).danger + (this.isNight() ? 1 : 0)); },
    matList() { return Object.entries(this.S.mats).filter(([, n]) => n > 0); },
    totalMats() { return this.matList().reduce((a, [, n]) => a + n, 0); },
    userName() { return this.S.name; },

    // ── 小工具 ──
    addMat(name, n = 1) { this.S.mats[name] = (this.S.mats[name] || 0) + n; },
    takeMat(name, n = 1) { this.S.mats[name] -= n; if (this.S.mats[name] <= 0) delete this.S.mats[name]; },
    addItem(name, n = 1) { this.S.items[name] = (this.S.items[name] || 0) + n; },
    takeItem(name) { this.S.items[name]--; if (this.S.items[name] <= 0) delete this.S.items[name]; },
    advance(calc) {
      const before = this.slotName();
      this.S.slot = Math.min(3, this.S.slot + 1);
      calc.push(`時段：${before} → ${this.slotName()}`);
    },
    gainExp(n, calc, msgs) {
      const S = this.S;
      if (S.level >= 10) { calc.push(`經驗：MAX`); return; }
      const b = S.exp; S.exp += n; calc.push(`經驗：${b}+${n}=${S.exp}`);
      while (S.level < 10 && S.exp >= this.needExp()) {
        S.exp -= this.needExp(); S.level++; S.mp = this.maxMp();
        calc.push(`升級！等級 ${S.level - 1} → ${S.level}，魔力上限 ${this.maxMp()}，魔力回滿`);
        msgs.levelUp = (msgs.levelUp || 0) + 1;
      }
      if (S.level >= 10) S.exp = 0;
    },
    mpChange(d, calc) {
      const b = this.S.mp; this.S.mp = clamp(b + d, 0, this.maxMp());
      calc.push(`魔力：${b}${d >= 0 ? '+' : ''}${d}=${this.S.mp}`);
    },
    wantedChange(d, calc, why) {
      const b = this.S.wanted; this.S.wanted = clamp(b + d, 0, 8);
      if (b !== this.S.wanted || d) calc.push(`通緝度：${b}${d >= 0 ? '+' : ''}${d}=${this.S.wanted}${why ? `（${why}）` : ''}`);
    },
    favorChange(d, calc, why) {
      d = clamp(d, -3, 3);
      const cap = this.S.lover ? 100 : 99;
      const b = this.S.favor; this.S.favor = clamp(b + d, 0, cap);
      if (d) calc.push(`好感：${b}${d >= 0 ? '+' : ''}${d}=${this.S.favor}${why ? `（${why}）` : ''}`);
    },
    hecateHere() { return this.S.loc === 'tower'; },
    finish(r, msgs) {
      // 升級時赫卡的反應（她不在場就回家再說）
      if (msgs.levelUp) {
        if (this.hecateHere()) r.text += '\n\n' + pick(D.HECATE.levelUp);
        else this.S.flags.pending.push('levelUp');
        r.facts += `\n※ ${this.S.name}升級到 ${this.S.level} 級。${this.hecateHere() ? '赫卡在場，要有反應，並提醒之後藥水會更穩定。' : '赫卡不在場。'}`;
      }
      return r;
    },
    blockNight() {
      if (!this.isLateNight()) return null;
      return { ok: false, text: pick(D.HECATE.night), facts: '', calc: [], noAI: true };
    },

    // ── 前往 ──
    travelOptions() {
      return D.LOC_ORDER.filter(id => id !== this.S.loc).map(id => {
        const L = D.LOCATIONS[id];
        let cost = L.dist === 2 ? 1 : 0;
        if (id === 'tower') cost = this.loc().dist === 2 && !this.isLateNight() ? 1 : 0;
        const blocked = this.isLateNight() && id !== 'tower';
        return { id, L, cost, blocked };
      });
    },
    travel(id) {
      const S = this.S, calc = [], msgs = {};
      const L = D.LOCATIONS[id], fromL = this.loc();
      if (this.isLateNight() && id !== 'tower') return this.blockNight();
      if (S.flags.cleaning > 0 && S.slot === 0) return { ok: false, noAI: true, text: '今天早上要打掃塔樓，哪裡都不准去。赫卡正盯著你。', facts: '', calc: [] };
      let cost = L.dist === 2 ? 1 : 0;
      if (id === 'tower') cost = fromL.dist === 2 && !this.isLateNight() ? 1 : 0;
      S.from = S.loc; S.loc = id;
      calc.push(`位置：${fromL.name} → ${L.name}`);
      if (cost) this.advance(calc);
      let text = `你前往${L.name}。${cost ? '路途遙遠，花了一整個時段。' : ''}\n\n${L.desc}`;
      let facts = `${S.name}從${fromL.name}前往${L.name}（${D.DIST[L.dist]}，危險度：${D.DANGER[L.dist ? L.danger : 0]}${this.isNight() && L.danger ? '，夜間危險度+1' : ''}）。${cost ? '消耗一個時段。' : '不消耗時段。'}抵達後描寫當地景象。`;
      if (id === 'tower') {
        const extra = this.homecoming();
        if (extra.text) text += '\n\n' + extra.text;
        if (extra.facts) facts += '\n' + extra.facts;
      }
      if (L.danger >= 2 || (this.isNight() && L.danger >= 1)) S.flags.pending.push('danger');
      return this.finish({ ok: true, cmd: `【前往】${L.name}`, text, facts, calc }, msgs);
    },
    homecoming() {
      const S = this.S, H = D.HECATE, out = [], facts = [];
      const p = new Set(S.flags.pending); S.flags.pending = [];
      if (p.has('arrest')) { /* 保釋時已演出 */ }
      if (p.has('levelUp')) { out.push(pick(H.levelUp)); facts.push(`${S.name}在外面升級了，赫卡要有反應，並提醒之後藥水會更穩定。`); }
      if (p.has('smelly')) { out.push(H.reunion.smelly); facts.push(`${S.name}在沼澤陷進泥裡，全身惡臭。`); }
      if (p.has('threw')) {
        const w = this.wantedStage();
        const line = pick(H.wanted[w] || ['']); if (line) out.push(line);
        facts.push(`${S.name}在鎮上丟了藥水，目前通緝度 ${S.wanted}（${w}）。赫卡明令禁止丟人，依通緝度反應。`);
      }
      if (p.has('danger')) {
        if (S.favor >= 40) { out.push(H.reunion.danger); facts.push(`${S.name}去了危險的地方。好感40以上，赫卡在門口等${S.name}回來。`); }
        else facts.push(`${S.name}去了危險的地方，赫卡可以碎念「我說過了吧」。`);
      }
      return { text: out.join('\n\n'), facts: facts.length ? '【回到塔樓，赫卡會察覺】' + facts.join(' ') : '' };
    },

    // ── 採集 ──
    gather() {
      const S = this.S, L = this.loc(), calc = [], msgs = {};
      const nb = this.blockNight(); if (nb) return nb;
      if (S.flags.cleaning > 0 && S.slot === 0) return { ok: false, noAI: true, text: '今天早上要打掃塔樓，不能出門採集。', facts: '', calc: [] };
      if (!L.mats) return { ok: false, noAI: true, text: `${L.name}沒有素材可以採集。`, facts: '', calc: [] };
      const gotMats = !L.nightOnly || this.isNight();
      // 事件：危險度越高，越容易遇上麻煩
      let ev = rnd(8);
      const dz = this.dangerNow();
      if (ev <= 5 && dz > 0 && Math.random() < dz * 0.12) ev = 5 + rnd(3);
      const got = [];
      if (gotMats) { const n = 2 + (rnd(6) >= 4 ? 1 : 0); for (let i = 0; i < n; i++) got.push(L.mats[rnd(4) - 1]); }
      let evText = '', evFact = '';
      if (ev <= 4) { evText = '採集很順利。'; evFact = '順利。'; }
      else if (ev === 5) { const r = L.rare[rnd(2) - 1]; got.push(r); evText = `運氣真好！你發現了稀有的「${r}」。`; evFact = `幸運：獲得稀有素材「${r}」×1。`; }
      else if (ev === 6) {
        if (got.length > 1) { const lost = got.pop(); evText = L.ev[6] + `（失去${lost}×1）`; evFact = `${L.ev[6]}失去最後一個素材「${lost}」。`; }
        else { evText = L.ev[6].replace(/[。！]?$/, '') + '——還好你緊緊抓住了手上的東西。'; evFact = L.ev[6] + '（但最少保留1個，沒有損失）'; }
      } else if (ev === 7) { evText = L.ev[7]; evFact = L.ev[7] + '（只有劇情互動）'; }
      else { evText = L.ev[8]; evFact = `${L.ev[8]}魔力-${L.ev.mp}。`; this.mpChange(-L.ev.mp, calc); if (L.ev.smelly) S.flags.pending.push('smelly'); }
      got.forEach(m => this.addMat(m));
      const tally = {}; got.forEach(m => tally[m] = (tally[m] || 0) + 1);
      const gotStr = Object.entries(tally).map(([k, v]) => `${k}×${v}`).join('、');
      if (gotStr) calc.push(`素材：+${gotStr}`);
      this.gainExp(3, calc, msgs); this.advance(calc);
      let text = `你在${L.name}採集素材。\n\n${evText}`;
      if (!gotMats) text += '\n\n（墓地的素材只在晚上才有收穫。）';
      if (gotStr) text += `\n\n獲得：${gotStr}`;
      if (L.danger >= 2 || (this.isNight() && L.danger >= 1)) S.flags.pending.push('danger');
      const facts = `${S.name}在${L.name}採集。${gotMats ? '' : '（白天的墓地沒有素材）'}獲得素材：${gotStr || '無'}。採集事件：${evFact}`;
      return this.finish({ ok: true, cmd: `【採集】${L.name}`, text, facts, calc }, msgs);
    },

    // ── 探索 ──
    explore() {
      const S = this.S, L = this.loc(), calc = [], msgs = {};
      const nb = this.blockNight(); if (nb) return nb;
      if (S.flags.cleaning > 0 && S.slot === 0 && S.loc !== 'tower') return { ok: false, noAI: true, text: '今天早上要打掃塔樓。', facts: '', calc: [] };
      const n = rnd(6), row = L.explore[n - 1];
      const seen = (S.seen[S.loc] = S.seen[S.loc] || []);
      const repeat = seen.includes(n); if (!repeat) seen.push(n);
      let t = row.t, extra = [];
      if (row.wantedBlock && S.wanted >= 5) t = row.wantedBlock;
      else {
        if (row.gain) for (const [k, v] of Object.entries(row.gain)) { this.addMat(k, v); extra.push(`${k}×${v}`); calc.push(`素材：+${k}×${v}`); }
        if (row.item) { this.addItem(row.item); extra.push(row.item + '×1'); calc.push(`道具：+${row.item}×1`); }
        if (row.potion === 'unknown') { this.addPotion({ name: '古老的藥瓶', effect: '效果未知', unknown: true, quality: '?', strength: '?' }); extra.push('古老的藥瓶〔效果未知〕×1'); calc.push('藥水：+古老的藥瓶〔效果未知〕×1'); }
        if (row.clue && !S.clues.includes(row.clue)) { S.clues.push(row.clue); extra.push(`線索「${row.clue}」`); }
        if (row.help && S.wanted > 0) this.wantedChange(-1, calc, '幫助居民');
        if (row.carlo) S.flags.carloDay = S.day;
        if (row.mystery) S.flags.mysteryDay = S.day;
      }
      this.gainExp(3, calc, msgs); this.advance(calc);
      if (L.danger >= 2 || (this.isNight() && L.danger >= 1)) S.flags.pending.push('danger');
      let text = `你在${L.name}四處探索。\n\n${repeat ? '（似曾相識的光景，但這次好像有點不一樣……）\n' : ''}${t}`;
      if (extra.length) text += `\n\n獲得：${extra.join('、')}`;
      if (row.carlo && !(row.wantedBlock && S.wanted >= 5)) text += '\n\n（可以按 A 開啟互動選單，和卡洛交易。）';
      const facts = `${S.name}在${L.name}探索。探索結果：${t.replace(/你/g, S.name)}${repeat ? '\n※這個結果之前出現過，請改寫成新的發展，不要重複。' : ''}${extra.length ? `\n獲得：${extra.join('、')}` : ''}${S.loc === 'tower' ? '\n赫卡在塔樓裡。' : ''}`;
      return this.finish({ ok: true, cmd: `【探索】${L.name}`, text, facts, calc }, msgs);
    },

    // ── 調製 ──
    addPotion(p) { p.id = this.S.nextPotionId++; p.count = p.count || 1; this.S.potions.push(p); return p; },
    brewPreview(sel) {
      const names = Object.keys(sel).filter(k => sel[k] > 0);
      const portions = names.reduce((a, k) => a + sel[k], 0);
      const score = names.reduce((a, k) => a + D.MATERIALS[k][0] * sel[k], 0);
      return { names, portions, score, strength: score >= 15 ? '超強' : score >= 10 ? '強' : score >= 5 ? '中' : '弱' };
    },
    brew(sel) {
      const S = this.S, calc = [], msgs = {}, H = D.HECATE;
      const nb = this.blockNight(); if (nb) return nb;
      const pv = this.brewPreview(sel);
      const cmd = `【調製】${pv.names.map(k => sel[k] > 1 ? `${k}×${sel[k]}` : k).join('＋')}`;
      if (S.loc !== 'tower') return { ok: false, noAI: true, text: '這裡沒有鍋子，赫卡也不在。調製只能在灰燼塔樓的煉藥房進行。', facts: '', calc: [] };
      if (!pv.portions) return { ok: false, noAI: true, text: '鍋子裡什麼都沒放。', facts: '', calc: [] };
      const lacking = pv.names.some(k => (S.mats[k] || 0) < sel[k]);
      if (lacking || S.mp < 5 || pv.portions > 5) {
        const t = H.brew.fail[0];
        return { ok: false, cmd, text: t, calc: [], facts: `${S.name}在${lacking ? '素材不足' : S.mp < 5 ? '魔力不足（剩' + S.mp + '）' : '一次放超過5份'}的情況下硬要調製。調製失敗，不扣除任何東西，赫卡吐槽${S.name}沒常識。` };
      }
      pv.names.forEach(k => this.takeMat(k, sel[k]));
      calc.push(`素材：-${pv.names.map(k => `${k}×${sel[k]}`).join('、')}`);
      this.mpChange(-5, calc);
      const hand = rnd(6), q = hand + S.level;
      const quality = q <= 3 ? '失控' : q <= 7 ? '普通' : q <= 11 ? '穩定' : '極品';
      calc.push(`品質：手感${hand}+等級${S.level}=${q}（${quality}）；素材分 ${pv.score}（${pv.strength}）`);
      const leg = D.LEGENDARY.find(r => r.mats.length === pv.names.length && r.mats.every(m => pv.names.includes(m)));
      const traits = pv.names.map(k => D.MATERIALS[k][1]);
      const healing = traits.some(t => D.HEALING_TRAITS.includes(t));
      let name, effect, look = pick(D.POTION_LOOKS);
      const durBase = { '弱': '幾分鐘', '中': '一小時', '強': '半天', '超強': '一整天' }[pv.strength];
      const durDbl = { '弱': '十幾分鐘', '中': '兩小時', '強': '一整天', '超強': '兩天' }[pv.strength];
      const dur = quality === '穩定' || quality === '極品' ? durDbl : durBase;
      if (leg) {
        name = leg.name; effect = `${leg.effect}，持續${dur}`;
      } else {
        const sorted = pv.names.slice().sort((a, b) => sel[b] - sel[a] || D.MATERIALS[b][0] - D.MATERIALS[a][0]);
        const tr = sorted.map(k => D.MATERIALS[k][1]);
        name = tr.slice(0, 2).map(t => D.TRAITS[t][0]).join('') + pick(D.POTION_SUFFIX);
        const intens = (k) => sel[k] >= 3 ? '非常強烈地' : sel[k] === 2 ? '明顯地' : '';
        const parts = sorted.slice(0, 3).map(k => intens(k) + D.TRAITS[D.MATERIALS[k][1]][1]);
        effect = parts.join('，而且') + `，持續${dur}`;
        if (quality === '失控') effect += '，' + pick(D.SIDE_EFFECTS);
        if (quality === '極品') effect += `；小驚喜：${pick(D.SURPRISES)}`;
      }
      const bonus = { '失控': 0, '普通': 2, '穩定': 5, '極品': 10 }[quality];
      let expGain = pv.score + bonus;
      const firstLegend = leg && !S.legendDone.includes(leg.name);
      if (leg) { expGain += 20; if (firstLegend) S.legendDone.push(leg.name); }
      const potion = this.addPotion({ name, effect, quality, strength: pv.strength, legendary: !!leg, healing, traits });
      this.gainExp(expGain, calc, msgs);
      calc.push(`經驗來源：素材分${pv.score}+品質${bonus}${leg ? '+傳說20' : ''}`);
      this.advance(calc);
      let react = leg && firstLegend ? H.brew.legend[0].replace('{name}', name) : pick(H.brew[quality]);
      const text = `你把素材一一丟進大鍋。鍋子咕嘟咕嘟地翻騰，冒出${pick(['紫色', '金色', '粉紅色', '綠色', '彩虹色', '銀色'])}的煙……\n\n完成了！一瓶${look}藥水——\n「${name}」\n〔${effect}〕\n\n${react}`;
      const facts = `${S.name}在煉藥房調製。放入：${pv.names.map(k => `${k}×${sel[k]}（${D.MATERIALS[k][1]}）`).join('、')}。素材分總和 ${pv.score}，強度「${pv.strength}」，持續時間${dur}。品質「${quality}」。` +
        (leg ? `\n這是傳說配方「${name}」，效果固定為：${leg.effect}。${firstLegend ? '這是第一次做出，赫卡認出它，反應很大，可能脫口說出自己年輕時也做過。' : ''}` :
          `\n系統暫定名稱「${name}」、效果「${effect}」。你可以依特性組合重新發想更有趣的名字與效果（越離譜越好但不致命），請在正文之後用 <藥水名>名稱</藥水名><效果>效果描述（含持續時間${quality === '失控' ? '與失控副作用' : ''}${quality === '極品' ? '與小驚喜' : ''}）</效果> 輸出。`) +
        `\n赫卡在場，依品質反應。`;
      return this.finish({ ok: true, cmd, text, facts, calc, potionId: potion.id }, msgs);
    },
    renamePotion(id, name, effect) {
      const p = this.S.potions.find(x => x.id === id); if (!p) return;
      if (name) p.name = name.trim().slice(0, 20);
      if (effect) p.effect = effect.trim().slice(0, 120);
    },

    // ── 投擲 ──
    throwPotion(pid, target) {
      const S = this.S, calc = [], msgs = {};
      const nb = this.blockNight(); if (nb) return nb;
      if (S.loc !== 'town') return { ok: false, noAI: true, text: '這裡沒有可以丟的人。投擲只能在苔石鎮進行。', facts: '', calc: [] };
      if (S.flags.cleaning > 0 && S.slot === 0) return { ok: false, noAI: true, text: '今天早上要打掃塔樓。', facts: '', calc: [] };
      const p = S.potions.find(x => x.id === pid); if (!p) return { ok: false, noAI: true, text: '找不到那瓶藥水。', facts: '', calc: [] };
      if (p.unknown) { const t = pick(Object.keys(D.TRAITS)); p.effect = `（開瓶才知道）${D.TRAITS[t][1]}，持續一小時`; p.healing = D.HEALING_TRAITS.includes(t); }
      const tgt = target || rnd(8);
      const hit = rnd(6), seen = rnd(6);
      const R = D.RESIDENTS[tgt];
      let victims = [], selfHit = false, text = '', facts = '';
      if (hit === 1) { selfHit = true; }
      else if (hit === 2) { let o; do { o = rnd(8); } while (o === tgt); victims = [o]; }
      else if (hit <= 5) victims = [tgt];
      else { let o; do { o = rnd(8); } while (o === tgt); victims = [tgt, o]; }
      p.count--; if (p.count <= 0) S.potions = S.potions.filter(x => x !== p);
      calc.push(`藥水：${p.name}-1`);
      const witnessed = seen >= 4, bard = seen === 6;
      text = `你瞄準${R.name}，丟出了「${p.name}」——\n\n`;
      if (selfHit) text += `手一滑，藥水在你自己頭上碎開了！\n〔${p.effect}〕`;
      else {
        text += hit === 2 ? `砸偏了！藥水命中了旁邊的${D.RESIDENTS[victims[0]].name}。\n` : hit === 6 ? `大成功！正中${R.name}，還濺到了旁邊的${D.RESIDENTS[victims[1]].name}！\n` : `命中！\n`;
        text += `〔${p.effect}〕\n\n` + victims.map(v => pick(D.RESIDENTS[v].react)).join('\n');
      }
      text += '\n\n' + (bard ? '……而這一切，都被吟遊詩人林恩看得一清二楚。今晚的酒館大概會有新歌了。' : witnessed ? '有人看見是你丟的！' : '沒有人看見，你順利溜走了。');
      // 通緝度
      if (!selfHit) {
        let healed = p.healing;
        if (healed) this.wantedChange(-1, calc, '治療效果的藥水');
        else this.wantedChange(1, calc, '投擲藥水');
        if (witnessed) this.wantedChange(1, calc, bard ? '被林恩目擊' : '被目擊');
        if (victims.some(v => D.RESIDENTS[v].vip)) this.wantedChange(1, calc, '命中重要人物');
      } else if (witnessed) text += '\n（糗事大概很快就會傳遍全鎮。）';
      this.gainExp(5, calc, msgs); this.advance(calc);
      S.flags.pending.push('threw');
      facts = `${S.name}在苔石鎮投擲藥水「${p.name}」〔效果：${p.effect}〕（品質${p.quality}，強度${p.strength}）。目標：${R.name}。` +
        `命中結果：${selfHit ? `失手，藥水砸到${S.name}自己` : hit === 2 ? `砸偏，命中了旁邊的${D.RESIDENTS[victims[0]].name}` : hit === 6 ? `大成功，正中${R.name}，還濺到旁邊的${D.RESIDENTS[victims[1]].name}` : `正中${R.name}`}。` +
        `目擊：${bard ? '被林恩目擊，事件會寫成誇張又不太正確的歌' : witnessed ? '被目擊，有人看見是' + S.name + '丟的' : `沒有人看見，${S.name}順利溜走`}。` +
        `\n依藥水記錄的效果演出，強度與持續時間照寫，不可自行改變效果。被命中的人依〈城鎮居民〉的個性反應。目前通緝度 ${S.wanted}（${this.wantedStage()}）。`;
      if (S.wanted >= 8) {
        const t2 = this.arrest(calc);
        text += '\n\n' + t2; facts += `\n通緝度達到8：${S.name}被衛兵抓走。赫卡出面保釋，通緝度歸零，接下來三天早上要打掃塔樓。保釋時赫卡的態度依好感（${S.favor}）而定。`;
      }
      return this.finish({ ok: true, cmd: `【投擲】${p.name}${target ? '（目標：' + R.name + '）' : ''}`, text, facts, calc }, msgs);
    },
    arrest(calc) {
      const S = this.S;
      this.wantedChange(-S.wanted, calc, '被捕後保釋，歸零');
      S.flags.cleaning = 3; S.loc = 'tower';
      S.flags.pending = S.flags.pending.filter(x => x !== 'threw');
      calc.push('懲罰：接下來三天的早上要打掃塔樓');
      return '「抓到了！」葛雷夫隊長的手按上了你的肩膀。\n\n' + pick(D.HECATE.bail);
    },

    // ── 睡覺 ──
    sleep() {
      const S = this.S, calc = [];
      let text = '';
      if (S.loc !== 'tower') { text += `你拖著疲憊的身體從${this.loc().name}回到塔樓。\n`; S.loc = 'tower'; }
      const home = this.homecoming();
      if (home.text) text += home.text + '\n\n';
      S.day++; S.slot = 0;
      calc.push(`天數：第${S.day - 1}天 → 第${S.day}天，時段回到早上`);
      this.mpChange(this.maxMp() - S.mp, calc);
      this.wantedChange(-1, calc, '睡覺');
      text += pick(['你爬上閣樓，鑽進被窩。窗外的苔石鎮燈火一盞盞熄滅。', '樓下傳來赫卡的鼾聲。你數著屋頂的星星，慢慢睡著了。', '鍋子還在小火上咕嘟作響。你打了個呵欠，一覺到天亮。']);
      text += `\n\n——第 ${S.day} 天，早上。`;
      let facts = `${S.name}睡覺，結束一天。正文簡短帶過夜晚，從第${S.day}天早上開始。` + (home.facts ? '\n' + home.facts : '');
      if (S.flags.cleaning > 0) {
        S.flags.cleaning--; S.slot = 1;
        calc.push(`打掃塔樓：早上時段被占用（剩 ${S.flags.cleaning} 天）`);
        text += '\n\n赫卡把掃把塞進你手裡：「被捕的懲罰。早上給我把一樓掃乾淨。」\n你掃了一整個早上。時間來到下午。';
        facts += `\n被捕的懲罰：今天早上${S.name}要打掃塔樓，直接跳到下午。`;
      }
      return { ok: true, cmd: '【睡覺】', text, facts, calc };
    },

    // ── 一般互動（單機） ──
    chat() {
      const S = this.S, calc = [];
      if (!this.hecateHere()) return { ok: false, noAI: true, text: '赫卡不在這裡。她平時都待在灰燼塔樓。', facts: '', calc };
      const st = this.stage();
      let text = pick(D.HECATE.chat[st]);
      if (S.flags.chatDay !== S.day) { S.flags.chatDay = S.day; this.favorChange(1, calc, '陪她聊天'); }
      return { ok: true, text, facts: '', calc };
    },
    tellClue(clue) {
      const S = this.S, calc = [];
      if (!this.hecateHere()) return { ok: false, noAI: true, text: '赫卡不在這裡。', facts: '', calc };
      const st = this.stage();
      const text = `你小心翼翼地向赫卡提起「${clue}」。\n\n` + pick(D.HECATE.clue[st]);
      if (!S.cluesTold.includes(clue)) { S.cluesTold.push(clue); this.favorChange(2, calc, '溫柔地提起她過去的線索'); }
      return { ok: true, cmd: '', text, calc, facts: `${S.name}溫柔地向赫卡提起找到的線索「${clue}」。依目前的關係階段（${st}，好感${S.favor}）決定赫卡願意透露多少過去，不要一次說完。` };
    },
    gift(kind, ref) {
      const S = this.S, calc = [], H = D.HECATE;
      if (!this.hecateHere()) return { ok: false, noAI: true, text: '赫卡不在這裡。', facts: '', calc };
      let text, facts;
      if (kind === 'potion') {
        const p = S.potions.find(x => x.id === ref); if (!p) return { ok: false, noAI: true, text: '', facts: '', calc };
        p.count--; if (p.count <= 0) S.potions = S.potions.filter(x => x !== p);
        const weird = p.quality === '失控' || p.legendary || p.unknown;
        this.favorChange(weird ? 3 : 1, calc, weird ? '讓她眼睛發亮的藥水' : '送她藥水');
        text = `你把「${p.name}」遞給赫卡。\n\n` + (weird ? H.gift.potion : '赫卡接過來晃了晃：「嗯，還行。我收下了。」');
        facts = `${S.name}把藥水「${p.name}」〔${p.effect}〕（品質${p.quality}）送給赫卡。赫卡喜歡失控的怪藥水。`;
      } else {
        this.takeItem(ref);
        const fav = ref === '蜂蜜麵包' ? 3 : 1;
        this.favorChange(fav, calc, ref === '蜂蜜麵包' ? '她最愛的蜂蜜麵包' : '送她東西');
        text = `你把「${ref}」送給赫卡。\n\n` + (H.gift[ref] || H.gift.other);
        facts = `${S.name}把「${ref}」送給赫卡。${ref === '蜂蜜麵包' ? '這是她最愛的波頓的蜂蜜麵包，但她不敢自己去買。' : ''}`;
      }
      return { ok: true, cmd: '', text, facts, calc };
    },
    confess() {
      const S = this.S, calc = [], H = D.HECATE;
      if (!this.hecateHere()) return { ok: false, noAI: true, text: '赫卡不在這裡。', facts: '', calc };
      if (S.favor >= 80) {
        S.lover = true; this.favorChange(100 - S.favor, calc, '互相表明心意'); S.favor = 100;
        return { ok: true, cmd: '', text: H.confessYes[0], calc, facts: `${S.name}向赫卡告白（好感80以上）。赫卡告白很笨拙，說到一半就想逃，最後接受。好感到達100，成為戀人。` };
      }
      return { ok: true, cmd: '', text: H.confessNo[0], calc, facts: `${S.name}在好感${S.favor}（未滿80）時向赫卡告白。赫卡當成玩笑帶過，或慌張地把${S.name}趕出房間。` };
    },
    freeTalkOffline(msg) {
      const S = this.S, calc = [];
      if (!this.hecateHere()) {
        return { ok: true, text: pick([`你對著${this.loc().name}的空氣說話。風吹過，沒有人回答。`, '路過的松鼠停下來看了你一眼，又跑走了。', '你的聲音在四周迴盪了一下。赫卡不在這裡——要聊天的話，回塔樓吧。']), calc };
      }
      const rule = D.FREE_TALK.find(r => r.k.some(k => msg.includes(k)));
      let text;
      if (rule) {
        text = pick(rule.r);
        if (rule.stageGate && S.favor >= 60) text = pick(D.HECATE.clue[this.stage()]);
        if (rule.fav && S.flags.chatDay !== S.day) { S.flags.chatDay = S.day; this.favorChange(rule.fav, calc); }
      } else text = pick(D.HECATE.chat[this.stage()]);
      return { ok: true, text, calc };
    },

    // ── 卡洛交易 ──
    carloHere() { return this.S.loc === 'crossroads' && this.S.flags.carloDay === this.S.day; },
    trade(kind, ref) {
      const S = this.S, calc = [];
      let text = '', got = [];
      if (kind === 'potion' || kind === 'mystery') {
        const p = S.potions.find(x => x.id === ref); if (!p) return { ok: false, noAI: true, text: '', calc };
        p.count--; if (p.count <= 0) S.potions = S.potions.filter(x => x !== p);
        calc.push(`藥水：${p.name}-1`);
        if (kind === 'mystery') {
          S.flags.mysteryDay = 0;
          const it = pick(['會唱歌的銅鈴', '寫著陌生文字的地圖碎片', '一枚刻著面具圖案的硬幣', '不會融化的雪花玻璃球']);
          this.addItem(it); calc.push(`道具：+${it}×1`);
          text = `卡洛小心地收下「${p.name}」，把那件來歷不明的東西交給你——「${it}」。\n「好眼光，小魔女。」他笑得更可疑了。`;
          return { ok: true, cmd: '', text, calc, facts: `${S.name}用藥水「${p.name}」向卡洛換到來歷不明的東西「${it}」，效果由劇情決定。` };
        }
        const good = p.legendary || p.quality === '穩定' || p.quality === '極品';
        const wild = p.quality === '失控';
        if (good) got.push(pick(D.FOREIGN.rare));
        else { got.push(pick(D.FOREIGN.common), pick(D.FOREIGN.common)); if (wild && Math.random() < 0.5) got.push(pick(D.FOREIGN.common)); }
        text = `卡洛接過「${p.name}」，${wild ? '眼睛都亮了：「失控的怪藥水！我最喜歡這種了，多送你一點！」' : '滿意地點點頭。'}`;
      } else {
        const names = ref; // 三個素材名
        names.forEach(k => this.takeMat(k));
        calc.push(`素材：-${names.join('、')}`);
        got.push(pick(D.FOREIGN.common));
        text = '卡洛把你的素材收進大布袋裡：「三換一，童叟無欺。」';
      }
      got.forEach(m => this.addMat(m));
      calc.push(`素材：+${got.join('、')}`);
      text += `\n\n獲得：${got.join('、')}`;
      return { ok: true, cmd: '', text, calc, facts: `${S.name}和流浪商人卡洛以物易物，換到外地素材：${got.join('、')}。` };
    },
  };

  window.ENGINE = E;
  window.UTIL = { rnd, pick, clamp };
})();

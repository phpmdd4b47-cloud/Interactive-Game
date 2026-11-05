/* 女巫升級計畫 — 畫面、按鈕與流程 */
(function () {
  const D = window.GAME_DATA, E = window.ENGINE, AI = window.AI, { pick } = window.UTIL;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } },
  };
  const SAVE_KEYS = ['witch_auto', 'witch_slot1', 'witch_slot2', 'witch_slot3'];

  const UI = {
    mode: 'offline', sound: true, busy: false, typing: null,
    menus: [], panelTab: 0, log: [], title: true, titleSel: 0,
    abort: null,

    // ── 初始化 ──
    init() {
      const cfg = LS.get('witch_cfg', {});
      Object.assign(AI.cfg, cfg.ai || {});
      this.mode = cfg.mode || 'offline';
      this.sound = cfg.sound !== false;
      $('#text').addEventListener('scroll', () => this.updateHint());
      this.bindButtons(); this.bindKeys(); this.bindSettings(); this.bindInput();
      this.preloadPressed();
      this.showTitle();
    },
    saveCfg() { LS.set('witch_cfg', { mode: this.mode, sound: this.sound, ai: AI.cfg }); },

    // ── 音效（WebAudio 小嗶聲） ──
    beep(f = 660, d = 0.05, type = 'square', vol = 0.05) {
      if (!this.sound) return;
      try {
        this.ac = this.ac || new (window.AudioContext || window.webkitAudioContext)();
        const o = this.ac.createOscillator(), g = this.ac.createGain();
        o.type = type; o.frequency.value = f; g.gain.value = vol;
        g.gain.exponentialRampToValueAtTime(0.0001, this.ac.currentTime + d);
        o.connect(g).connect(this.ac.destination); o.start(); o.stop(this.ac.currentTime + d);
      } catch (e) { }
    },
    jingle(notes) { notes.forEach((n, i) => setTimeout(() => this.beep(n, 0.09, 'triangle', 0.06), i * 90)); },

    // ── 按鈕 ──
    preloadPressed() {
      document.querySelectorAll('.btn').forEach(b => {
        const img = b.dataset.img;
        b.style.backgroundImage = `url(assets/console/${img}.webp)`;
        new Image().src = `assets/console/${img}_p.webp`;
      });
    },
    press(btn, on, dir) {
      const img = btn.dataset.img;
      btn.style.backgroundImage = `url(assets/console/${img}${on ? '_p' : ''}.webp)`;
      btn.classList.toggle('pressed', on);
      ['up', 'down', 'left', 'right'].forEach(d => btn.classList.toggle('p-' + d, on && dir === d));
    },
    bindButtons() {
      document.querySelectorAll('.btn').forEach(btn => {
        let rep = null, repT = null;
        const stop = () => { clearTimeout(repT); clearInterval(rep); rep = repT = null; this.press(btn, false); };
        btn.addEventListener('pointerdown', (ev) => {
          ev.preventDefault();
          btn.setPointerCapture?.(ev.pointerId);
          let key = btn.dataset.key, dir;
          if (key === 'dpad') {
            const r = btn.getBoundingClientRect();
            const x = ev.clientX - r.left - r.width / 2, y = ev.clientY - r.top - r.height / 2;
            dir = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
            key = dir;
          }
          this.press(btn, true, dir);
          this.input(key);
          if (dir) { repT = setTimeout(() => { rep = setInterval(() => this.input(key, true), 110); }, 380); }
        });
        btn.addEventListener('pointerup', stop);
        btn.addEventListener('pointercancel', stop);
        btn.addEventListener('lostpointercapture', stop);
        btn.addEventListener('contextmenu', e => e.preventDefault());
      });
    },
    bindKeys() {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        z: 'a', Z: 'a', ' ': 'a', x: 'b', X: 'b', Escape: 'b', Backspace: 'b',
        Enter: 'a', p: 'start', P: 'start', Shift: 'select', Tab: 'select',
        1: 'cmd_map', 2: 'cmd_gather', 3: 'cmd_explore', 4: 'cmd_brew', 5: 'cmd_throw', 6: 'cmd_sleep',
      };
      const btnFor = { up: 'dpad', down: 'dpad', left: 'dpad', right: 'dpad', a: 'a', b: 'b', start: 'start', select: 'select' };
      document.addEventListener('keydown', (ev) => {
        if (!$('#settings').classList.contains('hidden')) { if (ev.key === 'Escape') this.closeSettings(); return; }
        if (!$('#inputbox').classList.contains('hidden')) {
          if (ev.key === 'Escape') this.closeInput();
          else if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); this.sendInput(); }
          return;
        }
        let k = map[ev.key]; if (!k) return;
        ev.preventDefault();
        const b = document.querySelector(`.btn[data-key="${btnFor[k] || k}"]`);
        if (b) { this.press(b, true, ['up', 'down', 'left', 'right'].includes(k) ? k : null); setTimeout(() => this.press(b, false), 120); }
        this.input(k, ev.repeat);
      });
    },

    // ── 輸入分派 ──
    input(k, repeat) {
      if (!repeat) this.beep(k.startsWith('cmd') ? 520 : k === 'b' ? 330 : 660);
      if (this.title) return this.titleInput(k);
      if (this.busy) { if (k === 'b' && this.abort) { this.abort.abort(); } return; }
      if (!$('#panel').classList.contains('hidden')) return this.panelInput(k);
      if (this.menus.length) return this.menuInput(k);
      // 一般畫面
      if (k === 'up' || k === 'down') { $('#text').scrollBy({ top: (k === 'up' ? -1 : 1) * 40, behavior: 'smooth' }); return; }
      if (k === 'a') { if (this.typing) { this.finishTyping(); return; } return this.openInteract(); }
      if (k === 'select') return this.openPanel();
      if (k === 'start') return this.openSystem();
      if (k.startsWith('cmd_')) return this.command(k.slice(4));
    },

    // ── 標題畫面 ──
    showTitle() {
      this.title = true; this.menus = []; this.renderMenu();
      $('#panel').classList.add('hidden');
      $('#title').classList.remove('hidden');
      const hasSave = SAVE_KEYS.some(k => LS.get(k));
      this.titleItems = [
        ...(hasSave ? [{ label: '繼續旅程', act: () => this.loadLatest() }] : []),
        { label: '新的旅程', act: () => this.newGame() },
        { label: '設定・模式', act: () => this.openSettings() },
      ];
      this.titleSel = 0; this.renderTitle();
    },
    renderTitle() {
      const ul = $('.title-menu'); ul.innerHTML = '';
      this.titleItems.forEach((it, i) => {
        const li = document.createElement('li'); li.textContent = it.label; if (i === this.titleSel) li.className = 'sel';
        li.addEventListener('click', () => { this.titleSel = i; this.beep(660); this.titleItems[i].act(); });
        ul.appendChild(li);
      });
    },
    titleInput(k) {
      if (k === 'up' || k === 'down') { this.titleSel = (this.titleSel + (k === 'up' ? -1 : 1) + this.titleItems.length) % this.titleItems.length; this.renderTitle(); }
      else if (k === 'a' || k === 'start') this.titleItems[this.titleSel].act();
    },
    hideTitle() { this.title = false; $('#title').classList.add('hidden'); },
    newGame() {
      const cfg = LS.get('witch_cfg', {});
      const name = cfg.name || '徒弟';
      E.init(name); AI.history = []; this.log = [];
      this.hideTitle(); this.refresh();
      this.jingle([523, 659, 784, 1046]);
      const intro = `山丘上的灰燼塔樓，煙囪冒著紫色的煙。\n\n你是魔女赫卡新收的徒弟——表面上的理由是「需要有人打掃」。\n\n「蠢徒弟，醒了就下來刷鍋。」樓下傳來赫卡沒睡飽的聲音。\n\n【玩法】\n上排六顆按鈕：地圖・採集・探索・調製・投擲・睡覺。\n出門採集素材，回塔樓調製藥水，升級成為獨當一面的魔女。\n至於要不要拿藥水去丟鎮上的人……赫卡說不行。\n\nⒶ 互動選單　SELECT 狀態背包　START 存檔・設定`;
      this.show({ text: intro, calc: [] }, '序章');
      if (this.mode === 'api' && AI.cfg.model) this.toast('API 模式：行動後由 AI 撰寫劇情');
    },
    loadLatest() {
      let best = null;
      SAVE_KEYS.forEach(k => { const s = LS.get(k); if (s && (!best || s.time > best.time)) best = s; });
      if (best) this.applySave(best);
    },

    // ── 存讀檔 ──
    snapshot() { return { time: Date.now(), state: E.S, log: this.log.slice(-60), history: AI.history.slice(-40) }; },
    autosave() { if (E.S) LS.set('witch_auto', this.snapshot()); },
    applySave(s) {
      E.load(s.state); this.log = s.log || []; AI.history = s.history || [];
      this.hideTitle(); this.menus = []; this.renderMenu(); this.refresh();
      const last = this.log[this.log.length - 1];
      this.show({ text: last ? last.text : '讀取完成。', calc: [] }, null, true);
      this.toast(`讀取：第${E.S.day}天 ${E.slotName()}`);
    },
    saveLabel(k) {
      const s = LS.get(k); if (!s) return '（空）';
      const d = new Date(s.time);
      return `第${s.state.day}天 ${D.SLOTS[s.state.slot]}・${D.LOCATIONS[s.state.loc].name}・Lv${s.state.level}　${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },

    // ── 狀態列與場景 ──
    refresh() {
      const S = E.S; if (!S) return;
      const L = E.loc();
      $('#st-day').textContent = `第${S.day}天`;
      $('#st-slot').textContent = E.slotName();
      $('#st-loc').textContent = L.name;
      $('#st-lv').textContent = S.level;
      $('#st-mp').textContent = `${S.mp}/${E.maxMp()}`;
      $('#st-mpbar').style.width = (100 * S.mp / E.maxMp()) + '%';
      $('#st-xpbar').style.width = S.level >= 10 ? '100%' : (100 * S.exp / E.needExp()) + '%';
      $('#st-xpbar').parentElement.parentElement.title = S.level >= 10 ? 'EXP MAX' : `EXP ${S.exp}/${E.needExp()}`;
      $('#st-wanted').textContent = S.wanted;
      $('#st-wanted').style.color = S.wanted >= 5 ? 'var(--red)' : S.wanted >= 3 ? '#ffd98a' : '';
      $('#st-favor').textContent = S.favor;
      const m = $('#st-mode'); m.textContent = this.mode === 'api' ? 'API' : '單機'; m.classList.toggle('api', this.mode === 'api');
      $('#nameplate').textContent = L.name;
      this.renderScene();
    },
    renderScene() {
      const S = E.S, L = E.loc(), [c1, c2, c3] = L.palette;
      $('.scene-bg').style.background = `linear-gradient(180deg, ${c1} 0%, ${c2} 62%, ${c3} 100%)`;
      const tint = ['#fff6e800', '#ffc27a40', '#6a3a9a70', '#0a0a30b0'][S.slot];
      $('.scene-tint').style.background = tint;
      $('.scene-fx').className = 'scene-fx fx-' + (S.slot >= 2 && L.fx === 'none' ? 'stars' : L.fx);
      $('.scene-icon').textContent = L.icon;
      $('.scene-label').innerHTML = `${esc(L.name)}<small>${D.DIST[L.dist]}・${D.DANGER[L.danger]}${E.isNight() && L.danger ? '↑' : ''}</small>`;
      // 可選的場景圖：assets/scenes/<id>.webp（以及 <id>_night.webp）
      const id = S.loc, night = S.slot >= 2;
      const img = $('.scene-img');
      const tryList = night ? [`assets/scenes/${id}_night.webp`, `assets/scenes/${id}.webp`] : [`assets/scenes/${id}.webp`];
      const want = tryList.join('|');
      if (img.dataset.want !== want) {
        img.dataset.want = want; img.classList.remove('on');
        const tryNext = (i) => {
          if (i >= tryList.length) return;
          const im = new Image();
          im.onload = () => { if (img.dataset.want === want) { img.style.backgroundImage = `url(${tryList[i]})`; img.classList.add('on'); } };
          im.onerror = () => tryNext(i + 1);
          im.src = tryList[i];
        };
        tryNext(0);
      }
      const h = $('.scene-hecate');
      const here = E.hecateHere();
      h.classList.toggle('on', here);
      if (!h.dataset.init) {
        h.dataset.init = 1; h.textContent = '🧙‍♀️';
        const im = new Image(); im.onload = () => { h.classList.add('img'); h.style.backgroundImage = 'url(assets/scenes/hecate.webp)'; }; im.src = 'assets/scenes/hecate.webp';
      }
    },
    fx(kind) {
      if (kind === 'shake') { const s = $('#screen'); s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); }
      if (kind === 'flash') { const s = $('#scene'); s.classList.remove('flash'); void s.offsetWidth; s.classList.add('flash'); }
    },
    toast(msg, err) {
      const t = $('#toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on');
      clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2400);
    },

    // ── 文字輸出（打字機） ──
    fmt(s) { return esc(s).replace(/「[^」]*(」|$)/g, m => `<span class="q">${m}</span>`).replace(/^（[^）]*）$/gm, m => `<span class="sys">${m}</span>`); },
    type(text, instant) {
      const el = $('#text');
      this.finishTyping(true);
      if (instant || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.innerHTML = this.fmt(text); el.scrollTop = 0; this.updateHint(); return; }
      let i = 0; const speed = 2;
      el.scrollTop = 0;
      this.typing = { text, timer: setInterval(() => {
        i += speed;
        el.innerHTML = this.fmt(text.slice(0, i)) + (i < text.length ? '<span class="caret"></span>' : '');
        if (el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight;
        if (i % 6 === 0) this.beep(880 + Math.random() * 200, 0.015, 'square', 0.015);
        if (i >= text.length) this.finishTyping();
      }, 28) };
    },
    finishTyping(silent) {
      if (!this.typing) return;
      clearInterval(this.typing.timer);
      if (!silent) $('#text').innerHTML = this.fmt(this.typing.text);
      this.typing = null; this.updateHint();
    },
    updateHint() {
      const el = $('#text'), h = $('#hint');
      const more = el.scrollHeight - el.scrollTop - el.clientHeight > 8;
      h.classList.toggle('more', more);
      h.textContent = more ? '▼ 還有內容（✚ 下捲）' : 'Ⓐ 互動　SELECT 背包　START 系統';
    },
    show(r, cmd, instant) {
      this.type(r.text, instant);
      $('#calc').textContent = (r.calc || []).map(c => '✦ ' + c).join('\n');
      this.refresh();
      if (cmd !== null) { this.log.push({ cmd: cmd || r.cmd || '', text: r.text, day: E.S.day, slot: E.slotName() }); if (this.log.length > 80) this.log.shift(); }
      this.autosave();
    },

    // ── 執行行動（單機直接顯示；API 交給 AI 寫） ──
    async run(r, opts = {}) {
      this.closeAllMenus();
      if (!r) return;
      if (r.calc && r.calc.some(c => c.startsWith('升級'))) { this.jingle([523, 659, 784, 1046, 1318]); this.fx('flash'); }
      if ((r.cmd || '').startsWith('【採集】') && (r.calc || []).some(c => /^魔力：\d+-\d+=/.test(c))) this.fx('shake');
      const useAI = this.mode === 'api' && !r.noAI && (r.facts || opts.userText);
      if (!useAI) { this.show(r); return; }
      if (!AI.cfg.model) { this.toast('尚未設定模型，改用單機文本', true); this.show(r); return; }
      const userMsg = opts.userText
        ? `（一般互動，不消耗時段）\n${opts.userText}\n\n${AI.stateBlock(E)}`
        : `${r.cmd || '（一般互動）'}\n【系統結算】\n${r.facts}\n\n${AI.stateBlock(E)}`;
      this.setBusy(true);
      $('#calc').textContent = (r.calc || []).map(c => '✦ ' + c).join('\n');
      this.refresh();
      const el = $('#text'); el.innerHTML = '<span class="caret"></span>';
      this.abort = new AbortController();
      try {
        const out = await AI.send(E, userMsg, r.cmd || '', (full) => {
          const p = AI.partial(full);
          el.innerHTML = this.fmt(p) + '<span class="caret"></span>';
          el.scrollTop = el.scrollHeight;
        }, this.abort.signal);
        if (r.potionId && (out.potionName || out.potionEffect)) {
          E.renamePotion(r.potionId, out.potionName, out.potionEffect);
          const p = E.S.potions.find(x => x.id === r.potionId);
          if (p) r.calc.push(`藥水命名：${p.name}〔${p.effect}〕`);
        }
        if (opts.allowFavor && typeof out.favor === 'number' && out.favor) E.favorChange(out.favor, r.calc = r.calc || [], '劇情');
        this.setBusy(false);
        this.show({ text: out.story, calc: r.calc }, r.cmd, true);
      } catch (err) {
        this.setBusy(false);
        const aborted = err.name === 'AbortError';
        this.toast(aborted ? '已取消，改用單機文本' : 'API 錯誤：' + String(err.message || err).slice(0, 60), !aborted);
        if (opts.userText) { const off = E.freeTalkOffline(opts.rawText || ''); this.show({ text: `${opts.rawText}\n\n${off.text}`, calc: off.calc }, '（一般互動）'); }
        else this.show(r);
      }
      this.abort = null;
    },
    setBusy(on) { this.busy = on; $('#busy').classList.toggle('hidden', !on); },

    // ── 指令按鈕 ──
    command(c) {
      const S = E.S, L = E.loc();
      if (c === 'map') return this.openMap();
      if (c === 'gather') {
        if (!L.mats) return this.flashMsg(`${L.name}沒有素材可以採集。`);
        return this.confirm(`在${L.name}採集？`, `消耗一個時段・經驗+3${L.nightOnly && !E.isNight() ? '\n（墓地白天沒有素材，只會發生事件）' : ''}`, () => this.run(E.gather()), 'gather');
      }
      if (c === 'explore') return this.confirm(`探索${L.name}？`, '消耗一個時段・經驗+3', () => this.run(E.explore()), 'explore');
      if (c === 'brew') return this.openBrew();
      if (c === 'throw') return this.openThrow();
      if (c === 'sleep') return this.confirm('睡覺，結束這一天？', `剩下的時段會直接跳過\n魔力回滿・通緝度-1${S.loc !== 'tower' ? '\n（會先回到灰燼塔樓）' : ''}`, () => { this.jingle([784, 659, 523, 392]); this.run(E.sleep()); }, 'sleep');
    },
    flashMsg(t) { this.closeAllMenus(); this.type(t); $('#calc').textContent = ''; },
    confirm(title, foot, yes, cmdKey) {
      this.openMenu({
        title, foot, compact: true, cmdKey,
        items: [{ label: '好', act: yes }, { label: '算了', act: () => this.popMenu() }],
      });
    },

    // ── 通用選單 ──
    openMenu(m) { m.sel = m.sel || 0; this.menus.push(m); this.skipSep(m, 1); this.renderMenu(); },
    popMenu() { this.menus.pop(); this.renderMenu(); },
    closeAllMenus() { this.menus = []; this.renderMenu(); },
    skipSep(m, dir) {
      const n = m.items.length; if (!n) return;
      for (let i = 0; i < n && m.items[m.sel] && m.items[m.sel].sep; i++) m.sel = (m.sel + dir + n) % n;
    },
    renderMenu() {
      const box = $('#menu');
      const m = this.menus[this.menus.length - 1];
      if (!m) { box.classList.add('hidden'); return; }
      if (m.refresh) m.refresh(m);
      box.classList.remove('hidden');
      box.classList.toggle('compact', !!m.compact);
      box.querySelector('.menu-title').innerHTML = `<span>${esc(m.title)}</span>${m.sub ? `<small>${esc(m.sub)}</small>` : ''}`;
      const ul = box.querySelector('.menu-list'); ul.innerHTML = '';
      m.items.forEach((it, i) => {
        const li = document.createElement('li');
        if (it.sep) { li.className = 'sep'; li.textContent = it.label; ul.appendChild(li); return; }
        li.className = (i === m.sel ? 'sel ' : '') + (it.disabled ? 'dis' : '');
        li.innerHTML = `<span class="lab">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span>` + (it.html || '') + (it.tags || []).map(t => `<span class="tag ${t[1] || ''}">${esc(t[0])}</span>`).join('');
        li.addEventListener('click', (ev) => {
          m.sel = i; this.beep(660);
          const q = ev.target.closest('[data-q]');
          if (q && q.dataset.q === '-' && it.left) { it.left(); this.renderMenu(); return; }
          if (q && q.dataset.q === '+' && it.right) { it.right(); this.renderMenu(); return; }
          this.menuInput('a');
        });
        ul.appendChild(li);
      });
      const f = typeof m.foot === 'function' ? m.foot(m) : m.foot || '';
      box.querySelector('.menu-foot').innerHTML = f;
      const sel = ul.children[m.sel]; if (sel) sel.scrollIntoView({ block: 'nearest' });
    },
    menuInput(k) {
      const m = this.menus[this.menus.length - 1]; const n = m.items.length;
      if (k === 'up' || k === 'down') { const d = k === 'up' ? -1 : 1; m.sel = (m.sel + d + n) % n; this.skipSep(m, d); this.renderMenu(); return; }
      const it = m.items[m.sel];
      if (k === 'left' && it && it.left) { it.left(); this.renderMenu(); return; }
      if (k === 'right' && it && it.right) { it.right(); this.renderMenu(); return; }
      if (k === 'a') {
        if (!it || it.sep) return;
        if (it.disabled) { this.beep(200, 0.08); if (it.why) this.toast(it.why); return; }
        it.act && it.act(); return;
      }
      if (k === 'b') { if (m.onBack) m.onBack(); else this.popMenu(); return; }
      if (k === 'start' && m.onStart) { m.onStart(); return; }
      if (k === 'select' && !this.menus.some(x => x.isSystem)) { this.openPanel(); return; }
      if (k.startsWith('cmd_')) {
        if (m.cmdKey === k.slice(4)) { const yes = m.items[0]; yes.act && yes.act(); return; } // 連按同一顆＝確定
        this.closeAllMenus(); this.command(k.slice(4));
      }
    },

    // ── 地圖 ──
    openMap() {
      const opts = E.travelOptions();
      const items = [];
      const groups = [['近', o => o.L.dist <= 1], ['遠', o => o.L.dist === 2]];
      groups.forEach(([g, f]) => {
        items.push({ sep: true, label: g === '近' ? '── 附近（不耗時段）' : '── 遠方（耗一個時段）' });
        opts.filter(f).forEach(o => {
          const dz = o.L.dist === 0 ? 0 : o.L.danger;
          items.push({
            label: `${o.L.icon} ${o.L.name}`,
            tags: [[D.DANGER[dz], 'd' + Math.min(3, dz + (E.isNight() && dz ? 1 : 0))], ...(o.cost ? [['耗時段', 'far']] : [])],
            disabled: o.blocked, why: '深夜只能回塔樓或睡覺',
            act: () => this.run(E.travel(o.id)),
          });
        });
      });
      this.openMenu({ title: '🗺 前往哪裡？', sub: `現在：${E.loc().name}・${E.slotName()}`, items, cmdKey: null, foot: E.isNight() ? '<em>夜間危險度提高一級</em>，越危險越容易遇到麻煩。' : '危險度越高，越容易遇上麻煩事件。' });
    },

    // ── 調製 ──
    openBrew() {
      if (E.S.loc !== 'tower') return this.flashMsg('這裡沒有鍋子，赫卡也不在。\n（調製只能在灰燼塔樓的煉藥房進行。）');
      if (E.isLateNight()) return this.run(E.blockNight());
      const sel = {};
      const total = () => Object.values(sel).reduce((a, b) => a + b, 0);
      const m = {
        title: '⚗ 調製', sub: '最多 5 份・魔力 -5',
        refresh: (m) => {
          const list = E.matList();
          m.items = [];
          if (!list.length) m.items.push({ label: '（沒有素材——先出門採集吧）', disabled: true });
          list.forEach(([k, n]) => {
            const [sc, tr] = D.MATERIALS[k];
            const add = () => { if ((sel[k] || 0) < n && total() < 5) sel[k] = (sel[k] || 0) + 1; else this.beep(200, .06); };
            const sub = () => { if (sel[k]) sel[k]--; };
            m.items.push({ label: k, sub: `分${sc}・${tr}・持有${n}`, html: `<span class="qty"><span data-q="-">◀</span><b>${sel[k] || 0}</b><span data-q="+">▶</span></span>`, right: add, left: sub, act: () => { add(); this.renderMenu(); } });
          });
          m.items.push({ sep: true, label: '──' });
          m.items.push({ label: '🔥 開始調製', disabled: !total(), why: '先放素材進鍋子', act: () => this.run(E.brew(Object.assign({}, sel))) });
          m.items.push({ label: '清空鍋子', act: () => { for (const k in sel) delete sel[k]; this.renderMenu(); } });
        },
        foot: () => {
          const pv = E.brewPreview(sel);
          const parts = pv.names.map(k => `${k}${sel[k] > 1 ? '×' + sel[k] : ''}`).join('＋') || '（空）';
          return `鍋裡：${esc(parts)}\n份數 <em>${pv.portions}/5</em>　素材分 <em>${pv.score}</em>（${pv.strength}）　魔力 ${E.S.mp}/${E.maxMp()}\n◀▶ 或點數字增減　品質＝手感(1-6)+等級${E.S.level}`;
        },
        items: [], onStart: () => total() && this.run(E.brew(Object.assign({}, sel))),
      };
      this.openMenu(m);
    },

    // ── 投擲 ──
    openThrow() {
      if (E.S.loc !== 'town') return this.flashMsg('這裡沒有可以丟的人。\n（投擲只能在苔石鎮進行。赫卡說過不行——不過你也沒打算聽吧？）');
      if (E.isLateNight()) return this.run(E.blockNight());
      const pots = E.S.potions;
      if (!pots.length) return this.flashMsg('你身上沒有藥水。先回塔樓調製吧。');
      this.openMenu({
        title: '🧪 要丟哪一瓶？', sub: `通緝度 ${E.S.wanted}（${E.wantedStage()}）`,
        items: pots.map(p => ({ label: `${p.name} ×${p.count}`, sub: p.effect, act: () => this.openTarget(p) })),
        foot: '投擲：通緝度+1，被目擊再+1，命中隊長／鎮長／公爵再+1。\n通緝度到 8 會被抓走。',
      });
    },
    openTarget(p) {
      const items = [{ label: '🎲 隨機（看緣分）', sub: '由骰子決定目標', act: () => this.run(E.throwPotion(p.id, 0)) }];
      D.RESIDENTS.forEach((r, i) => { if (r) items.push({ label: r.name, tags: r.vip ? [['通緝+1', 'd2']] : r.bard ? [['會寫成歌', 'd1']] : [], act: () => this.run(E.throwPotion(p.id, i)) }); });
      this.openMenu({ title: `瞄準誰？`, sub: p.name, items });
    },

    // ── 互動選單（A） ──
    openInteract() {
      const S = E.S, home = E.hecateHere(), items = [];
      if (home) {
        items.push({ label: '💬 和赫卡聊天', sub: S.flags.chatDay === S.day ? '今天已經聊過了（好感不再增加）' : '每天第一次聊天 好感+1', act: () => this.run(E.chat()) });
        const gifts = Object.keys(S.items).length + S.potions.length;
        items.push({ label: '🎁 送禮物', disabled: !gifts, why: '身上沒有能送的東西', act: () => this.openGift() });
        const untold = S.clues.filter(c => !S.cluesTold.includes(c));
        items.push({ label: '🔍 提起找到的線索', sub: S.clues.length ? `未提起 ${untold.length}／共 ${S.clues.length}` : '還沒有線索', disabled: !S.clues.length, why: '先去各地探索吧', act: () => this.openClues() });
        if (!S.lover) items.push({ label: '💌 告白……', act: () => this.confirm('真的要告白嗎？', '好感 80 以上才會被認真看待喔。', () => this.run(E.confess())) });
      }
      if (E.carloHere()) items.push({ label: '🪙 和卡洛交易', act: () => this.openTrade() });
      items.push({ label: this.mode === 'api' ? '✏️ 自由說話／行動（AI）' : '✏️ 自由說話（單機）', sub: this.mode === 'api' ? '不消耗時段，AI 依世界書回應' : '單機模式只有簡單的關鍵字回應', act: () => this.openInput() });
      items.push({ label: '📜 狀態・背包', act: () => { this.closeAllMenus(); this.openPanel(); } });
      if (!home) items.unshift({ label: `（赫卡不在${E.loc().name}。她平時待在灰燼塔樓。）`, disabled: true });
      this.openMenu({ title: '互動', sub: `${E.loc().name}・${E.slotName()}`, items, compact: items.length <= 3 });
    },
    openGift() {
      const S = E.S, items = [];
      Object.entries(S.items).forEach(([k, n]) => items.push({ label: `${k} ×${n}`, sub: k === '蜂蜜麵包' ? '赫卡的最愛（不敢自己去買）' : '', act: () => this.run(E.gift('item', k)) }));
      S.potions.forEach(p => items.push({ label: `${p.name} ×${p.count}`, sub: `${p.quality}・${p.effect}`, act: () => this.run(E.gift('potion', p.id)) }));
      this.openMenu({ title: '🎁 送什麼？', items, foot: '赫卡喜歡：甜食（尤其波頓的蜂蜜麵包）、星空、失控的怪藥水。' });
    },
    openClues() {
      const S = E.S;
      const items = S.clues.map(c => ({ label: c, tags: S.cluesTold.includes(c) ? [['已提起']] : [['新', 'd1']], act: () => this.run(E.tellClue(c)) }));
      this.openMenu({ title: '🔍 要提起哪件事？', sub: `關係：${E.stage()}`, items, foot: '赫卡會依關係階段，一點一點透露她的過去。' });
    },
    openTrade() {
      const S = E.S, items = [];
      items.push({ sep: true, label: '── 用藥水換外地素材' });
      S.potions.forEach(p => {
        const good = p.legendary || p.quality === '穩定' || p.quality === '極品';
        items.push({ label: `${p.name}`, sub: good ? '→ 外地稀有素材×1' : p.quality === '失控' ? '→ 外地素材×2（卡洛特別喜歡失控藥水）' : '→ 外地普通素材×2', act: () => this.run(E.trade('potion', p.id)) });
      });
      if (S.flags.mysteryDay === S.day && S.potions.length) {
        items.push({ sep: true, label: '── 來歷不明的東西' });
        items.push({ label: '用一瓶藥水交換', act: () => this.openMenu({ title: '用哪一瓶換？', items: S.potions.map(p => ({ label: p.name, act: () => this.run(E.trade('mystery', p.id)) })) }) });
      }
      items.push({ sep: true, label: '── 素材×3 換外地普通素材×1' });
      const mats = E.matList();
      items.push({ label: '挑三個素材交換', disabled: E.totalMats() < 3, why: '素材不足 3 個', act: () => this.openTradeMats() });
      this.openMenu({ title: '🪙 卡洛的攤位', sub: '以物易物', items, foot: '外地素材：東方火椒、沙漠蠍尾、雪狐毛、巨人指甲屑\n稀有：海妖鱗片、鳳凰灰燼' });
      void mats;
    },
    openTradeMats() {
      const picked = [];
      const m = {
        title: '選三個素材', refresh: (m) => {
          m.items = E.matList().map(([k, n]) => {
            const used = picked.filter(x => x === k).length;
            return { label: `${k}`, sub: `持有${n}`, html: `<span class="qty"><b>${used}</b></span>`, act: () => { if (used < n && picked.length < 3) picked.push(k); else { const i = picked.indexOf(k); if (i >= 0) picked.splice(i, 1); } if (picked.length === 3) this.run(E.trade('mats', picked.slice())); else this.renderMenu(); } };
          });
        }, items: [], foot: () => `已選：${picked.join('、') || '—'}（${picked.length}/3）`,
      };
      this.openMenu(m);
    },

    // ── 自由輸入 ──
    bindInput() {
      $('#input-cancel').addEventListener('click', () => this.closeInput());
      $('#input-send').addEventListener('click', () => this.sendInput());
    },
    openInput() {
      this.closeAllMenus();
      $('#inputbox').classList.remove('hidden');
      $('.input-title').textContent = this.mode === 'api' ? `說話／行動（${E.hecateHere() ? '赫卡在場' : E.loc().name}）` : '對赫卡說……（單機簡易回應）';
      setTimeout(() => $('#freetext').focus(), 50);
    },
    closeInput() { $('#inputbox').classList.add('hidden'); $('#freetext').blur(); },
    sendInput() {
      const t = $('#freetext').value.trim(); if (!t) return;
      $('#freetext').value = ''; this.closeInput();
      if (this.mode === 'api' && AI.cfg.model) {
        this.run({ ok: true, cmd: '', text: '', facts: '', calc: [] }, { userText: `${E.S.name}：${t}`, rawText: t, allowFavor: true });
      } else {
        const r = E.freeTalkOffline(t);
        this.show({ text: `「${t.replace(/^「|」$/g, '')}」\n\n${r.text}`, calc: r.calc }, '（一般互動）');
      }
    },

    // ── 狀態面板（SELECT） ──
    tabs: ['狀態', '素材', '藥水', '道具・線索', '日誌'],
    openPanel() {
      $('#panel').classList.remove('hidden'); this.renderPanel();
    },
    closePanel() { $('#panel').classList.add('hidden'); },
    panelInput(k) {
      if (k === 'left' || k === 'right') { this.panelTab = (this.panelTab + (k === 'left' ? -1 : 1) + this.tabs.length) % this.tabs.length; this.renderPanel(); }
      else if (k === 'up' || k === 'down') $('.panel-body').scrollBy({ top: (k === 'up' ? -1 : 1) * 50, behavior: 'smooth' });
      else if (k === 'b' || k === 'select' || k === 'a') this.closePanel();
      else if (k === 'start') { this.closePanel(); this.openSystem(); }
    },
    renderPanel() {
      const S = E.S;
      const tabs = $('#panel .tabs'); tabs.innerHTML = '';
      this.tabs.forEach((t, i) => { const b = document.createElement('button'); b.textContent = t; if (i === this.panelTab) b.className = 'on'; b.onclick = () => { this.panelTab = i; this.renderPanel(); }; tabs.appendChild(b); });
      let h = '';
      if (this.panelTab === 0) {
        const pips = Array.from({ length: 8 }, (_, i) => `<span class="${i < S.wanted ? 'on' : ''}">${i < S.wanted ? '⚑' : '·'}</span>`).join('');
        h = `<h4>${esc(S.name)}　Lv ${S.level}</h4><div class="kv">
          <b>天數</b><span>第${S.day}天・${E.slotName()}</span>
          <b>位置</b><span>${E.loc().name}</span>
          <b>魔力</b><span>${S.mp}／${E.maxMp()}</span>
          <b>經驗</b><span>${S.level >= 10 ? 'MAX' : `${S.exp}／${E.needExp()}`}</span>
          <b>通緝度</b><span class="pips">${pips} ${S.wanted}（${E.wantedStage()}）</span>
          <b>好感</b><span>${S.favor}（${E.stage()}）</span>
          ${S.flags.cleaning ? `<b>懲罰</b><span>還要打掃 ${S.flags.cleaning} 個早上</span>` : ''}
          <b>模式</b><span>${this.mode === 'api' ? `外接 API（${esc(AI.cfg.model || '未設定模型')}）` : '單機'}</span>
        </div>
        <h4>傳說配方</h4><div class="muted">${S.legendDone.length ? S.legendDone.join('、') : '尚未做出。據說有五種……'}</div>`;
      } else if (this.panelTab === 1) {
        const list = E.matList();
        h = list.length ? '<div class="kv">' + list.map(([k, n]) => `<b>${esc(k)}</b><span>×${n}　<span class="muted">分${D.MATERIALS[k][0]}・${D.MATERIALS[k][1]}</span></span>`).join('') + '</div>' : '<div class="muted">無</div>';
      } else if (this.panelTab === 2) {
        h = S.potions.length ? S.potions.map(p => `<div class="pot"><b>${esc(p.name)}</b> ×${p.count}<small>〔${esc(p.effect)}〕${p.quality !== '?' ? `　品質：${p.quality}・強度：${p.strength}` : ''}${p.legendary ? '・傳說' : ''}</small></div>`).join('') : '<div class="muted">無</div>';
      } else if (this.panelTab === 3) {
        const it = Object.entries(S.items);
        h = '<h4>道具</h4>' + (it.length ? '<div class="kv">' + it.map(([k, n]) => `<b>${esc(k)}</b><span>×${n}</span>`).join('') + '</div>' : '<div class="muted">無</div>');
        h += '<h4>線索</h4>' + (S.clues.length ? S.clues.map(c => `<div>${S.cluesTold.includes(c) ? '✓' : '✦'} ${esc(c)}</div>`).join('') : '<div class="muted">各地的探索中，似乎藏著赫卡的過去……</div>');
      } else {
        h = this.log.length ? this.log.slice().reverse().map(l => `<div class="log"><b>第${l.day}天 ${l.slot}　${esc(l.cmd || '')}</b>${esc(l.text)}</div>`).join('') : '<div class="muted">還沒有紀錄。</div>';
      }
      $('.panel-body').innerHTML = h; $('.panel-body').scrollTop = 0;
    },

    // ── 系統選單（START） ──
    openSystem() {
      this.openMenu({
        title: '✦ 系統', isSystem: true,
        items: [
          { label: '存檔', act: () => this.openSaves(true) },
          { label: '讀檔', act: () => this.openSaves(false) },
          { label: `模式：${this.mode === 'api' ? '外接 API' : '單機'}`, sub: '切換／設定 API', act: () => { this.closeAllMenus(); this.openSettings(); } },
          { label: `音效：${this.sound ? '開' : '關'}`, act: () => { this.sound = !this.sound; this.saveCfg(); this.popMenu(); this.openSystem(); } },
          { label: '清除 AI 對話記憶', sub: `目前 ${AI.history.length / 2 | 0} 輪`, act: () => { AI.history = []; this.toast('已清除'); this.popMenu(); } },
          { label: '回到標題', act: () => { this.autosave(); this.showTitle(); } },
        ],
        onStart: () => this.popMenu(),
      });
    },
    openSaves(saving) {
      const items = SAVE_KEYS.map((k, i) => ({
        label: i === 0 ? '自動存檔' : `存檔 ${i}`, sub: this.saveLabel(k),
        disabled: saving ? i === 0 : !LS.get(k), why: saving ? '自動存檔會在每次行動後更新' : '空的',
        act: () => {
          if (saving) { LS.set(k, this.snapshot()) ? this.toast('已存檔') : this.toast('存檔失敗', true); this.popMenu(); }
          else { this.closeAllMenus(); this.applySave(LS.get(k)); }
        },
      }));
      this.openMenu({ title: saving ? '存檔到哪裡？' : '讀取哪個存檔？', items, isSystem: true, foot: '存檔保存在這台裝置的瀏覽器中。' });
    },

    // ── 設定視窗 ──
    bindSettings() {
      $('#set-close').onclick = () => this.closeSettings();
      $('#set-save').onclick = () => this.saveSettings();
      $('#set-preset').onchange = (e) => { if (e.target.value) $('#set-url').value = e.target.value; };
      document.querySelectorAll('input[name=mode]').forEach(r => r.onchange = () => { $('#api-fields').disabled = !$('input[name=mode][value=api]').checked; });
      $('#set-fetch').onclick = async () => {
        this.readSettingsInto(); const res = $('#set-test-result');
        res.textContent = '抓取中…'; res.className = '';
        try { const list = await AI.listModels(); $('#model-list').innerHTML = list.map(m => `<option value="${esc(m)}">`).join(''); res.textContent = `找到 ${list.length} 個模型（點模型欄位選擇）`; res.className = 'ok'; }
        catch (e) { res.textContent = '抓取失敗：' + e.message; res.className = 'bad'; }
      };
      $('#set-test').onclick = async () => {
        this.readSettingsInto(); const res = $('#set-test-result');
        res.textContent = '測試中…'; res.className = '';
        try {
          const r = await fetch(AI.endpoint(), { method: 'POST', headers: AI.headers(), body: JSON.stringify({ model: AI.cfg.model, messages: [{ role: 'user', content: '用赫卡的口吻，十個字以內罵一下徒弟。' }], max_tokens: 60 }) });
          if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
          const j = await r.json(); res.textContent = '成功：' + AI.clean(j.choices?.[0]?.message?.content || '').story.slice(0, 40); res.className = 'ok';
        } catch (e) { res.textContent = '失敗：' + e.message; res.className = 'bad'; }
      };
      $('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') this.closeSettings(); });
    },
    openSettings() {
      const cfg = LS.get('witch_cfg', {});
      $('#set-name').value = (E.S && E.S.name) || cfg.name || '徒弟';
      $(`input[name=mode][value=${this.mode}]`).checked = true;
      $('#api-fields').disabled = this.mode !== 'api';
      $('#set-url').value = AI.cfg.baseUrl; $('#set-key').value = AI.cfg.apiKey; $('#set-model').value = AI.cfg.model;
      $('#set-temp').value = AI.cfg.temperature; $('#set-max').value = AI.cfg.maxTokens; $('#set-hist').value = AI.cfg.history;
      $('#set-stream').checked = !!AI.cfg.stream; $('#set-extra').value = AI.cfg.extra || '';
      $('#set-test-result').textContent = '';
      $('#settings').classList.remove('hidden');
    },
    readSettingsInto() {
      AI.cfg.baseUrl = $('#set-url').value.trim() || 'https://api.openai.com/v1';
      AI.cfg.apiKey = $('#set-key').value.trim(); AI.cfg.model = $('#set-model').value.trim();
      AI.cfg.temperature = parseFloat($('#set-temp').value) || 0.9; AI.cfg.maxTokens = parseInt($('#set-max').value) || 1200;
      AI.cfg.history = Math.max(0, parseInt($('#set-hist').value) || 0); AI.cfg.stream = $('#set-stream').checked; AI.cfg.extra = $('#set-extra').value.trim();
    },
    saveSettings() {
      this.readSettingsInto();
      this.mode = $('input[name=mode][value=api]').checked ? 'api' : 'offline';
      const name = $('#set-name').value.trim() || '徒弟';
      const cfg = { mode: this.mode, sound: this.sound, ai: AI.cfg, name };
      LS.set('witch_cfg', cfg);
      if (E.S) E.S.name = name;
      if (this.mode === 'api' && !AI.cfg.model) this.toast('請填寫模型名稱', true);
      this.closeSettings(); this.refresh();
      if (!this.title) this.toast(this.mode === 'api' ? '已切換：外接 API 模式' : '已切換：單機模式');
    },
    closeSettings() { $('#settings').classList.add('hidden'); },
  };

  window.UI = UI;
  document.addEventListener('DOMContentLoaded', () => UI.init());
})();

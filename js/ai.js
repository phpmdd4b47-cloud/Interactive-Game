/* 女巫升級計畫 — 外接 API（OpenAI 相容格式：OpenAI / OpenRouter / DeepSeek / Gemini 相容端點 / 本地 LM Studio、Ollama 等） */
(function () {
  const AI = {
    cfg: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: '', temperature: 0.9, maxTokens: 1200, stream: true, history: 12, extra: '' },
    history: [], // {role, content}

    // 依目前地點與指令挑選世界書條目（常駐 + 關鍵字觸發），並替換 {{user}}
    buildSystem(state, cmd) {
      const name = state.name;
      const locName = window.GAME_DATA.LOCATIONS[state.loc].name;
      const scan = `${cmd || ''} ${locName}`;
      const skip = ['<狀態欄>', '<輸出格式>'];
      const entries = window.WORLDBOOK
        .filter(e => !skip.some(s => e.name.includes(s)))
        .filter(e => e.constant || e.keys.some(k => scan.includes(k)))
        .sort((a, b) => a.order - b.order)
        .map(e => e.content.replace(/\{\{user\}\}/g, name));
      const rules = `<網頁版說明>
你正在一個掌機風格的網頁遊戲裡擔任旁白與赫卡。玩家的名字是「${name}」。
1. 所有擲骰與數值（魔力、經驗、等級、時段、通緝度、好感、素材、藥水）都已由遊戲系統計算好，會寫在【系統結算】中。結果必須完全遵守，不可更改，也不要在正文提起骰子、暗號或數字算式。
2. 不要輸出狀態欄、<calc>、表格或程式碼框，面板由系統繪製。
3. 只輸出 <正文>……</正文>。正文用繁體中文，第二人稱或第三人稱皆可，300～500字為宜，對話用「」。不替${name}說出台詞，除非玩家自己寫了。
4. 一般互動（沒有系統結算）時，若劇情中赫卡的好感確實有變動，在正文之後輸出 <好感>+1</好感> 這樣的標籤（每則最多±3）；沒有變動就不要輸出。
5. 調製時若系統要求，在正文之後輸出 <藥水名>…</藥水名><效果>…</效果>。
</網頁版說明>`;
      return entries.join('\n\n') + '\n\n' + rules + (this.cfg.extra ? `\n\n<玩家補充設定>\n${this.cfg.extra}\n</玩家補充設定>` : '');
    },

    stateBlock(E) {
      const S = E.S, D = window.GAME_DATA;
      const mats = E.matList().map(([k, n]) => `${k}×${n}`).join('、') || '無';
      const pots = S.potions.map(p => `${p.name}〔${p.effect}〕×${p.count}`).join('、') || '無';
      return `[目前狀態] 第${S.day}天｜${E.slotName()}｜位置：${D.LOCATIONS[S.loc].name}｜等級${S.level}｜魔力${S.mp}/${E.maxMp()}｜通緝度${S.wanted}（${E.wantedStage()}）｜好感${S.favor}（${E.stage()}）｜素材：${mats}｜藥水：${pots}｜已發現線索：${S.clues.join('、') || '無'}`;
    },

    endpoint() { return this.cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions'; },
    headers() {
      const h = { 'Content-Type': 'application/json' };
      if (this.cfg.apiKey) h['Authorization'] = 'Bearer ' + this.cfg.apiKey;
      if (/openrouter\.ai/.test(this.cfg.baseUrl)) { h['HTTP-Referer'] = location.href; h['X-Title'] = 'Witch Console'; }
      return h;
    },

    async listModels() {
      const r = await fetch(this.cfg.baseUrl.replace(/\/+$/, '') + '/models', { headers: this.headers() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      return (j.data || j.models || []).map(m => m.id || m.name).filter(Boolean).sort();
    },

    // userMsg：送給模型的使用者訊息；onDelta：串流時每段文字的回呼
    async send(E, userMsg, cmd, onDelta, signal) {
      const msgs = [{ role: 'system', content: this.buildSystem(E.S, cmd) }];
      const hist = this.history.slice(-this.cfg.history * 2);
      msgs.push(...hist);
      msgs.push({ role: 'user', content: userMsg });
      const body = { model: this.cfg.model, messages: msgs, temperature: Number(this.cfg.temperature), max_tokens: Number(this.cfg.maxTokens), stream: !!this.cfg.stream };
      const r = await fetch(this.endpoint(), { method: 'POST', headers: this.headers(), body: JSON.stringify(body), signal });
      if (!r.ok) {
        let t = ''; try { t = (await r.text()).slice(0, 300); } catch (e) { }
        throw new Error(`HTTP ${r.status} ${t}`);
      }
      let full = '';
      const ct = r.headers.get('content-type') || '';
      if (body.stream && r.body && !ct.includes('application/json')) {
        const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n'); buf = lines.pop();
          for (const line of lines) {
            const s = line.trim(); if (!s.startsWith('data:')) continue;
            const data = s.slice(5).trim(); if (data === '[DONE]') continue;
            try {
              const j = JSON.parse(data);
              const d = j.choices?.[0]?.delta?.content ?? j.choices?.[0]?.text ?? '';
              if (d) { full += d; onDelta && onDelta(full); }
            } catch (e) { }
          }
        }
      } else {
        const j = await r.json();
        full = j.choices?.[0]?.message?.content ?? '';
        onDelta && onDelta(full);
      }
      if (!full.trim()) throw new Error('模型沒有回傳內容');
      this.history.push({ role: 'user', content: userMsg }, { role: 'assistant', content: this.clean(full).story });
      if (this.history.length > 60) this.history = this.history.slice(-60);
      return this.clean(full);
    },

    // 解析模型輸出：正文、好感、藥水名與效果
    clean(raw) {
      let txt = raw.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
      const out = {};
      const fav = txt.match(/<好感>\s*([+\-－＋]?\s*\d+)\s*<\/好感>/);
      if (fav) out.favor = parseInt(fav[1].replace(/[＋\s]/g, '').replace('－', '-'), 10);
      const pn = txt.match(/<藥水名>([\s\S]*?)<\/藥水名>/); if (pn) out.potionName = pn[1].trim();
      const pe = txt.match(/<效果>([\s\S]*?)<\/效果>/); if (pe) out.potionEffect = pe[1].trim();
      const m = txt.match(/<正文>([\s\S]*?)(<\/正文>|$)/);
      let story = m ? m[1] : txt;
      story = story.replace(/<calc>[\s\S]*?<\/calc>/g, '').replace(/\[\[狀態欄\]\][\s\S]*?(\[\[\/狀態欄\]\]|$)/g, '')
        .replace(/<好感>[\s\S]*?<\/好感>/g, '').replace(/<藥水名>[\s\S]*?<\/藥水名>/g, '').replace(/<效果>[\s\S]*?<\/效果>/g, '')
        .replace(/<\/?[a-zA-Z一-鿿][^>]{0,20}>/g, '').replace(/```/g, '').trim();
      out.story = story;
      return out;
    },

    // 串流中途顯示用：只取正文部分
    partial(raw) {
      const t = raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '');
      const m = t.match(/<正文>([\s\S]*?)(<\/正文>|$)/);
      return (m ? m[1] : t.replace(/<[^>]*>?/g, '')).replace(/<[^>]*$/, '').trim();
    },
  };
  window.AI = AI;
})();

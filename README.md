# 女巫升級計畫 · Witch Console

把 Tavo 世界書〈女巫升級計畫〉做成可以玩的掌機風小網頁。螢幕原本拿來 RP 的地方，現在是遊戲畫面。

## 怎麼玩

直接用瀏覽器打開 `index.html` 就能玩（或開 GitHub Pages，見下方）。

| 按鈕 | 功能 | 鍵盤 |
|---|---|---|
| 上排六顆 | 地圖（前往）・採集・探索・調製・投擲・睡覺 | `1`–`6` |
| 十字鍵 | 選單移動、捲動文字、◀▶ 調整份數／切換分頁 | 方向鍵 |
| A（綠） | 確定／略過打字／開啟互動選單 | `Z`、空白、`Enter` |
| B（紅） | 返回 | `X`、`Esc` |
| SELECT | 狀態・素材・藥水・線索・日誌 | `Shift` |
| START | 存檔・讀檔・模式設定・音效 | `P` |

互動選單（按 A）：和赫卡聊天、送禮、提起找到的線索、告白、和卡洛交易、自由說話。

## 兩種模式

**單機模式**：世界書的規則全部寫成程式，包括時段、移動、採集事件、探索表、調製的強度與品質、傳說配方、投擲骰、通緝度、被捕保釋、等級、好感與關係階段。劇情用內建文本，完全離線。

**外接 API 模式**：擲骰和數值還是由遊戲計算（跟原本在 Tavo 用正則產生暗號是同一個概念），算好的結果連同世界書一起交給 AI，AI 只負責寫正文。這樣數值不會被 AI 算錯，劇情又能更豐富。
- 支援 **OpenAI 相容格式**：OpenAI、OpenRouter（可以用 Claude、Gemini 等）、DeepSeek、Google Gemini 的相容端點、LM Studio／Ollama 本機模型。
- 世界書條目依「常駐」與「關鍵字」挑選：目前所在地點的條目、調製時的〈素材總表〉〈調製規則〉、投擲時的〈投擲骰〉才會送出，省 token。
- 調製時 AI 可以替藥水重新命名、寫效果（`<藥水名>` `<效果>`），自由對話時可以用 `<好感>+1</好感>` 調整好感（每則最多 ±3）。
- API 呼叫失敗或按 B 取消時，會自動改用單機文本，不會卡住。
- API Key 只存在你自己瀏覽器的 localStorage。

## 檔案

```
index.html          頁面
css/style.css       樣式
js/data.js          遊戲資料（地點、素材、特性、居民、赫卡台詞）
js/worldbook.js     原始世界書（由 Tavo JSON 轉出，API 模式用）
js/engine.js        規則引擎（擲骰、數值）
js/ai.js            API 串接
js/ui.js            畫面、按鈕、選單
assets/console/     掌機外框與按鈕圖
assets/scenes/      （選填）場景圖與赫卡立繪，見裡面的 README
```

## 放上 GitHub Pages

Repo → Settings → Pages → Source 選「Deploy from a branch」→ 選分支與 `/ (root)` → Save。幾分鐘後就會有網址。

## 更新世界書

改完 Tavo 世界書後，重新匯出 JSON 覆蓋 `Tavo_女巫升級計畫_1NOMv.json`，再執行：

```bash
python3 -c "
import json
d=json.load(open('Tavo_女巫升級計畫_1NOMv.json'))
out=[{'name':e['name'],'constant':e['constant'],'keys':e['key'],'order':e.get('order',0),'content':e['content']} for k,e in sorted(d['entries'].items(), key=lambda x:int(x[0]))]
open('js/worldbook.js','w').write('window.WORLDBOOK = '+json.dumps(out,ensure_ascii=False,indent=1)+';\n')
"
```

API 模式會用新的世界書。單機模式的數值表（素材分、探索表等）寫在 `js/data.js`，要同步的話也要改那裡。

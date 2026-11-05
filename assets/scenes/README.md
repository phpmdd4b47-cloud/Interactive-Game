# 場景圖（選填）

把圖片放進這個資料夾，遊戲會自動使用；沒有圖就顯示內建的漸層＋圖示。

| 檔名 | 地點 |
|---|---|
| `tower.webp` | 灰燼塔樓 |
| `town.webp` | 苔石鎮 |
| `forest.webp` | 迷霧森林 |
| `cave.webp` | 回音洞窟 |
| `swamp.webp` | 泥濘沼澤 |
| `graveyard.webp` | 舊墓地 |
| `windmill.webp` | 風車丘 |
| `crossroads.webp` | 十字路口驛站 |
| `mushroom.webp` | 妖精蘑菇谷 |
| `lake.webp` | 月影湖 |
| `peak.webp` | 星落山頂 |
| `stones.webp` | 沉眠石環 |
| `hecate.webp` | 赫卡立繪（去背 PNG 轉 webp，在塔樓時顯示在右下角） |

- 每個地點也可以多放一張夜晚版：`<檔名>_night.webp`（例如 `forest_night.webp`），晚上與深夜會優先使用。
- 建議比例 **3:2 橫式**（例如 1200×800），畫面會裁切置中。
- 沒有 webp 的話，可以先用任何轉檔工具把 PNG 轉成 webp（檔案小很多）。

## 給 GPT 的生圖提示詞範本

共通風格（每張都加在最前面）：

> 2D fantasy game background, cozy storybook illustration, soft painterly style, muted purple and warm gold palette, no text, no characters, wide 3:2 composition,

各地點：

- **tower**：an ivy-covered stone witch tower on a hill, chimney puffing purple smoke, cluttered potion lab visible through the window
- **town**：a small mossy stone town with red roofs, cobblestone square with a fountain and a notice board, a fat orange cat sunbathing
- **forest**：a forest with thick white mist flowing along the ground, only the tree tops visible, faintly glowing silver grass
- **cave**：a dark cave with thousands of bats on the ceiling, an underground pool with glowing fish, bioluminescent moss
- **swamp**：a smelly muddy swamp with a wobbly wooden boardwalk, glowing green lantern mushrooms at dusk, frogs
- **graveyard**：an old graveyard at night, rusty iron gate, crooked tombstones, a small caretaker's hut with a lamp
- **windmill**：rolling golden wheat fields in strong wind, an abandoned windmill, an old scarecrow in the middle of the field
- **crossroads**：a crossroads with a small roadside inn and a stone well, a merchant's colorful stall with odd goods
- **mushroom**：a valley of giant mushrooms taller than houses, tiny fairy houses under the caps, a sign "humans behave"
- **lake**：a mirror-still lake under the moon, an old wooden pier with a small boat, a tiny pavilion on an island
- **peak**：a high mountain summit under a starry sky, meteor craters glittering with stardust, an ancient stone observatory platform
- **stones**：an ancient stone circle in a cold barren wasteland, runes carved on the megaliths, a scorched stone altar in the center

赫卡立繪：

> full body anime-style illustration of a witch who looks 27, long messy black hair loosely tied with a few ash-white burnt strands at the tips, crooked pointed hat, robe with potion stains, amber eyes, lazy and sharp-tongued expression, transparent background

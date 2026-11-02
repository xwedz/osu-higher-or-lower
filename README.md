# osu! Higher or Lower

猜猜看下一位 osu! 玩家的數值（遊玩次數、準確率、遊玩時數）比較高還是比較低。

**線上遊玩：<https://osuhigherlower.xwedz.dev>**

- 前端：React + Vite + Tailwind（`client/`）
- 後端：Cloudflare Worker + Hono（`src/`），資料庫是 Cloudflare D1（SQLite）
- 前端與 API 由同一個 Worker 提供，同一個網址

## 本機開發

```bash
npm install
npm --prefix client install

# 1. 設定機密：複製 .dev.vars.example → .dev.vars（Worker 用），env.example → .env（抓取腳本用）
# 2. 建立本機資料庫並抓玩家資料
npm run db:migrate
npm run fetch:players
npm run fetch:famous

# 3. 開兩個終端機
npm run dev      # Worker + 本機 D1，http://localhost:3000
npm run client   # Vite 前端，http://localhost:5173（/api 會轉發到 3000）
```

osu! 登入需要一個 OAuth 應用程式：到 [osu! 帳號設定頁](https://osu.ppy.sh/home/account/edit) 的 OAuth 區塊建立，
並在 Callback URLs 加入 `http://localhost:3000/api/auth/callback`。

## 管理玩家資料

| 指令 | 作用 |
|---|---|
| `npm run fetch:players` | 抓全球排行榜前 1000 名，寫進**本機**資料庫 |
| `npm run fetch:famous` | 依 `scripts/famousPlayers.json` 抓知名玩家（Famous 玩家池） |
| 上面兩個指令後面加 ` -- --remote` | 改寫進**線上**資料庫 |

- 想新增知名玩家：把 osu! user id 和一句話說明加進 `scripts/famousPlayers.json`，再跑 `fetch:famous`。
- 從名單刪掉的玩家**不會**自動從資料庫移除。
- 線上的 Worker 會把玩家名單快取 10 分鐘，重新抓取後最多 10 分鐘生效。
- Top 100 / Top 1000 是依抓取當下的排名，想保持準確請定期重跑 `fetch:players`。

## 部署到 Cloudflare（免費方案）

第一次部署：

```bash
npx wrangler login                              # 瀏覽器登入 Cloudflare
npx wrangler d1 create osu-higher-lower         # 建立線上資料庫，把印出的 database_id 填進 wrangler.jsonc
npm run db:migrate:remote                       # 建立資料表

npx wrangler secret put OSU_CLIENT_ID
npx wrangler secret put OSU_CLIENT_SECRET
npx wrangler secret put ROUND_TOKEN_SECRET      # 請用新的隨機字串，不要跟本機共用

npm run deploy                                  # 建置前端並部署 Worker，會印出網址（*.workers.dev）
npm run fetch:players -- --remote               # 把玩家資料寫進線上資料庫
npm run fetch:famous -- --remote
```

部署後：到 osu! OAuth 應用程式設定，把 `https://<你的網址>/api/auth/callback` 加進 Callback URLs。

之後更新網站只需要 `npm run deploy`。

## 更新知名玩家名單

1. 編輯 `scripts/famousPlayers.json`（新增 id 與 note）。
2. `npm run fetch:famous -- --remote` 寫進線上（想在本機也看到，就再跑一次不帶 `--remote` 的）。
3. 線上最多 10 分鐘內生效（Worker 有 10 分鐘的名單快取）。

要移除某位玩家的 Famous 身分（腳本不會自動移除）：

```bash
npx wrangler d1 execute osu-higher-lower --remote --command "UPDATE Player SET isSpecial = 0, note = NULL WHERE osuUserId = 123456"
```

## 免費方案的限制

- Worker：每天 10 萬次請求；每次請求 CPU 10ms。為了讓舊網址能轉址，所有請求都先經過 Worker，所以前端靜態檔案也會計入。
- D1：每天讀 500 萬列、寫 10 萬列。每次猜測會寫入 1 筆（防重放），所以約每天 10 萬次猜測上限。
- 超過額度時 API 會回錯誤，隔天（UTC 零點）重置。需要時可升級 Workers Paid（US$5/月）。

## 防濫用

- 每個 IP 每分鐘最多 100 個 API 請求（`wrangler.jsonc` 的 `ratelimits`），超過回 429。
  這是「依資料中心分別計算的寬鬆限制」，擋得住單一來源猛刷，但被擋下的請求仍會算進每天 10 萬次的額度。
- 想真正保護額度，需要自訂網域，再用 Cloudflare 的 WAF 頻率限制規則（免費方案有 1 條）在請求到達 Worker 之前就擋掉。

## 注意

- 本機的 D1 是依 `database_id` 分開存放的。如果改了 `wrangler.jsonc` 裡的 `database_id`，
  本機會變成全新的空資料庫，需要重跑 `npm run db:migrate`、`npm run fetch:players`、`npm run fetch:famous`。

## 目錄結構

```
src/            Worker（Hono）：API、登入、簽章 token
migrations/     D1 資料庫結構（wrangler 管理）
scripts/        抓取玩家資料的腳本
client/         React 前端
wrangler.jsonc  Cloudflare 設定
```

## 授權

本專案的程式碼以 [GNU Affero General Public License v3.0](LICENSE)（AGPL-3.0）授權。
簡單來說：你可以使用、修改、散布這份程式碼，包括商業用途；但如果你散布修改後的版本，
或把修改後的版本架設成網站讓其他人透過網路使用，就必須以同樣的 AGPL-3.0 授權公開完整原始碼。

玩家資料與頭像來自 [osu!](https://osu.ppy.sh/) 官方 API，屬於 osu! / ppy，不在本授權範圍內，
使用上請遵守 osu! 的 API 使用條款。本專案與 osu! 及 ppy 沒有任何官方關係。

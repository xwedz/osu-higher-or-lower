-- D1 資料庫結構。用 wrangler 套用：
--   本機：npx wrangler d1 migrations apply osu-higher-lower --local
--   線上：npx wrangler d1 migrations apply osu-higher-lower --remote
--
-- 之後要改結構，就在這個資料夾新增 0002_xxx.sql，不要修改已經套用過的檔案。

-- 玩家候選池：定期從 osu! API 抓下來、快取在本地的玩家資料。
CREATE TABLE "Player" (
    "id"          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "osuUserId"   INTEGER NOT NULL,
    "username"    TEXT    NOT NULL,
    -- 遊戲裡實際拿來互相比較的三個數值
    "playCount"   INTEGER NOT NULL,
    "accuracy"    REAL    NOT NULL,
    "playtime"    INTEGER NOT NULL, -- 單位是秒
    -- 玩家卡上顯示的參考資訊；停止活動的帳號可能沒有排名
    "countryCode" TEXT,
    "countryName" TEXT,
    "globalRank"  INTEGER,
    "pp"          REAL,
    -- 手動維護的一句話說明（例如 "former #1"），只有知名玩家會有
    "note"        TEXT,
    -- 1 = 屬於 Famous 玩家池
    "isSpecial"   INTEGER NOT NULL DEFAULT 0,
    "updatedAt"   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX "Player_osuUserId_key" ON "Player"("osuUserId");

-- 排行榜：每位登入的玩家、每個「模式 × 玩家池」只保留最高的一筆連勝。
CREATE TABLE "LeaderboardEntry" (
    "id"          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "osuUserId"   INTEGER NOT NULL,
    "username"    TEXT    NOT NULL,
    "countryCode" TEXT,
    "countryName" TEXT,
    "mode"        TEXT    NOT NULL, -- playCount / accuracy / playtime
    "pool"        TEXT    NOT NULL, -- famous / top100 / top1000
    "streak"      INTEGER NOT NULL,
    "achievedAt"  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX "LeaderboardEntry_user_mode_pool_key" ON "LeaderboardEntry"("osuUserId", "mode", "pool");
CREATE INDEX "LeaderboardEntry_mode_pool_streak_idx" ON "LeaderboardEntry"("mode", "pool", "streak");

-- 已經使用過的 round token（防止同一個 token 被重複提交來換答案重猜）。
-- Worker 的多個實例不共用記憶體，所以要放在資料庫裡；過期的紀錄由每日排程清除。
CREATE TABLE "UsedToken" (
    "signature" TEXT    NOT NULL PRIMARY KEY,
    "exp"       INTEGER NOT NULL -- 毫秒時間戳，跟 token 的過期時間一致
);
CREATE INDEX "UsedToken_exp_idx" ON "UsedToken"("exp");

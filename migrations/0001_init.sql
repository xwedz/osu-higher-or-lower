-- D1 schema. Apply with wrangler:
--   local:  npx wrangler d1 migrations apply osu-higher-lower --local
--   remote: npx wrangler d1 migrations apply osu-higher-lower --remote
--
-- To change the schema later, add a new file such as 0002_xxx.sql here; never edit a migration that has been applied.

-- Candidate players: fetched from the osu! API on a schedule and cached locally.
CREATE TABLE "Player" (
    "id"          INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "osuUserId"   INTEGER NOT NULL,
    "username"    TEXT    NOT NULL,
    -- the three stats the game compares
    "playCount"   INTEGER NOT NULL,
    "accuracy"    REAL    NOT NULL,
    "playtime"    INTEGER NOT NULL, -- in seconds
    -- extra info shown on the player card; inactive accounts may have no rank
    "countryCode" TEXT,
    "countryName" TEXT,
    "globalRank"  INTEGER,
    "pp"          REAL,
    -- a hand-maintained one-line description (e.g. "former #1"), famous players only
    "note"        TEXT,
    -- 1 = part of the Famous pool
    "isSpecial"   INTEGER NOT NULL DEFAULT 0,
    "updatedAt"   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX "Player_osuUserId_key" ON "Player"("osuUserId");

-- Leaderboard: one row per logged-in player per mode and pool, keeping only their best streak.
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

-- Round tokens that have already been used (so the same token can't be resubmitted with the other answer).
-- Worker instances don't share memory, so this lives in the database; a daily cron deletes expired rows.
CREATE TABLE "UsedToken" (
    "signature" TEXT    NOT NULL PRIMARY KEY,
    "exp"       INTEGER NOT NULL -- timestamp in milliseconds, same as the token's expiry
);
CREATE INDEX "UsedToken_exp_idx" ON "UsedToken"("exp");

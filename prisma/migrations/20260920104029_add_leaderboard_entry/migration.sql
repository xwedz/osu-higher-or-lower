-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "osuUserId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "countryCode" TEXT,
    "countryName" TEXT,
    "mode" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "streak" INTEGER NOT NULL,
    "achievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "LeaderboardEntry_mode_pool_streak_idx" ON "LeaderboardEntry"("mode", "pool", "streak");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_osuUserId_mode_pool_key" ON "LeaderboardEntry"("osuUserId", "mode", "pool");

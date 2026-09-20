-- CreateTable
CREATE TABLE "Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "osuUserId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL,
    "accuracy" REAL NOT NULL,
    "joinDate" DATETIME NOT NULL,
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StreakRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mode" TEXT NOT NULL,
    "streak" INTEGER NOT NULL,
    "achievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_osuUserId_key" ON "Player"("osuUserId");

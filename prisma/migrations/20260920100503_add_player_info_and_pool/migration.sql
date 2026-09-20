-- AlterTable
ALTER TABLE "Player" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Player" ADD COLUMN "countryName" TEXT;
ALTER TABLE "Player" ADD COLUMN "globalRank" INTEGER;
ALTER TABLE "Player" ADD COLUMN "note" TEXT;
ALTER TABLE "Player" ADD COLUMN "pp" REAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_StreakRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mode" TEXT NOT NULL,
    "pool" TEXT NOT NULL DEFAULT 'top1000',
    "streak" INTEGER NOT NULL,
    "achievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_StreakRecord" ("achievedAt", "id", "mode", "streak") SELECT "achievedAt", "id", "mode", "streak" FROM "StreakRecord";
DROP TABLE "StreakRecord";
ALTER TABLE "new_StreakRecord" RENAME TO "StreakRecord";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

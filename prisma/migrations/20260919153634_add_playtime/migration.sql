/*
  Warnings:

  - You are about to drop the column `joinDate` on the `Player` table. All the data in the column will be lost.
  - Added the required column `playtime` to the `Player` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Player" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "osuUserId" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "playCount" INTEGER NOT NULL,
    "accuracy" REAL NOT NULL,
    "playtime" INTEGER NOT NULL,
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Player" ("accuracy", "id", "isSpecial", "osuUserId", "playCount", "updatedAt", "username") SELECT "accuracy", "id", "isSpecial", "osuUserId", "playCount", "updatedAt", "username" FROM "Player";
DROP TABLE "Player";
ALTER TABLE "new_Player" RENAME TO "Player";
CREATE UNIQUE INDEX "Player_osuUserId_key" ON "Player"("osuUserId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

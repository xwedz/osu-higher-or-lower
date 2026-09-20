// scripts/d1.js
//
// 抓取腳本共用：把玩家資料轉成 SQL，再交給 wrangler 寫進 D1。
// 預設寫進「本機」的 D1（wrangler dev 使用的那一份）；加上 --remote 才會寫進 Cloudflare 上的線上資料庫。
//
// 用法：
//   node scripts/fetchTopPlayers.js            寫進本機
//   node scripts/fetchTopPlayers.js --remote   寫進線上

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DB_NAME = 'osu-higher-lower';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'scripts', '.out');

export const isRemote = () => process.argv.includes('--remote');

/** 把 JS 值轉成 SQL 字面值（字串會跳脫單引號）。 */
export function sql(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * 新增或更新一位玩家。extraSet 是額外要在「已存在時」更新的欄位（例如 isSpecial、note）。
 * 抓取排行榜時不傳 extra，這樣就不會洗掉手動維護的 isSpecial / note。
 */
export function upsertPlayerSql(fields, extra = {}) {
    const all = { ...fields, ...extra };
    const cols = Object.keys(all);
    const updates = [...cols.filter(c => c !== 'osuUserId').map(c => `"${c}" = excluded."${c}"`), `"updatedAt" = datetime('now')`];
    return (
        `INSERT INTO "Player" (${cols.map(c => `"${c}"`).join(', ')}) VALUES (${cols.map(c => sql(all[c])).join(', ')}) ` +
        `ON CONFLICT ("osuUserId") DO UPDATE SET ${updates.join(', ')};`
    );
}

/** 把一批 SQL 語句寫成檔案，用 wrangler 套用到本機或線上的 D1。 */
export function applySql(statements) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `sync-${Date.now()}.sql`);
    fs.writeFileSync(file, statements.join('\n') + '\n', 'utf-8');

    const target = isRemote() ? '--remote' : '--local';
    console.log(`💾 正在寫入 D1（${isRemote() ? '線上' : '本機'}）：${statements.length} 條語句`);
    // 直接用 node 執行 wrangler 的入口檔，不經過 shell（Windows 上 npx 需要 shell，會有安全性警告）。
    const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    execFileSync(process.execPath, [wrangler, 'd1', 'execute', DB_NAME, target, '--file', file], {
        cwd: ROOT,
        stdio: 'inherit',
    });
    fs.rmSync(file, { force: true });
}

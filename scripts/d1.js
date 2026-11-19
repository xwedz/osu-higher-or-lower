// scripts/d1.js
//
// Shared by the fetch scripts: turns player data into SQL and hands it to wrangler to write into D1.
// Writes to the local D1 (the one wrangler dev uses) by default; pass --remote to write to the
// live database on Cloudflare.
//
// Usage:
//   node scripts/fetchTopPlayers.js            write to the local database
//   node scripts/fetchTopPlayers.js --remote   write to the live database

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DB_NAME = 'osu-higher-lower';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'scripts', '.out');

export const isRemote = () => process.argv.includes('--remote');

/** Converts a JS value into an SQL literal (single quotes in strings are escaped). */
export function sql(value) {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Inserts or updates one player. `extra` holds additional columns to set, also when the row
 * already exists (for example isSpecial and note). The leaderboard fetch passes no extra,
 * so it never overwrites the hand-maintained isSpecial / note values.
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

/** Writes a batch of SQL statements to a file and applies it to the local or live D1 with wrangler. */
export function applySql(statements) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `sync-${Date.now()}.sql`);
    fs.writeFileSync(file, statements.join('\n') + '\n', 'utf-8');

    const target = isRemote() ? '--remote' : '--local';
    console.log(`💾 Writing to D1 (${isRemote() ? 'remote' : 'local'}): ${statements.length} statements`);
    // Run wrangler's entry file with node directly instead of through a shell
    // (npx needs a shell on Windows, which triggers a security warning).
    const wrangler = path.join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
    execFileSync(process.execPath, [wrangler, 'd1', 'execute', DB_NAME, target, '--file', file], {
        cwd: ROOT,
        stdio: 'inherit',
    });
    fs.rmSync(file, { force: true });
}

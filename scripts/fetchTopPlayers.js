// scripts/fetchTopPlayers.js
//
// Fetches the top N players of the osu! global pp ranking and writes them into the D1 Player table.
// This script runs on its own (it is not part of the Worker): run it by hand, or on a schedule later.
// Players should never be fetched live while someone is playing; that would be slow and waste API quota.
//
// Usage:
//   node scripts/fetchTopPlayers.js            write to the local D1
//   node scripts/fetchTopPlayers.js --remote   write to the live D1
//
// The live Worker caches the player list for 10 minutes, so a re-run can take up to 10 minutes to show up.

import { getToken, apiGet, sleep, toPlayerFields } from './osuApi.js';
import { applySql, upsertPlayerSql } from './d1.js';

const MODE = 'osu';           // osu!standard only for now
const RANKING_TYPE = 'performance'; // the ranking ordered by pp
const TARGET_PLAYER_COUNT = 1000;   // how many candidate players to fetch
const PLAYERS_PER_PAGE = 50;        // the osu! ranking always returns 50 per page

async function main() {
    console.log('🔑 Getting an osu! API token...');
    const token = await getToken();

    const totalPages = Math.ceil(TARGET_PLAYER_COUNT / PLAYERS_PER_PAGE);
    // Clear the old ranks of regular players first: anyone who isn't on the ranking this time
    // (dropped out of the top 1000) shouldn't stay in the Top 100 / Top 1000 pools.
    // Famous players' ranks are updated by fetchFamousPlayers, so they are left alone here.
    const statements = [`UPDATE "Player" SET "globalRank" = NULL WHERE "isSpecial" = 0;`];

    for (let page = 1; page <= totalPages; page++) {
        console.log(`📄 Fetching page ${page}/${totalPages}...`);
        const data = await apiGet(`/rankings/${MODE}/${RANKING_TYPE}?page=${page}`, token);

        for (const entry of data.ranking) {
            // entry itself is a UserStatistics object (snake_case); the player's profile is in entry.user.
            // isSpecial and note are deliberately not touched: famous players can also be on the ranking,
            // and an update must not wipe those hand-maintained columns.
            const fields = { osuUserId: entry.user.id, ...toPlayerFields({ user: entry.user, stats: entry }) };
            statements.push(upsertPlayerSql(fields));
        }

        // Leave a short pause between requests to be polite to the osu! API.
        await sleep(300);
    }

    applySql(statements);
    console.log(`✅ Done! Processed ${statements.length - 1} players.`);
}

main().catch(err => {
    console.error('❌ Failed:', err);
    process.exitCode = 1;
});

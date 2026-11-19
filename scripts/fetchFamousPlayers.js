// scripts/fetchFamousPlayers.js
//
// Fetches every player in scripts/famousPlayers.json (a hand-maintained list) from the osu! API,
// writes them into the D1 Player table and marks them isSpecial (these players make up the Famous pool).
//
// famousPlayers.json format:
//   [{ "osuUserId": 7562902, "note": "a short description, may be an empty string" }, ...]
//
// To add a player, put their osu! user id (the number at the end of their profile URL) in the JSON
// and run this script again. Players removed from the list are not deleted automatically
// (to avoid accidental deletions); remove them by hand.
//
// Usage:
//   node scripts/fetchFamousPlayers.js            write to the local D1
//   node scripts/fetchFamousPlayers.js --remote   write to the live D1

import fs from 'node:fs';
import { getToken, apiGet, sleep, toPlayerFields } from './osuApi.js';
import { applySql, upsertPlayerSql } from './d1.js';

const LIST_PATH = new URL('./famousPlayers.json', import.meta.url);

async function main() {
    const list = JSON.parse(fs.readFileSync(LIST_PATH, 'utf-8'));
    console.log(`📋 ${list.length} players in the list`);

    const token = await getToken();
    const statements = [];

    for (const { osuUserId, note } of list) {
        // key=id tells the API we are passing a user id, not a username.
        const user = await apiGet(`/users/${osuUserId}/osu?key=id`, token);
        const fields = { osuUserId: user.id, ...toPlayerFields({ user, stats: user.statistics }) };
        statements.push(upsertPlayerSql(fields, { isSpecial: 1, note: note?.trim() || null }));
        console.log(`  ✔ ${user.username} (#${fields.globalRank ?? '—'}, ${fields.countryCode})`);
        await sleep(300);
    }

    applySql(statements);
    console.log('✅ Done!');
}

main().catch(err => {
    console.error('❌ Failed:', err);
    process.exitCode = 1;
});

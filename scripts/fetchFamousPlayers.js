// scripts/fetchFamousPlayers.js
//
// 依照 scripts/famousPlayers.json 這份你自己維護的名單，逐一向 osu! API 抓玩家資料，
// 寫進 D1 的 Player 表並標記為 isSpecial（「Famous」玩家池就是這批人）。
//
// famousPlayers.json 的格式：
//   [{ "osuUserId": 7562902, "note": "一句話說明，可以留空字串" }, ...]
//
// 想新增玩家：把他的 osu! user id（個人頁面網址最後那串數字）加進 JSON，再重跑一次即可。
// 已經在名單裡、之後被你移除的玩家，不會被自動刪掉（避免誤刪），想移除請手動處理。
//
// 用法：
//   node scripts/fetchFamousPlayers.js            寫進本機的 D1
//   node scripts/fetchFamousPlayers.js --remote   寫進線上的 D1

import fs from 'node:fs';
import { getToken, apiGet, sleep, toPlayerFields } from './osuApi.js';
import { applySql, upsertPlayerSql } from './d1.js';

const LIST_PATH = new URL('./famousPlayers.json', import.meta.url);

async function main() {
    const list = JSON.parse(fs.readFileSync(LIST_PATH, 'utf-8'));
    console.log(`📋 名單共 ${list.length} 位玩家`);

    const token = await getToken();
    const statements = [];

    for (const { osuUserId, note } of list) {
        // key=id 告訴 API 我們給的是 user id，而不是使用者名稱。
        const user = await apiGet(`/users/${osuUserId}/osu?key=id`, token);
        const fields = { osuUserId: user.id, ...toPlayerFields({ user, stats: user.statistics }) };
        statements.push(upsertPlayerSql(fields, { isSpecial: 1, note: note?.trim() || null }));
        console.log(`  ✔ ${user.username} (#${fields.globalRank ?? '—'}, ${fields.countryCode})`);
        await sleep(300);
    }

    applySql(statements);
    console.log('✅ 完成！');
}

main().catch(err => {
    console.error('❌ 執行失敗:', err);
    process.exitCode = 1;
});

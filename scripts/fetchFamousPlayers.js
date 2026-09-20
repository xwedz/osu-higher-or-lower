// scripts/fetchFamousPlayers.js
//
// 依照 scripts/famousPlayers.json 這份你自己維護的名單，逐一向 osu! API 抓玩家資料，
// 寫進 Player 表並標記為 isSpecial（「Famous」玩家池就是這批人）。
//
// famousPlayers.json 的格式：
//   [{ "osuUserId": 7562902, "note": "一句話說明，可以留空字串" }, ...]
//
// 想新增玩家：把他的 osu! user id（個人頁面網址最後那串數字）加進 JSON，再重跑一次即可。
// 已經在名單裡、之後被你移除的玩家，不會被自動刪掉（避免誤刪），
// 想移除請手動處理。
//
// 用法： node scripts/fetchFamousPlayers.js

import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { getToken, apiGet, sleep, toPlayerFields } from './osuApi.js';

const prisma = new PrismaClient();
const LIST_PATH = new URL('./famousPlayers.json', import.meta.url);

async function main() {
    const list = JSON.parse(fs.readFileSync(LIST_PATH, 'utf-8'));
    console.log(`📋 名單共 ${list.length} 位玩家`);

    const token = await getToken();

    for (const { osuUserId, note } of list) {
        // key=id 告訴 API 我們給的是 user id，而不是使用者名稱。
        const user = await apiGet(`/users/${osuUserId}/osu?key=id`, token);
        const fields = toPlayerFields({ user, stats: user.statistics });
        const extra = { isSpecial: true, note: note?.trim() || null };

        await prisma.player.upsert({
            where: { osuUserId: user.id },
            update: { ...fields, ...extra },
            create: { osuUserId: user.id, ...fields, ...extra },
        });
        console.log(`  ✔ ${user.username} (#${fields.globalRank ?? '—'}, ${fields.countryCode})`);
        await sleep(300);
    }

    console.log('✅ 完成！');
}

main()
    .catch(err => {
        console.error('❌ 執行失敗:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

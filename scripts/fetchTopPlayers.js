// scripts/fetchTopPlayers.js
//
// 抓取 osu! 全球 pp 排行榜的前 N 名玩家，存進 Player 表。
// 這支腳本是獨立執行的（不是伺服器的一部分），手動跑一次，或之後排程
// 定期執行即可 —— 不應該讓玩家連進遊戲時才現抓，那樣既慢又浪費 API 額度。
//
// 用法： node scripts/fetchTopPlayers.js

import { PrismaClient } from '@prisma/client';
import { getToken, apiGet, sleep, toPlayerFields } from './osuApi.js';

const prisma = new PrismaClient();

const MODE = 'osu';           // 先只做 osu!standard 模式
const RANKING_TYPE = 'performance'; // 依 pp 排序的排行榜
const TARGET_PLAYER_COUNT = 1000;   // 想抓的候選玩家總數
const PLAYERS_PER_PAGE = 50;        // osu! 排行榜每頁固定 50 筆，不可調整

async function main() {
    console.log('🔑 正在取得 osu! API token...');
    const token = await getToken();

    const totalPages = Math.ceil(TARGET_PLAYER_COUNT / PLAYERS_PER_PAGE);
    let savedCount = 0;

    for (let page = 1; page <= totalPages; page++) {
        console.log(`📄 正在抓第 ${page}/${totalPages} 頁...`);
        const data = await apiGet(`/rankings/${MODE}/${RANKING_TYPE}?page=${page}`, token);

        for (const entry of data.ranking) {
            // entry 本身就是 UserStatistics（底線命名），玩家基本資料在 entry.user。
            const fields = toPlayerFields({ user: entry.user, stats: entry });
            // 注意這裡不碰 isSpecial 跟 note：知名玩家可能同時也在排行榜裡，
            // 更新資料時不能把手動維護的欄位洗掉。
            await prisma.player.upsert({
                where: { osuUserId: entry.user.id },
                update: fields,
                create: { osuUserId: entry.user.id, ...fields, isSpecial: false },
            });
            savedCount++;
        }

        // 禮貌性地在每次請求之間留點間隔，避免短時間內對 osu! 發太密集的請求。
        await sleep(300);
    }

    console.log(`✅ 完成！共寫入/更新了 ${savedCount} 位玩家。`);
}

main()
    .catch(err => {
        console.error('❌ 執行失敗:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

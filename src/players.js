// src/players.js
//
// 玩家候選池與「隨機挑人」。
//
// 為什麼把整張 Player 表快取在記憶體裡：D1 是按「掃描的列數」計費（免費每天 500 萬列），
// 如果每次猜測都用 COUNT + OFFSET 去資料庫挑人，每次要掃上千列，很快就用完額度。
// 整張表才 1000 多列，每個 Worker 實例每 10 分鐘讀一次放在記憶體裡就夠了，
// 之後的挑人、比大小全部不碰資料庫。代價是：重新跑抓取腳本後，
// 線上的資料最多要 10 分鐘才會更新。

// 玩家池：決定這一局的候選玩家從哪裡挑。排名是抓取當下的快照。
export const POOLS = {
    famous: p => p.isSpecial === 1,
    top100: p => p.globalRank != null && p.globalRank <= 100,
    top1000: p => p.globalRank != null && p.globalRank <= 1000,
};
export const ALLOWED_POOLS = Object.keys(POOLS);

// 一個池至少要有這麼多玩家才開放遊玩，人太少的話幾輪就會一直重複遇到同樣的人。
export const MIN_POOL_SIZE = 10;

const CACHE_TTL_MS = 10 * 60 * 1000;
let cache = { loadedAt: 0, players: [] };

export async function loadPlayers(db) {
    if (cache.players.length === 0 || Date.now() - cache.loadedAt > CACHE_TTL_MS) {
        const { results } = await db.prepare('SELECT * FROM Player').all();
        cache = { loadedAt: Date.now(), players: results };
    }
    return cache.players;
}

export const poolPlayers = (players, pool) => players.filter(POOLS[pool]);

/**
 * 在指定玩家池裡隨機挑一位玩家，可以指定要排除的 id（避免兩邊選到同一個人）。
 */
export function pickRandomPlayer(players, pool, excludeId = null) {
    const candidates = poolPlayers(players, pool).filter(p => p.osuUserId !== excludeId);
    if (candidates.length === 0) {
        throw new Error('Not enough players in this pool');
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * 玩家卡上要顯示的公開資訊。刻意不包含 mode 對應的數值——
 * 未知方的數值要等提交猜測之後才會揭曉。
 */
export function publicInfo(player) {
    return {
        osuUserId: player.osuUserId,
        username: player.username,
        countryCode: player.countryCode,
        countryName: player.countryName,
        globalRank: player.globalRank,
        pp: player.pp,
        note: player.note,
    };
}

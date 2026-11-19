// src/players.js
//
// Player pools and random picking.
//
// Why the whole Player table is cached in memory: D1 bills by rows scanned (5 million per day on the
// free plan). Picking a player with COUNT + OFFSET on every guess would scan over a thousand rows each
// time and use up the quota quickly. The table only has about a thousand rows, so each Worker instance
// loads it once every 10 minutes, and picking and comparing players never touches the database after
// that. The trade-off: after re-running the fetch scripts, the live site can take up to 10 minutes
// to see the new data.

// Player pools decide which players a run draws from. Ranks are a snapshot from the last fetch.
export const POOLS = {
    famous: p => p.isSpecial === 1,
    top100: p => p.globalRank != null && p.globalRank <= 100,
    top1000: p => p.globalRank != null && p.globalRank <= 1000,
};
export const ALLOWED_POOLS = Object.keys(POOLS);

// A pool needs at least this many players to be playable; with fewer, the same faces keep coming back.
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
 * Picks a random player from the pool, optionally excluding one id (so both sides aren't the same player).
 */
export function pickRandomPlayer(players, pool, excludeId = null) {
    const candidates = poolPlayers(players, pool).filter(p => p.osuUserId !== excludeId);
    if (candidates.length === 0) {
        throw new Error('Not enough players in this pool');
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Public information shown on a player card. It deliberately leaves out the stat being compared:
 * the unknown player's value is only revealed after the guess is submitted.
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

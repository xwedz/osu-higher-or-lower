// src/index.js —— Cloudflare Worker 入口（Hono）
//
// 所有請求都會先經過這裡（wrangler.jsonc 的 run_worker_first）：/api/* 由下面的路由處理，
// 其他路徑交給 ASSETS 回傳前端檔案。

import { Hono } from 'hono';
import auth from './auth.js';
import { ALLOWED_POOLS, MIN_POOL_SIZE, loadPlayers, pickRandomPlayer, poolPlayers, publicInfo } from './players.js';
import { signRoundToken, verifyRoundToken } from './roundToken.js';
import { getSessionUser } from './session.js';

const app = new Hono();

// 只允許這三個欄位被拿來比較，避免有人亂傳一個 mode 名稱，
// 意外查到我們不希望被拿來比較的欄位（例如 id 這種內部使用的值）。
const ALLOWED_MODES = ['playCount', 'accuracy', 'playtime'];

const invalidParam = (name, allowed) => ({ error: `${name} must be one of: ${allowed.join(', ')}` });

// 把舊的 workers.dev 頁面網址轉到正式網址，保留原本的路徑和參數。
// /api/* 刻意不轉址：還開著舊分頁的玩家要能打完這一局，跨網域轉址 API 請求會被瀏覽器的 CORS 擋下。
app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    const canonical = c.env.CANONICAL_ORIGIN;
    if (canonical && url.hostname.endsWith('.workers.dev') && !url.pathname.startsWith('/api/')) {
        return c.redirect(`${canonical}${url.pathname}${url.search}`, 301);
    }
    await next();
});

// 頻率限制：依來源 IP 計算。被擋下的請求會在碰到資料庫之前就回 429。
// 注意被擋下的請求仍然是一次 Worker 呼叫，所以這個機制保護的是資料庫與 CPU，
// 並不能保護每天 10 萬次的請求額度（那需要自訂網域 + WAF 規則）。
app.use('/api/*', async (c, next) => {
    if (c.env.API_LIMITER) {
        const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
        const { success } = await c.env.API_LIMITER.limit({ key: ip });
        if (!success) return c.json({ error: 'Too many requests, please slow down.' }, 429);
    }
    await next();
});

app.route('/api/auth', auth);

// 目前登入的使用者（沒登入回傳 null），給前端啟動時查詢用。
app.get('/api/me', c => c.json({ user: getSessionUser(c) }));

// 最簡單的健康檢查：確認 Worker 有跑起來、也能正常連到資料庫。
app.get('/api/health', async c => {
    const players = await loadPlayers(c.env.DB);
    return c.json({ status: 'ok', playersInDb: players.length });
});

/**
 * 回傳每個玩家池目前有幾位玩家，前端用來決定哪些池可以選。
 */
app.get('/api/pools', async c => {
    const players = await loadPlayers(c.env.DB);
    return c.json({
        minPoolSize: MIN_POOL_SIZE,
        pools: ALLOWED_POOLS.map(pool => {
            const count = poolPlayers(players, pool).length;
            return { pool, count, available: count >= MIN_POOL_SIZE };
        }),
    });
});

/**
 * 挑一位跟 knownPlayer 不同、而且該模式數值也不同（避免無解的平手情況）
 * 的對手，組出這一輪要簽章的內容，回傳「可以直接給前端看」的格式。
 */
function buildNextRound(secret, { players, knownPlayer, mode, pool, streak, uid }) {
    let unknownPlayer = null;
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = pickRandomPlayer(players, pool, knownPlayer.osuUserId);
        if (candidate[mode] !== knownPlayer[mode]) {
            unknownPlayer = candidate;
            break;
        }
    }
    if (!unknownPlayer) {
        throw new Error('Could not find a suitable opponent');
    }

    // token 裡不放正確答案（payload 任何人都讀得到），只放雙方 id，
    // 答案等收到猜測時再由後端重新比較。
    const roundToken = signRoundToken(secret, {
        knownPlayerId: knownPlayer.osuUserId,
        unknownPlayerId: unknownPlayer.osuUserId,
        mode,
        pool,
        streak,
        uid,
    });

    return {
        mode,
        pool,
        streak,
        ranked: uid !== null,
        known: { ...publicInfo(knownPlayer), value: knownPlayer[mode] },
        unknown: publicInfo(unknownPlayer),
        roundToken,
    };
}

/**
 * 開始全新的一局遊戲（連勝從 0 開始）。
 * query 參數：mode（playCount / accuracy / playtime）、pool（famous / top100 / top1000）
 */
app.get('/api/round/start', async c => {
    const { mode, pool } = c.req.query();
    if (!ALLOWED_MODES.includes(mode)) return c.json(invalidParam('mode', ALLOWED_MODES), 400);
    if (!ALLOWED_POOLS.includes(pool)) return c.json(invalidParam('pool', ALLOWED_POOLS), 400);

    const players = await loadPlayers(c.env.DB);
    if (poolPlayers(players, pool).length < MIN_POOL_SIZE) {
        return c.json({ error: 'This player pool is not available yet' }, 400);
    }

    // 只有登入狀態下開始的遊戲才會計入排行榜，登入者的 id 簽進 token 裡，
    // 之後每一輪都沿用同一個身分。
    const uid = getSessionUser(c)?.osuUserId ?? null;
    const knownPlayer = pickRandomPlayer(players, pool);
    return c.json(buildNextRound(c.env.ROUND_TOKEN_SECRET, { players, knownPlayer, mode, pool, streak: 0, uid }));
});

/**
 * 標記這個 token 已經使用過。一個 token 只能提交一次：否則玩家猜錯之後，
 * 可以拿同一個 token 換另一個答案重猜，變成無限連勝。
 * INSERT OR IGNORE 是單一原子操作：真的插入了（changes = 1）代表第一次使用；
 * 已經存在（changes = 0）代表重複提交。
 */
async function consumeToken(db, payload) {
    const result = await db
        .prepare('INSERT OR IGNORE INTO UsedToken (signature, exp) VALUES (?, ?)')
        .bind(payload.signature, payload.exp)
        .run();
    return result.meta.changes === 1;
}

/**
 * 如果這個連勝比該玩家在這個「模式 × 玩家池」的既有紀錄高，就更新排行榜。
 * 用單一 SQL 完成（沒有紀錄就新增，有紀錄且更高才更新），沒破紀錄時不會寫入任何資料。
 */
async function recordStreak(db, user, mode, pool, streak) {
    await db
        .prepare(
            `INSERT INTO LeaderboardEntry (osuUserId, username, countryCode, countryName, mode, pool, streak)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (osuUserId, mode, pool) DO UPDATE SET
                 streak = excluded.streak,
                 username = excluded.username,
                 countryCode = excluded.countryCode,
                 countryName = excluded.countryName,
                 achievedAt = datetime('now')
             WHERE excluded.streak > LeaderboardEntry.streak`,
        )
        .bind(user.osuUserId, user.username, user.countryCode, user.countryName, mode, pool, streak)
        .run();
}

/**
 * 提交這一輪的猜測。
 * body：{ roundToken, guess: 'higher' | 'lower' }
 *
 * 猜對時，回應裡會直接附上「下一輪」的完整內容（包含新的 roundToken），
 * 前端不需要再另外呼叫 /api/round/start——這是刻意的設計：連勝數只會
 * 在這裡、經過後端驗證猜對之後才會加一並簽進新的 token，前端沒有任何
 * 機會可以偽造一個比實際連勝次數更高的數字。
 */
app.post('/api/round/guess', async c => {
    const body = await c.req.json().catch(() => null);
    const { roundToken, guess } = body ?? {};

    if (guess !== 'higher' && guess !== 'lower') {
        return c.json({ error: 'guess must be "higher" or "lower"' }, 400);
    }

    const payload = verifyRoundToken(c.env.ROUND_TOKEN_SECRET, roundToken);
    if (!payload) {
        return c.json({ error: 'Invalid or expired round token' }, 400);
    }

    const players = await loadPlayers(c.env.DB);
    const knownPlayer = players.find(p => p.osuUserId === payload.knownPlayerId);
    const unknownPlayer = players.find(p => p.osuUserId === payload.unknownPlayerId);
    if (!knownPlayer || !unknownPlayer) {
        return c.json({ error: 'Player data not found' }, 404);
    }

    // 資料檢查都通過、確定要處理了才標記為已使用。
    if (!(await consumeToken(c.env.DB, payload))) {
        return c.json({ error: 'This round has already been submitted' }, 400);
    }

    const correct = unknownPlayer[payload.mode] > knownPlayer[payload.mode] ? 'higher' : 'lower';
    const revealedUnknown = { ...publicInfo(unknownPlayer), value: unknownPlayer[payload.mode] };

    if (guess !== correct) {
        // 連勝已經在每次猜對時記錄過了，猜錯只需要結束這一局。
        return c.json({ correct: false, unknown: revealedUnknown, finalStreak: payload.streak });
    }

    const newStreak = payload.streak + 1;

    // 每次猜對就更新排行榜（而不是等猜錯才寫），這樣玩家中途關掉網頁也不會丟失紀錄。
    // token 裡的 uid 要跟目前的登入者一致才記錄，避免 cookie 過期或換人登入後寫到別人名下。
    const user = getSessionUser(c);
    if (payload.uid != null && user?.osuUserId === payload.uid) {
        await recordStreak(c.env.DB, user, payload.mode, payload.pool, newStreak);
    }

    const nextRound = buildNextRound(c.env.ROUND_TOKEN_SECRET, {
        players,
        knownPlayer: unknownPlayer, // 剛揭曉的這位玩家，變成下一輪的「已知方」
        mode: payload.mode,
        pool: payload.pool,
        streak: newStreak,
        uid: payload.uid ?? null,
    });

    return c.json({ correct: true, unknown: revealedUnknown, streak: newStreak, nextRound });
});

// D1 的時間格式是 "2026-09-20 10:48:51"（UTC、沒有時區標記），轉成標準 ISO 字串給前端。
const toIso = ts => `${ts.replace(' ', 'T')}Z`;

/**
 * 依模式與玩家池回傳歷史最高連勝排行榜（前 10 名）。
 * 如果請求者有登入且有紀錄，另外附上他自己的名次，即使不在前 10 名內。
 * 排序：連勝高的在前；同分時先達成的在前。
 */
app.get('/api/leaderboard', async c => {
    const { mode, pool } = c.req.query();
    if (!ALLOWED_MODES.includes(mode)) return c.json(invalidParam('mode', ALLOWED_MODES), 400);
    if (!ALLOWED_POOLS.includes(pool)) return c.json(invalidParam('pool', ALLOWED_POOLS), 400);

    const db = c.env.DB;
    const { results } = await db
        .prepare(
            `SELECT id, osuUserId, username, countryCode, countryName, streak, achievedAt
             FROM LeaderboardEntry WHERE mode = ? AND pool = ?
             ORDER BY streak DESC, achievedAt ASC, id ASC LIMIT 10`,
        )
        .bind(mode, pool)
        .all();

    let me = null;
    const user = getSessionUser(c);
    if (user) {
        const mine = await db
            .prepare('SELECT id, osuUserId, streak, achievedAt FROM LeaderboardEntry WHERE osuUserId = ? AND mode = ? AND pool = ?')
            .bind(user.osuUserId, mode, pool)
            .first();
        if (mine) {
            const ahead = await db
                .prepare(
                    `SELECT COUNT(*) AS n FROM LeaderboardEntry
                     WHERE mode = ? AND pool = ? AND (
                         streak > ?
                         OR (streak = ? AND achievedAt < ?)
                         OR (streak = ? AND achievedAt = ? AND id < ?)
                     )`,
                )
                .bind(mode, pool, mine.streak, mine.streak, mine.achievedAt, mine.streak, mine.achievedAt, mine.id)
                .first();
            me = { osuUserId: mine.osuUserId, rank: ahead.n + 1, streak: mine.streak };
        }
    }

    return c.json({
        mode,
        pool,
        records: results.map(r => ({ ...r, achievedAt: toIso(r.achievedAt) })),
        me,
    });
});

// 沒有對應路由時：API 回 JSON 的 404；其他路徑交給 ASSETS，
// 它會回傳對應的前端檔案，找不到就回 index.html（not_found_handling）。
app.notFound(c => (
    new URL(c.req.url).pathname.startsWith('/api/')
        ? c.json({ error: 'Not found' }, 404)
        : c.env.ASSETS.fetch(c.req.raw)
));

app.onError((err, c) => {
    console.error('請求處理失敗:', err);
    return c.json({ error: 'Server error' }, 500);
});

export default {
    fetch: app.fetch,

    // 每日排程（wrangler.jsonc 的 triggers.crons）：清掉已過期的 UsedToken，避免資料表無限成長。
    async scheduled(event, env, ctx) {
        ctx.waitUntil(env.DB.prepare('DELETE FROM UsedToken WHERE exp < ?').bind(Date.now()).run());
    },
};

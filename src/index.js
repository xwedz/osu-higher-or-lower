import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { signRoundToken, verifyRoundToken } from './roundToken.js';
import authRouter, { meHandler } from './auth.js';
import { getSessionUser } from './session.js';

const app = express();
const prisma = new PrismaClient();

// 開發時允許任何來源；上線前請改成只允許你的前端網址，例如 cors({ origin: 'https://你的網域' })。
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRouter);
app.get('/api/me', meHandler);

// 只允許這三個欄位被拿來比較，避免有人亂傳一個 mode 名稱，
// 意外查到我們不希望被拿來比較的欄位（例如 id 這種內部使用的值）。
const ALLOWED_MODES = ['playCount', 'accuracy', 'playtime'];

// 玩家池：決定這一局的候選玩家從哪裡挑。每個池都是 Player 表的一個篩選條件。
// 排名是排行榜抓取當下的快照，所以 "top100" 會隨著你重新抓資料而更新。
const POOLS = {
    famous: { isSpecial: true },
    top100: { globalRank: { lte: 100 } },
    top1000: { globalRank: { lte: 1000 } },
};
const ALLOWED_POOLS = Object.keys(POOLS);

// 一個池至少要有這麼多玩家才開放遊玩，人太少的話幾輪就會一直重複遇到同樣的人。
const MIN_POOL_SIZE = 10;

const invalidParam = (name, allowed) => ({ error: `${name} must be one of: ${allowed.join(', ')}` });

/**
 * 玩家卡上要顯示的公開資訊。刻意不包含 mode 對應的數值——
 * 未知方的數值要等提交猜測之後才會揭曉。
 */
function publicInfo(player) {
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

/**
 * 在指定玩家池裡隨機挑一位玩家，可以指定要排除的 id（避免兩邊選到同一個人）。
 */
async function pickRandomPlayer(pool, excludeId = null) {
    const where = { ...POOLS[pool], ...(excludeId ? { osuUserId: { not: excludeId } } : {}) };
    const total = await prisma.player.count({ where });
    if (total === 0) {
        throw new Error('Not enough players in this pool. Run npm run fetch:players first.');
    }
    const skip = Math.floor(Math.random() * total);
    const [player] = await prisma.player.findMany({ where, skip, take: 1 });
    return player;
}

// 先放一個最簡單的健康檢查端點：確認伺服器有跑起來、也能正常連到資料庫。
app.get('/api/health', async (req, res) => {
    try {
        const playerCount = await prisma.player.count();
        res.json({ status: 'ok', playersInDb: playerCount });
    } catch (err) {
        console.error('資料庫連線失敗:', err);
        res.status(500).json({ status: 'error', message: err.message });
    }
});

/**
 * 回傳每個玩家池目前有幾位玩家，前端用來決定哪些池可以選。
 */
app.get('/api/pools', async (req, res) => {
    try {
        const counts = await Promise.all(
            ALLOWED_POOLS.map(async pool => ({
                pool,
                count: await prisma.player.count({ where: POOLS[pool] }),
            })),
        );
        res.json({
            minPoolSize: MIN_POOL_SIZE,
            pools: counts.map(c => ({ ...c, available: c.count >= MIN_POOL_SIZE })),
        });
    } catch (err) {
        console.error('查詢玩家池失敗:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * 開始全新的一局遊戲（連勝從 0 開始）。
 * query 參數：mode（playCount / accuracy / playtime）、pool（famous / top100 / top1000）
 */
app.get('/api/round/start', async (req, res) => {
    const { mode, pool } = req.query;

    if (!ALLOWED_MODES.includes(mode)) return res.status(400).json(invalidParam('mode', ALLOWED_MODES));
    if (!ALLOWED_POOLS.includes(pool)) return res.status(400).json(invalidParam('pool', ALLOWED_POOLS));

    try {
        if ((await prisma.player.count({ where: POOLS[pool] })) < MIN_POOL_SIZE) {
            return res.status(400).json({ error: 'This player pool is not available yet' });
        }
        // 只有登入狀態下開始的遊戲才會計入排行榜，登入者的 id 簽進 token 裡，
        // 之後每一輪都沿用同一個身分。
        const uid = getSessionUser(req)?.osuUserId ?? null;
        const knownPlayer = await pickRandomPlayer(pool);
        const round = await buildNextRound({ knownPlayer, mode, pool, streak: 0, uid });
        res.json(round);
    } catch (err) {
        console.error('開始新的一輪失敗:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 已經用過的 token 簽章（一個 token 只能提交一次，避免重放）。
// 存在記憶體裡即可：token 10 分鐘就過期，所以定期清掉過期的就不會無限成長。
const usedTokens = new Map(); // signature -> exp

function consumeToken(payload) {
    const now = Date.now();
    for (const [sig, exp] of usedTokens) {
        if (exp < now) usedTokens.delete(sig);
    }
    if (usedTokens.has(payload.signature)) return false;
    usedTokens.set(payload.signature, payload.exp);
    return true;
}

/**
 * 如果這個連勝比該玩家在這個「模式 × 玩家池」的既有紀錄高，就更新排行榜。
 */
async function recordStreak(user, mode, pool, streak) {
    const key = { osuUserId_mode_pool: { osuUserId: user.osuUserId, mode, pool } };
    const existing = await prisma.leaderboardEntry.findUnique({ where: key });
    if (existing && existing.streak >= streak) return;

    const snapshot = {
        username: user.username,
        countryCode: user.countryCode,
        countryName: user.countryName,
    };
    await prisma.leaderboardEntry.upsert({
        where: key,
        update: { ...snapshot, streak, achievedAt: new Date() },
        create: { osuUserId: user.osuUserId, mode, pool, streak, ...snapshot },
    });
}

/**
 * 挑一位跟 knownPlayer 不同、而且該模式數值也不同（避免無解的平手情況）
 * 的對手，組出這一輪要簽章的內容，回傳「可以直接給前端看」的格式。
 */
async function buildNextRound({ knownPlayer, mode, pool, streak, uid }) {
    let unknownPlayer = null;
    for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = await pickRandomPlayer(pool, knownPlayer.osuUserId);
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
    const roundToken = signRoundToken({
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
 * 提交這一輪的猜測。
 * body：{ roundToken, guess: 'higher' | 'lower' }
 *
 * 猜對時，回應裡會直接附上「下一輪」的完整內容（包含新的 roundToken），
 * 前端不需要再另外呼叫 /api/round/start——這是刻意的設計：連勝數只會
 * 在這裡、經過後端驗證猜對之後才會加一並簽進新的 token，前端沒有任何
 * 機會可以偽造一個比實際連勝次數更高的數字。
 */
app.post('/api/round/guess', async (req, res) => {
    const { roundToken, guess } = req.body ?? {};

    if (guess !== 'higher' && guess !== 'lower') {
        return res.status(400).json({ error: 'guess must be "higher" or "lower"' });
    }

    const payload = verifyRoundToken(roundToken);
    if (!payload) {
        return res.status(400).json({ error: 'Invalid or expired round token' });
    }

    try {
        const [knownPlayer, unknownPlayer] = await Promise.all([
            prisma.player.findUnique({ where: { osuUserId: payload.knownPlayerId } }),
            prisma.player.findUnique({ where: { osuUserId: payload.unknownPlayerId } }),
        ]);
        if (!knownPlayer || !unknownPlayer) {
            return res.status(404).json({ error: 'Player data not found' });
        }

        // 資料檢查都通過、確定要處理了才標記為已使用。
        if (!consumeToken(payload)) {
            return res.status(400).json({ error: 'This round has already been submitted' });
        }

        const correct = unknownPlayer[payload.mode] > knownPlayer[payload.mode] ? 'higher' : 'lower';
        const isCorrect = guess === correct;
        const revealedUnknown = { ...publicInfo(unknownPlayer), value: unknownPlayer[payload.mode] };

        if (!isCorrect) {
            // 連勝已經在每次猜對時記錄過了，猜錯只需要結束這一局。
            return res.json({ correct: false, unknown: revealedUnknown, finalStreak: payload.streak });
        }

        const newStreak = payload.streak + 1;

        // 每次猜對就更新排行榜（而不是等猜錯才寫），這樣玩家中途關掉網頁也不會丟失紀錄。
        // token 裡的 uid 要跟目前的登入者一致才記錄，避免 cookie 過期或換人登入後寫到別人名下。
        const user = getSessionUser(req);
        if (payload.uid != null && user?.osuUserId === payload.uid) {
            await recordStreak(user, payload.mode, payload.pool, newStreak);
        }

        const nextRound = await buildNextRound({
            knownPlayer: unknownPlayer, // 剛揭曉的這位玩家，變成下一輪的「已知方」
            mode: payload.mode,
            pool: payload.pool,
            streak: newStreak,
            uid: payload.uid ?? null,
        });

        res.json({ correct: true, unknown: revealedUnknown, streak: newStreak, nextRound });
    } catch (err) {
        console.error('驗證猜測失敗:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * 依模式與玩家池回傳歷史最高連勝排行榜（前 10 名）。
 * 如果請求者有登入且有紀錄，另外附上他自己的名次，即使不在前 10 名內。
 */
app.get('/api/leaderboard', async (req, res) => {
    const { mode, pool } = req.query;
    if (!ALLOWED_MODES.includes(mode)) return res.status(400).json(invalidParam('mode', ALLOWED_MODES));
    if (!ALLOWED_POOLS.includes(pool)) return res.status(400).json(invalidParam('pool', ALLOWED_POOLS));

    try {
        const entries = await prisma.leaderboardEntry.findMany({
            where: { mode, pool },
            orderBy: [{ streak: 'desc' }, { achievedAt: 'asc' }],
            take: 10,
        });

        let me = null;
        const user = getSessionUser(req);
        if (user) {
            const mine = await prisma.leaderboardEntry.findUnique({
                where: { osuUserId_mode_pool: { osuUserId: user.osuUserId, mode, pool } },
            });
            if (mine) {
                const ahead = await prisma.leaderboardEntry.count({
                    where: {
                        mode, pool,
                        OR: [
                            { streak: { gt: mine.streak } },
                            { streak: mine.streak, achievedAt: { lt: mine.achievedAt } },
                        ],
                    },
                });
                me = { osuUserId: mine.osuUserId, rank: ahead + 1, streak: mine.streak };
            }
        }

        res.json({
            mode,
            pool,
            records: entries.map(e => ({
                id: e.id,
                osuUserId: e.osuUserId,
                username: e.username,
                countryCode: e.countryCode,
                countryName: e.countryName,
                streak: e.streak,
                achievedAt: e.achievedAt,
            })),
            me,
        });
    } catch (err) {
        console.error('查詢排行榜失敗:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 伺服器已啟動：http://localhost:${PORT}`);
});

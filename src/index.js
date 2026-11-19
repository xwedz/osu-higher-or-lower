// src/index.js: Cloudflare Worker entry point (Hono)
//
// Every request reaches this Worker first (run_worker_first in wrangler.jsonc): /api/* is handled
// by the routes below, and all other paths are handed to ASSETS, which serves the client files.

import { Hono } from 'hono';
import auth from './auth.js';
import { ALLOWED_POOLS, MIN_POOL_SIZE, loadPlayers, pickRandomPlayer, poolPlayers, publicInfo } from './players.js';
import { signRoundToken, verifyRoundToken } from './roundToken.js';
import { getSessionUser } from './session.js';

const app = new Hono();

// Only these three columns may be compared. This stops a crafted mode name from reading
// a column we never meant to expose (such as the internal id).
const ALLOWED_MODES = ['playCount', 'accuracy', 'playtime'];

const invalidParam = (name, allowed) => ({ error: `${name} must be one of: ${allowed.join(', ')}` });

// Redirect page URLs on the old workers.dev host to the canonical host, keeping path and query.
// /api/* is deliberately not redirected: players with an old tab still open should be able to finish
// their run, and browsers block cross-origin API redirects under CORS.
app.use('*', async (c, next) => {
    const url = new URL(c.req.url);
    const canonical = c.env.CANONICAL_ORIGIN;
    if (canonical && url.hostname.endsWith('.workers.dev') && !url.pathname.startsWith('/api/')) {
        return c.redirect(`${canonical}${url.pathname}${url.search}`, 301);
    }
    await next();
});

// Rate limiting per client IP. Blocked requests get a 429 before they touch the database.
// A blocked request still counts as a Worker invocation, so this protects the database and CPU,
// not the daily 100k request quota (that needs a WAF rule on a custom domain).
app.use('/api/*', async (c, next) => {
    if (c.env.API_LIMITER) {
        const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
        const { success } = await c.env.API_LIMITER.limit({ key: ip });
        if (!success) return c.json({ error: 'Too many requests, please slow down.' }, 429);
    }
    await next();
});

app.route('/api/auth', auth);

// The logged-in user (or null). The client calls this on startup.
app.get('/api/me', c => c.json({ user: getSessionUser(c) }));

// Minimal health check: the Worker is running and can reach the database.
app.get('/api/health', async c => {
    const players = await loadPlayers(c.env.DB);
    return c.json({ status: 'ok', playersInDb: players.length });
});

/**
 * Returns how many players each pool has, so the client knows which pools can be selected.
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
 * Picks an opponent who is not knownPlayer and has a different value for this mode
 * (a tie would have no correct answer), signs the round, and returns it in the shape
 * the client is allowed to see.
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

    // The token never holds the answer (anyone can read the payload), only the two player ids.
    // The server works out the answer again when the guess arrives.
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
 * Starts a new run (streak starts at 0).
 * Query parameters: mode (playCount / accuracy / playtime), pool (famous / top100 / top1000)
 */
app.get('/api/round/start', async c => {
    const { mode, pool } = c.req.query();
    if (!ALLOWED_MODES.includes(mode)) return c.json(invalidParam('mode', ALLOWED_MODES), 400);
    if (!ALLOWED_POOLS.includes(pool)) return c.json(invalidParam('pool', ALLOWED_POOLS), 400);

    const players = await loadPlayers(c.env.DB);
    if (poolPlayers(players, pool).length < MIN_POOL_SIZE) {
        return c.json({ error: 'This player pool is not available yet' }, 400);
    }

    // Only runs started while logged in count toward the leaderboard. The user's id is signed
    // into the token, and every following round keeps the same identity.
    const uid = getSessionUser(c)?.osuUserId ?? null;
    const knownPlayer = pickRandomPlayer(players, pool);
    return c.json(buildNextRound(c.env.ROUND_TOKEN_SECRET, { players, knownPlayer, mode, pool, streak: 0, uid }));
});

/**
 * Marks a token as used. Each token can be submitted only once; otherwise a player who guessed
 * wrong could resubmit the same token with the other answer and keep a streak forever.
 * INSERT OR IGNORE is a single atomic operation: a real insert (changes = 1) means first use,
 * and an existing row (changes = 0) means a repeat submission.
 */
async function consumeToken(db, payload) {
    const result = await db
        .prepare('INSERT OR IGNORE INTO UsedToken (signature, exp) VALUES (?, ?)')
        .bind(payload.signature, payload.exp)
        .run();
    return result.meta.changes === 1;
}

/**
 * Updates the leaderboard if this streak beats the player's existing record for this mode and pool.
 * A single SQL statement inserts when there is no record, updates only when the new streak is higher,
 * and writes nothing otherwise.
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
 * Submits a guess for the current round.
 * Body: { roundToken, guess: 'higher' | 'lower' }
 *
 * A correct guess returns the whole next round (with a new roundToken) in the same response,
 * so the client never calls /api/round/start again. This is deliberate: the streak only increases
 * here, after the server has confirmed the guess and signed it into the new token, so the client
 * has no way to claim a higher streak than it really has.
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

    // Only mark the token as used once every check has passed and we are committed to handling it.
    if (!(await consumeToken(c.env.DB, payload))) {
        return c.json({ error: 'This round has already been submitted' }, 400);
    }

    const correct = unknownPlayer[payload.mode] > knownPlayer[payload.mode] ? 'higher' : 'lower';
    const revealedUnknown = { ...publicInfo(unknownPlayer), value: unknownPlayer[payload.mode] };

    if (guess !== correct) {
        // The streak was already recorded on each correct guess, so a wrong guess just ends the run.
        return c.json({ correct: false, unknown: revealedUnknown, finalStreak: payload.streak });
    }

    const newStreak = payload.streak + 1;

    // Update the leaderboard on every correct guess rather than when the run ends, so closing
    // the page mid-run doesn't lose the record. The token's uid must match the current session,
    // so an expired cookie or a different logged-in user can't have the streak credited to them.
    const user = getSessionUser(c);
    if (payload.uid != null && user?.osuUserId === payload.uid) {
        await recordStreak(c.env.DB, user, payload.mode, payload.pool, newStreak);
    }

    const nextRound = buildNextRound(c.env.ROUND_TOKEN_SECRET, {
        players,
        knownPlayer: unknownPlayer, // the player just revealed becomes the known side of the next round
        mode: payload.mode,
        pool: payload.pool,
        streak: newStreak,
        uid: payload.uid ?? null,
    });

    return c.json({ correct: true, unknown: revealedUnknown, streak: newStreak, nextRound });
});

// D1 stores times as "2026-09-20 10:48:51" (UTC, no zone marker); convert to an ISO string for the client.
const toIso = ts => `${ts.replace(' ', 'T')}Z`;

/**
 * Returns the top 10 best streaks for a mode and pool.
 * If the requester is logged in and has a record, their own rank is included even outside the top 10.
 * Ordering: higher streak first; on a tie, whoever reached it first.
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

// No matching route: API paths get a JSON 404; everything else goes to ASSETS, which serves
// the matching client file or falls back to index.html (not_found_handling).
app.notFound(c => (
    new URL(c.req.url).pathname.startsWith('/api/')
        ? c.json({ error: 'Not found' }, 404)
        : c.env.ASSETS.fetch(c.req.raw)
));

app.onError((err, c) => {
    console.error('Request failed:', err);
    return c.json({ error: 'Server error' }, 500);
});

export default {
    fetch: app.fetch,

    // Daily cron (triggers.crons in wrangler.jsonc): delete expired UsedToken rows so the table doesn't grow forever.
    async scheduled(event, env, ctx) {
        ctx.waitUntil(env.DB.prepare('DELETE FROM UsedToken WHERE exp < ?').bind(Date.now()).run());
    },
};

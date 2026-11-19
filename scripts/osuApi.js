// scripts/osuApi.js
//
// Small osu! API helpers shared by the fetch scripts: getting a token and making requests.

import 'dotenv/config';

const CLIENT_ID = process.env.OSU_CLIENT_ID;
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Gets a token with client credentials. It only reads public data, so no user login is needed.
 */
export async function getToken() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('Set OSU_CLIENT_ID and OSU_CLIENT_SECRET in .env first');
    }

    const res = await fetch('https://osu.ppy.sh/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials',
            scope: 'public',
        }),
    });

    if (!res.ok) {
        throw new Error(`Failed to get a token (${res.status}): ${await res.text()}`);
    }
    return (await res.json()).access_token;
}

export async function apiGet(path, token) {
    const res = await fetch(`https://osu.ppy.sh/api/v2${path}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`Request to ${path} failed (${res.status}): ${await res.text()}`);
    }
    return res.json();
}

/**
 * Converts a ranking entry or a /users/{id}/osu response into Player table columns.
 * The two have different shapes: a ranking entry is itself a UserStatistics object with a nested user,
 * while the /users response is a user with nested statistics.
 */
export function toPlayerFields({ user, stats }) {
    return {
        username: user.username,
        playCount: stats.play_count,
        accuracy: stats.hit_accuracy,
        playtime: stats.play_time,
        countryCode: user.country_code ?? null,
        countryName: user.country?.name ?? null,
        globalRank: stats.global_rank ?? null,
        pp: stats.pp ?? null,
    };
}

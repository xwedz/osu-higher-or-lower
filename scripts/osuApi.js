// scripts/osuApi.js
//
// 抓取腳本共用的 osu! API 小工具：取得 token、發請求。

import 'dotenv/config';

const CLIENT_ID = process.env.OSU_CLIENT_ID;
const CLIENT_SECRET = process.env.OSU_CLIENT_SECRET;

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 用 client credentials 換一個 token —— 只讀取公開資料，不需要任何使用者登入。
 */
export async function getToken() {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        throw new Error('請先在 .env 裡設定 OSU_CLIENT_ID 跟 OSU_CLIENT_SECRET');
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
        throw new Error(`取得 token 失敗 (${res.status}): ${await res.text()}`);
    }
    return (await res.json()).access_token;
}

export async function apiGet(path, token) {
    const res = await fetch(`https://osu.ppy.sh/api/v2${path}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`請求 ${path} 失敗 (${res.status}): ${await res.text()}`);
    }
    return res.json();
}

/**
 * 把「排行榜的一筆資料」或「/users/{id}/osu 的回應」轉成 Player 表的欄位。
 * 兩者的形狀不同：排行榜的 entry 本身就是 UserStatistics（帶巢狀的 user），
 * 而 /users 回應是 user 帶巢狀的 statistics。
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

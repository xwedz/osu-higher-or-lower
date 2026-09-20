// src/auth.js
//
// 用 osu! 的 OAuth（Authorization Code 流程）登入：
//   1. /api/auth/login    把使用者導去 osu! 的授權頁
//   2. osu! 導回 /api/auth/callback?code=...&state=...
//   3. 後端拿 code 換 access token、呼叫 /me 取得身分，然後簽發自己的 session cookie
//
// 我們只用 access token 這一次來讀取 /me，讀完就丟掉，不儲存。

import crypto from 'node:crypto';
import { Hono } from 'hono';
import { clearSealedCookie, endSession, readSealedCookie, setSealedCookie, startSession } from './session.js';

const STATE_COOKIE = 'osu_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

// Redirect URI 必須跟 osu! OAuth 應用程式設定裡登記的完全一致。
// 沒有設定 OSU_REDIRECT_URI 時，就用「目前這個網站自己的網址」——部署後前後端同一個網址，
// 不需要另外設定。本機開發時前端在 Vite (5173)、API 在 wrangler (3000)，
// 所以在 .dev.vars 裡明確指定。
const redirectUri = c => c.env.OSU_REDIRECT_URI || `${new URL(c.req.url).origin}/api/auth/callback`;

// 登入完成後要回到哪裡。同一個網址時是空字串（也就是相對路徑 "/"）。
const frontendUrl = c => c.env.FRONTEND_URL || '';

const auth = new Hono();

auth.get('/login', c => {
    if (!c.env.OSU_CLIENT_ID) {
        return c.json({ error: 'Login is not configured on the server' }, 500);
    }
    // state 是防 CSRF 的隨機值：導去 osu! 前先存在 cookie，導回來時比對，
    // 確保這次授權是我們自己發起的，而不是別人塞給使用者的連結。
    const state = crypto.randomBytes(16).toString('hex');
    setSealedCookie(c, STATE_COOKIE, 'state', { state }, STATE_TTL_MS);

    const params = new URLSearchParams({
        client_id: c.env.OSU_CLIENT_ID,
        redirect_uri: redirectUri(c),
        response_type: 'code',
        scope: 'identify',
        state,
    });
    return c.redirect(`https://osu.ppy.sh/oauth/authorize?${params}`);
});

auth.get('/callback', async c => {
    const { code, state, error } = c.req.query();
    const saved = readSealedCookie(c, STATE_COOKIE, 'state');
    clearSealedCookie(c, STATE_COOKIE);

    const fail = reason => c.redirect(`${frontendUrl(c)}/?login=${reason}`);

    if (error) return fail('denied'); // 使用者在授權頁按了拒絕
    if (typeof code !== 'string' || !saved || saved.state !== state) return fail('invalid');

    try {
        const tokenRes = await fetch('https://osu.ppy.sh/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                client_id: c.env.OSU_CLIENT_ID,
                client_secret: c.env.OSU_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri(c),
            }),
        });
        if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
        const { access_token } = await tokenRes.json();

        const meRes = await fetch('https://osu.ppy.sh/api/v2/me', {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' },
        });
        if (!meRes.ok) throw new Error(`/me failed (${meRes.status})`);
        const me = await meRes.json();

        startSession(c, {
            osuUserId: me.id,
            username: me.username,
            countryCode: me.country_code ?? null,
            countryName: me.country?.name ?? null,
        });
        return c.redirect(`${frontendUrl(c)}/`);
    } catch (err) {
        console.error('osu! 登入失敗:', err);
        return fail('error');
    }
});

auth.post('/logout', c => {
    endSession(c);
    return c.json({ ok: true });
});

export default auth;

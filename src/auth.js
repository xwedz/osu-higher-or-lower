// src/auth.js
//
// 用 osu! 的 OAuth（Authorization Code 流程）登入：
//   1. /api/auth/login    把使用者導去 osu! 的授權頁
//   2. osu! 導回 /api/auth/callback?code=...&state=...
//   3. 後端拿 code 換 access token、呼叫 /me 取得身分，然後簽發自己的 session cookie
//
// 我們只用 access token 這一次來讀取 /me，讀完就丟掉，不儲存。

import crypto from 'node:crypto';
import { Router } from 'express';
import { clearCookie, endSession, getSessionUser, readCookie, setCookie, startSession, unseal } from './session.js';

const STATE_COOKIE = 'osu_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

// 這兩個網址要跟 osu! OAuth 應用程式設定裡登記的 Redirect URL 完全一致。
const redirectUri = () => process.env.OSU_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
// 登入完成後要回到哪裡。開發時前端在 Vite (5173)，部署後前後端同網域就改成 '/'。
const frontendUrl = () => process.env.FRONTEND_URL || 'http://localhost:5173';

const router = Router();

router.get('/login', (req, res) => {
    if (!process.env.OSU_CLIENT_ID) {
        return res.status(500).json({ error: 'Login is not configured on the server' });
    }
    // state 是防 CSRF 的隨機值：導去 osu! 前先存在 cookie，導回來時比對，
    // 確保這次授權是我們自己發起的，而不是別人塞給使用者的連結。
    const state = crypto.randomBytes(16).toString('hex');
    setCookie(res, STATE_COOKIE, 'state', { state }, STATE_TTL_MS);

    const params = new URLSearchParams({
        client_id: process.env.OSU_CLIENT_ID,
        redirect_uri: redirectUri(),
        response_type: 'code',
        scope: 'identify',
        state,
    });
    res.redirect(`https://osu.ppy.sh/oauth/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const saved = unseal('state', readCookie(req, STATE_COOKIE));
    clearCookie(res, STATE_COOKIE);

    const fail = reason => res.redirect(`${frontendUrl()}/?login=${reason}`);

    if (error) return fail('denied'); // 使用者在授權頁按了拒絕
    if (typeof code !== 'string' || !saved || saved.state !== state) return fail('invalid');

    try {
        const tokenRes = await fetch('https://osu.ppy.sh/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                client_id: process.env.OSU_CLIENT_ID,
                client_secret: process.env.OSU_CLIENT_SECRET,
                code,
                grant_type: 'authorization_code',
                redirect_uri: redirectUri(),
            }),
        });
        if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
        const { access_token } = await tokenRes.json();

        const meRes = await fetch('https://osu.ppy.sh/api/v2/me', {
            headers: { 'Authorization': `Bearer ${access_token}`, 'Accept': 'application/json' },
        });
        if (!meRes.ok) throw new Error(`/me failed (${meRes.status})`);
        const me = await meRes.json();

        startSession(res, {
            osuUserId: me.id,
            username: me.username,
            countryCode: me.country_code ?? null,
            countryName: me.country?.name ?? null,
        });
        res.redirect(`${frontendUrl()}/`);
    } catch (err) {
        console.error('osu! 登入失敗:', err);
        fail('error');
    }
});

router.post('/logout', (req, res) => {
    endSession(res);
    res.json({ ok: true });
});

export default router;

// 目前登入的使用者（沒登入回傳 null），給前端啟動時查詢用。
export function meHandler(req, res) {
    res.json({ user: getSessionUser(req) });
}

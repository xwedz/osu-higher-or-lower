// src/auth.js
//
// Log in with osu! OAuth (Authorization Code flow):
//   1. /api/auth/login sends the user to the osu! authorization page
//   2. osu! redirects back to /api/auth/callback?code=...&state=...
//   3. The server exchanges the code for an access token, calls /me to get the user's identity,
//      and issues its own session cookie
//
// The access token is used once to read /me and then discarded; it is never stored.

import crypto from 'node:crypto';
import { Hono } from 'hono';
import { clearSealedCookie, endSession, readSealedCookie, setSealedCookie, startSession } from './session.js';

const STATE_COOKIE = 'osu_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;

// The redirect URI must exactly match one registered in the osu! OAuth application.
// Without OSU_REDIRECT_URI we use this site's own origin; in production the client and API share
// one origin, so nothing needs configuring. In local development the client runs on Vite (5173)
// and the API on wrangler (3000), so .dev.vars sets it explicitly.
const redirectUri = c => c.env.OSU_REDIRECT_URI || `${new URL(c.req.url).origin}/api/auth/callback`;

// Where to send the user after login. Empty string on a shared origin (that is, the relative path "/").
const frontendUrl = c => c.env.FRONTEND_URL || '';

const auth = new Hono();

auth.get('/login', c => {
    if (!c.env.OSU_CLIENT_ID) {
        return c.json({ error: 'Login is not configured on the server' }, 500);
    }
    // state is a random value against CSRF: stored in a cookie before leaving for osu! and compared
    // on the way back, so we only accept authorizations that we started ourselves, not a link
    // someone else slipped to the user.
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

    if (error) return fail('denied'); // the user declined on the authorization page
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
        console.error('osu! login failed:', err);
        return fail('error');
    }
});

auth.post('/logout', c => {
    endSession(c);
    return c.json({ ok: true });
});

export default auth;

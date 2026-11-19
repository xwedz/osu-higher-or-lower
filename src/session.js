// src/session.js
//
// Login state lives in a signed cookie, so the server stores no sessions.
// Same idea as roundToken: the content is plain text and the signature prevents tampering.
// Because of that it keeps working in any hosting setup (many instances, serverless) without changes.
//
// The cookie only holds public information (osu! id, username, country), never an osu! access token.

import crypto from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const SESSION_COOKIE = 'osu_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function mac(secret, purpose, data) {
    if (!secret) throw new Error('ROUND_TOKEN_SECRET is not set');
    // The purpose is part of the signature, so values for one use (login session, OAuth state)
    // can't be passed off as another, and they never collide with roundToken signatures.
    return crypto.createHmac('sha256', secret).update(`${purpose}.${data}`).digest('base64url');
}

export function seal(secret, purpose, payload, ttlMs) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
    return `${body}.${mac(secret, purpose, body)}`;
}

export function unseal(secret, purpose, value) {
    if (typeof value !== 'string') return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;

    const [body, signature] = parts;
    const a = Buffer.from(signature);
    const b = Buffer.from(mac(secret, purpose, body));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
        if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

const cookieOptions = (c, ttlMs) => ({
    httpOnly: true,
    // Lax: the browser sends the cookie when osu! redirects back (a top-level GET navigation),
    // but not on cross-site POSTs from other sites, which also blocks CSRF.
    sameSite: 'Lax',
    // Only add Secure over https (local development runs on http).
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000), // Hono expects seconds
});

export function setSealedCookie(c, name, purpose, payload, ttlMs) {
    setCookie(c, name, seal(c.env.ROUND_TOKEN_SECRET, purpose, payload, ttlMs), cookieOptions(c, ttlMs));
}

export function readSealedCookie(c, name, purpose) {
    return unseal(c.env.ROUND_TOKEN_SECRET, purpose, getCookie(c, name));
}

export function clearSealedCookie(c, name) {
    deleteCookie(c, name, { path: '/' });
}

export function startSession(c, user) {
    setSealedCookie(c, SESSION_COOKIE, 'session', user, SESSION_TTL_MS);
}

export function endSession(c) {
    clearSealedCookie(c, SESSION_COOKIE);
}

/** Returns the logged-in user { osuUserId, username, countryCode, countryName }, or null. */
export function getSessionUser(c) {
    const payload = readSealedCookie(c, SESSION_COOKIE, 'session');
    if (!payload || !Number.isInteger(payload.osuUserId)) return null;
    return {
        osuUserId: payload.osuUserId,
        username: payload.username,
        countryCode: payload.countryCode ?? null,
        countryName: payload.countryName ?? null,
    };
}

export { SESSION_COOKIE };

// src/session.js
//
// 登入狀態存在「簽章 cookie」裡，伺服器不用記住任何 session，
// 跟 roundToken 是同樣的精神：內容明文、靠簽章防竄改。
// 好處是換到任何雲端環境（多實例、無伺服器）都不用改動。
//
// cookie 只放公開資訊（osu! id、名字、國家），不放任何 osu! 的 access token。

import crypto from 'node:crypto';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const SESSION_COOKIE = 'osu_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function mac(secret, purpose, data) {
    if (!secret) throw new Error('缺少 ROUND_TOKEN_SECRET');
    // purpose 一起放進簽章：不同用途（登入狀態、OAuth state）的值不能互相冒用，
    // 也跟 roundToken 的簽章分得開。
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
    // lax：從 osu! 授權頁導回來（頂層 GET 導覽）時瀏覽器會帶上 cookie，
    // 但其他網站發起的跨站 POST 不會帶，等於順便擋掉 CSRF。
    sameSite: 'Lax',
    // 只有走 https 時才加 Secure（本機開發是 http）。
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: Math.floor(ttlMs / 1000), // Hono 的單位是秒
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

/** 回傳目前登入的使用者 { osuUserId, username, countryCode, countryName }，沒登入就是 null。 */
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

// src/session.js
//
// 登入狀態存在「簽章 cookie」裡，伺服器不用記住任何 session，
// 跟 roundToken 是同樣的精神：內容明文、靠簽章防竄改。
// 好處是換到任何雲端環境（多實例、無伺服器）都不用改動。
//
// cookie 只放公開資訊（osu! id、名字、國家），不放任何 osu! 的 access token。

import crypto from 'node:crypto';

const SESSION_COOKIE = 'osu_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const isProd = () => process.env.NODE_ENV === 'production';

function mac(purpose, data) {
    const secret = process.env.ROUND_TOKEN_SECRET;
    if (!secret) throw new Error('缺少 ROUND_TOKEN_SECRET，請檢查 .env 設定');
    // purpose 一起放進簽章：不同用途（登入狀態、OAuth state）的值不能互相冒用，
    // 也跟 roundToken 的簽章分得開。
    return crypto.createHmac('sha256', secret).update(`${purpose}.${data}`).digest('base64url');
}

export function seal(purpose, payload, ttlMs) {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url');
    return `${body}.${mac(purpose, body)}`;
}

export function unseal(purpose, value) {
    if (typeof value !== 'string') return null;
    const parts = value.split('.');
    if (parts.length !== 2) return null;

    const [body, signature] = parts;
    const a = Buffer.from(signature);
    const b = Buffer.from(mac(purpose, body));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    try {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
        if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
        return payload;
    } catch {
        return null;
    }
}

/** 極簡的 Cookie header 解析，避免為了這件事多裝一個套件。 */
export function readCookie(req, name) {
    const header = req.headers.cookie;
    if (!header) return null;
    for (const part of header.split(';')) {
        const i = part.indexOf('=');
        if (i > 0 && part.slice(0, i).trim() === name) {
            try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return null; }
        }
    }
    return null;
}

const cookieOptions = maxAge => ({
    httpOnly: true,
    // lax：從 osu! 授權頁導回來（頂層 GET 導覽）時瀏覽器會帶上 cookie，
    // 但其他網站發起的跨站 POST 不會帶，等於順便擋掉 CSRF。
    sameSite: 'lax',
    secure: isProd(),
    path: '/',
    maxAge,
});

export function setCookie(res, name, purpose, payload, ttlMs) {
    res.cookie(name, seal(purpose, payload, ttlMs), cookieOptions(ttlMs));
}

export function clearCookie(res, name) {
    res.clearCookie(name, { ...cookieOptions(0), maxAge: undefined });
}

export function startSession(res, user) {
    setCookie(res, SESSION_COOKIE, 'session', user, SESSION_TTL_MS);
}

export function endSession(res) {
    clearCookie(res, SESSION_COOKIE);
}

/** 回傳目前登入的使用者 { osuUserId, username, countryCode, countryName }，沒登入就是 null。 */
export function getSessionUser(req) {
    const payload = unseal('session', readCookie(req, SESSION_COOKIE));
    if (!payload || !Number.isInteger(payload.osuUserId)) return null;
    return {
        osuUserId: payload.osuUserId,
        username: payload.username,
        countryCode: payload.countryCode ?? null,
        countryName: payload.countryName ?? null,
    };
}

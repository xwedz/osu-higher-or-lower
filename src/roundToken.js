// src/roundToken.js
//
// 這一輪比較的內容（誰跟誰比、比哪個欄位）不存在資料庫裡，而是簽章後直接交給前端保管，
// 下一次前端把它原封不動送回來時，我們用同一把密鑰驗證這串內容有沒有被竄改過。
// 好處是伺服器完全不用記住「現在有哪些局進行到一半」。
//
// 這是一個簡化版、手寫的 JWT 概念（真正的 JWT 還會有 header、標準化的 claims），
// 這裡只取「簽章 + 驗證」這個核心精神，避免多引入一個套件。
//
// secret 由呼叫端傳進來（Worker 的環境變數在每次請求的 env 裡，不是全域的 process.env）。

import crypto from 'node:crypto';

// token 有效時間：超過就視為過期，避免舊 token 被拿來重放。
const TOKEN_TTL_MS = 10 * 60 * 1000;

function sign(secret, payloadBase64) {
    return crypto.createHmac('sha256', secret).update(payloadBase64).digest('base64url');
}

/**
 * 把這一局的內容包成一個字串：payload 本身 + 對應的簽章，用點號分隔。
 * 注意 payload 只是 base64、任何人都讀得到，所以絕對不能把「正確答案」放進去——
 * 只放雙方玩家 id、模式、連勝數這類本來就公開的資訊，答案由後端在收到猜測時重新比較。
 * 簽章只負責防竄改，不負責保密。
 */
export function signRoundToken(secret, payload) {
    if (!secret) throw new Error('缺少 ROUND_TOKEN_SECRET');
    const payloadBase64 = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS })).toString('base64url');
    return `${payloadBase64}.${sign(secret, payloadBase64)}`;
}

/**
 * 驗證並還原一個 round token。任何格式不對、簽章對不上、已過期的情況，
 * 一律回傳 null，由呼叫端決定要怎麼回應使用者（通常是 400 錯誤）。
 * 成功時多帶一個 signature 欄位，用來標記「這個 token 已經被使用過」。
 */
export function verifyRoundToken(secret, token) {
    if (!secret || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;

    // 用 timingSafeEqual 而不是直接用 === 比較兩個簽章字串，
    // 避免簽章比對的時間差異被拿來推測正確簽章長什麼樣子。
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(sign(secret, payloadBase64));
    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

    try {
        const payload = JSON.parse(Buffer.from(payloadBase64, 'base64url').toString('utf-8'));
        if (typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
        return { ...payload, signature };
    } catch {
        return null;
    }
}

// src/roundToken.js
//
// 這一輪比較的內容（誰跟誰比、比哪個欄位、正確答案是什麼）不存在資料庫裡，
// 而是簽章後直接交給前端保管，下一次前端把它原封不動送回來時，我們用同一把
// 密鑰驗證這串內容有沒有被竄改過。好處是伺服器完全不用記住「現在有哪些局
// 進行到一半」，也不用另外開一張表、寫一支清理過期資料的邏輯。
//
// 這是一個簡化版、手寫的 JWT 概念（真正的 JWT 還會有 header、標準化的
// claims），這裡只取「簽章 + 驗證」這個核心精神，避免多引入一個套件。

import crypto from 'node:crypto';

// token 有效時間：超過就視為過期，避免舊 token 被拿來重放。
const TOKEN_TTL_MS = 10 * 60 * 1000;

// 刻意不在模組載入時就讀取：ESM 的 import 會比 index.js 裡的 dotenv.config()
// 更早執行，那時候 process.env 還沒有 .env 的內容，讀到的會是 undefined。
function getSecret() {
    return process.env.ROUND_TOKEN_SECRET;
}

function base64url(input) {
    return Buffer.from(input).toString('base64url');
}

function sign(payloadBase64) {
    return crypto.createHmac('sha256', getSecret()).update(payloadBase64).digest('base64url');
}

/**
 * 把這一局的內容包成一個字串：payload 本身 + 對應的簽章，用點號分隔。
 * 注意 payload 只是 base64、任何人都讀得到，所以絕對不能把「正確答案」
 * 放進去——只放雙方玩家 id、模式、連勝數這類本來就公開的資訊，答案由
 * 後端在收到猜測時重新從資料庫比較。簽章只負責防竄改，不負責保密。
 */
export function signRoundToken(payload) {
    if (!getSecret()) {
        throw new Error('缺少 ROUND_TOKEN_SECRET，請檢查 .env 設定');
    }
    const payloadBase64 = base64url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
    const signature = sign(payloadBase64);
    return `${payloadBase64}.${signature}`;
}

/**
 * 驗證並還原一個 round token。任何格式不對、簽章對不上的情況，
 * 一律回傳 null，由呼叫端決定要怎麼回應使用者（通常是 400 錯誤）。
 */
export function verifyRoundToken(token) {
    if (!getSecret() || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadBase64, signature] = parts;
    const expectedSignature = sign(payloadBase64);

    // 用 timingSafeEqual 而不是直接用 === 比較兩個簽章字串，
    // 避免簽章比對的時間差異被拿來推測正確簽章長什麼樣子
    // （這種攻擊手法叫 timing attack，對這個小遊戲來說風險很低，
    // 但這是處理簽章比對時值得養成的習慣）。
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);
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

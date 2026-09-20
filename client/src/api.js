// 所有跟後端溝通的地方都集中在這裡，元件本身不直接碰 fetch。

async function parse(res) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
        // 我們自己的頻率限制會帶訊息；Cloudflare 每日額度用完時回的 429 沒有 JSON 內容。
        throw new Error(data.error || 'The site is very busy right now. Please try again in a while.');
    }
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    return data;
}

export const fetchMe = () => fetch('/api/me').then(parse);

export const logout = () => fetch('/api/auth/logout', { method: 'POST' }).then(parse);

export const fetchPools = () => fetch('/api/pools').then(parse);

export const startRound = (mode, pool) =>
    fetch(`/api/round/start?mode=${mode}&pool=${pool}`).then(parse);

export const submitGuess = (roundToken, guess) =>
    fetch('/api/round/guess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundToken, guess }),
    }).then(parse);

export const fetchLeaderboard = (mode, pool) =>
    fetch(`/api/leaderboard?mode=${mode}&pool=${pool}`).then(parse);

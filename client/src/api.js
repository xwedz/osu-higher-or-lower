// All communication with the backend lives here; components never call fetch directly.

async function parse(res) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
        // Our own rate limit includes a message; the 429 Cloudflare returns when the daily quota runs out has no JSON body.
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

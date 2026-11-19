export const MODES = {
    playCount: {
        label: 'Play Count',
        desc: 'Who has played more maps?',
        format: v => Math.round(v).toLocaleString(),
        unit: 'plays',
    },
    accuracy: {
        label: 'Accuracy',
        desc: 'Whose accuracy is higher?',
        format: v => `${v.toFixed(2)}`,
        unit: '%',
    },
    playtime: {
        // The backend returns seconds; shown as hours.
        label: 'Play Time',
        desc: 'Who has spent more time on osu!?',
        format: v => Math.floor(v / 3600).toLocaleString(),
        unit: 'hrs',
    },
};

export const MODE_KEYS = Object.keys(MODES);

export const POOLS = {
    famous: { label: 'Famous', desc: 'Well-known players', tone: 'gold' },
    top100: { label: 'Top 100', desc: 'Global top 100' },
    top1000: { label: 'Top 1000', desc: 'Global top 1000' },
};

export const POOL_KEYS = Object.keys(POOLS);
export const DEFAULT_POOL = 'top1000';

export const avatarUrl = id => `https://a.ppy.sh/${id}`;

// Flags are images rather than emoji: Windows doesn't render flag emoji as flags, only as two letters.
export const flagUrl = code => `https://flagcdn.com/w40/${code.toLowerCase()}.png`;

const BEST_KEY = 'osu-hol-best-v2';
const POOL_PREF_KEY = 'osu-hol-pool';

// Best streaks are stored per mode and pool; different difficulties shouldn't be compared together.
const bestKey = (mode, pool) => `${mode}:${pool}`;

function loadAllBest() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; }
}

export const loadBest = (mode, pool) => loadAllBest()[bestKey(mode, pool)] || 0;

export function saveBest(mode, pool, streak) {
    const all = loadAllBest();
    const key = bestKey(mode, pool);
    if (streak > (all[key] || 0)) {
        all[key] = streak;
        try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch { /* ignore, e.g. in private browsing */ }
        return true;
    }
    return false;
}

export function loadPoolPref() {
    try {
        const p = localStorage.getItem(POOL_PREF_KEY);
        return POOL_KEYS.includes(p) ? p : DEFAULT_POOL;
    } catch { return DEFAULT_POOL; }
}

export function savePoolPref(pool) {
    try { localStorage.setItem(POOL_PREF_KEY, pool); } catch { /* ignore */ }
}

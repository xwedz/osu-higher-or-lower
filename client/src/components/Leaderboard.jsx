import React, { useEffect, useState } from 'react';
import { fetchLeaderboard } from '../api.js';
import { MODES, MODE_KEYS, POOLS, POOL_KEYS, avatarUrl, flagUrl } from '../modes.js';
import Segmented from './Segmented.jsx';

const RANK_STYLE = {
    1: 'bg-[#ffd66b] text-[#4a3400]',
    2: 'bg-[#d5dbe6] text-[#2b3240]',
    3: 'bg-[#e0a070] text-[#3d200a]',
};

function Row({ rank, record, isMe, index }) {
    return (
        <li
            style={{ animationDelay: `${index * 40}ms` }}
            className={`grid animate-rise grid-cols-[40px_1fr_auto] items-center gap-3 rounded-2xl px-3.5 py-3 ${
                isMe ? 'border border-pink/45 bg-pink/16' : 'bg-white/5'
            }`}
        >
            <span className={`grid size-8 place-items-center rounded-full font-bold ${RANK_STYLE[rank] ?? 'bg-white/8'}`}>{rank}</span>
            <span className="flex min-w-0 items-center gap-2">
                <img className="size-7.5 flex-none rounded-full bg-bg-2 object-cover" src={avatarUrl(record.osuUserId)} alt="" draggable="false" />
                {record.countryCode && (
                    <img
                        className="h-3.5 w-5 flex-none rounded-xs object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                        src={flagUrl(record.countryCode)}
                        alt=""
                        title={record.countryName ?? record.countryCode}
                        draggable="false"
                    />
                )}
                <span className="truncate font-semibold">{record.username}</span>
            </span>
            <span className="text-xl font-extrabold tabular-nums text-pink">{record.streak}</span>
        </li>
    );
}

export default function Leaderboard({ state = 'open', initialMode, initialPool, onClose }) {
    const [mode, setMode] = useState(initialMode);
    const [pool, setPool] = useState(initialPool);
    const [data, setData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError('');
        fetchLeaderboard(mode, pool)
            .then(d => { if (!cancelled) setData(d); })
            .catch(e => { if (!cancelled) setError(e.message); });
        return () => { cancelled = true; };
    }, [mode, pool]);

    useEffect(() => {
        const onKey = e => e.key === 'Escape' && onClose();
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const records = data?.records;
    const me = data?.me;
    // 自己有紀錄、但不在前 10 名時，另外附在最下面。
    const meOutside = me && !records?.some(r => r.osuUserId === me.osuUserId);

    return (
        <div
            data-state={state}
            onClick={onClose}
            className="group fixed inset-0 z-100 grid animate-fade-in place-items-center bg-[rgba(10,6,12,0.7)] backdrop-blur-sm data-[state=closed]:animate-fade-out"
        >
            <div
                onClick={e => e.stopPropagation()}
                className="scroll-dark max-h-[82vh] w-[min(440px,calc(100%-32px))] animate-scale-in overflow-auto rounded-[28px] border border-white/12 bg-[rgba(30,20,36,0.92)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.5)] group-data-[state=closed]:animate-scale-out"
            >
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-semibold">Leaderboard</h3>
                    <button
                        className="glass rounded-full px-4 py-2 text-sm transition-[background-color,translate] duration-200 hover:-translate-y-px hover:bg-white/16"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>

                <Segmented
                    className="mb-3"
                    ariaLabel="Mode"
                    value={mode}
                    onChange={setMode}
                    options={MODE_KEYS.map(k => ({ key: k, label: MODES[k].label }))}
                />
                <Segmented
                    className="mb-4"
                    ariaLabel="Player pool"
                    value={pool}
                    onChange={setPool}
                    options={POOL_KEYS.map(k => ({ key: k, label: POOLS[k].label, tone: POOLS[k].tone }))}
                />

                {/* 固定最小高度，切換分頁時視窗不會忽大忽小 */}
                <div className="min-h-80">
                    {error && <p className="text-muted">{error}</p>}
                    {!error && data === null && (
                        <div className="mx-auto mt-24 size-7 animate-spin rounded-full border-3 border-white/15 border-t-pink" />
                    )}
                    {records && records.length === 0 && (
                        <p className="animate-fade-in pt-24 text-center text-muted">
                            No records yet — log in with osu! and be the first!
                        </p>
                    )}
                    {records && records.length > 0 && (
                        <ol className="flex flex-col gap-2">
                            {records.map((r, i) => (
                                <Row key={r.id} rank={i + 1} record={r} index={i} isMe={me?.osuUserId === r.osuUserId} />
                            ))}
                            {meOutside && (
                                <>
                                    <li aria-hidden="true" className="text-center tracking-[4px] text-muted">⋯</li>
                                    <Row
                                        rank={me.rank}
                                        index={records.length}
                                        isMe
                                        record={{ osuUserId: me.osuUserId, username: 'You', streak: me.streak }}
                                    />
                                </>
                            )}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
}

import React, { useEffect, useRef, useState } from 'react';
import { fetchPools } from '../api.js';
import { MODES, MODE_KEYS, POOLS, POOL_KEYS, DEFAULT_POOL, loadBest } from '../modes.js';
import Segmented from './Segmented.jsx';
import UserChip from './UserChip.jsx';

// 只有真的有滑鼠、且沒有開「減少動態效果」時，卡片才會跟著游標傾斜。
const canTilt = () =>
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 模式卡片：游標移動時卡片朝游標方向微微傾斜，同時有一團粉紅光暈跟著游標走。
 * 傾斜角度與光暈位置都寫成 CSS 變數，不經過 React state。
 */
function ModeCard({ index, mode, best, onPlay }) {
    const ref = useRef(null);

    const onMove = e => {
        if (!canTilt()) return;
        const el = ref.current;
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        el.style.setProperty('--rx', `${((0.5 - py) * 6).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((px - 0.5) * 6).toFixed(2)}deg`);
        el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    };

    const onLeave = () => {
        const el = ref.current;
        el.style.setProperty('--rx', '0deg');
        el.style.setProperty('--ry', '0deg');
    };

    return (
        <button
            ref={ref}
            onPointerMove={onMove}
            onPointerLeave={onLeave}
            onClick={onPlay}
            style={{ animationDelay: `${200 + index * 90}ms` }}
            className="group glass relative flex w-55 animate-rise flex-col items-start gap-1.5 overflow-hidden rounded-3xl px-5.5 py-6.5 text-left backdrop-blur-lg transition-[transform,translate,border-color,background-color,box-shadow] duration-300 ease-out-expo [transform:perspective(800px)_rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] hover:-translate-y-2 hover:border-pink/60 hover:bg-pink/10 hover:shadow-[0_18px_44px_rgba(255,61,139,0.22)] active:-translate-y-0.5 active:scale-[0.98] stacked:w-full stacked:max-w-90 stacked:px-5 stacked:py-4.5"
        >
            <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{ background: 'radial-gradient(260px circle at var(--gx, 50%) var(--gy, 50%), rgba(255,102,170,0.24), transparent 65%)' }}
            />
            <span className="relative text-[22px] font-bold">{MODES[mode].label}</span>
            <span className="relative text-sm leading-normal text-muted">{MODES[mode].desc}</span>
            <span className="relative mt-auto pt-2.5 text-[13px] text-muted">
                Best streak <b className="text-[15px] text-pink">{best}</b>
            </span>
        </button>
    );
}

export default function ModeSelect({ state = 'open', user, onLogout, pool, onPoolChange, onPlay, onShowLeaderboard }) {
    const [poolInfo, setPoolInfo] = useState(null); // { famous: { count, available }, ... }

    useEffect(() => {
        let cancelled = false;
        fetchPools()
            .then(d => {
                if (cancelled) return;
                const info = Object.fromEntries(d.pools.map(p => [p.pool, p]));
                setPoolInfo(info);
                // 之前選的池如果現在不能玩，退回預設值。
                if (info[pool] && !info[pool].available) onPoolChange(DEFAULT_POOL);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const poolOptions = POOL_KEYS.map(key => {
        const unavailable = poolInfo?.[key] && !poolInfo[key].available;
        return {
            key,
            label: POOLS[key].label,
            sub: unavailable ? 'Coming soon' : POOLS[key].desc,
            disabled: unavailable,
            title: unavailable ? 'Coming soon' : POOLS[key].desc,
        };
    });

    return (
        <main
            data-state={state}
            className="absolute inset-0 flex animate-fade-in flex-col items-center justify-center gap-4.5 overflow-hidden px-4 py-6 data-[state=closed]:animate-fade-out"
        >
            {/* 背景光暈 */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-56 -left-56 size-225 rounded-full bg-[radial-gradient(closest-side,rgba(255,102,170,0.22),transparent)]"
            />
            <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-56 -bottom-56 size-225 rounded-full bg-[radial-gradient(closest-side,rgba(120,90,255,0.2),transparent)]"
            />

            {/* 光圈：外層負責置中，內層負責呼吸動畫，兩者不互相干擾 */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[58%]"
            >
                <div className="size-130 animate-ring rounded-full border-[6px] border-pink/18 stacked:size-85">
                    <div className="m-15 size-[calc(100%-120px)] rounded-full border-[3px] border-pink/12 stacked:m-10 stacked:size-[calc(100%-80px)]" />
                </div>
            </div>

            <UserChip user={user} onLogout={onLogout} />

            <div className="relative">
                <h1 className="animate-rise text-center leading-none">
                    <span className="block bg-linear-to-br from-[#ffb3d6] to-pink-2 bg-clip-text text-[clamp(64px,12vw,108px)] font-extrabold tracking-[-2px] text-transparent drop-shadow-[0_6px_30px_rgba(255,61,139,0.45)]">
                        osu!
                    </span>
                    <span className="mt-1.5 block text-[clamp(20px,4vw,32px)] font-semibold tracking-wide">
                        Higher <i className="text-pink not-italic">or</i> Lower
                    </span>
                </h1>
                <p className="mt-4 animate-rise text-center text-muted [animation-delay:100ms]">
                    Guess whether the next player's stat is higher or lower.
                </p>
            </div>

            <Segmented
                className="relative animate-rise [animation-delay:150ms]"
                ariaLabel="Player pool"
                options={poolOptions}
                value={pool}
                onChange={onPoolChange}
            />

            <div className="relative mt-2 flex flex-wrap justify-center gap-4">
                {MODE_KEYS.map((key, i) => (
                    <ModeCard key={key} index={i} mode={key} best={loadBest(key, pool)} onPlay={() => onPlay(key)} />
                ))}
            </div>

            <button
                className="relative animate-rise rounded-xl px-3 py-2 text-sm text-muted transition-colors [animation-delay:550ms] hover:bg-white/8 hover:text-ink"
                onClick={() => onShowLeaderboard({ mode: MODE_KEYS[0], pool })}
            >
                🏆 Leaderboard
            </button>
        </main>
    );
}

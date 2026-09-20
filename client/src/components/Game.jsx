import React, { useCallback, useEffect, useRef, useState } from 'react';
import { startRound, submitGuess } from '../api.js';
import { MODES, POOLS, avatarUrl, loadBest, saveBest } from '../modes.js';
import PlayerPanel from './PlayerPanel.jsx';
import Presence from './Presence.jsx';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

function preload(id) {
    const img = new Image();
    img.src = avatarUrl(id);
    return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
}

const chip =
    'glass rounded-full px-4 py-2 text-sm whitespace-nowrap stacked:px-3 stacked:py-1.75 stacked:text-[13px]';

const overlayBase =
    'group absolute inset-0 z-30 grid animate-fade-in place-items-center data-[state=closed]:animate-fade-out';
const cardBase =
    'flex max-w-[calc(100%-32px)] animate-scale-in flex-col items-center gap-1.5 rounded-[28px] border border-white/12 bg-[rgba(30,20,36,0.85)] px-10 py-8.5 text-center shadow-[0_30px_80px_rgba(0,0,0,0.5)] group-data-[state=closed]:animate-scale-out stacked:px-6 stacked:py-7';
const cardBtn =
    'glass rounded-2xl px-6.5 py-3.5 text-[17px] font-semibold transition-[translate,scale,background-color,box-shadow] duration-250 ease-out-expo hover:-translate-y-0.75 hover:bg-white/16 active:translate-y-0 active:scale-[0.97]';

export default function Game({ state = 'open', mode, pool, onExit, onShowLeaderboard }) {
    const meta = MODES[mode];
    const [panels, setPanels] = useState([]);  // 每位出現過的玩家，index 即順序
    const [runKey, setRunKey] = useState(0);   // 每次開新局 +1，讓舊的玩家卡片整批換掉（並重新淡入）
    const [cur, setCur] = useState(0);         // panels[cur] 是已知方，panels[cur+1] 是未知方
    const [token, setToken] = useState(null);
    const [streak, setStreak] = useState(0);
    const [phase, setPhase] = useState('loading'); // loading | guessing | submitting | revealing | over | error
    const [result, setResult] = useState(null);    // 最近一次猜測 true/false
    const [error, setError] = useState('');
    const [best, setBest] = useState(() => loadBest(mode, pool));
    const [newRecord, setNewRecord] = useState(false);
    const [ranked, setRanked] = useState(false); // 這一局是不是登入狀態下開始的（只有這種局會進排行榜）
    const alive = useRef(true);
    const runId = useRef(0);

    const begin = useCallback(async () => {
        const id = ++runId.current;
        // 先只切到 loading：載入遮罩會淡入蓋住畫面，等新的一局準備好才在遮罩底下換內容，
        // 這樣「再玩一次」時舊畫面不會突然被換掉。
        setPhase('loading');
        setError('');
        try {
            const r = await startRound(mode, pool);
            await Promise.all([preload(r.known.osuUserId), preload(r.unknown.osuUserId)]);
            if (!alive.current || id !== runId.current) return;
            setPanels([{ ...r.known }, { ...r.unknown }]);
            setRunKey(k => k + 1);
            setCur(0);
            setToken(r.roundToken);
            setStreak(0);
            setRanked(r.ranked);
            setResult(null);
            setNewRecord(false);
            setPhase('guessing');
        } catch (e) {
            if (!alive.current || id !== runId.current) return;
            setError(e.message);
            setPhase('error');
        }
    }, [mode, pool]);

    useEffect(() => {
        alive.current = true;
        begin();
        return () => { alive.current = false; };
    }, [begin]);

    const onGuess = useCallback(async guess => {
        if (phase !== 'guessing') return;
        const id = runId.current;
        setPhase('submitting');
        try {
            const res = await submitGuess(token, guess);
            if (!alive.current || id !== runId.current) return;

            // 揭曉：把真正的數值填進未知方，數字會自己滾動。
            setPanels(ps => ps.map((p, i) => (i === cur + 1 ? { ...p, value: res.unknown.value } : p)));
            setResult(res.correct);
            setPhase('revealing');

            if (!res.correct) {
                await sleep(1700);
                if (!alive.current || id !== runId.current) return;
                setNewRecord(saveBest(mode, pool, res.finalStreak) && res.finalStreak > 0);
                setBest(loadBest(mode, pool));
                setStreak(res.finalStreak);
                setPhase('over');
                return;
            }

            setStreak(res.streak);
            setBest(b => Math.max(b, res.streak));
            saveBest(mode, pool, res.streak);
            setToken(res.nextRound.roundToken);
            // 趁揭曉動畫的時間先把下一位的頭像載好，滑進來時才不會閃一下。
            const ready = preload(res.nextRound.unknown.osuUserId);
            await Promise.all([sleep(1700), ready]);
            if (!alive.current || id !== runId.current) return;

            // 先把新玩家放在畫面外（位置 +2），下一個 frame 才推進 cur，才會有滑動動畫。
            setPanels(ps => [...ps, { ...res.nextRound.unknown }]);
            await nextFrame();
            if (!alive.current || id !== runId.current) return;
            setResult(null);
            setCur(c => c + 1);
            await sleep(650);
            if (!alive.current || id !== runId.current) return;
            setPhase('guessing');
        } catch (e) {
            if (!alive.current || id !== runId.current) return;
            setError(e.message);
            setPhase('error');
        }
    }, [phase, token, cur, mode, pool]);

    // 鍵盤操作：↑ 更高、↓ 更低、Esc 離開。整個畫面正在淡出時不再接受操作。
    useEffect(() => {
        const onKey = e => {
            if (state === 'closed') return;
            if (e.key === 'ArrowUp') { e.preventDefault(); onGuess('higher'); }
            if (e.key === 'ArrowDown') { e.preventDefault(); onGuess('lower'); }
            if (e.key === 'Escape') onExit();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onGuess, onExit, state]);

    const known = panels[cur];
    const unknown = panels[cur + 1];

    return (
        <div
            data-state={state}
            className="absolute inset-0 animate-fade-in overflow-hidden bg-bg data-[state=closed]:animate-fade-out"
        >
            {/* 猜對／猜錯時畫面邊緣閃一下光。key 讓每一次新的結果都重新播放。 */}
            {result !== null && (
                <div
                    key={`${streak}-${result}`}
                    className={`pointer-events-none absolute inset-0 z-5 animate-flash ${
                        result ? 'shadow-[inset_0_0_160px_rgba(91,227,154,0.5)]' : 'shadow-[inset_0_0_160px_rgba(255,90,110,0.55)]'
                    }`}
                />
            )}

            <header className="absolute inset-x-0 top-0 z-20 grid animate-fade-in grid-cols-[auto_1fr_auto] items-start gap-2 p-4 px-4.5 stacked:p-2.5 stacked:px-3">
                <button className={`${chip} justify-self-start transition-[background-color,translate] duration-200 hover:-translate-y-px hover:bg-white/16`} onClick={onExit}>
                    ← Modes
                </button>
                <div className="flex flex-col items-center justify-self-center rounded-[22px] border border-white/12 bg-bg/55 px-6.5 pt-2 pb-2.5 leading-[1.05] backdrop-blur-lg stacked:px-4.5 stacked:pt-1.5 stacked:pb-2">
                    <span className="text-xs tracking-[2px] whitespace-nowrap text-muted stacked:text-[11px] stacked:tracking-[1px]">
                        {meta.label} · {POOLS[pool].label}
                    </span>
                    <span key={streak} className="animate-pop text-[40px] font-extrabold tabular-nums text-pink stacked:text-[30px]">
                        {streak}
                    </span>
                    <span className="text-xs text-muted">streak</span>
                </div>
                <div className={`${chip} justify-self-end`}>
                    Best <b className="ml-1 text-pink">{best}</b>
                </div>
            </header>

            <div className="absolute inset-0">
                {panels.map((p, i) => {
                    const pos = i - cur;
                    if (pos < -1 || pos > 2) return null;
                    return (
                        <PlayerPanel
                            key={`${runKey}-${i}`}
                            player={p}
                            pos={pos}
                            mode={mode}
                            known={pos !== 1}
                            canGuess={phase === 'guessing'}
                            result={pos === 1 ? result : null}
                            onGuess={onGuess}
                        />
                    );
                })}

                {panels.length > 0 && (
                    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                        <div
                            className={`grid size-17 animate-scale-in place-items-center rounded-full border-3 text-xl font-extrabold shadow-[0_0_0_6px_rgba(255,102,170,0.15),0_10px_40px_rgba(0,0,0,0.5)] transition-[background-color,border-color,color] duration-300 stacked:size-13.5 stacked:text-base ${
                                result === true
                                    ? 'animate-bounce-in border-good bg-good text-[28px] text-[#062b18]'
                                    : result === false
                                        ? 'animate-shake border-bad bg-bad text-[28px] text-[#2b060c]'
                                        : 'border-pink bg-bg'
                            }`}
                        >
                            {result === true ? '✓' : result === false ? '✕' : 'VS'}
                        </div>
                    </div>
                )}

                <Presence show={phase === 'guessing' && !!known && !!unknown}>
                    {s => (
                        <div
                            data-state={s}
                            className="absolute bottom-5.5 left-1/2 z-15 max-w-[calc(100%-32px)] -translate-x-1/2 animate-rise rounded-full border border-white/12 bg-bg/60 px-5 py-2.5 text-center text-[15px] text-muted backdrop-blur-lg data-[state=closed]:animate-fade-out stacked:hidden"
                        >
                            Does <b className="text-ink">{unknown?.username}</b> have a higher or lower {meta.label.toLowerCase()} than{' '}
                            <b className="text-ink">{known?.username}</b>?
                        </div>
                    )}
                </Presence>
            </div>

            <Presence show={phase === 'loading'}>
                {s => (
                    <div data-state={s} className={`${overlayBase} bg-bg/80 backdrop-blur-sm`}>
                        <div className="size-11.5 animate-spin rounded-full border-4 border-white/15 border-t-pink" />
                    </div>
                )}
            </Presence>

            <Presence show={phase === 'error'}>
                {s => (
                    <div data-state={s} className={`${overlayBase} bg-[rgba(10,6,12,0.72)] backdrop-blur-sm`}>
                        <div className={cardBase}>
                            <h3 className="text-[22px] font-semibold">Something went wrong</h3>
                            <p className="text-muted">{error}</p>
                            <div className="mt-5.5 flex flex-wrap justify-center gap-2.5">
                                <button
                                    className={`${cardBtn} border-transparent! bg-linear-to-br from-pink to-pink-2 shadow-[0_8px_28px_rgba(255,61,139,0.4)] hover:brightness-110`}
                                    onClick={begin}
                                >
                                    Try again
                                </button>
                                <button className={cardBtn} onClick={onExit}>Home</button>
                            </div>
                        </div>
                    </div>
                )}
            </Presence>

            <Presence show={phase === 'over'}>
                {s => (
                    <div data-state={s} className={`${overlayBase} bg-[rgba(10,6,12,0.72)] backdrop-blur-sm`}>
                        <div className={cardBase}>
                            <div className="text-muted">Game over · {meta.label} · {POOLS[pool].label}</div>
                            <div className="bg-linear-to-br from-[#ffb3d6] to-pink-2 bg-clip-text text-[110px] leading-none font-extrabold text-transparent stacked:text-[88px]">
                                {streak}
                            </div>
                            <div className="text-muted">streak</div>
                            {newRecord && (
                                <div className="mt-2.5 rounded-full bg-pink/18 px-4 py-1.5 font-semibold text-pink">
                                    🎉 New personal best!
                                </div>
                            )}
                            {ranked && streak > 0 && (
                                <div className="text-[13px] text-muted">🏆 Your best streak is saved to the leaderboard</div>
                            )}
                            {!ranked && (
                                <div className="mt-3.5 flex flex-col items-center gap-2.5">
                                    <span className="text-[13px] text-muted">Log in so your next runs count on the leaderboard</span>
                                    <a
                                        href="/api/auth/login"
                                        className="rounded-2xl bg-linear-to-br from-pink to-pink-2 px-5 py-2.5 text-[15px] font-semibold text-white shadow-[0_8px_28px_rgba(255,61,139,0.35)] transition-[translate,filter] duration-300 hover:-translate-y-0.5 hover:brightness-110"
                                    >
                                        Log in with osu!
                                    </a>
                                </div>
                            )}
                            <div className="mt-5.5 flex flex-wrap justify-center gap-2.5">
                                <button
                                    className={`${cardBtn} border-transparent! bg-linear-to-br from-pink to-pink-2 shadow-[0_8px_28px_rgba(255,61,139,0.4)] hover:brightness-110`}
                                    onClick={begin}
                                >
                                    Play again
                                </button>
                                <button className={cardBtn} onClick={() => onShowLeaderboard({ mode, pool })}>Leaderboard</button>
                                <button className={`${cardBtn} bg-transparent!`} onClick={onExit}>Modes</button>
                            </div>
                        </div>
                    </div>
                )}
            </Presence>
        </div>
    );
}

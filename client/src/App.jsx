import React, { useCallback, useEffect, useRef, useState } from 'react';
import ModeSelect from './components/ModeSelect.jsx';
import Game from './components/Game.jsx';
import Leaderboard from './components/Leaderboard.jsx';
import Presence from './components/Presence.jsx';
import { fetchMe, logout } from './api.js';
import { loadPoolPref, savePoolPref } from './modes.js';

const LOGIN_ERRORS = {
    denied: 'Login was cancelled.',
    invalid: 'Login failed, please try again.',
    error: 'Could not log in with osu! right now, please try again later.',
};

// 畫面切換時，離開的那個畫面要多留一小段時間播放淡出。
const SCREEN_EXIT_MS = 350;

export default function App() {
    // 目前在玩哪個模式；null = 首頁。playId 每次開始遊戲都會 +1，確保重新進入時一定是全新的一局。
    const [play, setPlay] = useState({ mode: null, id: 0 });
    const [pool, setPool] = useState(loadPoolPref);
    const [board, setBoard] = useState(null); // { mode, pool }；null = 排行榜關閉
    const [user, setUser] = useState(null);
    const [notice, setNotice] = useState('');

    // 元件淡出期間，父層的狀態已經變成 null 了，所以要記住「最後一個有值的內容」讓它繼續顯示。
    const lastMode = useRef(play.mode);
    if (play.mode) lastMode.current = play.mode;
    const lastBoard = useRef(board);
    if (board) lastBoard.current = board;
    const lastNotice = useRef(notice);
    if (notice) lastNotice.current = notice;

    const exit = useCallback(() => setPlay(p => ({ ...p, mode: null })), []);
    const start = useCallback(mode => setPlay(p => ({ mode, id: p.id + 1 })), []);
    const closeBoard = useCallback(() => setBoard(null), []);
    const changePool = useCallback(p => { setPool(p); savePoolPref(p); }, []);

    useEffect(() => {
        fetchMe().then(d => setUser(d.user)).catch(() => {});

        // 登入失敗時後端會導回 /?login=原因，顯示提示後把網址列清乾淨。
        const reason = new URLSearchParams(window.location.search).get('login');
        if (reason) {
            setNotice(LOGIN_ERRORS[reason] ?? LOGIN_ERRORS.error);
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, []);

    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(''), 5000);
        return () => clearTimeout(t);
    }, [notice]);

    const onLogout = useCallback(async () => {
        try { await logout(); } catch { return; } // 登出失敗就維持原狀
        setUser(null);
    }, []);

    return (
        <>
            <Presence show={play.mode === null} exitMs={SCREEN_EXIT_MS}>
                {state => (
                    <ModeSelect
                        state={state}
                        user={user}
                        onLogout={onLogout}
                        pool={pool}
                        onPoolChange={changePool}
                        onPlay={start}
                        onShowLeaderboard={setBoard}
                    />
                )}
            </Presence>

            <Presence show={play.mode !== null} exitMs={SCREEN_EXIT_MS}>
                {state => (
                    <Game
                        key={`${play.id}:${pool}`}
                        state={state}
                        mode={lastMode.current}
                        pool={pool}
                        onExit={exit}
                        onShowLeaderboard={setBoard}
                    />
                )}
            </Presence>

            <Presence show={board !== null}>
                {state => (
                    <Leaderboard
                        state={state}
                        initialMode={lastBoard.current.mode}
                        initialPool={lastBoard.current.pool}
                        onClose={closeBoard}
                    />
                )}
            </Presence>

            <Presence show={notice !== ''}>
                {state => (
                    <div
                        role="status"
                        data-state={state}
                        className="fixed bottom-7 left-1/2 z-200 max-w-[calc(100%-32px)] -translate-x-1/2 animate-rise rounded-2xl border border-white/12 bg-[rgba(30,20,36,0.95)] px-5.5 py-3 shadow-[0_16px_50px_rgba(0,0,0,0.5)] data-[state=closed]:animate-fade-out"
                    >
                        {lastNotice.current}
                    </div>
                )}
            </Presence>
        </>
    );
}

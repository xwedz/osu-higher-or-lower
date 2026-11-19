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

// When switching screens, the outgoing screen stays a little longer to play its fade-out.
const SCREEN_EXIT_MS = 350;

export default function App() {
    // The mode being played; null = home screen. id increases on every start so re-entering is always a fresh run.
    const [play, setPlay] = useState({ mode: null, id: 0 });
    const [pool, setPool] = useState(loadPoolPref);
    const [board, setBoard] = useState(null); // { mode, pool }; null = leaderboard closed
    const [user, setUser] = useState(null);
    const [notice, setNotice] = useState('');

    // While a component fades out, the parent state is already null, so keep the last non-null value to keep showing it.
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

        // A failed login redirects back to /?login=<reason>; show a notice and clean up the address bar.
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
        try { await logout(); } catch { return; } // if logout fails, keep the current state
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

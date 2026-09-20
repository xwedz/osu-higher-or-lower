import React from 'react';
import { avatarUrl, flagUrl } from '../modes.js';

const corner = 'absolute right-4.5 top-4.5 z-5 animate-rise [animation-delay:300ms] stacked:right-3 stacked:top-3';

/** 首頁右上角：登入前是 osu! 登入按鈕，登入後顯示自己的頭像、國旗、名字和登出。 */
export default function UserChip({ user, onLogout }) {
    if (!user) {
        return (
            <a
                href="/api/auth/login"
                className={`${corner} rounded-2xl bg-linear-to-br from-pink to-pink-2 px-5 py-2.5 text-[15px] font-semibold text-white shadow-[0_8px_28px_rgba(255,61,139,0.35)] transition-[box-shadow,filter,translate] duration-300 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_12px_34px_rgba(255,61,139,0.5)] stacked:px-3.5 stacked:py-2 stacked:text-[13px]`}
            >
                Log in with osu!
            </a>
        );
    }
    return (
        <div className={`${corner} glass flex items-center gap-2 rounded-full py-1.5 pr-2 pl-1.5`}>
            <img className="size-8 rounded-full bg-bg-2 object-cover" src={avatarUrl(user.osuUserId)} alt="" draggable="false" />
            {user.countryCode && (
                <img
                    className="h-3.5 w-5 rounded-xs object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
                    src={flagUrl(user.countryCode)}
                    alt={user.countryName ?? user.countryCode}
                    title={user.countryName ?? user.countryCode}
                    draggable="false"
                />
            )}
            <b className="max-w-35 truncate text-sm stacked:max-w-22">{user.username}</b>
            <button
                className="rounded-full px-2.5 py-1 text-xs text-muted transition-colors hover:bg-white/12 hover:text-ink"
                onClick={onLogout}
            >
                Log out
            </button>
        </div>
    );
}

import React, { useState } from 'react';
import { MODES, avatarUrl, flagUrl } from '../modes.js';
import useCountUp from '../useCountUp.js';

const chip =
    'inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/10 px-2.5 py-1 text-sm font-medium tabular-nums text-white/90 stacked:px-2 stacked:py-0.5 stacked:text-xs';

const actionBtn =
    'glass inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[17px] font-semibold transition-[translate,scale,background-color,border-color,box-shadow] duration-250 ease-out-expo enabled:hover:-translate-y-0.75 enabled:active:translate-y-0 enabled:active:scale-[0.97] stacked:px-2 stacked:py-3 stacked:text-base';

/**
 * pos：相對於目前這一輪的位置。0 = 已知方（左/上），1 = 未知方（右/下），
 * 2 = 還在畫面外等著滑進來，-1 = 已經滑出去。位置變動時靠 CSS transition 做出滑動。
 *
 */
export default function PlayerPanel({ player, pos, mode, known, canGuess, result, onGuess }) {
    const meta = MODES[mode];
    // 這個 panel 一開始如果沒有數值，代表它是「猜謎對象」，揭曉時要做數字滾動。
    const [wasHidden] = useState(player.value === undefined);
    const shown = useCountUp(player.value, wasHidden);

    const valueColor = result === true ? 'text-good' : result === false ? 'text-bad' : shown === undefined ? 'text-pink' : '';

    return (
        <section
            style={{ '--pos': pos }}
            aria-hidden={pos < 0 || pos > 1}
            className="absolute top-0 left-0 h-full w-1/2 animate-fade-in overflow-hidden transition-transform duration-700 ease-smooth will-change-transform [transform:translate3d(calc(var(--pos)*100%),0,0)] stacked:h-1/2 stacked:w-full stacked:[transform:translate3d(0,calc(var(--pos)*100%),0)]"
        >
            {/* 背景：模糊的頭像 */}
            <div
                className="absolute -inset-[10%] scale-[1.15] bg-cover bg-center blur-[38px] brightness-[0.65] saturate-[1.3]"
                style={{ backgroundImage: `url(${avatarUrl(player.osuUserId)})` }}
            />
            {/* 三層遮罩：預設、猜對（綠）、猜錯（紅），用透明度淡入淡出切換 */}
            <div className="absolute inset-0 bg-linear-to-b from-bg/35 to-bg/70" />
            <div className={`absolute inset-0 bg-linear-to-b from-[rgba(20,90,60,0.45)] to-[rgba(10,40,30,0.75)] transition-opacity duration-500 ${result === true ? 'opacity-100' : 'opacity-0'}`} />
            <div className={`absolute inset-0 bg-linear-to-b from-[rgba(120,20,40,0.5)] to-[rgba(50,10,20,0.78)] transition-opacity duration-500 ${result === false ? 'opacity-100' : 'opacity-0'}`} />

            <div className={`relative flex h-full flex-col items-center justify-center gap-2.5 px-6 pt-22.5 pb-10 text-center stacked:gap-1.5 stacked:px-4 stacked:pb-3 ${known ? 'stacked:pt-22' : 'stacked:pt-3'}`}>
                <img
                    className="aspect-square size-[clamp(110px,20vmin,190px)] animate-scale-in rounded-full border-4 border-white/90 bg-bg-2 object-cover shadow-[0_16px_50px_rgba(0,0,0,0.5)] stacked:size-[clamp(48px,8vh,80px)] stacked:border-3"
                    src={avatarUrl(player.osuUserId)}
                    alt=""
                    draggable="false"
                />
                <h2 className="mt-1.5 max-w-full truncate text-[clamp(24px,4vw,40px)] font-extrabold stacked:mt-0.5 stacked:text-[22px]">
                    {player.username}
                </h2>

                <div className="flex max-w-full flex-wrap justify-center gap-x-2 gap-y-1.5">
                    {player.countryCode && (
                        <span className={chip}>
                            <img
                                className="h-3.5 w-5 rounded-xs object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)] stacked:h-2.75 stacked:w-4"
                                src={flagUrl(player.countryCode)}
                                alt=""
                                draggable="false"
                                onError={e => { e.currentTarget.style.display = 'none'; }}
                            />
                            {player.countryName ?? player.countryCode}
                        </span>
                    )}
                    {player.globalRank != null && <span className={chip}>#{player.globalRank.toLocaleString()}</span>}
                    {player.pp != null && <span className={chip}>{Math.round(player.pp).toLocaleString()}pp</span>}
                </div>
                {player.note && (
                    <div className="mt-0.5 rounded-full bg-pink/22 px-3 py-0.5 text-[13px] font-semibold text-[#ffd0e6] stacked:text-xs">
                        {player.note}
                    </div>
                )}

                <div className="text-[15px] tracking-[3px] text-white/70 stacked:hidden">{meta.label}</div>
                <div
                    className={`min-h-[1.05em] text-[clamp(38px,7vw,80px)] leading-[1.05] font-extrabold tabular-nums transition-colors duration-500 stacked:text-[clamp(30px,8vh,56px)] ${valueColor} ${shown === undefined ? 'animate-breathe' : ''}`}
                >
                    {shown === undefined ? '?' : (
                        <span className="inline-block animate-pop">
                            {meta.format(shown)}
                            <span className="ml-2 text-[0.32em] font-semibold text-white/75">{meta.unit}</span>
                        </span>
                    )}
                </div>

                {!known && (
                    <div
                        className={`mt-3.5 flex w-[min(260px,100%)] flex-col gap-3 transition-[opacity,translate] duration-400 ease-out-expo stacked:mt-2 stacked:flex-row ${
                            canGuess ? '' : 'pointer-events-none translate-y-2.5 opacity-0'
                        }`}
                    >
                        <button
                            className={`${actionBtn} enabled:hover:border-good enabled:hover:bg-good/20 enabled:hover:shadow-[0_10px_30px_rgba(91,227,154,0.25)]`}
                            disabled={!canGuess}
                            onClick={() => onGuess('higher')}
                        >
                            <span className="text-sm text-good">▲</span> Higher
                            <kbd className="ml-1.5 rounded-md bg-white/12 px-1.5 font-[inherit] text-xs text-muted stacked:hidden">↑</kbd>
                        </button>
                        <button
                            className={`${actionBtn} enabled:hover:border-bad enabled:hover:bg-bad/20 enabled:hover:shadow-[0_10px_30px_rgba(255,90,110,0.25)]`}
                            disabled={!canGuess}
                            onClick={() => onGuess('lower')}
                        >
                            <span className="text-sm text-bad">▼</span> Lower
                            <kbd className="ml-1.5 rounded-md bg-white/12 px-1.5 font-[inherit] text-xs text-muted stacked:hidden">↓</kbd>
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}

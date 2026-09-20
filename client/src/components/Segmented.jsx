import React from 'react';

// 每個選項可以指定色調：預設是粉紅；gold 用在 Famous 玩家池，讓它跟一般的玩家池一眼就分得出來。
// （Tailwind 只會產生「完整寫在程式碼裡」的 class，所以這裡不能用字串拼接。）
const TONES = {
    pink: {
        fill: 'from-pink to-pink-2 shadow-[0_6px_20px_rgba(255,61,139,0.35)]',
        on: 'text-white',
        off: 'text-muted enabled:hover:text-ink',
        idle: '',
    },
    gold: {
        fill: 'from-[#ffe08a] to-[#ffa63d] shadow-[0_6px_28px_rgba(255,184,77,0.55)]',
        on: 'text-[#3d2600]',
        off: 'text-[#ffd06b] enabled:hover:text-[#ffe9b0]',
        // 沒被選中時也帶一圈淡淡的金色光暈
        idle: 'shadow-[0_0_18px_rgba(255,184,77,0.22)] ring-1 ring-[#ffd06b]/30',
    },
};

/**
 * 分段選擇器（玩家池、排行榜分頁共用）。
 * 選中的粉紅底是一層獨立的元素、用淡入淡出切換，所以換選項時是柔順的過渡而不是瞬間跳色。
 */
export default function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
    return (
        <div role="radiogroup" aria-label={ariaLabel} className={`glass flex gap-1 rounded-2xl p-1 ${className}`}>
            {options.map(o => {
                const on = o.key === value;
                const tone = TONES[o.tone] ?? TONES.pink;
                return (
                    <button
                        key={o.key}
                        role="radio"
                        aria-checked={on}
                        disabled={o.disabled}
                        title={o.title}
                        onClick={() => onChange(o.key)}
                        className={`relative flex flex-1 flex-col items-center rounded-xl px-4 py-2 leading-tight transition-[color,box-shadow] duration-300 disabled:opacity-40 stacked:px-3 ${
                            on ? tone.on : `${tone.off} ${tone.idle}`
                        }`}
                    >
                        <span
                            aria-hidden="true"
                            className={`absolute inset-0 rounded-xl bg-linear-to-br ${tone.fill} transition-opacity duration-300 ${
                                on ? 'opacity-100' : 'opacity-0'
                            }`}
                        />
                        <b className="relative text-[15px] font-bold">{o.label}</b>
                        {o.sub && <small className="relative text-[11px] opacity-80">{o.sub}</small>}
                    </button>
                );
            })}
        </div>
    );
}

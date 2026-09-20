import React from 'react';

/**
 * 分段選擇器（玩家池、排行榜分頁共用）。
 * 選中的粉紅底是一層獨立的元素、用淡入淡出切換，所以換選項時是柔順的過渡而不是瞬間跳色。
 */
export default function Segmented({ options, value, onChange, ariaLabel, className = '' }) {
    return (
        <div role="radiogroup" aria-label={ariaLabel} className={`glass flex gap-1 rounded-2xl p-1 ${className}`}>
            {options.map(o => {
                const on = o.key === value;
                return (
                    <button
                        key={o.key}
                        role="radio"
                        aria-checked={on}
                        disabled={o.disabled}
                        title={o.title}
                        onClick={() => onChange(o.key)}
                        className={`relative flex flex-1 flex-col items-center rounded-xl px-4 py-2 leading-tight transition-colors duration-300 disabled:opacity-40 stacked:px-3 ${
                            on ? 'text-white' : 'text-muted enabled:hover:text-ink'
                        }`}
                    >
                        <span
                            aria-hidden="true"
                            className={`absolute inset-0 rounded-xl bg-linear-to-br from-pink to-pink-2 shadow-[0_6px_20px_rgba(255,61,139,0.35)] transition-opacity duration-300 ${
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

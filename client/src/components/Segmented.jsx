import React from 'react';

// Each option can set a tone: pink by default; gold is used for the Famous pool so it stands out
// from the regular pools at a glance. (Tailwind only generates classes written out in full in the
// source, so these can't be built by string concatenation.)
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
        // a faint gold glow even when not selected
        idle: 'shadow-[0_0_18px_rgba(255,184,77,0.22)] ring-1 ring-[#ffd06b]/30',
    },
};

/**
 * Segmented control (shared by the player pool picker and the leaderboard tabs).
 * The highlighted background is a separate layer that fades in and out, so switching options
 * transitions smoothly instead of snapping to a new color.
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

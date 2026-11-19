import { useEffect, useState } from 'react';

const easeOutExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/**
 * Counts from 0 up to target. Returns undefined while target is undefined (not revealed yet).
 * When enabled is false, returns target directly without animating.
 */
export default function useCountUp(target, enabled, duration = 1100) {
    const [value, setValue] = useState(enabled ? 0 : target);

    useEffect(() => {
        if (target === undefined) return;
        if (!enabled) { setValue(target); return; }
        let raf;
        const start = performance.now();
        const tick = now => {
            const t = Math.min((now - start) / duration, 1);
            setValue(target * easeOutExpo(t));
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [target, enabled, duration]);

    return target === undefined ? undefined : value;
}

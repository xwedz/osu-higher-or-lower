import { useEffect, useState } from 'react';

/**
 * 讓元素「消失時也有動畫」：show 變成 false 之後，先以 state="closed" 再渲染一段時間
 * （讓子元素播放退場動畫），等 exitMs 過了才真的從畫面上移除。
 *
 * children 是一個函式，收到 'open' 或 'closed'，子元素把它放到根節點的 data-state 上，
 * 就可以用 Tailwind 的 data-[state=closed]:animate-fade-out 寫退場樣式。
 *
 * 用法：
 *   <Presence show={open}>{state => <Modal state={state} />}</Presence>
 */
export default function Presence({ show, exitMs = 300, children }) {
    const [mounted, setMounted] = useState(show);

    useEffect(() => {
        if (show) {
            setMounted(true);
            return;
        }
        const t = setTimeout(() => setMounted(false), exitMs);
        return () => clearTimeout(t);
    }, [show, exitMs]);

    if (!show && !mounted) return null;
    return children(show ? 'open' : 'closed');
}

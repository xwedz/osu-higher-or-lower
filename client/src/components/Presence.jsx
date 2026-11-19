import { useEffect, useState } from 'react';

/**
 * Lets an element animate when it disappears: after show becomes false, it keeps rendering
 * with state="closed" for a while (so the child can play its exit animation), and is only
 * removed from the page once exitMs has passed.
 *
 * children is a function that receives 'open' or 'closed'. The child puts it on its root's
 * data-state, so exit styles can be written with Tailwind's data-[state=closed]:animate-fade-out.
 *
 * Usage:
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

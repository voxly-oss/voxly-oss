import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (e.g. a search box) before it is used as
 * part of a query key. Keeps server-side search from firing a request per
 * keystroke while still letting the input stay fully controlled.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
    const [debounced, setDebounced] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debounced;
}

export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait); // Line 5
    };
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
// utils.js
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            requestAnimationFrame(() => {
                inThrottle = false;
            });
        }
    };
}

export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
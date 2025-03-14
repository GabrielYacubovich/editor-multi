// history.js
export function saveImageState(state, isOriginal = false) {
    const imageData = state.ctx.getImageData(0, 0, state.canvas.width, state.canvas.height);
    if (isOriginal) {
        state.history = [{ filters: { ...state.settings }, imageData }];
        state.redoHistory = [];
        state.lastAppliedEffect = null;
    } else {
        const lastState = state.history[state.history.length - 1];
        if (JSON.stringify(lastState.filters) !== JSON.stringify(state.settings)) {
            state.history.push({ filters: { ...state.settings }, imageData });
            if (state.history.length > 50) state.history.shift();
            state.redoHistory = [];
        }
    }
}

// Initialize history in state if not already present
export function initializeHistory(state) {
    state.history = [{ filters: { ...state.settings }, imageData: null }];
    state.redoHistory = [];
    state.lastAppliedEffect = null;
}
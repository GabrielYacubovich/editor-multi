// domUtils.js
const modalListeners = new Map();

export function closeModal(modalElement) {
    modalElement.style.display = 'none';
    if (modalElement.id === 'crop-modal') {
        const uploadButton = document.getElementById('upload-new-photo');
        if (uploadButton) uploadButton.style.display = 'block';
    }
    if (modalElement.id === 'image-modal') {
        const modalControls = document.getElementById('modal-controls');
        if (modalControls) modalControls.innerHTML = '';
    }
}

export function setupModal(modalElement, allowOutsideClick = false) {
    const closeBtn = modalElement.querySelector('.modal-close-btn');
    if (closeBtn) {
        if (modalListeners.has(closeBtn)) {
            closeBtn.removeEventListener('click', modalListeners.get(closeBtn));
        }
        const handler = () => closeModal(modalElement);
        closeBtn.addEventListener('click', handler);
        modalListeners.set(closeBtn, handler);
    }
    if (allowOutsideClick) {
        if (modalListeners.has(modalElement)) {
            modalElement.removeEventListener('click', modalListeners.get(modalElement));
        }
        const handler = (e) => { if (e.target === modalElement) closeModal(modalElement); };
        modalElement.addEventListener('click', handler);
        modalListeners.set(modalElement, handler);
    }
}

export function showLoadingIndicator(show = true) {
    let loading = document.getElementById('loading-indicator');
    if (!loading && show) {
        loading = document.createElement('div');
        loading.id = 'loading-indicator';
        loading.style.position = 'absolute';
        loading.style.bottom = '10px';
        loading.style.left = '50%';
        loading.style.transform = 'translateX(-50%)';
        loading.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        loading.style.color = 'white';
        loading.style.padding = '10px 20px';
        loading.style.borderRadius = '5px';
        loading.style.zIndex = '1003';
        loading.textContent = 'Rendering...';
        document.body.appendChild(loading);
    }
    if (loading) {
        loading.style.display = show ? 'block' : 'none';
        if (show) {
            const canvas = document.getElementById('canvas');
            if (canvas) {
                const canvasRect = canvas.getBoundingClientRect();
                loading.style.left = `${canvasRect.left + canvasRect.width / 2}px`;
                loading.style.top = `${canvasRect.bottom + 10}px`;
            }
        }
    }
}

export function updateControlIndicators(settings) {
    const controlValues = [
        'brightness', 'contrast', 'grayscale', 'vibrance', 'highlights', 'shadows',
        'noise', 'exposure', 'temperature', 'saturation',
        'glitch-chromatic', 'glitch-rgb-split',
        'glitch-chromatic-vertical', 'glitch-chromatic-diagonal',
        'glitch-pixel-shuffle', 'glitch-wave',
        'kaleidoscope-segments', 'kaleidoscope-offset',
        'vortex-twist', 'edge-detect'
    ];
    controlValues.forEach(id => {
        const indicator = document.getElementById(`${id}-value`);
        if (indicator) {
            indicator.textContent = id === 'kaleidoscope-segments' ? `${settings[id]}` : `${settings[id]}%`;
        }
    });
}
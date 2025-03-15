// cropHandler.js
import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { redrawImage } from './imageProcessing.js';
import { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters } from './imageProcessing.js';

export let cropImage = new Image();
export let cropState = {};
export let cropRect = { x: 0, y: 0, width: 0, height: 0 };
let initialCropRect = { x: 0, y: 0, width: 0, height: 0 };
let initialRotation = 0;
export let rotation = 0;
let isDragging = false;
let startX, startY;
let lockAspectRatio = false;
let aspectRatio = 1;

export function initializeCropHandler(options) {
    if (!options.cropCanvas || !options.cropCtx) {
        throw new Error("cropCanvas and cropCtx are required for cropHandler initialization");
    }
    cropState = { ...options };
    setupModal(cropState.cropModal, false);
}

// New function to reset cropRect and rotation
export function resetCropState(width, height) {
    cropRect.x = 0;
    cropRect.y = 0;
    cropRect.width = width;
    cropRect.height = height;
    rotation = 0;
}

export function showCropModal(imageSrc) {
    if (!imageSrc || typeof imageSrc !== 'string' || imageSrc.trim() === '') {
        console.error("Invalid or missing imageSrc", imageSrc);
        alert("Please provide a valid image to crop.");
        return Promise.reject(new Error("Invalid image source"));
    }

    console.log("showCropModal called with imageSrc:", imageSrc.substring(0, 50) + "...");
    // Use the trueOriginalImage as the source to preserve the original
    cropImage.src = cropState.trueOriginalImage.src || imageSrc;

    return new Promise((resolve, reject) => {
        if (cropImage.complete && cropImage.naturalWidth !== 0) {
            console.log("cropImage already loaded, proceeding immediately");
            initializeCropCanvas();
            resolve();
        } else {
            cropImage.onload = () => {
                console.log("cropImage onload triggered");
                initializeCropCanvas();
                resolve();
            };
            cropImage.onerror = () => {
                console.error("Failed to load image:", imageSrc);
                alert("Failed to load the image for cropping.");
                closeModal(cropState.cropModal);
                reject(new Error("Image load failed"));
            };
        }

        function initializeCropCanvas() {
            const maxWidth = window.innerWidth * 0.8;
            const maxHeight = window.innerHeight * 0.8 - 100;
            const displayScale = Math.min(maxWidth / cropImage.width, maxHeight / cropImage.height);
            cropState.cropCanvas.width = Math.round(cropImage.width * displayScale);
            cropState.cropCanvas.height = Math.round(cropImage.height * displayScale);
            cropState.cropCanvas.dataset.displayScale = displayScale;

            // Only reset cropRect if this is a new image or initial load
            if (!cropRect.width || !cropRect.height || imageSrc !== cropImage.src) {
                console.log("Initializing cropRect to full image size");
                cropRect = { x: 0, y: 0, width: cropImage.width, height: cropImage.height };
                initialCropRect = { ...cropRect };
                initialRotation = 0;
                rotation = 0;
                lockAspectRatio = false;
                aspectRatio = cropImage.width / cropImage.height;
            }

            drawCropOverlay();
            cropState.cropModal.style.display = 'block';
            setupCropControls();
        }
    });
}

function setupCropControls() {
    const cropControls = document.getElementById('crop-controls');
    cropControls.innerHTML = `
        <div class="crop-control-group">
            <label for="rotation">Rotación:</label>
            <input type="range" id="rotation" min="-180" max="180" value="${rotation}">
            <span id="rotation-value">${rotation}°</span>
        </div>
        <div class="crop-button-group">
            <button id="crop-restore">Restaurar</button>
            <button id="crop-upload">Subir Imagen</button>
            <button id="crop-confirm">Continuar</button>
            <button id="crop-skip">Omitir</button>
        </div>
        <div class="crop-lock-group">
            <input type="checkbox" id="lock-aspect" ${lockAspectRatio ? 'checked' : ''}>
            <label for="lock-aspect">Bloquear proporción</label>
        </div>
    `;

    const rotationInput = document.getElementById('rotation');
    const rotationValue = document.getElementById('rotation-value');
    const restoreBtn = document.getElementById('crop-restore');
    const uploadBtn = document.getElementById('crop-upload');
    const confirmBtn = document.getElementById('crop-confirm');
    const skipBtn = document.getElementById('crop-skip');
    const lockCheckbox = document.getElementById('lock-aspect');

    rotationInput.addEventListener('input', (e) => {
        rotation = parseInt(e.target.value);
        rotationValue.textContent = `${rotation}°`;
        drawCropOverlay();
    });
    rotationValue.addEventListener('click', () => {
        const newValue = prompt('Ingrese el ángulo de rotación (-180 a 180):', rotation);
        if (newValue !== null) {
            const parsedValue = parseInt(newValue);
            if (!isNaN(parsedValue) && parsedValue >= -180 && parsedValue <= 180) {
                rotation = parsedValue;
                rotationInput.value = rotation;
                rotationValue.textContent = `${rotation}°`;
                drawCropOverlay();
            }
        }
    });
    uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        triggerFileUpload();
    });
    uploadBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        triggerFileUpload();
    });

    restoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (!cropState.trueOriginalImage.complete || cropState.trueOriginalImage.naturalWidth === 0) {
            console.error("Restore failed: trueOriginalImage is not loaded");
            return;
        }

        rotation = 0;
        rotationInput.value = 0;
        rotationValue.textContent = '0°';
        cropRect = { x: 0, y: 0, width: cropImage.width, height: cropImage.height };
        initialCropRect = { ...cropRect };
        drawCropOverlay();
    });

    confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(cropState.cropModal);
        if (!cropImage.complete || cropImage.naturalWidth === 0) {
            console.error("Crop image not loaded");
            showLoadingIndicator(false);
            return;
        }
        showLoadingIndicator(true);

        const origWidth = cropImage.width;
        const origHeight = cropImage.height;
        const angleRad = rotation * Math.PI / 180;
        const cosA = Math.abs(Math.cos(angleRad));
        const sinA = Math.abs(Math.sin(angleRad));
        const fullRotatedWidth = Math.ceil(origWidth * cosA + origHeight * sinA);
        const fullRotatedHeight = Math.ceil(origWidth * sinA + origHeight * cosA);

        const fullRotatedCanvas = document.createElement('canvas');
        fullRotatedCanvas.width = fullRotatedWidth;
        fullRotatedCanvas.height = fullRotatedHeight;
        const fullRotatedCtx = fullRotatedCanvas.getContext('2d');
        fullRotatedCtx.translate(fullRotatedWidth / 2, fullRotatedHeight / 2);
        fullRotatedCtx.rotate(angleRad);
        fullRotatedCtx.translate(-origWidth / 2, -origHeight / 2);
        fullRotatedCtx.drawImage(cropImage, 0, 0, origWidth, origHeight);

        const cropX = Math.round(cropRect.x);
        const cropY = Math.round(cropRect.y);
        const cropWidth = Math.round(cropRect.width);
        const cropHeight = Math.round(cropRect.height);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropWidth;
        tempCanvas.height = cropHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(
            fullRotatedCanvas,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, cropWidth, cropHeight
        );

        const croppedImage = new Image();
        croppedImage.src = tempCanvas.toDataURL('image/png');
        cropState.img.src = croppedImage.src;

        cropState.img.onload = () => {
            cropState.fullResCanvas.width = cropWidth;
            cropState.fullResCanvas.height = cropHeight;
            cropState.fullResCtx.drawImage(tempCanvas, 0, 0);

            const maxDisplayWidth = Math.min(1920, window.innerWidth - 20);
            const maxDisplayHeight = window.innerHeight - (window.innerWidth <= 768 ? 0.4 * window.innerHeight + 20 : 250);
            let targetWidth = cropWidth;
            let targetHeight = cropHeight;
            const maxCanvasSize = 1920;
            if (targetWidth > maxCanvasSize || targetHeight > maxCanvasSize) {
                const scale = Math.min(maxCanvasSize / targetWidth, maxCanvasSize / targetHeight);
                targetWidth = Math.round(targetWidth * scale);
                targetHeight = Math.round(targetHeight * scale);
            }

            cropState.canvas.width = targetWidth;
            cropState.canvas.height = targetHeight;
            cropState.canvas.style.maxWidth = `${maxDisplayWidth}px`;
            cropState.canvas.style.maxHeight = `${maxDisplayHeight}px`;
            cropState.canvas.style.width = 'auto';
            cropState.canvas.style.height = 'auto';
            cropState.canvas.style.objectFit = 'contain';

            if (cropState.redrawWorker) {
                const imageData = tempCtx.getImageData(0, 0, cropWidth, cropHeight);
                cropState.redrawWorker.postMessage({
                    imgData: imageData,
                    settings: cropState.settings,
                    noiseSeed: cropState.noiseSeed,
                    width: cropWidth,
                    height: cropHeight
                });
            } else {
                redrawImage(
                    cropState.ctx, cropState.canvas, cropState.fullResCanvas, cropState.fullResCtx,
                    cropState.img, cropState.settings, cropState.noiseSeed,
                    cropState.isShowingOriginal, cropState.trueOriginalImage, cropState.modal,
                    cropState.modalImage, true, cropState.saveImageState
                ).then(() => {
                    cropState.originalFullResImage.src = cropState.fullResCanvas.toDataURL('image/png');
                    showLoadingIndicator(false);
                });
            }
            // Do NOT reset cropRect here; retain it for reopening the modal
        };
    });

    const debouncedConfirmClick = debounce(() => confirmBtn.click(), 100);
    confirmBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        debouncedConfirmClick();
    });

    skipBtn.addEventListener('click', () => {
        closeModal(cropState.cropModal);
        // Use the full original image without cropping
        cropState.img.src = cropState.trueOriginalImage.src;
        cropState.img.onload = () => {
            cropState.fullResCanvas.width = cropImage.width;
            cropState.fullResCanvas.height = cropImage.height;
            cropState.fullResCtx.drawImage(cropImage, 0, 0);

            const maxDisplayWidth = Math.min(1920, window.innerWidth - 20);
            const maxDisplayHeight = window.innerHeight - (window.innerWidth <= 768 ? 0.4 * window.innerHeight + 20 : 250);
            let targetWidth = cropImage.width;
            let targetHeight = cropImage.height;
            const maxCanvasSize = 1920;
            if (targetWidth > maxCanvasSize || targetHeight > maxCanvasSize) {
                const scale = Math.min(maxCanvasSize / targetWidth, maxCanvasSize / targetHeight);
                targetWidth = Math.round(targetWidth * scale);
                targetHeight = Math.round(targetHeight * scale);
            }

            cropState.canvas.width = targetWidth;
            cropState.canvas.height = targetHeight;
            cropState.canvas.style.maxWidth = `${maxDisplayWidth}px`;
            cropState.canvas.style.maxHeight = `${maxDisplayHeight}px`;
            cropState.canvas.style.width = 'auto';
            cropState.canvas.style.height = 'auto';
            cropState.canvas.style.objectFit = 'contain';

            redrawImage(
                cropState.ctx, cropState.canvas, cropState.fullResCanvas, cropState.fullResCtx,
                cropState.img, cropState.settings, cropState.noiseSeed,
                cropState.isShowingOriginal, cropState.trueOriginalImage, cropState.modal,
                cropState.modalImage, true
            ).then(() => {
                cropState.originalFullResImage.src = cropState.fullResCanvas.toDataURL('image/png');
            });
            if (cropState.uploadNewPhotoButton) cropState.uploadNewPhotoButton.style.display = 'block';
        };
        // Do NOT reset cropRect here; retain it for reopening the modal
    });

    lockCheckbox.addEventListener('change', (e) => {
        lockAspectRatio = e.target.checked;
        aspectRatio = cropRect.width / cropRect.height;
    });
}


async function drawCropOverlay() {
    const originalWidth = cropImage.width;
    const originalHeight = cropImage.height;
    const angleRad = rotation * Math.PI / 180;
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));
    const fullRotatedWidth = Math.ceil(originalWidth * cosA + originalHeight * sinA);
    const fullRotatedHeight = Math.ceil(originalWidth * sinA + originalHeight * cosA);
    const displayScale = Math.min(
        (window.innerWidth - 100) / fullRotatedWidth,
        (window.innerHeight - 250) / fullRotatedHeight,
        1
    );

    cropState.cropCanvas.width = Math.round(fullRotatedWidth * displayScale);
    cropState.cropCanvas.height = Math.round(fullRotatedHeight * displayScale);
    cropState.cropCanvas.dataset.displayScale = displayScale;

    // Create a temporary canvas for applying filters
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalWidth;
    tempCanvas.height = originalHeight;
    const tempCtx = tempCanvas.getContext('2d');

    // Draw the original image and apply all filters
    tempCtx.drawImage(cropImage, 0, 0, originalWidth, originalHeight);
    applyBasicFiltersManually(tempCtx, tempCanvas, cropState.settings);
    await applyAdvancedFilters(tempCtx, tempCanvas, cropState.settings, cropState.noiseSeed, 1);
    await applyGlitchEffects(tempCtx, tempCanvas, cropState.settings, cropState.noiseSeed, 1);
    await applyComplexFilters(tempCtx, tempCanvas, cropState.settings, cropState.noiseSeed, 1);

    // Clear the crop canvas
    cropState.cropCtx.clearRect(0, 0, cropState.cropCanvas.width, cropState.cropCanvas.height);

    // Draw the blurred background with filters
    cropState.cropCtx.save();
    cropState.cropCtx.translate(cropState.cropCanvas.width / 2, cropState.cropCanvas.height / 2);
    cropState.cropCtx.scale(displayScale, displayScale);
    cropState.cropCtx.rotate(angleRad);
    cropState.cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
    cropState.cropCtx.filter = 'blur(5px)';
    cropState.cropCtx.drawImage(tempCanvas, 0, 0, originalWidth, originalHeight);
    cropState.cropCtx.restore();

    // Draw the cropped area with filters
    const scaledCropRect = {
        x: cropRect.x * displayScale,
        y: cropRect.y * displayScale,
        width: cropRect.width * displayScale,
        height: cropRect.height * displayScale
    };

    cropState.cropCtx.save();
    cropState.cropCtx.beginPath();
    cropState.cropCtx.rect(scaledCropRect.x, scaledCropRect.y, scaledCropRect.width, scaledCropRect.height);
    cropState.cropCtx.clip();
    cropState.cropCtx.translate(cropState.cropCanvas.width / 2, cropState.cropCanvas.height / 2);
    cropState.cropCtx.scale(displayScale, displayScale);
    cropState.cropCtx.rotate(angleRad);
    cropState.cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
    cropState.cropCtx.filter = 'none';
    cropState.cropCtx.drawImage(tempCanvas, 0, 0, originalWidth, originalHeight);
    cropState.cropCtx.restore();

    // Draw the crop rectangle outline and handles
    cropState.cropCtx.strokeStyle = '#800000';
    cropState.cropCtx.lineWidth = 3;
    cropState.cropCtx.setLineDash([5, 5]);
    cropState.cropCtx.strokeRect(scaledCropRect.x, scaledCropRect.y, scaledCropRect.width, scaledCropRect.height);
    cropState.cropCtx.setLineDash([]);

    cropState.cropCtx.fillStyle = '#800000';
    const handleSize = 10;
    const corners = [
        [scaledCropRect.x, scaledCropRect.y],
        [scaledCropRect.x + scaledCropRect.width, scaledCropRect.y],
        [scaledCropRect.x, scaledCropRect.y + scaledCropRect.height],
        [scaledCropRect.x + scaledCropRect.width, scaledCropRect.y + scaledCropRect.height]
    ];
    corners.forEach(([cx, cy]) => {
        cropState.cropCtx.fillRect(cx - handleSize / 2, cy - handleSize / 2, handleSize, handleSize);
    });
}

function startCropDrag(e) {
    e.preventDefault();
    const rect = cropState.cropCanvas.getBoundingClientRect();
    const displayScale = parseFloat(cropState.cropCanvas.dataset.displayScale) || 1;
    const x = ((e.clientX || e.touches?.[0].clientX) - rect.left) / displayScale;
    const y = ((e.clientY || e.touches?.[0].clientY) - rect.top) / displayScale;
    const resizeMargin = 30 / displayScale;

    if (nearCorner(x, y, cropRect.x, cropRect.y, resizeMargin)) {
        isDragging = 'top-left';
    } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y, resizeMargin)) {
        isDragging = 'top-right';
    } else if (nearCorner(x, y, cropRect.x, cropRect.y + cropRect.height, resizeMargin)) {
        isDragging = 'bottom-left';
    } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y + cropRect.height, resizeMargin)) {
        isDragging = 'bottom-right';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'left', resizeMargin)) {
        isDragging = 'left';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'right', resizeMargin)) {
        isDragging = 'right';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'top', resizeMargin)) {
        isDragging = 'top';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'bottom', resizeMargin)) {
        isDragging = 'bottom';
    } else if (insideCrop(x, y)) {
        isDragging = 'move';
        startX = x - cropRect.x;
        startY = y - cropRect.y;
    }

    if (isDragging) {
        console.log("Dragging mode:", isDragging);
        drawCropOverlay();
    }
}

function adjustCropDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = cropState.cropCanvas.getBoundingClientRect();
    const displayScale = parseFloat(cropState.cropCanvas.dataset.displayScale) || 1;
    let x = ((e.clientX || (e.touches && e.touches[0].clientX)) - rect.left) / displayScale;
    let y = ((e.clientY || (e.touches && e.touches[0].clientY)) - rect.top) / displayScale;

    const angleRad = rotation * Math.PI / 180;
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));
    const maxWidth = Math.ceil(cropImage.width * cosA + cropImage.height * sinA);
    const maxHeight = Math.ceil(cropImage.width * sinA + cropImage.height * cosA);

    x = clamp(x, 0, maxWidth);
    y = clamp(y, 0, maxHeight);

    if (isDragging === 'move') {
        cropRect.x = clamp(x - startX, 0, maxWidth - cropRect.width);
        cropRect.y = clamp(y - startY, 0, maxHeight - cropRect.height);
    } else {
        resizeCrop(x, y);
    }
    drawCropOverlay();
}

function stopCropDrag(e) {
    if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;
        cropState.cropCanvas.style.cursor = 'default';
        
        const angleRad = rotation * Math.PI / 180;
        const cosA = Math.abs(Math.cos(angleRad));
        const sinA = Math.abs(Math.sin(angleRad));
        const maxWidth = Math.ceil(cropImage.width * cosA + cropImage.height * sinA);
        const maxHeight = Math.ceil(cropImage.width * sinA + cropImage.height * cosA);

        cropRect.x = clamp(cropRect.x, 0, maxWidth - cropRect.width);
        cropRect.y = clamp(cropRect.y, 0, maxHeight - cropRect.height);
        cropRect.width = clamp(cropRect.width, 10, maxWidth - cropRect.x);
        cropRect.height = clamp(cropRect.height, 10, maxHeight - cropRect.y);
        drawCropOverlay();
    }
}
function nearCorner(x, y, cornerX, cornerY, margin) {
    return Math.abs(x - cornerX) < margin && Math.abs(y - cornerY) < margin;
}

function nearSide(x, y, rectX, rectY, width, height, side, margin) {
    switch (side) {
        case 'left': return Math.abs(x - rectX) < margin && y > rectY && y < rectY + height;
        case 'right': return Math.abs(x - (rectX + width)) < margin && y > rectY && y < rectY + height;
        case 'top': return Math.abs(y - rectY) < margin && x > rectX && x < rectX + width;
        case 'bottom': return Math.abs(y - (rectY + height)) < margin && x > rectX && x < rectX + width;
        default: return false;
    }
}

function resizeCrop(x, y) {
    let newWidth, newHeight;
    // Calculate full rotated dimensions
    const angleRad = rotation * Math.PI / 180;
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));
    const maxWidth = Math.ceil(cropImage.width * cosA + cropImage.height * sinA);
    const maxHeight = Math.ceil(cropImage.width * sinA + cropImage.height * cosA);

    // Adjust crop rectangle based on dragging mode
    if (isDragging === 'top-left') {
        newWidth = clamp(cropRect.x + cropRect.width - x, 10, maxWidth);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(cropRect.y + cropRect.height - y, 10, maxHeight);
        cropRect.x = clamp(x, 0, maxWidth - newWidth);
        cropRect.y = lockAspectRatio ? cropRect.y + cropRect.height - newHeight : clamp(y, 0, maxHeight - newHeight);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'top-right') {
        newWidth = clamp(x - cropRect.x, 10, maxWidth - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(cropRect.y + cropRect.height - y, 10, maxHeight - cropRect.y);
        cropRect.y = lockAspectRatio ? cropRect.y + cropRect.height - newHeight : clamp(y, 0, maxHeight - newHeight);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'bottom-left') {
        newWidth = clamp(cropRect.x + cropRect.width - x, 10, maxWidth - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(y - cropRect.y, 10, maxHeight - cropRect.y);
        cropRect.x = clamp(x, 0, maxWidth - newWidth);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'bottom-right') {
        newWidth = clamp(x - cropRect.x, 10, maxWidth - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(y - cropRect.y, 10, maxHeight - cropRect.y);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'left') {
        newWidth = clamp(cropRect.x + cropRect.width - x, 10, maxWidth - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : cropRect.height;
        cropRect.x = clamp(x, 0, maxWidth - newWidth);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'right') {
        newWidth = clamp(x - cropRect.x, 10, maxWidth - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : cropRect.height;
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'top') {
        newHeight = clamp(cropRect.y + cropRect.height - y, 10, maxHeight - cropRect.y);
        newWidth = lockAspectRatio ? newHeight * aspectRatio : cropRect.width;
        cropRect.y = clamp(y, 0, maxHeight - newHeight);
        cropRect.height = newHeight;
        cropRect.width = newWidth;
    } else if (isDragging === 'bottom') {
        newHeight = clamp(y - cropRect.y, 10, maxHeight - cropRect.y);
        newWidth = lockAspectRatio ? newHeight * aspectRatio : cropRect.width;
        cropRect.height = newHeight;
        cropRect.width = newWidth;
    }
}

function insideCrop(x, y) {
    return x >= cropRect.x && x <= cropRect.x + cropRect.width &&
           y >= cropRect.y && y <= cropRect.y + cropRect.height;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

let triggerFileUpload = () => console.error("triggerFileUpload not set in cropHandler.js");

export function setTriggerFileUpload(fn) {
    triggerFileUpload = fn;
}

export function setupCropEventListeners() {
    if (!cropState.cropCanvas) {
        console.error("cropCanvas is undefined.");
        return;
    }

    const events = [
        ['mousedown', startCropDrag],
        ['mousemove', adjustCropDrag],
        ['mouseup', stopCropDrag],
        ['touchstart', startCropDrag, { passive: false }],
        ['touchmove', adjustCropDrag, { passive: false }],
        ['touchend', stopCropDrag, { passive: false }],
        ['mouseleave', stopCropDrag]
    ];
    events.forEach(([event, handler, options]) => {
        cropState.cropCanvas.removeEventListener(event, handler);
        cropState.cropCanvas.addEventListener(event, handler, options);
    });

    cropState.cropCanvas.addEventListener('mousemove', (e) => {
        const rect = cropState.cropCanvas.getBoundingClientRect();
        const displayScale = parseFloat(cropState.cropCanvas.dataset.displayScale) || 1;
        const x = (e.clientX - rect.left) / displayScale;
        const y = (e.clientY - rect.top) / displayScale;
        const resizeMargin = 20 / displayScale;

        if (nearCorner(x, y, cropRect.x, cropRect.y, resizeMargin) ||
            nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y + cropRect.height, resizeMargin)) {
            cropState.cropCanvas.style.cursor = 'nwse-resize';
        } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y, resizeMargin) ||
                   nearCorner(x, y, cropRect.x, cropRect.y + cropRect.height, resizeMargin)) {
            cropState.cropCanvas.style.cursor = 'nesw-resize';
        } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'left', resizeMargin) ||
                   nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'right', resizeMargin)) {
            cropState.cropCanvas.style.cursor = 'ew-resize';
        } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'top', resizeMargin) ||
                   nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'bottom', resizeMargin)) {
            cropState.cropCanvas.style.cursor = 'ns-resize';
        } else if (insideCrop(x, y)) {
            cropState.cropCanvas.style.cursor = 'move';
        } else {
            cropState.cropCanvas.style.cursor = 'default';
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
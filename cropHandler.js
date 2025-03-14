// cropHandler.js
import { closeModal } from './domUtils.js';
import { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage } from './imageProcessing.js';
import { clamp } from './utils.js';

let cropImage = new Image();
let cropRect = { x: 0, y: 0, width: 0, height: 0 };
let isDragging = false;
let startX, startY;
let lockAspectRatio = false;
let aspectRatio = 1;
let rotation = 0;
let triggerFileUpload = null;

function setTriggerFileUpload(fn) {
    triggerFileUpload = fn;
}

function showCropModal(dataURL = null, { cropModal, cropCanvas, cropCtx, trueOriginalImage, originalUploadedImage, settings, noiseSeed, initialRotation, img, canvas, ctx, fullResCanvas, fullResCtx, originalImageData, originalWidth, originalHeight, previewWidth, previewHeight, originalFullResImage, isShowingOriginal, saveImageState, modal, modalImage }) {
    if (!dataURL) {
        console.log('showCropModal: Processing existing image');
        cropModal.style.display = 'block';
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = trueOriginalImage.width;
        tempCanvas.height = trueOriginalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(trueOriginalImage, 0, 0);
        applyBasicFiltersManually(tempCtx, tempCanvas, settings);
        applyAdvancedFilters(tempCtx, tempCanvas, settings, noiseSeed, 1)
            .then(() => applyGlitchEffects(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => applyComplexFilters(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => {
                const dataURL = tempCanvas.toDataURL('image/png');
                console.log('showCropModal: Setting cropImage.src', dataURL.substring(0, 50));
                cropImage.src = dataURL;
                return new Promise(resolve => {
                    if (cropImage.complete && cropImage.naturalWidth) {
                        console.log('showCropModal: cropImage already loaded');
                        resolve();
                    } else {
                        cropImage.onload = () => {
                            console.log('showCropModal: cropImage loaded');
                            resolve();
                        };
                        cropImage.onerror = () => console.error('showCropModal: cropImage failed to load');
                    }
                });
            })
            .then(() => {
                rotation = initialRotation;
                setupCropControls(null, { cropModal, cropCanvas, cropCtx, trueOriginalImage, originalUploadedImage, settings, noiseSeed, img, canvas, ctx, fullResCanvas, fullResCtx, originalImageData, originalWidth, originalHeight, previewWidth, previewHeight, originalFullResImage, isShowingOriginal, saveImageState, modal, modalImage });
                drawCropOverlay(cropCanvas, cropCtx);
            })
            .catch(err => console.error('showCropModal: Error in processing chain', err));
    } else {
        console.log('showCropModal: Processing new upload');
        originalUploadedImage.src = dataURL;
        cropImage.src = dataURL;
        rotation = 0;
        cropModal.style.display = 'block';
        cropImage.onload = () => {
            console.log('showCropModal: New image loaded');
            const maxCanvasWidth = window.innerWidth - 100;
            const maxCanvasHeight = window.innerHeight - 250;
            const originalWidth = cropImage.width;
            const originalHeight = cropImage.height;
            const angleRad = rotation * Math.PI / 180;
            const cosA = Math.abs(Math.cos(angleRad));
            const sinA = Math.abs(Math.sin(angleRad));
            const fullRotatedWidth = Math.ceil(originalWidth * cosA + originalHeight * sinA);
            const fullRotatedHeight = Math.ceil(originalWidth * sinA + originalHeight * cosA);
            const scale = Math.min(maxCanvasWidth / fullRotatedWidth, maxCanvasHeight / fullRotatedHeight, 1);
            cropCanvas.width = Math.round(fullRotatedWidth * scale);
            cropCanvas.height = Math.round(fullRotatedHeight * scale);
            cropCanvas.dataset.scaleFactor = scale;
            cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };
            setupCropControls(null, { cropModal, cropCanvas, cropCtx, trueOriginalImage, originalUploadedImage, settings, noiseSeed, img, canvas, ctx, fullResCanvas, fullResCtx, originalImageData, originalWidth, originalHeight, previewWidth, previewHeight, originalFullResImage, isShowingOriginal, saveImageState, modal, modalImage });
            drawCropOverlay(cropCanvas, cropCtx);
        };
        cropImage.onerror = () => console.error('showCropModal: New image failed to load');
        if (cropImage.complete && cropImage.naturalWidth) cropImage.onload();
    }
}

function drawCropOverlay(cropCanvas, cropCtx) {
    const originalWidth = cropImage.width;
    const originalHeight = cropImage.height;
    const angleRad = rotation * Math.PI / 180;
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));
    const fullRotatedWidth = Math.ceil(originalWidth * cosA + originalHeight * sinA);
    const fullRotatedHeight = Math.ceil(originalWidth * sinA + originalHeight * cosA);

    const maxCanvasWidth = window.innerWidth - 100;
    const maxCanvasHeight = window.innerHeight - 250;
    const scale = Math.min(maxCanvasWidth / fullRotatedWidth, maxCanvasHeight / fullRotatedHeight, 1);

    const prevWidth = cropCanvas.width;
    const prevHeight = cropCanvas.height;
    cropCanvas.width = Math.round(fullRotatedWidth * scale);
    cropCanvas.height = Math.round(fullRotatedHeight * scale);
    cropCanvas.dataset.scaleFactor = scale;

    if ((prevWidth !== cropCanvas.width || prevHeight !== cropCanvas.height) && 
        (cropRect.width === 0 || cropRect.height === 0)) {
        cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };
    }

    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.save();
    cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    cropCtx.scale(scale, scale);
    cropCtx.rotate(angleRad);
    cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
    cropCtx.filter = 'blur(5px)';
    cropCtx.drawImage(cropImage, 0, 0, originalWidth, originalHeight);
    cropCtx.restore();

    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    cropCtx.clip();
    cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    cropCtx.scale(scale, scale);
    cropCtx.rotate(angleRad);
    cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
    cropCtx.filter = 'none';
    cropCtx.drawImage(cropImage, 0, 0, originalWidth, originalHeight);
    cropCtx.restore();

    cropCtx.strokeStyle = '#800000';
    cropCtx.lineWidth = 3;
    cropCtx.setLineDash([5, 5]);
    cropCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    cropCtx.setLineDash([]);
}

function setupCropControls(unfilteredCanvas, { cropModal, cropCanvas, cropCtx, trueOriginalImage, originalUploadedImage, settings, noiseSeed, img, canvas, ctx, fullResCanvas, fullResCtx, originalImageData, originalWidth, originalHeight, previewWidth, previewHeight, originalFullResImage, isShowingOriginal, saveImageState, modal, modalImage }) {
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
        drawCropOverlay(cropCanvas, cropCtx);
    });
    rotationValue.addEventListener('click', () => {
        const newValue = prompt('Ingrese el ángulo de rotación (-180 a 180):', rotation);
        if (newValue !== null) {
            const parsedValue = parseInt(newValue);
            if (!isNaN(parsedValue) && parsedValue >= -180 && parsedValue <= 180) {
                rotation = parsedValue;
                rotationInput.value = rotation;
                rotationValue.textContent = `${rotation}°`;
                drawCropOverlay(cropCanvas, cropCtx);
            }
        }
    });
    uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (triggerFileUpload) triggerFileUpload();
    });
    restoreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        rotation = 0;
        rotationInput.value = 0;
        rotationValue.textContent = '0°';
        if (!trueOriginalImage.src || trueOriginalImage.width === 0) return;

        const maxCanvasWidth = window.innerWidth - 100;
        const maxCanvasHeight = window.innerHeight - 250;
        let width = trueOriginalImage.width;
        let height = trueOriginalImage.height;
        const ratio = width / height;
        if (width > maxCanvasWidth || height > maxCanvasHeight) {
            if (ratio > maxCanvasWidth / maxCanvasHeight) {
                width = maxCanvasWidth;
                height = width / ratio;
            } else {
                height = maxCanvasHeight;
                width = height * ratio;
            }
        }
        cropCanvas.width = Math.round(width);
        cropCanvas.height = Math.round(height);
        cropCanvas.dataset.scaleFactor = 1;
        cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = trueOriginalImage.width;
        tempCanvas.height = trueOriginalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(trueOriginalImage, 0, 0);
        applyBasicFiltersManually(tempCtx, tempCanvas, settings);
        applyAdvancedFilters(tempCtx, tempCanvas, settings, noiseSeed, 1)
            .then(() => applyGlitchEffects(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => applyComplexFilters(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => {
                cropImage.src = tempCanvas.toDataURL('image/png');
                return new Promise(resolve => {
                    if (cropImage.complete && cropImage.naturalWidth) resolve();
                    else cropImage.onload = resolve;
                });
            })
            .then(() => drawCropOverlay(cropCanvas, cropCtx));
    });
    confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(cropModal);
        const origWidth = cropImage.width;
        const origHeight = cropImage.height;
        if (origWidth === 0 || origHeight === 0) return;

        const angleRad = rotation * Math.PI / 180;
        const cosA = Math.abs(Math.cos(angleRad));
        const sinA = Math.abs(Math.sin(angleRad));
        const fullRotatedWidth = Math.ceil(origWidth * cosA + origHeight * sinA);
        const fullRotatedHeight = Math.ceil(origWidth * sinA + origHeight * cosA);

        const fullRotatedCanvas = document.createElement('canvas');
        fullRotatedCanvas.width = fullRotatedWidth;
        fullRotatedCanvas.height = fullRotatedHeight;
        const fullRotatedCtx = fullRotatedCanvas.getContext('2d');
        fullRotatedCtx.imageSmoothingEnabled = true;
        fullRotatedCtx.imageSmoothingQuality = 'high';
        fullRotatedCtx.translate(fullRotatedWidth / 2, fullRotatedHeight / 2);
        fullRotatedCtx.rotate(angleRad);
        fullRotatedCtx.translate(-origWidth / 2, -origHeight / 2);
        const sourceImage = unfilteredCanvas || trueOriginalImage;
        fullRotatedCtx.drawImage(sourceImage, 0, 0, origWidth, origHeight);

        const scaleFactor = parseFloat(cropCanvas.dataset.scaleFactor) || 1;
        const cropX = cropRect.x / scaleFactor;
        const cropY = cropRect.y / scaleFactor;
        const cropWidth = Math.round(cropRect.width / scaleFactor);
        const cropHeight = Math.round(cropRect.height / scaleFactor);

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = cropWidth;
        tempCanvas.height = cropHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(
            fullRotatedCanvas,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, cropWidth, cropHeight
        );

        img.src = tempCanvas.toDataURL('image/png');
        originalUploadedImage.src = tempCanvas.toDataURL('image/png');
        originalWidth = tempCanvas.width;
        originalHeight = tempCanvas.height;
        fullResCanvas.width = originalWidth;
        fullResCanvas.height = originalHeight;
        fullResCtx.drawImage(tempCanvas, 0, 0, originalWidth, originalHeight);

        const previewTempCanvas = document.createElement('canvas');
        previewTempCanvas.width = canvas.width;
        previewTempCanvas.height = canvas.height;
        const previewTempCtx = previewTempCanvas.getContext('2d');
        previewTempCtx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        originalImageData = previewTempCtx.getImageData(0, 0, canvas.width, canvas.height);

        const loadImage = new Promise(resolve => {
            if (img.complete && img.naturalWidth) resolve();
            else img.onload = resolve;
        });
        loadImage.then(() => {
            const maxDisplayWidth = Math.min(1920, window.innerWidth - 100);
            const maxDisplayHeight = Math.min(1080, window.innerHeight - 250);
            const minPreviewDimension = 800;
            const ratio = originalWidth / originalHeight;
            if (ratio > 1) {
                previewWidth = Math.min(originalWidth, maxDisplayWidth);
                previewHeight = previewWidth / ratio;
                if (previewHeight > maxDisplayHeight) {
                    previewHeight = maxDisplayHeight;
                    previewWidth = previewHeight * ratio;
                }
                if (previewHeight < minPreviewDimension) {
                    previewHeight = minPreviewDimension;
                    previewWidth = previewHeight * ratio;
                }
            } else {
                previewHeight = Math.min(originalHeight, maxDisplayHeight);
                previewWidth = previewHeight * ratio;
                if (previewWidth > maxDisplayWidth) {
                    previewWidth = maxDisplayWidth;
                    previewHeight = previewWidth / ratio;
                }
                if (previewWidth < minPreviewDimension) {
                    previewWidth = minPreviewDimension;
                    previewHeight = previewWidth / ratio;
                }
            }
            canvas.width = Math.round(previewWidth);
            canvas.height = Math.round(previewHeight);
            redrawImage(ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed, isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState)
                .then(() => {
                    originalFullResImage.src = fullResCanvas.toDataURL('image/png');
                });
        });
    });
    skipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        img.src = fullResCanvas.toDataURL('image/png');
        originalWidth = fullResCanvas.width;
        originalHeight = fullResCanvas.height;
        const maxDisplayWidth = Math.min(1920, window.innerWidth - 100);
        const maxDisplayHeight = Math.min(1080, window.innerHeight - 250);
        const minPreviewDimension = 800;
        const ratio = originalWidth / originalHeight;
        if (ratio > 1) {
            previewWidth = Math.min(originalWidth, maxDisplayWidth);
            previewHeight = previewWidth / ratio;
            if (previewHeight > maxDisplayHeight) {
                previewHeight = maxDisplayHeight;
                previewWidth = previewHeight * ratio;
            }
            if (previewHeight < minPreviewDimension) {
                previewHeight = minPreviewDimension;
                previewWidth = previewHeight * ratio;
            }
        } else {
            previewHeight = Math.min(originalHeight, maxDisplayHeight);
            previewWidth = previewHeight * ratio;
            if (previewWidth > maxDisplayWidth) {
                previewWidth = maxDisplayWidth;
                previewHeight = previewWidth / ratio;
            }
            if (previewWidth < minPreviewDimension) {
                previewWidth = minPreviewDimension;
                previewHeight = previewWidth / ratio;
            }
        }
        canvas.width = Math.round(previewWidth);
        canvas.height = Math.round(previewHeight);
        closeModal(cropModal);
        redrawImage(ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed, isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState)
            .then(() => {
                originalFullResImage.src = fullResCanvas.toDataURL('image/png');
            });
    });
    lockCheckbox.addEventListener('change', (e) => {
        lockAspectRatio = e.target.checked;
        aspectRatio = cropRect.width / cropRect.height;
    });
}

function startCropDrag(e, cropCanvas) {
    e.preventDefault();
    const rect = cropCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    const resizeMargin = 20;

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
    if (isDragging) drawCropOverlay(cropCanvas, cropCtx);
}

function stopCropDrag(e, cropCanvas, cropCtx) {
    if (isDragging) {
        e.preventDefault();
        isDragging = false;
        cropCanvas.style.cursor = 'default';
        drawCropOverlay(cropCanvas, cropCtx);
    }
}

function adjustCropDrag(e, cropCanvas, cropCtx) {
    if (!isDragging) return;
    e.preventDefault();
    const rect = cropCanvas.getBoundingClientRect();
    let x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    let y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    x = clamp(x, 0, cropCanvas.width);
    y = clamp(y, 0, cropCanvas.height);

    if (isDragging === 'move') {
        cropRect.x = clamp(x - startX, 0, cropCanvas.width - cropRect.width);
        cropRect.y = clamp(y - startY, 0, cropCanvas.height - cropRect.height);
    } else {
        resizeCrop(x, y);
    }
    drawCropOverlay(cropCanvas, cropCtx);
}

function nearCorner(x, y, cornerX, cornerY, margin) {
    return Math.abs(x - cornerX) < margin && Math.abs(y - cornerY) < margin;
}

function insideCrop(x, y) {
    return x >= cropRect.x && x <= cropRect.x + cropRect.width &&
           y >= cropRect.y && y <= cropRect.y + cropRect.height;
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

    if (isDragging === 'top-left') {
        newWidth = clamp(cropRect.x + cropRect.width - x, 10, cropCanvas.width - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(cropRect.y + cropRect.height - y, 10, cropCanvas.height - cropRect.y);
        cropRect.x = clamp(x, 0, cropCanvas.width - newWidth);
        cropRect.y = lockAspectRatio ? cropRect.y + cropRect.height - newHeight : clamp(y, 0, cropCanvas.height - newHeight);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'top-right') {
        newWidth = clamp(x - cropRect.x, 10, cropCanvas.width - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(cropRect.y + cropRect.height - y, 10, cropCanvas.height - cropRect.y);
        cropRect.y = lockAspectRatio ? cropRect.y + cropRect.height - newHeight : clamp(y, 0, cropCanvas.height - newHeight);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'bottom-left') {
        newWidth = clamp(cropRect.x + cropRect.width - x, 10, cropCanvas.width - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(y - cropRect.y, 10, cropCanvas.height - cropRect.y);
        cropRect.x = clamp(x, 0, cropCanvas.width - newWidth);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'bottom-right') {
        newWidth = clamp(x - cropRect.x, 10, cropCanvas.width - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : clamp(y - cropRect.y, 10, cropCanvas.height - cropRect.y);
        cropRect.width = newWidth;
        cropRect.height = newHeight;
    } else if (isDragging === 'left') {
        newWidth = clamp(cropRect.x + cropRect.width - x, 10, cropCanvas.width - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : cropRect.height;
        cropRect.x = clamp(x, 0, cropCanvas.width - newWidth);
        cropRect.width = newWidth;
        if (lockAspectRatio) cropRect.height = newHeight;
    } else if (isDragging === 'right') {
        newWidth = clamp(x - cropRect.x, 10, cropCanvas.width - cropRect.x);
        newHeight = lockAspectRatio ? newWidth / aspectRatio : cropRect.height;
        cropRect.width = newWidth;
        if (lockAspectRatio) cropRect.height = newHeight;
    } else if (isDragging === 'top') {
        newHeight = clamp(cropRect.y + cropRect.height - y, 10, cropCanvas.height - cropRect.y);
        newWidth = lockAspectRatio ? newHeight * aspectRatio : cropRect.width;
        cropRect.y = clamp(y, 0, cropCanvas.height - newHeight);
        cropRect.height = newHeight;
        if (lockAspectRatio) cropRect.width = newWidth;
    } else if (isDragging === 'bottom') {
        newHeight = clamp(y - cropRect.y, 10, cropCanvas.height - cropRect.y);
        newWidth = lockAspectRatio ? newHeight * aspectRatio : cropRect.width;
        cropRect.height = newHeight;
        if (lockAspectRatio) cropRect.width = newWidth;
    }
}

function setupCropEventListeners(cropCanvas, cropCtx) {
    if (!cropCanvas || !cropCtx) {
        console.error('setupCropEventListeners: cropCanvas or cropCtx is undefined', { cropCanvas, cropCtx });
        return;
    }
    cropCanvas.addEventListener('mousedown', (e) => startCropDrag(e, cropCanvas));
    cropCanvas.addEventListener('mousemove', (e) => adjustCropDrag(e, cropCanvas, cropCtx));
    cropCanvas.addEventListener('mouseup', (e) => stopCropDrag(e, cropCanvas, cropCtx));
    cropCanvas.addEventListener('touchstart', (e) => startCropDrag(e, cropCanvas));
    cropCanvas.addEventListener('touchmove', (e) => adjustCropDrag(e, cropCanvas, cropCtx));
    cropCanvas.addEventListener('touchend', (e) => stopCropDrag(e, cropCanvas, cropCtx));

    cropCanvas.addEventListener('mousemove', (e) => {
        const rect = cropCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const resizeMargin = 20;

        if (nearCorner(x, y, cropRect.x, cropRect.y, resizeMargin)) {
            cropCanvas.style.cursor = 'nwse-resize';
        } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y, resizeMargin)) {
            cropCanvas.style.cursor = 'nesw-resize';
        } else if (nearCorner(x, y, cropRect.x, cropRect.y + cropRect.height, resizeMargin)) {
            cropCanvas.style.cursor = 'nesw-resize';
        } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y + cropRect.height, resizeMargin)) {
            cropCanvas.style.cursor = 'nwse-resize';
        } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'left', resizeMargin)) {
            cropCanvas.style.cursor = 'ew-resize';
        } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'right', resizeMargin)) {
            cropCanvas.style.cursor = 'ew-resize';
        } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'top', resizeMargin)) {
            cropCanvas.style.cursor = 'ns-resize';
        } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'bottom', resizeMargin)) {
            cropCanvas.style.cursor = 'ns-resize';
        } else if (insideCrop(x, y)) {
            cropCanvas.style.cursor = 'move';
        } else {
            cropCanvas.style.cursor = 'default';
        }
    });
}

function initializeCropHandler(params) {
    const { cropModal, cropCanvas, cropCtx, img, trueOriginalImage, originalUploadedImage, settings, noiseSeed, originalFullResImage, canvas, fullResCanvas, fullResCtx, originalImageData, originalWidth, originalHeight, previewWidth, previewHeight, isShowingOriginal, saveImageState, modal, modalImage } = params;
    console.log('initializeCropHandler params:', params);
    if (!cropCanvas || !cropCtx) {
        console.error('initializeCropHandler: cropCanvas or cropCtx is undefined');
        return;
    }
    setupCropEventListeners(cropCanvas, cropCtx);
    const cropImageButton = document.getElementById('crop-image-button');
    cropImageButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (!img.src || img.src === '') return;
        showCropModal(null, params);
    });
    cropImageButton.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (!img.src || img.src === '') return;
        showCropModal(null, params);
    });
}

export { initializeCropHandler, showCropModal, drawCropOverlay, setupCropControls, setupCropEventListeners, setTriggerFileUpload };
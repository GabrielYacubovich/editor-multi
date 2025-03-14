// cropHandler.js
import { state } from './script.js';
import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { redrawImage } from './imageProcessing.js';


// DOM elements (passed from script.js)
let cropModal, cropCanvas, cropCtx, canvas, ctx, fullResCanvas, fullResCtx, img, 
    trueOriginalImage, originalUploadedImage, originalFullResImage, modal, modalImage, 
    uploadNewPhotoButton; // Add uploadNewPhotoButton here

// State variables (passed from script.js or managed internally)
let cropImage = new Image();
let cropRect = { x: 0, y: 0, width: 0, height: 0 };
let initialCropRect = { x: 0, y: 0, width: 0, height: 0 };
let initialRotation = 0;
let rotation = 0;
let isDragging = false;
let startX, startY;
let lockAspectRatio = false;
let aspectRatio = 1;
let settings, noiseSeed, isShowingOriginal; // To be set via initialize
let originalWidth, originalHeight, previewWidth, previewHeight; // To be set via initialize

function initializeCropHandler(options) {
    ({ cropModal, cropCanvas, cropCtx, uploadNewPhotoButton } = options);
    setupModal(cropModal, false);
}

function showCropModal(dataURL = null) {
    cropModal.style.display = 'block';
    if (dataURL) {
        cropImage.src = dataURL;
        return new Promise((resolve) => {
            if (cropImage.complete && cropImage.naturalWidth !== 0) resolve();
            else cropImage.onload = resolve;
        }).then(() => {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = cropImage.width;
            tempCanvas.height = cropImage.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(cropImage, 0, 0);
            // Apply any necessary processing here, e.g., filters
            cropImage.src = tempCanvas.toDataURL('image/png');
            return new Promise((resolve) => {
                if (cropImage.complete && cropImage.naturalWidth !== 0) resolve();
                else cropImage.onload = resolve;
            }).then(() => {
                rotation = initialRotation;
                setupCropControls(null);
                drawCropOverlay();
            });
        });
    } else {
        // New image uploaded
        originalUploadedImage.src = dataURL;
        cropImage.src = dataURL;
        return new Promise((resolve) => {
            if (cropImage.complete && cropImage.naturalWidth !== 0) resolve();
            else cropImage.onload = resolve;
        }).then(() => {
            rotation = 0;
            initialCropRect = { x: 0, y: 0, width: 0, height: 0 };
            initialRotation = 0;
            
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
            
            setupCropControls(null);
            drawCropOverlay();
        });
    }
}

function setupCropControls(unfilteredCanvas) {
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
        triggerFileUpload(); // This will need to be passed or imported
    });
    uploadBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        triggerFileUpload();
    });
    restoreBtn.addEventListener('click', () => {
        rotation = 0;
        rotationInput.value = 0;
        rotationValue.textContent = '0°';
    
        if (!trueOriginalImage.src || trueOriginalImage.width === 0) {
            console.error("Restore failed: trueOriginalImage is not valid", trueOriginalImage);
            return;
        }
    
        // Calculate canvas dimensions
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
    
        // Set canvas dimensions
        cropCanvas.width = Math.round(width);
        cropCanvas.height = Math.round(height);
        cropCanvas.dataset.scaleFactor = 1; // Reset scale factor since no rotation
        cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };
    
        // Apply filters to temp canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = trueOriginalImage.width;
        tempCanvas.height = trueOriginalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(trueOriginalImage, 0, 0);
    
        // Chain filter applications and ensure image load
        applyBasicFiltersManually(tempCtx, tempCanvas, settings);
        applyAdvancedFilters(tempCtx, tempCanvas, settings, noiseSeed, 1)
            .then(() => applyGlitchEffects(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => applyComplexFilters(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => {
                const dataURL = tempCanvas.toDataURL('image/png');
                return new Promise((resolve) => {
                    cropImage.src = dataURL;
                    if (cropImage.complete && cropImage.naturalWidth !== 0) {
                        resolve();
                    } else {
                        cropImage.onload = resolve;
                        cropImage.onerror = () => {
                            console.error("cropImage failed to load after restore");
                            resolve(); // Proceed anyway to avoid hanging
                        };
                    }
                });
            })
            .then(() => {
                console.log("cropImage loaded:", cropImage.src, cropImage.naturalWidth, cropImage.naturalHeight);
                drawCropOverlay();
            })
            .catch(err => {
                console.error("Error during restore operation:", err);
                drawCropOverlay(); // Draw anyway to show something
            });
    });
    confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(cropModal);
        const angleRad = rotation * Math.PI / 180;
        const cosA = Math.abs(Math.cos(angleRad));
        const sinA = Math.abs(Math.sin(angleRad));
        const fullRotatedWidth = Math.ceil(cropImage.width * cosA + cropImage.height * sinA);
        const fullRotatedHeight = Math.ceil(cropImage.width * sinA + cropImage.height * cosA);
        const fullRotatedCanvas = document.createElement('canvas');
        fullRotatedCanvas.width = fullRotatedWidth;
        fullRotatedCanvas.height = fullRotatedHeight;
        const fullRotatedCtx = fullRotatedCanvas.getContext('2d', { willReadFrequently: true });
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
    // Update state with the cropped image
    state.img.src = tempCanvas.toDataURL('image/png');
    state.originalWidth = cropWidth;
    state.originalHeight = cropHeight;
    state.fullResCanvas.width = cropWidth;
    state.fullResCanvas.height = cropHeight;
    state.fullResCtx.drawImage(tempCanvas, 0, 0, cropWidth, cropHeight);
    
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
        initialCropRect = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
        initialRotation = rotation;
        const loadImage = new Promise((resolve, reject) => {
            if (img.complete && img.naturalWidth !== 0) resolve();
            else {
                img.onload = resolve;
                img.onerror = reject;
            }
        });
        loadImage.then(() => {
            originalWidth = tempCanvas.width;
            originalHeight = tempCanvas.height;
            fullResCanvas.width = originalWidth;
            fullResCanvas.height = originalHeight;
            fullResCtx.drawImage(tempCanvas, 0, 0, originalWidth, originalHeight);
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
            redrawImage(state, true)
            .then(() => {
                state.originalFullResImage.src = state.fullResCanvas.toDataURL('image/png');
                uploadNewPhotoButton.style.display = 'block';
            })
            .catch(err => console.error('Image load failed:', err));
    });
    });
    confirmBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        confirmBtn.click();
    });
    skipBtn.addEventListener('click', () => {
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
        previewWidth = Math.round(previewWidth);
        previewHeight = Math.round(previewHeight);
        canvas.width = previewWidth;
        canvas.height = previewHeight;
        closeModal(cropModal);
        const proceedWithRedraw = () => {
            redrawImage(
                ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                isShowingOriginal, trueOriginalImage, modal, modalImage, true
            )
                .then(() => {
                    originalFullResImage.src = fullResCanvas.toDataURL('image/png');
                });
        };
        if (img.complete && img.naturalWidth !== 0) {
            proceedWithRedraw();
        } else {
            const loadImage = new Promise((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
            });
            loadImage.then(proceedWithRedraw);
        }
        if (uploadNewPhotoButton) { // Check if defined
            uploadNewPhotoButton.style.display = 'block';
        } else {
            console.warn("uploadNewPhotoButton is not defined in skipBtn listener");
        }
    });
    lockCheckbox.addEventListener('change', (e) => {
        lockAspectRatio = e.target.checked;
        aspectRatio = cropRect.width / cropRect.height;
    });
}

function drawCropOverlay() {
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
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

    if (isDragging) {
        cropRect.x = clamp(cropRect.x, 0, cropCanvas.width - cropRect.width);
        cropRect.y = clamp(cropRect.y, 0, cropCanvas.height - cropRect.height);
        cropRect.width = clamp(cropRect.width, 10, cropCanvas.width - cropRect.x);
        cropRect.height = clamp(cropRect.height, 10, cropCanvas.height - cropRect.y);
    }
}

function startCropDrag(e) {
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
    if (isDragging) drawCropOverlay();
}

function adjustCropDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();

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
    drawCropOverlay();
}

function stopCropDrag(e) {
    if (isDragging) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;
        cropCanvas.style.cursor = 'default';
        cropRect.x = clamp(cropRect.x, 0, cropCanvas.width - cropRect.width);
        cropRect.y = clamp(cropRect.y, 0, cropCanvas.height - cropRect.height);
        cropRect.width = clamp(cropRect.width, 10, cropCanvas.width - cropRect.x);
        cropRect.height = clamp(cropRect.height, 10, cropCanvas.height - cropRect.y);
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

function insideCrop(x, y) {
    return x >= cropRect.x && x <= cropRect.x + cropRect.width &&
           y >= cropRect.y && y <= cropRect.y + cropRect.height;
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
    cropRect.x = clamp(cropRect.x, 0, cropCanvas.width - cropRect.width);
    cropRect.y = clamp(cropRect.y, 0, cropCanvas.height - cropRect.height);
    cropRect.width = clamp(cropRect.width, 10, cropCanvas.width - cropRect.x);
    cropRect.height = clamp(cropRect.height, 10, cropCanvas.height - cropRect.y);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Placeholder for triggerFileUpload (to be passed from script.js)
let triggerFileUpload = () => console.error("triggerFileUpload not set in cropHandler.js");

function setTriggerFileUpload(fn) {
    triggerFileUpload = fn;
}

// Event listeners setup
function setupCropEventListeners() {
    cropCanvas.addEventListener('mousedown', startCropDrag);
    cropCanvas.addEventListener('mousemove', adjustCropDrag);
    cropCanvas.addEventListener('mouseup', stopCropDrag);
    cropCanvas.addEventListener('touchstart', startCropDrag, { passive: false }); // Explicitly non-passive
    cropCanvas.addEventListener('touchmove', adjustCropDrag, { passive: false }); // Explicitly non-passive
    cropCanvas.addEventListener('touchend', stopCropDrag);
    cropCanvas.addEventListener('mouseleave', (e) => {
        if (isDragging) stopCropDrag(e);
    });
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
    const stopDragHandler = () => stopCropDrag(new Event('mouseup'));
    document.addEventListener('mouseup', stopDragHandler);
    document.addEventListener('touchend', stopDragHandler);
}

export { initializeCropHandler, showCropModal, setupCropEventListeners, setTriggerFileUpload };

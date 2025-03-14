// cropHandler.js
import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage } from './imageProcessing.js';
import { clamp } from './utils.js';

let cropModal, cropCanvas, cropCtx, canvas, ctx, fullResCanvas, fullResCtx, img, trueOriginalImage;
let originalUploadedImage, originalFullResImage, modal, modalImage, settings, noiseSeed;
let isShowingOriginal, originalWidth, originalHeight, previewWidth, previewHeight;
let uploadNewPhotoButton, saveImageState, originalImageData;
let rotation = 0;
let cropRect = { x: 0, y: 0, width: 0, height: 0 };
let originalCropRect = { ...cropRect };
let initialCropRect = { ...cropRect };
let originalRotation = rotation;
let initialRotation = rotation;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartCropRect = { ...cropRect };
let isResizing = false;
let resizeHandle = '';
let cropImage = new Image();
let lockAspectRatio = false;
let aspectRatio = 1;
let triggerFileUpload;

export function initializeCropHandler(dependencies) {
    ({
        cropModal, cropCanvas, cropCtx, canvas, ctx, fullResCanvas, fullResCtx,
        img, trueOriginalImage, originalUploadedImage, originalFullResImage,
        modal, modalImage, settings, noiseSeed, isShowingOriginal,
        originalWidth, originalHeight, previewWidth, previewHeight,
        uploadNewPhotoButton, saveImageState, originalImageData,
        rotation, cropRect, originalCropRect, initialCropRect,
        originalRotation, initialRotation, isDragging,
        dragStartX, dragStartY, dragStartCropRect,
        isResizing, resizeHandle, cropImage
    } = dependencies);
}

export function setTriggerFileUpload(func) {
    triggerFileUpload = func;
}

export function showCropModal(sourceImage) {
    if (!sourceImage) {
        // Re-showing crop modal with current image
        cropModal.style.display = 'block';
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);
        cropImage.src = tempCanvas.toDataURL('image/png');
        cropImage.onload = () => {
            rotation = initialRotation;
            setupCropOverlay();
            setupCropControls();
            drawCropOverlay();
        };
    } else {
        // New image uploaded
        cropImage = sourceImage;
        rotation = 0;
        initialRotation = 0;
        cropModal.style.display = 'block';
        
        if (cropImage.complete) {
            setupCropOverlay();
        } else {
            cropImage.onload = setupCropOverlay;
        }
    }
}

function setupCropOverlay() {
    const maxCanvasWidth = window.innerWidth - 100;
    const maxCanvasHeight = window.innerHeight - 250;
    const originalWidth = cropImage.width;
    const originalHeight = cropImage.height;
    const angleRad = rotation * Math.PI / 180;
    const cosA = Math.abs(Math.cos(angleRad));
    const sinA = Math.abs(Math.sin(angleRad));
    const fullRotatedWidth = Math.ceil(originalWidth * cosA + originalHeight * sinA);
    const fullRotatedHeight = Math.ceil(originalWidth * sinA + originalHeight * cosA);
    
    // Calculate scale to fit in viewport while maintaining aspect ratio
    const scaleWidth = maxCanvasWidth / fullRotatedWidth;
    const scaleHeight = maxCanvasHeight / fullRotatedHeight;
    const scale = Math.min(scaleWidth, scaleHeight);

    cropCanvas.width = Math.round(fullRotatedWidth * scale);
    cropCanvas.height = Math.round(fullRotatedHeight * scale);
    cropCanvas.dataset.scaleFactor = scale;

    // Set initial crop rect to full canvas size
    cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };
    initialCropRect = { ...cropRect };
    originalCropRect = { ...cropRect };
    
    setupCropControls();
    drawCropOverlay();
}

function drawCropOverlay() {
    const originalWidth = cropImage.width;
    const originalHeight = cropImage.height;
    const angleRad = rotation * Math.PI / 180;
    const scale = parseFloat(cropCanvas.dataset.scaleFactor) || 1;

    // Clear and draw blurred background
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.save();
    cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    cropCtx.rotate(angleRad);
    cropCtx.scale(scale, scale);
    cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
    cropCtx.filter = 'blur(5px)';
    cropCtx.drawImage(cropImage, 0, 0);
    cropCtx.restore();

    // Draw unblurred crop area
    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    cropCtx.clip();
    cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    cropCtx.rotate(angleRad);
    cropCtx.scale(scale, scale);
    cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
    cropCtx.filter = 'none';
    cropCtx.drawImage(cropImage, 0, 0);
    cropCtx.restore();

    // Draw crop rectangle
    cropCtx.strokeStyle = '#800000';
    cropCtx.lineWidth = 3;
    cropCtx.setLineDash([5, 5]);
    cropCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    cropCtx.setLineDash([]);
}

function setupCropControls() {
    const cropControls = document.getElementById('crop-controls');
    if (!cropControls) return;

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

    if (rotationInput) {
        rotationInput.addEventListener('input', (e) => {
            rotation = parseInt(e.target.value);
            rotationValue.textContent = `${rotation}°`;
            setupCropOverlay();
        });
    }

    if (rotationValue) {
        rotationValue.addEventListener('click', () => {
            const newValue = prompt('Ingrese el ángulo de rotación (-180 a 180):', rotation);
            if (newValue !== null) {
                const parsedValue = parseInt(newValue);
                if (!isNaN(parsedValue) && parsedValue >= -180 && parsedValue <= 180) {
                    rotation = parsedValue;
                    rotationInput.value = rotation;
                    rotationValue.textContent = `${rotation}°`;
                    setupCropOverlay();
                }
            }
        });
    }

    const addButtonListener = (button, handler) => {
        if (!button) return;
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            handler(e);
        });

        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            handler(e);
        }, { passive: false });
    };

    addButtonListener(uploadBtn, () => {
        if (typeof triggerFileUpload === 'function') {
            triggerFileUpload();
        }
    });

    addButtonListener(restoreBtn, () => {
        rotation = initialRotation;
        rotationInput.value = rotation;
        rotationValue.textContent = `${rotation}°`;
        cropRect = { ...initialCropRect };
        setupCropOverlay();
    });

    addButtonListener(confirmBtn, () => {
        applyCropChanges();
    });

    addButtonListener(skipBtn, () => {
        closeModal(cropModal);
    });

    if (lockCheckbox) {
        lockCheckbox.addEventListener('change', (e) => {
            lockAspectRatio = e.target.checked;
            if (lockAspectRatio) {
                aspectRatio = cropRect.width / cropRect.height;
            }
        });
    }
}

function applyCropChanges() {
    // Create a temporary canvas for the cropped image
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const scale = parseFloat(cropCanvas.dataset.scaleFactor) || 1;
    const angleRad = rotation * Math.PI / 180;

    // Calculate the dimensions of the cropped area in the original image space
    const originalScale = cropImage.width / (cropCanvas.width / scale);
    const cropWidth = cropRect.width * originalScale;
    const cropHeight = cropRect.height * originalScale;

    // Set the output dimensions
    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;

    // Transform and draw the cropped image
    tempCtx.save();
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate(angleRad);
    tempCtx.scale(originalScale, originalScale);
    tempCtx.translate(-cropRect.x / scale - cropRect.width / (2 * scale), -cropRect.y / scale - cropRect.height / (2 * scale));
    tempCtx.drawImage(cropImage, 0, 0);
    tempCtx.restore();

    // Update the main canvas and full resolution canvas
    const aspectRatio = cropWidth / cropHeight;
    const maxWidth = 800;
    const maxHeight = 800;
    let newWidth, newHeight;

    if (aspectRatio > 1) {
        newWidth = Math.min(maxWidth, cropWidth);
        newHeight = newWidth / aspectRatio;
    } else {
        newHeight = Math.min(maxHeight, cropHeight);
        newWidth = newHeight * aspectRatio;
    }

    canvas.width = newWidth;
    canvas.height = newHeight;
    fullResCanvas.width = cropWidth;
    fullResCanvas.height = cropHeight;

    // Draw the cropped image on both canvases
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    fullResCtx.drawImage(tempCanvas, 0, 0, fullResCanvas.width, fullResCanvas.height);

    // Save the state and update the original image
    saveImageState();
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    originalFullResImage.src = fullResCanvas.toDataURL('image/png');

    // Close the crop modal
    closeModal(cropModal);
}

// Event handling functions
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
        dragStartX = x - cropRect.x;
        dragStartY = y - cropRect.y;
    }

    if (isDragging) {
        drawCropOverlay();
    }
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
        cropRect.x = clamp(x - dragStartX, 0, cropCanvas.width - cropRect.width);
        cropRect.y = clamp(y - dragStartY, 0, cropCanvas.height - cropRect.height);
    } else {
        resizeCrop(x, y);
    }
    drawCropOverlay();
}

function stopCropDrag(e) {
    if (isDragging) {
        e.preventDefault();
        isDragging = false;
        cropCanvas.style.cursor = 'default';
        drawCropOverlay();
    }
}

function resizeCrop(x, y) {
    const minSize = 10;
    let newX = cropRect.x;
    let newY = cropRect.y;
    let newWidth = cropRect.width;
    let newHeight = cropRect.height;

    switch (isDragging) {
        case 'top-left':
            newX = x;
            newY = y;
            newWidth = cropRect.x + cropRect.width - x;
            newHeight = cropRect.y + cropRect.height - y;
            break;
        case 'top-right':
            newY = y;
            newWidth = x - cropRect.x;
            newHeight = cropRect.y + cropRect.height - y;
            break;
        case 'bottom-left':
            newX = x;
            newWidth = cropRect.x + cropRect.width - x;
            newHeight = y - cropRect.y;
            break;
        case 'bottom-right':
            newWidth = x - cropRect.x;
            newHeight = y - cropRect.y;
            break;
        case 'left':
            newX = x;
            newWidth = cropRect.x + cropRect.width - x;
            break;
        case 'right':
            newWidth = x - cropRect.x;
            break;
        case 'top':
            newY = y;
            newHeight = cropRect.y + cropRect.height - y;
            break;
        case 'bottom':
            newHeight = y - cropRect.y;
            break;
    }

    if (lockAspectRatio) {
        const ratio = aspectRatio;
        if (isDragging.includes('left') || isDragging.includes('right')) {
            newHeight = newWidth / ratio;
        } else if (isDragging.includes('top') || isDragging.includes('bottom')) {
            newWidth = newHeight * ratio;
        }
    }

    // Apply minimum size and bounds checking
    newWidth = clamp(newWidth, minSize, cropCanvas.width - newX);
    newHeight = clamp(newHeight, minSize, cropCanvas.height - newY);
    newX = clamp(newX, 0, cropCanvas.width - newWidth);
    newY = clamp(newY, 0, cropCanvas.height - newHeight);

    cropRect.x = newX;
    cropRect.y = newY;
    cropRect.width = newWidth;
    cropRect.height = newHeight;
}

function nearCorner(x, y, cornerX, cornerY, margin) {
    return Math.abs(x - cornerX) < margin && Math.abs(y - cornerY) < margin;
}

function nearSide(x, y, rectX, rectY, width, height, side, margin) {
    switch (side) {
        case 'left':
            return Math.abs(x - rectX) < margin && y > rectY && y < rectY + height;
        case 'right':
            return Math.abs(x - (rectX + width)) < margin && y > rectY && y < rectY + height;
        case 'top':
            return Math.abs(y - rectY) < margin && x > rectX && x < rectX + width;
        case 'bottom':
            return Math.abs(y - (rectY + height)) < margin && x > rectX && x < rectX + width;
        default:
            return false;
    }
}

function insideCrop(x, y) {
    return x > cropRect.x && x < cropRect.x + cropRect.width &&
           y > cropRect.y && y < cropRect.y + cropRect.height;
}
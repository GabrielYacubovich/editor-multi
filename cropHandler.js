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
let currentImageData = null;
let lastMouseX, lastMouseY;
let initialDragRect = null;

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
        tempCanvas.width = trueOriginalImage.width;
        tempCanvas.height = trueOriginalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(trueOriginalImage, 0, 0);
        
        // Store current image data for preview
        currentImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Apply filters to temp canvas
        applyBasicFiltersManually(tempCtx, tempCanvas, settings);
        applyAdvancedFilters(tempCtx, tempCanvas, settings, noiseSeed, 1)
            .then(() => applyGlitchEffects(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => applyComplexFilters(tempCtx, tempCanvas, settings, noiseSeed, 1))
            .then(() => {
                cropImage.src = tempCanvas.toDataURL('image/png');
                cropImage.onload = () => {
                    rotation = initialRotation;
                    setupCropOverlay();
                    setupCropControls();
                    drawCropOverlay();
                };
            });
    } else {
        // New image uploaded
        cropImage = sourceImage;
        rotation = 0;
        initialRotation = 0;
        cropModal.style.display = 'block';
        currentImageData = null;
        
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
    const scale = Math.min(scaleWidth, scaleHeight, 1); // Don't scale up images

    // Set up the crop canvas
    cropCanvas.width = Math.round(fullRotatedWidth * scale);
    cropCanvas.height = Math.round(fullRotatedHeight * scale);
    cropCanvas.dataset.scaleFactor = scale;
    cropCanvas.dataset.originalWidth = originalWidth;
    cropCanvas.dataset.originalHeight = originalHeight;

    // Calculate centered crop rect based on original image dimensions
    const cropSize = Math.min(originalWidth, originalHeight) * scale;
    const cropX = (cropCanvas.width - cropSize) / 2;
    const cropY = (cropCanvas.height - cropSize) / 2;

    // Set initial crop rect
    cropRect = { x: cropX, y: cropY, width: cropSize, height: cropSize };
    initialCropRect = { ...cropRect };
    originalCropRect = { ...cropRect };
    
    setupCropControls();
    drawCropOverlay();
    
    // Preview the crop in the editor canvas
    previewCrop();
}

function drawCropOverlay() {
    const originalWidth = parseInt(cropCanvas.dataset.originalWidth);
    const originalHeight = parseInt(cropCanvas.dataset.originalHeight);
    const angleRad = rotation * Math.PI / 180;
    const scale = parseFloat(cropCanvas.dataset.scaleFactor) || 1;

    // Clear and draw blurred background
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    
    // Draw rotated image with blur
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
    
    // Draw unblurred image in crop area
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
    
    // Draw corner handles
    const handleSize = 10;
    const corners = [
        { x: cropRect.x, y: cropRect.y },
        { x: cropRect.x + cropRect.width, y: cropRect.y },
        { x: cropRect.x, y: cropRect.y + cropRect.height },
        { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height }
    ];
    
    cropCtx.fillStyle = '#800000';
    corners.forEach(corner => {
        cropCtx.fillRect(corner.x - handleSize/2, corner.y - handleSize/2, handleSize, handleSize);
    });
    
    // Draw side handles
    const sides = [
        { x: cropRect.x + cropRect.width/2, y: cropRect.y }, // top
        { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height/2 }, // right
        { x: cropRect.x + cropRect.width/2, y: cropRect.y + cropRect.height }, // bottom
        { x: cropRect.x, y: cropRect.y + cropRect.height/2 } // left
    ];
    
    sides.forEach(side => {
        cropCtx.fillRect(side.x - handleSize/2, side.y - handleSize/2, handleSize, handleSize);
    });
    
    // Draw grid lines for the rule of thirds
    cropCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    cropCtx.lineWidth = 1;
    
    // Vertical lines
    for (let i = 1; i < 3; i++) {
        const x = cropRect.x + (cropRect.width * i / 3);
        cropCtx.beginPath();
        cropCtx.moveTo(x, cropRect.y);
        cropCtx.lineTo(x, cropRect.y + cropRect.height);
        cropCtx.stroke();
    }
    
    // Horizontal lines
    for (let i = 1; i < 3; i++) {
        const y = cropRect.y + (cropRect.height * i / 3);
        cropCtx.beginPath();
        cropCtx.moveTo(cropRect.x, y);
        cropCtx.lineTo(cropRect.x + cropRect.width, y);
        cropCtx.stroke();
    }
    
    // Update cursor based on position
    updateCropCursor();
    
    // Update preview in main canvas
    previewCrop();
}

function updateCropCursor() {
    const rect = cropCanvas.getBoundingClientRect();
    const x = (lastMouseX || 0) - rect.left;
    const y = (lastMouseY || 0) - rect.top;
    const resizeMargin = 10;
    
    if (nearCorner(x, y, cropRect.x, cropRect.y, resizeMargin)) {
        cropCanvas.style.cursor = 'nw-resize';
    } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y, resizeMargin)) {
        cropCanvas.style.cursor = 'ne-resize';
    } else if (nearCorner(x, y, cropRect.x, cropRect.y + cropRect.height, resizeMargin)) {
        cropCanvas.style.cursor = 'sw-resize';
    } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y + cropRect.height, resizeMargin)) {
        cropCanvas.style.cursor = 'se-resize';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'left', resizeMargin)) {
        cropCanvas.style.cursor = 'w-resize';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'right', resizeMargin)) {
        cropCanvas.style.cursor = 'e-resize';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'top', resizeMargin)) {
        cropCanvas.style.cursor = 'n-resize';
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'bottom', resizeMargin)) {
        cropCanvas.style.cursor = 's-resize';
    } else if (insideCrop(x, y)) {
        cropCanvas.style.cursor = 'move';
    } else {
        cropCanvas.style.cursor = 'default';
    }
}

function previewCrop() {
    if (!currentImageData) return;
    
    // Create a temporary canvas for the preview
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const scale = parseFloat(cropCanvas.dataset.scaleFactor) || 1;
    const originalWidth = parseInt(cropCanvas.dataset.originalWidth);
    const originalHeight = parseInt(cropCanvas.dataset.originalHeight);
    
    // Calculate the dimensions in the original image space
    const cropX = cropRect.x / scale;
    const cropY = cropRect.y / scale;
    const cropWidth = cropRect.width / scale;
    const cropHeight = cropRect.height / scale;
    
    // Set up the temporary canvas for the cropped area
    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;
    
    // Draw the cropped and rotated image
    tempCtx.save();
    
    // Center on the crop area
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    
    // Apply rotation
    tempCtx.rotate(rotation * Math.PI / 180);
    
    // Calculate the offset to center the image in the rotated space
    const rotatedOffsetX = -originalWidth / 2 + cropX + cropWidth / 2;
    const rotatedOffsetY = -originalHeight / 2 + cropY + cropHeight / 2;
    
    // Apply the offset and draw
    tempCtx.translate(rotatedOffsetX, rotatedOffsetY);
    tempCtx.drawImage(cropImage, 0, 0);
    tempCtx.restore();
    
    // Update the preview canvas with proper scaling
    const aspectRatio = cropWidth / cropHeight;
    let previewWidth, previewHeight;
    
    if (aspectRatio > 1) {
        previewWidth = Math.min(800, cropWidth);
        previewHeight = previewWidth / aspectRatio;
    } else {
        previewHeight = Math.min(800, cropHeight);
        previewWidth = previewHeight * aspectRatio;
    }
    
    // Update the main canvas dimensions and draw the preview
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    ctx.drawImage(tempCanvas, 0, 0, previewWidth, previewHeight);
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
            // Only prevent default for buttons
            e.preventDefault();
            handler(e);
        });
    };

    // Add touch event listeners to cropCanvas
    cropCanvas.addEventListener('touchstart', startCropDrag, { passive: true });
    cropCanvas.addEventListener('touchmove', adjustCropDrag, { passive: false });
    cropCanvas.addEventListener('touchend', stopCropDrag);
    cropCanvas.addEventListener('touchcancel', stopCropDrag);

    // Add mouse event listeners to cropCanvas
    cropCanvas.addEventListener('mousedown', startCropDrag);
    cropCanvas.addEventListener('mousemove', (e) => {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        updateCropCursor();
    });
    cropCanvas.addEventListener('mousemove', adjustCropDrag);
    cropCanvas.addEventListener('mouseup', stopCropDrag);
    cropCanvas.addEventListener('mouseleave', stopCropDrag);

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

function startCropDrag(e) {
    if (e.type === 'touchstart') {
        // For touch events, only prevent default if we're actually starting a drag
        const rect = cropCanvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const resizeMargin = 20;

        // Only prevent default if we're actually going to start dragging
        if (nearCorner(x, y, cropRect.x, cropRect.y, resizeMargin) ||
            nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y, resizeMargin) ||
            nearCorner(x, y, cropRect.x, cropRect.y + cropRect.height, resizeMargin) ||
            nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y + cropRect.height, resizeMargin) ||
            nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'left', resizeMargin) ||
            nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'right', resizeMargin) ||
            nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'top', resizeMargin) ||
            nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'bottom', resizeMargin) ||
            insideCrop(x, y)) {
            e.preventDefault();
        }
    }

    const rect = cropCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches?.[0].clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0].clientY) - rect.top;
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
        // Store initial crop rect for aspect ratio calculations
        initialDragRect = { ...cropRect };
        dragStartX = x;
        dragStartY = y;
        drawCropOverlay();
    }
}

function adjustCropDrag(e) {
    if (!isDragging) {
        // Update cursor even when not dragging
        lastMouseX = e.clientX || e.touches?.[0].clientX;
        lastMouseY = e.clientY || e.touches?.[0].clientY;
        updateCropCursor();
        return;
    }
    
    // Only prevent default if we're actually dragging
    if (e.type === 'touchmove' && isDragging) {
        e.preventDefault();
    }
    
    const rect = cropCanvas.getBoundingClientRect();
    let x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    let y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    x = clamp(x, 0, cropCanvas.width);
    y = clamp(y, 0, cropCanvas.height);

    const deltaX = x - dragStartX;
    const deltaY = y - dragStartY;

    if (isDragging === 'move') {
        cropRect.x = clamp(initialDragRect.x + deltaX, 0, cropCanvas.width - cropRect.width);
        cropRect.y = clamp(initialDragRect.y + deltaY, 0, cropCanvas.height - cropRect.height);
    } else {
        resizeCrop(x, y);
    }
    
    drawCropOverlay();
}

function stopCropDrag(e) {
    if (isDragging) {
        // Only prevent default if we were dragging
        if (e.type === 'touchend') {
            e.preventDefault();
        }
        isDragging = false;
        initialDragRect = null;
        dragStartX = null;
        dragStartY = null;
        cropCanvas.style.cursor = 'default';
        drawCropOverlay();
    }
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

function applyCropChanges() {
    // Create a temporary canvas for the cropped image
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const scale = parseFloat(cropCanvas.dataset.scaleFactor) || 1;
    const originalWidth = parseInt(cropCanvas.dataset.originalWidth);
    const originalHeight = parseInt(cropCanvas.dataset.originalHeight);
    
    // Calculate the dimensions in the original image space
    const cropX = cropRect.x / scale;
    const cropY = cropRect.y / scale;
    const cropWidth = cropRect.width / scale;
    const cropHeight = cropRect.height / scale;
    
    // Set up the temporary canvas for the cropped area
    tempCanvas.width = cropWidth;
    tempCanvas.height = cropHeight;
    
    // Draw the cropped and rotated image
    tempCtx.save();
    
    // Center on the crop area
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    
    // Apply rotation
    tempCtx.rotate(rotation * Math.PI / 180);
    
    // Calculate the offset to center the image in the rotated space
    const rotatedOffsetX = -originalWidth / 2 + cropX + cropWidth / 2;
    const rotatedOffsetY = -originalHeight / 2 + cropY + cropHeight / 2;
    
    // Apply the offset and draw
    tempCtx.translate(rotatedOffsetX, rotatedOffsetY);
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

    // Set canvas dimensions
    canvas.width = newWidth;
    canvas.height = newHeight;
    fullResCanvas.width = cropWidth;
    fullResCanvas.height = cropHeight;

    // Draw the cropped image on both canvases
    ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    fullResCtx.drawImage(tempCanvas, 0, 0, fullResCanvas.width, fullResCanvas.height);

    // Apply filters to the cropped image
    applyBasicFiltersManually(ctx, canvas, settings);
    applyAdvancedFilters(ctx, canvas, settings, noiseSeed, 1)
        .then(() => applyGlitchEffects(ctx, canvas, settings, noiseSeed, 1))
        .then(() => applyComplexFilters(ctx, canvas, settings, noiseSeed, 1))
        .then(() => {
            // Save the state and update the original image
            saveImageState();
            originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            originalFullResImage.src = fullResCanvas.toDataURL('image/png');
            trueOriginalImage.src = cropImage.src;

            // Close the crop modal
            closeModal(cropModal);
        });
}
import {
    img,
    fullResCanvas,
    fullResCtx,
    canvas,
    ctx,
    originalWidth,
    originalHeight,
    trueOriginalImage,
    originalUploadedImage,
    previewWidth,
    previewHeight,
    originalImageData,
    initialCropRect,
    initialRotation
} from './script.js';

// Variables declared in cropHandler.js scope
let cropModal = document.getElementById('crop-modal');
let cropCanvas = document.getElementById('crop-canvas');
let cropCtx = cropCanvas.getContext('2d');
let originalFullResImage = new Image();
let modal = document.getElementById('image-modal');
let modalImage = document.getElementById('modal-image');
let uploadNewPhotoButton = document.getElementById('upload-new-photo');
let saveImageState;

let cropRect = { x: 0, y: 0, width: 0, height: 0 };
let isDragging = false;
let startX, startY;
let lockAspectRatio = false;
let aspectRatio = 1;
let rotation = 0;
let cropImage = new Image();

// Utility functions
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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
    return x >= cropRect.x && x <= cropRect.x + cropRect.width &&
           y >= cropRect.y && y <= cropRect.y + cropRect.height;
}

// Modal management
function closeModal(modalElement) {
    modalElement.style.display = 'none';
    if (modalElement === cropModal) {
        isDragging = false;
        cropCanvas.style.cursor = 'default';
        uploadNewPhotoButton.style.display = 'block';
    }
}

function setupModal(modalElement, allowOutsideClick = false) {
    const closeBtn = modalElement.querySelector('.modal-close-btn');
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeModalHandler);
        closeBtn.addEventListener('click', closeModalHandler);
    }
    if (allowOutsideClick) {
        modalElement.removeEventListener('click', outsideClickHandler);
        modalElement.addEventListener('click', outsideClickHandler);
    }
}

function closeModalHandler() {
    const modal = this.closest('.modal');
    closeModal(modal);
}

function outsideClickHandler(e) {
    if (e.target === this) {
        closeModal(this);
    }
}

// Initialization function
export function initializeCropHandler(options) {
    // Only assign to variables declared in this module
    ({
        cropModal,
        cropCanvas,
        cropCtx,
        originalFullResImage,
        modal,
        modalImage,
        uploadNewPhotoButton,
        saveImageState
    } = options);

    // Use imported variables directly instead of reassigning
    setupModal(cropModal, false);
    console.log(cropModal);
}

// Crop drawing and interaction
function drawCropOverlay() {
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

// Event listeners
cropCanvas.addEventListener('mousedown', startCropDrag);
cropCanvas.addEventListener('mousemove', adjustCropDrag);
cropCanvas.addEventListener('mouseup', stopCropDrag);
cropCanvas.addEventListener('touchstart', startCropDrag);
cropCanvas.addEventListener('touchmove', adjustCropDrag);
cropCanvas.addEventListener('touchend', stopCropDrag);

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

cropCanvas.addEventListener('mouseleave', (e) => {
    if (isDragging) {
        stopCropDrag(e);
    }
});

document.addEventListener('mouseup', stopCropDrag);
document.addEventListener('touchend', stopCropDrag);

// Exported functions for external use
export function showCropModal(dataURL = null) {
    if (!dataURL) {
        cropModal.style.display = 'block';
        cropImage.src = trueOriginalImage.src;
        rotation = initialRotation;
        cropImage.onload = () => {
            drawCropOverlay();
        };
    } else {
        originalUploadedImage.src = dataURL;
        cropImage.src = dataURL;
        rotation = 0;
        cropRect = { x: 0, y: 0, width: 0, height: 0 };
        cropModal.style.display = 'block';
        cropImage.onload = () => {
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
            drawCropOverlay();
        };
    }
    if (cropImage.complete && cropImage.naturalWidth !== 0) {
        cropImage.onload();
    }
}

export function setupCropControls(unfilteredCanvas) {
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

    restoreBtn.addEventListener('click', () => {
        rotation = 0;
        rotationInput.value = 0;
        rotationValue.textContent = '0°';
        cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };
        drawCropOverlay();
    });

    uploadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Assuming triggerFileUpload is defined in script.js and imported if needed
        if (typeof triggerFileUpload === 'function') triggerFileUpload();
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

        initialCropRect.x = cropX;
        initialCropRect.y = cropY;
        initialCropRect.width = cropWidth;
        initialCropRect.height = cropHeight;
        initialRotation = rotation;

        // Assuming redrawImage is defined in script.js and imported if needed
        if (typeof redrawImage === 'function') {
            redrawImage(true).then(() => {
                originalFullResImage.src = fullResCanvas.toDataURL('image/png');
            });
        }
    });

    skipBtn.addEventListener('click', () => {
        closeModal(cropModal);
        img.src = fullResCanvas.toDataURL('image/png');
        // Assuming redrawImage is defined in script.js
        if (typeof redrawImage === 'function') redrawImage(true);
    });

    lockCheckbox.addEventListener('change', (e) => {
        lockAspectRatio = e.target.checked;
        aspectRatio = cropRect.width / cropRect.height;
    });
}
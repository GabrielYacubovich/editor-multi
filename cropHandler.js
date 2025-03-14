// cropHandler.js
import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage } from './imageProcessing.js';
import { clamp, debounce } from './utils.js';
import { redrawWorker } from './script.js';

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

export function setTriggerFileUpload(fn) {
    triggerFileUpload = fn;
}

export function showCropModal(imageSrc) {
    if (imageSrc && typeof imageSrc === 'string' && imageSrc.trim() !== '') {
        cropImage.src = imageSrc;
        cropImage.onload = () => {
            cropCanvas.width = cropImage.width;
            cropCanvas.height = cropImage.height;
            cropRect = {
                x: 0,
                y: 0,
                width: cropImage.width,
                height: cropImage.height
            };
            originalCropRect = { ...cropRect };
            initialCropRect = { ...cropRect };
            rotation = 0;
            originalRotation = rotation;
            initialRotation = rotation;
            drawCropOverlay();
            cropModal.style.display = 'block';
        };
    }
}

function drawCropOverlay() {
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    
    cropCtx.save();
    cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    cropCtx.rotate(rotation * Math.PI / 180);
    cropCtx.translate(-cropCanvas.width / 2, -cropCanvas.height / 2);
    cropCtx.drawImage(cropImage, 0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.restore();
    
    drawCropBorder();
}

function drawCropBorder() {
    const borderWidth = 2;
    const handleSize = 10;
    
    cropCtx.strokeStyle = 'white';
    cropCtx.lineWidth = borderWidth;
    cropCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    
    const handles = [
        { x: cropRect.x, y: cropRect.y, cursor: 'nw-resize' },
        { x: cropRect.x + cropRect.width / 2, y: cropRect.y, cursor: 'n-resize' },
        { x: cropRect.x + cropRect.width, y: cropRect.y, cursor: 'ne-resize' },
        { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height / 2, cursor: 'e-resize' },
        { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height, cursor: 'se-resize' },
        { x: cropRect.x + cropRect.width / 2, y: cropRect.y + cropRect.height, cursor: 's-resize' },
        { x: cropRect.x, y: cropRect.y + cropRect.height, cursor: 'sw-resize' },
        { x: cropRect.x, y: cropRect.y + cropRect.height / 2, cursor: 'w-resize' }
    ];
    
    handles.forEach(handle => {
        cropCtx.fillStyle = 'white';
        cropCtx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    });
}

function getResizeHandle(x, y) {
    const handleSize = 10;
    const handles = [
        { x: cropRect.x, y: cropRect.y, cursor: 'nw-resize' },
        { x: cropRect.x + cropRect.width / 2, y: cropRect.y, cursor: 'n-resize' },
        { x: cropRect.x + cropRect.width, y: cropRect.y, cursor: 'ne-resize' },
        { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height / 2, cursor: 'e-resize' },
        { x: cropRect.x + cropRect.width, y: cropRect.y + cropRect.height, cursor: 'se-resize' },
        { x: cropRect.x + cropRect.width / 2, y: cropRect.y + cropRect.height, cursor: 's-resize' },
        { x: cropRect.x, y: cropRect.y + cropRect.height, cursor: 'sw-resize' },
        { x: cropRect.x, y: cropRect.y + cropRect.height / 2, cursor: 'w-resize' }
    ];
    
    for (const handle of handles) {
        if (Math.abs(x - handle.x) <= handleSize / 2 && Math.abs(y - handle.y) <= handleSize / 2) {
            return handle.cursor;
        }
    }
    return '';
}

cropCanvas.addEventListener('mousedown', (e) => {
    const rect = cropCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const handle = getResizeHandle(x, y);
    if (handle) {
        isResizing = true;
        resizeHandle = handle;
    } else if (x >= cropRect.x && x <= cropRect.x + cropRect.width &&
               y >= cropRect.y && y <= cropRect.y + cropRect.height) {
        isDragging = true;
        dragStartX = x;
        dragStartY = y;
        dragStartCropRect = { ...cropRect };
    }
});

cropCanvas.addEventListener('mousemove', (e) => {
    const rect = cropCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (!isDragging && !isResizing) {
        const handle = getResizeHandle(x, y);
        cropCanvas.style.cursor = handle || (x >= cropRect.x && x <= cropRect.x + cropRect.width &&
                                           y >= cropRect.y && y <= cropRect.y + cropRect.height ? 'move' : 'default');
        return;
    }
    
    if (isDragging) {
        const dx = x - dragStartX;
        const dy = y - dragStartY;
        
        cropRect.x = Math.max(0, Math.min(cropCanvas.width - cropRect.width, dragStartCropRect.x + dx));
        cropRect.y = Math.max(0, Math.min(cropCanvas.height - cropRect.height, dragStartCropRect.y + dy));
        
        drawCropOverlay();
    } else if (isResizing) {
        const minSize = 50;
        let newRect = { ...cropRect };
        
        switch (resizeHandle) {
            case 'nw-resize':
                newRect.width = cropRect.x + cropRect.width - x;
                newRect.height = cropRect.y + cropRect.height - y;
                newRect.x = x;
                newRect.y = y;
                break;
            case 'n-resize':
                newRect.height = cropRect.y + cropRect.height - y;
                newRect.y = y;
                break;
            case 'ne-resize':
                newRect.width = x - cropRect.x;
                newRect.height = cropRect.y + cropRect.height - y;
                newRect.y = y;
                break;
            case 'e-resize':
                newRect.width = x - cropRect.x;
                break;
            case 'se-resize':
                newRect.width = x - cropRect.x;
                newRect.height = y - cropRect.y;
                break;
            case 's-resize':
                newRect.height = y - cropRect.y;
                break;
            case 'sw-resize':
                newRect.width = cropRect.x + cropRect.width - x;
                newRect.height = y - cropRect.y;
                newRect.x = x;
                break;
            case 'w-resize':
                newRect.width = cropRect.x + cropRect.width - x;
                newRect.x = x;
                break;
        }
        
        if (newRect.width >= minSize && newRect.height >= minSize &&
            newRect.x >= 0 && newRect.y >= 0 &&
            newRect.x + newRect.width <= cropCanvas.width &&
            newRect.y + newRect.height <= cropCanvas.height) {
            cropRect = newRect;
            drawCropOverlay();
        }
    }
});

cropCanvas.addEventListener('mouseup', () => {
    isDragging = false;
    isResizing = false;
});

cropCanvas.addEventListener('mouseleave', () => {
    isDragging = false;
    isResizing = false;
});

document.getElementById('rotate-left').addEventListener('click', () => {
    rotation = (rotation - 90) % 360;
    drawCropOverlay();
});

document.getElementById('rotate-right').addEventListener('click', () => {
    rotation = (rotation + 90) % 360;
    drawCropOverlay();
});

document.getElementById('apply-crop').addEventListener('click', () => {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    tempCanvas.width = cropRect.width;
    tempCanvas.height = cropRect.height;
    
    tempCtx.save();
    tempCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tempCtx.rotate(rotation * Math.PI / 180);
    tempCtx.translate(-cropCanvas.width / 2, -cropCanvas.height / 2);
    tempCtx.drawImage(cropImage, 0, 0, cropCanvas.width, cropCanvas.height);
    tempCtx.restore();
    
    const croppedImageData = tempCanvas.toDataURL('image/png');
    img.src = croppedImageData;
    trueOriginalImage.src = croppedImageData;
    originalUploadedImage.src = croppedImageData;
    
    cropModal.style.display = 'none';
});

document.getElementById('cancel-crop').addEventListener('click', () => {
    cropModal.style.display = 'none';
    cropRect = { ...originalCropRect };
    rotation = originalRotation;
});
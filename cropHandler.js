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
let scale = 1;
let lastTouchDistance = 0;

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

    setupCropEventListeners();
}

function setupCropEventListeners() {
    if (!cropCanvas) return;

    // Mouse events
    cropCanvas.addEventListener('mousedown', handleStart);
    cropCanvas.addEventListener('mousemove', handleMove);
    cropCanvas.addEventListener('mouseup', handleEnd);
    cropCanvas.addEventListener('mouseleave', handleEnd);

    // Touch events with passive: false for better mobile performance
    cropCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            lastTouchDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            return;
        }
        const touch = e.touches[0];
        handleStart({
            clientX: touch.clientX,
            clientY: touch.clientY,
            isTouch: true
        });
    }, { passive: false });

    cropCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            const deltaScale = (distance - lastTouchDistance) / 100;
            scale = clamp(scale + deltaScale, 0.5, 3);
            lastTouchDistance = distance;
            drawCropOverlay();
            return;
        }
        const touch = e.touches[0];
        handleMove({
            clientX: touch.clientX,
            clientY: touch.clientY,
            isTouch: true
        });
    }, { passive: false });

    cropCanvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (e.touches.length === 0) {
            handleEnd();
        }
    }, { passive: false });

    function handleStart(e) {
        const rect = cropCanvas.getBoundingClientRect();
        const x = clamp(e.clientX - rect.left, 0, cropCanvas.width);
        const y = clamp(e.clientY - rect.top, 0, cropCanvas.height);
        
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
    }

    function handleMove(e) {
        const rect = cropCanvas.getBoundingClientRect();
        const x = clamp(e.clientX - rect.left, 0, cropCanvas.width);
        const y = clamp(e.clientY - rect.top, 0, cropCanvas.height);
        
        if (!isDragging && !isResizing) {
            const handle = getResizeHandle(x, y);
            cropCanvas.style.cursor = handle || (x >= cropRect.x && x <= cropRect.x + cropRect.width &&
                                               y >= cropRect.y && y <= cropRect.y + cropRect.height ? 'move' : 'default');
            return;
        }
        
        if (isDragging) {
            const dx = x - dragStartX;
            const dy = y - dragStartY;
            
            cropRect.x = clamp(dragStartCropRect.x + dx, 0, cropCanvas.width - cropRect.width);
            cropRect.y = clamp(dragStartCropRect.y + dy, 0, cropCanvas.height - cropRect.height);
            
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
            
            // Ensure minimum size and keep within canvas bounds
            newRect.width = clamp(newRect.width, minSize, cropCanvas.width - newRect.x);
            newRect.height = clamp(newRect.height, minSize, cropCanvas.height - newRect.y);
            newRect.x = clamp(newRect.x, 0, cropCanvas.width - minSize);
            newRect.y = clamp(newRect.y, 0, cropCanvas.height - minSize);
            
            cropRect = newRect;
            drawCropOverlay();
        }
    }

    function handleEnd() {
        isDragging = false;
        isResizing = false;
    }

    // Button event listeners with touch support
    const buttons = {
        'rotate-left': () => { rotation = (rotation - 90) % 360; drawCropOverlay(); },
        'rotate-right': () => { rotation = (rotation + 90) % 360; drawCropOverlay(); },
        'apply-crop': applyCropChanges,
        'cancel-crop': cancelCropChanges
    };

    Object.entries(buttons).forEach(([id, handler]) => {
        const button = document.getElementById(id);
        if (button) {
            button.addEventListener('click', handler);
            button.addEventListener('touchstart', (e) => {
                e.preventDefault();
                handler();
            }, { passive: false });
        }
    });
}

function drawCropOverlay() {
    cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    
    cropCtx.save();
    
    // Draw semi-transparent overlay with animation
    cropCtx.fillStyle = isDragging || isResizing ? 
        'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0.5)';
    cropCtx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
    
    // Draw the rotated and scaled image
    cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    cropCtx.rotate(rotation * Math.PI / 180);
    cropCtx.scale(scale, scale);
    cropCtx.translate(-cropCanvas.width / 2, -cropCanvas.height / 2);
    cropCtx.drawImage(cropImage, 0, 0, cropCanvas.width, cropCanvas.height);
    
    // Reset transform for overlay
    cropCtx.restore();
    cropCtx.clearRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    
    // Draw the image in the crop area
    cropCtx.save();
    cropCtx.beginPath();
    cropCtx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    cropCtx.clip();
    cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
    cropCtx.rotate(rotation * Math.PI / 180);
    cropCtx.scale(scale, scale);
    cropCtx.translate(-cropCanvas.width / 2, -cropCanvas.height / 2);
    cropCtx.drawImage(cropImage, 0, 0, cropCanvas.width, cropCanvas.height);
    cropCtx.restore();
    
    drawCropBorder();
}

function applyCropChanges() {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    const angleRad = rotation * Math.PI / 180;
    const cosAngle = Math.abs(Math.cos(angleRad));
    const sinAngle = Math.abs(Math.sin(angleRad));
    
    const rotatedWidth = cropRect.width * cosAngle + cropRect.height * sinAngle;
    const rotatedHeight = cropRect.width * sinAngle + cropRect.height * cosAngle;
    
    tempCanvas.width = rotatedWidth;
    tempCanvas.height = rotatedHeight;
    
    tempCtx.save();
    tempCtx.translate(rotatedWidth / 2, rotatedHeight / 2);
    tempCtx.rotate(angleRad);
    tempCtx.translate(-cropCanvas.width / 2, -cropCanvas.height / 2);
    tempCtx.drawImage(cropImage, 0, 0, cropCanvas.width, cropCanvas.height);
    tempCtx.restore();
    
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');
    finalCanvas.width = cropRect.width;
    finalCanvas.height = cropRect.height;
    
    finalCtx.drawImage(tempCanvas, 
        (tempCanvas.width - cropRect.width) / 2,
        (tempCanvas.height - cropRect.height) / 2,
        cropRect.width, cropRect.height,
        0, 0, cropRect.width, cropRect.height
    );
    
    const croppedImageData = finalCanvas.toDataURL('image/png');
    img.src = croppedImageData;
    trueOriginalImage.src = croppedImageData;
    originalUploadedImage.src = croppedImageData;
    
    cropModal.style.display = 'none';
}

function cancelCropChanges() {
    cropModal.style.display = 'none';
    cropRect = { ...originalCropRect };
    rotation = originalRotation;
}

function drawCropBorder() {
    const borderWidth = 2;
    const handleSize = isDragging || isResizing ? 14 : 12;
    
    // Draw outer border with glow effect
    cropCtx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    cropCtx.shadowBlur = 3;
    cropCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    cropCtx.lineWidth = borderWidth + 2;
    cropCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    
    // Reset shadow for other elements
    cropCtx.shadowColor = 'transparent';
    cropCtx.shadowBlur = 0;
    
    // Draw inner border
    cropCtx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    cropCtx.lineWidth = borderWidth;
    cropCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
    
    // Draw enhanced grid lines
    cropCtx.strokeStyle = isDragging || isResizing ? 
        'rgba(255, 255, 255, 0.7)' : 'rgba(255, 255, 255, 0.5)';
    cropCtx.lineWidth = 1;
    
    // Vertical thirds with dashed lines
    cropCtx.setLineDash([4, 4]);
    for (let i = 1; i < 3; i++) {
        const x = cropRect.x + (cropRect.width * i) / 3;
        cropCtx.beginPath();
        cropCtx.moveTo(x, cropRect.y);
        cropCtx.lineTo(x, cropRect.y + cropRect.height);
        cropCtx.stroke();
    }
    
    // Horizontal thirds with dashed lines
    for (let i = 1; i < 3; i++) {
        const y = cropRect.y + (cropRect.height * i) / 3;
        cropCtx.beginPath();
        cropCtx.moveTo(cropRect.x, y);
        cropCtx.lineTo(cropRect.x + cropRect.width, y);
        cropCtx.stroke();
    }
    cropCtx.setLineDash([]);
    
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
    
    // Draw handles with shadow effect
    handles.forEach(handle => {
        // Draw handle shadow
        cropCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        cropCtx.fillRect(
            handle.x - handleSize/2 + 1,
            handle.y - handleSize/2 + 1,
            handleSize,
            handleSize
        );
        
        // Draw handle
        cropCtx.fillStyle = 'white';
        cropCtx.fillRect(
            handle.x - handleSize/2,
            handle.y - handleSize/2,
            handleSize,
            handleSize
        );
        
        // Draw handle border
        cropCtx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        cropCtx.lineWidth = 1;
        cropCtx.strokeRect(
            handle.x - handleSize/2,
            handle.y - handleSize/2,
            handleSize,
            handleSize
        );
    });
}

function getResizeHandle(x, y) {
    const handleSize = 12;
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
            scale = 1;
            drawCropOverlay();
            cropModal.style.display = 'block';
        };
    }
}
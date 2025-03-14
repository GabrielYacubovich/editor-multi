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

    setupCropEventListeners();
}

function setupCropEventListeners() {
    if (!cropCanvas) return;

    // Mouse events with passive listeners where appropriate
    cropCanvas.addEventListener('mousedown', startCropDrag);
    cropCanvas.addEventListener('mousemove', adjustCropDrag);
    cropCanvas.addEventListener('mouseup', stopCropDrag);
    cropCanvas.addEventListener('mouseleave', (e) => {
        if (isDragging) {
            stopCropDrag(e);
        }
    });

    // Touch events with proper passive configuration
    cropCanvas.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent default only for crop canvas
        const touch = e.touches[0];
        startCropDrag({
            clientX: touch.clientX,
            clientY: touch.clientY,
            isTouch: true,
            preventDefault: () => {}
        });
    }, { passive: false }); // Non-passive to allow preventDefault

    cropCanvas.addEventListener('touchmove', (e) => {
        e.preventDefault(); // Prevent default only for crop canvas
        const touch = e.touches[0];
        adjustCropDrag({
            clientX: touch.clientX,
            clientY: touch.clientY,
            isTouch: true,
            preventDefault: () => {}
        });
    }, { passive: false }); // Non-passive to allow preventDefault

    cropCanvas.addEventListener('touchend', (e) => {
        e.preventDefault(); // Prevent default only for crop canvas
        stopCropDrag(e);
    }, { passive: false }); // Non-passive to allow preventDefault

    setupCropControls();
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
            drawCropOverlay();
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
                    drawCropOverlay();
                }
            }
        });
    }

    // Button event listeners with proper touch handling
    const addButtonListener = (button, handler) => {
        if (!button) return;
        
        // Click event is passive by default
        button.addEventListener('click', (e) => {
            e.preventDefault();
            handler(e);
        });

        // Touch events with proper configuration
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
        rotation = 0;
        rotationInput.value = 0;
        rotationValue.textContent = '0°';
        cropRect = { ...originalCropRect };
        drawCropOverlay();
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

function adjustCropDrag(e) {
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
        
        if (lockAspectRatio) {
            const newAspectRatio = newRect.width / newRect.height;
            if (Math.abs(newAspectRatio - aspectRatio) > 0.01) {
                if (newAspectRatio > aspectRatio) {
                    newRect.width = newRect.height * aspectRatio;
                } else {
                    newRect.height = newRect.width / aspectRatio;
                }
            }
        }
        
        cropRect = newRect;
        drawCropOverlay();
    }
}

function stopCropDrag(e) {
    isDragging = false;
    isResizing = false;
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
    cropCtx.drawImage(cropImage, -cropCanvas.width / 2, -cropCanvas.height / 2);
    
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
    cropCtx.drawImage(cropImage, -cropCanvas.width / 2, -cropCanvas.height / 2);
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
            drawCropOverlay();
            cropModal.style.display = 'block';
        };
    }
}
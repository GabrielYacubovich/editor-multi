import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage } from './imageProcessing.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const controls = document.querySelectorAll('.controls input');
const undoButton = document.getElementById('undo');
const redoButton = document.getElementById('redo');
const restoreButton = document.getElementById('restore');
const downloadButton = document.getElementById('download');
const cropImageButton = document.getElementById('crop-image-button');
const uploadNewPhotoButton = document.getElementById('upload-new-photo');
const toggleOriginalButton = document.getElementById('toggle-original');
const modal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const cropModal = document.getElementById('crop-modal');
const cropCanvas = document.getElementById('crop-canvas');
const cropCtx = cropCanvas.getContext('2d');
const previewModal = document.getElementById('preview-modal');
let img = new Image();
let originalImageData = null;
let noiseSeed = Math.random();
let fullResCanvas = document.createElement('canvas');
let fullResCtx = fullResCanvas.getContext('2d', { willReadFrequently: true });
let isShowingOriginal = false;
let originalFullResImage = new Image();
let originalUploadedImage = new Image();
let trueOriginalImage = new Image();
let initialCropRect = { x: 0, y: 0, width: 0, height: 0 }; 
let initialRotation = 0; 
let originalCropImage = new Image(); 
let settings = {
    brightness: 100,
    contrast: 100,
    grayscale: 0,
    vibrance: 100,
    highlights: 100,
    shadows: 100,
    noise: 0,
    exposure: 100,
    temperature: 100,
    saturation: 100,
    'glitch-chromatic': 0,
    'glitch-rgb-split': 0,
    'glitch-chromatic-vertical': 0,
    'glitch-chromatic-diagonal': 0,
    'glitch-pixel-shuffle': 0,
    'glitch-wave': 0,
    'kaleidoscope-segments': 0,
    'kaleidoscope-offset': 0,
    'vortex-twist': 0,
    'edge-detect': 0
};
let history = [{ filters: { ...settings }, imageData: null }];
let redoHistory = [];
let lastAppliedEffect = null;
let originalWidth, originalHeight, previewWidth, previewHeight;
let cropImage = new Image();
let cropRect = { x: 0, y: 0, width: 0, height: 0 };let isDragging = false;
let startX, startY;
let lockAspectRatio = false;
let aspectRatio = 1;
let rotation = 0;



let isTriggering = false;
let fileInput = null; 

function triggerFileUpload() {
    isTriggering = true;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
        trueOriginalImage.src = event.target.result;
        originalUploadedImage.src = event.target.result;
        showCropModal(event.target.result);
        cleanupFileInput();
    };
    reader.onerror = cleanupFileInput;
    reader.readAsDataURL(file);
});
    setTimeout(() => {
        fileInput.click();
    }, 0);
    setTimeout(() => {
        if (isTriggering && fileInput && document.body.contains(fileInput)) {
            cleanupFileInput();
        }
    }, 1000); 
}
function cleanupFileInput() {
    if (fileInput && document.body.contains(fileInput)) {
        document.body.removeChild(fileInput);
    }
    fileInput = null;
    isTriggering = false;
}

document.addEventListener('DOMContentLoaded', () => {
    setupModal(document.getElementById('image-modal'), false);
    setupModal(document.getElementById('crop-modal'), false);
    setupModal(document.getElementById('preview-modal'), true); 
});
function showCropModal(dataURL = null) {
    if (!dataURL) {
        // Existing logic for re-showing crop modal with current image
        cropModal.style.display = 'block';
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = trueOriginalImage.width;
        tempCanvas.height = trueOriginalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(trueOriginalImage, 0, 0);
        applyBasicFiltersManually(tempCtx, tempCanvas, settings);
        applyAdvancedFilters(tempCtx, tempCanvas, noiseSeed, 1)
            .then(() => applyGlitchEffects(tempCtx, tempCanvas, noiseSeed, 1))
            .then(() => applyComplexFilters(tempCtx, tempCanvas, noiseSeed, 1))
            .then(() => {
                cropImage.src = tempCanvas.toDataURL('image/png');
                cropImage.onload = () => {
                    rotation = initialRotation;
                    setupCropControls(null);
                    drawCropOverlay();
                };
            });
    } else {
        // New image uploaded
        originalUploadedImage.src = dataURL;
        cropImage.src = dataURL;
        rotation = 0;
        initialCropRect = { x: 0, y: 0, width: 0, height: 0 };
        initialRotation = 0;
        cropModal.style.display = 'block';
        cropImage.onload = () => {
            // Reset cropRect explicitly to full canvas size after sizing
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

            // Explicitly set cropRect to full canvas dimensions
            cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };

            setupCropControls(null);
            drawCropOverlay();
        };
    }
    if (cropImage.complete && cropImage.naturalWidth !== 0) {
        cropImage.onload();
    }
}
uploadNewPhotoButton.addEventListener('click', (e) => {
    e.preventDefault();
    triggerFileUpload();
});
uploadNewPhotoButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    triggerFileUpload();
});
function updateControlIndicators() {
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



function seededRandom(seed) {
    let x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

toggleOriginalButton.addEventListener('click', () => {
    if (!originalImageData) return;
    isShowingOriginal = !isShowingOriginal;
    toggleOriginalButton.textContent = isShowingOriginal ? 'Editada' : 'Original';
    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, false, saveImageState
    );
});

toggleOriginalButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!originalImageData) return;
    isShowingOriginal = !isShowingOriginal;
    toggleOriginalButton.textContent = isShowingOriginal ? 'Editada' : 'Original';
    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, false
    );
});
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
            <button id="crop-upload">Subir Imagen</button> <!-- New Upload Button -->
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
        drawCropOverlay(); // This will now resize the canvas
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
    restoreBtn.addEventListener('click', () => {
        rotation = 0;
        rotationInput.value = 0;
        rotationValue.textContent = '0°';
        if (!trueOriginalImage.src || trueOriginalImage.width === 0) {
            return;
        }
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
        cropCanvas.width = width;
        cropCanvas.height = height;
        cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = trueOriginalImage.width;
        tempCanvas.height = trueOriginalImage.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(trueOriginalImage, 0, 0);
        applyBasicFiltersManually(tempCtx, tempCanvas, settings);
        applyAdvancedFilters(tempCtx, tempCanvas, noiseSeed, 1)
            .then(() => applyGlitchEffects(tempCtx, tempCanvas, noiseSeed, 1))
            .then(() => applyComplexFilters(tempCtx, tempCanvas, noiseSeed, 1))
            .then(() => {
                cropImage.src = tempCanvas.toDataURL('image/png');
                cropImage.onload = () => drawCropOverlay();
                if (cropImage.complete && cropImage.naturalWidth !== 0) cropImage.onload();
            })
    });

    confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal(cropModal);
        let origWidth = cropImage.width;
        let origHeight = cropImage.height;
        if (origWidth === 0 || origHeight === 0) {
            closeModal(cropModal);
            return;
        }
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
        initialCropRect = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
        initialRotation = rotation;
        const loadImage = new Promise((resolve) => {
            if (img.complete && img.naturalWidth !== 0) resolve();
            else {
                img.onload = resolve;
                img.onerror = () => resolve();
            }
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
            redrawImage(
                ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                isShowingOriginal, trueOriginalImage, modal, modalImage, true
            )
                .then(() => {
                    originalFullResImage.src = fullResCanvas.toDataURL('image/png');
                })
                .finally(() => {
                    closeModal(cropModal);
                    uploadNewPhotoButton.style.display = 'block';
                });
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
        uploadNewPhotoButton.style.display = 'block';
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
    });
    lockCheckbox.addEventListener('change', (e) => {
        lockAspectRatio = e.target.checked;
        aspectRatio = cropRect.width / cropRect.height;
    });
}
const stopDragHandler = () => stopCropDrag();
    document.addEventListener('mouseup', stopDragHandler);
    document.addEventListener('touchend', stopDragHandler);
        
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
    
        // Resize canvas only if dimensions changed significantly
        const prevWidth = cropCanvas.width;
        const prevHeight = cropCanvas.height;
        cropCanvas.width = Math.round(fullRotatedWidth * scale);
        cropCanvas.height = Math.round(fullRotatedHeight * scale);
        cropCanvas.dataset.scaleFactor = scale;
    
        // Adjust cropRect only if canvas size changed and cropRect isn’t already set
        if ((prevWidth !== cropCanvas.width || prevHeight !== cropCanvas.height) && 
            (cropRect.width === 0 || cropRect.height === 0)) {
            cropRect = { x: 0, y: 0, width: cropCanvas.width, height: cropCanvas.height };
        }
    
        // Draw the blurred background
        cropCtx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
        cropCtx.save();
        cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
        cropCtx.scale(scale, scale);
        cropCtx.rotate(angleRad);
        cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
        cropCtx.filter = 'blur(5px)';
        cropCtx.drawImage(cropImage, 0, 0, originalWidth, originalHeight);
        cropCtx.restore();
    
        // Draw the unblurred cropped area
        cropCtx.save();
        cropCtx.beginPath();
        cropCtx.rect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
        cropCtx.clip();
        cropCtx.translate(cropCanvas.width / 2, cropCanvas.height / 2);
        cropCtx.scale(scale, scale);
        cropCtx.rotate(angleRad);
        cropCtx.translate(-originalWidth / 2, -originalHeight / 2);
        cropCtx.filter = 'none'; // Ensure no blur inside crop area
        cropCtx.drawImage(cropImage, 0, 0, originalWidth, originalHeight);
        cropCtx.restore();
    
        // Draw crop rectangle outline
        cropCtx.strokeStyle = '#800000';
        cropCtx.lineWidth = 3;
        cropCtx.setLineDash([5, 5]);
        cropCtx.strokeRect(cropRect.x, cropRect.y, cropRect.width, cropRect.height);
        cropCtx.setLineDash([]);
    
        // Clamp cropRect to canvas bounds (only during interaction)
        if (isDragging) {
            cropRect.x = clamp(cropRect.x, 0, cropCanvas.width - cropRect.width);
            cropRect.y = clamp(cropRect.y, 0, cropCanvas.height - cropRect.height);
            cropRect.width = clamp(cropRect.width, 10, cropCanvas.width - cropRect.x);
            cropRect.height = clamp(cropRect.height, 10, cropCanvas.height - cropRect.y);
        }
    }
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
    let cursorSet = false;

    if (nearCorner(x, y, cropRect.x, cropRect.y, resizeMargin)) {
        cropCanvas.style.cursor = 'nwse-resize';
        cursorSet = true;
    } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y, resizeMargin)) {
        cropCanvas.style.cursor = 'nesw-resize';
        cursorSet = true;
    } else if (nearCorner(x, y, cropRect.x, cropRect.y + cropRect.height, resizeMargin)) {
        cropCanvas.style.cursor = 'nesw-resize';
        cursorSet = true;
    } else if (nearCorner(x, y, cropRect.x + cropRect.width, cropRect.y + cropRect.height, resizeMargin)) {
        cropCanvas.style.cursor = 'nwse-resize';
        cursorSet = true;
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'left', resizeMargin)) {
        cropCanvas.style.cursor = 'ew-resize';
        cursorSet = true;
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'right', resizeMargin)) {
        cropCanvas.style.cursor = 'ew-resize';
        cursorSet = true;
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'top', resizeMargin)) {
        cropCanvas.style.cursor = 'ns-resize';
        cursorSet = true;
    } else if (nearSide(x, y, cropRect.x, cropRect.y, cropRect.width, cropRect.height, 'bottom', resizeMargin)) {
        cropCanvas.style.cursor = 'ns-resize';
        cursorSet = true;
    } else if (insideCrop(x, y)) {
        cropCanvas.style.cursor = 'move';
        cursorSet = true;
    } else {
        cropCanvas.style.cursor = 'default';
    }
    console.log(`Mouse - X: ${x}, Y: ${y}, Cursor: ${cropCanvas.style.cursor}`); // Debug log
});

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
function startCropDrag(e) {
    e.preventDefault();
    const rect = cropCanvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    console.log(`Start Drag - X: ${x}, Y: ${y}, cropRect:`, cropRect); // Debug log
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
cropCanvas.addEventListener('mouseleave', (e) => {
    if (isDragging) {
        stopCropDrag(e);
    }
});
function adjustCropDrag(e) {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();
    
    const rect = cropCanvas.getBoundingClientRect();
    let x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
    let y = (e.clientY || (e.touches && e.touches[0].clientY)) - rect.top;
    x = clamp(x, 0, cropCanvas.width);
    y = clamp(y, 0, cropCanvas.height);
    console.log(`Adjust Drag - X: ${x}, Y: ${y}, isDragging: ${isDragging}`); // Debug log

    if (isDragging === 'move') {
        cropRect.x = clamp(x - startX, 0, cropCanvas.width - cropRect.width);
        cropRect.y = clamp(y - startY, 0, cropCanvas.height - cropRect.height);
    } else {
        resizeCrop(x, y);
    }
    drawCropOverlay();
}

function nearCorner(x, y, cornerX, cornerY, margin) {
    return Math.abs(x - cornerX) < margin && Math.abs(y - cornerY) < margin;
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

canvas.addEventListener('click', (e) => {
    const isNotIOS = !/iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isNotIOS) {
        try {
            const controlsContainer = document.querySelector('.controls');
            const modalControls = document.getElementById('modal-controls');
            if (!controlsContainer || !modalControls) {
                return;
            }
            const clonedControls = controlsContainer.cloneNode(true);
            modalControls.innerHTML = '';
            modalControls.appendChild(clonedControls);
            modalImage.src = canvas.toDataURL('image/png');
            const modalInputs = modalControls.querySelectorAll('input[type="range"]');
            modalInputs.forEach(input => {
                input.addEventListener('input', debounce((e) => {
                    const id = e.target.id;
                    settings[id] = parseInt(e.target.value);
                    updateControlIndicators();
                    redrawImage(true);
                }, 300));
            });
            modal.style.display = 'block';
        } catch (error) {
            console.error("Error opening modal:", error);
        }
    } else {
    }
});
canvas.addEventListener('touchend', (e) => {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        e.preventDefault(); 
    }
});
img.onload = function () {
    originalWidth = img.width;
    originalHeight = img.height;
    fullResCanvas.width = originalWidth;
    fullResCanvas.height = originalHeight;
    fullResCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
  
    const maxDisplayWidth = Math.min(1920, window.innerWidth - 20); 
    const maxDisplayHeight = window.innerHeight - (window.innerWidth <= 768 ? 0.4 * window.innerHeight + 20 : 250); 
    const minPreviewDimension = 400; 
    const ratio = originalWidth / originalHeight;
  
    if (window.innerWidth <= 768) {
      previewHeight = Math.min(originalHeight, maxDisplayHeight);
      previewWidth = previewHeight * ratio;
      if (previewWidth > maxDisplayWidth) {
        previewWidth = maxDisplayWidth;
        previewHeight = previewWidth / ratio;
      }
    } else {
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
    }
  
    canvas.width = Math.round(previewWidth);
    canvas.height = Math.round(previewHeight);
    fullResCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
    const initialImageData = fullResCtx.getImageData(0, 0, originalWidth, originalHeight);
    fullResCtx.putImageData(initialImageData, 0, 0);
    ctx.drawImage(fullResCanvas, 0, 0, previewWidth, previewHeight);
  
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = previewWidth;
    tempCanvas.height = previewHeight;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0, previewWidth, previewHeight);
    originalImageData = tempCtx.getImageData(0, 0, previewWidth, previewHeight);    
    if (!originalUploadedImage.src || originalUploadedImage.src === "") {
        originalUploadedImage.src = img.src;
    } else {
    }
    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
    ).then(() => {
        originalFullResImage.src = fullResCanvas.toDataURL('image/png');
    }).catch(err => {
        console.error("Failed to redraw image on load:", err);
    });
    uploadNewPhotoButton.style.display = 'block';
};
let filterWorker;
if (window.Worker) {
    filterWorker = new Worker(URL.createObjectURL(new Blob([`
        self.onmessage = function(e) {
            const { imageData, noiseSeed, scaleFactor, settings } = e.data;
            const data = imageData.data;
            const vibrance = (settings.vibrance - 100) / 100;
            const highlights = settings.highlights / 100;
            const shadows = settings.shadows / 100;
            const noise = settings.noise;
            for (let i = 0; i < data.length; i += 4) {
                if (settings.temperature > 100) {
                    data[i] *= (settings.temperature / 100);
                    data[i + 2] *= (200 - settings.temperature) / 100;
                } else {
                    data[i] *= settings.temperature / 100;
                    data[i + 2] *= (200 - settings.temperature) / 100;
                }
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];
                let avg = (r + g + b) / 3;
                data[i] += (r - avg) * vibrance;
                data[i + 1] += (g - avg) * vibrance;
                data[i + 2] += (b - avg) * vibrance;
                if (r > 128) data[i] *= highlights;
                else data[i] *= shadows;
                if (g > 128) data[i + 1] *= highlights;
                else data[i + 1] *= shadows;
                if (b > 128) data[i + 2] *= highlights;
                else data[i + 2] *= shadows;
                let randomValue = Math.sin(noiseSeed + i * 12.9898) * 43758.5453;
                randomValue = randomValue - Math.floor(randomValue);
                let noiseAmount = (randomValue - 0.5) * noise * scaleFactor;
                data[i] = Math.max(0, Math.min(255, data[i] + noiseAmount));
                data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noiseAmount));
                data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noiseAmount));
            }
            self.postMessage({ imageData });
        };
    `], { type: 'application/javascript' })));
}

downloadButton.addEventListener('click', () => {
    const isEdited = Object.values(settings).some(value => value !== 100 && value !== 0);
    const popup = document.createElement('div');
    popup.style.position = 'fixed';
    popup.style.top = '50%';
    popup.style.left = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.backgroundColor = '#fff';
    popup.style.padding = '20px';
    popup.style.border = '1px solid #ccc';
    popup.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
    popup.style.zIndex = '1002';
    popup.style.width = '350px';
    popup.innerHTML = `
        <h3>Guardar Imagen</h3>
        <label>Nombre del archivo:</label><br>
        <input type="text" id="save-file-name" value="nueva-imagen" style="width: 100%; margin-bottom: 10px; padding: 5px; box-sizing: border-box;"><br>
        <label>Formato:</label><br>
        <select id="save-file-type" style="width: 100%; margin-bottom: 10px; padding: 5px;">
            <option value="image/png" selected>PNG</option>
            <option value="image/jpeg">JPEG</option>
            <option value="image/webp">WebP</option>
        </select><br>
        <label>Calidad de resolución:</label><br>
        <select id="save-resolution-scale" style="width: 100%; margin-bottom: 10px; padding: 5px;">
            <option value="10">Lowest (10%)</option>
            <option value="20">Very Low (20%)</option>
            <option value="40">Low (40%)</option>
            <option value="60">Medium (60%)</option>
            <option value="80">High (80%)</option>
            <option value="100" selected>Full (100%)</option>
        </select><br>
        <div id="file-info" style="margin-bottom: 15px;">
            <p>Dimensiones: <span id="dimensions"></span> px</p>
            <p>Tamaño estimado: <span id="file-size"></span> KB</p>
        </div>
        <div style="display: flex; justify-content: space-between; gap: 10px;">
            <button id="save-confirm" style="background-color: #4CAF50; color: white; padding: 10px 20px; border: none; cursor: pointer; flex: 1;">Guardar</button>
            <button id="save-cancel" style="background-color: #f44336; color: white; padding: 10px 20px; border: none; cursor: pointer; flex: 1;">Cancelar</button>
        </div>
    `;
    document.body.appendChild(popup);
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '1001';
    document.body.appendChild(overlay);

    const resolutionSelect = document.getElementById('save-resolution-scale');
    const fileTypeSelect = document.getElementById('save-file-type');
    const dimensionsSpan = document.getElementById('dimensions');
    const fileSizeSpan = document.getElementById('file-size');
    const originalDataURL = img.src;

    function updateFileInfo() {
        const scale = parseFloat(resolutionSelect.value) / 100;
        const width = Math.round((originalWidth || 1) * scale);
        const height = Math.round((originalHeight || 1) * scale);
        dimensionsSpan.textContent = `${width} x ${height}`;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        if (originalWidth && originalHeight) {
        tempCtx.drawImage(fullResCanvas, 0, 0, width, height);
    } else {
        tempCtx.fillStyle = '#000';
      tempCtx.fillRect(0, 0, width, height);
    }
        const fileType = fileTypeSelect.value;
        const quality = fileType === 'image/png' ? undefined : 1.0;
        tempCanvas.toBlob((blob) => {
            if (blob) {
                const sizeKB = Math.round(blob.size / 1024);
                fileSizeSpan.textContent = `${sizeKB}`;
            } else {
                fileSizeSpan.textContent = 'Calculando...';
            }
        }, fileType, quality);
    }
    updateFileInfo();
    resolutionSelect.addEventListener('change', updateFileInfo);
    fileTypeSelect.addEventListener('change', updateFileInfo);

    const saveConfirmBtn = document.getElementById('save-confirm');
    saveConfirmBtn.addEventListener('click', () => {
        const fileName = document.getElementById('save-file-name').value.trim() || 'nueva-imagen';
        const fileType = fileTypeSelect.value;
        const scale = parseFloat(resolutionSelect.value) / 100;
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '');
        const extension = fileType.split('/')[1];
        showLoadingIndicator(true);

        if (!isEdited && scale === 1.0) {
            const link = document.createElement('a');
            link.download = `${sanitizedFileName}.${extension}`;
            link.href = originalDataURL;
            link.click();
            showLoadingIndicator(false);
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
            return;
        }

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = Math.round(originalWidth * scale);
        tempCanvas.height = Math.round(originalHeight * scale);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        // Pass all required parameters to redrawImage
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, false
        ).then(() => {
            tempCtx.drawImage(fullResCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
            const quality = fileType === 'image/png' ? undefined : 1.0;
            tempCanvas.toBlob((blob) => {
                const link = document.createElement('a');
                link.download = `${sanitizedFileName}-${Math.round(scale * 100)}%.${extension}`;
                link.href = URL.createObjectURL(blob);
                link.click();
                URL.revokeObjectURL(link.href);
                showLoadingIndicator(false);
                document.body.removeChild(popup);
                document.body.removeChild(overlay);
            }, fileType, quality);
        }).catch(error => {
            console.error("Download failed:", error);
            showLoadingIndicator(false);
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
        });
    });
    saveConfirmBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        saveConfirmBtn.click();
    });

    saveCancelBtn.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });
    saveCancelBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });
});
let isRedrawing = false;
function saveImageState(isOriginal = false) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (isOriginal) {
        history = [{ filters: { ...settings }, imageData }];
        redoHistory = [];
        lastAppliedEffect = null;
    } else {
        const lastState = history[history.length - 1];
        if (JSON.stringify(lastState.filters) !== JSON.stringify(settings)) {
            history.push({ filters: { ...settings }, imageData });
            if (history.length > 50) history.shift();
            redoHistory = [];
        }
    }
}
function handleUndo(e) {
    e.preventDefault();
    if (history.length > 1) {
        const currentState = history.pop();
        redoHistory.push(currentState);
        const previousState = history[history.length - 1];
        Object.assign(settings, previousState.filters);
        document.querySelectorAll('.controls input').forEach(input => {
            input.value = settings[input.id];
        });
        updateControlIndicators();
        redrawImage(false);
    } else {
    }
}
function handleRedo(e) {
    e.preventDefault();
    if (redoHistory.length > 0) {
        const nextState = redoHistory.pop();
        history.push(nextState);
        Object.assign(settings, nextState.filters);
        document.querySelectorAll('.controls input').forEach(input => {
            input.value = settings[input.id];
        });
        updateControlIndicators();
        redrawImage(false);
    }
}
const debouncedUndo = debounce(handleUndo, 200);
const debouncedRedo = debounce(handleRedo, 200);
function addButtonListeners(button, handler) {
    button.setAttribute('role', 'button');
    button.addEventListener('click', handler);
    button.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
    });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
    });
    button.addEventListener('touchmove', (e) => e.preventDefault());
}
addButtonListeners(undoButton, debouncedUndo);
addButtonListeners(redoButton, debouncedRedo);
cropImageButton.addEventListener('click', (e) => {
    e.preventDefault();
    if (!img.src || img.src === "") {
        return;
    }
    showCropModal();
});
cropImageButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!img.src || img.src === "") {
        return;
    }
    showCropModal();
});
restoreButton.addEventListener('click', () => {
    settings = {
        brightness: 100,
        contrast: 100,
        grayscale: 0,
        vibrance: 100,
        highlights: 100,
        shadows: 100,
        noise: 0,
        exposure: 100,
        temperature: 100,
        saturation: 100,
        'glitch-chromatic': 0,
        'glitch-rgb-split': 0,
        'glitch-chromatic-vertical': 0,
        'glitch-chromatic-diagonal': 0,
        'glitch-pixel-shuffle': 0,
        'glitch-wave': 0,
        'kaleidoscope-segments': 0,
        'kaleidoscope-offset': 0,
        'vortex-twist': 0,
        'edge-detect': 0
    };
    document.querySelectorAll('.controls input').forEach(input => {
        input.value = settings[input.id];
    });
    updateControlIndicators();
    fullResCanvas.width = originalWidth;
    fullResCanvas.height = originalHeight;
    fullResCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
    if (img.complete && img.naturalWidth !== 0) {
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
        ).then(() => {
            originalFullResImage.src = fullResCanvas.toDataURL('image/png');
            ctx.drawImage(fullResCanvas, 0, 0, canvas.width, canvas.height);
        });
    }
});
if (img.complete && img.naturalWidth !== 0) {
    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
    )
        .then(() => {
            originalFullResImage.src = fullResCanvas.toDataURL('image/png');
        })
        .finally(() => {
            closeModal(cropModal);
            uploadNewPhotoButton.style.display = 'block';
        });
} else {
    img.onload = () => {
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
        )
            .then(() => {
                originalFullResImage.src = fullResCanvas.toDataURL('image/png');
            })
            .finally(() => {
                closeModal(cropModal);
                uploadNewPhotoButton.style.display = 'block';
            });
        }
    }
    if (img.complete && img.naturalWidth !== 0) {
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
        )
            .then(() => {
                originalFullResImage.src = fullResCanvas.toDataURL('image/png');
            })
            .finally(() => {
                closeModal(cropModal);
                uploadNewPhotoButton.style.display = 'block';
            });
    }
    let isDraggingSlider = false;
    let tempSettings = {};
    controls.forEach(control => {
        control.addEventListener('mousedown', () => {
            isDraggingSlider = true;
            tempSettings = { ...settings };
        });
        control.addEventListener('touchstart', () => {
            isDraggingSlider = true;
            tempSettings = { ...settings };
        });
        control.addEventListener('input', (e) => {
            const id = e.target.id;
            const newValue = parseInt(e.target.value);
            if (isDraggingSlider) {
                tempSettings[id] = newValue;
            } else {
                if (settings[id] !== newValue) {
                    settings[id] = newValue;
                    updateControlIndicators();
                    if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
                        lastAppliedEffect = id;
                    }
                    saveImageState();
                }
            }
            updateControlIndicators();
        });
        control.addEventListener('mouseup', () => {
            if (isDraggingSlider) {
                isDraggingSlider = false;
                const id = control.id;
                if (settings[id] !== tempSettings[id]) {
                    settings[id] = tempSettings[id];
                    updateControlIndicators();
                    if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
                        lastAppliedEffect = id;
                    }
                    if (img.complete && img.naturalWidth !== 0) {
                        redrawImage(
                            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                            isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
                        );
                    }
                }
            }
        });
        control.addEventListener('touchend', () => {
            if (isDraggingSlider) {
                isDraggingSlider = false;
                const id = control.id;
                if (settings[id] !== tempSettings[id]) {
                    settings[id] = tempSettings[id];
                    updateControlIndicators();
                    if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
                        lastAppliedEffect = id;
                    }
                    if (img.complete && img.naturalWidth !== 0) {
                        redrawImage(
                            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                            isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
                        );
                    }
                }
            }
        });
        control.addEventListener('change', (e) => {
            if (!isDraggingSlider) {
                const id = e.target.id;
                const newValue = parseInt(e.target.value);
                if (settings[id] !== newValue) {
                    settings[id] = newValue;
                    updateControlIndicators();
                    if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
                        lastAppliedEffect = id;
                    }
                    if (img.complete && img.naturalWidth !== 0) {
                        redrawImage(
                            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                            isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
                        );
                    }
                }
            }
        });
    });
    document.addEventListener('DOMContentLoaded', () => {
        isTriggering = false;
        cropRect = { x: 0, y: 0, width: 0, height: 0 };
        cleanupFileInput();
        setupModal(document.getElementById('crop-modal'), false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modals = [modal, cropModal, previewModal];
            const openModal = modals.find(m => m.style.display === 'block');
            if (openModal) {
                closeModal(openModal);
            }
            const downloadPopup = document.querySelector('div[style*="position: fixed"][style*="z-index: 1002"]');
            const downloadOverlay = document.querySelector('div[style*="position: fixed"][style*="z-index: 1001"]');
            if (downloadPopup && downloadOverlay) {
                document.body.removeChild(downloadPopup);
                document.body.removeChild(downloadOverlay);
            }
            if (isTriggering) {
                cleanupFileInput();
            }
        } else if (e.ctrlKey && e.key === 'z') {
            debouncedUndo(e);
        } else if (e.ctrlKey && e.key === 'y') {
            debouncedRedo(e);
        }
    });
    function initialize() {
        updateControlIndicators();
    }
    initialize();
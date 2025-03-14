// script.js
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const fullResCanvas = document.createElement('canvas');
const fullResCtx = fullResCanvas.getContext('2d', { willReadFrequently: true });
const controls = document.querySelectorAll('.controls input');
const undoButton = document.getElementById('undo-button');
const redoButton = document.getElementById('redo-button');
const restoreButton = document.getElementById('restore');
const toggleOriginalButton = document.getElementById('toggle-original');
const uploadNewPhotoButton = document.getElementById('upload-new-photo');
const cropImageButton = document.getElementById('crop-image-button');
const modal = document.getElementById('image-modal');
const modalImage = document.getElementById('modal-image');
const previewModal = document.getElementById('preview-modal');
const downloadButton = document.getElementById('download');

import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage } from './imageProcessing.js';
import { initializeCropHandler, showCropModal, setTriggerFileUpload } from './cropHandler.js';

let img = new Image();
let originalImageData = null;
let noiseSeed = Math.random();
let isShowingOriginal = false;
let originalFullResImage = new Image();
let originalUploadedImage = new Image();
let trueOriginalImage = new Image();
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
let imageStates = [];
let currentStateIndex = -1;
let lastAppliedEffect = null;
let originalWidth, originalHeight, previewWidth, previewHeight;

let isTriggering = false;
let fileInput = null;

let cropImage = new Image();
let cropCanvas, cropCtx, cropModal;
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

export let redrawWorker;
if (window.Worker) {
    redrawWorker = new Worker(URL.createObjectURL(new Blob([`
        // Inline functions from imageProcessing.js
        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

        function applyBasicFiltersManually(ctx, canvas, settings) {
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const brightnessFactor = (settings.brightness - 100) / 100 + 1;
            const exposureFactor = (settings.exposure - 100) / 100 + 1;
            const contrastFactor = (settings.contrast - 100) / 100 + 1;
            const grayscale = settings.grayscale / 100;
            const saturationFactor = (settings.saturation - 100) / 100 + 1;
            const temperatureFactor = (settings.temperature - 100) / 100;

            for (let i = 0; i < data.length; i += 4) {
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];

                r *= brightnessFactor * exposureFactor;
                g *= brightnessFactor * exposureFactor;
                b *= brightnessFactor * exposureFactor;

                r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
                g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
                b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;

                if (grayscale > 0) {
                    const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                    r = r * (1 - grayscale) + gray * grayscale;
                    g = g * (1 - grayscale) + gray * grayscale;
                    b = b * (1 - grayscale) + gray * grayscale;
                }

                r = clamp(r, 0, 255);
                g = clamp(g, 0, 255);
                b = clamp(b, 0, 255);

                if (saturationFactor !== 1) {
                    const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
                    r = gray + (r - gray) * saturationFactor;
                    g = gray + (g - gray) * saturationFactor;
                    b = gray + (b - gray) * saturationFactor;
                }

                if (temperatureFactor !== 0) {
                    if (temperatureFactor > 0) {
                        r += temperatureFactor * 50;
                        b -= temperatureFactor * 50;
                    } else {
                        r -= Math.abs(temperatureFactor) * 50;
                        b += Math.abs(temperatureFactor) * 50;
                    }
                }

                data[i] = clamp(r, 0, 255);
                data[i + 1] = clamp(g, 0, 255);
                data[i + 2] = clamp(b, 0, 255);
            }
            ctx.putImageData(imageData, 0, 0);
        }

        async function applyAdvancedFilters(ctx, canvas, settings, noiseSeed, scaleFactor) {
            let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const vibrance = (settings.vibrance - 100) / 100;
            const highlights = settings.highlights / 100;
            const shadows = settings.shadows / 100;
            const noise = settings.noise;

            for (let i = 0; i < data.length; i += 4) {
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];
                const avg = (r + g + b) / 3;

                r += (r - avg) * vibrance;
                g += (g - avg) * vibrance;
                b += (b - avg) * vibrance;

                if (r > 128) r *= highlights;
                else r *= shadows;
                if (g > 128) g *= highlights;
                else g *= shadows;
                if (b > 128) b *= highlights;
                else b *= shadows;

                if (noise > 0) {
                    const randomValue = Math.sin(noiseSeed + i * 12.9898) * 43758.5453;
                    const noiseAmount = (randomValue - Math.floor(randomValue) - 0.5) * noise * scaleFactor;
                    r += noiseAmount;
                    g += noiseAmount;
                    b += noiseAmount;
                }

                data[i] = clamp(r, 0, 255);
                data[i + 1] = clamp(g, 0, 255);
                data[i + 2] = clamp(b, 0, 255);
            }

            ctx.putImageData(imageData, 0, 0);
        }

        async function applyGlitchEffects(ctx, canvas, settings, noiseSeed, scaleFactor) {
            const width = canvas.width;
            const height = canvas.height;
            let imageData = ctx.getImageData(0, 0, width, height);
            let data = imageData.data;
            const previewMinDimension = Math.min(width, height);
            let randomSeed = noiseSeed;

            function seededRandom() {
                let x = Math.sin(randomSeed++) * 10000;
                return x - Math.floor(x);
            }

            if (settings['glitch-chromatic'] > 0) {
                const intensity = settings['glitch-chromatic'] / 100;
                const maxShift = clamp(50 * intensity * (width / previewMinDimension), 0, Math.min(width, height) / 8);
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const rShiftX = clamp(x - Math.round(maxShift), 0, width - 1);
                        const gShiftX = clamp(x - Math.round(maxShift * 0.5), 0, width - 1);
                        const bShiftX = clamp(x + Math.round(maxShift), 0, width - 1);
                        const rIdx = (y * width + rShiftX) * 4;
                        const gIdx = (y * width + gShiftX) * 4;
                        const bIdx = (y * width + bShiftX) * 4;
                        data[idx] = tempData[rIdx];
                        data[idx + 1] = tempData[gIdx + 1];
                        data[idx + 2] = tempData[bIdx + 2];
                        data[idx + 3] = tempData[idx + 3];
                    }
                }
            }

            // Add other glitch effects as needed...

            ctx.putImageData(imageData, 0, 0);
        }

        async function applyComplexFilters(ctx, canvas, settings, noiseSeed, scaleFactor) {
            const width = canvas.width;
            const height = canvas.height;
            let imageData = ctx.getImageData(0, 0, width, height);
            let data = imageData.data;

            // Add complex filters as needed...

            ctx.putImageData(imageData, 0, 0);
        }

        self.onmessage = async (e) => {
            const { imgData, settings, noiseSeed, width, height } = e.data;
            const offscreenCanvas = new OffscreenCanvas(width, height);
            const ctx = offscreenCanvas.getContext('2d');
            ctx.putImageData(imgData, 0, 0);
            applyBasicFiltersManually(ctx, offscreenCanvas, settings);
            await applyAdvancedFilters(ctx, offscreenCanvas, settings, noiseSeed, 1);
            await applyGlitchEffects(ctx, offscreenCanvas, settings, noiseSeed, 1);
            await applyComplexFilters(ctx, offscreenCanvas, settings, noiseSeed, 1);
            const resultData = ctx.getImageData(0, 0, width, height);
            self.postMessage({ imageData: resultData });
        };
    `], { type: 'application/javascript' })));

    redrawWorker.onmessage = function(e) {
        const { imageData } = e.data;
        ctx.putImageData(imageData, 0, 0);
        fullResCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(fullResCanvas, 0, 0, canvas.width, canvas.height);
        originalFullResImage.src = fullResCanvas.toDataURL('image/png');
        canvas.style.display = 'block';
        showLoadingIndicator(false);
    };
}

function triggerFileUpload() {
    if (isTriggering) return;
    isTriggering = true;

    cleanupFileInput();
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(event) {
                img = new Image();
                img.onload = function() {
                    originalWidth = img.naturalWidth;
                    originalHeight = img.naturalHeight;
                    
                    // Set up preview dimensions
                    const maxPreviewDimension = 800;
                    const aspectRatio = originalWidth / originalHeight;
                    if (aspectRatio > 1) {
                        previewWidth = Math.min(maxPreviewDimension, originalWidth);
                        previewHeight = previewWidth / aspectRatio;
                    } else {
                        previewHeight = Math.min(maxPreviewDimension, originalHeight);
                        previewWidth = previewHeight * aspectRatio;
                    }

                    canvas.width = previewWidth;
                    canvas.height = previewHeight;
                    fullResCanvas.width = originalWidth;
                    fullResCanvas.height = originalHeight;

                    // Draw image at both resolutions
                    ctx.drawImage(img, 0, 0, previewWidth, previewHeight);
                    fullResCtx.drawImage(img, 0, 0, originalWidth, originalHeight);

                    // Store original images
                    trueOriginalImage.src = event.target.result;
                    originalUploadedImage.src = event.target.result;
                    originalFullResImage.src = event.target.result;

                    // Save initial state and show crop modal
                    originalImageData = ctx.getImageData(0, 0, previewWidth, previewHeight);
                    saveImageState();
                    showCropModal(img);
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
        cleanupFileInput();
    });

    fileInput.click();
    setTimeout(() => {
        isTriggering = false;
    }, 1000);
}

function cleanupFileInput() {
    if (fileInput && document.body.contains(fileInput)) {
        document.body.removeChild(fileInput);
    }
    fileInput = null;
}

document.addEventListener('DOMContentLoaded', () => {
    cropCanvas = document.getElementById('crop-canvas');
    cropCtx = cropCanvas.getContext('2d');
    cropModal = document.getElementById('crop-modal');

    initializeCropHandler({
        cropModal, cropCanvas, cropCtx, canvas, ctx, fullResCanvas, fullResCtx,
        img, trueOriginalImage, originalUploadedImage, originalFullResImage,
        modal, modalImage, settings, noiseSeed, isShowingOriginal,
        originalWidth, originalHeight, previewWidth, previewHeight,
        uploadNewPhotoButton, saveImageState, originalImageData,
        rotation, cropRect, originalCropRect, initialCropRect,
        originalRotation, initialRotation, isDragging,
        dragStartX, dragStartY, dragStartCropRect,
        isResizing, resizeHandle, cropImage
    });

    // Set up the triggerFileUpload function
    setTriggerFileUpload(triggerFileUpload);

    // Add event listeners for upload and crop buttons
    if (uploadNewPhotoButton) {
        uploadNewPhotoButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (!isTriggering) {
                triggerFileUpload();
            }
        });
    }

    if (cropImageButton) {
        cropImageButton.addEventListener('click', (e) => {
            e.preventDefault();
            showCropModal(img);
        });
    }
});

controls.forEach(control => {
    control.addEventListener('input', (e) => {
        const id = e.target.id;
        const newValue = parseInt(e.target.value);
        settings[id] = newValue;
        updateControlIndicators();
        if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
            lastAppliedEffect = id;
        }
        saveImageState();
    });
});

if (cropImageButton) {
    cropImageButton.addEventListener('click', () => {
        if (img.complete && img.naturalWidth !== 0) {
            showCropModal(canvas.toDataURL('image/png'));
        }
    });
}

if (restoreButton) {
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
}

img.onload = function () {
    originalWidth = img.width;
    originalHeight = img.height;
    fullResCanvas.width = originalWidth;
    fullResCanvas.height = originalHeight;

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

    if (!originalUploadedImage.src || originalUploadedImage.src === "") {
        originalUploadedImage.src = img.src;
    }

    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
    ).then(() => {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = previewWidth;
        tempCanvas.height = previewHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(img, 0, 0, previewWidth, previewHeight);
        originalImageData = tempCtx.getImageData(0, 0, previewWidth, previewHeight);
        originalFullResImage.src = fullResCanvas.toDataURL('image/png');
        uploadNewPhotoButton.style.display = 'block';
        canvas.style.display = 'block';
    });
};

downloadButton.addEventListener('click', () => {
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

    function updateFileInfo() {
        const scale = parseFloat(resolutionSelect.value) / 100;
        const width = Math.round(fullResCanvas.width * scale);
        const height = Math.round(fullResCanvas.height * scale);
        dimensionsSpan.textContent = `${width} x ${height}`;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(fullResCanvas, 0, 0, width, height);
        const fileType = fileTypeSelect.value;
        const quality = fileType === 'image/png' ? undefined : 1.0;
        tempCanvas.toBlob((blob) => {
            fileSizeSpan.textContent = blob ? Math.round(blob.size / 1024) : 'Calculating...';
        }, fileType, quality);
    }
    updateFileInfo();
    resolutionSelect.addEventListener('change', updateFileInfo);
    fileTypeSelect.addEventListener('change', updateFileInfo);

    const saveConfirmBtn = document.getElementById('save-confirm');
    const saveCancelBtn = document.getElementById('save-cancel');

    saveConfirmBtn.addEventListener('click', () => {
        const fileName = document.getElementById('save-file-name').value.trim() || 'nueva-imagen';
        const fileType = fileTypeSelect.value;
        const scale = parseFloat(resolutionSelect.value) / 100;
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9-_]/g, '');
        const extension = fileType.split('/')[1];

        if (fullResCanvas.width === 0 || fullResCanvas.height === 0) {
            alert("No image available to download. Please upload an image.");
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
            return;
        }

        showLoadingIndicator(true);
        const width = Math.round(fullResCanvas.width * scale);
        const height = Math.round(fullResCanvas.height * scale);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(fullResCanvas, 0, 0, width, height);

        const quality = fileType === 'image/png' ? undefined : 1.0;
        tempCanvas.toBlob((blob) => {
            if (!blob || blob.size === 0) {
                alert("Failed to generate downloadable image.");
                showLoadingIndicator(false);
                return;
            }
            const link = document.createElement('a');
            link.download = `${sanitizedFileName}-${Math.round(scale * 100)}%.${extension}`;
            link.href = URL.createObjectURL(blob);
            link.click();
            URL.revokeObjectURL(link.href);
            showLoadingIndicator(false);
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
        }, fileType, quality);
    });

    saveCancelBtn.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });

    overlay.addEventListener('click', () => {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });
});

let isRedrawing = false;
function saveImageState() {
    imageStates = imageStates.slice(0, currentStateIndex + 1);
    
    const state = {
        settings: { ...settings },
        imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
        fullResImageData: fullResCtx.getImageData(0, 0, fullResCanvas.width, fullResCanvas.height)
    };
    
    imageStates.push(state);
    currentStateIndex = imageStates.length - 1;
    
    if (imageStates.length > 10) {
        imageStates.shift();
        currentStateIndex--;
    }
}

function loadImageState(state) {
    if (!state) return;
    
    Object.assign(settings, state.settings);
    
    ctx.putImageData(state.imageData, 0, 0);
    fullResCtx.putImageData(state.fullResImageData, 0, 0);
    
    updateControlIndicators();
}

function handleUndo(e) {
    e.preventDefault();
    if (currentStateIndex > 0) {
        currentStateIndex--;
        loadImageState(imageStates[currentStateIndex]);
    }
}

function handleRedo(e) {
    e.preventDefault();
    if (currentStateIndex < imageStates.length - 1) {
        currentStateIndex++;
        loadImageState(imageStates[currentStateIndex]);
    }
}

function setupUndoRedoListeners() {
    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modalElement = document.querySelector('.modal.show');
            if (modalElement) {
                closeModal(modalElement);
            }
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            if (fileInput && fileInput.files.length > 0) {
                cleanupFileInput();
            }
        } else if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redoChange();
            } else {
                undoChange();
            }
        } else if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
            e.preventDefault();
            redoChange();
        }
    });

    // Handle touch events for undo/redo buttons
    const undoBtn = document.getElementById('undo-button');
    const redoBtn = document.getElementById('redo-button');

    const addButtonListeners = (button, handler) => {
        if (!button) return;
        
        button.setAttribute('role', 'button');
        button.addEventListener('click', handler);
        
        // Touch events
        button.addEventListener('touchstart', (e) => {
            // Only prevent default if the button is enabled
            if (!button.classList.contains('disabled')) {
                e.preventDefault();
                handler(e);
            }
        }, { passive: false });
        
        // Prevent unwanted touch scrolling
        button.addEventListener('touchmove', (e) => {
            if (!button.classList.contains('disabled')) {
                e.preventDefault();
            }
        }, { passive: false });
    };

    // Add listeners with debounced handlers
    const debouncedUndo = debounce(undoChange, 200);
    const debouncedRedo = debounce(redoChange, 200);
    
    addButtonListeners(undoBtn, debouncedUndo);
    addButtonListeners(redoBtn, debouncedRedo);
}

// Initialize undo/redo listeners
setupUndoRedoListeners();

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

            const modalInputs = modalControls.querySelectorAll('input[type="range"]');
            modalInputs.forEach(input => {
                input.value = settings[input.id];
                input.addEventListener('input', debounce((e) => {
                    const id = e.target.id;
                    const newValue = parseInt(e.target.value);
                    settings[id] = newValue;
                    updateControlIndicators();
                    redrawImage(
                        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                        isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
                    );
                }, 300));
            });

            modalImage.src = canvas.toDataURL('image/png');
            modal.style.display = 'block';

            const modalCloseBtn = modal.querySelector('.modal-close-btn');
            if (modalCloseBtn) {
                modalCloseBtn.focus();
            }
        } catch (error) {
            console.error("Error opening modal:", error);
        }
    }
});

canvas.addEventListener('touchend', (e) => {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        e.preventDefault();
    }
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
        handleUndo(e);
    } else if (e.ctrlKey && e.key === 'y') {
        handleRedo(e);
    }
});

function initialize() {
    isTriggering = false;
    cleanupFileInput();
    updateControlIndicators();
    
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
    
    if (fullResCanvas && img.complete && img.naturalWidth !== 0) {
        fullResCanvas.width = originalWidth;
        fullResCanvas.height = originalHeight;
        fullResCtx.drawImage(img, 0, 0, originalWidth, originalHeight);
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
        ).then(() => {
            originalFullResImage.src = fullResCanvas.toDataURL('image/png');
            ctx.drawImage(fullResCanvas, 0, 0, canvas.width, canvas.height);
        });
    }
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

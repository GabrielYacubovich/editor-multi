
import { throttle } from './utils.js';
import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage } from './imageProcessing.js';
import { initializeCropHandler, showCropModal, setupCropEventListeners, setTriggerFileUpload, cropState, resetCropState } from './cropHandler.js';

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
const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
const previewModal = document.getElementById('preview-modal');
const LOW_RES_MAX_WIDTH = 400; // Quick preview size
const HIGH_RES_MAX_WIDTH = 1920; // Full quality size
const MAX_CANVAS_HEIGHT = 1080;
let img = new Image();
let originalImageData = null;
let noiseSeed = Math.random();
let fullResCanvas = document.createElement('canvas');
let fullResCtx = fullResCanvas.getContext('2d', { willReadFrequently: true });
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
let history = [{ filters: { ...settings }, imageData: null }];
let redoHistory = [];
let lastAppliedEffect = null;
let lastModifiedSlider = null; // Add this line here
let originalWidth, originalHeight, previewWidth, previewHeight;

let isTriggering = false;
let fileInput = null;


// script.js (inside the if (window.Worker) block)
export let redrawWorker = null;
if (window.Worker) {
    redrawWorker = new Worker(URL.createObjectURL(new Blob([`
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

            if (settings['glitch-rgb-split'] > 0) {
                const intensity = settings['glitch-rgb-split'] / 100;
                const maxShift = clamp(30 * intensity * (Math.max(width, height) / previewMinDimension), 0, Math.max(width, height) / 8);
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        randomSeed += 1;
                        const rShift = Math.floor(seededRandom() * maxShift - maxShift / 2);
                        randomSeed += 1;
                        const gShift = Math.floor(seededRandom() * maxShift - maxShift / 2);
                        randomSeed += 1;
                        const bShift = Math.floor(seededRandom() * maxShift - maxShift / 2);
                        const rX = clamp(x + rShift, 0, width - 1);
                        const gX = clamp(x + gShift, 0, width - 1);
                        const bX = clamp(x + bShift, 0, width - 1);
                        data[idx] = tempData[(y * width + rX) * 4];
                        data[idx + 1] = tempData[(y * width + gX) * 4 + 1];
                        data[idx + 2] = tempData[(y * width + bX) * 4 + 2];
                    }
                }
            }

            if (settings['glitch-chromatic-vertical'] > 0) {
                const intensity = settings['glitch-chromatic-vertical'] / 100;
                const maxShift = clamp(50 * intensity * (height / previewMinDimension), 0, height / 8);
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                for (let y = 0; y < height; y++) {
                    const shiftY = clamp(y - Math.round(maxShift * Math.sin(randomSeed + y * 0.1)), 0, height - 1);
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const shiftedIdx = (shiftY * width + x) * 4;
                        data[idx] = tempData[shiftedIdx];
                        data[idx + 1] = tempData[shiftedIdx + 1];
                        data[idx + 2] = tempData[shiftedIdx + 2];
                    }
                }
            }

            if (settings['glitch-chromatic-diagonal'] > 0) {
                const intensity = settings['glitch-chromatic-diagonal'] / 100;
                const maxShift = clamp(50 * intensity * (Math.max(width, height) / previewMinDimension), 0, Math.max(width, height) / 8);
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const shiftX = clamp(x - Math.round(maxShift * Math.sin(randomSeed + (x + y) * 0.05)), 0, width - 1);
                        const shiftY = clamp(y - Math.round(maxShift * Math.cos(randomSeed + (x + y) * 0.05)), 0, height - 1);
                        const shiftedIdx = (shiftY * width + shiftX) * 4;
                        data[idx] = tempData[shiftedIdx];
                        data[idx + 1] = tempData[shiftedIdx + 1];
                        data[idx + 2] = tempData[shiftedIdx + 2];
                    }
                }
            }

            if (settings['glitch-pixel-shuffle'] > 0) {
                const intensity = settings['glitch-pixel-shuffle'] / 100;
                const blockSize = Math.round(clamp(5 + intensity * 20, 5, Math.min(width, height) / 10));
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                for (let y = 0; y < height; y += blockSize) {
                    for (let x = 0; x < width; x += blockSize) {
                        const randX = clamp(Math.floor(seededRandom() * width), 0, width - blockSize);
                        const randY = clamp(Math.floor(seededRandom() * height), 0, height - blockSize);
                        for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
                            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
                                const srcIdx = ((y + dy) * width + (x + dx)) * 4;
                                const destIdx = ((randY + dy) * width + (randX + dx)) * 4;
                                data[destIdx] = tempData[srcIdx];
                                data[destIdx + 1] = tempData[srcIdx + 1];
                                data[destIdx + 2] = tempData[srcIdx + 2];
                            }
                        }
                    }
                }
            }

            if (settings['glitch-wave'] > 0) {
                const intensity = settings['glitch-wave'] / 100;
                const amplitude = clamp(20 * intensity * (width / previewMinDimension), 0, width / 8);
                const frequency = 0.05;
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                for (let y = 0; y < height; y++) {
                    const shiftX = Math.round(amplitude * Math.sin(frequency * y + randomSeed));
                    for (let x = 0; x < width; x++) {
                        const srcX = clamp(x + shiftX, 0, width - 1);
                        const idx = (y * width + x) * 4;
                        const srcIdx = (y * width + srcX) * 4;
                        data[idx] = tempData[srcIdx];
                        data[idx + 1] = tempData[srcIdx + 1];
                        data[idx + 2] = tempData[srcIdx + 2];
                    }
                }
            }

            ctx.putImageData(imageData, 0, 0);
        }

        async function applyComplexFilters(ctx, canvas, settings, noiseSeed, scaleFactor) {
            const width = canvas.width;
            const height = canvas.height;
            let imageData = ctx.getImageData(0, 0, width, height);
            let data = imageData.data;

            if (settings['kaleidoscope-segments'] > 0) {
                const segments = Math.max(1, settings['kaleidoscope-segments']);
                const offset = clamp((settings['kaleidoscope-offset'] / 100) * Math.min(width, height) / 2, 0, Math.min(width, height) / 2);
                const tempCanvas = new OffscreenCanvas(width, height);
                const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tempCtx.putImageData(imageData, 0, 0);
                ctx.clearRect(0, 0, width, height);
                const centerX = clamp(width / 2 + offset, 0, width);
                const centerY = clamp(height / 2 + offset, 0, height);
                const angleStep = (2 * Math.PI) / segments;
                for (let i = 0; i < segments; i++) {
                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.rotate(angleStep * i);
                    ctx.scale(i % 2 === 0 ? 1 : -1, 1);
                    ctx.drawImage(tempCanvas, -centerX, -centerY);
                    ctx.restore();
                }
                imageData = ctx.getImageData(0, 0, width, height);
                data = imageData.data;
            }

            if (settings['vortex-twist'] > 0) {
                const intensity = settings['vortex-twist'] / 100;
                const maxAngle = clamp(intensity * 2 * Math.PI, 0, 2 * Math.PI);
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                const centerX = width / 2;
                const centerY = height / 2;
                const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const dx = x - centerX;
                        const dy = y - centerY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const angle = (1 - dist / maxDist) * maxAngle;
                        const cosA = Math.cos(angle);
                        const sinA = Math.sin(angle);
                        const srcX = clamp(centerX + (dx * cosA - dy * sinA), 0, width - 1);
                        const srcY = clamp(centerY + (dx * sinA + dy * cosA), 0, height - 1);
                        const srcIdx = (Math.floor(srcY) * width + Math.floor(srcX)) * 4;
                        data[idx] = tempData[srcIdx];
                        data[idx + 1] = tempData[srcIdx + 1];
                        data[idx + 2] = tempData[srcIdx + 2];
                    }
                }
            }

            if (settings['edge-detect'] > 0) {
                const intensity = settings['edge-detect'] / 100;
                const tempData = new Uint8ClampedArray(data.length);
                for (let i = 0; i < data.length; i++) tempData[i] = data[i];
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        const idx = (y * width + x) * 4;
                        const gx = (
                            -tempData[((y - 1) * width + (x - 1)) * 4] +
                            tempData[((y - 1) * width + (x + 1)) * 4] -
                            2 * tempData[(y * width + (x - 1)) * 4] +
                            2 * tempData[(y * width + (x + 1)) * 4] -
                            tempData[((y + 1) * width + (x - 1)) * 4] +
                            tempData[((y + 1) * width + (x + 1)) * 4]
                        );
                        const gy = (
                            -tempData[((y - 1) * width + (x - 1)) * 4] -
                            2 * tempData[((y - 1) * width + x) * 4] -
                            tempData[((y - 1) * width + (x + 1)) * 4] +
                            tempData[((y + 1) * width + (x - 1)) * 4] +
                            2 * tempData[((y + 1) * width + x) * 4] +
                            tempData[((y + 1) * width + (x + 1)) * 4]
                        );
                        const gradient = Math.sqrt(gx * gx + gy * gy) * intensity;
                        const value = clamp(gradient, 0, 255);
                        data[idx] = value;
                        data[idx + 1] = value;
                        data[idx + 2] = value;
                    }
                }
            }

            ctx.putImageData(imageData, 0, 0);
        }

        self.onmessage = async (e) => {
    try {
        const { imgData, settings, noiseSeed, width, height } = e.data;
        const offscreenCanvas = new OffscreenCanvas(width, height);
        const ctx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
        ctx.putImageData(imgData, 0, 0);

        applyBasicFiltersManually(ctx, offscreenCanvas, settings);
        await applyAdvancedFilters(ctx, offscreenCanvas, settings, noiseSeed, 1);
        await applyGlitchEffects(ctx, offscreenCanvas, settings, noiseSeed, 1);
        await applyComplexFilters(ctx, offscreenCanvas, settings, noiseSeed, 1);

        const resultData = ctx.getImageData(0, 0, width, height);
        self.postMessage({ imageData: resultData });
    } catch (err) {
        self.postMessage({ error: err.message });
    }
};
    `], { type: 'application/javascript' })));

    const updateModalImage = throttle(() => {
        modalImage.src = canvas.toDataURL('image/png');
    }, 100);

    redrawWorker.onmessage = (e) => {
        fullResCtx.putImageData(e.data.imageData, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        if (isShowingOriginal && trueOriginalImage.complete) {
            ctx.drawImage(trueOriginalImage, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.drawImage(fullResCanvas, 0, 0, canvas.width, canvas.height);
        }
        if (modal?.style.display === 'block') {
            setTimeout(() => {
                modalImage.src = canvas.toDataURL('image/jpeg', 0.8);
            }, 0);
        }
        saveImageState(false, e.data.imageData); // Pass the worker's imageData explicitly
        showLoadingIndicator(false);
    };
}

function scaleToFit(srcWidth, srcHeight, maxWidth, maxHeight) {
    const aspectRatio = srcWidth / srcHeight;
    const isVertical = aspectRatio < 1;
    let width, height;

    if (isVertical) {
        height = Math.min(srcHeight, maxHeight);
        width = Math.round(height * aspectRatio);
        if (width > maxWidth) {
            width = maxWidth;
            height = Math.round(width / aspectRatio);
        }
    } else {
        width = Math.min(srcWidth, maxWidth);
        height = Math.round(width / aspectRatio);
        if (height > maxHeight) {
            height = maxHeight;
            width = Math.round(height * aspectRatio);
        }
    }

    const maxPixels = maxWidth * maxHeight;
    if (width * height > maxPixels) {
        const scale = Math.sqrt(maxPixels / (width * height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
    }

    return { width, height };
}

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
            trueOriginalImage.onload = () => {
                originalUploadedImage.src = event.target.result;
                resetCropState(trueOriginalImage.width, trueOriginalImage.height);
                showCropModal(event.target.result);
            };
            cleanupFileInput();
        };
        reader.readAsDataURL(file);
    });
    setTimeout(() => fileInput.click(), 0);
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
    setupModal(modal, false);
    setupModal(cropModal, false);
    setupModal(previewModal, true);
    initializeCropHandler({
        cropModal, cropCanvas, cropCtx, canvas, ctx, fullResCanvas, fullResCtx, img,
        trueOriginalImage, originalUploadedImage, originalFullResImage, modal, modalImage,
        settings, noiseSeed, isShowingOriginal, originalWidth, originalHeight,
        previewWidth, previewHeight, uploadNewPhotoButton, saveImageState, originalImageData,
        redrawWorker
    });
    setTriggerFileUpload(triggerFileUpload);
    setupCropEventListeners();
});

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
    const activeSettings = isDraggingSlider ? tempSettings : settings;
    controlValues.forEach(id => {
        const indicator = document.getElementById(`${id}-value`);
        if (indicator) {
            indicator.textContent = id === 'kaleidoscope-segments' ? `${activeSettings[id]}` : `${activeSettings[id]}%`;
        }
    });
}

function handleToggleOriginal(e) {
    e.preventDefault();
    if (!trueOriginalImage.complete || trueOriginalImage.naturalWidth === 0) return;

    isShowingOriginal = !isShowingOriginal;
    toggleOriginalButton.textContent = isShowingOriginal ? 'Editada' : 'Original';

    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, false, saveImageState
    ).then(() => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (isShowingOriginal) {
            ctx.drawImage(trueOriginalImage, 0, 0, canvas.width, canvas.height);
        } else {
            ctx.drawImage(fullResCanvas, 0, 0, canvas.width, canvas.height);
        }
    });
}

toggleOriginalButton.addEventListener('click', handleToggleOriginal);
toggleOriginalButton.addEventListener('touchend', handleToggleOriginal);

img.onload = function () {
    originalWidth = img.width;
    originalHeight = img.height;

    // Step 1: Render low-res immediately (keep as is)
    const lowRes = scaleToFit(originalWidth, originalHeight, LOW_RES_MAX_WIDTH, MAX_CANVAS_HEIGHT);
    canvas.width = lowRes.width;
    canvas.height = lowRes.height;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, lowRes.width, lowRes.height);
    showLoadingIndicator(true);

    // Step 2: Prepare high-res in worker (optimize)
    const highRes = scaleToFit(originalWidth, originalHeight, HIGH_RES_MAX_WIDTH, MAX_CANVAS_HEIGHT);
    fullResCanvas.width = highRes.width;
    fullResCanvas.height = highRes.height;
    fullResCtx.drawImage(img, 0, 0, highRes.width, highRes.height);

    // Use a Promise to handle worker processing asynchronously
    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
    ).then(() => {
        originalImageData = fullResCtx.getImageData(0, 0, highRes.width, highRes.height);
        originalFullResImage.src = fullResCanvas.toDataURL('image/png');
        uploadNewPhotoButton.style.display = 'block';
        canvas.style.display = 'block';
        showLoadingIndicator(false); // Move this here to ensure it hides after processing
    }).catch(err => {
        console.error('Initial redraw failed:', err);
        showLoadingIndicator(false);
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
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true }); // Updated        
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        tempCtx.drawImage(fullResCanvas, 0, 0, width, height);
        const fileType = fileTypeSelect.value;
        const quality = fileType === 'image/png' ? undefined : 1.0;
        tempCanvas.toBlob((blob) => {
            fileSizeSpan.textContent = blob ? Math.round(blob.size / 1024) : 'Calculando...';
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
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
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

function saveImageState(isOriginal = false, imageData = null) {
    if (isOriginal) {
        history = [{ filters: { ...settings }, imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) }];
        redoHistory = [];
        lastModifiedSlider = null;
    } else {
        const lastState = history[history.length - 1];
        // Use provided imageData or capture it from the canvas
        const currentImageData = imageData || ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (JSON.stringify(lastState.filters) !== JSON.stringify(settings)) {
            history.push({ filters: { ...settings }, imageData: currentImageData });
            if (history.length > 50) history.shift();
            redoHistory = [];
        }
    }
}

function handleUndo(e) {
    e.preventDefault();
    if (history.length > 1) { // Ensure there's something to undo beyond initial state
        const currentState = history.pop();
        redoHistory.push(currentState);
        const previousState = history[history.length - 1];

        // If the last state was a slider change, revert it
        if (currentState.sliderId) {
            const sliderId = currentState.sliderId;
            settings[sliderId] = currentState.previousValue;
            const slider = document.getElementById(sliderId);
            if (slider) slider.value = currentState.previousValue;
            lastModifiedSlider = sliderId;
            updateControlIndicators();
            redrawImage(
                ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                isShowingOriginal, trueOriginalImage, modal, modalImage, false
            );
        }
    }
}

function handleRedo(e) {
    e.preventDefault();
    if (redoHistory.length > 0) {
        const nextState = redoHistory.pop();
        history.push(nextState);

        // Apply the next slider change
        if (nextState.sliderId) {
            const sliderId = nextState.sliderId;
            settings[sliderId] = nextState.newValue;
            const slider = document.getElementById(sliderId);
            if (slider) slider.value = nextState.newValue;
            lastModifiedSlider = sliderId;
            updateControlIndicators();
            redrawImage(
                ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                isShowingOriginal, trueOriginalImage, modal, modalImage, false
            );
        }
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
    }, { passive: false });
    button.addEventListener('touchend', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler(e);
    }, { passive: false });
    button.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
}

addButtonListeners(undoButton, debouncedUndo);
addButtonListeners(redoButton, debouncedRedo);

cropImageButton.addEventListener('click', (e) => {
    e.preventDefault();
    if (cropState.trueOriginalImage.src && cropState.trueOriginalImage.src !== "") {
        showCropModal(cropState.trueOriginalImage.src);
    }
});

cropImageButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (cropState.trueOriginalImage.src && cropState.trueOriginalImage.src !== "") {
        showCropModal(cropState.trueOriginalImage.src);
    }
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

let isDraggingSlider = false;
let tempSettings = {};
const debouncedRedraw = debounce(() => {
    if (img.complete && img.naturalWidth !== 0) {
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, img, tempSettings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, false
        );
    }
}, 300);

controls.forEach(control => {
    control.addEventListener('input', (e) => {
        if (isDraggingSlider) {
            const id = e.target.id;
            tempSettings[id] = parseInt(e.target.value);
            updateControlIndicators();
            debouncedRedraw();
        }
    });

    control.addEventListener('mouseup', () => {
        if (isDraggingSlider) {
            isDraggingSlider = false;
            const id = control.id;
            const newValue = parseInt(control.value);
            if (settings[id] !== newValue) {
                // Push the change to history
                history.push({
                    sliderId: id,
                    previousValue: settings[id],
                    newValue: newValue,
                    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height) // Optional: store image state
                });
                if (history.length > 50) history.shift(); // Limit history size
                redoHistory = []; // Clear redo stack
                settings[id] = newValue;
                lastModifiedSlider = id; // Track the last slider
                updateControlIndicators();
                if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
                    lastAppliedEffect = id;
                }
                redrawImage(
                    ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                    isShowingOriginal, trueOriginalImage, modal, modalImage, false, saveImageState
                ).then(() => {
                    originalFullResImage.src = fullResCanvas.toDataURL('image/png');
                });
            }
        }
    });

    control.addEventListener('touchend', () => {
        // Same logic as mouseup
        if (isDraggingSlider) {
            isDraggingSlider = false;
            const id = control.id;
            const newValue = parseInt(control.value);
            if (settings[id] !== newValue) {
                history.push({
                    sliderId: id,
                    previousValue: settings[id],
                    newValue: newValue,
                    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
                });
                if (history.length > 50) history.shift();
                redoHistory = [];
                settings[id] = newValue;
                lastModifiedSlider = id;
                updateControlIndicators();
                if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
                    lastAppliedEffect = id;
                }
                redrawImage(
                    ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                    isShowingOriginal, trueOriginalImage, modal, modalImage, false, saveImageState
                ).then(() => {
                    originalFullResImage.src = fullResCanvas.toDataURL('image/png');
                });
            }
        }
    });

    control.addEventListener('change', (e) => {
        if (!isDraggingSlider) {
            const id = e.target.id;
            const newValue = parseInt(e.target.value);
            if (settings[id] !== newValue) {
                history.push({
                    sliderId: id,
                    previousValue: settings[id],
                    newValue: newValue,
                    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
                });
                if (history.length > 50) history.shift();
                redoHistory = [];
                settings[id] = newValue;
                lastModifiedSlider = id;
                updateControlIndicators();
                if (id.startsWith('glitch-') || id.startsWith('kaleidoscope-') || id === 'vortex-twist' || id === 'edge-detect') {
                    lastAppliedEffect = id;
                }
                redrawImage(
                    ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                    isShowingOriginal, trueOriginalImage, modal, modalImage, false, saveImageState
                );
            }
        }
    });
});

canvas.addEventListener('click', (e) => {
    const isNotIOS = !/iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isNotIOS) {
        const controlsContainer = document.querySelector('.controls');
        const modalControls = document.getElementById('modal-controls');
        if (controlsContainer && modalControls) {
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
                    const mainSlider = document.querySelector(`.controls input#${id}`);
                    if (mainSlider) {
                        mainSlider.value = newValue;
                    }
                    redrawImage(
                        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
                        isShowingOriginal, trueOriginalImage, modal, modalImage, true, saveImageState
                    );
                }, 500));
            });

            modalImage.src = canvas.toDataURL('image/png');
            modal.style.display = 'block';

            const modalCloseBtn = modal.querySelector('.modal-close-btn');
            if (modalCloseBtn) {
                modalCloseBtn.focus();
            }
        }
    }
});

canvas.addEventListener('touchend', (e) => {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        e.preventDefault();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    isTriggering = false;
    cleanupFileInput();
    updateControlIndicators();
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

function initialize() {
    updateControlIndicators();
}
initialize();

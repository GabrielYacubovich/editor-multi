import { showLoadingIndicator } from './domUtils.js';

function applyBasicFiltersManually(ctx, canvas, settings) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
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
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(imageData, 0, 0);
}

// Advanced Filters: Vibrance, Highlights, Shadows, Noise
function applyAdvancedFilters(ctx, canvas, noiseSeed, scaleFactor) {
    return new Promise((resolve) => {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const vibrance = (settings.vibrance - 100) / 100; // -1 to 1
        const highlights = (settings.highlights - 100) / 100; // -1 to 1
        const shadows = (settings.shadows - 100) / 100; // -1 to 1
        const noise = settings.noise / 100; // 0 to 1

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Vibrance: Boosts less-saturated colors
            if (vibrance !== 0) {
                const avg = (r + g + b) / 3;
                const max = Math.max(r, g, b);
                const amt = ((max - avg) * vibrance) / 255;
                r += (max - r) * amt;
                g += (max - g) * amt;
                b += (max - b) * amt;
            }

            // Highlights and Shadows: Adjust based on luminance
            const luminance = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            if (highlights !== 0 && luminance > 128) {
                const factor = 1 + highlights * 0.5;
                r *= factor;
                g *= factor;
                b *= factor;
            }
            if (shadows !== 0 && luminance <= 128) {
                const factor = 1 + shadows * 0.5;
                r *= factor;
                g *= factor;
                b *= factor;
            }

            // Noise: Add seeded random noise
            if (noise > 0) {
                const seed = noiseSeed + i / 4;
                const rand = Math.sin(seed) * 43758.5453;
                const noiseValue = (rand - Math.floor(rand) - 0.5) * noise * 50 * scaleFactor;
                r += noiseValue;
                g += noiseValue;
                b += noiseValue;
            }

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }

        ctx.putImageData(imageData, 0, 0);
        resolve();
    });
}

// Glitch Effects: Chromatic Aberration, RGB Split, Pixel Shuffle, Wave
function applyGlitchEffects(ctx, canvas, noiseSeed, scaleFactor) {
    return new Promise((resolve) => {
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const chromatic = settings['glitch-chromatic'] / 100 * scaleFactor; // 0 to 1
        const rgbSplit = settings['glitch-rgb-split'] / 100 * scaleFactor; // 0 to 1
        const verticalChromatic = settings['glitch-chromatic-vertical'] / 100 * scaleFactor;
        const diagonalChromatic = settings['glitch-chromatic-diagonal'] / 100 * scaleFactor;
        const pixelShuffle = settings['glitch-pixel-shuffle'] / 100 * scaleFactor; // 0 to 1
        const wave = settings['glitch-wave'] / 100 * scaleFactor; // 0 to 1

        // Create temporary canvases for channel shifts
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(imageData, 0, 0);

        if (chromatic > 0 || rgbSplit > 0 || verticalChromatic > 0 || diagonalChromatic > 0) {
            const rCanvas = document.createElement('canvas');
            const gCanvas = document.createElement('canvas');
            const bCanvas = document.createElement('canvas');
            rCanvas.width = gCanvas.width = bCanvas.width = width;
            rCanvas.height = gCanvas.height = bCanvas.height = height;
            const rCtx = rCanvas.getContext('2d');
            const gCtx = gCanvas.getContext('2d');
            const bCtx = bCanvas.getContext('2d');

            // Horizontal Chromatic Aberration
            if (chromatic > 0) {
                rCtx.drawImage(tempCanvas, chromatic * 10, 0);
                gCtx.drawImage(tempCanvas, 0, 0);
                bCtx.drawImage(tempCanvas, -chromatic * 10, 0);
            } else {
                rCtx.drawImage(tempCanvas, 0, 0);
                gCtx.drawImage(tempCanvas, 0, 0);
                bCtx.drawImage(tempCanvas, 0, 0);
            }

            // RGB Split
            if (rgbSplit > 0) {
                rCtx.translate(rgbSplit * 15, rgbSplit * 15);
                bCtx.translate(-rgbSplit * 15, -rgbSplit * 15);
            }

            // Vertical Chromatic Aberration
            if (verticalChromatic > 0) {
                rCtx.translate(0, verticalChromatic * 10);
                bCtx.translate(0, -verticalChromatic * 10);
            }

            // Diagonal Chromatic Aberration
            if (diagonalChromatic > 0) {
                rCtx.translate(diagonalChromatic * 10, diagonalChromatic * 10);
                bCtx.translate(-diagonalChromatic * 10, -diagonalChromatic * 10);
            }

            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(rCanvas, 0, 0);
            ctx.globalCompositeOperation = 'lighter';
            ctx.drawImage(gCanvas, 0, 0);
            ctx.drawImage(bCanvas, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
        }

        // Pixel Shuffle
        if (pixelShuffle > 0) {
            const shuffledData = ctx.getImageData(0, 0, width, height);
            const shuffled = shuffledData.data;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    const seed = noiseSeed + x + y * width;
                    const rand = Math.sin(seed) * 43758.5453;
                    const offset = Math.floor((rand - Math.floor(rand)) * pixelShuffle * 10);
                    const newX = clamp(x + offset, 0, width - 1);
                    const newY = clamp(y + offset, 0, height - 1);
                    const newI = (newY * width + newX) * 4;
                    shuffled[newI] = data[i];
                    shuffled[newI + 1] = data[i + 1];
                    shuffled[newI + 2] = data[i + 2];
                    shuffled[newI + 3] = data[i + 3];
                }
            }
            ctx.putImageData(shuffledData, 0, 0);
        }

        // Wave Distortion
        if (wave > 0) {
            const wavedData = ctx.getImageData(0, 0, width, height);
            const waved = wavedData.data;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    const seed = noiseSeed + y;
                    const rand = Math.sin(seed + x * 0.1) * wave * 20;
                    const newX = clamp(x + Math.floor(rand), 0, width - 1);
                    const newI = (y * width + newX) * 4;
                    waved[i] = data[newI];
                    waved[i + 1] = data[newI + 1];
                    waved[i + 2] = data[newI + 2];
                    waved[i + 3] = data[newI + 3];
                }
            }
            ctx.putImageData(wavedData, 0, 0);
        }

        resolve();
    });
}

// Complex Filters: Kaleidoscope, Vortex Twist, Edge Detection
function applyComplexFilters(ctx, canvas, noiseSeed, scaleFactor) {
    return new Promise((resolve) => {
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        const segments = settings['kaleidoscope-segments']; // 0 to 100 (treat as count)
        const offset = settings['kaleidoscope-offset'] / 100 * scaleFactor; // 0 to 1
        const vortex = settings['vortex-twist'] / 100 * scaleFactor; // 0 to 1
        const edgeDetect = settings['edge-detect'] / 100; // 0 to 1

        // Kaleidoscope Effect
        if (segments > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);

            ctx.clearRect(0, 0, width, height);
            const centerX = width / 2;
            const centerY = height / 2;
            const angleStep = (2 * Math.PI) / segments;

            for (let i = 0; i < segments; i++) {
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(angleStep * i + offset * Math.PI);
                ctx.scale(i % 2 === 0 ? 1 : -1, 1); // Mirror every other segment
                ctx.drawImage(tempCanvas, -centerX, -centerY);
                ctx.restore();
            }
        }

        // Vortex Twist
        if (vortex > 0) {
            const twistedData = ctx.getImageData(0, 0, width, height);
            const twisted = twistedData.data;
            const centerX = width / 2;
            const centerY = height / 2;
            const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);

            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    const dx = x - centerX;
                    const dy = y - centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) + (dist / maxDist) * vortex * Math.PI * 2;
                    const newX = clamp(centerX + dist * Math.cos(angle), 0, width - 1);
                    const newY = clamp(centerY + dist * Math.sin(angle), 0, height - 1);
                    const newI = (Math.floor(newY) * width + Math.floor(newX)) * 4;
                    twisted[i] = data[newI];
                    twisted[i + 1] = data[newI + 1];
                    twisted[i + 2] = data[newI + 2];
                    twisted[i + 3] = data[newI + 3];
                }
            }
            ctx.putImageData(twistedData, 0, 0);
        }

        // Edge Detection (Sobel Operator)
        if (edgeDetect > 0) {
            const edgeData = ctx.getImageData(0, 0, width, height);
            const edge = edgeData.data;
            const temp = new Uint8ClampedArray(data);

            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const i = (y * width + x) * 4;
                    const gx = (-temp[(y - 1) * width * 4 + (x - 1) * 4] + temp[(y - 1) * width * 4 + (x + 1) * 4]) +
                               (-2 * temp[y * width * 4 + (x - 1) * 4] + 2 * temp[y * width * 4 + (x + 1) * 4]) +
                               (-temp[(y + 1) * width * 4 + (x - 1) * 4] + temp[(y + 1) * width * 4 + (x + 1) * 4]);
                    const gy = (-temp[(y - 1) * width * 4 + (x - 1) * 4] - 2 * temp[(y - 1) * width * 4 + x * 4] - temp[(y - 1) * width * 4 + (x + 1) * 4]) +
                               (temp[(y + 1) * width * 4 + (x - 1) * 4] + 2 * temp[(y + 1) * width * 4 + x * 4] + temp[(y + 1) * width * 4 + (x + 1) * 4]);
                    const magnitude = Math.sqrt(gx * gx + gy * gy) * edgeDetect;
                    const value = Math.min(magnitude, 255);
                    edge[i] = edge[i + 1] = edge[i + 2] = value;
                    edge[i + 3] = 255;
                }
            }
            ctx.putImageData(edgeData, 0, 0);
        }

        resolve();
    });
}

function redrawImage(
    ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
    isShowingOriginal, trueOriginalImage, modal, modalImage, saveState = false, saveImageStateCallback
) {
    if (!img || !fullResCanvas) {
        console.error("redrawImage: img or fullResCanvas is undefined");
        showLoadingIndicator(false);
        return Promise.reject("Missing img or fullResCanvas");
    }
    showLoadingIndicator(true);
    fullResCanvas.width = img.width;
    fullResCanvas.height = img.height;
    if (fullResCanvas.width === 0 || fullResCanvas.height === 0) {
        showLoadingIndicator(false);
        return Promise.reject("Invalid canvas dimensions");
    }
    fullResCtx.clearRect(0, 0, fullResCanvas.width, fullResCanvas.height);
    fullResCtx.drawImage(img, 0, 0, fullResCanvas.width, fullResCanvas.height);
    applyBasicFiltersManually(fullResCtx, fullResCanvas, settings);
    const scaleFactor = 1;
    return applyAdvancedFilters(fullResCtx, fullResCanvas, noiseSeed, scaleFactor)
        .then(() => applyGlitchEffects(fullResCtx, fullResCanvas, noiseSeed, scaleFactor))
        .then(() => applyComplexFilters(fullResCtx, fullResCanvas, noiseSeed, scaleFactor))
        .then(() => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (isShowingOriginal && trueOriginalImage.complete && trueOriginalImage.naturalWidth !== 0) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(trueOriginalImage, 0, 0, canvas.width, canvas.height);
            } else {
                if (fullResCanvas.width === 0 || fullResCanvas.height === 0) {
                    showLoadingIndicator(false);
                    return;
                }
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(fullResCanvas, 0, 0, canvas.width, canvas.height);
            }
            if (modal.style.display === 'block') {
                modalImage.src = canvas.toDataURL('image/png');
            }
            if (saveState && saveImageStateCallback) {
                saveImageStateCallback();
            }
            showLoadingIndicator(false);
        });
}

// Utility function for clamping values
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage };

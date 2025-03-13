import { showLoadingIndicator } from './domUtils.js';

// Basic Filters (unchanged, matches old behavior)
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

// Advanced Filters (aligned with old Web Worker logic)
function applyAdvancedFilters(ctx, canvas, settings, noiseSeed, scaleFactor) {
    return new Promise((resolve) => {
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const vibrance = (settings.vibrance - 100) / 100; // -1 to 1
        const highlights = settings.highlights / 100; // 0 to 2
        const shadows = settings.shadows / 100; // 0 to 2
        const noise = settings.noise; // 0 to 100

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];
            const avg = (r + g + b) / 3;

            // Vibrance
            data[i] += (r - avg) * vibrance;
            data[i + 1] += (g - avg) * vibrance;
            data[i + 2] += (b - avg) * vibrance;

            // Highlights and Shadows
            if (r > 128) data[i] *= highlights;
            else data[i] *= shadows;
            if (g > 128) data[i + 1] *= highlights;
            else data[i + 1] *= shadows;
            if (b > 128) data[i + 2] *= highlights;
            else data[i + 2] *= shadows;

            // Noise
            if (noise > 0) {
                const randomValue = Math.sin(noiseSeed + i * 12.9898) * 43758.5453;
                const noiseAmount = (randomValue - Math.floor(randomValue) - 0.5) * noise * scaleFactor;
                data[i] += noiseAmount;
                data[i + 1] += noiseAmount;
                data[i + 2] += noiseAmount;
            }

            data[i] = Math.max(0, Math.min(255, data[i]));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1]));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2]));
        }

        ctx.putImageData(imageData, 0, 0);
        resolve();
    });
}

// Glitch Effects (aligned with old pixel-based logic)
function applyGlitchEffects(ctx, canvas, settings, noiseSeed, scaleFactor) {
    return new Promise((resolve) => {
        const width = canvas.width;
        const height = canvas.height;
        let imageData = ctx.getImageData(0, 0, width, height);
        let data = imageData.data;
        const previewMinDimension = Math.min(width, height);
        let randomSeed = noiseSeed;

        // Helper for seeded random
        function seededRandom() {
            let x = Math.sin(randomSeed++) * 10000;
            return x - Math.floor(x);
        }

        // Chromatic Aberration (Horizontal)
        if (settings['glitch-chromatic'] > 0) {
            const intensity = settings['glitch-chromatic'] / 100;
            const maxShift = Math.min(50 * intensity * (width / previewMinDimension), Math.min(width, height) / 8);
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const rShiftX = Math.max(0, x - Math.round(maxShift));
                    const gShiftX = Math.max(0, x - Math.round(maxShift * 0.5));
                    const bShiftX = Math.min(width - 1, x + Math.round(maxShift));
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

        // RGB Split
        if (settings['glitch-rgb-split'] > 0) {
            const intensity = settings['glitch-rgb-split'] / 100;
            const maxShift = Math.min(30 * intensity * (Math.max(width, height) / previewMinDimension), Math.max(width, height) / 8);
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

        // Chromatic Aberration (Vertical)
        if (settings['glitch-chromatic-vertical'] > 0) {
            const intensity = settings['glitch-chromatic-vertical'] / 100;
            const maxShift = Math.min(50 * intensity * (height / previewMinDimension), Math.min(width, height) / 8);
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const rShiftY = Math.max(0, y - Math.round(maxShift));
                    const gShiftY = Math.max(0, y - Math.round(maxShift * 0.5));
                    const bShiftY = Math.min(height - 1, y + Math.round(maxShift));
                    const rIdx = (rShiftY * width + x) * 4;
                    const gIdx = (gShiftY * width + x) * 4;
                    const bIdx = (bShiftY * width + x) * 4;
                    data[idx] = tempData[rIdx];
                    data[idx + 1] = tempData[gIdx + 1];
                    data[idx + 2] = tempData[bIdx + 2];
                    data[idx + 3] = tempData[idx + 3];
                }
            }
        }

        // Chromatic Aberration (Diagonal)
        if (settings['glitch-chromatic-diagonal'] > 0) {
            const intensity = settings['glitch-chromatic-diagonal'] / 100;
            const maxShift = Math.min(50 * intensity * (Math.max(width, height) / previewMinDimension), Math.max(width, height) / 8);
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const rShiftX = Math.max(0, x - Math.round(maxShift));
                    const rShiftY = Math.max(0, y - Math.round(maxShift));
                    const gShiftX = x;
                    const gShiftY = y;
                    const bShiftX = Math.min(width - 1, x + Math.round(maxShift));
                    const bShiftY = Math.min(height - 1, y + Math.round(maxShift));
                    const rIdx = (rShiftY * width + rShiftX) * 4;
                    const gIdx = (gShiftY * width + gShiftX) * 4;
                    const bIdx = (bShiftY * width + bShiftX) * 4;
                    data[idx] = tempData[rIdx];
                    data[idx + 1] = tempData[gIdx + 1];
                    data[idx + 2] = tempData[bIdx + 2];
                    data[idx + 3] = tempData[idx + 3];
                }
            }
        }

        // Pixel Shuffle
        if (settings['glitch-pixel-shuffle'] > 0) {
            const intensity = settings['glitch-pixel-shuffle'] / 100;
            const blockSize = Math.floor(5 * scaleFactor);
            for (let y = 0; y < height - blockSize; y += blockSize) {
                for (let x = 0; x < width - blockSize; x += blockSize) {
                    randomSeed += 1;
                    if (seededRandom() < 0.3 * intensity) {
                        randomSeed += 1;
                        const destX = clamp(x + Math.floor((seededRandom() - 0.5) * 50 * intensity * scaleFactor), 0, width - blockSize);
                        randomSeed += 1;
                        const destY = clamp(y + Math.floor((seededRandom() - 0.5) * 50 * intensity * scaleFactor), 0, height - blockSize);
                        for (let dy = 0; dy < blockSize; dy++) {
                            for (let dx = 0; dx < blockSize; dx++) {
                                const srcIdx = ((y + dy) * width + (x + dx)) * 4;
                                const destIdx = ((destY + dy) * width + (destX + dx)) * 4;
                                [data[srcIdx], data[destIdx]] = [data[destIdx], data[srcIdx]];
                                [data[srcIdx + 1], data[destIdx + 1]] = [data[destIdx + 1], data[srcIdx + 1]];
                                [data[srcIdx + 2], data[destIdx + 2]] = [data[destIdx + 2], data[srcIdx + 2]];
                                [data[srcIdx + 3], data[destIdx + 3]] = [data[destIdx + 3], data[srcIdx + 3]];
                            }
                        }
                    }
                }
            }
        }

        // Wave Distortion
        if (settings['glitch-pixel-shuffle'] > 0) {
            const intensity = settings['glitch-wave'] / 100;
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            const amplitude = 20 * intensity * scaleFactor;
            const frequency = 0.05 / scaleFactor;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const waveShift = Math.floor(amplitude * Math.sin(frequency * y * randomSeed));
                    const newX = clamp(x + waveShift, 0, width - 1);
                    const srcIdx = (y * width + newX) * 4;
                    data[idx] = tempData[srcIdx];
                    data[idx + 1] = tempData[srcIdx + 1];
                    data[idx + 2] = tempData[srcIdx + 2];
                    data[idx + 3] = tempData[srcIdx + 3];
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve();
    });
}

// Complex Filters (aligned with old logic)
function applyComplexFilters(ctx, canvas, settings, noiseSeed, scaleFactor) {
    return new Promise((resolve) => {
        const width = canvas.width;
        const height = canvas.height;
        let imageData = ctx.getImageData(0, 0, width, height);
        let data = imageData.data;
        let randomSeed = noiseSeed;

        // Kaleidoscope
        if (settings['kaleidoscope-segments'] > 0) {
            const segments = Math.max(1, settings['kaleidoscope-segments']);
            const offset = (settings['kaleidoscope-offset'] / 100) * Math.min(width, height) / 2;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            ctx.clearRect(0, 0, width, height);
            const centerX = width / 2 + offset;
            const centerY = height / 2 + offset;
            const angleStep = (2 * Math.PI) / segments;
            for (let i = 0; i < segments; i++) {
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(angleStep * i);
                ctx.scale(i % 2 === 0 ? 1 : -1, 1);
                ctx.drawImage(tempCanvas, -centerX, -centerY);
                ctx.restore();
            }
            imageData = ctx.getImageData(0, 0, width, height); // Update data after canvas ops
            data = imageData.data;
        }

        // Vortex Twist
        if (settings['vortex-twist'] > 0) {
            const intensity = settings['vortex-twist'] / 100;
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            const centerX = width / 2;
            const centerY = height / 2;
            const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY);
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const dx = x - centerX;
                    const dy = y - centerY;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) + (distance / maxRadius) * intensity * Math.PI;
                    const newX = Math.round(centerX + distance * Math.cos(angle));
                    const newY = Math.round(centerY + distance * Math.sin(angle));
                    const srcIdx = (clamp(newY, 0, height - 1) * width + clamp(newX, 0, width - 1)) * 4;
                    data[idx] = tempData[srcIdx];
                    data[idx + 1] = tempData[srcIdx + 1];
                    data[idx + 2] = tempData[srcIdx + 2];
                    data[idx + 3] = tempData[srcIdx + 3];
                }
            }
        }

        // Edge Detection
        if (settings['edge-detect'] > 0) {
            const intensity = settings['edge-detect'] / 100;
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
            const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    let gx = 0, gy = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const pixelIdx = ((y + dy) * width + (x + dx)) * 4;
                            const gray = (tempData[pixelIdx] + tempData[pixelIdx + 1] + tempData[pixelIdx + 2]) / 3;
                            gx += gray * sobelX[dy + 1][dx + 1];
                            gy += gray * sobelY[dy + 1][dx + 1];
                        }
                    }
                    const edge = Math.sqrt(gx * gx + gy * gy) * intensity;
                    const value = Math.min(255, Math.max(0, edge));
                    data[idx] = data[idx + 1] = data[idx + 2] = value;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve();
    });
}

// Redraw Image (unchanged, works with updated filters)
function redrawImage(
    ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
    isShowingOriginal, trueOriginalImage, modal, modalImage, saveState = false, saveImageStateCallback
) {
    if (!img) {
        console.error("redrawImage: img is undefined or null");
        showLoadingIndicator(false);
        return Promise.reject("Missing img");
    }
    if (!img.complete || img.naturalWidth === 0) {
        console.error("redrawImage: img is not loaded or has invalid dimensions", img.src);
        showLoadingIndicator(false);
        return Promise.reject("Image not loaded");
    }
    if (!fullResCanvas) {
        console.error("redrawImage: fullResCanvas is undefined or null");
        showLoadingIndicator(false);
        return Promise.reject("Missing fullResCanvas");
    }

    showLoadingIndicator(true);
    fullResCanvas.width = img.width;
    fullResCanvas.height = img.height;
    if (fullResCanvas.width === 0 || fullResCanvas.height === 0) {
        console.error("redrawImage: Invalid canvas dimensions", fullResCanvas.width, fullResCanvas.height);
        showLoadingIndicator(false);
        return Promise.reject("Invalid canvas dimensions");
    }
    fullResCtx.clearRect(0, 0, fullResCanvas.width, fullResCanvas.height);
    fullResCtx.drawImage(img, 0, 0, fullResCanvas.width, fullResCanvas.height);
    applyBasicFiltersManually(fullResCtx, fullResCanvas, settings);
    const scaleFactor = 1;
    return applyAdvancedFilters(fullResCtx, fullResCanvas, settings, noiseSeed, scaleFactor)
        .then(() => applyGlitchEffects(fullResCtx, fullResCanvas, settings, noiseSeed, scaleFactor))
        .then(() => applyComplexFilters(fullResCtx, fullResCanvas, settings, noiseSeed, scaleFactor))
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
        }).catch(err => {
            console.error("redrawImage failed during processing:", err);
            showLoadingIndicator(false);
            throw err; // Re-throw to propagate the error
        });
}

// Utility function
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage };
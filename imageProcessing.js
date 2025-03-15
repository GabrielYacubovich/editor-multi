
// imageProcessing.js
import { showLoadingIndicator } from './domUtils.js';

// Basic Filters
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

// Advanced Filters
function applyAdvancedFilters(ctx, canvas, settings, noiseSeed, scaleFactor) {
    return new Promise((resolve, reject) => {
        try {
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
            resolve();
        } catch (err) {
            console.error("applyAdvancedFilters failed:", err);
            reject(err);
        }
    });
}

// Glitch Effects
function applyGlitchEffects(ctx, canvas, settings, noiseSeed, scaleFactor) {
    return new Promise((resolve, reject) => {
        try {
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
            resolve();
        } catch (err) {
            console.error("applyGlitchEffects failed:", err);
            reject(err);
        }
    });
}

// Complex Filters
function applyComplexFilters(ctx, canvas, settings, noiseSeed, scaleFactor) {
    return new Promise((resolve, reject) => {
        try {
            const width = canvas.width;
            const height = canvas.height;
            let imageData = ctx.getImageData(0, 0, width, height);
            let data = imageData.data;

            if (settings['kaleidoscope-segments'] > 0) {
                const segments = Math.max(1, settings['kaleidoscope-segments']);
                const offset = clamp((settings['kaleidoscope-offset'] / 100) * Math.min(width, height) / 2, 0, Math.min(width, height) / 2);
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = width;
                tempCanvas.height = height;
                const tempCtx = tempCanvas.getContext('2d');
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
            resolve();
        } catch (err) {
            console.error("applyComplexFilters failed:", err);
            reject(err);
        }
    });
}

// Redraw Image
// In imageProcessing.js
async function redrawImage(ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed, isShowingOriginal, trueOriginalImage, modal, modalImage, saveState, saveImageStateCallback) {
    await new Promise(resolve => setTimeout(resolve, 0)); // Yield to main thread
    if (!img.complete || img.naturalWidth === 0) {
        console.error("redrawImage: img not loaded", img);
        showLoadingIndicator(false);
        return;
    }
    showLoadingIndicator(true);
    fullResCanvas.width = img.width;
    fullResCanvas.height = img.height;
    fullResCtx.drawImage(img, 0, 0);

    applyBasicFiltersManually(fullResCtx, fullResCanvas, settings);
    await applyAdvancedFilters(fullResCtx, fullResCanvas, settings, noiseSeed, 1);
    await applyGlitchEffects(fullResCtx, fullResCanvas, settings, noiseSeed, 1);
    await applyComplexFilters(fullResCtx, fullResCanvas, settings, noiseSeed, 1);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (isShowingOriginal && trueOriginalImage.complete) {
        ctx.drawImage(trueOriginalImage, 0, 0, canvas.width, canvas.height);
    } else {
        ctx.drawImage(fullResCanvas, 0, 0, canvas.width, canvas.height);
    }

    if (modal?.style.display === 'block') {
        modalImage.src = canvas.toDataURL('image/png');
    }
    if (saveState && saveImageStateCallback) {
        saveImageStateCallback();
    }
    showLoadingIndicator(false);
}
// Utility function
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

export { 
    applyBasicFiltersManually, 
    applyAdvancedFilters, 
    applyGlitchEffects, 
    applyComplexFilters, 
    redrawImage, 
    clamp 
};

// filters.js - Module for image filtering and effects

export function applyBasicFiltersManually(ctx, canvas, settings) {
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

        // Apply brightness and exposure
        r *= brightnessFactor * exposureFactor;
        g *= brightnessFactor * exposureFactor;
        b *= brightnessFactor * exposureFactor;

        // Apply contrast
        r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
        g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
        b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;

        // Apply grayscale
        if (grayscale > 0) {
            const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            r = r * (1 - grayscale) + gray * grayscale;
            g = g * (1 - grayscale) + gray * grayscale;
            b = b * (1 - grayscale) + gray * grayscale;
        }

        // Apply saturation
        if (saturationFactor !== 1) {
            const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
            r = gray + (r - gray) * saturationFactor;
            g = gray + (g - gray) * saturationFactor;
            b = gray + (b - gray) * saturationFactor;
        }

        // Apply temperature
        if (temperatureFactor !== 0) {
            if (temperatureFactor > 0) {
                r += temperatureFactor * 50;
                b -= temperatureFactor * 50;
            } else {
                r -= Math.abs(temperatureFactor) * 50;
                b += Math.abs(temperatureFactor) * 50;
            }
        }

        // Clamp values to 0-255
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
    }
    ctx.putImageData(imageData, 0, 0);
}

export function applyAdvancedFilters(ctx, canvas, noiseSeed, scaleFactor) {
    return new Promise((resolve) => {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const vibrance = (settings.vibrance - 100) / 100;
        const highlights = settings.highlights / 100;
        const shadows = settings.shadows / 100;
        const noise = settings.noise;

        for (let i = 0; i < data.length; i += 4) {
            // Temperature adjustment (non-standard implementation from original)
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

            // Apply vibrance
            let avg = (r + g + b) / 3;
            data[i] += (r - avg) * vibrance;
            data[i + 1] += (g - avg) * vibrance;
            data[i + 2] += (b - avg) * vibrance;

            // Apply highlights and shadows
            if (r > 128) data[i] *= highlights;
            else data[i] *= shadows;
            if (g > 128) data[i + 1] *= highlights;
            else data[i + 1] *= shadows;
            if (b > 128) data[i + 2] *= highlights;
            else data[i + 2] *= shadows;

            // Apply noise
            let randomValue = Math.sin(noiseSeed + i * 12.9898) * 43758.5453;
            randomValue = randomValue - Math.floor(randomValue);
            let noiseAmount = (randomValue - 0.5) * noise * scaleFactor;
            data[i] = Math.max(0, Math.min(255, data[i] + noiseAmount));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noiseAmount));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noiseAmount));
        }
        ctx.putImageData(imageData, 0, 0);
        resolve();
    });
}

export function applyGlitchEffects(ctx, canvas, seed = noiseSeed, scaleFactor = 1) {
    return new Promise((resolve) => {
        let randomSeed = seed;
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const resolutionScale = scaleFactor;
        const previewMinDimension = Math.min(width, height);
        const baseShift = 50;

        // Glitch Scanline
        if (settings['glitch-scanline'] > 0) {
            const intensity = settings['glitch-scanline'] / 100;
            for (let y = 0; y < height; y += Math.floor(5 / intensity * resolutionScale)) {
                randomSeed += 1;
                if (seededRandom(randomSeed) < 0.3 * intensity) {
                    const shift = Math.floor(seededRandom(randomSeed + 1) * 50 * intensity * resolutionScale - 25 * intensity * resolutionScale);
                    for (let x = 0; x < width; x++) {
                        const srcIdx = (y * width + x) * 4;
                        const destX = Math.max(0, Math.min(width - 1, x + shift));
                        const destIdx = (y * width + destX) * 4;
                        data[destIdx] = data[srcIdx];
                        data[destIdx + 1] = data[srcIdx + 1];
                        data[destIdx + 2] = data[srcIdx + 2];
                        data[destIdx + 3] = data[srcIdx + 3];
                    }
                }
            }
        }

        // Glitch Chromatic Aberration
        if (settings['glitch-chromatic'] > 0) {
            const intensity = settings['glitch-chromatic'] / 100;
            const maxShift = Math.min(baseShift * intensity * (width / previewMinDimension), Math.min(width, height) / 8);
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

        // Glitch RGB Split
        if (settings['glitch-rgb-split'] > 0) {
            const intensity = settings['glitch-rgb-split'] / 100;
            const maxShift = Math.min(30 * intensity * (Math.max(width, height) / previewMinDimension), Math.max(width, height) / 8);
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    randomSeed += 1;
                    const rShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                    randomSeed += 1;
                    const gShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                    randomSeed += 1;
                    const bShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                    const rX = Math.max(0, Math.min(width - 1, x + rShift));
                    const gX = Math.max(0, Math.min(width - 1, x + gShift));
                    const bX = Math.max(0, Math.min(width - 1, x + bShift));
                    data[idx] = tempData[(y * width + rX) * 4];
                    data[idx + 1] = tempData[(y * width + gX) * 4 + 1];
                    data[idx + 2] = tempData[(y * width + bX) * 4 + 2];
                }
            }
        }

        // Glitch Invert
        if (settings['glitch-invert'] > 0) {
            const intensity = settings['glitch-invert'] / 100;
            for (let y = 0; y < height; y++) {
                randomSeed += 1;
                if (seededRandom(randomSeed) < 0.1 * intensity) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        data[idx] = 255 - data[idx];
                        data[idx + 1] = 255 - data[idx + 1];
                        data[idx + 2] = 255 - data[idx + 2];
                    }
                }
            }
        }

        // Glitch VHS
        if (settings['glitch-vhs'] > 0) {
            const intensity = settings['glitch-vhs'] / 100;
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                randomSeed += 1;
                const shift = Math.floor(seededRandom(randomSeed) * 20 * intensity * resolutionScale - 10 * intensity * resolutionScale);
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const shiftedX = Math.max(0, Math.min(width - 1, x + shift));
                    data[idx] = tempData[(y * width + shiftedX) * 4];
                    data[idx + 1] = tempData[(y * width + shiftedX) * 4 + 1];
                    data[idx + 2] = tempData[(y * width + shiftedX) * 4 + 2];
                }
            }
            for (let y = 0; y < height; y += Math.floor(10 / intensity)) {
                randomSeed += 1;
                if (seededRandom(randomSeed) < 0.2 * intensity) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        data[idx] = data[idx] * 0.9;
                        data[idx + 1] = data[idx + 1] * 0.9;
                        data[idx + 2] = data[idx + 2] * 0.9;
                    }
                }
            }
        }

        // Glitch Chromatic Vertical
        if (settings['glitch-chromatic-vertical'] > 0) {
            const intensity = settings['glitch-chromatic-vertical'] / 100;
            const maxShift = Math.min(baseShift * intensity * (height / previewMinDimension), height / 8);
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                randomSeed += 1;
                const rShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                randomSeed += 1;
                const gShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                randomSeed += 1;
                const bShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const rY = Math.max(0, Math.min(height - 1, y + rShift));
                    const gY = Math.max(0, Math.min(height - 1, y + gShift));
                    const bY = Math.max(0, Math.min(height - 1, y + bShift));
                    data[idx] = tempData[(rY * width + x) * 4];
                    data[idx + 1] = tempData[(gY * width + x) * 4 + 1];
                    data[idx + 2] = tempData[(bY * width + x) * 4 + 2];
                }
            }
        }

        // Glitch Chromatic Diagonal
        if (settings['glitch-chromatic-diagonal'] > 0) {
            const intensity = settings['glitch-chromatic-diagonal'] / 100;
            const maxShift = Math.min(baseShift * intensity * (Math.max(width, height) / previewMinDimension), Math.max(width, height) / 8);
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    randomSeed += 1;
                    const rShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                    randomSeed += 1;
                    const gShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                    randomSeed += 1;
                    const bShift = Math.floor(seededRandom(randomSeed) * maxShift - maxShift / 2);
                    const rX = Math.max(0, Math.min(width - 1, x + rShift));
                    const rY = Math.max(0, Math.min(height - 1, y + rShift));
                    const gX = Math.max(0, Math.min(width - 1, x + gShift));
                    const gY = Math.max(0, Math.min(height - 1, y + gShift));
                    const bX = Math.max(0, Math.min(width - 1, x + bShift));
                    const bY = Math.max(0, Math.min(height - 1, y + bShift));
                    data[idx] = tempData[(rY * width + rX) * 4];
                    data[idx + 1] = tempData[(gY * width + gX) * 4 + 1];
                    data[idx + 2] = tempData[(bY * width + bX) * 4 + 2];
                }
            }
        }

        // Glitch Pixel Shuffle
        if (settings['glitch-pixel-shuffle'] > 0) {
            const intensity = settings['glitch-pixel-shuffle'] / 100;
            const blockSize = Math.max(2, Math.floor(10 * intensity * resolutionScale));
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y += blockSize) {
                for (let x = 0; x < width; x += blockSize) {
                    randomSeed += 1;
                    if (seededRandom(randomSeed) < 0.5 * intensity) {
                        const shiftX = Math.floor(seededRandom(randomSeed + 1) * blockSize * 2 - blockSize);
                        const shiftY = Math.floor(seededRandom(randomSeed + 2) * blockSize * 2 - blockSize);
                        for (let dy = 0; dy < blockSize && y + dy < height; dy++) {
                            for (let dx = 0; dx < blockSize && x + dx < width; dx++) {
                                const srcIdx = ((y + dy) * width + (x + dx)) * 4;
                                const destX = Math.max(0, Math.min(width - 1, x + dx + shiftX));
                                const destY = Math.max(0, Math.min(height - 1, y + dy + shiftY));
                                const destIdx = (destY * width + destX) * 4;
                                data[destIdx] = tempData[srcIdx];
                                data[destIdx + 1] = tempData[srcIdx + 1];
                                data[destIdx + 2] = tempData[srcIdx + 2];
                                data[destIdx + 3] = tempData[srcIdx + 3];
                            }
                        }
                    }
                }
            }
        }

        // Glitch Wave
        if (settings['glitch-wave'] > 0) {
            const intensity = settings['glitch-wave'] / 100;
            const amplitude = 20 * intensity * resolutionScale;
            const frequency = 0.02 / resolutionScale;
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height; y++) {
                const shift = Math.floor(amplitude * Math.sin(frequency * y + randomSeed));
                for (let x = 0; x < width; x++) {
                    const srcIdx = (y * width + x) * 4;
                    const destX = Math.max(0, Math.min(width - 1, x + shift));
                    const destIdx = (y * width + destX) * 4;
                    data[destIdx] = tempData[srcIdx];
                    data[destIdx + 1] = tempData[srcIdx + 1];
                    data[destIdx + 2] = tempData[srcIdx + 2];
                    data[destIdx + 3] = tempData[srcIdx + 3];
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve();
    });
}

export function applyComplexFilters(ctx, canvas, seed = noiseSeed, scaleFactor = 1) {
    return new Promise((resolve) => {
        let randomSeed = seed;
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const resolutionScale = scaleFactor;

        // Pixel Grain
        if (settings['pixel-grain'] > 0) {
            const intensity = settings['pixel-grain'] / 100;
            for (let i = 0; i < data.length; i += 4) {
                randomSeed += 1;
                const noise = (seededRandom(randomSeed) - 0.5) * 50 * intensity * resolutionScale;
                data[i] = Math.max(0, Math.min(255, data[i] + noise));
                data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
                data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
            }
        }

        // Pixel Dither
        if (settings['pixel-dither'] > 0) {
            const intensity = settings['pixel-dither'] / 100;
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            for (let y = 0; y < height - 1; y++) {
                for (let x = 0; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    for (let c = 0; c < 3; c++) {
                        const oldPixel = tempData[idx + c];
                        const newPixel = Math.round(oldPixel / 255 * intensity) * (255 / intensity);
                        tempData[idx + c] = newPixel;
                        const quantError = oldPixel - newPixel;
                        tempData[(y * width + (x + 1)) * 4 + c] += quantError * 7 / 16;
                        tempData[((y + 1) * width + (x - 1)) * 4 + c] += quantError * 3 / 16;
                        tempData[((y + 1) * width + x) * 4 + c] += quantError * 5 / 16;
                        tempData[((y + 1) * width + (x + 1)) * 4 + c] += quantError * 1 / 16;
                    }
                }
            }
            for (let i = 0; i < data.length; i++) {
                data[i] = Math.max(0, Math.min(255, tempData[i]));
            }
        }

        // Kaleidoscope
        if (settings['kaleidoscope-segments'] > 0) {
            const segments = Math.max(2, Math.round(settings['kaleidoscope-segments'] / 10));
            const offset = (settings['kaleidoscope-offset'] / 100) * Math.PI;
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = width;
            tempCanvas.height = height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.putImageData(imageData, 0, 0);
            const centerX = width / 2;
            const centerY = height / 2;
            ctx.clearRect(0, 0, width, height);
            for (let i = 0; i < segments; i++) {
                const angle = (2 * Math.PI / segments) * i + offset;
                ctx.save();
                ctx.translate(centerX, centerY);
                ctx.rotate(angle);
                ctx.scale(i % 2 === 0 ? 1 : -1, 1);
                ctx.drawImage(tempCanvas, -centerX, -centerY);
                ctx.restore();
            }
            imageData = ctx.getImageData(0, 0, width, height);
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
                    const srcX = centerX + distance * Math.cos(angle);
                    const srcY = centerY + distance * Math.sin(angle);
                    const srcXInt = Math.max(0, Math.min(width - 1, Math.round(srcX)));
                    const srcYInt = Math.max(0, Math.min(height - 1, Math.round(srcY)));
                    const srcIdx = (srcYInt * width + srcXInt) * 4;
                    data[idx] = tempData[srcIdx];
                    data[idx + 1] = tempData[srcIdx + 1];
                    data[idx + 2] = tempData[srcIdx + 2];
                    data[idx + 3] = tempData[srcIdx + 3];
                }
            }
        }

        // Edge Detect
        if (settings['edge-detect'] > 0) {
            const intensity = settings['edge-detect'] / 100;
            const tempData = new Uint8ClampedArray(data.length);
            for (let i = 0; i < data.length; i++) tempData[i] = data[i];
            const sobelX = [
                [-1, 0, 1],
                [-2, 0, 2],
                [-1, 0, 1]
            ];
            const sobelY = [
                [-1, -2, -1],
                [0, 0, 0],
                [1, 2, 1]
            ];
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = (y * width + x) * 4;
                    let rX = 0, gX = 0, bX = 0;
                    let rY = 0, gY = 0, bY = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dx = -1; dx <= 1; dx++) {
                            const sampleIdx = ((y + dy) * width + (x + dx)) * 4;
                            const weightX = sobelX[dy + 1][dx + 1];
                            const weightY = sobelY[dy + 1][dx + 1];
                            rX += tempData[sampleIdx] * weightX;
                            gX += tempData[sampleIdx + 1] * weightX;
                            bX += tempData[sampleIdx + 2] * weightX;
                            rY += tempData[sampleIdx] * weightY;
                            gY += tempData[sampleIdx + 1] * weightY;
                            bY += tempData[sampleIdx + 2] * weightY;
                        }
                    }
                    const rEdge = Math.sqrt(rX * rX + rY * rY) * intensity;
                    const gEdge = Math.sqrt(gX * gX + gY * gY) * intensity;
                    const bEdge = Math.sqrt(bX * bX + bY * bY) * intensity;
                    data[idx] = Math.max(0, Math.min(255, rEdge));
                    data[idx + 1] = Math.max(0, Math.min(255, gEdge));
                    data[idx + 2] = Math.max(0, Math.min(255, bEdge));
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve();
    });
}

export function seededRandom(seed) {
    let value = Math.sin(seed) * 43758.5453;
    return value - Math.floor(value);
}
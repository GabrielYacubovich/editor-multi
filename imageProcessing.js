// imageProcessing.js
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

function redrawImage(
    ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
    isShowingOriginal, trueOriginalImage, modal, modalImage, saveState = false,saveImageStateCallback
) {
    if (!img || !fullResCanvas) {
        console.error("redrawImage: img or fullResCanvas is undefined");
        showLoadingIndicator(false);
        return Promise.reject("Missing img or fullResCanvas");
        
    }
    if (saveState && saveImageStateCallback) {
        saveImageStateCallback();
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
            if (saveState) {
                saveImageState(); // Temporary: Assumes saveImageState is global
            }
            showLoadingIndicator(false);
        });
}

function applyAdvancedFilters(ctx, canvas, noiseSeed, scaleFactor) {
    return new Promise(resolve => resolve()); // Placeholder
}

function applyGlitchEffects(ctx, canvas, noiseSeed, scaleFactor) {
    return new Promise(resolve => resolve()); // Placeholder
}

function applyComplexFilters(ctx, canvas, noiseSeed, scaleFactor) {
    return new Promise(resolve => resolve()); // Placeholder
}

export { applyBasicFiltersManually, applyAdvancedFilters, applyGlitchEffects, applyComplexFilters, redrawImage };

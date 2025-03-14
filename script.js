import { closeModal, setupModal, showLoadingIndicator } from './domUtils.js';
import { redrawImage } from './imageProcessing.js';
import { initializeCropHandler, showCropModal, setupCropEventListeners, setTriggerFileUpload } from './cropHandler.js';
import { initializeHistory } from './history.js';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const downloadButton = document.getElementById('download');
const uploadNewPhotoButton = document.getElementById('upload-new-photo');
const cropModal = document.getElementById('crop-modal');
const cropCanvas = document.getElementById('crop-canvas');
const cropCtx = cropCanvas.getContext('2d');const state = {
    canvas,
    ctx,
    img: new Image(),
    settings: {
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
    },
    fullResCanvas: document.createElement('canvas'),
    fullResCtx: null,
    originalWidth: 0,
    originalHeight: 0,
    noiseSeed: Math.random(),
    isShowingOriginal: false,
    trueOriginalImage: new Image(),
    originalUploadedImage: new Image(),
    originalFullResImage: new Image(),
    modal: document.getElementById('image-modal'),
    modalImage: document.getElementById('modal-image'),
    history: [],
    redoHistory: [],
    lastAppliedEffect: null,
};

state.fullResCtx = state.fullResCanvas.getContext('2d');
initializeHistory(state);

// Variables for triggerFileUpload
let isTriggering = false;
let fileInput = null;

state.img.onload = () => {
    state.originalWidth = state.img.width;
    state.originalHeight = state.img.height;
    state.fullResCanvas.width = state.originalWidth;
    state.fullResCanvas.height = state.originalHeight;
    state.fullResCtx.drawImage(state.img, 0, 0, state.originalWidth, state.originalHeight);

    const maxWidth = Math.min(1920, window.innerWidth - 100);
    const maxHeight = window.innerHeight - 250;
    const ratio = state.originalWidth / state.originalHeight;
    state.canvas.width = ratio > 1 ? Math.min(maxWidth, state.originalWidth) : maxHeight * ratio;
    state.canvas.height = ratio > 1 ? state.canvas.width / ratio : Math.min(maxHeight, state.originalHeight);

    redrawImage(state, true)
        .then(() => {
            state.originalFullResImage.src = state.fullResCanvas.toDataURL('image/png');
            uploadNewPhotoButton.style.display = 'block';
        })
        .catch(err => console.error('Initial redraw failed:', err));
};

// Consolidated triggerFileUpload function
function triggerFileUpload() {
    if (isTriggering) return; // Prevent multiple triggers
    isTriggering = true;
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            cleanupFileInput();
            return;
        }
        const reader = new FileReader();
        reader.onload = (event) => {
            state.trueOriginalImage.src = event.target.result;
            state.originalUploadedImage.src = event.target.result;
            state.img.src = event.target.result;
            showCropModal(event.target.result);
            cleanupFileInput();
        };
        reader.onerror = () => {
            console.error('File reading failed');
            cleanupFileInput();
        };
        reader.readAsDataURL(file);
    });

    fileInput.click();
    // Timeout to clean up if no file is selected
    setTimeout(() => {
        if (isTriggering && fileInput && document.body.contains(fileInput)) {
            cleanupFileInput();
        }
    }, 1000);
}

document.addEventListener('DOMContentLoaded', () => {
    setupModal(state.modal, false);
    setupModal(cropModal, false);
    initializeCropHandler({
        cropModal, cropCanvas, cropCtx, canvas: state.canvas, ctx: state.ctx,
        fullResCanvas: state.fullResCanvas, fullResCtx: state.fullResCtx, img: state.img,
        trueOriginalImage: state.trueOriginalImage, originalUploadedImage: state.originalUploadedImage,
        originalFullResImage: state.originalFullResImage, modal: state.modal, modalImage: state.modalImage,
        settings: state.settings, noiseSeed: state.noiseSeed, isShowingOriginal: state.isShowingOriginal,
        originalWidth: state.originalWidth, originalHeight: state.originalHeight,
        uploadNewPhotoButton
    });
    setTriggerFileUpload(triggerFileUpload);
    setupCropEventListeners();
});

// Trigger initial file upload or use a default image if needed
uploadNewPhotoButton.addEventListener('click', triggerFileUpload); // Ensure this sets state.img.src



function cleanupFileInput() {
    if (fileInput && document.body.contains(fileInput)) {
        document.body.removeChild(fileInput);
    }
    fileInput = null;
    isTriggering = false;
}

document.addEventListener('DOMContentLoaded', () => {
    setupModal(state.modal, false);
    setupModal(cropModal, false);
    initializeCropHandler({
        cropModal, cropCanvas, cropCtx, canvas: state.canvas, ctx: state.ctx,
        fullResCanvas: state.fullResCanvas, fullResCtx: state.fullResCtx, img: state.img,
        trueOriginalImage: state.trueOriginalImage, originalUploadedImage: state.originalUploadedImage,
        originalFullResImage: state.originalFullResImage, modal: state.modal, modalImage: state.modalImage,
        settings: state.settings, noiseSeed: state.noiseSeed, isShowingOriginal: state.isShowingOriginal,
        originalWidth: state.originalWidth, originalHeight: state.originalHeight,
        uploadNewPhotoButton
    });
    setTriggerFileUpload(triggerFileUpload); // Pass the function to cropHandler.js
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
    controlValues.forEach(id => {
        const indicator = document.getElementById(`${id}-value`);
        if (indicator) {
            indicator.textContent = id === 'kaleidoscope-segments' ? `${settings[id]}` : `${settings[id]}%`;
        }
    });
}

toggleOriginalButton.addEventListener('click', () => {
    console.log("Toggle clicked, originalImageData:", !!originalImageData, "trueOriginalImage:", trueOriginalImage.complete);
    if (!originalImageData || !trueOriginalImage.complete || trueOriginalImage.naturalWidth === 0) {
        console.error("Cannot toggle: Original image data is missing or invalid");
        return;
    }
    isShowingOriginal = !isShowingOriginal;
    toggleOriginalButton.textContent = isShowingOriginal ? 'Editada' : 'Original';
    redrawImage(
        ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
        isShowingOriginal, trueOriginalImage, modal, modalImage, false, saveImageState
    ).catch(err => {
        console.error("Toggle redraw failed:", err);
    });
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
    const isEdited = Object.values(state.settings).some(value => value !== 100 && value !== 0);
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
    const originalDataURL = state.img.src;

    function updateFileInfo() {
        const scale = parseFloat(resolutionSelect.value) / 100;
        const width = Math.round((state.originalWidth || 1) * scale);
        const height = Math.round((state.originalHeight || 1) * scale);
        dimensionsSpan.textContent = `${width} x ${height}`;
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';
        if (state.originalWidth && state.originalHeight) {
            tempCtx.drawImage(state.fullResCanvas, 0, 0, width, height);
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
    const saveCancelBtn = document.getElementById('save-cancel');

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
        tempCanvas.width = Math.round(state.originalWidth * scale);
        tempCanvas.height = Math.round(state.originalHeight * scale);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        // Ensure redrawImage updates fullResCanvas before drawing
        redrawImage(state, false)
            .then(() => {
                tempCtx.drawImage(state.fullResCanvas, 0, 0, tempCanvas.width, tempCanvas.height);
                const quality = fileType === 'image/png' ? undefined : 1.0;
                tempCanvas.toBlob((blob) => {
                    if (!blob) {
                        console.error('Generated blob is empty');
                        showLoadingIndicator(false);
                        document.body.removeChild(popup);
                        document.body.removeChild(overlay);
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
            })
            .catch(error => {
                console.error('Error during redraw for download:', error);
                showLoadingIndicator(false);
                document.body.removeChild(popup);
                document.body.removeChild(overlay);
            });
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

        // Verify img is valid
        if (!img || !img.complete || img.naturalWidth === 0) {
            console.error("handleUndo: img is invalid", img);
            return; // Exit early if img isn’t ready
        }

        console.log("handleUndo - Applying previous settings:", settings);
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, false
        ).then(() => {
            console.log("Undo redraw completed successfully");
        }).catch(err => {
            console.error("Undo redraw failed:", err);
        });
    } else {
        console.log("handleUndo: No previous state to undo");
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
        
        // Use cropImage if crop modal is open, otherwise use img
        const activeImage = (cropModal.style.display === 'block' && cropImage.complete && cropImage.naturalWidth !== 0) ? cropImage : img;
        if (!activeImage || !activeImage.complete || activeImage.naturalWidth === 0) {
            console.error("handleRedo: No valid image available", activeImage);
            return;
        }
        
        redrawImage(
            ctx, canvas, fullResCanvas, fullResCtx, activeImage, settings, noiseSeed,
            isShowingOriginal, trueOriginalImage, modal, modalImage, false
        ).catch(err => {
            console.error("Redo failed:", err);
        });
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
    if (!img.src || img.src === "") return;
    showCropModal();
});

cropImageButton.addEventListener('touchend', (e) => {
    e.preventDefault();
    if (!img.src || img.src === "") return;
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
    };
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

canvas.addEventListener('click', (e) => {
    const isNotIOS = !/iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isNotIOS) {
        try {
            const controlsContainer = document.querySelector('.controls');
            const modalControls = document.getElementById('modal-controls');
            if (!controlsContainer || !modalControls) return;
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
                    redrawImage(ctx, canvas, fullResCanvas, fullResCtx, img, settings, noiseSeed, isShowingOriginal, trueOriginalImage, modal, modalImage, true);
                }, 300));
            });
            modal.style.display = 'block';
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

document.addEventListener('DOMContentLoaded', () => {
    isTriggering = false;
    cleanupFileInput();
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






export { state };
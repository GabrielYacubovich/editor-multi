function closeModal(modalElement) {function closeModal(modalElement) {
    modalElement.style.display = 'none';
    if (modalElement === cropModal) {
        isDragging = false;
        cropCanvas.style.cursor = 'default';
        uploadNewPhotoButton.style.display = 'block';
        if (isTriggering) {
            cleanupFileInput();
        }
    }
}
modalElement.style.display = 'none';


    if (modalElement === modal) {
        document.getElementById('modal-controls').innerHTML = '';
    }
}
function setupModal(modalElement, allowOutsideClick = false) {
    const closeBtn = modalElement.querySelector('.modal-close-btn');
    if (closeBtn) {
        closeBtn.removeEventListener('click', closeModalHandler);
        closeBtn.addEventListener('click', closeModalHandler);
    }
    if (allowOutsideClick) {
        modalElement.removeEventListener('click', outsideClickHandler);
        modalElement.addEventListener('click', outsideClickHandler);
    }
}

function closeModalHandler() {
    const modal = this.closest('.modal');
    closeModal(modal);
}

function outsideClickHandler(e) {
    if (e.target === this) {
        closeModal(this);
    }
}
function showLoadingIndicator(show = true) {
    const loading = document.getElementById('loading-indicator');
    if (!loading) {
        const div = document.createElement('div');
        div.id = 'loading-indicator';
        div.style.position = 'absolute';
        div.style.bottom = '10px';
        div.style.left = '50%';
        div.style.transform = 'translateX(-50%)';
        div.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        div.style.color = 'white';
        div.style.padding = '10px 20px';
        div.style.borderRadius = '5px';
        div.style.zIndex = '1003';
        div.textContent = 'Rendering...';
        document.body.appendChild(div);
    }
    loading.style.display = show ? 'block' : 'none';
    if (show && canvas) {
        const canvasRect = canvas.getBoundingClientRect();
        loading.style.left = `${canvasRect.left + canvasRect.width / 2}px`;
        loading.style.top = `${canvasRect.bottom + 10}px`;
    }
}
export { closeModal, setupModal, closeModalHandler, outsideClickHandler, showLoadingIndicator };
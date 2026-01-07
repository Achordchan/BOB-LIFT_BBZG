(function () {
  function getEl(id) {
    return document.getElementById(id);
  }

  function bindModalClose(modalId, handlers = {}) {
    const modal = getEl(modalId);
    if (!modal) return null;

    const onClose = typeof handlers.onClose === 'function' ? handlers.onClose : null;
    const escClose = !!handlers.escClose;

    const close = () => {
      try {
        if (onClose) onClose();
      } catch (e) {}
      modal.style.display = 'none';
    };

    const closeBtn = handlers.closeSelector ? modal.querySelector(handlers.closeSelector) : null;
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }

    const cancelBtn = handlers.cancelId ? getEl(handlers.cancelId) : null;
    if (cancelBtn) {
      cancelBtn.addEventListener('click', close);
    }

    if (handlers.overlayClose) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          close();
        }
      });
    }

    if (escClose && !modal.__escCloseBound) {
      modal.__escCloseBound = true;
      document.addEventListener('keydown', function (e) {
        if (!e) return;
        const key = e.key || e.code;
        if (key !== 'Escape' && key !== 'Esc') return;
        if (modal.style.display === 'none') return;
        close();
      });
    }

    return { close };
  }

  window.ModalCore = {
    bindModalClose
  };
})();

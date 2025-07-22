(function(){
  let activeDialog = null;

  window.showDialog = function(message, options = {}) {
    const { cancel = false, okText = 'OK', cancelText = 'Cancelar' } = options;

    // If a dialog is already displayed return its promise
    if (activeDialog) {
      return activeDialog.promise;
    }

    let resolveFn;
    const promise = new Promise(resolve => {
      resolveFn = resolve;
    });

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const modal = document.createElement('div');
    modal.className = 'modal';

    const p = document.createElement('p');
    p.className = 'modal-message';
    p.textContent = message;
    modal.appendChild(p);

    const btnWrap = document.createElement('div');
    btnWrap.className = 'modal-buttons';

    if (cancel) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'secondary';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => {
        document.body.removeChild(overlay);
        activeDialog = null;
        resolveFn(false);
      });
      btnWrap.appendChild(cancelBtn);
    }

    const okBtn = document.createElement('button');
    okBtn.className = 'primary';
    okBtn.textContent = okText;
    okBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      activeDialog = null;
      resolveFn(true);
    });
    btnWrap.appendChild(okBtn);

    modal.appendChild(btnWrap);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    activeDialog = { overlay, promise };
    return promise;
  };
})();

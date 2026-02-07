(function () {
  function useSwal() { return typeof window !== 'undefined' && typeof window.Swal !== 'undefined'; }

  // Create (or get) a themed Swal instance without overriding Swal.fire to avoid recursion
  function ensureThemedSwal() {
    if (!useSwal()) return null;
    if (window.__swalThemed) return window.__swalThemed;

    // Preserve original fire just in case we need it
    if (!window.__swalOriginalFire && typeof Swal.fire === 'function') {
      window.__swalOriginalFire = Swal.fire.bind(Swal);
    }

    const themed = Swal.mixin({
      buttonsStyling: false,
      allowOutsideClick: true,
      focusConfirm: false,
      showClass: { popup: 'swal2-animate-show' },
      hideClass: { popup: 'swal2-animate-hide' }
    });
    window.__swalThemed = themed;
    return themed;
  }

  function fireThemed(options) {
    if (!useSwal()) return null;
    const themed = ensureThemedSwal();
    if (themed && typeof themed.fire === 'function') {
      return themed.fire(options);
    }
    if (window.__swalOriginalFire) {
      return window.__swalOriginalFire(options);
    }
    return null;
  }

  function ensureNotify() {
    if (window.notify) return;
    window.notify = {
      // Increased default timers for longer visibility
      success: (title = 'تم', text = '', timer = 3000) => useSwal() ? fireThemed({ icon: 'success', title, text, timer, showConfirmButton: false, showCloseButton: true }) : alert(title + (text ? ('\n' + text) : '')),
      error: (title = 'خطأ', text = '', timer = 4000) => useSwal() ? fireThemed({ icon: 'error', title, text, timer, showConfirmButton: true, showCloseButton: true }) : alert(title + (text ? ('\n' + text) : '')),
      info: (title = 'معلومة', text = '') => useSwal() ? fireThemed({ icon: 'info', title, text, showCloseButton: true }) : alert(title + (text ? ('\n' + text) : '')),
      toast: (text, type = 'success', position = 'top-end', timer = 3500) => useSwal() ? fireThemed({ toast: true, position, icon: type, title: text, showConfirmButton: false, showCloseButton: true, timer, timerProgressBar: true }) : console.log(`[${type}] ${text}`),
      confirm: (title = 'تأكيد', text = 'هل أنت متأكد؟') => useSwal() ? fireThemed({ icon: 'question', title, text, showCancelButton: true, showCloseButton: true, confirmButtonText: 'تأكيد', cancelButtonText: 'إلغاء' }) : Promise.resolve({ isConfirmed: confirm(title + '\n' + text) }),
      // Persistent loading dialog (no auto close)
      loading: (title = 'جارى المعالجة', text = 'من فضلك لا تغادر الصفحة قبل إتمام طلبك.') => useSwal() ? fireThemed({
        title,
        html: text,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false,
        showCloseButton: false,
        customClass: {
          container: 'swal2-processing-container',
          popup: 'swal2-processing-popup',
          title: 'swal2-processing-title',
          htmlContainer: 'swal2-processing-text'
        },
        didOpen: () => { Swal.showLoading(); }
      }) : null,
      close: () => { if (useSwal()) Swal.close(); }
    };
  }

  // Initialize now if Swal is ready
  ensureNotify();
  if (useSwal()) ensureThemedSwal();
  // And try again after full load in case Swal loads later
  window.addEventListener('load', () => { if (useSwal()) ensureThemedSwal(); ensureNotify(); });
})();

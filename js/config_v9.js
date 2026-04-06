/**
 * Global Configuration for Telegram Links
 * رابط الدعم: https://t.me/OMAR_M_SHEHATA
 * رابط القناة: https://t.me/pandaadds
 * رابط API: https://api.pandastore.store
 */
(function() {
  'use strict';
  
  // Telegram Links Configuration
  window.TELEGRAM_CONFIG = {
    SUPPORT_LINK: 'https://t.me/OMAR_M_SHEHATA',
    CHANNEL_LINK: 'https://t.me/pandaadds',
    API_BASE_URL: 'https://api.pandastore.store',
    TELEGRAM_LOGIN_BOT_ID: '7380609755',
    TELEGRAM_LOGIN_CLIENT_ID: '8543314208',
    TELEGRAM_LOGIN_BOT_USERNAME: 'PandaStores_bot'
  };

  // Global API helpers for all pages
  window.API_BASE_URL = window.TELEGRAM_CONFIG.API_BASE_URL;
  
  window.buildApiUrl = function(path) {
    const rawPath = String(path || '').trim();
    if (!rawPath) return window.API_BASE_URL;
    if (/^https?:\/\//i.test(rawPath)) return rawPath;
    return `${window.API_BASE_URL}${rawPath.startsWith('/') ? '' : '/'}${rawPath}`;
  };
  
  // Helper functions for opening links
  window.openSupportLink = function() {
    window.open(window.TELEGRAM_CONFIG.SUPPORT_LINK, '_blank');
  };
  
  window.openChannelLink = function() {
    window.open(window.TELEGRAM_CONFIG.CHANNEL_LINK, '_blank');
  };

  // Suppress console warnings for privacy tracking and benign errors
  (function() {
    const originalError = console.error;
    const originalWarn = console.warn;
    
    // List of patterns to suppress
    const suppressPatterns = [
      /Tracking Prevention/i,
      /Content Security Policy/i,
      /unpkg\.com/i
    ];
    
    const shouldSuppress = (message) => {
      if (!message) return false;
      return suppressPatterns.some(pattern => pattern.test(String(message)));
    };
    
    // Override console.error
    console.error = function(...args) {
      if (!shouldSuppress(args[0])) {
        originalError.apply(console, args);
      }
    };
    
    // Override console.warn
    console.warn = function(...args) {
      if (!shouldSuppress(args[0])) {
        originalWarn.apply(console, args);
      }
    };
  })();

  // Global language suggestion popup (always show when current page language differs)
  window.__globalLangSuggestV2 = true;

  function getBrowserBaseLang() {
    const raw = (navigator.languages && navigator.languages[0] ? navigator.languages[0] : (navigator.language || 'en')).toLowerCase();
    return raw.split('-')[0];
  }

  function detectCurrentPageLang(pathname) {
    const supported = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ru'];
    const lowerPath = String(pathname || '').toLowerCase();
    const premiumMatch = lowerPath.match(/^\/premium\/(ar|de|en|es|fr|it|ru)(?:\/|$)/);
    if (premiumMatch) return premiumMatch[1];
    const normalMatch = lowerPath.match(/^\/(ar|de|en|es|fr|it|ru)(?:\/|$)/);
    if (normalMatch) return normalMatch[1];
    return 'en';
  }

  function buildTargetUrl(targetLang) {
    const lowerPath = window.location.pathname.toLowerCase();
    const isPremiumPath = lowerPath === '/premium.html' || lowerPath.startsWith('/premium/');
    if (isPremiumPath) {
      return targetLang === 'en' ? '/premium/' : '/premium/' + targetLang + '/';
    }
    return targetLang === 'en' ? '/' : '/' + targetLang + '/';
  }

  function formatTemplate(template, browserLanguageName, currentLanguageName) {
    return String(template || '')
      .replaceAll('{browserLanguage}', browserLanguageName)
      .replaceAll('{currentLanguage}', currentLanguageName);
  }

  function showLanguageSuggestionPopup() {
    // Allow popup only on root/language/premium index pages.
    const path = window.location.pathname.toLowerCase();
    const allowedPathPatterns = [
      /^\/$/,
      /^\/index\.html$/,
      /^\/index_v8\.html$/,
      /^\/(ar|de|en|es|fr|it|ru)\/$/,
      /^\/(ar|de|en|es|fr|it|ru)\/index\.html$/,
      /^\/(ar|de|en|es|fr|it|ru)\/index_v8\.html$/,
      /^\/premium\/$/,
      /^\/premium\.html$/,
      /^\/premium\/index\.html$/,
      /^\/premium\/index_v8\.html$/,
      /^\/premium\/(ar|de|en|es|fr|it|ru)\/$/,
      /^\/premium\/(ar|de|en|es|fr|it|ru)\/index\.html$/,
      /^\/premium\/(ar|de|en|es|fr|it|ru)\/index_v8\.html$/
    ];
    const isAllowedPath = allowedPathPatterns.some(function(pattern) {
      return pattern.test(path);
    });
    if (!isAllowedPath) return;

    const supportedLangs = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ru'];
    const browserLang = getBrowserBaseLang();
    if (!supportedLangs.includes(browserLang)) return;

    const currentLang = detectCurrentPageLang(window.location.pathname);
    if (currentLang === browserLang) return;

    const popupCopy = {
      ar: {
        title: 'اقتراح اللغة',
        text: 'يبدو أن لغة متصفحك هي {browserLanguage}. هل تريد الاستمرار باللغة الحالية ({currentLanguage}) أم التحويل إلى {browserLanguage}. يمكنك إغلاق الرسالة للاستمرار هنا.',
        button: 'تحويل إلى {browserLanguage}'
      },
      de: {
        title: 'Sprachempfehlung',
        text: 'Deine Browsersprache scheint {browserLanguage} zu sein. Moechtest du auf der aktuellen Sprache ({currentLanguage}) bleiben oder zu {browserLanguage} wechseln. Schliessen behaelt diese Seite.',
        button: 'Zu {browserLanguage} wechseln'
      },
      en: {
        title: 'Language Suggestion',
        text: 'Your browser language appears to be {browserLanguage}. Do you want to continue with the current language ({currentLanguage}) or switch to {browserLanguage}. Close to stay on this page.',
        button: 'Switch to {browserLanguage}'
      },
      es: {
        title: 'Sugerencia de idioma',
        text: 'Parece que el idioma de tu navegador es {browserLanguage}. Deseas continuar con el idioma actual ({currentLanguage}) o cambiar a {browserLanguage}. Cierra para seguir en esta pagina.',
        button: 'Cambiar a {browserLanguage}'
      },
      fr: {
        title: 'Suggestion de langue',
        text: 'La langue de votre navigateur semble etre {browserLanguage}. Voulez-vous rester sur la langue actuelle ({currentLanguage}) ou passer a {browserLanguage}. Fermez pour rester sur cette page.',
        button: 'Passer en {browserLanguage}'
      },
      it: {
        title: 'Suggerimento lingua',
        text: 'La lingua del tuo browser sembra {browserLanguage}. Vuoi continuare con la lingua attuale ({currentLanguage}) o passare a {browserLanguage}. Chiudi per restare su questa pagina.',
        button: 'Passa a {browserLanguage}'
      },
      ru: {
        title: 'Predlozhenie yazyka',
        text: 'Pokhozhe, yazyk vashego brauzera - {browserLanguage}. Ostavit tekushchiy yazyk ({currentLanguage}) ili pereyti na {browserLanguage}. Zakroyte, chtoby ostatsya na tekushchey stranitse.',
        button: 'Pereyti na {browserLanguage}'
      }
    };

    const fallbackNames = {
      ar: 'Arabic',
      de: 'German',
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      it: 'Italian',
      ru: 'Russian'
    };

    const langDisplay = (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function')
      ? new Intl.DisplayNames([browserLang], { type: 'language' })
      : null;

    const browserLanguageName = langDisplay ? (langDisplay.of(browserLang) || fallbackNames[browserLang]) : fallbackNames[browserLang];
    const currentLanguageName = langDisplay ? (langDisplay.of(currentLang) || fallbackNames[currentLang]) : fallbackNames[currentLang];
    const ui = popupCopy[browserLang] || popupCopy.en;

    const popupText = formatTemplate(ui.text, browserLanguageName, currentLanguageName);
    const targetUrl = buildTargetUrl(browserLang);

    if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
      Swal.fire({
        title: ui.title,
        text: popupText,
        backdrop: false,
        didOpen: function () { const c = Swal.getContainer(); if (c) c.style.backdropFilter = 'none'; },
        showCancelButton: false,
        showCloseButton: true,
        confirmButtonText: formatTemplate(ui.button, browserLanguageName, currentLanguageName),
        allowOutsideClick: false
      }).then(function(result) {
        if (result.isConfirmed) {
          window.location.href = targetUrl;
        }
      });
      return;
    }

    // Fallback for pages that do not load SweetAlert.
    if (window.confirm(popupText)) {
      window.location.href = targetUrl;
    }
  }

  function waitForSwalAndShow(triesLeft) {
    if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
      showLanguageSuggestionPopup();
      return;
    }
    if (triesLeft <= 0) {
      showLanguageSuggestionPopup();
      return;
    }
    setTimeout(function() {
      waitForSwalAndShow(triesLeft - 1);
    }, 300);
  }

  function isWalletUiTargetPage() {
    const path = String(window.location.pathname || '').toLowerCase();
    const patterns = [
      /^\/$/,
      /^\/index\.html$/,
      /^\/buy-telegram-stars(?:\.html)?$/,
      /^\/(ar|de|en|es|fr|it|ru)\/$/,
      /^\/(ar|de|en|es|fr|it|ru)\/index\.html$/,
      /^\/(ar|de|en|es|fr|it|ru)\/buy-telegram-stars(?:\.html)?$/
    ];
    return patterns.some(function(pattern) {
      return pattern.test(path);
    });
  }

  function isBuyTelegramStarsPage() {
    const path = String(window.location.pathname || '').toLowerCase();
    return /\/buy-telegram-stars(?:\.html)?$/.test(path);
  }

  function isMobileViewport() {
    return window.matchMedia('(max-width: 991px)').matches;
  }

  function injectWalletPlacementStyles() {
    if (document.getElementById('wallet-placement-v9-style')) return;

    const style = document.createElement('style');
    style.id = 'wallet-placement-v9-style';
    style.textContent = [
      '.wallet-connect-nav-slot{display:flex;align-items:center;justify-content:flex-end;min-width:190px;margin-inline-start:12px;}',
      '.wallet-connect-nav-slot > div{width:100%;}',
      '.wallet-connect-mobile-slot{width:100%;margin:14px 0 8px;}',
      '.wallet-connect-mobile-slot > div{width:100%;}',
      '.wallet-connect-mobile-slot button{width:100% !important;}',
      '@media (max-width: 991px){.wallet-connect-nav-slot{display:none !important;}}',
      '@media (min-width: 992px){.wallet-connect-mobile-slot{display:none !important;}}'
    ].join('');
    document.head.appendChild(style);
  }

  function getWalletRootIdForPage() {
    return isBuyTelegramStarsPage() ? 'ton-connect-btn' : 'ton-connect-premium';
  }

  function getWalletRootElement() {
    return document.getElementById(getWalletRootIdForPage());
  }

  function ensureWalletSlots() {
    const navbarWrapper = document.querySelector('.navbar .navbar-wrapper') || document.querySelector('.navbar');
    const mobileMenuBody = document.querySelector('#mobile_menu_container .mobile-menu-body');
    if (!navbarWrapper || !mobileMenuBody) return null;

    let desktopSlot = document.getElementById('wallet-connect-nav-slot');
    if (!desktopSlot) {
      desktopSlot = document.createElement('div');
      desktopSlot.id = 'wallet-connect-nav-slot';
      desktopSlot.className = 'wallet-connect-nav-slot';
      navbarWrapper.appendChild(desktopSlot);
    }

    let mobileSlot = document.getElementById('wallet-connect-mobile-slot');
    if (!mobileSlot) {
      mobileSlot = document.createElement('div');
      mobileSlot.id = 'wallet-connect-mobile-slot';
      mobileSlot.className = 'wallet-connect-mobile-slot';
      mobileMenuBody.insertBefore(mobileSlot, mobileMenuBody.firstChild);
    }

    return { desktopSlot: desktopSlot, mobileSlot: mobileSlot };
  }

  function moveWalletButtonToResponsiveSlot() {
    if (!isWalletUiTargetPage()) return;

    const walletRoot = getWalletRootElement();
    const slots = ensureWalletSlots();
    if (!walletRoot || !slots) return;

    if (isMobileViewport()) {
      if (walletRoot.parentElement !== slots.mobileSlot) {
        slots.mobileSlot.appendChild(walletRoot);
      }
      return;
    }

    if (walletRoot.parentElement !== slots.desktopSlot) {
      slots.desktopSlot.appendChild(walletRoot);
    }
  }

  function openMobileMenuForWallet() {
    const mobileMenu = document.getElementById('mobile_menu_container');
    if (!mobileMenu || !isMobileViewport()) return;

    if (window.jQuery && typeof window.jQuery.fn.show === 'function') {
      window.jQuery(mobileMenu).show();
    } else {
      mobileMenu.style.display = 'block';
    }
  }

  function isWalletConnectedLikely(walletRoot) {
    const walletButton = walletRoot ? walletRoot.querySelector('button') : null;
    if (!walletButton) return false;

    const text = String(walletButton.textContent || walletButton.getAttribute('aria-label') || '').toLowerCase().trim();
    if (!text) return false;

    const connectHints = /(connect|wallet|ربط|محفظ|подключ|conectar|verbinden|connetti|connecter)/i;
    if (connectHints.test(text)) return false;

    const addressHints = /(0:[a-f0-9]{10,}|\b(eq|uq)[a-z0-9_-]{8,}\b|[a-z0-9]{3,}\.\.\.[a-z0-9]{3,})/i;
    return addressHints.test(text) || text.length > 5;
  }

  function triggerWalletButtonClick(retryCount, onMissingButton) {
    const walletRoot = getWalletRootElement();
    const walletButton = walletRoot ? walletRoot.querySelector('button') : null;
    if (walletButton) {
      walletButton.click();
      return;
    }

    if (retryCount <= 0) {
      if (typeof onMissingButton === 'function') {
        onMissingButton();
      }
      return;
    }

    setTimeout(function() {
      triggerWalletButtonClick(retryCount - 1, onMissingButton);
    }, 150);
  }

  let bypassBuyInterceptOnce = false;

  function bindBuyAutoConnectBehavior() {
    if (!isWalletUiTargetPage()) return;

    document.addEventListener('click', function(event) {
      const trigger = event.target && event.target.closest
        ? event.target.closest('.btn-buy, button[onclick*="payWithTON"], a[onclick*="payWithTON"]')
        : null;

      if (!trigger) return;
      if (bypassBuyInterceptOnce) {
        bypassBuyInterceptOnce = false;
        return;
      }

      const walletRoot = getWalletRootElement();
      if (!walletRoot || isWalletConnectedLikely(walletRoot)) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      moveWalletButtonToResponsiveSlot();
      openMobileMenuForWallet();
      triggerWalletButtonClick(12, function() {
        // If TON button failed to render in time, continue original buy flow.
        if (typeof window.payWithTON === 'function') {
          window.payWithTON();
          return;
        }

        bypassBuyInterceptOnce = true;
        trigger.click();
      });
    }, true);
  }

  function initWalletPlacementAndBuyFlow() {
    if (!isWalletUiTargetPage()) return;

    injectWalletPlacementStyles();
    moveWalletButtonToResponsiveSlot();
    bindBuyAutoConnectBehavior();

    window.addEventListener('resize', moveWalletButtonToResponsiveSlot);
    setTimeout(moveWalletButtonToResponsiveSlot, 250);
    setTimeout(moveWalletButtonToResponsiveSlot, 1000);
  }

  function getCurrentUiLang() {
    const bodyLang = String((document.body && document.body.className) || '').trim().toLowerCase();
    if (/^(ar|de|en|es|fr|it|ru)$/.test(bodyLang)) return bodyLang;

    const pathMatch = String(window.location.pathname || '').toLowerCase().match(/^\/(ar|de|en|es|fr|it|ru)(?:\/|$)/);
    return pathMatch ? pathMatch[1] : 'en';
  }

  function hasStarsSelection() {
    const starsInput = document.getElementById('stars');
    const checkedRadio = document.querySelector('input[name="stars"]:checked');
    if (checkedRadio) {
      const radioValue = parseInt(String(checkedRadio.value || '').trim(), 10);
      if (Number.isFinite(radioValue) && radioValue >= 50) {
        return true;
      }
    }

    if (!starsInput) return false;

    const value = parseInt(String(starsInput.value || '').trim(), 10);
    return Number.isFinite(value) && value >= 50;
  }

  function hasManualTypedStars() {
    const starsInput = document.getElementById('stars');
    if (!starsInput) return false;

    const isManual = starsInput.dataset.manualTyped === '1';
    const value = parseInt(String(starsInput.value || '').trim(), 10);
    return isManual && Number.isFinite(value) && value >= 50;
  }

  function getSelectedPresetStars() {
    const checkedRadio = document.querySelector('input[name="stars"]:checked');
    if (!checkedRadio) return 0;

    const radioValue = parseInt(String(checkedRadio.value || '').trim(), 10);
    return Number.isFinite(radioValue) && radioValue >= 50 ? radioValue : 0;
  }

  function getEffectiveStarsValueForSubmit() {
    const starsInput = document.getElementById('stars');
    if (!starsInput) return 0;

    const manualValue = parseInt(String(starsInput.dataset.manualValue || starsInput.value || '').trim(), 10);
    if (starsInput.dataset.manualTyped === '1' && Number.isFinite(manualValue) && manualValue >= 50) {
      return manualValue;
    }

    return getSelectedPresetStars();
  }

  function withEffectiveStarsInput(executor, context, args) {
    const starsInput = document.getElementById('stars');
    if (!starsInput || typeof executor !== 'function') {
      return executor.apply(context, args || []);
    }

    const hadManualValue = starsInput.dataset.manualTyped === '1';
    const manualValue = String(starsInput.dataset.manualValue || starsInput.value || '');
    const originalValue = String(starsInput.value || '');
    const effectiveValue = getEffectiveStarsValueForSubmit();

    if (effectiveValue >= 50) {
      starsInput.value = String(effectiveValue);
    }

    const restore = function() {
      if (hadManualValue) {
        starsInput.value = manualValue;
      } else {
        starsInput.value = '';
      }
      applyNoDefaultStarsUi();
    };

    try {
      const result = executor.apply(context, args || []);
      if (result && typeof result.then === 'function') {
        return result.finally(restore);
      }
      restore();
      return result;
    } catch (error) {
      starsInput.value = originalValue;
      applyNoDefaultStarsUi();
      throw error;
    }
  }

  function rememberManualStarsValue(starsInput) {
    if (!starsInput) return;
    starsInput.dataset.manualTyped = '1';
    starsInput.dataset.manualValue = String(starsInput.value || '');
  }

  function bindManualStarsTracking() {
    const starsInput = document.getElementById('stars');
    if (!starsInput || starsInput.dataset.manualTrackerBound === '1') return;

    starsInput.dataset.manualTrackerBound = '1';
    starsInput.dataset.manualTyped = '0';
    starsInput.dataset.manualValue = '';

    starsInput.addEventListener('input', function() {
      rememberManualStarsValue(starsInput);
      applyNoDefaultStarsUi();
    });
  }

  function keepPresetAsSelectionOnly() {
    const starsInput = document.getElementById('stars');
    if (!starsInput) return;

    document.querySelectorAll('input[name="stars"]').forEach(function(radio) {
      if (radio.dataset.selectionOnlyBound === '1') return;
      radio.dataset.selectionOnlyBound = '1';

      radio.addEventListener('change', function() {
        const hasManual = starsInput.dataset.manualTyped === '1';
        const manualValue = String(starsInput.dataset.manualValue || '');

        setTimeout(function() {
          // Preset options should stay as option only and not populate typed input.
          starsInput.value = hasManual ? manualValue : '';
          applyNoDefaultStarsUi();
        }, 0);
      });
    });
  }

  function applyNoDefaultStarsUi() {
    const starsInput = document.getElementById('stars');
    if (!starsInput) return;
    const manualTyped = hasManualTypedStars();

    const preview = document.getElementById('preview');
    if (preview && !manualTyped) {
      preview.textContent = '';
    }

    document.querySelectorAll('.quantity').forEach(function(quantityEl) {
      if (!manualTyped) {
        quantityEl.textContent = '';
      }
    });
  }

  function clearDefaultStarsSelectionIfNeeded() {
    const starsInput = document.getElementById('stars');
    if (!starsInput) return;

    // Keep default/preset radio selection active, but don't force text input value.
    if (starsInput.dataset.manualTyped !== '1') {
      starsInput.value = '';
    }

    applyNoDefaultStarsUi();
  }

  function patchStarsUiFunctions() {
    if (!isWalletUiTargetPage()) return;

    if (typeof window.validateForm === 'function' && !window.__noDefaultStarsValidatePatched) {
      const originalValidateForm = window.validateForm;
      window.validateForm = function() {
        const starsInput = document.getElementById('stars');
        const hadManualValue = starsInput && starsInput.dataset.manualTyped === '1';
        const manualValue = starsInput ? String(starsInput.dataset.manualValue || starsInput.value || '') : '';
        const presetValue = getSelectedPresetStars();

        // Let original page logic treat preset option as selected stars for enabling buy button.
        if (starsInput && !hadManualValue && presetValue >= 50) {
          starsInput.value = String(presetValue);
        }

        const result = originalValidateForm.apply(this, arguments);

        // Restore input behavior: presets should not write into text field.
        if (starsInput && !hadManualValue) {
          starsInput.value = '';
        } else if (starsInput && hadManualValue) {
          starsInput.value = manualValue;
        }

        applyNoDefaultStarsUi();
        return result;
      };
      window.__noDefaultStarsValidatePatched = true;
    }

    if (typeof window.updatePreview === 'function' && !window.__noDefaultStarsPreviewPatched) {
      const originalUpdatePreview = window.updatePreview;
      window.updatePreview = function() {
        const result = originalUpdatePreview.apply(this, arguments);
        applyNoDefaultStarsUi();
        return result;
      };
      window.__noDefaultStarsPreviewPatched = true;
    }

    if (typeof window.selectStars === 'function' && !window.__noDefaultStarsSelectPatched) {
      const originalSelectStars = window.selectStars;
      window.selectStars = function() {
        const starsInput = document.getElementById('stars');
        const hadManualValue = starsInput && starsInput.dataset.manualTyped === '1';
        const manualValue = starsInput ? String(starsInput.dataset.manualValue || '') : '';

        const result = originalSelectStars.apply(this, arguments);

        if (starsInput) {
          starsInput.value = hadManualValue ? manualValue : '';
        }

        applyNoDefaultStarsUi();
        return result;
      };
      window.__noDefaultStarsSelectPatched = true;
    }

    if (typeof window.payWithTON === 'function' && !window.__noDefaultStarsPayPatched) {
      const originalPayWithTON = window.payWithTON;
      window.payWithTON = function() {
        return withEffectiveStarsInput(originalPayWithTON, this, arguments);
      };
      window.__noDefaultStarsPayPatched = true;
    }

    if (typeof window.submitOrder === 'function' && !window.__noDefaultStarsSubmitPatched) {
      const originalSubmitOrder = window.submitOrder;
      window.submitOrder = function() {
        return withEffectiveStarsInput(originalSubmitOrder, this, arguments);
      };
      window.__noDefaultStarsSubmitPatched = true;
    }
  }

  function initNoDefaultStarsSelection() {
    if (!isWalletUiTargetPage()) return;

    bindManualStarsTracking();
    clearDefaultStarsSelectionIfNeeded();
    keepPresetAsSelectionOnly();
    patchStarsUiFunctions();
    applyNoDefaultStarsUi();

    setTimeout(function() {
      bindManualStarsTracking();
      clearDefaultStarsSelectionIfNeeded();
      keepPresetAsSelectionOnly();
      patchStarsUiFunctions();
      applyNoDefaultStarsUi();

      if (typeof window.validateForm === 'function') {
        window.validateForm();
      }
    }, 700);

    if (typeof window.validateForm === 'function') {
      window.validateForm();
    }
  }

  function injectGlobalHideButtonsStyles() {
    if (document.getElementById('global-hide-buttons-v9-style')) return;

    const style = document.createElement('style');
    style.id = 'global-hide-buttons-v9-style';
    style.textContent = [
      '.profile_introducing-section a.button[href*="premium"]:not(.button-personal-account){display:none !important;}',
      '.user-paste-btn{display:none !important;visibility:hidden !important;pointer-events:none !important;}'
    ].join('');
    document.head.appendChild(style);
  }

  function removeBuyPremiumButtons() {
    document.querySelectorAll('.profile_introducing-section a.button[href*="premium"]:not(.button-personal-account)').forEach(function(btn) {
      btn.remove();
    });
  }

  function removePasteButtons() {
    document.querySelectorAll('.user-paste-btn').forEach(function(btn) {
      btn.remove();
    });
  }

  function initGlobalButtonCleanup() {
    injectGlobalHideButtonsStyles();
    removeBuyPremiumButtons();
    removePasteButtons();

    const observer = new MutationObserver(function() {
      removeBuyPremiumButtons();
      removePasteButtons();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    setTimeout(function() {
      removeBuyPremiumButtons();
      removePasteButtons();
    }, 600);
  }

  document.addEventListener('DOMContentLoaded', function() {
    initGlobalButtonCleanup();
    initWalletPlacementAndBuyFlow();
    initNoDefaultStarsSelection();
    waitForSwalAndShow(20);
  });
})();

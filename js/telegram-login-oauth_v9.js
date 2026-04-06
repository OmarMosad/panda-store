(function () {
    'use strict';

    const DEFAULT_CLIENT_ID = '8543314208';
    const SDK_SRC = 'https://oauth.telegram.org/js/telegram-login.js?3';
    let sdkReady = false;
    let sdkLoadingPromise = null;

    function getClientId() {
        const cfg = window.TELEGRAM_CONFIG || {};
        const raw = String(cfg.TELEGRAM_LOGIN_CLIENT_ID || DEFAULT_CLIENT_ID).trim();
        return /^\d+$/.test(raw) ? raw : DEFAULT_CLIENT_ID;
    }

    function ensureTelegramSdk() {
        if (window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.auth === 'function') {
            sdkReady = true;
            return Promise.resolve();
        }

        if (sdkLoadingPromise) {
            return sdkLoadingPromise;
        }

        sdkLoadingPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-telegram-login-sdk="true"]');
            if (existing) {
                existing.addEventListener('load', () => {
                    sdkReady = true;
                    resolve();
                }, { once: true });
                existing.addEventListener('error', () => reject(new Error('Telegram SDK failed to load')), { once: true });
                return;
            }

            const script = document.createElement('script');
            script.async = true;
            script.src = SDK_SRC;
            script.dataset.telegramLoginSdk = 'true';
            script.addEventListener('load', () => {
                sdkReady = true;
                resolve();
            }, { once: true });
            script.addEventListener('error', () => reject(new Error('Telegram SDK failed to load')), { once: true });
            document.head.appendChild(script);
        });

        return sdkLoadingPromise;
    }

    function openTelegramLogin() {
        if (!(sdkReady || (window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.auth === 'function'))) {
            throw new Error('Telegram login SDK is not ready');
        }

        const handler = window.telegramLoginHandler;
        const callback = function (result) {
            if (handler && typeof handler.handleTelegramLibraryResult === 'function') {
                handler.handleTelegramLibraryResult(result).catch(function (error) {
                    console.error('Telegram login callback failed:', error);
                });
                return;
            }

            if (handler && typeof handler.onTelegramAuth === 'function') {
                handler.onTelegramAuth(result);
            }
        };

        window.Telegram.Login.auth({
            client_id: getClientId(),
            request_access: ['profile']
        }, callback);
    }

    function initTelegramLoginButton() {
        const btn = document.getElementById('telegram_oauth_btn');
        if (!btn) {
            return;
        }

        btn.addEventListener('click', function () {
            if (!(sdkReady || (window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.auth === 'function'))) {
                const handler = window.telegramLoginHandler;
                if (handler && typeof handler.showError === 'function') {
                    handler.showError('Telegram login is loading. Please try again in a moment.');
                    return;
                }
                alert('Telegram login is loading. Please try again in a moment.');
                return;
            }

            try {
                openTelegramLogin();
            } catch (error) {
                console.error('Telegram login failed:', error);
                const handler = window.telegramLoginHandler;
                if (handler && typeof handler.showError === 'function') {
                    handler.showError('Telegram login is loading. Please try again in a moment.');
                    return;
                }
                alert('Telegram login is loading. Please try again in a moment.');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', ensureTelegramSdk);
    document.addEventListener('DOMContentLoaded', initTelegramLoginButton);
})();

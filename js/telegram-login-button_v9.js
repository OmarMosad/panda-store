(function () {
    'use strict';

    const DEFAULT_CLIENT_ID = '7380609755';
    const SDK_SRC = 'https://oauth.telegram.org/js/telegram-login.js?3';
    const SDK_ORIGIN = 'https://oauth.telegram.org';
    let sdkReady = false;
    let sdkLoadingPromise = null;

    function getClientId() {
        const raw = String(window.TELEGRAM_CONFIG?.TELEGRAM_LOGIN_CLIENT_ID || DEFAULT_CLIENT_ID).trim();
        return /^\d+$/.test(raw) ? raw : DEFAULT_CLIENT_ID;
    }

    function ensureTelegramSdk() {
        if (window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.auth === 'function') {
            sdkReady = true;
            initTelegramSdkFlow();
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
                initTelegramSdkFlow();
                resolve();
            }, { once: true });
            script.addEventListener('error', () => reject(new Error('Telegram SDK failed to load')), { once: true });
            document.head.appendChild(script);
        });

        return sdkLoadingPromise;
    }

    function decodeJwtPayload(token) {
        try {
            const parts = String(token || '').split('.');
            if (parts.length !== 3) return null;
            let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const pad = payload.length % 4;
            if (pad) payload += '='.repeat(4 - pad);
            return JSON.parse(atob(payload));
        } catch (_) {
            return null;
        }
    }

    function normalizeTelegramResult(result) {
        if (!result) return null;
        if (result.error) return { error: String(result.error) };
        if (typeof result === 'string') {
            const user = decodeJwtPayload(result);
            return user ? { id_token: result, user } : { error: 'malformed id_token' };
        }
        return result;
    }

    function dispatchResultToHandler(rawResult) {
        const handler = window.telegramLoginHandler;
        const result = normalizeTelegramResult(rawResult);

        if (result && result.error) {
            if (handler && typeof handler.showError === 'function') {
                const msg = result.error === 'popup_closed'
                    ? 'Telegram login popup was closed before completion.'
                    : `Telegram login failed: ${result.error}`;
                handler.showError(msg);
            }
            return;
        }

        if (handler && typeof handler.handleTelegramLibraryResult === 'function') {
            handler.handleTelegramLibraryResult(result).catch((error) => {
                console.error('Telegram login callback failed:', error);
            });
            return;
        }

        if (handler && typeof handler.onTelegramAuth === 'function') {
            handler.onTelegramAuth(result);
        }
    }

    function initTelegramSdkFlow() {
        if (!(window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.init === 'function')) {
            return;
        }

        window.Telegram.Login.init({
            client_id: getClientId(),
            request_access: ['profile'],
            lang: String(document.documentElement.lang || 'en').slice(0, 2)
        }, dispatchResultToHandler);

        window.addEventListener('message', function (event) {
            if (String(event.origin || '').toLowerCase() !== SDK_ORIGIN) return;
            dispatchResultToHandler(event.data);
        });
    }

    function openTelegramLogin() {
        if (!(sdkReady || (window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.auth === 'function'))) {
            throw new Error('Telegram login SDK is not ready');
        }

        if (window.Telegram && window.Telegram.Login && typeof window.Telegram.Login.open === 'function') {
            window.Telegram.Login.open(dispatchResultToHandler);
            return;
        }

        window.Telegram.Login.auth({
            client_id: getClientId(),
            request_access: ['profile'],
            lang: String(document.documentElement.lang || 'en').slice(0, 2)
        }, dispatchResultToHandler);
    }

    function initTelegramOAuthButton() {
        const button = document.getElementById('telegram_oauth_btn');
        if (!button) {
            return;
        }

        button.addEventListener('click', async function () {
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
    document.addEventListener('DOMContentLoaded', initTelegramOAuthButton);
})();

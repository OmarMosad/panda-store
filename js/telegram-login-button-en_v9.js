(function () {
    'use strict';

    function showSessionOnlyMessage() {
        const message = 'Login works only inside Telegram Mini App using direct Telegram session.';
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Open Inside Telegram',
                text: message,
                icon: 'info',
                confirmButtonText: 'OK'
            });
            return;
        }
        alert(message);
    }

    function initTelegramOAuthButton() {
        const button = document.getElementById('telegram_oauth_btn');
        if (!button) {
            return;
        }

        button.addEventListener('click', async function () {
            const webApp = window.Telegram && window.Telegram.WebApp;
            const hasDirectSession = Boolean(webApp && typeof webApp.initData === 'string' && webApp.initData.trim());

            if (!hasDirectSession) {
                showSessionOnlyMessage();
                return;
            }

            try {
                if (window.telegramLoginHandler && typeof window.telegramLoginHandler.tryWebAppSessionAuth === 'function') {
                    await window.telegramLoginHandler.tryWebAppSessionAuth();
                    return;
                }
            } catch (_) {
                // fall through to session-only message
            }

            showSessionOnlyMessage();
        });
    }

    document.addEventListener('DOMContentLoaded', initTelegramOAuthButton);
})();

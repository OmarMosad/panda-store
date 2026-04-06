(function () {
    'use strict';

    function showSessionOnlyMessage() {
        const message = 'تسجيل الدخول يعمل فقط من داخل Telegram Mini App عبر Session مباشرة.';
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'افتح الصفحة داخل تيليجرام',
                text: message,
                icon: 'info',
                confirmButtonText: 'حسنا'
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

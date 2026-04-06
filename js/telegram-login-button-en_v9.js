(function () {
    'use strict';

    const TELEGRAM_BOT_USERNAME = 'pandastores_bot';

    function buildTelegramBotStartUrl() {
        // Open Telegram bot chat and let bot send a Login URL button.
        return `https://t.me/${TELEGRAM_BOT_USERNAME}?start=login`;
    }

    function initTelegramOAuthButton() {
        const button = document.getElementById('telegram_oauth_btn');
        if (!button) {
            return;
        }

        button.addEventListener('click', async function () {
            const webApp = window.Telegram && window.Telegram.WebApp;
            const hasDirectSession = Boolean(webApp && typeof webApp.initData === 'string' && webApp.initData.trim());

            if (hasDirectSession) {
                try {
                    if (window.telegramLoginHandler && typeof window.telegramLoginHandler.tryWebAppSessionAuth === 'function') {
                        await window.telegramLoginHandler.tryWebAppSessionAuth();
                        return;
                    }
                } catch (_) {
                    // fallback to bot start link
                }
            }

            window.location.href = buildTelegramBotStartUrl();
        });
    }

    document.addEventListener('DOMContentLoaded', initTelegramOAuthButton);
})();

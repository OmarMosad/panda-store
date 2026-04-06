(function () {
    'use strict';

    function buildOfficialTelegramOauthUrl() {
        const botId = String(window.TELEGRAM_CONFIG?.TELEGRAM_LOGIN_BOT_ID || '7380609755').trim();
        const params = new URLSearchParams({
            bot_id: /^\d+$/.test(botId) ? botId : '7380609755',
            origin: window.location.origin,
            return_to: window.location.href,
            request_access: 'write'
        });

        return `https://oauth.telegram.org/auth?${params.toString()}`;
    }

    function openOfficialOauth() {
        window.location.href = buildOfficialTelegramOauthUrl();
    }

    function initTelegramOAuthButton() {
        const button = document.getElementById('telegram_oauth_btn');
        if (!button) {
            return;
        }

        button.addEventListener('click', async function () {
            const webApp = window.Telegram && window.Telegram.WebApp;
            const hasDirectSession = Boolean(webApp && typeof webApp.initData === 'string' && webApp.initData.trim());

            try {
                if (hasDirectSession && window.telegramLoginHandler && typeof window.telegramLoginHandler.tryWebAppSessionAuth === 'function') {
                    await window.telegramLoginHandler.tryWebAppSessionAuth();
                    return;
                }
            } catch (_) {
                // fall through to official oauth
            }

            openOfficialOauth();
        });
    }

    document.addEventListener('DOMContentLoaded', initTelegramOAuthButton);
})();

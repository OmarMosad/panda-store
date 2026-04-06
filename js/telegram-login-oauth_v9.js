(function () {
    'use strict';

    const FALLBACK_BOT_ID = '7380609755';

    const MESSAGES = {
        ar: {
            title: 'فتح تسجيل دخول تيليجرام',
            text: 'جاري تحويلك إلى صفحة تسجيل الدخول الرسمية من Telegram...'
        },
        en: {
            title: 'Open Telegram Login',
            text: 'Redirecting you to the official Telegram login session page...'
        },
        de: {
            title: 'Telegram Login oeffnen',
            text: 'Weiterleitung zur offiziellen Telegram-Login-Seite...'
        },
        es: {
            title: 'Abrir inicio de sesion',
            text: 'Redirigiendo a la pagina oficial de sesion de Telegram...'
        },
        fr: {
            title: 'Ouvrir la connexion Telegram',
            text: 'Redirection vers la page officielle de connexion Telegram...'
        },
        it: {
            title: 'Apri login Telegram',
            text: 'Reindirizzamento alla pagina ufficiale di login Telegram...'
        },
        ru: {
            title: 'Открыть вход Telegram',
            text: 'Перенаправление на официальную страницу входа Telegram...'
        }
    };

    function getLang() {
        const lang = String(document.documentElement.lang || 'en').toLowerCase();
        if (MESSAGES[lang]) return lang;
        return 'en';
    }

    function getBotId() {
        const cfg = window.TELEGRAM_CONFIG || {};
        const raw = String(cfg.TELEGRAM_LOGIN_BOT_ID || FALLBACK_BOT_ID).trim();
        return /^\d+$/.test(raw) ? raw : FALLBACK_BOT_ID;
    }

    function buildOfficialTelegramOauthUrl() {
        const params = new URLSearchParams({
            bot_id: getBotId(),
            origin: window.location.origin,
            return_to: window.location.href,
            request_access: 'write'
        });

        return `https://oauth.telegram.org/auth?${params.toString()}`;
    }

    function showOpeningMessage() {
        const lang = getLang();
        const i18n = MESSAGES[lang] || MESSAGES.en;

        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: i18n.title,
                text: i18n.text,
                icon: 'info',
                timer: 1200,
                showConfirmButton: false
            });
        }
    }

    async function onLoginClick() {
        const webApp = window.Telegram && window.Telegram.WebApp;
        const hasDirectSession = Boolean(webApp && typeof webApp.initData === 'string' && webApp.initData.trim());

        if (hasDirectSession && window.telegramLoginHandler && typeof window.telegramLoginHandler.tryWebAppSessionAuth === 'function') {
            await window.telegramLoginHandler.tryWebAppSessionAuth();
            return;
        }

        showOpeningMessage();
        window.location.href = buildOfficialTelegramOauthUrl();
    }

    function init() {
        const button = document.getElementById('telegram_oauth_btn');
        if (!button) return;

        button.addEventListener('click', function () {
            onLoginClick().catch(function () {
                window.location.href = buildOfficialTelegramOauthUrl();
            });
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();

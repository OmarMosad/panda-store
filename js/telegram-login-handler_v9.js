/**
 * Telegram Login Handler
 * Verifies Telegram payload on backend before creating local session.
 */

class TelegramLoginHandler {
    constructor() {
        this.isProcessing = false;
        this.isCompleted = false;
        this.init();
    }

    init() {
        this.handleTelegramCallback();
        window.onTelegramAuth = (user) => this.onTelegramAuth(user);
    }

    handleTelegramCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const telegramData = {
            id: urlParams.get('id'),
            first_name: urlParams.get('first_name'),
            last_name: urlParams.get('last_name'),
            username: urlParams.get('username'),
            photo_url: urlParams.get('photo_url'),
            auth_date: urlParams.get('auth_date'),
            hash: urlParams.get('hash')
        };

        if (telegramData.id && telegramData.hash) {
            this.processAuth(telegramData);
        }
    }

    async onTelegramAuth(user) {
        await this.processAuth(user);
    }

    sanitizePayload(user) {
        return {
            id: user?.id ? String(user.id) : '',
            first_name: user?.first_name || '',
            last_name: user?.last_name || '',
            username: user?.username || '',
            photo_url: user?.photo_url || '',
            auth_date: user?.auth_date ? String(user.auth_date) : '',
            hash: user?.hash || ''
        };
    }

    async processAuth(rawUser) {
        if (this.isProcessing || this.isCompleted) {
            return;
        }

        const user = this.sanitizePayload(rawUser);
        if (!user.id || !user.hash || !user.auth_date) {
            this.showError('Telegram login data is incomplete. Please try again.');
            return;
        }

        this.isProcessing = true;

        try {
            const verifyResult = await this.verifyWithBackend(user);
            if (!verifyResult?.success || !verifyResult.user?.id) {
                throw new Error('Telegram verification failed');
            }

            const verifiedUser = verifyResult.user;
            localStorage.setItem('telegram_user', JSON.stringify(verifiedUser));
            localStorage.setItem('telegram_user_id', String(verifiedUser.id));
            localStorage.setItem('telegram_username', verifiedUser.username || String(verifiedUser.id));
            localStorage.setItem('telegram_login_timestamp', Date.now().toString());

            try {
                if (window.referralSystem?.registerUser) {
                    const registerResult = await window.referralSystem.registerUser(verifiedUser);
                    const referralCode = registerResult?.user?.referralCode || registerResult?.user?.referral_code;
                    if (registerResult?.success && referralCode) {
                        localStorage.setItem('user_referral_code', referralCode);
                    }
                }
            } catch (registerError) {
                console.warn('User registration failed after Telegram verification:', registerError);
            }

            this.clearTelegramParamsFromUrl();
            this.isCompleted = true;
            this.redirectToProfile();
        } catch (error) {
            console.error('Telegram login error:', error);
            this.showError('Telegram sign-in could not be completed. Please try again.');
        } finally {
            this.isProcessing = false;
        }
    }

    async verifyWithBackend(telegramPayload) {
        const buildUrl = (path) => {
            if (typeof window.buildApiUrl === 'function') {
                return window.buildApiUrl(path);
            }

            const rawPath = String(path || '').trim();
            if (/^https?:\/\//i.test(rawPath)) {
                return rawPath;
            }

            const apiBase = window.API_BASE_URL || window.TELEGRAM_CONFIG?.API_BASE_URL || window.location.origin;
            const safePath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
            return `${apiBase}${safePath}`;
        };

        const response = await fetch(buildUrl('/api/auth/telegram/verify'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(telegramPayload)
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = result?.error || `Verification request failed with status ${response.status}`;
            throw new Error(message);
        }

        return result;
    }

    clearTelegramParamsFromUrl() {
        const url = new URL(window.location.href);
        const telegramKeys = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash'];

        let changed = false;
        telegramKeys.forEach((key) => {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        });

        if (changed) {
            window.history.replaceState({}, document.title, url.toString());
        }
    }

    redirectToProfile() {
        const currentPath = window.location.pathname;
        const langMatch = currentPath.match(/^\/(ar|de|en|es|fr|it|ru)\//);
        const lang = langMatch ? langMatch[1] : 'en';
        console.log(`🔄 Redirecting to /${lang}/profile.html`);
        window.location.href = `/${lang}/profile.html`;
    }

    showError(message) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Login Failed',
                text: message,
                icon: 'error',
                confirmButtonText: 'OK'
            });
            return;
        }

        alert(message);
    }

    static logout() {
        localStorage.removeItem('telegram_user');
        localStorage.removeItem('telegram_user_id');
        localStorage.removeItem('telegram_username');
        localStorage.removeItem('user_referral_code');
        window.location.href = '/';
    }

    static isLoggedIn() {
        return !!localStorage.getItem('telegram_user_id');
    }

    static getCurrentUser() {
        const userJson = localStorage.getItem('telegram_user');
        if (userJson) {
            try {
                return JSON.parse(userJson);
            } catch (e) {
                // fall through to Telegram WebApp fallback
            }
        }

        const webAppUser = TelegramLoginHandler.getWebAppUser();
        if (webAppUser) {
            localStorage.setItem('telegram_user', JSON.stringify(webAppUser));
            localStorage.setItem('telegram_user_id', String(webAppUser.id));
            localStorage.setItem('telegram_username', webAppUser.username || String(webAppUser.id));
            localStorage.setItem('telegram_login_timestamp', Date.now().toString());
        }

        return webAppUser;
    }

    static getWebAppUser() {
        try {
            const webApp = window.Telegram && window.Telegram.WebApp;
            const user = webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user;
            if (!user || !user.id) {
                return null;
            }

            const username = user.username || `user_${user.id}`;
            return {
                id: String(user.id),
                username,
                first_name: user.first_name || '',
                last_name: user.last_name || '',
                photo_url: user.photo_url || ''
            };
        } catch (_) {
            return null;
        }
    }
}

// تهيئة المعالج عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    const loginHandler = new TelegramLoginHandler();
    
    // جعله متاحاً globally
    window.telegramLoginHandler = loginHandler;
    window.TelegramLoginHandler = TelegramLoginHandler;
});

// دالة للتوافق مع Telegram Widget القديم
function onTelegramAuth(user) {
    if (window.telegramLoginHandler) {
        window.telegramLoginHandler.onTelegramAuth(user);
    } else {
        // تأخير بسيط إذا لم يتم تهيئة المعالج بعد
        setTimeout(() => onTelegramAuth(user), 100);
    }
}

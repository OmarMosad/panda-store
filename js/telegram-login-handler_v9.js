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
        this.tryWebAppSessionAuth();
        this.handleTelegramOAuthResult();
        this.handleTelegramCallback();
        this.watchTelegramOAuthMessages();
        this.watchLoginState();
        window.onTelegramAuth = (user) => this.onTelegramAuth(user);
    }

    async handleTelegramLibraryResult(result) {
        if (this.isProcessing || this.isCompleted) {
            return;
        }

        if (!result) {
            return;
        }

        if (result.error) {
            throw new Error(String(result.error));
        }

        if (typeof result === 'string') {
            await this.processOidcAuth(result);
            return;
        }

        if (result.id_token) {
            await this.processOidcAuth(String(result.id_token));
            return;
        }

        if (result.id && result.hash && result.auth_date) {
            await this.processAuth(result);
            return;
        }

        if (result.user && result.user.id_token) {
            await this.processOidcAuth(String(result.user.id_token));
            return;
        }

        if (result.user && result.user.id && result.user.hash && result.user.auth_date) {
            await this.processAuth(result.user);
            return;
        }

        throw new Error('Telegram login data is incomplete. Please try again.');
    }

    watchTelegramOAuthMessages() {
        window.addEventListener('message', (event) => {
            if (this.isProcessing || this.isCompleted) {
                return;
            }

            const origin = String(event.origin || '').toLowerCase();
            if (origin !== 'https://oauth.telegram.org') {
                return;
            }

            const payload = this.extractTelegramOAuthPayload(event.data);
            if (!payload) {
                return;
            }

            this.processAuth(payload).catch((error) => {
                console.error('Telegram OAuth message handling failed:', error);
            });
        });
    }

    extractTelegramOAuthPayload(data) {
        if (!data) {
            return null;
        }

        if (typeof data === 'object') {
            if (data.id_token) {
                return { id_token: String(data.id_token) };
            }

            if (data.user && typeof data.user === 'object' && data.user.id) {
                return {
                    id: data.user.id,
                    first_name: data.user.first_name || '',
                    last_name: data.user.last_name || '',
                    username: data.user.username || '',
                    photo_url: data.user.photo_url || '',
                    auth_date: data.auth_date || data.user.auth_date || '',
                    hash: data.hash || data.user.hash || ''
                };
            }

            if (data.id && (data.hash || data.id_token)) {
                return data;
            }
        }

        if (typeof data === 'string') {
            const trimmed = data.trim();
            if (!trimmed) {
                return null;
            }

            try {
                const parsed = JSON.parse(trimmed);
                return this.extractTelegramOAuthPayload(parsed);
            } catch (_) {
                // fall through
            }

            try {
                const urlParams = new URLSearchParams(trimmed.replace(/^#/, '').replace(/^\?/, ''));
                if (urlParams.has('id_token')) {
                    return { id_token: urlParams.get('id_token') };
                }

                const result = {
                    id: urlParams.get('id'),
                    first_name: urlParams.get('first_name'),
                    last_name: urlParams.get('last_name'),
                    username: urlParams.get('username'),
                    photo_url: urlParams.get('photo_url'),
                    auth_date: urlParams.get('auth_date'),
                    hash: urlParams.get('hash')
                };

                if (result.id && (result.hash || result.id_token)) {
                    return result;
                }
            } catch (_) {
                // ignore
            }
        }

        return null;
    }

    watchLoginState() {
        window.addEventListener('storage', (event) => {
            if (event.key === 'telegram_user_id' && event.newValue) {
                this.redirectToProfile();
            }
        });

        window.addEventListener('focus', () => {
            if (TelegramLoginHandler.isLoggedIn()) {
                this.redirectToProfile();
            }
        });
    }

    parseTelegramOAuthHash() {
        const hash = String(window.location.hash || '').replace(/^#/, '').trim();
        if (!hash) {
            return null;
        }

        const params = new URLSearchParams(hash);
        const values = params.getAll('tgAuthResult');
        for (const value of values) {
            if (!value) continue;

            try {
                return JSON.parse(value);
            } catch (_) {
                try {
                    return JSON.parse(decodeURIComponent(value));
                } catch (_) {
                    // keep trying other values
                }
            }
        }

        return null;
    }

    async handleTelegramOAuthResult() {
        if (this.isProcessing || this.isCompleted) {
            return;
        }

        const oauthUser = this.parseTelegramOAuthHash();
        if (oauthUser && oauthUser.id && oauthUser.hash && oauthUser.auth_date) {
            await this.processAuth(oauthUser);
            return;
        }

        if (String(window.location.hash || '').includes('tgAuthResult=')) {
            this.clearTelegramOAuthHashFromUrl();
        }
    }

    async tryWebAppSessionAuth() {
        if (this.isProcessing || this.isCompleted) {
            return;
        }

        const webApp = window.Telegram && window.Telegram.WebApp;
        const initData = webApp && typeof webApp.initData === 'string' ? webApp.initData.trim() : '';
        const webAppUser = webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user;

        if (!initData || !webAppUser || !webAppUser.id) {
            return;
        }

        this.isProcessing = true;

        try {
            const verifyResult = await this.verifyWebAppSessionWithBackend(initData);
            if (!verifyResult?.success || !verifyResult.user?.id) {
                throw new Error('Telegram WebApp session verification failed');
            }

            await this.completeLogin(verifyResult.user);
            this.isCompleted = true;
            this.redirectToProfile();
        } catch (error) {
            console.warn('Telegram WebApp session login skipped:', error?.message || error);
        } finally {
            this.isProcessing = false;
        }
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

        if (rawUser && rawUser.id_token) {
            return this.processOidcAuth(rawUser.id_token);
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

            await this.completeLogin(verifyResult.user);

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

    async processOidcAuth(idToken) {
        if (this.isProcessing || this.isCompleted) {
            return;
        }

        this.isProcessing = true;

        try {
            const verifyResult = await this.verifyOidcWithBackend(idToken);
            if (!verifyResult?.success || !verifyResult.user?.id) {
                throw new Error('Telegram OIDC verification failed');
            }

            await this.completeLogin(verifyResult.user);
            this.isCompleted = true;
            this.redirectToProfile();
        } catch (error) {
            console.error('Telegram OIDC login error:', error);
            this.showError('Telegram sign-in could not be completed. Please try again.');
        } finally {
            this.isProcessing = false;
        }
    }

    async completeLogin(verifiedUser) {
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
    }

    buildUrl(path) {
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
    }

    async verifyWithBackend(telegramPayload) {
        const response = await fetch(this.buildUrl('/api/auth/telegram/verify'), {
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

    async verifyWebAppSessionWithBackend(initData) {
        const response = await fetch(this.buildUrl('/api/auth/telegram/webapp-session'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ initData })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = result?.error || `WebApp session request failed with status ${response.status}`;
            throw new Error(message);
        }

        return result;
    }

    async verifyOidcWithBackend(idToken) {
        const response = await fetch(this.buildUrl('/api/auth/telegram/verify'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id_token: idToken })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            const message = result?.error || `OIDC verification request failed with status ${response.status}`;
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

    clearTelegramOAuthHashFromUrl() {
        const url = new URL(window.location.href);
        if (!String(url.hash || '').includes('tgAuthResult=')) {
            return;
        }

        url.hash = '';
        window.history.replaceState({}, document.title, url.toString());
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

/**
 * Telegram Login Handler
 * يتعامل مع تسجيل الدخول عبر Telegram ويوجه المستخدم للبروفايل
 */

class TelegramLoginHandler {
    constructor() {
        this.init();
    }

    /**
     * تهيئة المعالج
     */
    init() {
        // التحقق من URL parameters (Telegram callback)
        this.handleTelegramCallback();
        
        // الاستماع لحدث تسجيل الدخول من Telegram Widget
        window.onTelegramAuth = (user) => this.onTelegramAuth(user);
    }

    /**
     * معالجة callback من Telegram
     */
    handleTelegramCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // التحقق من وجود بيانات Telegram
        const telegramData = {
            id: urlParams.get('id'),
            first_name: urlParams.get('first_name'),
            last_name: urlParams.get('last_name'),
            username: urlParams.get('username'),
            photo_url: urlParams.get('photo_url'),
            auth_date: urlParams.get('auth_date'),
            hash: urlParams.get('hash')
        };

        // إذا كانت البيانات موجودة، معالجة تسجيل الدخول
        if (telegramData.id && telegramData.hash) {
            this.onTelegramAuth(telegramData);
        }
    }

    /**
     * عند نجاح تسجيل الدخول عبر Telegram
     */
    async onTelegramAuth(user) {
        console.log('✅ Telegram authentication successful:', user);
        
        // ⚠️ حفظ البيانات فوراً قبل أي شيء آخر
        localStorage.setItem('telegram_user', JSON.stringify(user));
        localStorage.setItem('telegram_user_id', user.id);
        localStorage.setItem('telegram_username', user.username || user.id);
        localStorage.setItem('telegram_login_timestamp', Date.now().toString());
        
        console.log('💾 User data saved to localStorage');
        
        // عرض رسالة تحميل
        this.showLoadingMessage();
        
        try {
            // تسجيل المستخدم في قاعدة البيانات (في الخلفية)
            const result = await window.referralSystem.registerUser(user);
            
            if (result && result.success) {
                console.log('✅ User registered successfully');
                
                // حفظ referral code الخاص بالمستخدم
                localStorage.setItem('user_referral_code', result.user.referral_code);
            } else {
                console.warn('⚠️ Registration to server failed, but user data is saved locally');
            }
        } catch (error) {
            console.warn('⚠️ Server registration error, but user data is saved locally:', error);
        }
        
        // الانتقال إلى صفحة البروفايل (حتى لو فشل التسجيل في السيرفر)
        this.redirectToProfile(user.username || user.id);
    }

    /**
     * عرض رسالة تحميل
     */
    showLoadingMessage() {
        // لا توجد رسالة - التوجيه المباشر للبروفايل
    }

    /**
     * التوجيه إلى صفحة البروفايل
     */
    redirectToProfile(username) {
        // الحصول على اللغة الحالية من URL
        const currentPath = window.location.pathname;
        const langMatch = currentPath.match(/^\/(ar|de|en|es|fr|it|ru)\//);
        const lang = langMatch ? langMatch[1] : 'en';
        
        // التوجيه الفوري إلى صفحة البروفايل
        console.log(`🔄 Redirecting to /${lang}/profile.html`);
        window.location.href = `/${lang}/profile.html`;
    }

    /**
     * عرض رسالة خطأ
     */
    showError(message) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Error',
                text: message,
                icon: 'error',
                confirmButtonText: 'OK'
            });
        } else {
            alert(message);
        }
    }

    /**
     * تسجيل الخروج
     */
    static logout() {
        // حذف بيانات المستخدم
        localStorage.removeItem('telegram_user');
        localStorage.removeItem('telegram_user_id');
        localStorage.removeItem('telegram_username');
        localStorage.removeItem('user_referral_code');
        
        // التوجيه إلى الصفحة الرئيسية
        window.location.href = '/';
    }

    /**
     * التحقق من تسجيل الدخول
     */
    static isLoggedIn() {
        return !!localStorage.getItem('telegram_user_id');
    }

    /**
     * الحصول على بيانات المستخدم الحالي
     */
    static getCurrentUser() {
        const userJson = localStorage.getItem('telegram_user');
        if (userJson) {
            try {
                return JSON.parse(userJson);
            } catch (e) {
                return null;
            }
        }
        return null;
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

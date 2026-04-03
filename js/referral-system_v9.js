/**
 * Panda Store - Referral System
 * نظام الإحالات - Referral Tracking System
 * 
 * الوظائف:
 * 1. تتبع رابط الإحالة من URL
 * 2. حفظ كود الإحالة في Cookies + localStorage
 * 3. إرسال بيانات الإحالة للسيرفر عند التسجيل/الشراء
 */

class ReferralSystem {
    constructor() {
        this.REFERRAL_COOKIE = 'panda_referral';
        this.REFERRAL_DURATION = 30; // أيام صلاحية الإحالة
        this.init();
    }

    /**
     * Build API url safely even if config.js is not loaded yet.
     */
    getApiUrl(path) {
        if (typeof window.buildApiUrl === 'function') {
            return window.buildApiUrl(path);
        }

        const rawPath = String(path || '').trim();
        if (!rawPath) {
            return (window.API_BASE_URL || 'https://api.pandastore.store');
        }

        if (/^https?:\/\//i.test(rawPath)) {
            return rawPath;
        }

        const base = window.API_BASE_URL || 'https://api.pandastore.store';
        return `${base}${rawPath.startsWith('/') ? '' : '/'}${rawPath}`;
    }

    /**
     * تهيئة النظام
     */
    init() {
        // فحص وجود كود إحالة في URL
        const urlParams = new URLSearchParams(window.location.search);
        const referralCode = urlParams.get('referral') || urlParams.get('ref');
        
        if (referralCode) {
            this.saveReferral(referralCode);
            console.log('✅ Referral code saved:', referralCode);
        }
        
        // عرض كود الإحالة الحالي إذا كان موجود
        const currentReferral = this.getReferral();
        if (currentReferral) {
            console.log('📊 Current referral:', currentReferral);
        }
    }

    /**
     * حفظ كود الإحالة
     */
    saveReferral(code) {
        // تنظيف الكود
        code = code.trim();
        
        // حفظ في Cookie
        this.setCookie(this.REFERRAL_COOKIE, code, this.REFERRAL_DURATION);
        
        // حفظ في localStorage
        localStorage.setItem(this.REFERRAL_COOKIE, code);
        localStorage.setItem(this.REFERRAL_COOKIE + '_date', new Date().toISOString());
        
        return true;
    }

    /**
     * استرجاع كود الإحالة
     */
    getReferral() {
        // محاولة من Cookie أولاً
        let code = this.getCookie(this.REFERRAL_COOKIE);
        
        // محاولة من localStorage إذا لم يوجد في Cookie
        if (!code) {
            code = localStorage.getItem(this.REFERRAL_COOKIE);
        }
        
        return code;
    }

    /**
     * حذف كود الإحالة
     */
    clearReferral() {
        this.deleteCookie(this.REFERRAL_COOKIE);
        localStorage.removeItem(this.REFERRAL_COOKIE);
        localStorage.removeItem(this.REFERRAL_COOKIE + '_date');
    }

    /**
     * إضافة كود الإحالة لـ URL
     */
    addReferralToURL(url, referralCode) {
        if (!referralCode) {
            referralCode = this.getReferral();
        }
        
        if (!referralCode) return url;
        
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}referral=${referralCode}`;
    }

    /**
     * تسجيل/تحديث بيانات المستخدم
     */
    async registerUser(telegramUser) {
        if (!telegramUser || !telegramUser.id) {
            console.error('❌ Invalid telegram user data');
            return null;
        }

        const referralCode = this.getReferral();
        
        try {
            const response = await fetch(this.getApiUrl('/api/user/register'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    telegramId: String(telegramUser.id),
                    username: telegramUser.username || `user_${telegramUser.id}`,
                    fullName: `${telegramUser.first_name || ''} ${telegramUser.last_name || ''}`.trim() || telegramUser.username || 'User',
                    photoUrl: telegramUser.photo_url || '',
                    referredBy: referralCode || ''
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ User registered:', result);
                
                // حذف كود الإحالة بعد التسجيل الناجح
                if (referralCode) {
                    this.clearReferral();
                }
                
                return result;
            } else {
                const error = await response.json();
                console.error('❌ Registration failed:', error);
                return null;
            }
        } catch (error) {
            console.error('❌ Registration error:', error);
            return null;
        }
    }

    /**
     * جلب بيانات المستخدم الكاملة
     */
    async getUserData(username) {
        if (!username) {
            console.error('❌ Username required');
            return null;
        }

        try {
            const response = await fetch(this.getApiUrl(`/api/user/${username}`));

            if (response.ok) {
                const result = await response.json();
                return result;
            } else {
                console.error('❌ Failed to fetch user data');
                return null;
            }
        } catch (error) {
            console.error('❌ Error fetching user data:', error);
            return null;
        }
    }

    /**
     * طلب سحب الأرباح
     */
    async requestWithdrawal(username, amount, walletAddress) {
        if (!username || !amount || !walletAddress) {
            this.showNotification('error', 'All fields are required');
            return null;
        }

        if (amount < 1) {
            this.showNotification('error', 'Minimum withdrawal is $1');
            return null;
        }

        try {
            const response = await fetch(this.getApiUrl('/api/withdraw'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username: username,
                    amount: amount,
                    wallet_address: walletAddress
                })
            });

            if (response.ok) {
                const result = await response.json();
                this.showNotification('success', result.message || 'Withdrawal request sent successfully!');
                return result;
            } else {
                const error = await response.json();
                this.showNotification('error', error.error || 'Withdrawal request failed');
                return null;
            }
        } catch (error) {
            console.error('❌ Withdrawal error:', error);
            this.showNotification('error', 'Network error. Please try again.');
            return null;
        }
    }

    /**
     * ربط محفظة TON للمستخدم قبل تفعيل رابط الإحالة
     */
    async bindReferralWallet(username, walletAddress) {
        if (!username || !walletAddress) {
            this.showNotification('error', 'Username and wallet address are required');
            return null;
        }

        try {
            const response = await fetch(this.getApiUrl('/api/referral/bind-wallet'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    username,
                    walletAddress,
                    referredBy: this.getReferral() || ''
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showNotification('success', 'Wallet linked successfully. Referral link is now active.');
                return result;
            }

            this.showNotification('error', result.error || 'Wallet link failed');
            return null;
        } catch (error) {
            console.error('❌ Wallet bind error:', error);
            this.showNotification('error', 'Network error. Please try again.');
            return null;
        }
    }

    /**
     * نسخ رابط الإحالة
     */
    async copyReferralLink(referralCode) {
        if (!referralCode) {
            this.showNotification('error', 'No referral code available');
            return false;
        }

        const referralLink = `https://pandastore.store?ref=${referralCode}`;
        
        try {
            await navigator.clipboard.writeText(referralLink);
            this.showNotification('success', 'Referral link copied!');
            return true;
        } catch (error) {
            // Fallback للمتصفحات القديمة
            const textArea = document.createElement('textarea');
            textArea.value = referralLink;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                document.execCommand('copy');
                this.showNotification('success', 'Referral link copied!');
                return true;
            } catch (err) {
                this.showNotification('error', 'Failed to copy link');
                return false;
            } finally {
                document.body.removeChild(textArea);
            }
        }
    }

    /**
     * عرض إشعار للمستخدم
     */
    showNotification(type, message) {
        if (typeof Swal !== 'undefined') {
            const swalInstance = (window.__swalThemed && typeof window.__swalThemed.fire === 'function')
                ? window.__swalThemed
                : Swal;

            swalInstance.fire({
                icon: type,
                title: type === 'success' ? 'Success!' : 'Error!',
                text: message,
                timer: 3000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        } else {
            alert(message);
        }
    }

    /**
     * تنسيق الأرقام
     */
    formatNumber(num, decimals = 2) {
        return Number(num).toFixed(decimals);
    }

    /**
     * تنسيق التاريخ
     */
    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ============ Cookie Helpers ============
    
    setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    }

    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }
}

// تهيئة النظام تلقائياً
const referralSystem = new ReferralSystem();

// جعله متاحاً globally
window.ReferralSystem = ReferralSystem;
window.referralSystem = referralSystem;

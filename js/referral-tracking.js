/**
 * 🎯 نظام تتبع الإحالات المتقدم
 * يحفظ كود الإحالة ويحافظ عليه في جميع الصفحات
 */

(function() {
    'use strict';
    
    const REFERRAL_KEY = 'referralCode';
    const REF_PARAM = 'ref';
    
    /**
     * جلب كود الإحالة من الرابط أو localStorage
     */
    function getReferralCode() {
        const urlParams = new URLSearchParams(window.location.search);
        const refFromUrl = urlParams.get(REF_PARAM);
        const refFromStorage = localStorage.getItem(REFERRAL_KEY);
        
        // الأولوية للرابط، ثم localStorage
        return refFromUrl || refFromStorage;
    }
    
    /**
     * حفظ كود الإحالة في localStorage
     */
    function saveReferralCode(code) {
        if (code && code.trim()) {
            localStorage.setItem(REFERRAL_KEY, code.trim());
            console.log('✅ Referral code saved:', code);
            return true;
        }
        return false;
    }
    
    /**
     * إضافة ref إلى جميع الروابط في الصفحة
     */
    function addRefToAllLinks() {
        const refCode = getReferralCode();
        if (!refCode) return;
        
        // جلب جميع الروابط الداخلية
        const links = document.querySelectorAll('a[href]');
        
        links.forEach(link => {
            const href = link.getAttribute('href');
            
            // تخطي الروابط الخارجية والروابط الخاصة
            if (!href || 
                href.startsWith('http') || 
                href.startsWith('//') || 
                href.startsWith('#') || 
                href.startsWith('javascript:') ||
                href.startsWith('mailto:') ||
                href.startsWith('tel:')) {
                return;
            }
            
            // تحقق إذا كان الرابط يحتوي على ref بالفعل
            if (href.includes('ref=')) return;
            
            // إضافة ref إلى الرابط
            const separator = href.includes('?') ? '&' : '?';
            const newHref = `${href}${separator}ref=${encodeURIComponent(refCode)}`;
            link.setAttribute('href', newHref);
        });
        
        console.log(`🔗 Added referral code to ${links.length} links`);
    }
    
    /**
     * تهيئة نظام التتبع
     */
    function init() {
        // جلب كود الإحالة
        const refCode = getReferralCode();
        
        if (refCode) {
            // حفظ الكود
            saveReferralCode(refCode);
            
            // إضافة ref إلى جميع الروابط
            addRefToAllLinks();
            
            // مراقبة الروابط الجديدة (للمحتوى الديناميكي)
            if (window.MutationObserver) {
                const observer = new MutationObserver(() => {
                    addRefToAllLinks();
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }
        }
    }
    
    // تشغيل عند تحميل DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    // إعادة التشغيل عند تحميل الصفحة بالكامل
    window.addEventListener('load', () => {
        addRefToAllLinks();
    });
    
    // جعل الدوال متاحة globally
    window.ReferralTracker = {
        getReferralCode,
        saveReferralCode,
        addRefToAllLinks
    };
})();

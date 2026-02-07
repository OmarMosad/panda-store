/**
 * ⚠️ مثال لـ Backend API - يحتاج Node.js/Express Server
 * 
 * هذا الملف للتوضيح فقط - يجب تنفيذه على السيرفر
 * لن يعمل في المتصفح مباشرة
 */

// مثال باستخدام Node.js + Express
const express = require('express');
const app = express();

app.use(express.json());

// Database mock - يجب استبداله بـ MySQL/MongoDB فعلي
const referrals = new Map();
const users = new Map();

/**
 * API: تتبع الإحالة
 * POST /api/referral/track
 */
app.post('/api/referral/track', async (req, res) => {
    try {
        const { referral_code, action, amount, user_id } = req.body;
        
        // التحقق من وجود كود الإحالة
        if (!referral_code) {
            return res.status(400).json({ error: 'Referral code required' });
        }
        
        // البحث عن المُحيل
        const referrer = users.get(referral_code);
        if (!referrer) {
            return res.status(404).json({ error: 'Referral code not found' });
        }
        
        // حساب العمولة
        let commission = 0;
        const COMMISSION_RATE = 0.10; // 10%
        
        if (action === 'purchase' && amount) {
            commission = amount * COMMISSION_RATE;
            
            // إضافة العمولة لرصيد المُحيل
            referrer.referral_balance = (referrer.referral_balance || 0) + commission;
            referrer.total_earned = (referrer.total_earned || 0) + commission;
            
            // تسجيل العملية
            if (!referrer.referrals) referrer.referrals = [];
            referrer.referrals.push({
                user_id: user_id,
                amount: amount,
                commission: commission,
                date: new Date().toISOString(),
                action: action
            });
            
            users.set(referral_code, referrer);
        }
        
        res.json({
            success: true,
            commission: commission,
            referrer_balance: referrer.referral_balance
        });
        
    } catch (error) {
        console.error('Referral tracking error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * API: إنشاء كود إحالة للمستخدم
 * POST /api/referral/create
 */
app.post('/api/referral/create', async (req, res) => {
    try {
        const { user_id, username } = req.body;
        
        // إنشاء كود فريد
        const referralCode = generateReferralCode();
        
        const userData = {
            user_id: user_id,
            username: username,
            referral_code: referralCode,
            referral_balance: 0,
            total_earned: 0,
            referrals: [],
            created_at: new Date().toISOString()
        };
        
        users.set(referralCode, userData);
        
        res.json({
            success: true,
            referral_code: referralCode,
            referral_link: `https://pandastore.store/?referral=${referralCode}`
        });
        
    } catch (error) {
        console.error('Create referral error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * API: الحصول على بيانات الإحالة للمستخدم
 * GET /api/referral/stats/:referral_code
 */
app.get('/api/referral/stats/:referral_code', async (req, res) => {
    try {
        const { referral_code } = req.params;
        
        const userData = users.get(referral_code);
        if (!userData) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            success: true,
            referral_balance: userData.referral_balance || 0,
            total_earned: userData.total_earned || 0,
            referrals_count: (userData.referrals || []).length,
            referrals: userData.referrals || []
        });
        
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * توليد كود إحالة فريد
 */
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Start server
app.listen(3000, () => {
    console.log('Referral API server running on port 3000');
});

/* 
============================================
 قاعدة البيانات المطلوبة (MySQL/PostgreSQL)
============================================

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    telegram_id BIGINT UNIQUE,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    referral_balance DECIMAL(10,2) DEFAULT 0,
    total_earned DECIMAL(10,2) DEFAULT 0,
    referred_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_referral_code (referral_code),
    INDEX idx_referred_by (referred_by)
);

CREATE TABLE referral_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    referrer_code VARCHAR(50) NOT NULL,
    referee_user_id INT,
    transaction_type ENUM('register', 'purchase', 'withdrawal') NOT NULL,
    amount DECIMAL(10,2),
    commission DECIMAL(10,2),
    status ENUM('pending', 'completed', 'cancelled') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_referrer (referrer_code),
    INDEX idx_referee (referee_user_id)
);

CREATE TABLE purchases (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    stars_quantity INT NOT NULL,
    payment_method VARCHAR(50),
    referral_code VARCHAR(50),
    commission_paid DECIMAL(10,2) DEFAULT 0,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_referral (referral_code)
);
*/

/**
 * Referral Program Page Integration
 * يدير صفحة برنامج الإحالة وعرض الإحصائيات والسحب
 */

class ReferralProgramPage {
    constructor() {
        this.userData = null;
        this.username = null;
        this.telegramUser = null;
    }

    /**
     * تهيئة الصفحة
     */
    async init() {
        // ⚠️ انتظر قليلاً للسماح لـ localStorage بالتحديث (للمستخدمين الجدد)
        await this.waitForUser();
        
        // الحصول على بيانات المستخدم من localStorage
        this.telegramUser = TelegramLoginHandler.getCurrentUser();
        
        if (!this.telegramUser) {
            console.error('❌ User not logged in after waiting');
            this.redirectToLogin();
            return;
        }

        this.username = this.telegramUser.username || this.telegramUser.id;
        console.log('✅ Referral program page initialized for:', this.username);
        
        // تحديث معلومات المستخدم الأساسية فوراً
        this.updateUserInfo();
        
        // جلب بيانات المستخدم من السيرفر
        await this.loadUserData();
        
        // تحديث Event Listeners
        this.attachEventListeners();
    }

    /**
     * انتظار بيانات المستخدم (للمستخدمين الجدد)
     */
    async waitForUser() {
        // تحقق إذا كان المستخدم للتو سجل دخول (خلال آخر 5 ثواني)
        const loginTimestamp = localStorage.getItem('telegram_login_timestamp');
        if (loginTimestamp) {
            const timeSinceLogin = Date.now() - parseInt(loginTimestamp);
            if (timeSinceLogin < 5000) {
                console.log('⏳ Waiting for user data to sync...');
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    /**
     * جلب بيانات المستخدم من السيرفر
     */
    async loadUserData() {
        // استخدام username أو telegram_id
        const identifier = this.username || this.telegramUser.id;
        
        try {
            const data = await window.referralSystem.getUserData(identifier);
            
            if (data && data.success) {
                this.userData = data;
                console.log('✅ User data loaded:', this.userData);
                // تحديث الواجهة بعد تحميل البيانات
                this.updateUI();
                return true;
            } else {
                console.error('❌ Failed to load user data');
                // محاولة تسجيل المستخدم إذا لم يكن موجود
                await this.registerUser();
                return false;
            }
        } catch (error) {
            console.error('❌ Error loading user data:', error);
            // محاولة تسجيل المستخدم
            await this.registerUser();
            return false;
        }
    }

    /**
     * تحديث واجهة المستخدم
     */
    updateUI() {
        // تحديث الصورة واليوزرنيم والاسم (لا يحتاج userData)
        this.updateUserInfo();

        // تحديث رابط الإحالة والأرصدة والجداول (يحتاج userData)
        if (this.userData) {
            this.updateReferralLink();
            this.updateBalances();
            this.updateReferralsTable();
            this.updateEarningsTable();
        }
    }

    /**
     * تحديث معلومات المستخدم (الصورة، الاسم، اليوزرنيم)
     */
    updateUserInfo() {
        console.log('📝 Updating user info in referral page...', this.telegramUser);
        
        // تحديث الصورة
        const userImage = document.querySelector('.tg-info-wrapper .img');
        if (userImage) {
            if (this.telegramUser.photo_url) {
                userImage.src = this.telegramUser.photo_url;
                console.log('✅ Profile image updated:', this.telegramUser.photo_url);
            } else {
                // استخدام صورة افتراضية إذا لم تكن متوفرة
                userImage.src = '../img/default-avatar.svg';
                console.log('⚠️ Using default avatar');
            }
            userImage.alt = this.telegramUser.username || this.telegramUser.first_name || 'User';
        }

        // تحديث اليوزرنيم
        const usernameElement = document.getElementById('myself');
        if (usernameElement) {
            const displayName = this.telegramUser.username || 
                               `user_${this.telegramUser.id}` || 
                               'user';
            usernameElement.textContent = displayName;
            console.log('✅ Username updated:', displayName);
        }

        // إضافة الاسم الكامل إذا لم يكن موجود
        const usernameWrapper = document.querySelector('.tg-info-wrapper .username');
        if (usernameWrapper && this.telegramUser.first_name) {
            const fullName = `${this.telegramUser.first_name || ''} ${this.telegramUser.last_name || ''}`.trim();
            if (fullName && !document.querySelector('.user-full-name')) {
                usernameWrapper.insertAdjacentHTML('afterend', `
                    <p class="user-full-name" style="text-align: center; color: #999; margin-top: 5px; font-size: 14px;">
                        ${fullName}
                    </p>
                `);
                console.log('✅ Full name added:', fullName);
            }
        }
    }

    /**
     * تحديث رابط الإحالة
     */
    updateReferralLink() {
        if (!this.userData || !this.userData.user) return;
        
        // استخدام username مباشرة كـ referral code
        const referralCode = this.userData.user.referralCode || this.userData.user.referral_code || this.username;
        
        if (!referralCode) {
            console.error('❌ Referral code not found from server');
            return;
        }
        
        const referralLink = `https://pandastore.store?ref=${referralCode}`;
        
        console.log('📋 Referral Code (Username):', referralCode);
        
        // تحديث input field في صفحة برنامج الإحالة
        const referralLinkInput = document.getElementById('user-referral-link');
        if (referralLinkInput) {
            referralLinkInput.value = referralLink;
            console.log('✅ Referral link updated:', referralLink);
        }
        
        // تحديث الكود في العنصر المخصص
        const referralCodeElement = document.getElementById('user-referral-code');
        if (referralCodeElement) {
            referralCodeElement.textContent = referralCode;
            console.log('✅ Referral code displayed:', referralCode);
        }
    }

    /**
     * تحديث الأرصدة (رصيد الإحالة، إجمالي الأرباح)
     */
    updateBalances() {
        if (!this.userData || !this.userData.user) return;
        
        const user = this.userData.user;
        
        // تحديث رصيد الإحالة
        const referralBalanceElement = document.getElementById('user-referral-balance');
        if (referralBalanceElement) {
            const balance = user.availableBalance || user.available_balance || 0;
            referralBalanceElement.innerHTML = `$${balance.toFixed(2)}`;
            console.log('✅ Referral balance updated:', balance);
            
            // تفعيل/تعطيل زر السحب بناءً على الرصيد
            this.updateWithdrawButton(balance);
        }
        
        // تحديث إجمالي الأرباح
        const totalEarningsElement = document.getElementById('user-total-earnings');
        if (totalEarningsElement) {
            const earnings = user.totalEarnings || user.total_earnings || 0;
            totalEarningsElement.innerHTML = `$${earnings.toFixed(2)}`;
            console.log('✅ Total earnings updated:', earnings);
        }
        
        // تحديث المستوى الحالي
        this.updateUserLevel();
    }
    
    /**
     * تحديث حالة زر السحب
     */
    updateWithdrawButton(balance) {
        const withdrawBtn = document.querySelector('.withdraw-btn');
        if (withdrawBtn) {
            if (balance >= 1) {
                withdrawBtn.disabled = false;
                withdrawBtn.style.opacity = '1';
                withdrawBtn.style.cursor = 'pointer';
                withdrawBtn.style.background = 'linear-gradient(135deg, #ffd76a 0%, #ff922b 100%)';
                withdrawBtn.style.boxShadow = '0 4px 15px rgba(255, 215, 106, 0.4)';
                console.log('✅ Withdraw button enabled - Balance:', balance);
            } else {
                withdrawBtn.disabled = true;
                withdrawBtn.style.opacity = '0.5';
                withdrawBtn.style.cursor = 'not-allowed';
                withdrawBtn.style.background = '#ccc';
                withdrawBtn.style.boxShadow = 'none';
                console.log('⚠️ Withdraw button disabled - Insufficient balance:', balance);
            }
        }
    }

    /**
     * تحديث مستوى المستخدم
     */
    updateUserLevel() {
        if (!this.userData || !this.userData.user) return;
        
        const user = this.userData.user;
        const level = user.level || 'Bronze';
        const commissionRate = user.commissionRate || user.commission_rate || 1;
        const userOwnPurchases = user.userOwnPurchases || user.user_own_purchases || 0;
        const totalReferredPurchases = user.totalReferredPurchases || user.total_referred_purchases || 0;
        
        // البحث عن مكان عرض المستوى
        const levelElement = document.querySelector('.level-badge') || 
                            document.querySelector('.user-level') ||
                            document.getElementById('user-level');
        
        if (levelElement) {
            levelElement.innerHTML = `
                <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px; color: white; margin: 20px 0; box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);">
                    <h3 style="margin: 0 0 15px 0; font-size: 24px; font-weight: 700;">Your Level: ${level}</h3>
                    <p style="margin: 8px 0; font-size: 16px;">Commission Rate: <strong>${commissionRate}%</strong></p>
                    <p style="margin: 8px 0; font-size: 14px; opacity: 0.9;">Total Referred Purchases: ${totalReferredPurchases.toLocaleString()} ⭐</p>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 14px;">
                        ${this.getNextLevelInfo(userOwnPurchases)}
                    </div>
                </div>
            `;
            console.log('✅ User level updated:', level, 'Commission:', commissionRate, 'Own purchases:', userOwnPurchases);
        }
    }

    /**
     * معلومات المستوى التالي
     */
    getNextLevelInfo(currentPurchases) {
        if (currentPurchases >= 5000) {
            return '🏆 You have reached the maximum level (Diamond)!';
        } else if (currentPurchases >= 4000) {
            const needed = 5000 - currentPurchases;
            return `Next Level: Diamond (${needed.toLocaleString()} more stars needed)`;
        } else if (currentPurchases >= 3000) {
            const needed = 4000 - currentPurchases;
            return `Next Level: Platinum (${needed.toLocaleString()} more stars needed)`;
        } else if (currentPurchases >= 2000) {
            const needed = 3000 - currentPurchases;
            return `Next Level: Gold (${needed.toLocaleString()} more stars needed)`;
        } else if (currentPurchases >= 1000) {
            const needed = 2000 - currentPurchases;
            return `Next Level: Silver (${needed.toLocaleString()} more stars needed)`;
        } else {
            const needed = 1000 - currentPurchases;
            return `Next Level: Bronze (${needed.toLocaleString()} more stars needed)`;
        }
    }

    /**
     * تسجيل المستخدم إذا لم يكن موجود
     */
    async registerUser() {
        try {
            console.log('🔄 Registering user...', this.telegramUser);
            const result = await window.referralSystem.registerUser(this.telegramUser);
            if (result && result.success) {
                this.userData = result;
                console.log('✅ User registered successfully');
                // إعادة جلب البيانات الكاملة
                const identifier = this.username || this.telegramUser.id;
                const fullData = await window.referralSystem.getUserData(identifier);
                if (fullData && fullData.success) {
                    this.userData = fullData;
                    // تحديث الواجهة بعد التسجيل
                    this.updateUI();
                }
            }
        } catch (error) {
            console.error('❌ Registration error:', error);
        }
    }

    /**
     * التوجيه إلى صفحة Login
     */
    redirectToLogin() {
        const currentPath = window.location.pathname;
        const langMatch = currentPath.match(/^\/(ar|de|en|es|fr|it|ru)\//);
        const lang = langMatch ? langMatch[1] : 'en';
        
        // عرض رسالة قبل التوجيه
        console.warn('⚠️ Redirecting to login page...');
        
        setTimeout(() => {
            window.location.href = `/${lang}/login.html`;
        }, 2000);
    }

    /**
     * تحديث جدول الإحالات (بدون إعادة رسم كامل)
     */
    updateReferralsTable() {
        if (!this.userData || !this.userData.user) return;
        
        const referralsContainer = document.querySelector('.referrals-table');
        if (!referralsContainer) return;
        
        referralsContainer.innerHTML = this.renderReferralsList();
        console.log('✅ Referrals table updated');
    }

    /**
     * تحديث جدول الأرباح (بدون إعادة رسم كامل)
     */
    updateEarningsTable() {
        if (!this.userData || !this.userData.user) return;
        
        const earningsContainer = document.querySelector('.earnings-table');
        if (!earningsContainer) return;
        
        earningsContainer.innerHTML = this.renderEarningsHistory();
        console.log('✅ Earnings table updated');
    }

    /**
     * رسم قائمة الإحالات
     */
    renderReferralsList() {
        if (!this.userData.referrals || this.userData.referrals.length === 0) {
            return '<p class="empty-state">No referrals yet. Share your link to get started!</p>';
        }

        let html = '<table><thead><tr><th>Username</th><th>Name</th><th>Stars Purchased</th><th>Your Earnings</th><th>Orders</th></tr></thead><tbody>';
        
        this.userData.referrals.forEach(ref => {
            html += `
                <tr>
                    <td>@${ref.username || 'N/A'}</td>
                    <td>${ref.fullName || ref.full_name || 'N/A'}</td>
                    <td>${(ref.totalStars || ref.total_stars || 0).toLocaleString()} ⭐</td>
                    <td style="color: #4caf50; font-weight: bold;">$${window.referralSystem.formatNumber(ref.totalEarnings || ref.total_earnings || 0)}</td>
                    <td>${ref.ordersCount || ref.orders_count || 0}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        return html;
    }

    /**
     * رسم سجل الأرباح
     */
    renderEarningsHistory() {
        if (!this.userData.earnings || this.userData.earnings.length === 0) {
            return '<p class="empty-state">No earnings yet</p>';
        }

        let html = '<table><thead><tr><th>Date</th><th>Stars</th><th>Commission</th><th>Amount</th></tr></thead><tbody>';
        
        this.userData.earnings.forEach(earning => {
            html += `
                <tr>
                    <td>${window.referralSystem.formatDate(earning.created_at)}</td>
                    <td>${earning.stars_purchased?.toLocaleString()} ⭐</td>
                    <td>${earning.commission_percentage}%</td>
                    <td>$${window.referralSystem.formatNumber(earning.commission_amount)}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        return html;
    }

    /**
     * إضافة Event Listeners
     */
    attachEventListeners() {
        // نسخ رابط الإحالة
        const copyBtn = document.getElementById('copy_referral_btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                window.referralSystem.copyReferralLink(this.userData.user.referral_code);
            });
        }

        // طلب سحب
        const withdrawBtn = document.getElementById('request_withdrawal_btn');
        if (withdrawBtn) {
            withdrawBtn.addEventListener('click', () => this.handleWithdrawal());
        }
    }

    /**
     * معالجة طلب السحب
     */
    async handleWithdrawal() {
        const withdrawBtn = document.querySelector('.withdraw-btn');
        const amount = parseFloat(document.getElementById('withdrawal_amount')?.value || 0);
        const wallet = document.getElementById('wallet_address')?.value?.trim();

        if (!amount || amount < 1) {
            window.referralSystem.showNotification('error', 'Minimum withdrawal is $1');
            return;
        }

        if (amount > this.userData.user.available_balance) {
            window.referralSystem.showNotification('error', 'Insufficient balance');
            return;
        }

        if (!wallet || !wallet.startsWith('T')) {
            window.referralSystem.showNotification('error', 'Invalid USDT TRC20 wallet address');
            return;
        }

        // تغيير لون الزر إلى أخضر عند المعالجة
        if (withdrawBtn) {
            withdrawBtn.style.background = 'linear-gradient(135deg, #51cf66 0%, #38a169 100%)';
            withdrawBtn.style.boxShadow = '0 4px 15px rgba(81, 207, 102, 0.4)';
            withdrawBtn.innerHTML = '⏳ Processing...';
        }

        const result = await window.referralSystem.requestWithdrawal(this.username, amount, wallet);
        
        if (result) {
            // إعادة تحميل البيانات
            setTimeout(() => this.loadUserData(), 2000);
        } else {
            // إرجاع اللون الأصفر في حالة الفشل
            if (withdrawBtn) {
                withdrawBtn.style.background = 'linear-gradient(135deg, #ffd76a 0%, #ff922b 100%)';
                withdrawBtn.style.boxShadow = '0 4px 15px rgba(255, 215, 106, 0.4)';
                withdrawBtn.innerHTML = '💸 Withdraw';
            }
        }
    }

    /**
     * عرض خطأ
     */
    showError(message) {
        const container = document.querySelector('.main-container');
        if (container) {
            container.innerHTML = `
                <div class="error-state">
                    <h2>❌ Error</h2>
                    <p>${message}</p>
                    <a href="/en/login" class="btn">Login</a>
                </div>
            `;
        }
    }
}

// تهيئة الصفحة عند تحميل DOM
document.addEventListener('DOMContentLoaded', () => {
    const referralProgramPage = new ReferralProgramPage();
    referralProgramPage.init();
    
    // جعله متاحاً globally
    window.referralProgramPage = referralProgramPage;
});

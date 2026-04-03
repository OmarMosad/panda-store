/**
 * Profile Page Integration
 * يدير صفحة البروفايل وعرض بيانات المستخدم والإحالات
 */

class ProfilePage {
    constructor() {
        this.userData = null;
        this.username = null;
        this.telegramUser = null;
        this.ordersToShow = 6;
        this.showingAll = false;
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
        console.log('✅ Profile page initialized for:', this.username);
        
        // تحديث معلومات المستخدم الأساسية فوراً
        this.updateUserInfo();
        
        // جلب بيانات المستخدم من السيرفر
        await this.loadUserData();
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
                // جلب سجل الأوردرات
                await this.loadOrdersHistory();
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
     * جلب سجل الأوردرات
     */
    async loadOrdersHistory() {
        const username = this.username || this.telegramUser.username;
        
        if (!username) {
            console.warn('⚠️ No username available to load orders');
            return;
        }
        
        try {
            console.log(`📦 Loading orders history for @${username}...`);
            const response = await fetch(window.buildApiUrl(`/api/user/${username}/orders`));
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.success && data.orders) {
                    this.ordersData = data.orders;
                    console.log('✅ Orders history loaded:', this.ordersData.length, 'orders');
                    
                    // عرض الأوردرات فوراً
                    this.displayOrdersHistory();
                } else {
                    console.log('ℹ️ No orders found for @' + username);
                }
            } else {
                console.error('❌ Failed to load orders:', response.status);
            }
        } catch (error) {
            console.error('❌ Error loading orders history:', error);
        }
    }

    /**
     * عرض سجل الأوردرات
     */
    displayOrdersHistory() {
        console.log('🎨 Displaying orders history...');
        
        if (!this.ordersData || this.ordersData.length === 0) {
            console.log('⚠️ No orders to display');
            return;
        }

        // البحث عن مكان عرض الأوردرات
        const emptyDataWrapper = document.querySelector('.empty-no-data-wrapper');
        if (emptyDataWrapper) {
            // إخفاء رسالة "No data"
            emptyDataWrapper.style.display = 'none';

            // إزالة الجدول القديم إذا كان موجوداً
            const existingTable = document.querySelector('.orders-history-table');
            if (existingTable) {
                existingTable.remove();
            }

            // إنشاء جدول الأوردرات بألوان متناسقة مع الصفحة
            const ordersTable = document.createElement('div');
            ordersTable.className = 'orders-history-table';
            ordersTable.style.cssText = 'width: 100%; overflow-x: auto; margin-top: 20px;';
            
            // عرض أول 6 أوردرات فقط في البداية
            const ordersToDisplay = this.showingAll ? this.ordersData : this.ordersData.slice(0, this.ordersToShow);
            
            ordersTable.innerHTML = `
                <table style="width: 100%; border-collapse: collapse; background: linear-gradient(135deg, #1a1f2e 0%, #2d3548 100%); border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                    <thead>
                        <tr style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                            <th style="padding: 15px 12px; text-align: center; font-weight: 600; font-size: 14px; border-right: 1px solid rgba(255,255,255,0.1);">ID</th>
                            <th style="padding: 15px 12px; text-align: center; font-weight: 600; font-size: 14px; border-right: 1px solid rgba(255,255,255,0.1);">Date</th>
                            <th style="padding: 15px 12px; text-align: center; font-weight: 600; font-size: 14px; border-right: 1px solid rgba(255,255,255,0.1);">Stars</th>
                            <th style="padding: 15px 12px; text-align: center; font-weight: 600; font-size: 14px;">Amount (USD)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ordersToDisplay.map((order, index) => `
                            <tr style="background: ${index % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)'}; border-bottom: 1px solid rgba(255,255,255,0.05); transition: all 0.2s;">
                                <td style="padding: 14px 12px; text-align: center; color: #a8b3cf; font-weight: 500; font-size: 13px;">#${order.id}</td>
                                <td style="padding: 14px 12px; text-align: center; color: #e0e7ff; font-size: 13px;">${order.date}</td>
                                <td style="padding: 14px 12px; text-align: center; color: #ffd76a; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 5px;">
                                    ${order.stars}
                                    <img src="/img/star.svg" alt="star" style="width: 18px; height: 18px; filter: drop-shadow(0 0 3px rgba(255, 215, 106, 0.5));">
                                </td>
                                <td style="padding: 14px 12px; text-align: center; color: #51cf66; font-weight: 600; font-size: 14px;">$${parseFloat(order.amountUsd).toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${this.ordersData.length > this.ordersToShow ? `
                    <div style="text-align: center; margin-top: 15px;">
                        <button id="show-more-orders-btn" style="padding: 12px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.3s; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
                            ${this.showingAll ? '🔼 Show Less' : '🔽 Show More'}
                        </button>
                    </div>
                ` : ''}
                <div style="text-align: center; color: #a8b3cf; margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.03); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 14px; font-weight: 500;">📊 Total Orders: </span>
                    <span style="font-size: 16px; font-weight: 700; color: #667eea;">${this.ordersData.length}</span>
                </div>
            `;

            // إدراج الجدول بعد wrapper
            emptyDataWrapper.parentNode.insertBefore(ordersTable, emptyDataWrapper.nextSibling);
            
            // إضافة event listener لزر عرض المزيد
            const showMoreBtn = document.getElementById('show-more-orders-btn');
            if (showMoreBtn) {
                showMoreBtn.addEventListener('click', () => {
                    this.showingAll = !this.showingAll;
                    this.displayOrdersHistory();
                });
            }
            
            console.log('✅ Orders table displayed successfully');
        } else {
            console.warn('⚠️ Could not find .empty-no-data-wrapper element');
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
     * تحديث واجهة المستخدم
     */
    updateUI() {
        // تحديث الصورة واليوزرنيم والاسم (لا يحتاج userData)
        this.updateUserInfo();

        // تحديث البيانات الديناميكية (يحتاج userData)
        if (this.userData && this.userData.user) {
            this.updatePurchasedStars();
            this.updateUserLevel();
        }
    }

    /**
     * تحديث معلومات المستخدم (الصورة، الاسم، اليوزرنيم)
     */
    updateUserInfo() {
        console.log('📝 Updating user info...', this.telegramUser);
        
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
     * تحديث عدد النجوم المشتراة
     */
    updatePurchasedStars() {
        if (!this.userData || !this.userData.user) return;
        
        const purchasedElement = document.querySelector('.stats-item:first-child .stats-stars');
        if (purchasedElement) {
            // حساب إجمالي النجوم من مشتريات المستخدم نفسه
            const totalStars = this.userData.user.userOwnPurchases || 0;
            purchasedElement.innerHTML = `
                ${totalStars.toLocaleString()}
                <svg class="icon" width="29" height="20">
                    <use xlink:href="#icon-multi-star" transform="translate(9,0)"></use>
                    <use xlink:href="#icon-multi-star" transform="translate(6,0)"></use>
                    <use xlink:href="#icon-multi-star" transform="translate(3,0)"></use>
                    <use xlink:href="#icon-multi-star"></use>
                </svg>
            `;
            console.log('✅ Purchased stars updated:', totalStars);
        }
    }

    /**
     * تحديث مستوى المستخدم
     */
    updateUserLevel() {
        if (!this.userData || !this.userData.user) return;
        
        const levelElement = document.querySelector('.stats-level');
        if (levelElement) {
            const ownPurchases = parseInt(this.userData.user.userOwnPurchases || 0, 10);
            const level = this.getUserLevelByOwnPurchases(ownPurchases);
            const levelClass = `stats-level-${level.toLowerCase()}`;

            // الحفاظ على أيقونة المعلومات الموجودة داخل العنصر
            const levelInfo = levelElement.querySelector('.level-info');

            // إزالة الـ classes القديمة وتعيين class جديد
            levelElement.className = 'stats stats-level ' + levelClass;

            // تحديث النص بشكل موثوق ثم إعادة إضافة أيقونة المعلومات
            levelElement.innerHTML = '';
            levelElement.appendChild(document.createTextNode(level.toUpperCase() + ' '));
            if (levelInfo) {
                levelElement.appendChild(levelInfo);
            }
            
            console.log('✅ User level updated from own purchases:', level, ownPurchases);
        }
    }

    /**
     * تحديد مستوى المستخدم من مشترياته الشخصية فقط
     */
    getUserLevelByOwnPurchases(ownPurchases) {
        if (ownPurchases >= 10000) return 'diamond';
        if (ownPurchases >= 7000) return 'platinum';
        if (ownPurchases >= 5000) return 'gold';
        if (ownPurchases >= 3000) return 'silver';
        if (ownPurchases >= 1000) return 'bronze';
        return 'bronze';
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
}

// تهيئة الصفحة عند تحميل DOM
document.addEventListener('DOMContentLoaded', () => {
    const profilePage = new ProfilePage();
    profilePage.init();
    
    // جعله متاحاً globally
    window.profilePage = profilePage;
});

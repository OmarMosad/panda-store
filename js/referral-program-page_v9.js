/**
 * Referral Program Page Integration
 * يدير صفحة برنامج الإحالة وعرض الإحصائيات والسحب
 */

class ReferralProgramPage {
    constructor() {
        this.userData = null;
        this.username = null;
        this.telegramUser = null;
        this.tonConnectManifestPath = '/tonconnect-manifest.json';
    }

    getPageLang() {
        const lang = (document.documentElement.lang || 'en').toLowerCase();
        if (['ar', 'de', 'en', 'es', 'fr', 'it', 'ru'].includes(lang)) {
            return lang;
        }
        return 'en';
    }

    getText(key) {
        const lang = this.getPageLang();
        const dictionary = {
            rewardWalletTitle: {
                ar: 'عنوان محفظة أرباحك',
                en: 'Your Rewards Wallet Address',
                de: 'Ihre Rewards-Wallet-Adresse',
                es: 'Direccion de tu billetera de recompensas',
                fr: 'Adresse de votre portefeuille de gains',
                it: 'Indirizzo del tuo wallet ricompense',
                ru: 'Адрес вашего кошелька для выплат'
            },
            rewardWalletPlaceholder: {
                ar: 'لم يتم ربط محفظة بعد',
                en: 'No wallet linked yet',
                de: 'Noch keine Wallet verknupft',
                es: 'Aun no hay billetera vinculada',
                fr: 'Aucun portefeuille lie pour le moment',
                it: 'Nessun wallet collegato al momento',
                ru: 'Кошелек пока не привязан'
            },
            changeWalletBtn: {
                ar: 'تغيير',
                en: 'Change',
                de: 'Andern',
                es: 'Cambiar',
                fr: 'Modifier',
                it: 'Cambia',
                ru: 'Изменить'
            },
            changingWalletBtn: {
                ar: 'جاري التغيير...',
                en: 'Changing...',
                de: 'Wird geandert...',
                es: 'Cambiando...',
                fr: 'Modification...',
                it: 'Cambio in corso...',
                ru: 'Изменение...'
            },
            walletChangedSuccess: {
                ar: 'تم تحديث عنوان محفظة الأرباح بنجاح',
                en: 'Rewards wallet address updated successfully',
                de: 'Rewards-Wallet-Adresse erfolgreich aktualisiert',
                es: 'Direccion de billetera actualizada correctamente',
                fr: 'Adresse du portefeuille mise a jour avec succes',
                it: 'Indirizzo wallet aggiornato con successo',
                ru: 'Адрес кошелька успешно обновлен'
            },
            walletConnectingFailed: {
                ar: 'فشل الاتصال بالمحفظة. حاول مرة أخرى.',
                en: 'Wallet connection failed. Please try again.',
                de: 'Wallet-Verbindung fehlgeschlagen. Bitte erneut versuchen.',
                es: 'La conexion de la billetera fallo. Intenta de nuevo.',
                fr: 'La connexion du portefeuille a echoue. Reessayez.',
                it: 'Connessione wallet non riuscita. Riprova.',
                ru: 'Не удалось подключить кошелек. Попробуйте снова.'
            }
        };

        return (dictionary[key] && dictionary[key][lang]) || (dictionary[key] && dictionary[key].en) || '';
    }

    /**
     * تهيئة الصفحة
     */
    async init() {
        // تهيئة TonConnectUI عند بدء الصفحة
        this.initializeTonConnect();

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
     * تهيئة TonConnectUI
     */
    initializeTonConnect() {
        if (typeof TON_CONNECT_UI !== 'undefined') {
            if (!window.tonConnectUI) {
                const currentOrigin = window.location.origin || 'https://pandastore.store';
                window.tonConnectUI = new TON_CONNECT_UI.TonConnectUI({
                    manifestUrl: `${currentOrigin}${this.tonConnectManifestPath}`
                });
                console.log('✅ TonConnectUI initialized for referral program');
            }
        } else {
            console.warn('⚠️ TonConnectUI library not loaded yet');
        }
    }

    async waitForWalletConnection(timeoutMs = 20000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const walletConnection = window.tonConnectUI?.wallet;
            if (walletConnection?.account?.address) {
                return walletConnection;
            }

            await new Promise((resolve) => setTimeout(resolve, 300));
        }

        return null;
    }

    fireThemedAlert(options) {
        if (window.__swalThemed && typeof window.__swalThemed.fire === 'function') {
            return window.__swalThemed.fire(options);
        }

        if (window.Swal && typeof window.Swal.fire === 'function') {
            return window.Swal.fire(options);
        }

        return Promise.resolve();
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

        // تحديث حقل عنوان محفظة الأرباح
        this.renderRewardsWalletField();

        // تحديث رابط الإحالة والأرصدة والجداول (يحتاج userData)
        if (this.userData) {
            this.updateSidebarStats();
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

        const user = this.userData.user;
        const canShareReferral = Boolean(user.canShareReferral || user.walletAddress || user.wallet_address);
        const referralCode = user.referralCode || user.referral_code || this.username;
        const referralLink = `https://pandastore.store?ref=${referralCode}`;

        const referralLinkInput = document.getElementById('user-referral-link');
        const referralCodeElement = document.getElementById('user-referral-code');

        if (!canShareReferral) {
            if (referralLinkInput) {
                referralLinkInput.value = 'Link is locked. Connect your TON wallet first.';
            }
            if (referralCodeElement) {
                referralCodeElement.textContent = 'Wallet Required';
            }
            this.renderWalletBindingPrompt();
            return;
        }

        this.removeWalletBindingPrompt();

        if (referralLinkInput) {
            referralLinkInput.value = referralLink;
            console.log('✅ Referral link updated:', referralLink);
        }

        if (referralCodeElement) {
            referralCodeElement.textContent = referralCode;
            console.log('✅ Referral code displayed:', referralCode);
        }
    }

    renderRewardsWalletField() {
        const section = document.querySelector('.section-referral-program');
        if (!section) return;

        const user = this.userData?.user || {};
        const walletAddress = (user.walletAddress || user.wallet_address || '').trim();

        let container = document.getElementById('rewards_wallet_field_container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'rewards_wallet_field_container';
            container.style.marginTop = '16px';
            container.style.marginBottom = '18px';
            container.style.padding = '12px';
            container.style.border = '1px solid rgba(255, 215, 106, 0.28)';
            container.style.borderRadius = '12px';
            container.style.background = 'linear-gradient(135deg, rgba(255, 215, 106, 0.08) 0%, rgba(255, 146, 43, 0.06) 100%)';

            const label = document.createElement('div');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '8px';
            label.style.marginBottom = '8px';
            label.style.color = '#ffd76a';
            label.style.fontWeight = '700';
            label.style.fontSize = '14px';
            label.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M4 8.5L12 4L20 8.5L12 13L4 8.5Z" stroke="#ffd76a" stroke-width="1.7" stroke-linejoin="round"/>
                    <path d="M4 12.5L12 17L20 12.5" stroke="#ffb347" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M4 16L12 20L20 16" stroke="#ff922b" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>${this.getText('rewardWalletTitle')}</span>
            `;

            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.gap = '8px';
            row.style.alignItems = 'center';
            row.style.flexWrap = 'wrap';

            const input = document.createElement('input');
            input.id = 'rewards_wallet_address_input';
            input.type = 'text';
            input.readOnly = true;
            input.style.flex = '1 1 260px';
            input.style.minWidth = '220px';
            input.style.height = '44px';
            input.style.borderRadius = '10px';
            input.style.padding = '0 12px';
            input.style.border = '1px solid rgba(255, 215, 106, 0.35)';
            input.style.background = 'rgba(13, 17, 23, 0.55)';
            input.style.color = '#f3f4f6';
            input.style.fontSize = '13px';
            input.style.fontWeight = '600';

            const changeBtn = document.createElement('button');
            changeBtn.id = 'change_rewards_wallet_btn';
            changeBtn.type = 'button';
            changeBtn.style.height = '44px';
            changeBtn.style.padding = '0 14px';
            changeBtn.style.border = 'none';
            changeBtn.style.borderRadius = '10px';
            changeBtn.style.cursor = 'pointer';
            changeBtn.style.fontWeight = '700';
            changeBtn.style.display = 'inline-flex';
            changeBtn.style.alignItems = 'center';
            changeBtn.style.gap = '6px';
            changeBtn.style.color = '#1f2937';
            changeBtn.style.background = 'linear-gradient(135deg, #ffd76a 0%, #ffb347 50%, #ff922b 100%)';
            changeBtn.style.boxShadow = '0 8px 18px rgba(255, 178, 34, 0.28)';
            changeBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M4 20H8L18.4 9.6C18.9 9.1 18.9 8.3 18.4 7.8L16.2 5.6C15.7 5.1 14.9 5.1 14.4 5.6L4 16V20Z" stroke="#1f2937" stroke-width="1.7" stroke-linejoin="round"/>
                    <path d="M13 7L17 11" stroke="#1f2937" stroke-width="1.7" stroke-linecap="round"/>
                </svg>
                <span>${this.getText('changeWalletBtn')}</span>
            `;

            changeBtn.addEventListener('click', () => this.handleRewardsWalletChange(changeBtn));

            row.appendChild(input);
            row.appendChild(changeBtn);
            container.appendChild(label);
            container.appendChild(row);

            const target = section.querySelector('.referral-link-wrapper');
            if (target) {
                target.insertAdjacentElement('afterend', container);
            } else {
                section.prepend(container);
            }
        }

        const input = document.getElementById('rewards_wallet_address_input');
        if (input) {
            input.value = walletAddress || this.getText('rewardWalletPlaceholder');
            input.title = walletAddress || '';
        }
    }

    async handleRewardsWalletChange(buttonElement) {
        if (!buttonElement) return;

        const oldHtml = buttonElement.innerHTML;
        buttonElement.disabled = true;
        buttonElement.style.opacity = '0.75';
        buttonElement.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M12 3V7" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M18.364 5.636L15.536 8.464" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M21 12H17" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M18.364 18.364L15.536 15.536" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M12 21V17" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M8.464 15.536L5.636 18.364" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M7 12H3" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M8.464 8.464L5.636 5.636" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
            <span>${this.getText('changingWalletBtn')}</span>
        `;

        try {
            const bindResult = await this.handleWalletBindFromPrompt();
            if (bindResult && bindResult.success) {
                window.referralSystem.showNotification('success', this.getText('walletChangedSuccess'));
            }
        } catch (_) {
            window.referralSystem.showNotification('error', this.getText('walletConnectingFailed'));
        } finally {
            buttonElement.disabled = false;
            buttonElement.style.opacity = '1';
            buttonElement.innerHTML = oldHtml;
        }
    }

    renderWalletBindingPrompt() {
        const referralInput = document.getElementById('user-referral-link');
        if (!referralInput) return;

        const wrapper = referralInput.closest('.ref-link-wrapper') || referralInput.parentElement;
        if (!wrapper) return;

        if (document.getElementById('bind_wallet_prompt_btn')) return;

        const promptContainer = document.createElement('div');
        promptContainer.id = 'bind_wallet_prompt_container';
        promptContainer.style.marginTop = '12px';

        const helperText = document.createElement('p');
        helperText.textContent = 'Connect your TON wallet to activate your referral link.';
        helperText.style.margin = '0 0 8px 0';
        helperText.style.fontSize = '13px';
        helperText.style.color = '#9aa0a6';

        const bindBtn = document.createElement('button');
        bindBtn.id = 'bind_wallet_prompt_btn';
        bindBtn.type = 'button';
        bindBtn.className = 'withdraw-btn';
        bindBtn.textContent = 'Connect TON Wallet';
        bindBtn.style.maxWidth = '260px';

        bindBtn.addEventListener('click', () => this.handleWalletBindFromPrompt());

        promptContainer.appendChild(helperText);
        promptContainer.appendChild(bindBtn);
        wrapper.appendChild(promptContainer);
    }

    removeWalletBindingPrompt() {
        const prompt = document.getElementById('bind_wallet_prompt_container');
        if (prompt) {
            prompt.remove();
        }
    }

    async handleWalletBindFromPrompt() {
        // استخدام TonConnectUI الحقيقي للاتصال بالمحفظة
        if (!window.tonConnectUI) {
            this.initializeTonConnect();
        }

        if (!window.tonConnectUI) {
            window.referralSystem.showNotification('error', 'Wallet connector is not available. Please refresh and try again.');
            return;
        }

        try {
            const connectedWallet = window.tonConnectUI.wallet;

            // افتح واجهة الربط فقط إذا لم تكن المحفظة متصلة بالفعل
            if (!connectedWallet?.account?.address) {
                if (typeof window.tonConnectUI.openModal === 'function') {
                    await window.tonConnectUI.openModal();
                } else {
                    await window.tonConnectUI.connectWallet();
                }
            }

            // انتظر حتى تكتمل عملية الاتصال في المحافظ التي تنهي الربط بشكل غير متزامن
            const walletConnection = await this.waitForWalletConnection();
            if (!walletConnection || !walletConnection.account || !walletConnection.account.address) {
                window.referralSystem.showNotification('error', 'Failed to get wallet address from connection');
                return;
            }

            const walletAddress = walletConnection.account.address;
            console.log('✅ Wallet connected:', walletAddress.substring(0, 20) + '...');

            // استخدم Toast بنفس ستايل تنبيهات الموقع بدل modal بزر Proceed
            await this.fireThemedAlert({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: `Wallet connected: ${walletAddress.substring(0, 20)}...`,
                showConfirmButton: false,
                showCloseButton: true,
                timer: 2800,
                timerProgressBar: true
            });
        } catch (error) {
            console.error('❌ Wallet connection failed:', error);
            window.referralSystem.showNotification('error', 'Wallet connection failed. Please try again.');
            return;
        }

        // الحصول على عنوان المحفظة الربط
        const walletConnection = window.tonConnectUI.wallet;
        if (!walletConnection || !walletConnection.account) {
            window.referralSystem.showNotification('error', 'Wallet connection lost. Please try again.');
            return;
        }

        const walletAddress = walletConnection.account.address;
        const bindResult = await window.referralSystem.bindReferralWallet(this.username, walletAddress);
        if (bindResult && bindResult.success) {
            await this.loadUserData();
            this.updateUI();
                return bindResult;
        }

            return null;
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
     * تحديث بيانات الشريط الجانبي في صفحة الإحالات
     */
    updateSidebarStats() {
        if (!this.userData || !this.userData.user) return;

        const user = this.userData.user;
        const ownPurchases = parseInt(user.userOwnPurchases || user.user_own_purchases || 0, 10);
        const totalReferrals = parseInt(user.totalReferrals || user.total_referrals || 0, 10);
        const availableBalance = parseFloat(user.availableBalance || user.available_balance || 0);

        const purchasedElement = document.querySelector('.stats-wrapper .stats-item:first-child .stats-stars');
        if (purchasedElement) {
            purchasedElement.innerHTML = `${ownPurchases.toLocaleString()}
                <svg class="icon" width="29" height="20">
                    <use xlink:href="#icon-multi-star" transform="translate(9,0)"></use>
                    <use xlink:href="#icon-multi-star" transform="translate(6,0)"></use>
                    <use xlink:href="#icon-multi-star" transform="translate(3,0)"></use>
                    <use xlink:href="#icon-multi-star"></use>
                </svg>`;
        }

        const levelElement = document.querySelector('.stats-wrapper .stats-level');
        if (levelElement) {
            const levelInfo = levelElement.querySelector('.level-info');
            const level = this.getLevelByOwnPurchases(ownPurchases);

            levelElement.className = 'stats stats-level stats-level-' + level.toLowerCase();
            levelElement.innerHTML = '';
            levelElement.appendChild(document.createTextNode(level.toUpperCase() + ' '));
            if (levelInfo) {
                levelElement.appendChild(levelInfo);
            }
        }

        this.upsertSidebarStat('stats-item-total-referrals', 'Total Referrals:', `${totalReferrals}`,
            '<svg style="width: 24px; height: 24px;" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16 11C17.6569 11 19 9.65685 19 8C19 6.34315 17.6569 5 16 5C14.3431 5 13 6.34315 13 8C13 9.65685 14.3431 11 16 11Z" fill="#667eea"/><path d="M8 11C9.65685 11 11 9.65685 11 8C11 6.34315 9.65685 5 8 5C6.34315 5 5 6.34315 5 8C5 9.65685 6.34315 11 8 11Z" fill="#667eea"/><path d="M8 13C5.23858 13 3 15.2386 3 18C3 18.5523 3.44772 19 4 19H12C12.5523 19 13 18.5523 13 18C13 15.2386 10.7614 13 8 13Z" fill="#667eea"/><path d="M16 13C13.2386 13 11 15.2386 11 18C11 18.5523 11.4477 19 12 19H20C20.5523 19 21 18.5523 21 18C21 15.2386 18.7614 13 16 13Z" fill="#667eea"/></svg>',
            '#667eea'
        );

        const totalEarningsItem = document.querySelector('.stats-wrapper .stats-item-total-earnings');
        if (totalEarningsItem) {
            totalEarningsItem.remove();
        }

        const referralBalanceElement = this.findSidebarStatValueByLabel('Referral Balance:');
        if (referralBalanceElement) {
            referralBalanceElement.innerHTML = `$${availableBalance.toFixed(2)}`;
        }
    }

    upsertSidebarStat(itemClass, label, value, iconSvg, color) {
        const statsWrapper = document.querySelector('.stats-wrapper');
        if (!statsWrapper) return;

        let item = statsWrapper.querySelector('.' + itemClass);
        if (!item) {
            item = document.createElement('div');
            item.className = 'stats-item ' + itemClass;
            item.innerHTML = `
                <div class="stats-name">${label}</div>
                <div class="stats stats-stars" style="color: ${color}; font-size: 20px; font-weight: 700; display: flex; align-items: center; gap: 5px;">${value}${iconSvg}</div>
            `;

            const referralBalanceItem = Array.from(statsWrapper.querySelectorAll('.stats-item')).find((node) => {
                const name = node.querySelector('.stats-name');
                return name && name.textContent.trim() === 'Referral Balance:';
            });

            if (referralBalanceItem) {
                referralBalanceItem.insertAdjacentElement('beforebegin', item);
            } else {
                statsWrapper.appendChild(item);
            }
        } else {
            const nameElement = item.querySelector('.stats-name');
            const valueElement = item.querySelector('.stats-stars');
            if (nameElement) nameElement.textContent = label;
            if (valueElement) {
                valueElement.style.color = color;
                valueElement.innerHTML = `${value}${iconSvg}`;
            }
        }
    }

    findSidebarStatValueByLabel(label) {
        const statsItems = document.querySelectorAll('.stats-wrapper .stats-item');
        for (const item of statsItems) {
            const name = item.querySelector('.stats-name');
            if (name && name.textContent.trim() === label) {
                return item.querySelector('.stats-stars');
            }
        }
        return null;
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
        const userOwnPurchases = parseInt(user.userOwnPurchases || user.user_own_purchases || 0, 10);
        const level = this.getLevelByOwnPurchases(userOwnPurchases);
        const commissionRate = this.getCommissionByOwnPurchases(userOwnPurchases);
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
                    <p style="margin: 8px 0; font-size: 14px; opacity: 0.9;">Personal Purchases: ${userOwnPurchases.toLocaleString()} ⭐</p>
                    <p style="margin: 8px 0; font-size: 14px; opacity: 0.9;">Total Referred Purchases: ${totalReferredPurchases.toLocaleString()} ⭐</p>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,0.3); font-size: 14px;">
                        ${this.getNextLevelInfo(userOwnPurchases)}
                    </div>
                </div>
            `;
            console.log('✅ User level updated:', level, 'Commission:', commissionRate, 'Own purchases:', userOwnPurchases);
        }
    }

    getLevelByOwnPurchases(ownPurchases) {
        if (ownPurchases >= 10000) return 'Diamond';
        if (ownPurchases >= 7000) return 'Platinum';
        if (ownPurchases >= 5000) return 'Gold';
        if (ownPurchases >= 3000) return 'Silver';
        if (ownPurchases >= 1000) return 'Bronze';
        return 'Bronze';
    }

    getCommissionByOwnPurchases(ownPurchases) {
        if (ownPurchases >= 10000) return 50;
        if (ownPurchases >= 7000) return 40;
        if (ownPurchases >= 5000) return 30;
        if (ownPurchases >= 3000) return 20;
        if (ownPurchases >= 1000) return 10;
        return 10;
    }

    /**
     * معلومات المستوى التالي
     */
    getNextLevelInfo(currentPurchases) {
        if (currentPurchases >= 10000) {
            return '🏆 You have reached the maximum level (Diamond)!';
        } else if (currentPurchases >= 7000) {
            const needed = 10000 - currentPurchases;
            return `Next Level: Diamond (${needed.toLocaleString()} more stars needed)`;
        } else if (currentPurchases >= 5000) {
            const needed = 7000 - currentPurchases;
            return `Next Level: Platinum (${needed.toLocaleString()} more stars needed)`;
        } else if (currentPurchases >= 3000) {
            const needed = 5000 - currentPurchases;
            return `Next Level: Gold (${needed.toLocaleString()} more stars needed)`;
        } else if (currentPurchases >= 1000) {
            const needed = 3000 - currentPurchases;
            return `Next Level: Silver (${needed.toLocaleString()} more stars needed)`;
        } else {
            const needed = 3000 - currentPurchases;
            return `Next Level: Silver (${needed.toLocaleString()} more stars needed)`;
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
            copyBtn.addEventListener('click', async () => {
                const referralInput = document.getElementById('user-referral-link');
                const linkValue = referralInput ? String(referralInput.value || '').trim() : '';

                if (!linkValue || !linkValue.startsWith('http')) {
                    window.referralSystem.showNotification('error', 'Connect wallet first to unlock your referral link');
                    return;
                }

                try {
                    await navigator.clipboard.writeText(linkValue);
                    window.referralSystem.showNotification('success', 'Referral link copied!');
                } catch (err) {
                    window.referralSystem.showNotification('error', 'Failed to copy link');
                }
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

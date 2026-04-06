// Telegram User Fetch Functionality - Disabled (using inline script instead)
let typingTimer;
const doneTypingInterval = 800;

async function fetchTelegramUserInfo(username) {
    // This function is now disabled - inline script handles fetching
    return;
}

// دالة لاستخراج الصورة من البيانات المشفرة بـ base64
function extractImageFromData(photoData) {
    if (!photoData) return null;
    
    // إذا كانت البيانات تحتوي على img tag
    if (photoData.includes('<img')) {
        const srcMatch = photoData.match(/src="([^"]+)"/);
        if (srcMatch && srcMatch[1]) {
            return srcMatch[1];
        }
    }
    
    return null;
}

// تحويل أول حرف من username لحرف كبير
function capitalizeUsername(username) {
    return username.charAt(0).toUpperCase() + username.slice(1);
}

// عرض معلومات المستخدم
function displayUserInfo(userInfo) {
    const telegramUrl = `https://t.me/${userInfo.username}`;
    const container = document.getElementById('user-display-container');
    if (!container) return;

    const avatarUrl = userInfo.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.name)}&background=ffd76a&color=1a1a2e&size=96&bold=true`;

    container.innerHTML = `
        <div class="telegram-user-display">
            <img src="${avatarUrl}" alt="${userInfo.name}" class="user-avatar" 
                 onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.name)}&background=ffd76a&color=1a1a2e&size=96&bold=true'">
            <div class="user-info">
                <div class="user-name">${userInfo.name}</div>
                <div class="user-username">@${userInfo.username}</div>
            </div>
            <div class="user-actions">
                <a href="${telegramUrl}" target="_blank" class="view-profile-btn" title="View on Telegram">
                    <i class="fab fa-telegram"></i>
                </a>
                <button type="button" class="clear-user-btn" onclick="clearUserSelection()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    container.style.display = 'block';
}

// عرض حالة التحميل
function showLoadingState() {
    const container = document.getElementById('user-display-container');
    if (!container) return;

    container.innerHTML = `
        <div class="telegram-user-display loading">
            <div class="loading-spinner"></div>
            <div class="user-info">
                <div class="loading-text">Loading user info...</div>
            </div>
        </div>
    `;
    
    container.style.display = 'block';
}

// عرض حالة الخطأ
function showErrorState(message) {
    const container = document.getElementById('user-display-container');
    if (!container) return;

    container.innerHTML = `
        <div class="telegram-user-display error">
            <div class="error-icon">
                <i class="fas fa-exclamation-circle"></i>
            </div>
            <div class="user-info">
                <div class="error-text">${message || 'User not found'}</div>
                <div class="error-subtext">Please check the username and try again</div>
            </div>
        </div>
    `;
    
    container.style.display = 'block';
    
    // إخفاء رسالة الخطأ بعد 5 ثوان
    setTimeout(() => {
        clearUserDisplay();
    }, 5000);
}

// مسح عرض المستخدم
function clearUserDisplay() {
    const container = document.getElementById('user-display-container');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
}

// مسح اختيار المستخدم
function clearUserSelection() {
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.value = '';
        usernameInput.focus();
    }
    clearUserDisplay();
}

function getTelegramMiniAppUser() {
    try {
        const webApp = window.Telegram && window.Telegram.WebApp;
        const user = webApp && webApp.initDataUnsafe && webApp.initDataUnsafe.user;
        if (!user || !user.id) return null;

        return {
            id: String(user.id),
            username: user.username || `user_${user.id}`,
            first_name: user.first_name || '',
            last_name: user.last_name || '',
            photo_url: user.photo_url || ''
        };
    } catch (_) {
        return null;
    }
}

function getStoredTelegramUser() {
    try {
        const raw = localStorage.getItem('telegram_user');
        if (!raw) return null;
        const user = JSON.parse(raw);
        if (!user || !user.id) return null;
        if (!user.username) {
            user.username = `user_${user.id}`;
        }
        return user;
    } catch (_) {
        return null;
    }
}

function persistTelegramUser(user) {
    if (!user || !user.id) return;

    try {
        localStorage.setItem('telegram_user', JSON.stringify(user));
        localStorage.setItem('telegram_user_id', String(user.id));
        localStorage.setItem('telegram_username', user.username || String(user.id));
        localStorage.setItem('telegram_login_timestamp', Date.now().toString());
    } catch (_) {
        // no-op
    }
}

function applyTelegramUserToBuyForm(user) {
    if (!user || !user.username) return;

    const cleanUsername = String(user.username).trim().replace(/^@+/, '');
    if (!cleanUsername) return;

    const atUsername = `@${cleanUsername}`;
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.value = atUsername;
        usernameInput.setAttribute('data-username', cleanUsername);
        usernameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const legacyQueryInput = document.querySelector('[name="query"]');
    if (legacyQueryInput && !String(legacyQueryInput.value || '').trim()) {
        legacyQueryInput.value = atUsername;
        legacyQueryInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const legacyTgUsernameInput = document.querySelector('[name="tgUsername"]');
    if (legacyTgUsernameInput) {
        legacyTgUsernameInput.value = cleanUsername;
    }

    const myselfElement = document.getElementById('myself');
    if (myselfElement) {
        myselfElement.textContent = cleanUsername;
    }
}

// Event listeners disabled - inline script handles everything
document.addEventListener('DOMContentLoaded', function() {
    const miniAppUser = getTelegramMiniAppUser();
    const storedUser = getStoredTelegramUser();
    const activeUser = miniAppUser || storedUser;

    if (!activeUser) return;

    persistTelegramUser(activeUser);
    applyTelegramUserToBuyForm(activeUser);
});

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

// Event listeners disabled - inline script handles everything
document.addEventListener('DOMContentLoaded', function() {
    // Inline script in index.html handles all user fetching
});

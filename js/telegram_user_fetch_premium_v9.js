// Telegram User Fetch for Premium Page
// جلب معلومات المستخدم من Telegram لصفحة البريميوم

let typingTimer;
const doneTypingInterval = 1000;
let currentUsername = '';

// دالة لجلب معلومات المستخدم من Telegram
async function fetchTelegramUserInfo(username) {
    username = username.replace('@', '').trim();
    
    if (!username || username.length < 3) {
        clearUserDisplay();
        return;
    }

    currentUsername = username;

    try {
        showLoadingState();
        const realUserInfo = await fetchRealUserInfo(username);
        
        if (realUserInfo && realUserInfo.exists) {
            displayUserInfo(realUserInfo);
        } else {
            showInvalidUsername();
        }
        
    } catch (error) {
        console.error('Error fetching user info:', error);
        showInvalidUsername();
    }
}

// جلب البيانات الحقيقية من Telegram
async function fetchRealUserInfo(username) {
    try {
        const response = await fetch(`https://t.me/${username}`, {
            method: 'GET',
            mode: 'cors',
            credentials: 'omit'
        });
        
        if (!response.ok) {
            return { exists: false };
        }

        const html = await response.text();
        
        if (html.includes('If you have <strong>Telegram</strong>') || 
            html.includes('tgme_page_photo') ||
            html.includes('og:title')) {
            
            const titleMatch = html.match(/<meta property="og:title" content="([^"]+)"/);
            const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
            
            let realName = username;
            if (titleMatch && titleMatch[1]) {
                realName = titleMatch[1]
                    .replace(/\s*-?\s*Telegram\s*$/i, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (realName === `@${username}` || realName.toLowerCase() === username.toLowerCase()) {
                    realName = capitalizeUsername(username);
                }
            } else {
                realName = capitalizeUsername(username);
            }
            
            const avatar = imageMatch && imageMatch[1] ? imageMatch[1] : 
                          `https://t.me/i/userpic/320/${username}.jpg`;
            
            return {
                exists: true,
                username: username,
                name: realName,
                avatar: avatar
            };
        }
        
        return { exists: false };
        
    } catch (error) {
        console.log('Fetch error, trying alternative method:', error);
        return await checkUserExistsAlternative(username);
    }
}

// طريقة بديلة للتحقق من وجود المستخدم
async function checkUserExistsAlternative(username) {
    try {
        const imageUrl = `https://t.me/i/userpic/320/${username}.jpg`;
        const img = new Image();
        
        return new Promise((resolve) => {
            img.onload = function() {
                resolve({
                    exists: true,
                    username: username,
                    name: capitalizeUsername(username),
                    avatar: imageUrl
                });
            };
            
            img.onerror = function() {
                resolve({ exists: false });
            };
            
            setTimeout(() => {
                resolve({
                    exists: true,
                    username: username,
                    name: capitalizeUsername(username),
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=ffd76a&color=1a1a2e&size=96&bold=true`
                });
            }, 3000);
            
            img.src = imageUrl;
        });
    } catch (e) {
        return { exists: false };
    }
}

// تحويل أول حرف من username لحرف كبير
function capitalizeUsername(username) {
    if (!username) return '';
    return username
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

// عرض معلومات المستخدم
function displayUserInfo(userInfo) {
    const container = document.querySelector('.username-container');
    const usernameInput = document.getElementById('username');
    
    if (!container || !usernameInput) return;
    
    container.classList.remove('loading-user', 'invalid-username');
    container.classList.add('user-loaded');
    
    usernameInput.value = userInfo.name;
    usernameInput.setAttribute('data-username', userInfo.username);
    usernameInput.setAttribute('data-display-name', userInfo.name);
    usernameInput.setAttribute('readonly', 'readonly');
    
    let avatarImg = container.querySelector('.user-avatar-icon');
    if (!avatarImg) {
        avatarImg = document.createElement('img');
        avatarImg.className = 'user-avatar-icon';
        container.appendChild(avatarImg);
    }
    
    avatarImg.src = userInfo.avatar;
    avatarImg.alt = userInfo.name;
    avatarImg.onerror = function() {
        this.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo.name)}&background=ffd76a&color=1a1a2e&size=96&bold=true`;
    };
    
    let clearBtn = container.querySelector('.inline-clear-btn');
    if (!clearBtn) {
        clearBtn = document.createElement('button');
        clearBtn.className = 'inline-clear-btn';
        clearBtn.type = 'button';
        clearBtn.innerHTML = '<i class="fas fa-times"></i>';
        clearBtn.onclick = clearUserSelection;
        container.appendChild(clearBtn);
    }
}

// عرض حالة التحميل
function showLoadingState() {
    const container = document.querySelector('.username-container');
    if (!container) return;
    
    container.classList.add('loading-user');
    container.classList.remove('invalid-username', 'user-loaded');
}

// عرض رسالة اليوزرنيم غير صحيح
function showInvalidUsername() {
    const container = document.querySelector('.username-container');
    const usernameInput = document.getElementById('username');
    
    if (!container || !usernameInput) return;
    
    container.classList.add('invalid-username');
    container.classList.remove('loading-user', 'user-loaded');
    
    const originalPlaceholder = usernameInput.placeholder;
    const isArabic = document.documentElement.dir === 'rtl';
    
    usernameInput.placeholder = isArabic ? 
        'اسم المستخدم غير صحيح ❌' : 
        'Invalid username ❌';
    
    setTimeout(() => {
        if (usernameInput.value.trim() === '') {
            usernameInput.placeholder = originalPlaceholder;
            container.classList.remove('invalid-username');
        }
    }, 3000);
}

// مسح عرض المستخدم
function clearUserDisplay() {
    const container = document.querySelector('.username-container');
    
    if (container) {
        container.classList.remove('user-loaded', 'loading-user', 'invalid-username');
        
        const avatarImg = container.querySelector('.user-avatar-icon');
        if (avatarImg) avatarImg.remove();
        
        const clearBtn = container.querySelector('.inline-clear-btn');
        if (clearBtn) clearBtn.remove();
    }
    
    const usernameInput = document.getElementById('username');
    if (usernameInput) {
        usernameInput.removeAttribute('readonly');
        usernameInput.removeAttribute('data-username');
        usernameInput.removeAttribute('data-display-name');
    }
}

// مسح اختيار المستخدم
function clearUserSelection() {
    const usernameInput = document.getElementById('username');
    clearUserDisplay();
    if (usernameInput) {
        usernameInput.value = '';
        usernameInput.focus();
    }
}

// الحصول على username الفعلي عند الإرسال
function getActualUsername() {
    const usernameInput = document.getElementById('username');
    if (!usernameInput) return '';
    
    const actualUsername = usernameInput.getAttribute('data-username');
    if (actualUsername) {
        return actualUsername;
    }
    
    return usernameInput.value.replace('@', '').trim();
}

// تهيئة المستمعين عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
    const usernameInput = document.getElementById('username');
    
    if (usernameInput) {
        usernameInput.addEventListener('input', function(e) {
            if (this.hasAttribute('readonly')) {
                return;
            }
            
            clearTimeout(typingTimer);
            const username = e.target.value.trim();
            
            const container = document.querySelector('.username-container');
            if (container) {
                container.classList.remove('loading-user', 'invalid-username');
            }
            
            if (username.length >= 4) {
                typingTimer = setTimeout(() => {
                    fetchTelegramUserInfo(username);
                }, doneTypingInterval);
            } else if (username.length === 0) {
                clearUserDisplay();
            }
        });

        usernameInput.addEventListener('click', function() {
            if (this.hasAttribute('readonly')) {
                clearUserSelection();
            }
        });
    }
});

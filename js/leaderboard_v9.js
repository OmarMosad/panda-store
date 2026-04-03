// Leaderboard Data Management
document.addEventListener('DOMContentLoaded', async function() {
    showLoadingState();
    await loadLeaderboardData();
});

// Show loading state
function showLoadingState() {
    // Add loading class to podium cards
    document.querySelectorAll('.podium-card').forEach(card => {
        card.classList.add('loading-shimmer');
    });
}

// Remove loading state
function hideLoadingState() {
    document.querySelectorAll('.podium-card').forEach(card => {
        card.classList.remove('loading-shimmer');
    });
}

// Load real leaderboard data from API
async function loadLeaderboardData() {
    try {
        console.log('📊 Loading leaderboard data from server...');
        
        // Fetch from real API
        const response = await axios.get(window.buildApiUrl('/api/leaderboard'), {
            timeout: 15000
        });
        
        if (response.data && response.data.success && response.data.leaderboard) {
            const leaderboard = response.data.leaderboard;
            console.log(`✅ Loaded ${leaderboard.length} users from database`);
            
            hideLoadingState();
            
            // Check if we have enough data
            if (leaderboard.length === 0) {
                console.warn('⚠️ No leaderboard data available yet');
                showNoDataMessage();
                return;
            }
            
            // Populate top 3
            populateTopThree(leaderboard.slice(0, 3));
            
            // Populate rankings 4-20
            populateRankings(leaderboard.slice(3, 20));
        } else {
            throw new Error('Invalid response format');
        }
        
    } catch (error) {
        console.error('❌ Failed to load leaderboard data:', error);
        console.log('⚠️ Using sample data as fallback...');
        
        hideLoadingState();
        
        // Show sample data on error
        const sampleData = generateSampleData();
        populateTopThree(sampleData.slice(0, 3));
        populateRankings(sampleData.slice(3, 20));
    }
}

// Show "no data" message
function showNoDataMessage() {
    const rankingsList = document.getElementById('rankings-list');
    if (rankingsList) {
        rankingsList.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #8b949e;">
                <h3>No purchases yet!</h3>
                <p>Be the first to appear on the leaderboard 🌟</p>
            </div>
        `;
    }
}

// Generate sample data for demonstration
function generateSampleData() {
    const sampleUsers = [
        { username: 'StarKing2026', total_stars: 125000 },
        { username: 'CryptoWhale', total_stars: 98500 },
        { username: 'PandaLover', total_stars: 87300 },
        { username: 'TelegramPro', total_stars: 76200 },
        { username: 'StarCollector', total_stars: 68900 },
        { username: 'MoonShooter', total_stars: 62400 },
        { username: 'DiamondHands', total_stars: 58700 },
        { username: 'SpaceExplorer', total_stars: 54300 },
        { username: 'NightOwl', total_stars: 51200 },
        { username: 'GalaxyRunner', total_stars: 48900 },
        { username: 'SkyWalker', total_stars: 45600 },
        { username: 'StarGazer', total_stars: 42800 },
        { username: 'CosmicTrader', total_stars: 39500 },
        { username: 'LunarVibes', total_stars: 36700 },
        { username: 'StellarPanda', total_stars: 34200 },
        { username: 'NovaStar', total_stars: 31900 },
        { username: 'OrbitMaster', total_stars: 29600 },
        { username: 'MeteorRider', total_stars: 27400 },
        { username: 'AstroKnight', total_stars: 25200 },
        { username: 'PixelHero', total_stars: 23100 }
    ];
    
    return sampleUsers;
}

// Populate top 3 podium
function populateTopThree(topThree) {
    // 1st place
    if (topThree.length >= 1) {
        updatePodiumCard(1, topThree[0]);
    }
    
    // 2nd place
    if (topThree.length >= 2) {
        updatePodiumCard(2, topThree[1]);
    }
    
    // 3rd place
    if (topThree.length >= 3) {
        updatePodiumCard(3, topThree[2]);
    }
}

// Update individual podium card
function updatePodiumCard(position, user) {
    const avatar = document.getElementById(`avatar-${position}`);
    const username = document.getElementById(`username-${position}`);
    const stars = document.getElementById(`stars-${position}`);
    
    if (avatar && username && stars) {
        // Update username
        username.textContent = `@${user.username}`;
        
        // Dynamically adjust username font size based on length
        adjustUsernameFontSize(username, user.username);
        
        // Update stars with animation - use total_stars from API
        const starCount = parseInt(user.total_stars || user.stars || 0);
        animateNumber(stars, 0, starCount, 2000);
        
        // Update avatar - استخدام الرابط المباشر من Telegram
        setUserAvatar(avatar, user.username);
    }
}

// Set user avatar using Telegram direct link
function setUserAvatar(avatarElement, username) {
    // إزالة @ من اليوزر نيم إذا كان موجود
    const cleanUsername = username.replace('@', '');
    
    // استخدام الرابط المباشر من Telegram
    const telegramPhotoUrl = `https://t.me/i/userpic/320/${cleanUsername}.jpg`;
    
    // محاولة تحميل الصورة
    avatarElement.src = telegramPhotoUrl;
    
    // إذا فشل التحميل، استخدم صورة باندا ستور
    avatarElement.onerror = function() {
        this.src = '../img/logo.webp'; // صورة باندا ستور
        this.onerror = null; // منع التكرار اللانهائي
    };
}

// Populate rankings 4-20
function populateRankings(rankings) {
    const rankingsList = document.getElementById('rankings-list');
    
    if (!rankingsList) return;
    
    rankingsList.innerHTML = '';
    
    rankings.forEach((user, index) => {
        const rank = index + 4; // Starting from 4th place
        const rankingItem = createRankingItem(rank, user);
        rankingsList.appendChild(rankingItem);
    });
}

// Create ranking item element
function createRankingItem(rank, user) {
    const item = document.createElement('div');
    item.className = 'ranking-item';
    item.style.animationDelay = `${rank * 0.05}s`;
    
    const starCount = parseInt(user.total_stars || user.stars || 0);
    
    // استخدام الرابط المباشر من Telegram
    const cleanUsername = user.username.replace('@', '');
    const avatarSrc = `https://t.me/i/userpic/320/${cleanUsername}.jpg`;
    
    item.innerHTML = `
        <div class="ranking-left">
            <div class="rank-number">#${rank}</div>
            <img src="${avatarSrc}" alt="Avatar" class="ranking-avatar" onerror="this.src='../img/logo.webp'; this.onerror=null;">
            <div class="ranking-username">@${user.username}</div>
        </div>
        <div class="ranking-right">
            <div class="ranking-stars">
                <img src="../img/star.svg" alt="star" class="ranking-star-icon">
                <span class="stars-value">${formatNumber(starCount)}</span>
            </div>
        </div>
    `;
    
    return item;
}

// Format number with commas
function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Animate number counting
function animateNumber(element, start, end, duration) {
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function
        const easeOutQuad = progress * (2 - progress);
        const current = Math.floor(start + (end - start) * easeOutQuad);
        
        element.textContent = formatNumber(current);
        
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = formatNumber(end);
        }
    }
    
    requestAnimationFrame(update);
}

// Refresh leaderboard data
async function refreshLeaderboard() {
    const refreshBtn = document.querySelector('.refresh-btn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
    }
    
    await loadLeaderboardData();
    
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh';
    }
}

// Smart polling - checks if there are new purchases
let lastUpdateTime = null;
let smartPollingInterval = null;

async function checkForUpdates() {
    try {
        const response = await axios.get(window.buildApiUrl('/api/leaderboard'), {
            timeout: 10000
        });
        
        if (response.data && response.data.success) {
            const currentUpdateTime = response.data.updated_at;
            
            // إذا في تحديث جديد (عملية شراء جديدة)
            if (lastUpdateTime && currentUpdateTime !== lastUpdateTime) {
                console.log('🔔 New purchase detected! Updating leaderboard...');
                lastUpdateTime = currentUpdateTime;
                
                // Show notification (optional - using console for now)
                showUpdateNotification();
                
                await loadLeaderboardData();
            } else if (!lastUpdateTime) {
                lastUpdateTime = currentUpdateTime;
            }
        }
    } catch (error) {
        console.error('⚠️ Failed to check for updates:', error);
    }
}

// Show update notification
function showUpdateNotification() {
    // You can implement a toast notification here
    console.log('✨ Leaderboard updated with new purchase!');
}

// بدء Smart Polling - يتحقق كل دقيقة من وجود شراء جديد
function startSmartPolling() {
    // التحقق كل دقيقة بدلاً من كل 5 دقائق
    smartPollingInterval = setInterval(() => {
        checkForUpdates();
    }, 60 * 1000); // كل دقيقة
    
    console.log('🔍 Smart polling started - will detect new purchases automatically');
}

// Dynamically adjust username font size based on length and container width
function adjustUsernameFontSize(usernameElement, username) {
    const usernameLength = username.length;
    const parentWidth = usernameElement.parentElement.offsetWidth;
    
    // Default font size
    let fontSize = parseFloat(window.getComputedStyle(usernameElement).fontSize);
    
    // Adjust based on username length
    if (usernameLength > 15) {
        fontSize = Math.max(fontSize * 0.55, 10); // Very long usernames
    } else if (usernameLength > 12) {
        fontSize = Math.max(fontSize * 0.65, 11); // Long usernames
    } else if (usernameLength > 9) {
        fontSize = Math.max(fontSize * 0.75, 12); // Medium-long usernames
    } else if (usernameLength > 7) {
        fontSize = Math.max(fontSize * 0.85, 13); // Slightly long usernames
    }
    
    usernameElement.style.fontSize = fontSize + 'px';
}

// إيقاف Smart Polling
function stopSmartPolling() {
    if (smartPollingInterval) {
        clearInterval(smartPollingInterval);
        smartPollingInterval = null;
        console.log('⏹️ Smart polling stopped');
    }
}

// بدء Smart Polling عند تحميل الصفحة
startSmartPolling();

// Export functions for external use
window.leaderboard = {
    refresh: refreshLeaderboard,
    load: loadLeaderboardData,
    startPolling: startSmartPolling,
    stopPolling: stopSmartPolling
};

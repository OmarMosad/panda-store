/**
 * Global Configuration for Telegram Links
 * رابط الدعم: https://t.me/OMAR_M_SHEHATA
 * رابط القناة: https://t.me/pandaadds
 */
(function() {
  'use strict';
  
  // Telegram Links Configuration
  window.TELEGRAM_CONFIG = {
    SUPPORT_LINK: 'https://t.me/OMAR_M_SHEHATA',
    CHANNEL_LINK: 'https://t.me/pandaadds'
  };
  
  // Helper functions for opening links
  window.openSupportLink = function() {
    window.open(window.TELEGRAM_CONFIG.SUPPORT_LINK, '_blank');
  };
  
  window.openChannelLink = function() {
    window.open(window.TELEGRAM_CONFIG.CHANNEL_LINK, '_blank');
  };
  
  // Log for debugging
  console.log('Telegram Config Loaded:', window.TELEGRAM_CONFIG);
})();

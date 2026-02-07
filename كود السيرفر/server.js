// DB Migration: ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_payload TEXT, ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255);

// 1. تحميل متغيرات البيئة
require('dotenv').config();

// 2. استيراد المكتبات
const express = require('express');
const app = express();
const axios = require('axios');
const bodyParser = require('body-parser');
const { Pool } = require('pg');

// 3. إعداد قاعدة البيانات PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection error:', err);
  } else {
    console.log('✅ Database connected successfully at', res.rows[0].now);
  }
});

// 4. إعدادات التطبيق
const WEB_BASE = process.env.WEB_BASE || 'https://panda-scz8.onrender.com';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_IDS = [process.env.ADMIN_ID, process.env.SECOND_ADMIN_ID].filter(Boolean);
const BOT_USERNAME = process.env.BOT_USERNAME || 'PandaStores_bot';

// MarketApp API Configuration
const MARKETAPP_AUTH = process.env.MARKETAPP_AUTH;
const MARKETAPP_URL = process.env.MARKETAPP_URL || 'https://api.marketapp.ws/v1/fragment/stars/buy/';

// Log auth status on startup
console.log('🔐 MARKETAPP_AUTH loaded:', MARKETAPP_AUTH ? `${MARKETAPP_AUTH.substring(0, 15)}...` : '❌ NOT FOUND');

// 4. إعداد CORS
const allowedOrigins = [
  'https://pandastores.netlify.app',
  'https://panda-stores-mu.vercel.app',
  'https://panda-scz8.onrender.com',
  'https://www.pandastore.store',
  'https://pandastore.store',
  'https://paanda-store.netlify.app'
];
if (WEB_BASE && !allowedOrigins.includes(WEB_BASE)) allowedOrigins.push(WEB_BASE);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', true);
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// 5. Middleware
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static('public'));

// Request logger - log all incoming requests
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// ==============================================
// Helper Functions
// ==============================================

// توليد كود إحالة - لم يعد مستخدماً، نستخدم اليوزرنيم مباشرة
function generateReferralCode() {
  // Not used anymore - we use username as referral code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ==============================================
// TON Blockchain Watcher - Payload Matching System
// التحقق من الطلبات عبر مطابقة payload من MarketApp مع tx.in_msg.raw_body
// ==============================================

// إعدادات TON API
const TON_API = "https://tonapi.io/v2";
const PROFIT_WALLET = process.env.PROFIT_WALLET;
const TONAPI_KEY = process.env.TONAPI_KEY;

/**
 * Enhanced TON Watcher - التحقق من معاملات الأرباح على البلوك تشين
 * يعتمد على مطابقة payload مع استراتيجيات متعددة
 */
async function checkProfitTransactions() {
  try {
    // التحقق من وجود المتغيرات البيئية المطلوبة
    if (!PROFIT_WALLET || !TONAPI_KEY) {
      console.error('❌ TON Watcher: Missing PROFIT_WALLET or TONAPI_KEY environment variables');
      return;
    }

    // جلب الطلبات المعلقة التي لديها market_payload ولم يتم تأكيدها بعد
    const { rows: orders } = await pool.query(`
      SELECT id, market_payload, reference_code, username, stars, created_at
      FROM orders
      WHERE status = 'pending'
        AND market_payload IS NOT NULL
        AND market_payload != ''
        AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    if (!orders.length) {
      console.log('✅ TON Watcher: No pending orders with market_payload to verify');
      return;
    }

    console.log(`🔍 TON Watcher: Checking ${orders.length} pending orders by payload matching...`);

    // جلب آخر 100 معاملة من محفظة الأرباح
    let transactions = [];
    try {
      const txResponse = await axios.get(
        `${TON_API}/blockchain/accounts/${PROFIT_WALLET}/transactions?limit=100`,
        {
          headers: { Authorization: `Bearer ${TONAPI_KEY}` },
          timeout: 15000
        }
      );
      
      transactions = txResponse.data?.transactions || [];
      console.log(`📊 Fetched ${transactions.length} transactions from PROFIT_WALLET`);
    } catch (fetchErr) {
      console.error('❌ Failed to fetch wallet transactions:', fetchErr.message);
      return;
    }

    if (!transactions.length) {
      console.log('⏳ No transactions found in PROFIT_WALLET yet');
      return;
    }

    let verifiedCount = 0;
    let notFoundCount = 0;

    // التحقق من كل طلب عبر مطابقة payload مع استراتيجيات متعددة
    for (const order of orders) {
      try {
        console.log(`\n🔍 Verifying order #${order.id}...`);
        if (order.reference_code) {
          console.log(`   └─ Reference: ${order.reference_code}`);
        }
        console.log(`   └─ DB payload: ${order.market_payload.substring(0, 25)}...`);
        
        // البحث عن المعاملة التي تطابق payload - استراتيجيات متعددة
        const match = transactions.find(tx => {
          const chainPayload = tx.in_msg?.raw_body || tx.in_msg?.payload || tx.in_msg?.message;
          if (!chainPayload) return false;
          
          // Strategy 1: المطابقة الدقيقة للـ payload
          if (chainPayload === order.market_payload) {
            console.log(`   └─ ✅ EXACT PAYLOAD MATCH!`);
            return true;
          }
          
          // Strategy 2: Normalized string match (trim whitespace)
          const normalizedChain = chainPayload.trim().replace(/\s+/g, '');
          const normalizedOrder = order.market_payload.trim().replace(/\s+/g, '');
          if (normalizedChain === normalizedOrder) {
            console.log(`   └─ ✅ NORMALIZED PAYLOAD MATCH!`);
            return true;
          }
          
          // Strategy 3: Substring match (payload contained in chain)
          if (chainPayload.includes(order.market_payload) || order.market_payload.includes(chainPayload)) {
            console.log(`   └─ ✅ SUBSTRING PAYLOAD MATCH!`);
            return true;
          }
          
          // Strategy 4: Reference code in comment (if available)
          if (order.reference_code && tx.in_msg?.comment) {
            if (tx.in_msg.comment.includes(order.reference_code)) {
              console.log(`   └─ ✅ REFERENCE CODE MATCH IN COMMENT!`);
              return true;
            }
          }
          
          return false;
        });

        if (match) {
          // استخدام دالة التأكيد الموحدة
          const result = await finalizeOrderSuccess(order.id, match.hash, 'ton_watcher');
          
          if (result.success) {
            verifiedCount++;
            console.log(`✅ Order #${order.id} VERIFIED and FINALIZED!`);
            console.log(`   └─ TX Hash: ${match.hash}`);
            console.log(`   └─ User: @${order.username}, Stars: ${order.stars}`);
          } else {
            console.error(`❌ Order #${order.id} verification found but finalization failed: ${result.message}`);
          }
        } else {
          notFoundCount++;
          console.log(`⏳ Order #${order.id}: No matching TX found yet (payload not on chain)`);
        }

      } catch (verifyErr) {
        console.error(`❌ Order #${order.id}: Verification error:`, verifyErr.message);
      }

      // تأخير صغير بين الطلبات
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // ملخص النتائج
    if (verifiedCount > 0) {
      console.log(`\n🎉 TON Watcher: Successfully verified ${verifiedCount} order(s) by payload matching`);
    }
    if (notFoundCount > 0) {
      console.log(`⏳ TON Watcher: ${notFoundCount} order(s) still waiting for on-chain confirmation`);
    }
    if (verifiedCount === 0 && notFoundCount === 0) {
      console.log('✅ TON Watcher: All orders processed successfully');
    }

  } catch (error) {
    console.error('❌ TON Watcher Error:', error.message);
    if (error.response) {
      console.error('   └─ API Response:', error.response.data);
    }
  }
}

/**
 * إنهاء الطلبات القديمة التي لم يتم دفعها
 */
async function expireOldPendingOrders() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // إيجاد الطلبات المعلقة التي مضى عليها أكثر من 30 دقيقة
    const { rows: expiredOrders } = await client.query(`
      SELECT id, username, stars, created_at
      FROM orders
      WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '30 minutes'
      ORDER BY created_at ASC
      LIMIT 100
    `);

    if (!expiredOrders.length) {
      console.log('✅ No pending orders to expire');
      await client.query('COMMIT');
      return;
    }

    console.log(`🕒 Expiring ${expiredOrders.length} old pending order(s)...`);

    for (const order of expiredOrders) {
      // تغيير حالة الطلب إلى expired
      await client.query(
        `UPDATE orders
         SET status = 'expired', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.id]
      );

      // تسجيل في order_history
      await client.query(`
        INSERT INTO order_history (
          order_id, previous_status, new_status, changed_by, change_reason
        ) VALUES ($1, 'pending', 'expired', 'system', 'Auto-expired after 30 minutes')
      `, [order.id]);

      console.log(`   ⏰ Order #${order.id} expired (@${order.username}, ${order.stars} stars, age: ${Math.floor((Date.now() - new Date(order.created_at)) / 60000)} min)`);
    }

    await client.query('COMMIT');
    console.log(`✅ Successfully expired ${expiredOrders.length} pending order(s)`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error expiring old orders:', error);
  } finally {
    client.release();
  }
}

/**
 * حساب الربح المتوقع بعملة TON
 * @param {number} stars - عدد النجوم المشتراة
 * @param {number} tonPrice - سعر TON بالدولار
 * @returns {number} - قيمة الربح بعملة TON
 */
function calculateProfitTON(stars, tonPrice) {
  const STAR_PRICE_USD = 0.016; // سعر النجمة الواحدة بالدولار
  const PROFIT_PERCENTAGE = 0.70; // نسبة الربح 70%

  // حساب السعر الإجمالي بالدولار
  const totalUSD = stars * STAR_PRICE_USD;

  // حساب الربح بالدولار
  const profitUSD = totalUSD * PROFIT_PERCENTAGE;

  // تحويل الربح إلى TON
  const profitTON = profitUSD / tonPrice;

  return profitTON;
}

/**
 * جلب السعر الحالي لعملة TON بالدولار
 * @returns {Promise<number>} - سعر TON/USD
 */
async function getTONPrice() {
  try {
    const response = await axios.get('https://tonapi.io/v2/rates?tokens=ton&currencies=usd', {
      headers: { Authorization: `Bearer ${TONAPI_KEY}` }
    });

    const tonRate = response.data.rates?.TON?.prices?.USD;
    if (!tonRate) {
      throw new Error('Failed to get TON price');
    }

    return tonRate;
  } catch (error) {
    console.error('❌ Error fetching TON price:', error.message);
    // السعر الافتراضي في حالة الفشل (يمكن تحديثه)
    return 5.0;
  }
}

/**
 * إرسال إشعار تلقرام عند تأكيد الطلب تلقائيًا
 * @param {object} order - بيانات الطلب
 * @param {string} txHash - هاش المعاملة
 */
async function sendVerificationNotification(order, txHash) {
  if (!TELEGRAM_TOKEN || !ADMIN_IDS.length) {
    return; // لا يوجد إعدادات تلقرام
  }

  const message = `
🎉 <b>تأكيد طلب تلقائي</b>

✅ تم التحقق من الطلب عبر TON Blockchain

👤 المستخدم: @${order.username}
⭐ النجوم: ${order.stars}
🆔 Order ID: ${order.id}
🔗 TX Hash: <code>${txHash}</code>

💰 Profit: ${order.profit_ton ? order.profit_ton.toFixed(9) : 'N/A'} TON
⏰ ${new Date().toLocaleString('ar-EG')}
  `.trim();

  // إرسال للأدمنز
  for (const adminId of ADMIN_IDS) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: adminId,
          text: message,
          parse_mode: 'HTML'
        }
      );
    } catch (err) {
      console.error(`⚠️ Failed to notify admin ${adminId}:`, err.message);
    }
  }
}

// ==============================================
// End of TON Blockchain Watcher Functions
// ==============================================

// حساب مستوى المستخدم ونسبة العمولة
function getUserLevelAndCommission(totalStars) {
  // المستويات بناءً على الشحن التراكمي للمُحيل نفسه
  if (totalStars >= 5000) {
    return { level: 'Diamond', commission: 5.0 }; // 5% - من 5000 نجمة
  } else if (totalStars >= 4000) {
    return { level: 'Platinum', commission: 4.0 }; // 4% - من 4000 نجمة
  } else if (totalStars >= 3000) {
    return { level: 'Gold', commission: 3.0 }; // 3% - من 3000 نجمة
  } else if (totalStars >= 2000) {
    return { level: 'Silver', commission: 2.0 }; // 2% - من 2000 نجمة
  } else if (totalStars >= 1000) {
    return { level: 'Bronze', commission: 1.0 }; // 1% - من 1000 نجمة
  } else {
    return { level: 'Starter', commission: 0.5 }; // 0.5% - أقل من 1000 نجمة
  }
}

// ==============================================
// Rate Limiting (Simple IP-based throttling)
// ==============================================
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

function rateLimitMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  const ipData = requestCounts.get(ip);
  
  if (now > ipData.resetTime) {
    ipData.count = 1;
    ipData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (ipData.count >= MAX_REQUESTS_PER_WINDOW) {
    return res.status(429).json({ success: false, error: 'Too many requests, please try again later' });
  }
  
  ipData.count++;
  next();
}

// Clean up old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requestCounts.entries()) {
    if (now > data.resetTime) {
      requestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// ==============================================
// UNIFIED FINALIZATION FUNCTION (Core Logic)
// ==============================================
/**
 * Finalize order success - IDEMPOTENT, TRANSACTIONAL
 * This is the SINGLE source of truth for order finalization
 */
async function finalizeOrderSuccess(orderId, txHash, verificationMethod = 'unknown') {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Lock the order row for update
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { success: false, message: 'Order not found' };
    }
    
    const order = orderResult.rows[0];
    
    // IDEMPOTENCY: If already paid, just return success
    if (order.status === 'paid') {
      await client.query('COMMIT');
      console.log(`✅ Order #${orderId} already paid (idempotent check passed)`);
      return { 
        success: true, 
        message: 'Order already finalized', 
        order,
        alreadyPaid: true 
      };
    }
    
    // Verify order is in pending status
    if (order.status !== 'pending') {
      await client.query('ROLLBACK');
      return { 
        success: false, 
        message: `Order status is ${order.status}, cannot finalize` 
      };
    }
    
    // Get Cairo timezone timestamp for paid_at
    const paidAtTime = new Date();
    
    // Update order to paid
    await client.query(
      `UPDATE orders 
       SET status = 'paid',
           tx_hash = $1,
           profit_tx_hash = $2,
           updated_at = $3,
           paid_at = $4
       WHERE id = $5`,
      [txHash, txHash, paidAtTime, paidAtTime, orderId]
    );
    
    // Insert order history event
    await client.query(
      `INSERT INTO order_history (order_id, event_type, payload, created_at)
       VALUES ($1, $2, $3, $4)`,
      [
        orderId,
        'payment_verified',
        JSON.stringify({
          txHash,
          verificationMethod,
          paidAt: paidAtTime.toISOString(),
          stars: order.stars,
          username: order.username
        }),
        paidAtTime
      ]
    );
    
    // Update daily_stars table (UPSERT by date in Cairo timezone)
    const cairoDate = new Date(paidAtTime.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const dateStr = cairoDate.toISOString().split('T')[0];
    
    await client.query(
      `INSERT INTO daily_stars (date, stars_total, orders_count, updated_at)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (date)
       DO UPDATE SET
         stars_total = daily_stars.stars_total + $2,
         orders_count = daily_stars.orders_count + 1,
         updated_at = $3`,
      [dateStr, order.stars, paidAtTime]
    );
    
    // Apply referral commission (ONLY ONCE)
    if (order.referred_by) {
      // Check if referral commission already applied
      const existingCommission = await client.query(
        `SELECT id FROM referral_earnings WHERE order_id = $1`,
        [orderId]
      );
      
      if (existingCommission.rows.length === 0) {
        // Get referrer
        const referrerResult = await client.query(
          `SELECT * FROM users WHERE referral_code = $1 OR username = $1`,
          [order.referred_by]
        );
        
        if (referrerResult.rows.length > 0) {
          const referrer = referrerResult.rows[0];
          
          // Get referrer's own total purchases to determine commission level
          const referrerOrdersResult = await client.query(
            `SELECT COALESCE(SUM(stars), 0) as total FROM orders WHERE username = $1 AND status = 'paid'`,
            [referrer.username]
          );
          const referrerOwnPurchases = parseInt(referrerOrdersResult.rows[0].total || 0);
          
          // Determine commission level
          const { level, commission } = getUserLevelAndCommission(referrerOwnPurchases);
          
          // Calculate commission amount
          const pricePerStar = 0.016;
          const totalProfit = order.stars * pricePerStar;
          const ownerProfit = totalProfit * 0.70;
          const commissionAmount = (ownerProfit * commission) / 100;
          
          // Insert referral earning
          await client.query(
            `INSERT INTO referral_earnings (user_id, order_id, stars_purchased, commission_percentage, commission_amount, created_at)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [referrer.id, orderId, order.stars, commission, commissionAmount, paidAtTime]
          );
          
          // Update referrer balance
          await client.query(
            `UPDATE users 
             SET total_earnings = total_earnings + $1,
                 available_balance = available_balance + $1,
                 total_referred_purchases = total_referred_purchases + $2
             WHERE id = $3`,
            [commissionAmount, order.stars, referrer.id]
          );
          
          console.log(`💰 Commission applied: @${referrer.username} earned $${commissionAmount.toFixed(4)} (${commission}% - ${level})`);
          
          // Send notification to referrer
          if (referrer.telegram_id && TELEGRAM_TOKEN) {
            try {
              const newBalance = parseFloat(referrer.available_balance) + commissionAmount;
              await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                chat_id: referrer.telegram_id,
                text: `🎉 مبروك! لقد ربحت عمولة\n\n💵 المبلغ: $${commissionAmount.toFixed(4)} USDT\n📊 العمولة: ${commission}% (مستوى ${level})\n⭐️ من شراء: ${order.stars} نجمة بواسطة @${order.username}\n💰 رصيدك: $${newBalance.toFixed(2)}`
              });
            } catch (notifErr) {
              console.error('⚠️ Failed to notify referrer:', notifErr.message);
            }
          }
        }
      } else {
        console.log(`ℹ️ Commission already applied for order #${orderId} (idempotent)`);
      }
    }
    
    // Commit transaction
    await client.query('COMMIT');
    
    // Send admin notification (outside transaction)
    try {
      await sendPaymentSuccessNotification(order, txHash, verificationMethod);
    } catch (notifErr) {
      console.error('⚠️ Failed to send admin notification:', notifErr.message);
    }
    
    console.log(`✅ Order #${orderId} FINALIZED successfully via ${verificationMethod}`);
    console.log(`   └─ User: @${order.username}, Stars: ${order.stars}, TX: ${txHash}`);
    
    return {
      success: true,
      message: 'Order finalized successfully',
      order: {
        ...order,
        status: 'paid',
        tx_hash: txHash,
        paid_at: paidAtTime
      }
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error in finalizeOrderSuccess:', error);
    return {
      success: false,
      message: `Finalization error: ${error.message}`,
      error: error.message
    };
  } finally {
    client.release();
  }
}

/**
 * Send payment success notification to admins
 */
async function sendPaymentSuccessNotification(order, txHash, verificationMethod) {
  if (!TELEGRAM_TOKEN || !ADMIN_IDS.length) {
    return;
  }

  const message = `
🎉 <b>تأكيد دفع طلب</b>

✅ تم التحقق والتأكيد عبر: ${verificationMethod}

👤 المستخدم: @${order.username}
⭐ النجوم: ${order.stars}
🆔 Order ID: ${order.id}
🔗 TX Hash: <code>${txHash}</code>
${order.reference_code ? `🔖 Reference: ${order.reference_code}` : ''}

💰 Profit: ${order.profit_ton ? order.profit_ton.toFixed(9) : 'N/A'} TON
⏰ ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
  `.trim();

  for (const adminId of ADMIN_IDS) {
    try {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: adminId,
          text: message,
          parse_mode: 'HTML'
        },
        { timeout: 5000 }
      );
    } catch (err) {
      console.error(`⚠️ Failed to notify admin ${adminId}:`, err.message);
    }
  }
}

// ==============================================
// Database initialization - جدول الطلبات والإحالات
// ==============================================
const initDatabase = async () => {
  try {
    // جدول الطلبات
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) NOT NULL,
        stars INTEGER NOT NULL,
        amount_ton DECIMAL(10, 6) NOT NULL,
        amount_usd DECIMAL(10, 2) NOT NULL,
        wallet_address VARCHAR(255),
        reference_number VARCHAR(50),
        is_automatic BOOLEAN DEFAULT false,
        referred_by VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create order_history table with correct schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_history (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        previous_status VARCHAR(50),
        new_status VARCHAR(50) NOT NULL,
        changed_by VARCHAR(255),
        change_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ order_history table checked/created');
    
    // Migration: Remove old columns and add new columns to existing order_history table
    try {
      // First, drop NOT NULL constraint on event_type if it exists
      await pool.query(`
        ALTER TABLE order_history 
        ALTER COLUMN event_type DROP NOT NULL
      `);
    } catch (e) {
      // Column might not exist, ignore
    }
    
    try {
      // Add new columns if they don't exist
      await pool.query(`
        ALTER TABLE order_history 
        ADD COLUMN IF NOT EXISTS previous_status VARCHAR(50),
        ADD COLUMN IF NOT EXISTS new_status VARCHAR(50),
        ADD COLUMN IF NOT EXISTS changed_by VARCHAR(255),
        ADD COLUMN IF NOT EXISTS change_reason TEXT
      `);
      console.log('✅ Migration: order_history new columns added');
    } catch (migErr) {
      console.log('⚠️ Migration order_history new columns skipped:', migErr.message);
    }
    
    try {
      // Drop old columns if they exist (no longer needed)
      await pool.query(`
        ALTER TABLE order_history 
        DROP COLUMN IF EXISTS event_type,
        DROP COLUMN IF EXISTS payload
      `);
      console.log('✅ Migration: order_history old columns removed');
    } catch (migErr) {
      console.log('⚠️ Migration order_history old columns removal skipped:', migErr.message);
    }
    
    // Create daily_stars table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS daily_stars (
        date DATE PRIMARY KEY,
        stars_total BIGINT DEFAULT 0,
        orders_count BIGINT DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ daily_stars table checked/created');
    
    // Migration: إضافة referred_by في جدول orders إذا لم يكن موجوداً
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255)
      `);
      console.log('✅ Migration: orders.referred_by column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.referred_by skipped:', migErr.message);
    }
    
    // Migration: إضافة أعمدة TON Blockchain Verification
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'
      `);
      console.log('✅ Migration: orders.status column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.status skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS profit_ton DECIMAL(18,9)
      `);
      console.log('✅ Migration: orders.profit_ton column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.profit_ton skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS profit_tx_hash VARCHAR(255)
      `);
      console.log('✅ Migration: orders.profit_tx_hash column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.profit_tx_hash skipped:', migErr.message);
    }
    
    // Migration: إضافة reference_code للمطابقة الذكية على البلوك تشين
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS reference_code VARCHAR(100)
      `);
      console.log('✅ Migration: orders.reference_code column checked/added');
      
      // Create unique index on reference_code
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS orders_reference_code_unique ON orders(reference_code) WHERE reference_code IS NOT NULL
      `);
      console.log('✅ Migration: unique index on reference_code created');
    } catch (migErr) {
      console.log('⚠️ Migration orders.reference_code skipped:', migErr.message);
    }
    
    // Migration: إضافة tx_hash للتحقق المباشر من المعاملة
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255)
      `);
      console.log('✅ Migration: orders.tx_hash column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.tx_hash skipped:', migErr.message);
    }
    
    // Migration: إضافة market_payload للمطابقة مع البلوك تشين
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS market_payload TEXT
      `);
      console.log('✅ Migration: orders.market_payload column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.market_payload skipped:', migErr.message);
    }
    
    // Migration: إضافة updated_at لحساب متوسط وقت إكمال الطلبات
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP
      `);
      console.log('✅ Migration: orders.updated_at column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.updated_at skipped:', migErr.message);
    }
    
    // Migration: إضافة paid_at لتسجيل تاريخ الدفع الفعلي
    try {
      await pool.query(`
        ALTER TABLE orders 
        ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
      `);
      console.log('✅ Migration: orders.paid_at column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration orders.paid_at skipped:', migErr.message);
    }
    
    // Create indexes for performance
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders(status, created_at)
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS orders_profit_tx_hash_idx ON orders(profit_tx_hash) WHERE profit_tx_hash IS NOT NULL
      `);
      await pool.query(`
        CREATE INDEX IF NOT EXISTS orders_username_idx ON orders(username)
      `);
      console.log('✅ Migration: performance indexes created');
    } catch (migErr) {
      console.log('⚠️ Migration indexes skipped:', migErr.message);
    }
    
    // 🔄 Migration: تحديث الطلبات القديمة (اللي قبل نظام status) من pending إلى paid
    // الطلبات القديمة هي اللي ملهاش profit_tx_hash ولا reference_code (يعني قبل التحديث)
    try {
      const updateResult = await pool.query(`
        UPDATE orders 
        SET status = 'paid'
        WHERE status = 'pending' 
          AND profit_tx_hash IS NULL 
          AND (reference_code IS NULL OR reference_code = '')
      `);
      if (updateResult.rowCount > 0) {
        console.log(`✅ Migration: Updated ${updateResult.rowCount} old orders from pending to paid`);
      }
    } catch (migErr) {
      console.log('⚠️ Migration old orders status update skipped:', migErr.message);
    }
    
    // جدول المستخدمين والإحالات
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255),
        photo_url TEXT,
        referral_code VARCHAR(50) UNIQUE NOT NULL,
        referred_by VARCHAR(50),
        total_earnings DECIMAL(10, 2) DEFAULT 0,
        available_balance DECIMAL(10, 2) DEFAULT 0,
        withdrawn_amount DECIMAL(10, 2) DEFAULT 0,
        total_referrals INTEGER DEFAULT 0,
        total_referred_purchases INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Migration: إضافة الأعمدة المفقودة إذا لم تكن موجودة
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE
      `);
      console.log('✅ Migration: telegram_id column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration telegram_id skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)
      `);
      console.log('✅ Migration: full_name column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration full_name skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS photo_url TEXT
      `);
      console.log('✅ Migration: photo_url column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration photo_url skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50) UNIQUE
      `);
      console.log('✅ Migration: referral_code column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration referral_code skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50)
      `);
      console.log('✅ Migration: referred_by column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration referred_by skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10, 2) DEFAULT 0
      `);
      console.log('✅ Migration: total_earnings column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration total_earnings skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS available_balance DECIMAL(10, 2) DEFAULT 0
      `);
      console.log('✅ Migration: available_balance column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration available_balance skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0
      `);
      console.log('✅ Migration: total_referrals column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration total_referrals skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS withdrawn_amount DECIMAL(10, 2) DEFAULT 0
      `);
      console.log('✅ Migration: withdrawn_amount column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration withdrawn_amount skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✅ Migration: last_login column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration last_login skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✅ Migration: created_at column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration created_at skipped:', migErr.message);
    }
    
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS total_referred_purchases INTEGER DEFAULT 0
      `);
      console.log('✅ Migration: total_referred_purchases column checked/added');
    } catch (migErr) {
      console.log('⚠️ Migration total_referred_purchases skipped:', migErr.message);
    }
    
    // جدول أرباح الإحالات
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referral_earnings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        order_id INTEGER REFERENCES orders(id),
        stars_purchased INTEGER NOT NULL,
        commission_percentage DECIMAL(5, 2) NOT NULL,
        commission_amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Add unique constraint on order_id to prevent duplicate commissions
    try {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS referral_earnings_order_id_unique 
        ON referral_earnings(order_id)
      `);
      console.log('✅ Unique constraint on referral_earnings.order_id checked/added');
    } catch (constraintErr) {
      console.log('⚠️ Unique constraint on referral_earnings.order_id skipped:', constraintErr.message);
    }
    
    // Add unique constraint on orders.tx_hash to prevent same TX from going to two orders
    try {
      await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS orders_tx_hash_unique 
        ON orders(tx_hash) WHERE tx_hash IS NOT NULL AND tx_hash != ''
      `);
      console.log('✅ Unique constraint on orders.tx_hash checked/added');
    } catch (constraintErr) {
      console.log('⚠️ Unique constraint on orders.tx_hash skipped:', constraintErr.message);
    };
    
    // جدول عمليات السحب
    await pool.query(`
      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        amount DECIMAL(10, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        wallet_address VARCHAR(255),
        transaction_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      )
    `);
    
    console.log('✅ Database tables initialized (orders, users, referral_earnings, withdrawals)');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  }
};

// لا نستدعي initDatabase() هنا - سيتم استدعاؤها في app.listen

// Admin endpoint للتحقق من البيانات
app.get('/admin/check-db', async (req, res) => {
  try {
    const ordersCount = await pool.query('SELECT COUNT(*) as count FROM orders');
    const recentOrders = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 20');
    const statsResult = await pool.query('SELECT SUM(stars) as total, COUNT(*) as orders FROM orders');
    
    res.json({
      ordersCount: ordersCount.rows[0].count,
      recentOrders: recentOrders.rows,
      stats: statsResult.rows[0]
    });
  } catch (err) {
    console.error('❌ Error checking database:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin endpoint لتطبيق الـ migrations يدوياً
app.get('/admin/apply-migrations', async (req, res) => {
  const results = [];
  
  try {
    // Migration 1: إضافة telegram_id
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id BIGINT UNIQUE`);
      results.push('✅ telegram_id column checked/added');
    } catch (e) {
      results.push(`⚠️ telegram_id: ${e.message}`);
    }
    
    // Migration 2: إضافة full_name
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)`);
      results.push('✅ full_name column checked/added');
    } catch (e) {
      results.push(`⚠️ full_name: ${e.message}`);
    }
    
    // Migration 3: إضافة photo_url
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT`);
      results.push('✅ photo_url column checked/added');
    } catch (e) {
      results.push(`⚠️ photo_url: ${e.message}`);
    }
    
    // Migration 4: إضافة referral_code
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(50) UNIQUE`);
      results.push('✅ referral_code column checked/added');
    } catch (e) {
      results.push(`⚠️ referral_code: ${e.message}`);
    }
    
    // Migration 5: إضافة referred_by
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by VARCHAR(50)`);
      results.push('✅ referred_by column checked/added');
    } catch (e) {
      results.push(`⚠️ referred_by: ${e.message}`);
    }
    
    // Migration 6: إضافة total_earnings
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_earnings DECIMAL(10, 2) DEFAULT 0`);
      results.push('✅ total_earnings column checked/added');
    } catch (e) {
      results.push(`⚠️ total_earnings: ${e.message}`);
    }
    
    // Migration 7: إضافة available_balance
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS available_balance DECIMAL(10, 2) DEFAULT 0`);
      results.push('✅ available_balance column checked/added');
    } catch (e) {
      results.push(`⚠️ available_balance: ${e.message}`);
    }
    
    // Migration 8: إضافة withdrawn_amount
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS withdrawn_amount DECIMAL(10, 2) DEFAULT 0`);
      results.push('✅ withdrawn_amount column checked/added');
    } catch (e) {
      results.push(`⚠️ withdrawn_amount: ${e.message}`);
    }
    
    // Migration 9: إضافة total_referrals
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_referrals INTEGER DEFAULT 0`);
      results.push('✅ total_referrals column checked/added');
    } catch (e) {
      results.push(`⚠️ total_referrals: ${e.message}`);
    }
    
    // Migration 10: إضافة last_login
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      results.push('✅ last_login column checked/added');
    } catch (e) {
      results.push(`⚠️ last_login: ${e.message}`);
    }
    
    // Migration 11: إضافة created_at
    try {
      await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`);
      results.push('✅ created_at column checked/added');
    } catch (e) {
      results.push(`⚠️ created_at: ${e.message}`);
    }
    
    // Migration 12: إضافة referred_by في جدول orders
    try {
      await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255)`);
      results.push('✅ orders.referred_by column checked/added');
    } catch (e) {
      results.push(`⚠️ orders.referred_by: ${e.message}`);
    }
    
    // التحقق من أعمدة الجدول
    const columns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    res.json({
      success: true,
      migrations: results,
      columns: columns.rows
    });
  } catch (err) {
    console.error('❌ Error applying migrations:', err);
    res.status(500).json({ success: false, error: err.message, results });
  }
});

// ==============================================
// API Endpoints - مع قاعدة بيانات والإحالات
// ==============================================

// ========== نظام الإحالات ==========

// 1. تسجيل/تحديث بيانات المستخدم بعد تسجيل الدخول
app.post('/api/user/register', async (req, res) => {
  try {
    const { telegramId, username, fullName, photoUrl, referredBy } = req.body;
    
    if (!telegramId || !username) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // استخدام اليوزرنيم كـ referral code (فريد بطبيعته)
    const referralCode = username;

    // التحقق من وجود المستخدم
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    let user;
    if (existingUser.rows.length > 0) {
      // تحديث بيانات المستخدم - مع حماية للأعمدة المفقودة
      try {
        const updated = await pool.query(
          `UPDATE users SET 
            username = $1, 
            full_name = $2, 
            photo_url = $3, 
            last_login = NOW() 
          WHERE telegram_id = $4 
          RETURNING *`,
          [username, fullName, photoUrl, telegramId]
        );
        user = updated.rows[0];
        console.log(`✅ User updated: @${username}`);
      } catch (updateErr) {
        // إذا فشل التحديث بسبب عمود مفقود، استخدم الحقول الموجودة فقط
        console.log('⚠️ Full update failed, trying basic update:', updateErr.message);
        try {
          const updated = await pool.query(
            `UPDATE users SET username = $1 WHERE telegram_id = $2 RETURNING *`,
            [username, telegramId]
          );
          user = updated.rows[0];
          // إضافة القيم الافتراضية يدوياً
          if (!user.referral_code) user.referral_code = referralCode;
          if (!user.full_name) user.full_name = fullName;
          if (!user.photo_url) user.photo_url = photoUrl;
          if (!user.total_earnings) user.total_earnings = 0;
          if (!user.available_balance) user.available_balance = 0;
          if (!user.total_referrals) user.total_referrals = 0;
          console.log(`✅ User updated (basic): @${username}`);
        } catch (basicErr) {
          console.log('⚠️ Even basic update failed, using existing user:', basicErr.message);
          user = existingUser.rows[0];
          // إضافة القيم المفقودة
          user.referral_code = user.referral_code || referralCode;
          user.full_name = user.full_name || fullName;
          user.photo_url = user.photo_url || photoUrl;
          user.total_earnings = user.total_earnings || 0;
          user.available_balance = user.available_balance || 0;
          user.total_referrals = user.total_referrals || 0;
        }
      }
    } else {
      // إنشاء مستخدم جديد - مع حماية للأعمدة المفقودة
      try {
        const inserted = await pool.query(
          `INSERT INTO users (telegram_id, username, full_name, photo_url, referral_code, referred_by) 
           VALUES ($1, $2, $3, $4, $5, $6) 
           RETURNING *`,
          [telegramId, username, fullName, photoUrl, referralCode, referredBy || null]
        );
        user = inserted.rows[0];
        
        // إذا كان عنده إحالة، زود عداد الإحالات للمستخدم اللي جابه
        if (referredBy) {
          await pool.query(
            'UPDATE users SET total_referrals = total_referrals + 1 WHERE referral_code = $1',
            [referredBy]
          );
          console.log(`✅ New user registered via referral: @${username} (referred by: ${referredBy})`);
        } else {
          console.log(`✅ New user registered: @${username}`);
        }
      } catch (insertErr) {
        // إذا فشل الإدخال بسبب عمود مفقود، استخدم الحقول الموجودة فقط
        console.log('⚠️ Full insert failed, trying basic insert:', insertErr.message);
        const inserted = await pool.query(
          `INSERT INTO users (telegram_id, username) 
           VALUES ($1, $2) 
           RETURNING *`,
          [telegramId, username]
        );
        user = inserted.rows[0];
        // إضافة referral_code يدوياً للمستخدم المرجع
        user.referral_code = referralCode;
        user.referred_by = referredBy;
        user.total_earnings = 0;
        user.available_balance = 0;
        user.total_referrals = 0;
        
        console.log(`✅ New user registered (basic): @${username}`);
      }
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        photoUrl: user.photo_url,
        referralCode: user.referral_code,
        totalEarnings: parseFloat(user.total_earnings),
        availableBalance: parseFloat(user.available_balance),
        totalReferrals: user.total_referrals
      }
    });
  } catch (err) {
    console.error('❌ Error in /api/user/register:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. جلب بيانات المستخدم الكاملة
app.get('/api/user/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    // البحث بـ username أو telegram_id
    // تحقق إذا كان identifier رقم
    const isNumeric = /^\d+$/.test(identifier);
    
    let userResult;
    if (isNumeric) {
      // البحث بـ telegram_id
      userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1 OR username = $1',
        [identifier]
      );
    } else {
      // البحث بـ username فقط
      userResult = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [identifier]
      );
    }

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    // حساب المستوى الحالي للمستخدم بناءً على مشترياته الشخصية
    const userOrdersResult = await pool.query(
      'SELECT COALESCE(SUM(stars), 0) as total FROM orders WHERE username = $1',
      [user.username]
    );
    const userOwnPurchases = parseInt(userOrdersResult.rows[0].total || 0);
    const userLevel = getUserLevelAndCommission(userOwnPurchases);

    // جلب الإحالات الناجحة مع تفاصيل الأرباح
    const referralsResult = await pool.query(
      `SELECT DISTINCT o.username, u.full_name, u.photo_url, 
              SUM(o.stars) as total_stars,
              COUNT(o.id) as orders_count,
              MAX(o.created_at) as last_order,
              (SELECT SUM(re.commission_amount) 
               FROM referral_earnings re 
               JOIN orders o2 ON re.order_id = o2.id 
               WHERE o2.username = o.username AND (o2.referred_by = $1 OR o2.referred_by = $2)
              ) as total_earnings
       FROM orders o
       LEFT JOIN users u ON o.username = u.username
       WHERE o.referred_by = $1 OR o.referred_by = $2
       GROUP BY o.username, u.full_name, u.photo_url
       ORDER BY last_order DESC`,
      [user.referral_code, user.username]
    );

    // جلب تاريخ الأرباح
    const earningsResult = await pool.query(
      `SELECT re.*, o.username as buyer_username, o.stars as stars_purchased
       FROM referral_earnings re
       JOIN orders o ON re.order_id = o.id
       WHERE re.user_id = $1
       ORDER BY re.created_at DESC
       LIMIT 50`,
      [user.id]
    );

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        photoUrl: user.photo_url,
        referralCode: user.referral_code,
        totalEarnings: parseFloat(user.total_earnings || 0),
        availableBalance: parseFloat(user.available_balance || 0),
        withdrawnAmount: parseFloat(user.withdrawn_amount || 0),
        totalReferrals: user.total_referrals || 0,
        totalReferredPurchases: parseInt(user.total_referred_purchases || 0),
        userOwnPurchases: userOwnPurchases,
        level: userLevel.level,
        commissionRate: userLevel.commission,
        createdAt: user.created_at
      },
      referrals: referralsResult.rows.map(r => ({
        username: r.username,
        fullName: r.full_name,
        photoUrl: r.photo_url,
        totalStars: parseInt(r.total_stars),
        ordersCount: parseInt(r.orders_count),
        totalEarnings: parseFloat(r.total_earnings || 0),
        lastOrder: r.last_order
      })),
      earnings: earningsResult.rows.map(e => ({
        id: e.id,
        buyerUsername: e.buyer_username,
        starsPurchased: e.stars_purchased,
        commissionPercentage: parseFloat(e.commission_percentage),
        commissionAmount: parseFloat(e.commission_amount),
        createdAt: e.created_at
      }))
    });

  } catch (err) {
    console.error('❌ Error in /api/user/:username:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. طلب سحب الأرباح
app.post('/api/withdraw', async (req, res) => {
  try {
    const { username, amount, walletAddress } = req.body;

    if (!username || !amount || !walletAddress) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    // جلب بيانات المستخدم
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];
    const requestedAmount = parseFloat(amount);

    if (requestedAmount > parseFloat(user.available_balance)) {
      return res.status(400).json({ success: false, error: 'Insufficient balance' });
    }

    if (requestedAmount < 1) {
      return res.status(400).json({ success: false, error: 'Minimum withdrawal is 1 USDT' });
    }

    // إنشاء طلب سحب
    const withdrawalResult = await pool.query(
      `INSERT INTO withdrawals (user_id, amount, wallet_address, status) 
       VALUES ($1, $2, $3, 'pending') 
       RETURNING *`,
      [user.id, requestedAmount, walletAddress]
    );

    // خصم المبلغ من الرصيد المتاح
    await pool.query(
      `UPDATE users SET 
        available_balance = available_balance - $1
       WHERE id = $2`,
      [requestedAmount, user.id]
    );

    // إرسال إشعار للمالك على البوت مع جميع التفاصيل
    const ownerMessage = `💰 طلب سحب جديد من نظام الإحالات\n\n` +
                         `👤 الاسم: ${user.full_name || 'غير متوفر'}\n` +
                         `🆔 اليوزرنيم: @${username}\n` +
                         `📱 Telegram ID: ${user.telegram_id || 'غير متوفر'}\n` +
                         `💵 المبلغ المطلوب: ${requestedAmount} USDT\n` +
                         `💳 عنوان المحفظة: ${walletAddress}\n` +
                         `💰 الرصيد المتبقي: ${(parseFloat(user.available_balance) - requestedAmount).toFixed(2)} USDT\n` +
                         `📊 إجمالي الأرباح: ${user.total_earnings || 0} USDT\n` +
                         `👥 عدد الإحالات: ${user.total_referrals || 0}\n` +
                         `📅 تاريخ الطلب: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;
    
    // إرسال للمالك الأساسي
    for (const adminId of ADMIN_IDS) {
      try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: adminId,
          text: ownerMessage,
          parse_mode: 'HTML'
        });
        console.log(`✅ Withdrawal notification sent to owner ${adminId}`);
      } catch (err) {
        console.error(`❌ Failed to notify owner ${adminId}:`, err.message);
      }
    }

    console.log(`✅ Withdrawal request created: @${username} - ${requestedAmount} USDT`);

    res.json({
      success: true,
      withdrawal: {
        id: withdrawalResult.rows[0].id,
        amount: requestedAmount,
        status: 'pending',
        createdAt: withdrawalResult.rows[0].created_at
      }
    });
  } catch (err) {
    console.error('❌ Error in /api/withdraw:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. إضافة رصيد لمستخدم (للاختبار - Admin only)
app.post('/api/referral/add-balance', async (req, res) => {
  try {
    const { username, stars } = req.body;

    if (!username || !stars) {
      return res.status(400).json({ success: false, message: 'Username and stars are required' });
    }

    const starsAmount = parseInt(stars);
    if (starsAmount < 1) {
      return res.status(400).json({ success: false, message: 'Stars must be at least 1' });
    }

    // البحث عن المستخدم أولاً
    let userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    let user;
    
    // إذا لم يكن موجوداً، إنشاء حساب جديد
    if (userResult.rows.length === 0) {
      console.log(`📝 Creating new user: @${username}`);
      
      // توليد referral code
      const referralCode = generateReferralCode();
      
      const createResult = await pool.query(
        `INSERT INTO users (telegram_id, username, referral_code, total_earnings, available_balance, total_referrals) 
         VALUES ($1, $2, $3, $4, $5, 0) 
         RETURNING *`,
        [Date.now(), username, referralCode, starsAmount, starsAmount]
      );
      
      user = createResult.rows[0];
      console.log(`✅ New user created with balance: @${username}`);
    } else {
      // تحديث الرصيد للمستخدم الموجود
      user = userResult.rows[0];
      const previousBalance = parseFloat(user.available_balance) || 0;
      const previousEarnings = parseFloat(user.total_earnings) || 0;
      
      await pool.query(
        `UPDATE users SET 
          available_balance = available_balance + $1,
          total_earnings = total_earnings + $1
         WHERE id = $2`,
        [starsAmount, user.id]
      );
      
      user.previous_balance = previousBalance;
      user.new_balance = previousBalance + starsAmount;
      user.total_earnings = previousEarnings + starsAmount;
      
      console.log(`✅ Balance added: @${username} - ${starsAmount} stars`);
    }

    res.json({
      success: true,
      message: `Successfully added ${starsAmount} stars to @${username}`,
      data: {
        username: username,
        stars_added: starsAmount,
        previous_balance: user.previous_balance || 0,
        new_balance: user.new_balance || starsAmount,
        total_earnings: parseFloat(user.total_earnings) || starsAmount
      }
    });

  } catch (err) {
    console.error('❌ Error in /api/referral/add-balance:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. جلب بيانات مستخدم محدد
app.get('/api/referral/user/:username', async (req, res) => {
  try {
    const { username } = req.params;

    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    const user = userResult.rows[0];

    // جلب قائمة الإحالات
    const referralsResult = await pool.query(
      `SELECT username, full_name, created_at 
       FROM users 
       WHERE referred_by = $1 
       ORDER BY created_at DESC`,
      [user.referral_code]
    );

    res.json({
      success: true,
      data: {
        username: user.username,
        telegram_id: user.telegram_id,
        full_name: user.full_name,
        referral_code: user.referral_code,
        referred_by: user.referred_by,
        referral_balance: parseFloat(user.available_balance) || 0,
        total_earnings: parseFloat(user.total_earnings) || 0,
        withdrawn_amount: parseFloat(user.withdrawn_amount) || 0,
        total_referrals: user.total_referrals || 0,
        referrals: referralsResult.rows.map(r => ({
          username: r.username,
          full_name: r.full_name,
          joined_at: r.created_at
        })),
        created_at: user.created_at,
        last_login: user.last_login
      }
    });

  } catch (err) {
    console.error('❌ Error in /api/referral/user/:username:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. جلب سجل الأوردرات للمستخدم
app.get('/api/user/:username/orders', async (req, res) => {
  try {
    const { username } = req.params;

    // جلب جميع الأوردرات الخاصة بالمستخدم
    const ordersResult = await pool.query(
      `SELECT id, stars, amount_ton, amount_usd, wallet_address, reference_number, 
              is_automatic, referred_by, created_at 
       FROM orders 
       WHERE username = $1 
       ORDER BY created_at DESC
       LIMIT 100`,
      [username]
    );

    res.json({
      success: true,
      orders: ordersResult.rows.map(order => ({
        id: order.id,
        stars: order.stars,
        amountTon: parseFloat(order.amount_ton),
        amountUsd: parseFloat(order.amount_usd),
        walletAddress: order.wallet_address,
        referenceNumber: order.reference_number,
        isAutomatic: order.is_automatic,
        referredBy: order.referred_by,
        createdAt: order.created_at,
        date: new Date(order.created_at).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Africa/Cairo'
        })
      })),
      totalOrders: ordersResult.rows.length
    });

  } catch (err) {
    console.error('❌ Error in /api/user/:username/orders:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. تتبع الإحالة عند فتح الموقع (قبل التسجيل)
app.post('/api/track-referral', async (req, res) => {
  try {
    const { username, referralCode } = req.body;

    if (!username || !referralCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing username or referralCode' 
      });
    }

    console.log(`👁️ Tracking referral: @${username} via @${referralCode}`);

    // التحقق من وجود المستخدم
    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      // المستخدم غير موجود - سيتم حفظ الإحالة عند التسجيل
      return res.json({
        success: true,
        message: 'User not registered yet, referral will be saved on registration',
        shouldSaveForLater: true
      });
    }

    const user = userResult.rows[0];

    // إذا كان المستخدم لديه مُحيل بالفعل
    if (user.referred_by) {
      console.log(`⚠️ User @${username} already referred by @${user.referred_by}`);
      return res.json({
        success: true,
        message: 'User already has a referrer',
        alreadyReferred: true,
        referredBy: user.referred_by
      });
    }

    // التحقق من وجود المُحيل
    const referrerResult = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR referral_code = $1',
      [referralCode]
    );

    if (referrerResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Referrer not found'
      });
    }

    const referrer = referrerResult.rows[0];

    // حفظ الإحالة
    await pool.query(
      'UPDATE users SET referred_by = $1 WHERE username = $2',
      [referrer.username, username]
    );

    // زيادة عداد total_referrals للمُحيل
    await pool.query(
      'UPDATE users SET total_referrals = total_referrals + 1 WHERE id = $1',
      [referrer.id]
    );

    console.log(`✅ Referral saved: @${username} -> @${referrer.username}`);

    res.json({
      success: true,
      message: 'Referral tracked successfully',
      referredBy: referrer.username
    });

  } catch (err) {
    console.error('❌ Error in /api/track-referral:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ========== نهاية نظام الإحالات ==========

// ========== Payment Webhook من Cryptomus ==========
app.post('/api/payment-webhook', async (req, res) => {
  console.log('📥 Payment webhook received:', JSON.stringify(req.body, null, 2));
  
  try {
    const paymentData = req.body;
    
    // التحقق من حالة الدفع
    const status = paymentData.status || paymentData.payment_status;
    const orderId = paymentData.order_id || paymentData.merchant_order_id;
    const amount = paymentData.amount || paymentData.pay_amount;
    const currency = paymentData.currency || paymentData.pay_currency;
    
    console.log(`💳 Payment Update - Order: ${orderId}, Status: ${status}, Amount: ${amount} ${currency}`);
    
    // إذا كان الدفع ناجح
    if (status === 'paid' || status === 'success' || status === 'confirmed') {
      // استخراج البيانات من order_id (format: username_stars_timestamp)
      const orderParts = orderId.split('_');
      if (orderParts.length >= 2) {
        const username = orderParts[0];
        const stars = parseInt(orderParts[1]);
        const timestamp = orderParts[2] ? new Date(parseInt(orderParts[2])) : new Date();
        
        // حساب السعر
        const amountUSD = parseFloat(amount);
        const amountTON = amountUSD; // يمكن تحويله حسب سعر الصرف
        
        console.log(`✅ Payment confirmed for @${username} - ${stars} stars - $${amountUSD}`);
        
        // استدعاء نفس منطق /order لحفظ الطلب
        const orderData = {
          username,
          stars,
          amountUSD,
          amountTON,
          walletAddress: 'cryptomus',
          referenceNumber: orderId,
          timestamp: timestamp.toISOString(),
          isAutomatic: true
        };
        
        // 🔥 النظام الجديد: إنشاء طلب pending ثم finalize فوراً
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          
          // جلب referred_by تلقائياً
          let referredBy = null;
          try {
            const userRefResult = await client.query(
              'SELECT referred_by FROM users WHERE username = $1',
              [username]
            );
            if (userRefResult.rows.length > 0 && userRefResult.rows[0].referred_by) {
              referredBy = userRefResult.rows[0].referred_by;
            }
          } catch (refErr) {
            console.error('⚠️ Error fetching referral:', refErr.message);
          }
          
          // حساب الربح المتوقع
          let profitTON = null;
          try {
            const tonPrice = await getTONPrice();
            profitTON = calculateProfitTON(stars, tonPrice);
          } catch (err) {
            console.error('⚠️ Could not calculate profit:', err.message);
          }
          
          // إنشاء الطلب بحالة pending
          const referenceCode = `CRY-${orderId}-${Date.now().toString(36).toUpperCase()}`;
          const result = await client.query(
            `INSERT INTO orders (username, stars, amount_ton, amount_usd, wallet_address, reference_number, reference_code, is_automatic, referred_by, status, profit_ton, created_at) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
            [username, stars, parseFloat(amountTON), parseFloat(amountUSD), 'cryptomus', orderId, referenceCode, true, referredBy, 'pending', profitTON, timestamp.toISOString()]
          );
          const newOrderId = result.rows[0].id;
          
          // تسجيل في order_history
          await client.query(`
            INSERT INTO order_history (
              order_id, previous_status, new_status, changed_by, change_reason
            ) VALUES ($1, NULL, 'pending', 'cryptomus_webhook', 'Order created via Cryptomus webhook')
          `, [newOrderId]);
          
          await client.query('COMMIT');
          console.log(`💾 Cryptomus order created: #${newOrderId}, Ref: ${referenceCode}`);
          
          // 🎉 Finalize فوراً لأن Cryptomus بيؤكد الدفع
          const finalizeResult = await finalizeOrderSuccess(newOrderId, orderId, 'cryptomus_webhook');
          
          if (finalizeResult.success) {
            console.log(`✅ Cryptomus order #${newOrderId} FINALIZED successfully!`);
          } else {
            console.error(`❌ Cryptomus order #${newOrderId} finalization failed: ${finalizeResult.message}`);
          }
          
        } catch (orderErr) {
          await client.query('ROLLBACK');
          console.error('❌ Cryptomus order processing error:', orderErr.message);
        } finally {
          client.release();
        }
      }
    }
    
    // إرسال رد للـ webhook
    res.status(200).json({ success: true, message: 'Webhook processed' });
    
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(200).json({ success: false, error: error.message });
  }
});

// 🗑️ OLD processOrder REMOVED - تم إزالة processOrder القديم لأنه يعمل INSERT و Referral قبل paid
// ✅ الآن كل الطلبات بتستخدم finalizeOrderSuccess() الموحد

// دالة لإرسال إشعار للأدمن (تم الاحتفاظ بها لأنها مفيدة)
async function sendAdminNotification(username, stars, amountTON, amountUSD, timestamp, referredBy, isAutomatic) {
  const formattedDate = new Date(timestamp || new Date()).toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'Africa/Cairo',
  });
  
  const sendPromises = ADMIN_IDS.map(async (adminId) => {
    try {
      if (isAutomatic) {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: adminId,
          text: `✅ تم تنفيذ طلب تلقائياً\n👤 Username: @${username}\n⭐️ Stars: ${stars}\n💰 TON: ${amountTON} TON\n💵 USDT: ${amountUSD} USDT\n📅 Order Date: ${formattedDate}${referredBy ? '\n🔗 Referral: @' + referredBy : ''}`,
        });
      } else {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: adminId,
          text: `📥 طلب جديد (يدوي)\n👤 Username: @${username}\n⭐️ Stars: ${stars}\n💰 TON: ${amountTON} TON\n💵 USDT: ${amountUSD} USDT\n📅 Order Date: ${formattedDate}${referredBy ? '\n🔗 Referral: @' + referredBy : ''}`,
        });
      }
    } catch (error) {
      console.error(`❌ Failed to send notification to admin ${adminId}:`, error.message);
    }
  });
  
  await Promise.all(sendPromises);
}

// استقبال طلب النجوم وحفظه وإرسال إشعار للأدمن
/**
 * Endpoint: /confirm-order - تأكيد حالة الطلب فقط (لا ينشئ طلب جديد)
 * Idempotent - يمكن استدعاؤه مرات متعددة دون تأثير
 */
app.post('/confirm-order', rateLimitMiddleware, async (req, res) => {
  try {
    const { orderId, referenceCode } = req.body;

    if (!orderId && !referenceCode) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing orderId or referenceCode' 
      });
    }

    // البحث عن الطلب بواسطة orderId أو referenceCode
    let query, params;
    if (orderId) {
      query = 'SELECT * FROM orders WHERE id = $1';
      params = [orderId];
    } else {
      query = 'SELECT * FROM orders WHERE reference_code = $1';
      params = [referenceCode];
    }

    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found',
        orderId, 
        referenceCode 
      });
    }

    const order = rows[0];
    console.log(`✅ Order confirmation check: #${order.id}, Status: ${order.status}, Ref: ${order.reference_code}`);

    // If order is still pending, attempt quick verification
    if (order.status === 'pending' && order.market_payload && PROFIT_WALLET && TONAPI_KEY) {
      try {
        console.log(`🔍 Quick verification attempt for order #${order.id}...`);
        
        // Fetch recent transactions
        const txResponse = await axios.get(
          `${TON_API}/blockchain/accounts/${PROFIT_WALLET}/transactions?limit=50`,
          {
            headers: { Authorization: `Bearer ${TONAPI_KEY}` },
            timeout: 5000
          }
        );
        
        const transactions = txResponse.data?.transactions || [];
        
        // Try to match with payload
        const match = transactions.find(tx => {
          const chainPayload = tx.in_msg?.raw_body || tx.in_msg?.payload || tx.in_msg?.message;
          if (!chainPayload) return false;
          
          // Multiple matching strategies
          if (chainPayload === order.market_payload) return true;
          if (chainPayload.trim().replace(/\s+/g, '') === order.market_payload.trim().replace(/\s+/g, '')) return true;
          if (chainPayload.includes(order.market_payload) || order.market_payload.includes(chainPayload)) return true;
          if (order.reference_code && tx.in_msg?.comment && tx.in_msg.comment.includes(order.reference_code)) return true;
          
          return false;
        });
        
        if (match) {
          console.log(`🎉 Quick verification found match! Finalizing order #${order.id}...`);
          
          // Finalize immediately
          const finalizeResult = await finalizeOrderSuccess(order.id, match.hash, 'quick_verification');
          
          if (finalizeResult.success) {
            // Return updated order status
            return res.json({
              success: true,
              quickVerified: true,
              order: {
                id: order.id,
                status: 'paid',
                referenceCode: order.reference_code,
                username: order.username,
                stars: order.stars,
                txHash: match.hash,
                createdAt: order.created_at,
                paidAt: finalizeResult.order.paid_at,
                updatedAt: new Date().toISOString()
              }
            });
          }
        }
      } catch (verifyErr) {
        console.error(`⚠️ Quick verification failed for order #${order.id}:`, verifyErr.message);
        // Continue to return pending status
      }
    }

    res.json({
      success: true,
      order: {
        id: order.id,
        status: order.status,
        referenceCode: order.reference_code,
        username: order.username,
        stars: order.stars,
        txHash: order.tx_hash,
        createdAt: order.created_at,
        paidAt: order.paid_at,
        updatedAt: order.updated_at
      }
    });

  } catch (error) {
    console.error('❌ Error in /confirm-order:', error.message);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to confirm order', 
      details: error.message 
    });
  }
});

// الاحتفاظ بـ /order للتوافق مع العملاء القدامى فقط (يعيد التوجيه إلى /confirm-order)
app.post('/order', async (req, res) => {
  console.warn('⚠️ DEPRECATED: /order endpoint called. Please use /confirm-order instead.');
  return res.status(410).json({ 
    success: false,
    error: 'This endpoint is deprecated. Please use /confirm-order instead.',
    migration: {
      old: 'POST /order',
      new: 'POST /confirm-order',
      body: '{ orderId: number, referenceCode: string }'
    }
  });
});

// ==============================================
// إحصائيات النجوم - Statistics API (Enhanced with accurate counting)
// ==============================================
app.get('/api/stats', async (req, res) => {
  try {
    // Total stars sent - فقط الطلبات المدفوعة
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(stars), 0) as total 
       FROM orders 
       WHERE status = 'paid'`
    );
    const totalStars = parseInt(totalResult.rows[0].total);

    // Stars sent today (using Cairo timezone and paid_at)
    const todayResult = await pool.query(
      `SELECT COALESCE(SUM(stars), 0) as today 
       FROM orders 
       WHERE status = 'paid'
         AND DATE(paid_at AT TIME ZONE 'Africa/Cairo') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')`
    );
    const starsToday = parseInt(todayResult.rows[0].today);

    // Stars sent yesterday (using Cairo timezone and paid_at)
    const yesterdayResult = await pool.query(
      `SELECT COALESCE(SUM(stars), 0) as yesterday 
       FROM orders 
       WHERE status = 'paid'
         AND DATE(paid_at AT TIME ZONE 'Africa/Cairo') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo' - INTERVAL '1 day')`
    );
    const starsYesterday = parseInt(yesterdayResult.rows[0].yesterday);

    // Average order completion time - حساب ديناميكي بناءً على الطلبات المدفوعة
    let avgTime = 51; // القيمة الافتراضية
    try {
      // حساب متوسط الوقت بين إنشاء الطلب وتأكيده (paid_at - created_at)
      const avgTimeResult = await pool.query(
        `SELECT AVG(EXTRACT(EPOCH FROM (paid_at - created_at))) as avg_seconds
         FROM (
           SELECT paid_at, created_at
           FROM orders
           WHERE status = 'paid'
             AND paid_at IS NOT NULL
             AND created_at IS NOT NULL
           ORDER BY paid_at DESC
           LIMIT 100
         ) recent_orders`
      );
      
      if (avgTimeResult.rows[0].avg_seconds) {
        avgTime = Math.round(parseFloat(avgTimeResult.rows[0].avg_seconds));
        // إذا كان الوقت أقل من 10 ثواني أو أكثر من 300 ثانية، نستخدم القيمة الافتراضية
        if (avgTime < 10 || avgTime > 300) {
          avgTime = 51;
        }
      }
    } catch (avgErr) {
      console.error('⚠️ Error calculating average time:', avgErr.message);
      // نستمر بالقيمة الافتراضية
    }

    console.log(`📊 Stats - Total: ${totalStars}, Today: ${starsToday}, Yesterday: ${starsYesterday}, AvgTime: ${avgTime}s`);

    res.json({
      totalStars,
      starsToday,
      starsYesterday,
      avgCompletionTime: avgTime
    });
  } catch (err) {
    console.error('❌ Error fetching stats:', err);
    res.status(500).json({ 
      error: 'Failed to fetch statistics',
      totalStars: 0,
      starsToday: 0,
      starsYesterday: 0,
      avgCompletionTime: 51
    });
  }
});

// استقبال طلب البريميوم وإرسال إشعار للأدمن فقط (بدون حفظ)
// استقبال طلب البريميوم وإرسال إشعار للأدمن
app.post('/premium', async (req, res) => {
  // إرسال الاستجابة فوراً للـ client حتى لو حصل error في إرسال الرسالة
  res.status(200).send('✅ تم استلام طلبك بنجاح!');
  
  try {
    const { username, months, amountTon, amountUsd } = req.body;

    if (!username || !months || !amountTon || !amountUsd) {
      console.error('❌ بيانات الطلب غير مكتملة:', req.body);
      return;
    }

    const orderCreatedAt = new Date().toISOString();
    const formattedDate = new Date(orderCreatedAt).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true, timeZone: 'Africa/Cairo',
    });

    const fragmentPremium = "https://fragment.com/premium/gift";

    console.log(`📦 Processing premium order: @${username} - ${months} months`);

    // إرسال إشعار للأدمن - حتى لو المستخدم خرج من الصفحة
    const sendPromises = ADMIN_IDS.map(async (adminId) => {
      try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: adminId,
          text: `🛒 New Premium Order\n👤 Username: @${username}\n📅 Months: ${months}\n💰 TON: ${amountTon} TON\n💵 USDT: ${amountUsd} USDT\n📅 Order Date: ${formattedDate}`,
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔗 تنفيذ الطلب للمستخدم", web_app: { url: fragmentPremium } }]
            ]
          }
        });
        console.log(`✅ Sent premium order notification to admin ${adminId}`);
      } catch (error) {
        console.error(`❌ Failed to send notification to admin ${adminId}:`, error.message);
      }
    });

    // انتظار إرسال كل الرسائل
    await Promise.allSettled(sendPromises);
    
  } catch (error) {
    console.error('❌ Error in /premium endpoint:', error);
  }
});

// Telegram Webhook - مبسط للرسائل الأساسية فقط
app.post('/telegramWebhook', async (req, res) => {
  const body = req.body;

  // رد بسيط على /start
  if (body.message && body.message.text === "/start") {
    const chatId = body.message.chat.id;
    const welcomeMessage = "مرحبًا بك في Panda Store 🐼\nافتح الموقع لشراء النجوم والاشتراك بريميوم.";
    const replyMarkup = {
      inline_keyboard: [
        [{ text: "🌐 افتح الموقع", web_app: { url: `${WEB_BASE}` } }],
        [{ text: "انضمام الى قناه الاثباتات", url: "https://t.me/PandaStoreShop" }]
      ]
    };

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: welcomeMessage,
      reply_markup: replyMarkup
    });
  }

  // رد على /help
  if (body.message && body.message.text === "/help") {
    const chatId = body.message.chat.id;
    const helpMessage = "يمكنك التواصل مع مدير الموقع من هنا:";
    const replyMarkup = {
      inline_keyboard: [
        [{ text: "اتفضل يامحترم 🥰", url: "https://t.me/OMAR_M_SHEHATA" }]
      ]
    };

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: helpMessage,
      reply_markup: replyMarkup
    });
  }

  res.sendStatus(200);
});

app.get("/", (req, res) => {
  res.send("✅ Panda Store backend is running!");
});

// ==============================================
// Proxy: Get Telegram User Info via MarketApp API
// ==============================================
app.post('/api/fg/get-user', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'username is required' });
    }

    const apiAuth = MARKETAPP_AUTH;
    if (!apiAuth) {
      return res.status(500).json({ error: 'config_error', message: 'MARKETAPP_AUTH missing' });
    }

    // استدعاء MarketApp API
    const response = await axios.post('https://api.marketapp.ws/v1/fragment/stars/recipient/', 
      { username: username },
      {
        headers: { 
          'accept': 'application/json', 
          'Content-Type': 'application/json', 
          'Authorization': apiAuth 
        },
        timeout: 10000
      }
    );

    console.log(`✅ [GET-USER] Success! User: @${username} - Name: ${response.data.name}`);

    // إرجاع البيانات
    return res.json({
      found: {
        photo: response.data.photo || '',
        name: response.data.name || username
      }
    });

  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'user_not_found', message: 'Telegram user not found' });
    }
    if (err.response?.status === 401 || err.response?.status === 403) {
      return res.status(401).json({ error: 'auth_error', message: 'Invalid or expired API token' });
    }
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// ==============================================
// Proxy: Buy Stars via MarketApp API
// ==============================================
app.post('/buy', rateLimitMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { username, quantity } = req.body || {};
    
    // Input validation
    if (!username || !quantity) {
      return res.status(422).json({ 
        detail: [{ loc: ['body', 'username/quantity'], msg: 'username and quantity required', type: 'value_error' }] 
      });
    }
    
    // Username validation
    if (typeof username !== 'string' || username.trim().length === 0) {
      return res.status(400).json({ error: 'Invalid username: must be a non-empty string' });
    }
    
    if (username.includes(' ')) {
      return res.status(400).json({ error: 'Invalid username: cannot contain spaces' });
    }
    
    if (username.length > 32) {
      return res.status(400).json({ error: 'Invalid username: too long (max 32 characters)' });
    }
    
    // Stars quantity validation (min: 50, max: 100000)
    const MIN_STARS = 50;
    const MAX_STARS = 100000;
    
    if (typeof quantity !== 'number' || !Number.isInteger(quantity)) {
      return res.status(400).json({ error: 'Invalid quantity: must be an integer' });
    }
    
    if (quantity < MIN_STARS) {
      return res.status(400).json({ error: `Invalid quantity: minimum ${MIN_STARS} stars required` });
    }
    
    if (quantity > MAX_STARS) {
      return res.status(400).json({ error: `Invalid quantity: maximum ${MAX_STARS} stars allowed` });
    }

    const upstreamUrl = MARKETAPP_URL;
    const apiAuth = MARKETAPP_AUTH;
    if (!apiAuth) return res.status(500).json({ error: 'config_error', message: 'MARKETAPP_AUTH missing' });

    await client.query('BEGIN');

    // 🔥 حفظ الطلب قبل الدفع لضمان عدم فقدانه
    const STAR_PRICE_USD = 0.016;
    const amountUSD = STAR_PRICE_USD * Number(quantity);
    
    // 🔥 توليد Reference Code فريد للطلب
    // Format: ORD-{timestamp}-{random}
    const referenceCode = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
    console.log(`🔖 Generated Reference Code: ${referenceCode}`);
    
    // حساب الربح المتوقع
    let profitTON = null;
    try {
      const tonPrice = await getTONPrice();
      profitTON = calculateProfitTON(quantity, tonPrice);
      console.log(`💰 Pre-payment profit calculation: ${profitTON.toFixed(9)} TON`);
    } catch (err) {
      console.error('⚠️ Could not calculate profit:', err.message);
    }
    
    // جلب referred_by للمستخدم
    let referredBy = null;
    try {
      const userRefResult = await client.query(
        'SELECT referred_by FROM users WHERE username = $1',
        [username]
      );
      if (userRefResult.rows.length > 0 && userRefResult.rows[0].referred_by) {
        referredBy = userRefResult.rows[0].referred_by;
      }
    } catch (refErr) {
      console.error('⚠️ Error fetching referral:', refErr.message);
    }
    
    // حفظ الطلب بحالة pending قبل الدفع - SINGLE ORDER CREATION
    let orderId;
    const result = await client.query(
      `INSERT INTO orders (username, stars, amount_ton, amount_usd, wallet_address, reference_number, reference_code, is_automatic, referred_by, status, profit_ton, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [username, quantity, 0, amountUSD, 'fragment', `pre_${username}_${quantity}_${Date.now()}`, referenceCode, false, referredBy, 'pending', profitTON, new Date().toISOString()]
    );
    orderId = result.rows[0].id;

    // تسجيل في order_history
    await client.query(`
      INSERT INTO order_history (
        order_id, previous_status, new_status, changed_by, change_reason
      ) VALUES ($1, NULL, 'pending', $2, 'Order created via /buy endpoint')
    `, [orderId, username]);

    console.log(`💾 Pre-payment order saved! ID: ${orderId}, Ref: ${referenceCode}, Status: pending, User: @${username}, Stars: ${quantity}`);
    
    // ⚠️ DO NOT COMMIT YET - Call MarketApp API first
    // استدعاء MarketApp API قبل الـ COMMIT
    let upResp;
    try {
      upResp = await axios.post(upstreamUrl, { username, quantity }, {
        headers: { 'accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': apiAuth },
        timeout: 15000
      });
      console.log('📦 MarketApp API Response:', JSON.stringify(upResp.data, null, 2));
    } catch (marketErr) {
      // ❌ MarketApp فشل - حذف الطلب من DB
      await client.query('ROLLBACK');
      console.error(`❌ MarketApp API failed for order #${orderId} - ROLLBACK executed`);
      throw marketErr; // Re-throw to outer catch
    }
    
    const transaction = upResp.data.transaction || { messages: [] };
    if (!Array.isArray(transaction.messages)) transaction.messages = [];
    
    // 🔥 استخراج market_payload من Response (Base64 BOC)
    // هذا الـ payload سيُستخدم للمطابقة مع المعاملة على البلوك تشين
    const marketPayload = upResp.data?.transaction?.messages?.[0]?.payload;
    
    if (marketPayload && orderId) {
      try {
        await client.query(
          `UPDATE orders SET market_payload = $1 WHERE id = $2`,
          [marketPayload, orderId]
        );
        console.log(`✅ Saved market_payload for order #${orderId}`);
        console.log(`   └─ Payload preview: ${marketPayload.substring(0, 25)}...`);
      } catch (payloadSaveErr) {
        console.error('❌ Failed to save market_payload:', payloadSaveErr.message);
        await client.query('ROLLBACK');
        throw payloadSaveErr;
      }
    } else {
      console.warn('⚠️ market_payload not found in MarketApp response or orderId missing');
      if (!marketPayload) {
        console.warn('   └─ Response structure:', Object.keys(upResp.data));
      }
    }
    
    // ✅ الآن نحفظ الطلب بعد نجاح MarketApp
    await client.query('COMMIT');

    // حساب الهامش والربح
    const profitAddress = 'UQAcDae1BvWVAD0TkhnGgDme4b7NH9Fz8JXce-78TW6ekmvN';
    if (transaction.messages.length > 0 && profitAddress) {
      // السعر الموحد: $0.016 لكل نجمة (80 سنت لكل 50 نجمة)
      const sellPricePerStar = 0.016;
      const targetTotalUsd = sellPricePerStar * Number(quantity);

      // جلب سعر TON
      let tonUsd = null;
      try {
        const priceResp = await axios.get('https://www.htx.com/-/x/pro/market/history/kline', { 
          params: { period: '1day', size: '1', symbol: 'tonusdt' },
          timeout: 5000 
        });
        if (priceResp.data?.data?.[0]) {
          tonUsd = parseFloat(priceResp.data.data[0].close);
        }
      } catch (e) {
        console.error('❌ Failed to fetch TON price:', e.message);
        tonUsd = parseFloat(process.env.FALLBACK_TON_USD || '5.5');
      }
      if (!tonUsd || tonUsd <= 0) tonUsd = 5.5;

      const targetTotalTon = targetTotalUsd / tonUsd;
      const targetTotalNano = BigInt(Math.ceil(targetTotalTon * 1e9));

      const baseNano = BigInt(transaction.messages[0].amount || '0');
      const marginNano = targetTotalNano - baseNano;

      if (marginNano > 0n) {
        // � إضافة رسالة الأرباح
        // ⚠️ بدون payload لتجنب TonConnect validation error
        // المطابقة ستتم عبر: المبلغ الدقيق + reference_code + نافذة زمنية
        transaction.messages.push({
          address: profitAddress,
          amount: marginNano.toString()
        });
        console.log(`✅ Profit margin: ${(Number(marginNano) / 1e9).toFixed(9)} TON | Ref: ${referenceCode}`);
      }
    }

    // تنظيف وإرسال
    if (!transaction.validUntil) {
      transaction.validUntil = Math.floor(Date.now() / 1000) + 300;
    }

    if (transaction.messages) {
      transaction.messages = transaction.messages.map(msg => {
        const cleanMsg = { address: msg.address, amount: msg.amount };
        if (msg.payload && msg.payload !== '') cleanMsg.payload = msg.payload;
        return cleanMsg;
      });
    }

    return res.json({ transaction });
  } catch (err) {
    // ⚠️ Rollback on any error
    try {
      await client.query('ROLLBACK');
      console.log('🔄 Transaction ROLLBACK on error');
    } catch (rollbackErr) {
      console.error('❌ ROLLBACK failed:', rollbackErr.message);
    }
    
    console.error('Error /buy:', err.response?.data || err.message);
    if (err.response) return res.status(err.response.status).json(err.response.data);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  } finally {
    // ✅ Always release database connection
    client.release();
  }
});

// ==============================================
// تفعيل Webhook وبدء السيرفر
// ==============================================
const activateWebhook = async () => {
  try {
    const PUBLIC_URL = process.env.PUBLIC_URL || WEB_BASE;
    const botUrl = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${encodeURI(PUBLIC_URL)}/telegramWebhook`;
    const { data } = await axios.get(botUrl);
    console.log("✅ Webhook set successfully:", data);
  } catch (error) {
    console.error("❌ Failed to set webhook:", error.response?.data || error.message);
  }
};

// ================== LOGOUT ENDPOINT ==================
app.get('/logout', (req, res) => {
  // في الواقع، logout يحدث من جهة العميل (localStorage)
  // هذا Endpoint فقط للتوجيه
  res.redirect('/');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  
  // 1️⃣ تهيئة قاعدة البيانات أولاً
  console.log('🔧 Initializing database...');
  await initDatabase();
  console.log('✅ Database initialization complete');
  
  // 2️⃣ تفعيل Webhook
  await activateWebhook();
  
  // 3️⃣ تشغيل خدمة مراقبة TON Blockchain تلقائيًا (بعد انتهاء المهام السابقة)
  console.log('🔍 Starting TON Blockchain Watcher...');
  
  // فحص أولي عند بدء السيرفر (بعد ثانيتين للتأكد)
  setTimeout(() => {
    checkProfitTransactions().catch(err => {
      console.error('❌ Initial TON Watcher check failed:', err.message);
    });
  }, 2000);
  
  // فحص دوري كل دقيقة (60000 ميلي ثانية)
  setInterval(() => {
    checkProfitTransactions().catch(err => {
      console.error('❌ TON Watcher periodic check failed:', err.message);
    });
  }, 60000);
  
  // تنظيف الطلبات القديمة كل 60 ثانية (محسّنة لسرعة الاستجابة)
  setInterval(() => {
    expireOldPendingOrders().catch(err => {
      console.error('❌ Expire old orders failed:', err.message);
    });
  }, 60000); // 60 seconds
  
  console.log('✅ TON Blockchain Watcher is now running (every 60 seconds)');
});

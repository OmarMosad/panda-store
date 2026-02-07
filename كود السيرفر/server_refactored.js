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
      headers: { Authorization: `Bearer ${process.env.TONAPI_KEY}` },
      timeout: 5000
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

// ==============================================
// UNIFIED FINALIZATION FUNCTION (Core Logic)
// ==============================================
/**
 * Finalize order success - IDEMPOTENT, TRANSACTIONAL
 * This is the SINGLE source of truth for order finalization
 * 
 * @param {number} orderId - The order ID to finalize
 * @param {string} txHash - The blockchain transaction hash
 * @param {string} verificationMethod - How the payment was verified (ton_watcher, manual_confirm, etc.)
 * @returns {Promise<{success: boolean, message: string, order?: object}>}
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
    // Calculate the date in Cairo timezone
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
// TON Blockchain Watcher - Enhanced Matching
// ==============================================
const TON_API = "https://tonapi.io/v2";
const PROFIT_WALLET = process.env.PROFIT_WALLET;
const TONAPI_KEY = process.env.TONAPI_KEY;

/**
 * Enhanced TON Watcher with better matching and finalization
 */
async function checkProfitTransactions() {
  try {
    if (!PROFIT_WALLET || !TONAPI_KEY) {
      console.error('❌ TON Watcher: Missing PROFIT_WALLET or TONAPI_KEY environment variables');
      return;
    }

    // Get pending orders with market_payload
    const { rows: orders } = await pool.query(`
      SELECT id, market_payload, reference_code, username, stars, amount_ton, created_at
      FROM orders
      WHERE status = 'pending'
        AND market_payload IS NOT NULL
        AND market_payload != ''
        AND created_at >= NOW() - INTERVAL '1 hour'
      ORDER BY created_at DESC
      LIMIT 50
    `);

    if (!orders.length) {
      console.log('✅ TON Watcher: No pending orders to verify');
      return;
    }

    console.log(`🔍 TON Watcher: Checking ${orders.length} pending orders...`);

    // Fetch recent transactions
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

    // Verify each order
    for (const order of orders) {
      try {
        console.log(`\n🔍 Verifying order #${order.id}...`);
        console.log(`   └─ Reference: ${order.reference_code}`);
        console.log(`   └─ Payload: ${order.market_payload.substring(0, 25)}...`);
        
        // Enhanced matching: Try multiple strategies
        const match = transactions.find(tx => {
          const chainPayload = tx.in_msg?.raw_body || tx.in_msg?.payload || tx.in_msg?.message;
          
          if (!chainPayload) return false;
          
          // Strategy 1: Exact payload match
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
          // Call finalization function
          const result = await finalizeOrderSuccess(order.id, match.hash, 'ton_watcher');
          
          if (result.success) {
            verifiedCount++;
            console.log(`✅ Order #${order.id} VERIFIED and FINALIZED!`);
            console.log(`   └─ TX Hash: ${match.hash}`);
          } else {
            console.error(`❌ Order #${order.id} verification found but finalization failed: ${result.message}`);
          }
        } else {
          notFoundCount++;
          console.log(`⏳ Order #${order.id}: No matching TX found yet`);
        }

      } catch (verifyErr) {
        console.error(`❌ Order #${order.id}: Verification error:`, verifyErr.message);
      }

      // Small delay between checks
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    if (verifiedCount > 0) {
      console.log(`\n🎉 TON Watcher: Successfully verified ${verifiedCount} order(s)`);
    }
    if (notFoundCount > 0) {
      console.log(`⏳ TON Watcher: ${notFoundCount} order(s) still waiting for confirmation`);
    }

  } catch (error) {
    console.error('❌ TON Watcher Error:', error.message);
    if (error.response) {
      console.error('   └─ API Response:', error.response.data);
    }
  }
}

/**
 * Expire old pending orders
 */
async function expireOldPendingOrders() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find old pending orders
    const oldOrders = await client.query(`
      SELECT id, username, stars, reference_code
      FROM orders
      WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '1 hour'
      FOR UPDATE
    `);

    if (oldOrders.rows.length === 0) {
      await client.query('COMMIT');
      return;
    }

    // Update to expired
    await client.query(`
      UPDATE orders
      SET status = 'expired',
          updated_at = NOW()
      WHERE status = 'pending'
        AND created_at < NOW() - INTERVAL '1 hour'
    `);

    // Add history entries
    for (const order of oldOrders.rows) {
      await client.query(
        `INSERT INTO order_history (order_id, event_type, payload, created_at)
         VALUES ($1, 'expired', $2, NOW())`,
        [
          order.id,
          JSON.stringify({
            reason: 'Payment timeout - order older than 1 hour',
            username: order.username,
            stars: order.stars,
            reference_code: order.reference_code
          })
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`🧹 Expired ${oldOrders.rows.length} old pending order(s)`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Expire Old Orders Error:', error.message);
  } finally {
    client.release();
  }
}

// ==============================================
// Database initialization
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
    
    // Create order_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS order_history (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        event_type VARCHAR(50) NOT NULL,
        payload JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ order_history table checked/created');
    
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
    
    // Add columns to orders table
    const migrations = [
      { name: 'referred_by', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS referred_by VARCHAR(255)` },
      { name: 'status', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'` },
      { name: 'profit_ton', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_ton DECIMAL(18,9)` },
      { name: 'profit_tx_hash', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS profit_tx_hash VARCHAR(255)` },
      { name: 'reference_code', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS reference_code VARCHAR(100)` },
      { name: 'tx_hash', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255)` },
      { name: 'market_payload', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_payload TEXT` },
      { name: 'updated_at', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP` },
      { name: 'paid_at', query: `ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP` }
    ];
    
    for (const migration of migrations) {
      try {
        await pool.query(migration.query);
        console.log(`✅ Migration: orders.${migration.name} column checked/added`);
      } catch (migErr) {
        console.log(`⚠️ Migration orders.${migration.name} skipped:`, migErr.message);
      }
    }
    
    // Create indexes
    try {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_reference_code_unique ON orders(reference_code) WHERE reference_code IS NOT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders(status, created_at)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS orders_profit_tx_hash_idx ON orders(profit_tx_hash) WHERE profit_tx_hash IS NOT NULL`);
      await pool.query(`CREATE INDEX IF NOT EXISTS orders_username_idx ON orders(username)`);
      console.log('✅ Performance indexes created');
    } catch (idxErr) {
      console.log('⚠️ Index creation skipped:', idxErr.message);
    }
    
    // Users table (referral system)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        telegram_id BIGINT UNIQUE,
        username VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255),
        photo_url TEXT,
        referral_code VARCHAR(50) UNIQUE,
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
    
    // Referral earnings table
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
    
    // Withdrawals table
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
    
    console.log('✅ All database tables initialized successfully');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  }
};

// ==============================================
// API ENDPOINTS - Enhanced
// ==============================================

/**
 * POST /buy - Create pre-payment order and get transaction payload
 * This creates the order ONCE and returns transaction details
 */
app.post('/buy', rateLimitMiddleware, async (req, res) => {
  try {
    const { username, quantity } = req.body || {};
    
    // Input validation
    if (!username || !quantity) {
      return res.status(422).json({ 
        detail: [{ loc: ['body', 'username/quantity'], msg: 'username and quantity required', type: 'value_error' }] 
      });
    }
    
    if (!Number.isInteger(Number(quantity)) || Number(quantity) <= 0) {
      return res.status(422).json({
        detail: [{ loc: ['body', 'quantity'], msg: 'quantity must be a positive integer', type: 'value_error' }]
      });
    }

    const upstreamUrl = MARKETAPP_URL;
    const apiAuth = MARKETAPP_AUTH;
    if (!apiAuth) {
      return res.status(500).json({ error: 'config_error', message: 'MARKETAPP_AUTH missing' });
    }

    const STAR_PRICE_USD = 0.016;
    const amountUSD = STAR_PRICE_USD * Number(quantity);
    
    // Generate unique reference code
    const referenceCode = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    console.log(`🔖 Generated Reference Code: ${referenceCode}`);
    
    // Calculate profit
    let profitTON = null;
    try {
      const tonPrice = await getTONPrice();
      profitTON = calculateProfitTON(quantity, tonPrice);
      console.log(`💰 Pre-payment profit calculation: ${profitTON.toFixed(9)} TON`);
    } catch (err) {
      console.error('⚠️ Could not calculate profit:', err.message);
    }
    
    // Get referred_by
    let referredBy = null;
    try {
      const userRefResult = await pool.query(
        'SELECT referred_by FROM users WHERE username = $1',
        [username]
      );
      if (userRefResult.rows.length > 0 && userRefResult.rows[0].referred_by) {
        referredBy = userRefResult.rows[0].referred_by;
      }
    } catch (refErr) {
      console.error('⚠️ Error fetching referral:', refErr.message);
    }
    
    // SINGLE ORDER CREATION - This is the only place we create the order
    let orderId;
    try {
      const result = await pool.query(
        `INSERT INTO orders (
          username, stars, amount_ton, amount_usd, wallet_address, 
          reference_number, reference_code, is_automatic, referred_by, 
          status, profit_ton, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
        RETURNING id`,
        [
          username, quantity, 0, amountUSD, 'fragment',
          `pre_${username}_${quantity}_${Date.now()}`,
          referenceCode, false, referredBy, 'pending', profitTON,
          new Date().toISOString()
        ]
      );
      orderId = result.rows[0].id;
      
      // Add order history
      await pool.query(
        `INSERT INTO order_history (order_id, event_type, payload, created_at)
         VALUES ($1, 'created', $2, NOW())`,
        [
          orderId,
          JSON.stringify({
            username,
            stars: quantity,
            amountUSD,
            referenceCode,
            referredBy,
            source: 'website_buy'
          })
        ]
      );
      
      console.log(`💾 Pre-payment order created! ID: ${orderId}, Ref: ${referenceCode}, User: @${username}, Stars: ${quantity}`);
    } catch (dbErr) {
      console.error('❌ Failed to save pre-payment order:', dbErr.message);
      return res.status(500).json({ error: 'database_error', message: 'Failed to create order' });
    }

    // Call MarketApp API
    let upResp;
    try {
      upResp = await axios.post(upstreamUrl, { username, quantity }, {
        headers: {
          'accept': 'application/json',
          'Content-Type': 'application/json',
          'Authorization': apiAuth
        },
        timeout: 15000
      });
    } catch (apiErr) {
      console.error('❌ MarketApp API error:', apiErr.response?.data || apiErr.message);
      // Mark order as failed
      await pool.query(
        `UPDATE orders SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [orderId]
      );
      
      if (apiErr.response) {
        return res.status(apiErr.response.status).json(apiErr.response.data);
      }
      return res.status(500).json({ error: 'api_error', message: apiErr.message });
    }
    
    console.log('📦 MarketApp API Response received');
    
    const transaction = upResp.data.transaction || { messages: [] };
    if (!Array.isArray(transaction.messages)) transaction.messages = [];
    
    // Extract and save market_payload
    const marketPayload = upResp.data?.transaction?.messages?.[0]?.payload;
    
    if (marketPayload && orderId) {
      try {
        await pool.query(
          `UPDATE orders SET market_payload = $1 WHERE id = $2`,
          [marketPayload, orderId]
        );
        console.log(`✅ Saved market_payload for order #${orderId}`);
        console.log(`   └─ Payload preview: ${marketPayload.substring(0, 25)}...`);
      } catch (payloadSaveErr) {
        console.error('❌ Failed to save market_payload:', payloadSaveErr.message);
      }
    }

    // Calculate profit margin and add profit message
    const profitAddress = 'UQAcDae1BvWVAD0TkhnGgDme4b7NH9Fz8JXce-78TW6ekmvN';
    if (transaction.messages.length > 0 && profitAddress) {
      const sellPricePerStar = 0.016;
      const targetTotalUsd = sellPricePerStar * Number(quantity);

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
        transaction.messages.push({
          address: profitAddress,
          amount: marginNano.toString()
        });
        console.log(`✅ Profit margin: ${(Number(marginNano) / 1e9).toFixed(9)} TON | Ref: ${referenceCode}`);
      }
    }

    // Clean and send response
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

    // Return transaction along with order info
    return res.json({
      transaction,
      orderId,
      referenceCode
    });
  } catch (err) {
    console.error('❌ Error in /buy:', err.message);
    return res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

/**
 * POST /confirm-order - Confirm order payment (replaces /order)
 * Frontend calls this after user completes payment
 * This endpoint is idempotent and can be called multiple times safely
 */
app.post('/confirm-order', rateLimitMiddleware, async (req, res) => {
  try {
    const { orderId, referenceCode } = req.body;
    
    if (!orderId && !referenceCode) {
      return res.status(400).json({
        success: false,
        error: 'Either orderId or referenceCode is required'
      });
    }
    
    // Find order
    let order;
    if (orderId) {
      const result = await pool.query(
        `SELECT * FROM orders WHERE id = $1`,
        [orderId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      order = result.rows[0];
    } else {
      const result = await pool.query(
        `SELECT * FROM orders WHERE reference_code = $1`,
        [referenceCode]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      order = result.rows[0];
    }
    
    // If already paid, return success (idempotent)
    if (order.status === 'paid') {
      return res.json({
        success: true,
        status: 'paid',
        message: 'Order already confirmed',
        orderId: order.id,
        referenceCode: order.reference_code
      });
    }
    
    // If expired or failed
    if (order.status === 'expired' || order.status === 'failed') {
      return res.json({
        success: false,
        status: order.status,
        message: `Order is ${order.status}`,
        orderId: order.id,
        referenceCode: order.reference_code
      });
    }
    
    // Still pending - check if we can verify on chain
    // For now, we'll return pending status and let the TON Watcher handle verification
    // In a future enhancement, we could add real-time TON API verification here
    
    console.log(`📋 Order confirmation requested for #${order.id} (${order.reference_code}) - Status: ${order.status}`);
    
    return res.json({
      success: true,
      status: order.status,
      message: 'Order confirmation received, payment verification in progress',
      orderId: order.id,
      referenceCode: order.reference_code
    });
    
  } catch (error) {
    console.error('❌ Error in /confirm-order:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/stats - Enhanced statistics endpoint
 * Only counts PAID orders and uses paid_at for date filtering
 */
app.get('/api/stats', async (req, res) => {
  try {
    // Total stars sent (only paid orders)
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

    // Stars sent yesterday
    const yesterdayResult = await pool.query(
      `SELECT COALESCE(SUM(stars), 0) as yesterday 
       FROM orders 
       WHERE status = 'paid'
         AND DATE(paid_at AT TIME ZONE 'Africa/Cairo') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo' - INTERVAL '1 day')`
    );
    const starsYesterday = parseInt(yesterdayResult.rows[0].yesterday);

    // Average order completion time (paid_at - created_at) for last 100 paid orders
    let avgTime = 51; // Default
    try {
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
        // Sanity check
        if (avgTime < 10 || avgTime > 300) {
          avgTime = 51;
        }
      }
    } catch (avgErr) {
      console.error('⚠️ Error calculating average time:', avgErr.message);
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

// ==============================================
// REFERRAL SYSTEM ENDPOINTS (Keep existing)
// ==============================================

// 1. Register/update user after login
app.post('/api/user/register', async (req, res) => {
  try {
    const { telegramId, username, fullName, photoUrl, referredBy } = req.body;
    
    if (!telegramId || !username) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const referralCode = username;

    const existingUser = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1',
      [telegramId]
    );

    let user;
    if (existingUser.rows.length > 0) {
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
    } else {
      const inserted = await pool.query(
        `INSERT INTO users (telegram_id, username, full_name, photo_url, referral_code, referred_by) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [telegramId, username, fullName, photoUrl, referralCode, referredBy || null]
      );
      user = inserted.rows[0];
      
      if (referredBy) {
        await pool.query(
          'UPDATE users SET total_referrals = total_referrals + 1 WHERE referral_code = $1',
          [referredBy]
        );
        console.log(`✅ New user registered via referral: @${username} (referred by: ${referredBy})`);
      } else {
        console.log(`✅ New user registered: @${username}`);
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
        totalEarnings: parseFloat(user.total_earnings || 0),
        availableBalance: parseFloat(user.available_balance || 0),
        totalReferrals: user.total_referrals || 0
      }
    });
  } catch (err) {
    console.error('❌ Error in /api/user/register:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Get user details
app.get('/api/user/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;
    
    const isNumeric = /^\d+$/.test(identifier);
    
    let userResult;
    if (isNumeric) {
      userResult = await pool.query(
        'SELECT * FROM users WHERE telegram_id = $1 OR username = $1',
        [identifier]
      );
    } else {
      userResult = await pool.query(
        'SELECT * FROM users WHERE username = $1',
        [identifier]
      );
    }

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Calculate user level based on own purchases
    const userOrdersResult = await pool.query(
      'SELECT COALESCE(SUM(stars), 0) as total FROM orders WHERE username = $1 AND status = \'paid\'',
      [user.username]
    );
    const userOwnPurchases = parseInt(userOrdersResult.rows[0].total || 0);
    const userLevel = getUserLevelAndCommission(userOwnPurchases);

    // Get referrals
    const referralsResult = await pool.query(
      `SELECT DISTINCT o.username, u.full_name, u.photo_url, 
              SUM(o.stars) as total_stars,
              COUNT(o.id) as orders_count,
              MAX(o.created_at) as last_order,
              (SELECT SUM(re.commission_amount) 
               FROM referral_earnings re 
               JOIN orders o2 ON re.order_id = o2.id 
               WHERE o2.username = o.username AND o2.referred_by = $1
              ) as total_earnings
       FROM orders o
       LEFT JOIN users u ON o.username = u.username
       WHERE o.referred_by = $1 AND o.status = 'paid'
       GROUP BY o.username, u.full_name, u.photo_url
       ORDER BY last_order DESC`,
      [user.username]
    );

    // Get earnings history
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
    console.error('❌ Error in /api/user/:identifier:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Withdraw request
app.post('/api/withdraw', async (req, res) => {
  try {
    const { username, amount, walletAddress } = req.body;

    if (!username || !amount || !walletAddress) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

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

    const withdrawalResult = await pool.query(
      `INSERT INTO withdrawals (user_id, amount, wallet_address, status) 
       VALUES ($1, $2, $3, 'pending') 
       RETURNING *`,
      [user.id, requestedAmount, walletAddress]
    );

    await pool.query(
      `UPDATE users SET available_balance = available_balance - $1 WHERE id = $2`,
      [requestedAmount, user.id]
    );

    // Notify admins
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
    
    for (const adminId of ADMIN_IDS) {
      try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
          chat_id: adminId,
          text: ownerMessage,
          parse_mode: 'HTML'
        });
      } catch (err) {
        console.error(`❌ Failed to notify admin ${adminId}:`, err.message);
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

// 4. Get user orders
app.get('/api/user/:username/orders', async (req, res) => {
  try {
    const { username } = req.params;

    const ordersResult = await pool.query(
      `SELECT id, stars, amount_ton, amount_usd, wallet_address, reference_number, reference_code,
              is_automatic, referred_by, status, created_at, paid_at
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
        referenceCode: order.reference_code,
        isAutomatic: order.is_automatic,
        referredBy: order.referred_by,
        status: order.status,
        createdAt: order.created_at,
        paidAt: order.paid_at,
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

// 5. Track referral
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

    const userResult = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.json({
        success: true,
        message: 'User not registered yet, referral will be saved on registration',
        shouldSaveForLater: true
      });
    }

    const user = userResult.rows[0];

    if (user.referred_by) {
      console.log(`⚠️ User @${username} already referred by @${user.referred_by}`);
      return res.json({
        success: true,
        message: 'User already has a referrer',
        alreadyReferred: true,
        referredBy: user.referred_by
      });
    }

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

    await pool.query(
      'UPDATE users SET referred_by = $1 WHERE username = $2',
      [referrer.username, username]
    );

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

// ==============================================
// OTHER ENDPOINTS (Keep existing functionality)
// ==============================================

// Premium order handling
app.post('/premium', async (req, res) => {
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

    await Promise.allSettled(sendPromises);
    
  } catch (error) {
    console.error('❌ Error in /premium endpoint:', error);
  }
});

// Get user info proxy
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

// Telegram webhook
app.post('/telegramWebhook', async (req, res) => {
  const body = req.body;

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

app.get('/logout', (req, res) => {
  res.redirect('/');
});

// Admin endpoints
app.get('/admin/check-db', async (req, res) => {
  try {
    const ordersCount = await pool.query('SELECT COUNT(*) as count FROM orders');
    const recentOrders = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 20');
    const statsResult = await pool.query('SELECT SUM(stars) as total, COUNT(*) as orders FROM orders WHERE status = \'paid\'');
    
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

// ==============================================
// Server Startup and Background Tasks
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  
  // 1. Initialize database
  console.log('🔧 Initializing database...');
  await initDatabase();
  console.log('✅ Database initialization complete');
  
  // 2. Activate webhook
  await activateWebhook();
  
  // 3. Start TON Blockchain Watcher
  console.log('🔍 Starting TON Blockchain Watcher...');
  
  // Initial check after 2 seconds
  setTimeout(() => {
    checkProfitTransactions().catch(err => {
      console.error('❌ Initial TON Watcher check failed:', err.message);
    });
  }, 2000);
  
  // Periodic check every 60 seconds
  setInterval(() => {
    checkProfitTransactions().catch(err => {
      console.error('❌ TON Watcher periodic check failed:', err.message);
    });
  }, 60000);
  
  // Expire old orders every 5 minutes
  setInterval(() => {
    expireOldPendingOrders().catch(err => {
      console.error('❌ Expire old orders failed:', err.message);
    });
  }, 300000);
  
  console.log('✅ TON Blockchain Watcher is now running (checks every 60 seconds)');
  console.log('✅ Order expiration job running (checks every 5 minutes)');
});

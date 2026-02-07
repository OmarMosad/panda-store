# Quick Migration Guide

## 🚀 Steps to Deploy the Refactored Backend

### Step 1: Backup Everything
```bash
# Backup database
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup current server.js
cp server.js server_backup_$(date +%Y%m%d_%H%M%S).js
```

### Step 2: Deploy New Server
```bash
# Replace old server with refactored version
cp server_refactored.js server.js

# Restart the server (method depends on your hosting)
# For example on Render/Heroku it will auto-restart
# Or manually: pm2 restart server
```

### Step 3: Database Migrations (Automatic)
The server will automatically run migrations on startup. Watch logs for:
```
✅ order_history table checked/created
✅ daily_stars table checked/created
✅ Migration: orders.paid_at column checked/added
✅ Performance indexes created
```

### Step 4: Update Frontend (Critical!)

#### OLD CODE (Remove):
```javascript
// ❌ OLD - Do not use anymore
await fetch('/order', {
  method: 'POST',
  body: JSON.stringify({
    username, stars, amountUSD, amountTON,
    walletAddress, referenceNumber, timestamp
  })
});
```

#### NEW CODE (Implement):
```javascript
// ✅ STEP 1: Get transaction from /buy
const buyResponse = await fetch('/buy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    username: telegramUsername, 
    quantity: selectedStars 
  })
});

if (!buyResponse.ok) {
  throw new Error('Failed to create order');
}

const { transaction, orderId, referenceCode } = await buyResponse.json();

// Save for later confirmation
localStorage.setItem('pendingOrderId', orderId);
localStorage.setItem('pendingReferenceCode', referenceCode);

// ✅ STEP 2: Send transaction via TonConnect
try {
  await tonConnectUI.sendTransaction(transaction);
} catch (error) {
  console.error('Payment failed:', error);
  return;
}

// ✅ STEP 3: Confirm order
const confirmResponse = await fetch('/confirm-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId })
});

const result = await confirmResponse.json();

if (result.success) {
  if (result.status === 'paid') {
    // Already confirmed by watcher
    showSuccessMessage();
  } else {
    // Still pending - show waiting message
    showPendingMessage();
    // Optional: poll every 10 seconds for status update
    startPollingOrderStatus(orderId);
  }
}

// ✅ OPTIONAL: Poll for status
function startPollingOrderStatus(orderId) {
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch('/confirm-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId })
      });
      
      const result = await response.json();
      
      if (result.status === 'paid') {
        clearInterval(pollInterval);
        showSuccessMessage();
        localStorage.removeItem('pendingOrderId');
        localStorage.removeItem('pendingReferenceCode');
      } else if (result.status === 'expired' || result.status === 'failed') {
        clearInterval(pollInterval);
        showErrorMessage('Payment timeout or failed');
      }
    } catch (error) {
      console.error('Poll error:', error);
    }
  }, 10000); // Poll every 10 seconds
  
  // Stop polling after 5 minutes
  setTimeout(() => clearInterval(pollInterval), 5 * 60 * 1000);
}
```

### Step 5: Verify Deployment

#### Test 1: Check Server Health
```bash
curl http://your-domain.com/
# Expected: ✅ Panda Store backend is running!
```

#### Test 2: Check Stats Endpoint
```bash
curl http://your-domain.com/api/stats
# Expected: JSON with totalStars, starsToday, etc.
```

#### Test 3: Test Order Creation
```bash
curl -X POST http://your-domain.com/buy \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","quantity":50}'
  
# Expected: Response with transaction, orderId, referenceCode
```

#### Test 4: Check Logs
Look for these in your server logs:
```
🚀 Server is running on port 3000
✅ Database connected successfully
✅ Database initialization complete
🔍 Starting TON Blockchain Watcher...
✅ TON Blockchain Watcher is now running (checks every 60 seconds)
✅ Order expiration job running (checks every 5 minutes)
```

### Step 6: Monitor First Few Transactions

Watch the logs closely for the first few real transactions:
```
💾 Pre-payment order created! ID: 123, Ref: ORD-1234567890-ABC123
✅ Saved market_payload for order #123
🔍 TON Watcher: Checking 1 pending orders...
   └─ ✅ EXACT PAYLOAD MATCH!
✅ Order #123 FINALIZED successfully via ton_watcher
💰 Commission applied: @referrer earned $0.0056 (0.5% - Starter)
```

### Step 7: Rollback Plan (If Needed)

If something goes wrong:
```bash
# 1. Restore old server
cp server_backup_YYYYMMDD_HHMMSS.js server.js

# 2. Restart server
# pm2 restart server or equivalent

# 3. The database changes are backward compatible
#    Old code will still work (but with old issues)
```

---

## 🔍 Testing Checklist

- [ ] Server starts without errors
- [ ] Database migrations complete successfully
- [ ] TON Watcher logs show periodic checks
- [ ] `/buy` endpoint returns transaction + orderId
- [ ] `/confirm-order` endpoint returns current status
- [ ] `/api/stats` shows correct numbers (only paid orders)
- [ ] Test full purchase flow end-to-end
- [ ] Verify referral commissions work
- [ ] Check admin notifications arrive
- [ ] Verify order expiration after 1 hour

---

## 📊 Monitoring After Deployment

### Key Metrics to Watch:
1. **Order Completion Rate**: pending → paid conversion
2. **Average Confirmation Time**: How long watcher takes to confirm
3. **Failed Orders**: Status 'expired' or 'failed'
4. **Referral Commissions**: Check `referral_earnings` table
5. **Daily Stats Accuracy**: Compare `daily_stars` vs manual count

### SQL Queries for Monitoring:
```sql
-- Check recent orders
SELECT id, username, stars, status, reference_code, created_at, paid_at 
FROM orders 
ORDER BY created_at DESC 
LIMIT 20;

-- Check pending orders
SELECT COUNT(*) as pending_count, 
       MIN(created_at) as oldest_pending
FROM orders 
WHERE status = 'pending';

-- Check today's stats
SELECT * FROM daily_stars 
WHERE date = CURRENT_DATE;

-- Check order history events
SELECT oh.*, o.username, o.stars 
FROM order_history oh
JOIN orders o ON oh.order_id = o.id
ORDER BY oh.created_at DESC
LIMIT 50;

-- Check if any orders stuck in pending > 1 hour
SELECT id, username, stars, reference_code, created_at,
       EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_pending
FROM orders
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour';
```

---

## ⚠️ Important Notes

1. **No Breaking Changes for Users**: The refactoring doesn't affect users who already have accounts or old orders.

2. **Frontend Must Be Updated**: The old `/order` endpoint logic is replaced. Frontend must use new flow.

3. **Rate Limiting**: `/buy` and `/confirm-order` are rate-limited to 20 requests per minute per IP.

4. **Idempotency**: All endpoints can be safely retried without side effects.

5. **TON Watcher**: Runs every 60 seconds. Payment confirmation typically happens within 1-2 minutes.

6. **Order Expiration**: Pending orders expire after 1 hour automatically.

---

## 🆘 Troubleshooting

### Issue: Orders Stuck in Pending
**Solution**: Check TON Watcher logs. Ensure `PROFIT_WALLET` and `TONAPI_KEY` are set correctly.

### Issue: Stats Not Updating
**Solution**: Check `daily_stars` table. Ensure orders have `status='paid'` and `paid_at` is set.

### Issue: Duplicate Commissions
**Solution**: Should not happen with new code. Check `referral_earnings` for duplicate `order_id`.

### Issue: Rate Limit Too Strict
**Solution**: Adjust `MAX_REQUESTS_PER_WINDOW` in server.js (currently 20).

---

## ✅ Success Criteria

Your deployment is successful if:
- ✅ All migrations run without errors
- ✅ TON Watcher successfully confirms test transaction
- ✅ Stats endpoint shows accurate numbers
- ✅ No duplicate orders created
- ✅ Referral commissions applied correctly
- ✅ Admin notifications received
- ✅ Frontend successfully completes purchase flow

---

## 📞 Need Help?

Check these in order:
1. Server logs for error messages
2. Database connection status
3. Environment variables (all set correctly?)
4. TON API connectivity
5. Frontend console for errors

**Happy deploying! 🚀**

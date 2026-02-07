# 📋 Complete Deployment Checklist

## Pre-Deployment (Do Before Changes)

### Backup Everything
- [ ] **Backup Database**
  ```bash
  pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
  - Verify backup file exists and has size > 0
  - Store backup in safe location (download locally)

- [ ] **Backup Current Server Code**
  ```bash
  cp server.js server_backup_$(date +%Y%m%d_%H%M%S).js
  ```

- [ ] **Document Current State**
  - [ ] Take screenshot of current /api/stats
  - [ ] Run: `SELECT COUNT(*), SUM(stars) FROM orders;`
  - [ ] Save output for comparison
  - [ ] Note any known issues with current system

### Review Documentation
- [ ] Read [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) completely
- [ ] Read [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) thoroughly
- [ ] Understand changes in [BEFORE_AFTER_COMPARISON.md](BEFORE_AFTER_COMPARISON.md)
- [ ] Review [API_REFERENCE.md](API_REFERENCE.md) for new endpoints

---

## Deployment Phase

### Step 1: Deploy Backend
- [ ] **Replace server.js**
  ```bash
  cp server_refactored.js server.js
  ```

- [ ] **Verify file replaced**
  ```bash
  ls -lh server.js
  head -20 server.js  # Should see new comments/structure
  ```

- [ ] **Restart Server**
  - If using PM2: `pm2 restart server`
  - If on Render/Heroku: Push to Git (auto-restart)
  - If manual: `node server.js`

### Step 2: Monitor Server Startup
Watch logs carefully for:
- [ ] ✅ Database connected successfully
- [ ] ✅ order_history table checked/created
- [ ] ✅ daily_stars table checked/created
- [ ] ✅ Migration: orders.paid_at column checked/added
- [ ] ✅ Migration: orders.reference_code column checked/added
- [ ] ✅ Performance indexes created
- [ ] ✅ Database initialization complete
- [ ] ✅ TON Blockchain Watcher is now running
- [ ] ✅ Order expiration job running

**⚠️ If you see any errors, STOP and investigate before proceeding!**

### Step 3: Verify Database Migrations
```sql
-- Check new tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('order_history', 'daily_stars');
-- Expected: 2 rows

-- Check new columns
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('paid_at', 'reference_code');
-- Expected: 2 rows

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'orders' 
  AND indexname LIKE '%reference_code%';
-- Expected: at least 1 row
```

- [ ] All queries return expected results
- [ ] No error messages in output

---

## Testing Phase

### Step 1: Test Health Endpoints
- [ ] **Test Server Health**
  ```bash
  curl http://your-domain.com/
  # Expected: ✅ Panda Store backend is running!
  ```

- [ ] **Test Stats Endpoint**
  ```bash
  curl http://your-domain.com/api/stats
  # Expected: JSON with totalStars, starsToday, etc.
  ```

### Step 2: Test Order Creation
- [ ] **Test /buy Endpoint**
  ```bash
  curl -X POST http://your-domain.com/buy \
    -H "Content-Type: application/json" \
    -d '{"username":"testuser","quantity":50}'
  ```
  - [ ] Receives 200 status
  - [ ] Response includes `transaction`
  - [ ] Response includes `orderId`
  - [ ] Response includes `referenceCode`

- [ ] **Verify Order in Database**
  ```sql
  SELECT * FROM orders ORDER BY id DESC LIMIT 1;
  ```
  - [ ] Status is 'pending'
  - [ ] reference_code is NOT NULL
  - [ ] market_payload is NOT NULL

- [ ] **Check Order History**
  ```sql
  SELECT * FROM order_history WHERE order_id = (SELECT MAX(id) FROM orders);
  ```
  - [ ] Event type is 'created'
  - [ ] Payload contains order details

### Step 3: Test Order Confirmation
- [ ] **Test /confirm-order Endpoint**
  ```bash
  ORDER_ID=123  # Replace with actual orderId from above
  curl -X POST http://your-domain.com/confirm-order \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":$ORDER_ID}"
  ```
  - [ ] Receives 200 status
  - [ ] Response shows status 'pending'
  - [ ] Returns orderId and referenceCode

- [ ] **Test Idempotency (Call Again)**
  ```bash
  # Call same endpoint again
  curl -X POST http://your-domain.com/confirm-order \
    -H "Content-Type: application/json" \
    -d "{\"orderId\":$ORDER_ID}"
  ```
  - [ ] Still returns success
  - [ ] Same orderId returned
  - [ ] No duplicate order created

### Step 4: Test Rate Limiting
- [ ] **Test Rate Limit**
  ```bash
  # Send 25 requests rapidly (should hit limit at 20)
  for i in {1..25}; do
    curl -X POST http://your-domain.com/buy \
      -H "Content-Type: application/json" \
      -d '{"username":"test","quantity":50}' &
  done
  wait
  ```
  - [ ] First 20 succeed
  - [ ] Next 5 return 429 status
  - [ ] Error message: "Too many requests"

---

## Frontend Update Phase

⚠️ **CRITICAL: Frontend MUST be updated to work with new backend!**

### Step 1: Update Buy Flow
Replace old code:
```javascript
// ❌ OLD - Remove this
await fetch('/order', { ... });
```

With new code:
```javascript
// ✅ NEW - Use this
const { transaction, orderId, referenceCode } = 
  await fetch('/buy', { 
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, quantity: stars })
  }).then(r => r.json());

localStorage.setItem('pendingOrderId', orderId);
localStorage.setItem('pendingReferenceCode', referenceCode);
```

- [ ] Old `/order` calls removed from frontend
- [ ] New `/buy` endpoint integrated
- [ ] orderId saved to localStorage
- [ ] referenceCode saved to localStorage

### Step 2: Add Confirmation Flow
```javascript
// After payment sent
await tonConnectUI.sendTransaction(transaction);

// Confirm order
const result = await fetch('/confirm-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    orderId: localStorage.getItem('pendingOrderId')
  })
}).then(r => r.json());

if (result.status === 'paid') {
  showSuccess();
} else if (result.status === 'pending') {
  showPendingMessage();
  startPollingOrderStatus(result.orderId);
}
```

- [ ] Confirmation call added after payment
- [ ] Status handling implemented
- [ ] Polling function added (optional but recommended)

### Step 3: Deploy Frontend
- [ ] Frontend code committed to Git
- [ ] Frontend deployed to hosting
- [ ] Verify deployment successful
- [ ] Clear browser cache
- [ ] Test in incognito/private window

---

## End-to-End Testing

### Test 1: Complete Purchase Flow
- [ ] Open website in browser
- [ ] Login with Telegram
- [ ] Select stars amount
- [ ] Click "Buy Stars"
- [ ] Verify transaction shown in wallet
- [ ] Approve transaction
- [ ] Wait for confirmation message
- [ ] Verify order appears in database as 'paid'
- [ ] Check stats updated correctly

### Test 2: Referral Flow
- [ ] User A shares referral link
- [ ] User B opens link and registers
- [ ] User B makes purchase
- [ ] Verify order has `referred_by = UserA`
- [ ] Wait for payment confirmation
- [ ] Check User A received commission
- [ ] Verify commission appears in User A's balance

### Test 3: Browser Close Scenario
- [ ] Start purchase flow
- [ ] Approve payment in wallet
- [ ] **Immediately close browser** (don't wait)
- [ ] Wait 2-3 minutes
- [ ] Check database: order should be 'paid'
- [ ] Check TON Watcher logs for confirmation
- [ ] Open browser again - verify stars received

### Test 4: Order Expiration
- [ ] Create order via /buy
- [ ] **Do NOT send payment**
- [ ] Wait 65 minutes
- [ ] Check order status - should be 'expired'
- [ ] Verify order_history has 'expired' event

---

## Monitoring Setup

### Step 1: Set Up Log Monitoring
- [ ] Configure log aggregation (if using service like Papertrail, Loggly)
- [ ] Set up alerts for error patterns:
  - "❌" in logs
  - "Database error"
  - "TON Watcher Error"
  - "Failed to"

### Step 2: Create Monitoring Dashboard
Bookmark these queries in database tool:

- [ ] [Query 2: Orders Status Summary](SQL_MONITORING_QUERIES.md#2-orders-status-summary)
- [ ] [Query 3: Pending Orders Analysis](SQL_MONITORING_QUERIES.md#3-pending-orders-analysis)
- [ ] [Query 5: Today's Statistics](SQL_MONITORING_QUERIES.md#5-todays-statistics-cairo-timezone)
- [ ] [Query 24: Failed Payment Rate](SQL_MONITORING_QUERIES.md#24-failed-payment-rate)

### Step 3: Set Up Alerts
Configure alerts for:
- [ ] Orders pending > 1 hour (should be auto-expired)
- [ ] Success rate drops below 90%
- [ ] No orders in last hour (during business hours)
- [ ] Database connection errors
- [ ] TON Watcher errors

---

## First 24 Hours Monitoring

### Every 2 Hours (First Day)
- [ ] Check server logs for errors
- [ ] Run: Orders Status Summary query
- [ ] Run: Today's Statistics query
- [ ] Verify TON Watcher running
- [ ] Check for pending orders > 10 minutes

### Actions If Issues Found

**Issue: Orders stuck in pending**
1. Check TON Watcher logs
2. Verify PROFIT_WALLET and TONAPI_KEY set
3. Manually verify payment on TONScan
4. If paid, use manual finalization query

**Issue: Stats not updating**
1. Check daily_stars table
2. Verify orders have paid_at set
3. Compare daily_stars with actual order count
4. Recompute if needed (query #28)

**Issue: Duplicate commissions**
1. Run Query #14 (Duplicate Commission Check)
2. If found, investigate transaction log
3. Manually correct user balances if needed

---

## Week 1 Monitoring

### Daily Checks
- [ ] Morning: Review overnight orders
- [ ] Midday: Check success rate
- [ ] Evening: Review daily stats
- [ ] Before bed: Scan logs for errors

### Weekly Review (End of Week 1)
- [ ] Compare stats: Old system vs New system
- [ ] Calculate success rate improvement
- [ ] Review any issues encountered
- [ ] Document lessons learned
- [ ] Optimize if needed

---

## Rollback Plan (If Needed)

### When to Rollback
Consider rollback if:
- Critical bugs affecting all users
- Data corruption detected
- Major functionality broken
- Success rate drops significantly

### How to Rollback
```bash
# 1. Stop server
pm2 stop server  # or equivalent

# 2. Restore old server.js
cp server_backup_YYYYMMDD_HHMMSS.js server.js

# 3. Restart server
pm2 restart server

# 4. Verify old system working
curl http://your-domain.com/

# 5. Restore frontend if needed
git revert COMMIT_HASH
git push

# Database changes are backward compatible
# No need to restore database
```

- [ ] Old server.js location known
- [ ] Backup files accessible
- [ ] Rollback procedure tested
- [ ] Team knows rollback process

---

## Success Criteria

Deployment is successful when:

### Technical Success
- [ ] All migrations complete without errors
- [ ] Server starts and runs without crashes
- [ ] All endpoints respond correctly
- [ ] TON Watcher runs periodically
- [ ] Orders finalize correctly
- [ ] Stats are accurate
- [ ] No duplicate orders created
- [ ] Referral commissions work correctly

### Business Success
- [ ] Order completion rate ≥ 95%
- [ ] Average confirmation time < 2 minutes
- [ ] Zero lost orders
- [ ] Customer complaints down
- [ ] Stats match reality

### Stability
- [ ] No errors in logs for 24 hours
- [ ] Database queries performant
- [ ] No memory leaks
- [ ] Server uptime 99.9%+

---

## Post-Deployment Tasks

### Immediate (Day 1)
- [ ] Announce deployment to team
- [ ] Monitor closely for 24 hours
- [ ] Document any issues encountered
- [ ] Update team on status

### Short Term (Week 1)
- [ ] Gather user feedback
- [ ] Fine-tune rate limits if needed
- [ ] Optimize slow queries
- [ ] Update documentation based on issues

### Long Term (Month 1)
- [ ] Review metrics and improvements
- [ ] Plan additional features
- [ ] Archive old backups
- [ ] Update team training materials

---

## Contact & Support

### If Issues Occur
1. **Check logs first** - most issues show clear error messages
2. **Review documentation** - especially troubleshooting sections
3. **Run diagnostic queries** - from SQL_MONITORING_QUERIES.md
4. **Check environment variables** - ensure all are set correctly

### Resources
- [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) - Technical details
- [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) - Step-by-step guide
- [API_REFERENCE.md](API_REFERENCE.md) - Endpoint documentation
- [SQL_MONITORING_QUERIES.md](SQL_MONITORING_QUERIES.md) - Database queries
- [BEFORE_AFTER_COMPARISON.md](BEFORE_AFTER_COMPARISON.md) - Changes overview

---

## Final Notes

✅ **You are ready to deploy!**

This refactoring has been thoroughly designed to:
- Fix all critical issues in the old system
- Be production-ready and scalable
- Include comprehensive error handling
- Be fully documented and maintainable

**Good luck with your deployment! 🚀**

---

**Deployment Date**: _____________  
**Deployed By**: _____________  
**Rollback Prepared**: ☐ Yes ☐ No  
**Team Notified**: ☐ Yes ☐ No  
**Monitoring Set Up**: ☐ Yes ☐ No  

---

*Print this checklist and check off items as you complete them!*

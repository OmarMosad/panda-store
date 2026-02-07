# SQL Monitoring Queries

## 📊 Health Check Queries

### 1. Check Recent Orders
```sql
-- View last 20 orders with all important fields
SELECT 
  id,
  username,
  stars,
  status,
  reference_code,
  created_at,
  paid_at,
  EXTRACT(EPOCH FROM (paid_at - created_at))/60 as completion_minutes
FROM orders 
ORDER BY created_at DESC 
LIMIT 20;
```

### 2. Orders Status Summary
```sql
-- Count orders by status
SELECT 
  status,
  COUNT(*) as count,
  SUM(stars) as total_stars,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM orders
GROUP BY status
ORDER BY count DESC;
```

### 3. Pending Orders Analysis
```sql
-- Check orders still pending and how long
SELECT 
  id,
  username,
  stars,
  reference_code,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_pending
FROM orders
WHERE status = 'pending'
ORDER BY created_at;
```

### 4. Orders Stuck > 1 Hour (Should Be Expired)
```sql
-- These should be automatically expired
SELECT 
  id,
  username,
  stars,
  status,
  reference_code,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_old
FROM orders
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '1 hour'
ORDER BY created_at;
```

---

## 💰 Statistics Queries

### 5. Today's Statistics (Cairo Timezone)
```sql
-- Accurate today's stats
SELECT 
  COUNT(*) as orders_today,
  SUM(stars) as stars_today,
  AVG(stars) as avg_stars_per_order,
  SUM(amount_usd) as total_usd_today
FROM orders
WHERE status = 'paid'
  AND DATE(paid_at AT TIME ZONE 'Africa/Cairo') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo');
```

### 6. Daily Stars Table Check
```sql
-- Verify daily_stars table is updating correctly
SELECT 
  date,
  stars_total,
  orders_count,
  updated_at,
  -- Compare with actual orders
  (SELECT COUNT(*) FROM orders WHERE status = 'paid' AND DATE(paid_at AT TIME ZONE 'Africa/Cairo') = daily_stars.date) as actual_orders,
  (SELECT SUM(stars) FROM orders WHERE status = 'paid' AND DATE(paid_at AT TIME ZONE 'Africa/Cairo') = daily_stars.date) as actual_stars
FROM daily_stars
ORDER BY date DESC
LIMIT 7;
```

### 7. Last 7 Days Stats
```sql
-- Weekly performance
SELECT 
  DATE(paid_at AT TIME ZONE 'Africa/Cairo') as date,
  COUNT(*) as orders,
  SUM(stars) as stars,
  SUM(amount_usd) as revenue_usd,
  AVG(EXTRACT(EPOCH FROM (paid_at - created_at))/60) as avg_completion_minutes
FROM orders
WHERE status = 'paid'
  AND paid_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(paid_at AT TIME ZONE 'Africa/Cairo')
ORDER BY date DESC;
```

### 8. Average Completion Time
```sql
-- How long does it take to confirm orders?
SELECT 
  AVG(EXTRACT(EPOCH FROM (paid_at - created_at))) as avg_seconds,
  MIN(EXTRACT(EPOCH FROM (paid_at - created_at))) as min_seconds,
  MAX(EXTRACT(EPOCH FROM (paid_at - created_at))) as max_seconds,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (paid_at - created_at))) as median_seconds
FROM orders
WHERE status = 'paid'
  AND paid_at IS NOT NULL
  AND created_at IS NOT NULL
  AND paid_at > CURRENT_DATE - INTERVAL '7 days';
```

---

## 📜 Order History Queries

### 9. Recent Order Events
```sql
-- View order lifecycle events
SELECT 
  oh.id,
  oh.order_id,
  o.username,
  o.stars,
  oh.event_type,
  oh.payload,
  oh.created_at
FROM order_history oh
JOIN orders o ON oh.order_id = o.id
ORDER BY oh.created_at DESC
LIMIT 50;
```

### 10. Orders by Event Type
```sql
-- Count events by type
SELECT 
  event_type,
  COUNT(*) as count,
  MIN(created_at) as first_event,
  MAX(created_at) as last_event
FROM order_history
GROUP BY event_type
ORDER BY count DESC;
```

### 11. Orders Without Payment Verification Event
```sql
-- Orders marked paid but no history event (data integrity check)
SELECT 
  o.id,
  o.username,
  o.stars,
  o.status,
  o.paid_at
FROM orders o
WHERE o.status = 'paid'
  AND NOT EXISTS (
    SELECT 1 FROM order_history oh 
    WHERE oh.order_id = o.id 
      AND oh.event_type = 'payment_verified'
  )
LIMIT 20;
```

---

## 💸 Referral System Queries

### 12. Top Referrers
```sql
-- Who brings the most users?
SELECT 
  u.username,
  u.referral_code,
  u.total_referrals,
  u.total_earnings,
  u.available_balance,
  COUNT(DISTINCT o.id) as referred_paid_orders,
  SUM(o.stars) as total_referred_stars
FROM users u
LEFT JOIN orders o ON o.referred_by = u.username AND o.status = 'paid'
GROUP BY u.id, u.username, u.referral_code, u.total_referrals, u.total_earnings, u.available_balance
ORDER BY u.total_referrals DESC
LIMIT 20;
```

### 13. Referral Commissions Today
```sql
-- Commissions paid today
SELECT 
  u.username as referrer,
  re.commission_amount,
  re.stars_purchased,
  re.commission_percentage,
  o.username as buyer,
  re.created_at
FROM referral_earnings re
JOIN users u ON re.user_id = u.id
JOIN orders o ON re.order_id = o.id
WHERE DATE(re.created_at AT TIME ZONE 'Africa/Cairo') = DATE(CURRENT_TIMESTAMP AT TIME ZONE 'Africa/Cairo')
ORDER BY re.created_at DESC;
```

### 14. Duplicate Commission Check (Should Be Empty)
```sql
-- Check if any order has multiple commissions (data integrity)
SELECT 
  order_id,
  COUNT(*) as commission_count,
  SUM(commission_amount) as total_commission
FROM referral_earnings
GROUP BY order_id
HAVING COUNT(*) > 1;
```

### 15. Referral Earnings vs User Balance Check
```sql
-- Verify referral_earnings sum matches users.total_earnings
SELECT 
  u.username,
  u.total_earnings as user_total_earnings,
  COALESCE(SUM(re.commission_amount), 0) as calculated_earnings,
  u.total_earnings - COALESCE(SUM(re.commission_amount), 0) as difference
FROM users u
LEFT JOIN referral_earnings re ON re.user_id = u.id
GROUP BY u.id, u.username, u.total_earnings
HAVING ABS(u.total_earnings - COALESCE(SUM(re.commission_amount), 0)) > 0.01
ORDER BY difference DESC;
```

---

## 🔍 Data Integrity Checks

### 16. Orders Without Reference Code (Old Orders)
```sql
-- Legacy orders before refactoring
SELECT 
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest,
  SUM(stars) as total_stars
FROM orders
WHERE reference_code IS NULL;
```

### 17. Orders Without Market Payload
```sql
-- Orders that can't be verified by TON watcher
SELECT 
  id,
  username,
  stars,
  status,
  created_at,
  reference_code
FROM orders
WHERE status = 'pending'
  AND (market_payload IS NULL OR market_payload = '')
ORDER BY created_at DESC
LIMIT 20;
```

### 18. Paid Orders Without TX Hash
```sql
-- Orders marked paid but no blockchain tx (data quality)
SELECT 
  id,
  username,
  stars,
  status,
  paid_at,
  reference_code
FROM orders
WHERE status = 'paid'
  AND (tx_hash IS NULL OR tx_hash = '')
ORDER BY paid_at DESC
LIMIT 20;
```

### 19. Referral Earnings Without Paid Order
```sql
-- Commission applied but order not paid (should not happen)
SELECT 
  re.id,
  re.order_id,
  re.commission_amount,
  o.status as order_status,
  o.username
FROM referral_earnings re
JOIN orders o ON re.order_id = o.id
WHERE o.status != 'paid';
```

---

## 📈 Performance Queries

### 20. Busiest Hours (Cairo Time)
```sql
-- When do most orders come in?
SELECT 
  EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Cairo') as hour,
  COUNT(*) as orders,
  SUM(stars) as stars
FROM orders
WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Cairo')
ORDER BY orders DESC;
```

### 21. Database Size
```sql
-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
  pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### 22. Index Usage
```sql
-- Check if indexes are being used
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan as times_used,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;
```

---

## 🚨 Alert Queries

### 23. High-Value Stuck Orders
```sql
-- Large orders stuck in pending (needs attention)
SELECT 
  id,
  username,
  stars,
  amount_usd,
  reference_code,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_pending
FROM orders
WHERE status = 'pending'
  AND stars >= 100
  AND created_at > NOW() - INTERVAL '2 hours'
ORDER BY stars DESC;
```

### 24. Failed Payment Rate
```sql
-- What percentage of orders expire?
SELECT 
  COUNT(*) FILTER (WHERE status = 'paid') as paid_orders,
  COUNT(*) FILTER (WHERE status = 'expired') as expired_orders,
  COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_orders,
  COUNT(*) as total_orders,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'paid') / NULLIF(COUNT(*), 0), 2) as success_rate,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'expired') / NULLIF(COUNT(*), 0), 2) as expiry_rate
FROM orders
WHERE created_at > CURRENT_DATE - INTERVAL '7 days';
```

### 25. Unusual Activity Detection
```sql
-- Detect potential issues: too many pending, sudden drop in paid, etc.
WITH daily_stats AS (
  SELECT 
    DATE(created_at) as date,
    COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
    COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
    COUNT(*) FILTER (WHERE status = 'expired') as expired_count
  FROM orders
  WHERE created_at > CURRENT_DATE - INTERVAL '7 days'
  GROUP BY DATE(created_at)
)
SELECT 
  date,
  paid_count,
  pending_count,
  expired_count,
  CASE 
    WHEN pending_count > paid_count * 2 THEN '⚠️ Too many pending'
    WHEN expired_count > paid_count * 0.5 THEN '⚠️ High expiry rate'
    WHEN paid_count = 0 THEN '🚨 No successful orders'
    ELSE '✅ Normal'
  END as status
FROM daily_stats
ORDER BY date DESC;
```

---

## 🛠️ Maintenance Queries

### 26. Clean Up Old History (Use with Caution)
```sql
-- Archive or delete old order_history entries (keep last 90 days)
-- CAUTION: Run in a transaction, verify before committing
BEGIN;

DELETE FROM order_history
WHERE created_at < CURRENT_DATE - INTERVAL '90 days'
RETURNING id, order_id, event_type, created_at;

-- If looks good:
COMMIT;
-- If not:
-- ROLLBACK;
```

### 27. Manually Finalize Stuck Order (Admin Use)
```sql
-- If TON watcher missed an order and you have the tx_hash
-- You can manually update it (better: use finalizeOrderSuccess() in code)
BEGIN;

-- Lock and update order
UPDATE orders 
SET 
  status = 'paid',
  tx_hash = 'YOUR_TX_HASH_HERE',
  profit_tx_hash = 'YOUR_TX_HASH_HERE',
  updated_at = NOW(),
  paid_at = NOW()
WHERE id = YOUR_ORDER_ID
  AND status = 'pending'
RETURNING *;

-- Add history event
INSERT INTO order_history (order_id, event_type, payload, created_at)
VALUES (
  YOUR_ORDER_ID,
  'payment_verified',
  '{"method": "manual_admin", "tx_hash": "YOUR_TX_HASH_HERE"}'::jsonb,
  NOW()
);

-- Update daily_stars
INSERT INTO daily_stars (date, stars_total, orders_count, updated_at)
SELECT 
  DATE(NOW() AT TIME ZONE 'Africa/Cairo'),
  stars,
  1,
  NOW()
FROM orders WHERE id = YOUR_ORDER_ID
ON CONFLICT (date) DO UPDATE SET
  stars_total = daily_stars.stars_total + EXCLUDED.stars_total,
  orders_count = daily_stars.orders_count + 1,
  updated_at = NOW();

-- Apply referral commission if needed (check first)
-- ... (manual commission logic here if needed)

COMMIT;
```

### 28. Recompute Daily Stats (If Needed)
```sql
-- Rebuild daily_stars from orders table
TRUNCATE daily_stars;

INSERT INTO daily_stars (date, stars_total, orders_count, updated_at)
SELECT 
  DATE(paid_at AT TIME ZONE 'Africa/Cairo') as date,
  SUM(stars) as stars_total,
  COUNT(*) as orders_count,
  NOW() as updated_at
FROM orders
WHERE status = 'paid'
  AND paid_at IS NOT NULL
GROUP BY DATE(paid_at AT TIME ZONE 'Africa/Cairo')
ORDER BY date;
```

---

## 📊 Export Queries

### 29. Export Orders for Accounting
```sql
-- Export all paid orders with details
SELECT 
  id,
  username,
  stars,
  amount_usd,
  amount_ton,
  tx_hash,
  reference_code,
  referred_by,
  created_at AT TIME ZONE 'Africa/Cairo' as created_at_cairo,
  paid_at AT TIME ZONE 'Africa/Cairo' as paid_at_cairo,
  EXTRACT(EPOCH FROM (paid_at - created_at))/60 as completion_minutes
FROM orders
WHERE status = 'paid'
  AND paid_at >= '2026-02-01'
  AND paid_at < '2026-03-01'
ORDER BY paid_at;
```

### 30. Export Referral Commissions
```sql
-- Export commissions for payout
SELECT 
  u.username,
  u.full_name,
  u.telegram_id,
  SUM(re.commission_amount) as total_earned,
  u.available_balance,
  u.withdrawn_amount,
  COUNT(re.id) as commission_count
FROM users u
JOIN referral_earnings re ON re.user_id = u.id
WHERE re.created_at >= '2026-02-01'
  AND re.created_at < '2026-03-01'
GROUP BY u.id, u.username, u.full_name, u.telegram_id, u.available_balance, u.withdrawn_amount
HAVING SUM(re.commission_amount) > 0
ORDER BY total_earned DESC;
```

---

## 💡 Usage Tips

1. **Run queries in a transaction first**:
   ```sql
   BEGIN;
   -- your query
   SELECT * FROM ...;
   ROLLBACK; -- or COMMIT if you want to keep changes
   ```

2. **Add LIMIT for safety**:
   Always add `LIMIT` when testing queries that might return large results.

3. **Use EXPLAIN for slow queries**:
   ```sql
   EXPLAIN ANALYZE
   SELECT ...;
   ```

4. **Set timezone for consistency**:
   ```sql
   SET TIME ZONE 'Africa/Cairo';
   ```

---

**Save these queries for monitoring and troubleshooting! 📊🔍**

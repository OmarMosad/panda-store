# API Quick Reference Card

## 🎯 Core Endpoints

### 1. POST `/buy` - Create Order & Get Transaction
**Purpose**: Create a new order and get TON transaction payload.

**Request**:
```json
{
  "username": "john_doe",
  "quantity": 50
}
```

**Response**:
```json
{
  "transaction": {
    "validUntil": 1738454621,
    "messages": [
      {
        "address": "EQC...",
        "amount": "4500000000",
        "payload": "te6cc..."
      }
    ]
  },
  "orderId": 123,
  "referenceCode": "ORD-1738454321-A7B9C2"
}
```

**Rate Limited**: 20 requests/minute per IP  
**Use Case**: First step in purchase flow

---

### 2. POST `/confirm-order` - Confirm Payment
**Purpose**: Confirm order status after payment (idempotent).

**Request**:
```json
{
  "orderId": 123
  // OR
  "referenceCode": "ORD-1738454321-A7B9C2"
}
```

**Response**:
```json
{
  "success": true,
  "status": "pending",  // or "paid", "expired", "failed"
  "message": "Order confirmation received",
  "orderId": 123,
  "referenceCode": "ORD-1738454321-A7B9C2"
}
```

**Rate Limited**: 20 requests/minute per IP  
**Use Case**: After user sends payment via TonConnect  
**Idempotent**: Safe to call multiple times

---

### 3. GET `/api/stats` - Statistics
**Purpose**: Get marketplace statistics.

**Response**:
```json
{
  "totalStars": 150000,
  "starsToday": 5000,
  "starsYesterday": 4500,
  "avgCompletionTime": 51
}
```

**Notes**:
- Only counts orders with `status='paid'`
- Uses `paid_at` timestamp (Cairo timezone)
- Backed by `daily_stars` table

---

## 👥 Referral System Endpoints

### 4. POST `/api/user/register` - Register/Update User
**Request**:
```json
{
  "telegramId": 123456789,
  "username": "john_doe",
  "fullName": "John Doe",
  "photoUrl": "https://...",
  "referredBy": "jane_smith"  // optional
}
```

**Response**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "john_doe",
    "fullName": "John Doe",
    "photoUrl": "https://...",
    "referralCode": "john_doe",
    "totalEarnings": 0.00,
    "availableBalance": 0.00,
    "totalReferrals": 0
  }
}
```

---

### 5. GET `/api/user/:identifier` - Get User Details
**Parameters**: `identifier` can be username or telegram_id

**Response**:
```json
{
  "success": true,
  "user": {
    "id": 1,
    "username": "john_doe",
    "referralCode": "john_doe",
    "totalEarnings": 12.50,
    "availableBalance": 10.00,
    "withdrawnAmount": 2.50,
    "totalReferrals": 15,
    "totalReferredPurchases": 2500,
    "userOwnPurchases": 500,
    "level": "Bronze",
    "commissionRate": 1.0
  },
  "referrals": [
    {
      "username": "referred_user1",
      "fullName": "User One",
      "totalStars": 100,
      "ordersCount": 2,
      "totalEarnings": 0.56,
      "lastOrder": "2026-02-01T10:30:00Z"
    }
  ],
  "earnings": [
    {
      "id": 1,
      "buyerUsername": "referred_user1",
      "starsPurchased": 50,
      "commissionPercentage": 1.0,
      "commissionAmount": 0.28,
      "createdAt": "2026-02-01T10:30:00Z"
    }
  ]
}
```

---

### 6. POST `/api/withdraw` - Request Withdrawal
**Request**:
```json
{
  "username": "john_doe",
  "amount": 10.00,
  "walletAddress": "EQC..."
}
```

**Response**:
```json
{
  "success": true,
  "withdrawal": {
    "id": 1,
    "amount": 10.00,
    "status": "pending",
    "createdAt": "2026-02-01T10:30:00Z"
  }
}
```

---

### 7. GET `/api/user/:username/orders` - Get User Orders
**Response**:
```json
{
  "success": true,
  "orders": [
    {
      "id": 123,
      "stars": 50,
      "amountTon": 0.015,
      "amountUsd": 0.80,
      "referenceCode": "ORD-1738454321-A7B9C2",
      "status": "paid",
      "createdAt": "2026-02-01T10:00:00Z",
      "paidAt": "2026-02-01T10:01:30Z",
      "isAutomatic": false,
      "referredBy": "referrer_user"
    }
  ],
  "totalOrders": 1
}
```

---

## 🛠️ Internal Functions Reference

### `finalizeOrderSuccess(orderId, txHash, verificationMethod)`
**Purpose**: Atomically finalize a paid order (SINGLE SOURCE OF TRUTH)

**Parameters**:
- `orderId` (number): The order ID to finalize
- `txHash` (string): Blockchain transaction hash
- `verificationMethod` (string): How payment was verified ('ton_watcher', 'manual_confirm', etc.)

**Returns**:
```javascript
{
  success: true,
  message: "Order finalized successfully",
  order: { ... },
  alreadyPaid: false  // true if already finalized (idempotent)
}
```

**What it does**:
1. BEGIN transaction
2. Lock order row (SELECT FOR UPDATE)
3. Check if already paid (idempotency)
4. Update order to paid
5. Insert order_history event
6. Update daily_stars (UPSERT)
7. Apply referral commission (if not already applied)
8. COMMIT transaction
9. Send admin notification

**Use Cases**:
- Called by TON Watcher when payment detected
- Can be called manually for admin confirmations
- Called by confirm-order if real-time verification implemented

---

### `checkProfitTransactions()`
**Purpose**: TON Blockchain watcher - checks for payments

**Runs**: Every 60 seconds

**Process**:
1. Fetch pending orders with `market_payload` (last 1 hour)
2. Fetch last 100 transactions from PROFIT_WALLET
3. For each order, try multiple matching strategies:
   - Exact payload match
   - Normalized payload match
   - Substring match
   - Reference code match in comment
4. When match found: call `finalizeOrderSuccess()`

---

### `expireOldPendingOrders()`
**Purpose**: Expire orders older than 1 hour

**Runs**: Every 5 minutes

**Process**:
1. BEGIN transaction
2. Find pending orders > 1 hour old (SELECT FOR UPDATE)
3. Update to `status='expired'`
4. Insert order_history events
5. COMMIT transaction

---

## 📊 Database Tables

### `orders`
Key columns:
- `id` (PK)
- `username`
- `stars`
- `amount_usd`, `amount_ton`
- `reference_code` (UNIQUE)
- `status` ('pending', 'paid', 'expired', 'failed')
- `market_payload` (for matching)
- `tx_hash` (blockchain tx)
- `referred_by`
- `created_at`, `updated_at`, `paid_at`

### `order_history`
Tracks all order events:
- `id` (PK)
- `order_id` (FK)
- `event_type` ('created', 'payment_verified', 'paid', 'expired')
- `payload` (JSONB - event details)
- `created_at`

### `daily_stars`
Daily statistics cache:
- `date` (PK)
- `stars_total`
- `orders_count`
- `updated_at`

### `users`, `referral_earnings`, `withdrawals`
(Unchanged from before - referral system)

---

## 🔒 Security Features

### Rate Limiting
- **Window**: 60 seconds
- **Max Requests**: 20 per IP per window
- **Applies to**: `/buy`, `/confirm-order`
- **Response**: HTTP 429 when exceeded

### SQL Injection Protection
- All queries use parameterized statements
- Example: `pool.query('SELECT * FROM orders WHERE id = $1', [orderId])`

### Transaction Safety
- All critical operations wrapped in transactions
- Automatic rollback on error
- Row-level locking prevents race conditions

---

## 🎨 Status Codes

| Status | Meaning |
|--------|---------|
| `pending` | Order created, awaiting payment |
| `paid` | Payment confirmed, order complete |
| `expired` | Payment not received within 1 hour |
| `failed` | Order creation or processing failed |

---

## ⏱️ Timings

| Operation | Typical Time |
|-----------|--------------|
| Order creation (`/buy`) | 500-1000ms |
| Order confirmation (`/confirm-order`) | 50-100ms |
| TON Watcher check interval | 60 seconds |
| Payment confirmation (average) | 60-120 seconds |
| Order expiration | After 1 hour |
| Expiration job interval | 5 minutes |

---

## 🐛 Common Error Codes

| Code | Message | Cause |
|------|---------|-------|
| 400 | Missing required fields | Invalid request body |
| 404 | Order not found | Invalid orderId/referenceCode |
| 422 | Invalid input | Bad username/quantity format |
| 429 | Too many requests | Rate limit exceeded |
| 500 | Internal server error | Server/database error |

---

## 📝 Logging Patterns

Look for these in logs:

### Success Patterns:
```
💾 Pre-payment order created! ID: 123, Ref: ORD-...
✅ Saved market_payload for order #123
🔍 TON Watcher: Checking X pending orders...
   └─ ✅ EXACT PAYLOAD MATCH!
✅ Order #123 FINALIZED successfully via ton_watcher
💰 Commission applied: @user earned $0.56
```

### Error Patterns:
```
❌ Database connection error
❌ Failed to save pre-payment order
❌ TON Watcher: Missing PROFIT_WALLET
⚠️ Could not calculate profit
⏳ Order #123: No matching TX found yet
```

---

## 🔄 State Diagram

```
[Created: pending]
       ↓
   [Payment]
       ↓
   ┌───┴───┐
   ↓       ↓
[paid]  [expired]
           ↓
      (after 1h)
```

---

## 💡 Quick Troubleshooting

| Issue | Check | Solution |
|-------|-------|----------|
| Orders stuck pending | TON Watcher logs | Verify PROFIT_WALLET and TONAPI_KEY |
| Stats not updating | daily_stars table | Check if orders have paid_at set |
| Duplicate commissions | referral_earnings | Should not happen (idempotent) |
| Rate limit errors | Request frequency | Reduce requests or increase limit |

---

## 📚 Example Frontend Flow

```javascript
// 1. Create order
const { transaction, orderId, referenceCode } = 
  await fetch('/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'john_doe', quantity: 50 })
  }).then(r => r.json());

// 2. Send payment
await tonConnectUI.sendTransaction(transaction);

// 3. Confirm
const result = await fetch('/confirm-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ orderId })
}).then(r => r.json());

// 4. Handle result
if (result.status === 'paid') {
  showSuccess();
} else if (result.status === 'pending') {
  // Poll every 10s
  const interval = setInterval(async () => {
    const status = await fetch('/confirm-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId })
    }).then(r => r.json());
    
    if (status.status === 'paid') {
      clearInterval(interval);
      showSuccess();
    }
  }, 10000);
}
```

---

**Keep this reference card handy during development! 📌**

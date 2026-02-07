# System Architecture Diagrams

## 🏗️ Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  (React/HTML + TonConnect)                                      │
└───────────────┬─────────────────────────────────────────────────┘
                │
                │ 1. POST /buy
                │ 2. tonConnectUI.sendTransaction()
                │ 3. POST /confirm-order
                │
┌───────────────▼─────────────────────────────────────────────────┐
│                     EXPRESS SERVER                              │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  /buy       │  │ /confirm-    │  │ /api/stats   │         │
│  │  endpoint   │  │  order       │  │              │         │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                │                  │                  │
│         │                │                  │                  │
│  ┌──────▼────────────────▼──────────────────▼───────┐         │
│  │         PostgreSQL Database                      │         │
│  │  - orders                                        │         │
│  │  - order_history                                 │         │
│  │  - daily_stars                                   │         │
│  │  - users, referral_earnings, withdrawals        │         │
│  └──────────────────────────────────────────────────┘         │
│                                                                 │
│  ┌──────────────────────────────────────────────────┐         │
│  │      TON Blockchain Watcher (every 60s)          │         │
│  │                                                   │         │
│  │  1. Fetch pending orders                         │         │
│  │  2. Check blockchain via TON API                 │         │
│  │  3. Match transactions                           │         │
│  │  4. Call finalizeOrderSuccess()                  │         │
│  └──────────────────────────────────────────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                │
                │ Queries blockchain
                │
┌───────────────▼─────────────────────────────────────────────────┐
│                   TON Blockchain                                │
│            (via TONAPI.io)                                      │
│                                                                 │
│  - Transaction verification                                     │
│  - Payload matching                                             │
│  - PROFIT_WALLET monitoring                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Order Creation & Payment Flow

```
┌─────────┐
│  User   │
└────┬────┘
     │
     │ 1. Click "Buy Stars"
     │
┌────▼────────────────────────────────────────────────────────────┐
│  FRONTEND                                                       │
│                                                                 │
│  POST /buy { username, quantity }                              │
└────┬────────────────────────────────────────────────────────────┘
     │
     │
┌────▼────────────────────────────────────────────────────────────┐
│  BACKEND: /buy endpoint                                         │
│                                                                 │
│  1. Validate input                                              │
│  2. Generate reference_code (unique)                            │
│  3. Calculate profit                                            │
│  4. Get referred_by from users table                            │
│  5. ╔═══════════════════════════════════╗                      │
│     ║ INSERT INTO orders               ║                      │
│     ║   - status = 'pending'           ║                      │
│     ║   - reference_code (unique)      ║                      │
│     ║   - created_at = NOW()           ║                      │
│     ║ RETURNING id                     ║                      │
│     ╚═══════════════════════════════════╝                      │
│  6. Call MarketApp API                                          │
│  7. Save market_payload                                         │
│  8. Return { transaction, orderId, referenceCode }              │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ Returns transaction payload
     │
┌────▼────────────────────────────────────────────────────────────┐
│  FRONTEND                                                       │
│                                                                 │
│  1. Save orderId to localStorage                                │
│  2. tonConnectUI.sendTransaction(transaction)                   │
│     ┌──────────────────────────────────┐                       │
│     │  User approves in TON Wallet     │                       │
│     │  Transaction sent to blockchain  │                       │
│     └──────────────────────────────────┘                       │
│  3. POST /confirm-order { orderId }                             │
└────┬────────────────────────────────────────────────────────────┘
     │
     │
┌────▼────────────────────────────────────────────────────────────┐
│  BACKEND: /confirm-order endpoint                               │
│                                                                 │
│  1. Load order by orderId or referenceCode                      │
│  2. If already 'paid' → return success (idempotent)             │
│  3. If 'pending' → return pending status                        │
│  4. Frontend can poll this endpoint                             │
└────┬────────────────────────────────────────────────────────────┘
     │
     │ (Meanwhile, every 60 seconds...)
     │
┌────▼────────────────────────────────────────────────────────────┐
│  TON WATCHER (Background Job)                                   │
│                                                                 │
│  Every 60 seconds:                                              │
│  1. Fetch pending orders (last 1 hour)                          │
│  2. Fetch recent transactions from PROFIT_WALLET                │
│  3. For each order:                                             │
│     ┌───────────────────────────────────────┐                  │
│     │ Try multiple matching strategies:    │                  │
│     │  - Exact payload match               │                  │
│     │  - Normalized payload                │                  │
│     │  - Substring match                   │                  │
│     │  - Reference code in comment         │                  │
│     └───────────────────────────────────────┘                  │
│  4. If match found:                                             │
│     ▼                                                           │
│     Call finalizeOrderSuccess(orderId, txHash, 'ton_watcher')   │
└─────────────────────────────────────────────────────────────────┘
```

---

## ⚡ finalizeOrderSuccess() - Core Function Flow

```
┌──────────────────────────────────────────────────────────────────┐
│  finalizeOrderSuccess(orderId, txHash, verificationMethod)      │
└───────────────────────────┬──────────────────────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  BEGIN TRANS   │
                    └───────┬────────┘
                            │
        ┌───────────────────▼───────────────────┐
        │  SELECT * FROM orders                 │
        │  WHERE id = orderId                   │
        │  FOR UPDATE  ← LOCK ROW               │
        └───────────────────┬───────────────────┘
                            │
        ┌───────────────────▼───────────────────┐
        │  if status == 'paid':                 │
        │    COMMIT                             │
        │    return success (idempotent) ──────────┐
        └───────────────────┬───────────────────┘  │
                            │                       │
        ┌───────────────────▼───────────────────┐  │
        │  UPDATE orders SET                    │  │
        │    status = 'paid',                   │  │
        │    tx_hash = txHash,                  │  │
        │    profit_tx_hash = txHash,           │  │
        │    updated_at = NOW(),                │  │
        │    paid_at = NOW()                    │  │
        │  WHERE id = orderId                   │  │
        └───────────────────┬───────────────────┘  │
                            │                       │
        ┌───────────────────▼───────────────────┐  │
        │  INSERT INTO order_history            │  │
        │    event_type = 'payment_verified'    │  │
        │    payload = {txHash, method, ...}    │  │
        └───────────────────┬───────────────────┘  │
                            │                       │
        ┌───────────────────▼───────────────────┐  │
        │  UPSERT daily_stars                   │  │
        │  ON CONFLICT (date) DO UPDATE         │  │
        │    stars_total += order.stars         │  │
        │    orders_count += 1                  │  │
        └───────────────────┬───────────────────┘  │
                            │                       │
        ┌───────────────────▼───────────────────┐  │
        │  if order.referred_by:                │  │
        │    Check referral_earnings            │  │
        │    if NOT already applied:            │  │
        │      - Calculate commission           │  │
        │      - INSERT referral_earnings       │  │
        │      - UPDATE users balance           │  │
        └───────────────────┬───────────────────┘  │
                            │                       │
                    ┌───────▼────────┐              │
                    │  COMMIT TRANS  │              │
                    └───────┬────────┘              │
                            │                       │
        ┌───────────────────▼───────────────────┐  │
        │  Send admin Telegram notification    │  │
        │  (outside transaction)                │  │
        └───────────────────┬───────────────────┘  │
                            │                       │
                            ▼                       │
                    ┌──────────────┐                │
                    │ Return       │◄───────────────┘
                    │ success: true│
                    └──────────────┘
```

---

## 📊 Database Schema Relationships

```
┌────────────────────────────────────────────────────────────────┐
│                         orders                                 │
├────────────────────────────────────────────────────────────────┤
│ id (PK)                                                        │
│ username                                                       │
│ stars                                                          │
│ reference_code (UNIQUE) ◄──────────────┐                      │
│ status ('pending'|'paid'|'expired')     │                      │
│ market_payload                          │                      │
│ tx_hash                                 │                      │
│ referred_by                             │                      │
│ created_at                              │                      │
│ paid_at                                 │                      │
└────┬───────────────────────────────────┬┘                      │
     │                                   │                       │
     │                                   │                       │
     │                         ┌─────────▼──────────┐            │
     │                         │  order_history     │            │
     │                         ├────────────────────┤            │
     │                         │ id (PK)            │            │
     │                         │ order_id (FK) ─────┤            │
     │                         │ event_type         │            │
     │                         │ payload (JSONB)    │            │
     │                         │ created_at         │            │
     │                         └────────────────────┘            │
     │                                                            │
     │                         ┌────────────────────┐            │
     │                         │   daily_stars      │            │
     │                         ├────────────────────┤            │
     │                         │ date (PK)          │            │
     │    Updated by ──────────► stars_total        │            │
     │    finalization         │ orders_count       │            │
     │                         │ updated_at         │            │
     │                         └────────────────────┘            │
     │                                                            │
     │                         ┌────────────────────┐            │
     │                         │   users            │            │
     │                         ├────────────────────┤            │
     │                         │ id (PK)            │            │
     │    referred_by ─────────► username           │            │
     │                         │ referral_code      │            │
     │                         │ total_earnings     │            │
     │                         │ available_balance  │            │
     │                         └────┬───────────────┘            │
     │                              │                             │
     │                              │                             │
┌────▼──────────────────────────────▼─────────────────┐          │
│              referral_earnings                      │          │
├─────────────────────────────────────────────────────┤          │
│ id (PK)                                             │          │
│ user_id (FK) ───────────────────────────────────────┘          │
│ order_id (FK) ──────────────────────────────────────────────────┘
│ stars_purchased                                     
│ commission_percentage                               
│ commission_amount                                   
│ created_at                                          
└─────────────────────────────────────────────────────┘
```

---

## 🔒 Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT REQUEST                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────▼──────────────┐
        │  Layer 1: CORS Check         │
        │  - Whitelist origins only    │
        └───────────────┬──────────────┘
                        │
        ┌───────────────▼──────────────┐
        │  Layer 2: Rate Limiting      │
        │  - 20 req/min per IP         │
        │  - Returns 429 if exceeded   │
        └───────────────┬──────────────┘
                        │
        ┌───────────────▼──────────────┐
        │  Layer 3: Input Validation   │
        │  - Type checking             │
        │  - Required fields           │
        │  - Format validation         │
        └───────────────┬──────────────┘
                        │
        ┌───────────────▼──────────────┐
        │  Layer 4: SQL Injection      │
        │  Protection                  │
        │  - Parameterized queries     │
        │  - No string concatenation   │
        └───────────────┬──────────────┘
                        │
        ┌───────────────▼──────────────┐
        │  Layer 5: Transaction        │
        │  Isolation                   │
        │  - BEGIN/COMMIT/ROLLBACK     │
        │  - Row-level locking         │
        └───────────────┬──────────────┘
                        │
        ┌───────────────▼──────────────┐
        │  Layer 6: Idempotency        │
        │  - Safe retries              │
        │  - State checking            │
        └───────────────┬──────────────┘
                        │
                        ▼
            ┌──────────────────┐
            │   SAFE RESPONSE  │
            └──────────────────┘
```

---

## 🕐 Background Jobs Timeline

```
Server Start
    │
    ├─► Initialize Database (immediate)
    │   └─► Create tables, add columns, create indexes
    │
    ├─► Activate Telegram Webhook (immediate)
    │
    ├─► TON Watcher (after 2 seconds)
    │   └─► Then every 60 seconds
    │       ├─► Fetch pending orders
    │       ├─► Check blockchain
    │       └─► Finalize matched orders
    │
    └─► Order Expiration Job (every 5 minutes)
        └─► Expire orders older than 1 hour


Timeline View:
─────────────────────────────────────────────────────────────►
0s    2s        60s       120s      180s      240s      300s

│     │         │         │         │         │         │
│     ▼         ▼         ▼         ▼         ▼         ▼
│   Watcher   Watcher   Watcher   Watcher   Watcher   Watcher
│   Check     Check     Check     Check     Check     Check
│                                                     
└─────────────────────────────────────────────────────▼────────
                                              Expiration Job
```

---

## 🔄 Order State Machine

```
                    ┌─────────────┐
                    │   CREATED   │
                    │             │
                    │ status=NULL │
                    └──────┬──────┘
                           │
                           │ POST /buy
                           │
                    ┌──────▼──────┐
          ┌─────────┤   PENDING   │
          │         │             │
          │         │ Waiting for │
          │         │  payment    │
          │         └──────┬──────┘
          │                │
          │                ├──────────┐
          │                │          │
   After 1 hour      Payment found    │
   (Expiration       (TON Watcher)    │
    Job)                  │           │
          │               │           │
          │        ┌──────▼──────┐    │
          │        │    PAID     │    │ POST /confirm-order
          │        │             │    │ (polls status)
          │        │  Complete!  │    │
          │        └─────────────┘    │
          │                           │
          │                           │
   ┌──────▼──────┐                    │
   │   EXPIRED   │◄───────────────────┘
   │             │     If timeout
   │  Timeout!   │
   └─────────────┘


Status Transitions:
- NULL → pending (order created)
- pending → paid (payment confirmed)
- pending → expired (timeout after 1 hour)
- paid → paid (idempotent, no change)
```

---

## 📈 Statistics Aggregation Flow

```
Order Finalized (status → 'paid')
        │
        │ Within finalizeOrderSuccess()
        │
        ▼
┌────────────────────────────────────────┐
│  Calculate date in Cairo timezone      │
│  date = DATE(paid_at AT TIME ZONE      │
│              'Africa/Cairo')           │
└────────────┬───────────────────────────┘
             │
             ▼
┌────────────────────────────────────────┐
│  UPSERT INTO daily_stars               │
│  ON CONFLICT (date)                    │
│  DO UPDATE SET                         │
│    stars_total += order.stars,         │
│    orders_count += 1,                  │
│    updated_at = NOW()                  │
└────────────┬───────────────────────────┘
             │
             │ Later...
             │
             ▼
┌────────────────────────────────────────┐
│  GET /api/stats                        │
│                                        │
│  SELECT stars_total                    │
│  FROM daily_stars                      │
│  WHERE date = TODAY                    │
│                                        │
│  (Fast query - pre-aggregated)        │
└────────────┬───────────────────────────┘
             │
             ▼
     Return to client
```

---

**These diagrams provide a visual understanding of the refactored system architecture! 📊**

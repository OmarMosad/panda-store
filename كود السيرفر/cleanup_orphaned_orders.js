/**
 * Cleanup Script - Remove Orphaned Pending Orders
 * هذا السكريبت يحذف الطلبات المعلقة التي فشل MarketApp API فيها
 * يجب تشغيله بعد كل مشكلة لتنظيف قاعدة البيانات
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function cleanupOrphanedOrders() {
  const client = await pool.connect();
  
  try {
    console.log('🔍 Searching for orphaned pending orders...\n');
    
    // Find pending orders WITHOUT market_payload (MarketApp failed)
    const orphanedResult = await client.query(`
      SELECT id, username, stars, reference_code, created_at
      FROM orders
      WHERE status = 'pending'
        AND market_payload IS NULL
        AND created_at > NOW() - INTERVAL '24 hours'
      ORDER BY created_at DESC
    `);
    
    if (orphanedResult.rows.length === 0) {
      console.log('✅ No orphaned orders found!');
      return;
    }
    
    console.log(`❌ Found ${orphanedResult.rows.length} orphaned orders:\n`);
    orphanedResult.rows.forEach(order => {
      console.log(`  • Order #${order.id} - ${order.username} - ${order.stars} stars`);
      console.log(`    Reference: ${order.reference_code}`);
      console.log(`    Created: ${order.created_at}\n`);
    });
    
    // Ask for confirmation (in production, you might want to auto-delete)
    console.log('🗑️ Deleting orphaned orders...\n');
    
    await client.query('BEGIN');
    
    // Delete from order_history first (foreign key)
    const deleteHistoryResult = await client.query(`
      DELETE FROM order_history
      WHERE order_id IN (
        SELECT id FROM orders
        WHERE status = 'pending'
          AND market_payload IS NULL
          AND created_at > NOW() - INTERVAL '24 hours'
      )
    `);
    
    // Then delete orders
    const deleteOrdersResult = await client.query(`
      DELETE FROM orders
      WHERE status = 'pending'
        AND market_payload IS NULL
        AND created_at > NOW() - INTERVAL '24 hours'
    `);
    
    await client.query('COMMIT');
    
    console.log(`✅ Cleanup completed!`);
    console.log(`   - Deleted ${deleteHistoryResult.rowCount} history entries`);
    console.log(`   - Deleted ${deleteOrdersResult.rowCount} orphaned orders\n`);
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Cleanup failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run cleanup
cleanupOrphanedOrders()
  .then(() => {
    console.log('✅ Script finished successfully');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Script failed:', err);
    process.exit(1);
  });

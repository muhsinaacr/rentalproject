// migrate_fix_payments.js
// Run once from rentmate-backend folder:  node migrate_fix_payments.js
//
// Fixes the payments table so it has ALL columns that subscriptions.js,
// contacts.js, listings.js and admin.js expect.
// Safe to run multiple times — checks existence before each change.

require('dotenv').config()
const db = require('./db')

async function colExists(table, col) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, col]
  )
  return r[0].c > 0
}

async function run() {
  console.log('\n── Fixing payments table columns ────────────────────────\n')

  // 1. Rename payment_method → method (old schema used payment_method, code uses method)
  const hasPaymentMethod = await colExists('payments', 'payment_method')
  const hasMethod        = await colExists('payments', 'method')

  if (hasPaymentMethod && !hasMethod) {
    await db.query('ALTER TABLE payments CHANGE payment_method method VARCHAR(100) DEFAULT NULL')
    console.log('  ✓ Renamed payment_method → method')
  } else if (hasMethod) {
    console.log('  – method column already exists')
  } else {
    await db.query('ALTER TABLE payments ADD COLUMN method VARCHAR(100) DEFAULT NULL')
    console.log('  ✓ Added method column')
  }

  // 2. Add subscription_id (FK to subscriptions, used by subscriptions.js + admin JOIN)
  if (await colExists('payments', 'subscription_id')) {
    console.log('  – subscription_id already exists')
  } else {
    await db.query('ALTER TABLE payments ADD COLUMN subscription_id INT DEFAULT NULL')
    console.log('  ✓ Added subscription_id column')
  }

  // 3. Add razorpay_order_id
  if (await colExists('payments', 'razorpay_order_id')) {
    console.log('  – razorpay_order_id already exists')
  } else {
    await db.query('ALTER TABLE payments ADD COLUMN razorpay_order_id VARCHAR(255) DEFAULT NULL')
    console.log('  ✓ Added razorpay_order_id column')
  }

  // 4. Add razorpay_payment_id
  if (await colExists('payments', 'razorpay_payment_id')) {
    console.log('  – razorpay_payment_id already exists')
  } else {
    await db.query('ALTER TABLE payments ADD COLUMN razorpay_payment_id VARCHAR(255) DEFAULT NULL')
    console.log('  ✓ Added razorpay_payment_id column')
  }

  // 5. Add razorpay_signature
  if (await colExists('payments', 'razorpay_signature')) {
    console.log('  – razorpay_signature already exists')
  } else {
    await db.query('ALTER TABLE payments ADD COLUMN razorpay_signature VARCHAR(512) DEFAULT NULL')
    console.log('  ✓ Added razorpay_signature column')
  }

  // 6. Add plan (used by subscriptions JOIN in admin query)
  if (await colExists('payments', 'plan')) {
    console.log('  – plan column already exists')
  } else {
    await db.query('ALTER TABLE payments ADD COLUMN plan VARCHAR(100) DEFAULT NULL')
    console.log('  ✓ Added plan column')
  }

  // 7. Add description (used by contact unlock + listing boost payments)
  if (await colExists('payments', 'description')) {
    console.log('  – description column already exists')
  } else {
    await db.query('ALTER TABLE payments ADD COLUMN description TEXT DEFAULT NULL')
    console.log('  ✓ Added description column')
  }

  console.log('\n✅ payments table is now fully compatible.\n')
  process.exit(0)
}

run().catch(err => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
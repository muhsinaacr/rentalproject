// migrate_fix_views.js
// Run ONCE from rentmate-backend folder:  node migrate_fix_views.js
//
// Fixes inflated "Total Views" count on Owner Dashboard by:
//   1. Removing duplicate listing_views rows (keeps earliest per user+listing)
//   2. Adding a UNIQUE constraint so duplicates can never be inserted again
//
// Fully idempotent — safe to run multiple times.

require('dotenv').config()
const db = require('./db')

async function columnExists(table, column) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )
  return r[0].c > 0
}

async function indexExists(table, indexName) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  )
  return r[0].c > 0
}

async function run() {
  console.log('\n── Fix listing_views duplicates ─────────────────────────────\n')

  // ── Step 1: Count duplicates before cleanup ──────────────────────────────
  const [[{ total }]] = await db.query('SELECT COUNT(*) AS total FROM listing_views')
  const [[{ distinct_pairs }]] = await db.query(
    'SELECT COUNT(DISTINCT user_id, listing_id) AS distinct_pairs FROM listing_views'
  )
  const duplicates = total - distinct_pairs
  console.log(`  Total rows      : ${total}`)
  console.log(`  Distinct pairs  : ${distinct_pairs}`)
  console.log(`  Duplicate rows  : ${duplicates}`)

  // ── Step 2: Delete duplicate rows, keep earliest per (user_id, listing_id) ──
  if (duplicates > 0) {
    await db.query(`
      DELETE lv1 FROM listing_views lv1
      INNER JOIN listing_views lv2
        ON lv1.user_id    = lv2.user_id
       AND lv1.listing_id = lv2.listing_id
       AND lv1.id > lv2.id
    `)
    console.log(`  ✓ Removed ${duplicates} duplicate row(s)`)
  } else {
    console.log('  – No duplicates found, skipping cleanup')
  }

  // ── Step 3: Add UNIQUE constraint if not already present ─────────────────
  if (await indexExists('listing_views', 'uq_user_listing')) {
    console.log('  – UNIQUE KEY uq_user_listing already exists')
  } else {
    await db.query(
      'ALTER TABLE listing_views ADD UNIQUE KEY uq_user_listing (user_id, listing_id)'
    )
    console.log('  ✓ Added UNIQUE KEY uq_user_listing (user_id, listing_id)')
  }

  // ── Step 4: Verify final state ────────────────────────────────────────────
  const [[{ final }]] = await db.query('SELECT COUNT(*) AS final FROM listing_views')
  console.log(`\n  Final row count : ${final}  (= unique views)`)
  console.log('\n✅ Fix complete — Total Views on Owner Dashboard is now accurate!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
// migrate_fix_reports_unique.js
// Run ONCE from rentmate-backend folder:  node migrate_fix_reports_unique.js
//
// The unique constraints uq_pending_user and uq_pending_listing on admin_reports
// block resolving/suspending a user who already has a previous resolved report,
// because MySQL treats (reporter_id, target_user_id, 'resolved') as a duplicate
// when a second report for the same pair gets resolved.
//
// This migration drops those two constraints so multiple reports between the
// same reporter and target can all be resolved independently.

require('dotenv').config()
const db = require('./db')

async function indexExists(table, indexName) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND INDEX_NAME   = ?`,
    [table, indexName]
  )
  return rows[0].c > 0
}

async function run() {
  console.log('\n── Fix admin_reports unique constraints ─────────────────────')

  if (await indexExists('admin_reports', 'uq_pending_user')) {
    await db.query('ALTER TABLE admin_reports DROP INDEX uq_pending_user')
    console.log('  ✓ Dropped uq_pending_user')
  } else {
    console.log('  – uq_pending_user already gone')
  }

  if (await indexExists('admin_reports', 'uq_pending_listing')) {
    await db.query('ALTER TABLE admin_reports DROP INDEX uq_pending_listing')
    console.log('  ✓ Dropped uq_pending_listing')
  } else {
    console.log('  – uq_pending_listing already gone')
  }

  console.log('\n✅ Migration complete — reports can now be resolved freely.\n')
  process.exit(0)
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
// Run ONCE: node migrate_visits.js
require('dotenv').config()
const db = require('./db')

async function run() {
  console.log('\n── Fixing visits table ──────────────────────────────')

  try {
    await db.query(`
      ALTER TABLE visits
      MODIFY COLUMN status ENUM('pending','approved','rejected','cancelled','confirmed','completed')
      DEFAULT 'pending'
    `)
    console.log('  ✓ status ENUM updated (added approved, cancelled)')
  } catch (e) {
    console.log('  – status ENUM:', e.message)
  }

  const [cols] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='visits' AND COLUMN_NAME='updated_at'`
  )
  if (cols[0].c === 0) {
    await db.query(
      `ALTER TABLE visits ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    )
    console.log('  ✓ updated_at column added')
  } else {
    console.log('  – updated_at already exists')
  }

  const [migrated] = await db.query(
    `UPDATE visits SET status = 'approved' WHERE status = 'confirmed'`
  )
  if (migrated.affectedRows > 0) {
    console.log(`  ✓ Migrated ${migrated.affectedRows} 'confirmed' → 'approved'`)
  }

  console.log('\n✅ Done!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('Migration failed:', e.message)
  process.exit(1)
})
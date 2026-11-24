// migrate_support_flag.js
// Run ONCE: node migrate_support_flag.js
// Adds is_flagged column to support_queries for the Pin/Flag urgent feature.

require('dotenv').config()
const db = require('./db')

async function columnExists(table, column) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, column]
  )
  return r[0].c > 0
}

async function run() {
  console.log('\n── Adding is_flagged to support_queries ──────────────────')
  if (await columnExists('support_queries', 'is_flagged')) {
    console.log('  – is_flagged already exists, skipping')
  } else {
    await db.query(
      `ALTER TABLE support_queries
       ADD COLUMN is_flagged TINYINT(1) NOT NULL DEFAULT 0,
       ADD INDEX idx_is_flagged (is_flagged)`
    )
    console.log('  ✓ Added is_flagged column')
  }
  console.log('\n🎉 Migration complete!')
  process.exit(0)
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
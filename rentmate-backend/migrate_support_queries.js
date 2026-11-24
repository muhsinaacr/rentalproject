// migrate_support_queries.js
// Run ONCE from rentmate-backend folder:  node migrate_support_queries.js
// Creates the support_queries table for the "Contact Us" feature.

require('dotenv').config()
const db = require('./db')

async function tableExists(table) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
    [table]
  )
  return r[0].c > 0
}

async function run() {
  console.log('\n── support_queries table ─────────────────────────────────')
  if (await tableExists('support_queries')) {
    console.log('  – support_queries already exists')
  } else {
    await db.query(`
      CREATE TABLE support_queries (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        user_role    ENUM('seeker', 'owner') NOT NULL,
        subject      VARCHAR(255) NOT NULL,
        category     ENUM('account','listing','payment','technical','other') NOT NULL DEFAULT 'other',
        message      TEXT NOT NULL,
        status       ENUM('open','in_progress','resolved','closed') NOT NULL DEFAULT 'open',
        admin_reply  TEXT DEFAULT NULL,
        replied_at   TIMESTAMP NULL DEFAULT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_status (status),
        INDEX idx_user_id (user_id),
        INDEX idx_created_at (created_at)
      )
    `)
    console.log('  ✓ Created support_queries')
  }

  console.log('\n🎉 Support queries migration complete!')
  process.exit(0)
}

run().catch(err => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
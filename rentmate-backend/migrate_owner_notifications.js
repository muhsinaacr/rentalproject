// migrate_owner_notifications.js
// Run ONCE from rentmate-backend folder:  node migrate_owner_notifications.js
//
// Safely ensures the notifications table has all required columns.
// Never drops data. Safe to re-run.

require('dotenv').config()
const db = require('./db')

async function colExists(table, col) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col]
  )
  return r[0].c > 0
}

async function tableExists(table) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  )
  return r[0].c > 0
}

async function run() {
  console.log('\n── owner_notifications migration ────────────────────────────')

  // Ensure notifications table exists
  if (!(await tableExists('notifications'))) {
    await db.query(`
      CREATE TABLE notifications (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        type       VARCHAR(30) NOT NULL DEFAULT 'system',
        title      VARCHAR(255) NOT NULL,
        message    TEXT NOT NULL,
        is_read    TINYINT(1) NOT NULL DEFAULT 0,
        meta       JSON NULL,
        related_id INT NULL DEFAULT NULL COMMENT 'FK to the triggering record',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id (user_id),
        INDEX idx_user_unread (user_id, is_read)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ Created notifications table')
  } else {
    console.log('  – notifications table already exists')

    // Ensure related_id column exists
    if (!(await colExists('notifications', 'related_id'))) {
      await db.query(
        `ALTER TABLE notifications
         ADD COLUMN related_id INT NULL DEFAULT NULL
           COMMENT 'FK to the triggering record (review_id, visit_id, message_id…)'
         AFTER meta`
      )
      console.log('  ✓ Added related_id column')
    } else {
      console.log('  – related_id already exists')
    }

    // Ensure meta column is JSON or TEXT (not missing)
    if (!(await colExists('notifications', 'meta'))) {
      await db.query(
        `ALTER TABLE notifications ADD COLUMN meta JSON NULL AFTER is_read`
      )
      console.log('  ✓ Added meta column')
    } else {
      console.log('  – meta already exists')
    }
  }

  // Verify type column
  const [[typeCol]] = await db.query(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'notifications'
       AND COLUMN_NAME  = 'type'`
  )
  console.log(`  – type column: ${typeCol.COLUMN_TYPE}`)

  console.log('\n✅ Owner notifications migration complete!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
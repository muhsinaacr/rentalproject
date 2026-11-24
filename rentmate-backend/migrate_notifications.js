// migrate_notifications.js
// Run ONCE from rentmate-backend folder:  node migrate_notifications.js
//
// Creates the notifications table if it doesn't exist, then safely adds any
// missing columns. Safe to run multiple times — never drops existing data.

require('dotenv').config()
const db = require('./db')

async function tableExists(name) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  )
  return r[0].c > 0
}

async function colExists(table, col) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col]
  )
  return r[0].c > 0
}

async function addCol(table, col, def) {
  if (await colExists(table, col)) {
    console.log(`  – ${col} already exists`)
  } else {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`)
    console.log(`  ✓ Added ${col}`)
  }
}

async function run() {
  console.log('\n── notifications table ──────────────────────────────────────')

  const exists = await tableExists('notifications')

  if (!exists) {
    await db.query(`
      CREATE TABLE notifications (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT         NOT NULL,
        type        VARCHAR(30) NOT NULL DEFAULT 'system',
        title       VARCHAR(255) NOT NULL,
        message     TEXT        NOT NULL,
        is_read     TINYINT(1)  NOT NULL DEFAULT 0,
        meta        JSON        NULL COMMENT 'optional: listing_id, visit_id, sender_id etc.',
        created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user_id   (user_id),
        INDEX idx_is_read   (user_id, is_read),
        INDEX idx_type      (user_id, type),
        INDEX idx_created   (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('  ✓ notifications table created')
  } else {
    console.log('  – table already exists, checking columns…')
  }

  // Ensure all columns are present (safe to run even if table was just created)
  await addCol('notifications', 'type',    "VARCHAR(30) NOT NULL DEFAULT 'system' AFTER user_id")
  await addCol('notifications', 'is_read', 'TINYINT(1) NOT NULL DEFAULT 0')
  await addCol('notifications', 'meta',    "JSON NULL COMMENT 'optional payload: listing_id, visit_id, sender_id'")

  // Rename old 'message' column alias if some versions used different name
  const hasMessage = await colExists('notifications', 'message')
  if (!hasMessage) {
    await db.query(`ALTER TABLE notifications ADD COLUMN \`message\` TEXT NOT NULL AFTER title`)
    console.log('  ✓ Added message column')
  } else {
    console.log('  – message already exists')
  }

  console.log('\n✅ Notifications migration complete!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
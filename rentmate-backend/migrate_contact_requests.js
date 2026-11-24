// migrate_contact_requests.js
// Run once: node migrate_contact_requests.js
// Creates the contact_requests table for the WhatsApp privacy / request system.
// Safe to run multiple times (uses IF NOT EXISTS).

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
  console.log('\n── Creating contact_requests table ──────────────────')

  // 1. Create contact_requests table
  await db.query(`
    CREATE TABLE IF NOT EXISTS contact_requests (
      id              INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
      requester_id    INT          NOT NULL,
      target_user_id  INT          NOT NULL,
      status          ENUM('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
      message         VARCHAR(500) NULL,
      created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_req_target (requester_id, target_user_id),
      FOREIGN KEY (requester_id)   REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
  console.log('  ✓ contact_requests table ready')

  // 2. Ensure seeker_profiles has all needed columns (safe, idempotent)
  const seekerCols = [
    ['budget_min',    'INT'],
    ['budget_max',    'INT'],
    ['move_in_date',  'DATE'],
    ['drinking',      "VARCHAR(50) DEFAULT 'no'"],
  ]
  console.log('\n── Ensuring seeker_profiles columns ─────────────────')
  for (const [col, def] of seekerCols) {
    if (await colExists('seeker_profiles', col)) {
      console.log(`  – ${col} already exists`)
    } else {
      await db.query(`ALTER TABLE \`seeker_profiles\` ADD COLUMN \`${col}\` ${def}`)
      console.log(`  ✓ Added ${col}`)
    }
  }

  console.log('\n✅ Migration complete!\n')
  process.exit(0)
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1) })
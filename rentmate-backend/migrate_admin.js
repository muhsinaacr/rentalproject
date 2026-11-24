// migrate_admin.js
// Run ONCE from rentmate-backend folder:  node migrate_admin.js
//
// Creates admin_reports, payments, ai_match_logs tables
// and adds the `banned` column to users.
// Safe to run multiple times (checks existence before each change).

require('dotenv').config()
const db = require('./db')

// ── helpers ──────────────────────────────────────────────────────────────────

async function colExists(table, col) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, col]
  )
  return r[0].c > 0
}

async function tableExists(table) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
    [table]
  )
  return r[0].c > 0
}

async function indexExists(table, indexName) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`,
    [table, indexName]
  )
  return r[0].c > 0
}

// ── main ─────────────────────────────────────────────────────────────────────

async function run() {

  // ── 1. users.banned ───────────────────────────────────────────────────────
  console.log('\n── users: adding banned column ──────────────────────────')
  if (await colExists('users', 'banned')) {
    console.log('  – banned already exists')
  } else {
    await db.query('ALTER TABLE `users` ADD COLUMN `banned` BOOLEAN DEFAULT FALSE')
    console.log('  ✓ Added banned')
  }

  // ── 2. admin_reports ──────────────────────────────────────────────────────
  console.log('\n── admin_reports table ──────────────────────────────────')
  if (await tableExists('admin_reports')) {
    console.log('  – admin_reports already exists')
  } else {
    await db.query(`
      CREATE TABLE admin_reports (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        reporter_id         INT NOT NULL,
        type                ENUM('user', 'listing') NOT NULL,
        target_user_id      INT DEFAULT NULL,
        target_listing_id   INT DEFAULT NULL,
        reason              VARCHAR(255) NOT NULL,
        details             TEXT DEFAULT NULL,
        status              ENUM('pending', 'reviewing', 'resolved', 'dismissed') DEFAULT 'pending',
        admin_note          TEXT DEFAULT NULL,
        resolved_at         TIMESTAMP NULL DEFAULT NULL,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reporter_id)       REFERENCES users(id)    ON DELETE CASCADE,
        FOREIGN KEY (target_user_id)    REFERENCES users(id)    ON DELETE CASCADE,
        FOREIGN KEY (target_listing_id) REFERENCES listings(id) ON DELETE CASCADE,
        UNIQUE KEY uq_pending_user    (reporter_id, target_user_id,    status),
        UNIQUE KEY uq_pending_listing (reporter_id, target_listing_id, status)
      )
    `)
    console.log('  ✓ Created admin_reports')
  }

  // ── 3. payments ───────────────────────────────────────────────────────────
  console.log('\n── payments table ───────────────────────────────────────')
  if (await tableExists('payments')) {
    console.log('  – payments already exists')
  } else {
    await db.query(`
      CREATE TABLE payments (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        user_id         INT NOT NULL,
        amount          DECIMAL(10,2) NOT NULL,
        currency        VARCHAR(10)   DEFAULT 'INR',
        plan            VARCHAR(100)  DEFAULT NULL,
        status          ENUM('pending', 'success', 'failed') DEFAULT 'pending',
        payment_method  VARCHAR(100)  DEFAULT NULL,
        transaction_ref VARCHAR(255)  DEFAULT NULL,
        description     TEXT          DEFAULT NULL,
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)
    console.log('  ✓ Created payments')
  }

  // ── 4. ai_match_logs ──────────────────────────────────────────────────────
  console.log('\n── ai_match_logs table ──────────────────────────────────')
  if (await tableExists('ai_match_logs')) {
    console.log('  – ai_match_logs already exists')
  } else {
    await db.query(`
      CREATE TABLE ai_match_logs (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT  NOT NULL,
        match_count  INT  DEFAULT 0,
        score        INT  DEFAULT 0,
        success_rate INT  DEFAULT 0,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `)
    console.log('  ✓ Created ai_match_logs')
  }

  // ── 5. Indexes ────────────────────────────────────────────────────────────
  console.log('\n── indexes ──────────────────────────────────────────────')

  const indexes = [
    ['admin_reports', 'idx_reports_status',      'status'],
    ['admin_reports', 'idx_reports_type',         'type'],
    ['admin_reports', 'idx_reports_reporter',     'reporter_id'],
    ['admin_reports', 'idx_reports_target_user',  'target_user_id'],
    ['admin_reports', 'idx_reports_target_list',  'target_listing_id'],
    ['payments',      'idx_payments_user',        'user_id'],
    ['payments',      'idx_payments_status',      'status'],
    ['payments',      'idx_payments_created',     'created_at'],
  ]

  for (const [table, name, col] of indexes) {
    if (await indexExists(table, name)) {
      console.log(`  – ${name} already exists`)
    } else {
      await db.query(`CREATE INDEX \`${name}\` ON \`${table}\` (\`${col}\`)`)
      console.log(`  ✓ Created ${name}`)
    }
  }

  console.log('\n✅ Admin migration complete!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('Migration failed:', e.message)
  process.exit(1)
})
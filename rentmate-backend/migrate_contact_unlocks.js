// migrate_contact_unlocks.js
// Run once: node migrate_contact_unlocks.js
// Creates the contact_unlocks table that ties unlock access to (user_id, listing_id).
// This is the authoritative source of truth for contact access — NOT boost status.

const db = require('./db')

async function tableExists(name) {
  const [rows] = await db.query(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  )
  return rows.length > 0
}

async function migrate() {
  try {
    console.log('🔄 Running contact_unlocks migration...\n')

    if (await tableExists('contact_unlocks')) {
      console.log('   ℹ️  contact_unlocks table already exists — skipping')
    } else {
      await db.query(`
        CREATE TABLE contact_unlocks (
          id           INT AUTO_INCREMENT PRIMARY KEY,
          user_id      INT NOT NULL,
          listing_id   INT NOT NULL,
          unlocked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          payment_id   VARCHAR(100) DEFAULT NULL COMMENT 'Razorpay/mock payment reference',
          UNIQUE KEY uq_user_listing (user_id, listing_id),
          KEY idx_listing (listing_id),
          KEY idx_user    (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log('   ✅ Created contact_unlocks table')
    }

    console.log('\n🎉 contact_unlocks migration completed!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
// migrate_listing_boosts.js
// Run once: node migrate_listing_boosts.js
// Creates listing_boosts table — the authoritative record of which listings are boosted.
//
// IMPORTANT: Boost affects search sort order and badge display ONLY.
//            Boost has NO effect on contact access whatsoever.
//            Contact access is controlled exclusively by contact_unlocks table.

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
    console.log('🔄 Running listing_boosts migration...\n')

    if (await tableExists('listing_boosts')) {
      console.log('   ℹ️  listing_boosts table already exists — skipping')
    } else {
      await db.query(`
        CREATE TABLE listing_boosts (
          id            INT AUTO_INCREMENT PRIMARY KEY,
          listing_id    INT NOT NULL,
          owner_id      INT NOT NULL,
          boosted_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          boosted_until DATETIME NOT NULL,
          payment_id    VARCHAR(100) DEFAULT NULL,
          KEY idx_listing   (listing_id),
          KEY idx_until     (boosted_until),
          CONSTRAINT fk_boost_listing FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
      console.log('   ✅ Created listing_boosts table')
    }

    console.log('\n🎉 listing_boosts migration completed!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
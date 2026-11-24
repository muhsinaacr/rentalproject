// migrate_dashboard.js
// Run ONCE from rentmate-backend folder:  node migrate_dashboard.js
//
// Creates:
//   1. listing_views  — tracks which listings a seeker has viewed
//   2. seeker_matches — persists AI matcher compatibility scores
//
// Both tables are safe to create even if data already exists.
// Run any number of times — fully idempotent.

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

async function run() {
  console.log('\n── Dashboard migration ──────────────────────────────────────\n')

  // ── listing_views ─────────────────────────────────────────────────────────
  if (!(await tableExists('listing_views'))) {
    await db.query(`
      CREATE TABLE listing_views (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        user_id    INT NOT NULL,
        listing_id INT NOT NULL,
        viewed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user          (user_id),
        INDEX idx_listing       (listing_id),
        INDEX idx_user_date     (user_id, viewed_at),
        INDEX idx_user_listing  (user_id, listing_id, viewed_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('  ✓ listing_views table created')
  } else {
    console.log('  – listing_views already exists')
  }

  // ── seeker_matches ────────────────────────────────────────────────────────
  // Stores persistent AI compatibility scores between seeker pairs.
  // The matcher route currently computes on the fly; this table caches results
  // so the dashboard can count total matches and "new" ones (last 7 days).
  if (!(await tableExists('seeker_matches'))) {
    await db.query(`
      CREATE TABLE seeker_matches (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_a_id   INT NOT NULL,
        user_b_id   INT NOT NULL,
        score       DECIMAL(5,2) NOT NULL DEFAULT 0,
        created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_pair (user_a_id, user_b_id),
        INDEX idx_user_a    (user_a_id),
        INDEX idx_user_b    (user_b_id),
        INDEX idx_created   (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('  ✓ seeker_matches table created')
  } else {
    console.log('  – seeker_matches already exists')
  }

  console.log('\n✅ Dashboard migration complete!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
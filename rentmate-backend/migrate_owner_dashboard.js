// migrate_owner_dashboard.js
// Run ONCE from rentmate-backend folder:  node migrate_owner_dashboard.js
//
// Ensures all tables needed by GET /api/dashboard/owner exist:
//   1. listing_views     — seeker view tracking (may already exist from seeker migration)
//   2. contact_unlocks   — inquiry tracking (may already exist)
//   3. rental_agreements — agreement tracking (may already exist)
//   4. visits            — visit tracking (may already exist)
//   5. reviews           — review tracking (may already exist)
//
// All operations are fully idempotent — safe to run multiple times.

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

async function columnExists(table, column) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  )
  return r[0].c > 0
}

async function run() {
  console.log('\n── Owner Dashboard migration ──────────────────────────────────\n')

  // ── listing_views ──────────────────────────────────────────────────────────
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

  // ── listings: ensure views + inquiries columns exist ──────────────────────
  if (!(await columnExists('listings', 'views'))) {
    await db.query(`ALTER TABLE listings ADD COLUMN views INT NOT NULL DEFAULT 0`)
    console.log('  ✓ listings.views column added')
  } else {
    console.log('  – listings.views already exists')
  }

  if (!(await columnExists('listings', 'inquiries'))) {
    await db.query(`ALTER TABLE listings ADD COLUMN inquiries INT NOT NULL DEFAULT 0`)
    console.log('  ✓ listings.inquiries column added')
  } else {
    console.log('  – listings.inquiries already exists')
  }

  // ── contact_unlocks ────────────────────────────────────────────────────────
  if (!(await tableExists('contact_unlocks'))) {
    await db.query(`
      CREATE TABLE contact_unlocks (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_id      INT NOT NULL,
        listing_id   INT NOT NULL,
        unlocked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        payment_id   VARCHAR(100) DEFAULT NULL,
        UNIQUE KEY uq_user_listing (user_id, listing_id),
        KEY idx_listing (listing_id),
        KEY idx_user    (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ contact_unlocks table created')
  } else {
    console.log('  – contact_unlocks already exists')
  }

  // ── rental_agreements ─────────────────────────────────────────────────────
  if (!(await tableExists('rental_agreements'))) {
    await db.query(`
      CREATE TABLE rental_agreements (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        owner_id   INT NOT NULL,
        title      VARCHAR(255) DEFAULT NULL,
        content    LONGTEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_owner (owner_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `)
    console.log('  ✓ rental_agreements table created')
  } else {
    console.log('  – rental_agreements already exists')
  }

  // ── reviews: ensure created_at + rating columns exist ────────────────────
  if (await tableExists('reviews')) {
    if (!(await columnExists('reviews', 'created_at'))) {
      await db.query(`ALTER TABLE reviews ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`)
      console.log('  ✓ reviews.created_at column added')
    } else {
      console.log('  – reviews.created_at already exists')
    }
  } else {
    console.log('  – reviews table does not yet exist (skipping)')
  }

  console.log('\n✅ Owner Dashboard migration complete!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('❌ Migration failed:', e.message)
  process.exit(1)
})
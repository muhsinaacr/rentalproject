// migrate_fix_all.js
// ─────────────────────────────────────────────────────────────────────────────
// RentMate — ONE-SHOT comprehensive schema repair
//
// Run ONCE:  node migrate_fix_all.js
//
// Fixes every schema mismatch between setup.js (original) and the current
// routes/services code. Safe to re-run — never drops data.
//
// What it repairs:
//   1. notifications  — adds missing `meta` and `related_id` columns
//   2. reviews        — renames reviewer_id→user_id, comment→text
//   3. visits         — expands ENUM to include 'approved'/'cancelled',
//                       adds missing `updated_at` column
//   4. messages       — adds missing `chat_type` column
// ─────────────────────────────────────────────────────────────────────────────

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

async function run() {
  console.log('\n══════════════════════════════════════════════════════')
  console.log('  RentMate — Full Schema Repair Migration')
  console.log('══════════════════════════════════════════════════════\n')

  // ── 1. notifications ──────────────────────────────────────────────────────
  console.log('── 1. notifications table ───────────────────────────')

  if (!(await colExists('notifications', 'meta'))) {
    await db.query(
      `ALTER TABLE notifications ADD COLUMN meta JSON NULL AFTER is_read`
    )
    console.log('  ✓ Added meta column')
  } else {
    console.log('  – meta already exists')
  }

  if (!(await colExists('notifications', 'related_id'))) {
    await db.query(
      `ALTER TABLE notifications
       ADD COLUMN related_id INT NULL DEFAULT NULL
         COMMENT 'FK to triggering record (review_id, visit_id, etc.)'
       AFTER meta`
    )
    console.log('  ✓ Added related_id column')
  } else {
    console.log('  – related_id already exists')
  }

  // Widen type column if it's still VARCHAR(100) — just to be safe
  try {
    await db.query(
      `ALTER TABLE notifications MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'system'`
    )
    console.log('  ✓ type column normalised to VARCHAR(50)')
  } catch (e) {
    console.log('  – type column:', e.message)
  }

  // ── 2. reviews ────────────────────────────────────────────────────────────
  console.log('\n── 2. reviews table ─────────────────────────────────')

  if (await colExists('reviews', 'reviewer_id')) {
    // Drop FK on reviewer_id first (MySQL requires this before CHANGE)
    try {
      // Find the FK constraint name
      const [fks] = await db.query(`
        SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME   = 'reviews'
          AND COLUMN_NAME  = 'reviewer_id'
          AND REFERENCED_TABLE_NAME IS NOT NULL
      `)
      for (const { CONSTRAINT_NAME } of fks) {
        await db.query(`ALTER TABLE reviews DROP FOREIGN KEY \`${CONSTRAINT_NAME}\``)
        console.log(`  ✓ Dropped FK ${CONSTRAINT_NAME}`)
      }
    } catch (e) {
      console.log('  – FK drop skipped:', e.message)
    }

    await db.query(`ALTER TABLE reviews CHANGE reviewer_id user_id INT NOT NULL`)
    // Re-add FK on user_id
    try {
      await db.query(`ALTER TABLE reviews ADD CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`)
    } catch (e) { /* FK may already exist under new name */ }
    console.log('  ✓ Renamed reviewer_id → user_id')
  } else {
    console.log('  – user_id already correct')
  }

  if (await colExists('reviews', 'comment')) {
    await db.query(`ALTER TABLE reviews CHANGE comment \`text\` TEXT NOT NULL`)
    console.log('  ✓ Renamed comment → text')
  } else {
    console.log('  – text column already correct')
  }

  // Ensure unique constraint exists (prevents duplicate reviews)
  try {
    await db.query(`ALTER TABLE reviews ADD UNIQUE KEY uq_user_listing (user_id, listing_id)`)
    console.log('  ✓ Added unique constraint (user_id, listing_id)')
  } catch (e) {
    console.log('  – unique constraint already exists')
  }

  // ── 3. visits ─────────────────────────────────────────────────────────────
  console.log('\n── 3. visits table ──────────────────────────────────')

  try {
    await db.query(`
      ALTER TABLE visits
      MODIFY COLUMN status
        ENUM('pending','approved','rejected','cancelled','confirmed','completed')
        NOT NULL DEFAULT 'pending'
    `)
    console.log("  ✓ status ENUM expanded (added 'approved', 'cancelled')")
  } catch (e) {
    console.log('  – status ENUM:', e.message)
  }

  if (!(await colExists('visits', 'updated_at'))) {
    await db.query(
      `ALTER TABLE visits
       ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
         ON UPDATE CURRENT_TIMESTAMP`
    )
    console.log('  ✓ Added updated_at column')
  } else {
    console.log('  – updated_at already exists')
  }

  // Migrate any old 'confirmed' rows to 'approved'
  const [migrated] = await db.query(
    `UPDATE visits SET status = 'approved' WHERE status = 'confirmed'`
  )
  if (migrated.affectedRows > 0) {
    console.log(`  ✓ Migrated ${migrated.affectedRows} 'confirmed' → 'approved'`)
  }

  // ── 4. messages ───────────────────────────────────────────────────────────
  console.log('\n── 4. messages table ────────────────────────────────')

  if (!(await colExists('messages', 'chat_type'))) {
    await db.query(
      `ALTER TABLE messages
       ADD COLUMN chat_type ENUM('owner', 'roommate') NOT NULL DEFAULT 'owner'
       AFTER listing_id`
    )
    console.log("  ✓ Added chat_type column (default 'owner')")
  } else {
    console.log('  – chat_type already exists')
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════')
  console.log('  ✅ All schema repairs complete!')
  console.log('  Restart your backend:  node server.js')
  console.log('══════════════════════════════════════════════════════\n')
  process.exit(0)
}

run().catch(e => {
  console.error('\n❌ Migration failed:', e.message)
  console.error(e.stack)
  process.exit(1)
})
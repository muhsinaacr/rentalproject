// migrate_messages_v2.js
// Run ONCE from rentmate-backend/:  node migrate_messages_v2.js
//
// Upgrades the `messages` table to support the two-type communication engine:
//   chat_type = 'owner'    → listing-linked, paid, seeker ↔ owner
//   chat_type = 'roommate' → free, AI-matched seeker ↔ seeker
//
// Also adds is_read for unread-count tracking.
// Safe to run multiple times.

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
  console.log('\n── messages table migration v2 ─────────────────────────────')

  // 1. Add chat_type column
  if (await colExists('messages', 'chat_type')) {
    console.log('  – chat_type already exists')
  } else {
    await db.query(
      `ALTER TABLE messages
       ADD COLUMN chat_type ENUM('owner','roommate') NOT NULL DEFAULT 'owner'
       AFTER listing_id`
    )
    console.log('  ✓ Added chat_type')
  }

  // 2. Add is_read column
  if (await colExists('messages', 'is_read')) {
    console.log('  – is_read already exists')
  } else {
    await db.query(
      `ALTER TABLE messages
       ADD COLUMN is_read TINYINT(1) NOT NULL DEFAULT 0
       AFTER chat_type`
    )
    console.log('  ✓ Added is_read')
  }

  // 3. Backfill: existing messages had listing_id → treat as 'owner'
  await db.query(
    `UPDATE messages SET chat_type = 'owner' WHERE chat_type = 'owner' AND listing_id IS NOT NULL`
  )
  // Rows without a listing_id were likely roommate-style — mark them
  await db.query(
    `UPDATE messages SET chat_type = 'roommate' WHERE listing_id IS NULL`
  )
  console.log('  ✓ Backfilled chat_type for existing rows')

  // 4. Add index for fast conversation lookups
  try {
    await db.query(
      `ALTER TABLE messages
       ADD INDEX idx_conv_owner    (listing_id, sender_id, receiver_id, chat_type),
       ADD INDEX idx_conv_roommate (sender_id, receiver_id, chat_type),
       ADD INDEX idx_unread        (receiver_id, is_read, chat_type)`
    )
    console.log('  ✓ Added indexes')
  } catch (e) {
    // Indexes may already exist — safe to ignore duplicate key errors
    if (e.code === 'ER_DUP_KEYNAME') {
      console.log('  – Indexes already exist')
    } else {
      console.warn('  ⚠ Index error (non-fatal):', e.message)
    }
  }

  console.log('\n✅ messages migration v2 complete\n')
  process.exit(0)
}

run().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
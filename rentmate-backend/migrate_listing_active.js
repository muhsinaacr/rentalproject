// migrate_listing_active.js
// Adds owner-controlled is_active flag to listings table.
// Run: node migrate_listing_active.js
// Safe to run multiple times.

const db = require('./db')

async function migrate() {
  console.log('🔄 Starting listings is_active migration...')

  try {
    // 1. Add is_active column
    try {
      await db.query(`
        ALTER TABLE listings
        ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE
        AFTER status
      `)
      console.log('  ✅ Added column: is_active (default TRUE)')
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('  ⏭  Column already exists: is_active')
      } else {
        throw err
      }
    }

    // 2. All existing listings → active by default (already handled by DEFAULT TRUE, but explicit)
    const [result] = await db.query(`UPDATE listings SET is_active = TRUE WHERE is_active IS NULL`)
    console.log(`  ✅ Set is_active=TRUE for ${result.affectedRows} existing listings`)

    // 3. Verify
    const [cols] = await db.query(`DESCRIBE listings`)
    const col = cols.find(c => c.Field === 'is_active')
    if (col) {
      console.log(`  ✅ Verified: is_active ${col.Type}, Default: ${col.Default}, Null: ${col.Null}`)
    }

    console.log('\n✅ Migration complete!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
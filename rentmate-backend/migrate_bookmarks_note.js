// rentmate-backend/migrate_bookmarks_note.js
// Run ONCE to add the `note` column to the bookmarks table.
// Usage: node migrate_bookmarks_note.js

const db = require('./db')

async function migrate() {
  console.log('Running bookmarks note migration...')
  try {
    // Add note column — TEXT, nullable, default NULL
    await db.query(`
      ALTER TABLE bookmarks
      ADD COLUMN IF NOT EXISTS note TEXT DEFAULT NULL
    `)
    console.log('✓ Added note column to bookmarks table')
  } catch (err) {
    // MySQL < 8.0 doesn't support IF NOT EXISTS on ALTER TABLE ADD COLUMN
    // Try the fallback — if the column already exists, this will error safely
    if (err.code === 'ER_PARSE_ERROR') {
      try {
        await db.query(`ALTER TABLE bookmarks ADD COLUMN note TEXT DEFAULT NULL`)
        console.log('✓ Added note column to bookmarks table')
      } catch (e) {
        if (e.code === 'ER_DUP_FIELDNAME') {
          console.log('ℹ note column already exists — skipping')
        } else {
          throw e
        }
      }
    } else if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ note column already exists — skipping')
    } else {
      throw err
    }
  }

  // Also ensure created_at exists (needed for ORDER BY in GET /)
  try {
    await db.query(`
      ALTER TABLE bookmarks
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `)
    console.log('✓ Ensured created_at column on bookmarks table')
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_PARSE_ERROR') {
      console.log('ℹ created_at column already exists — skipping')
    } else {
      throw err
    }
  }

  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(err => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
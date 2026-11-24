// migrate_reviews.js
// Run once: node migrate_reviews.js
// Creates the reviews table if it doesn't exist, and fixes the column names
// if the table was previously created by setup.js (which used reviewer_id / comment).

const db = require('./db')

async function migrate() {
  console.log('⏳ Running reviews migration...')

  // Step 1: Create the table with the correct schema (no-op if already exists)
  await db.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      listing_id  INT         NOT NULL,
      user_id     INT         NOT NULL,
      rating      TINYINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
      text        TEXT        NOT NULL,
      created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,

      UNIQUE KEY uq_user_listing (user_id, listing_id),

      FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
    )
  `)

  // Step 2: Fix column names if the table was created by the old setup.js schema
  // Rename reviewer_id → user_id (if it exists)
  const [cols] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'reviews'
      AND COLUMN_NAME  = 'reviewer_id'
  `)
  if (cols.length > 0) {
    console.log('🔧 Renaming reviewer_id → user_id ...')
    await db.query(`ALTER TABLE reviews CHANGE reviewer_id user_id INT NOT NULL`)
    console.log('✅ reviewer_id renamed to user_id')
  }

  // Rename comment → text (if it exists)
  const [cols2] = await db.query(`
    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME   = 'reviews'
      AND COLUMN_NAME  = 'comment'
  `)
  if (cols2.length > 0) {
    console.log('🔧 Renaming comment → text ...')
    await db.query(`ALTER TABLE reviews CHANGE comment text TEXT NOT NULL`)
    console.log('✅ comment renamed to text')
  }

  console.log('✅ reviews table ready')
  process.exit(0)
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
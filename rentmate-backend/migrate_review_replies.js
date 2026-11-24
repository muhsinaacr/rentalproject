// migrate_review_replies.js
// Run once: node migrate_review_replies.js
// Creates the review_replies table so owner replies are persisted in the DB.

const db = require('./db')

async function migrate() {
  console.log('⏳ Creating review_replies table...')

  await db.query(`
    CREATE TABLE IF NOT EXISTS review_replies (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      review_id   INT  NOT NULL,
      owner_id    INT  NOT NULL,
      text        TEXT NOT NULL,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

      UNIQUE KEY uq_review_reply (review_id),

      FOREIGN KEY (review_id) REFERENCES reviews(id)  ON DELETE CASCADE,
      FOREIGN KEY (owner_id)  REFERENCES users(id)    ON DELETE CASCADE
    )
  `)

  console.log('✅ review_replies table ready')
  process.exit(0)
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
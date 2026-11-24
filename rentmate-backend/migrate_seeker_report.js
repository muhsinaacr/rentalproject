// Run once: node migrate_seeker_report.js
// Extends report_category ENUM to include 'seeker' for owner-reported seekers

require('dotenv').config()
const db = require('./db')

async function migrate() {
  try {
    // Alter the ENUM to add 'seeker'
    await db.query(`
      ALTER TABLE admin_reports
      MODIFY COLUMN report_category ENUM('listing', 'owner', 'roommate', 'seeker') DEFAULT NULL
    `)
    console.log('✓ report_category ENUM updated to include seeker')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
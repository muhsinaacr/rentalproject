// Run once: node migrate_report_category.js
// Adds `report_category` column to admin_reports for owner/roommate/listing distinction

require('dotenv').config()
const db = require('./db')

async function colExists(table, col) {
  const [r] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, col]
  )
  return r[0].c > 0
}

async function migrate() {
  try {
    if (await colExists('admin_reports', 'report_category')) {
      console.log('✓ report_category column already exists')
    } else {
      await db.query(`
        ALTER TABLE admin_reports
        ADD COLUMN report_category ENUM('listing', 'owner', 'roommate') DEFAULT NULL
        AFTER type
      `)
      console.log('✓ Added report_category column to admin_reports')
    }
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
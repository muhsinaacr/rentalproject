// migrate_listings_geo.js
// Run ONCE from rentmate-backend folder:  node migrate_listings_geo.js
//
// Adds latitude + longitude columns to the listings table.
// Safe to run multiple times (checks existence first).

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

async function run() {
  console.log('\n── listings table: adding geo columns ──────────────────')

  if (await colExists('listings', 'latitude')) {
    console.log('  – latitude already exists')
  } else {
    await db.query('ALTER TABLE `listings` ADD COLUMN `latitude` DECIMAL(10,7) NULL')
    console.log('  ✓ Added latitude')
  }

  if (await colExists('listings', 'longitude')) {
    console.log('  – longitude already exists')
  } else {
    await db.query('ALTER TABLE `listings` ADD COLUMN `longitude` DECIMAL(10,7) NULL')
    console.log('  ✓ Added longitude')
  }

  console.log('\nDone. Geo filtering is now active for Browse Listings.\n')
  process.exit(0)
}

run().catch(err => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
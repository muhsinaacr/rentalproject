// migrate_schema.js
// Run ONCE from rentmate-backend folder:  node migrate_schema.js
//
// Safely adds all missing columns to seeker_profiles.
// Does NOT delete existing data. Safe to run multiple times.

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

async function addCol(table, col, def) {
  if (await colExists(table, col)) {
    console.log(`  – ${col} already exists`)
  } else {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`)
    console.log(`  ✓ Added ${col}`)
  }
}

async function run() {
  console.log('\n── seeker_profiles ──────────────────────────────')

  const cols = [
    // Basic info
    ['age',               'INT'],
    ['phone',             'VARCHAR(20)'],
    ['whatsapp',          'VARCHAR(20)'],
    ['contact_email',     'VARCHAR(100)'],
    ['occupation',        'VARCHAR(100)'],
    ['budget_min',        'INT'],
    ['budget_max',        'INT'],
    ['preferred_location','VARCHAR(255)'],
    ['latitude',          'DECIMAL(10,7)'],
    ['longitude',         'DECIMAL(10,7)'],
    ['move_in_date',      'DATE'],
    ['about',             'TEXT'],
    // Lifestyle — all stored as VARCHAR (values like 'yes','no','okay','moderate' etc.)
    ['personality_type',  "VARCHAR(50) DEFAULT 'ambivert'"],
    ['sleep_schedule',    "VARCHAR(50) DEFAULT 'flexible'"],
    ['food_preference',   "VARCHAR(50) DEFAULT 'any'"],
    ['cleanliness_level', "VARCHAR(50) DEFAULT 'moderate'"],
    ['smoking',           "VARCHAR(50) DEFAULT 'no'"],
    ['drinking',          "VARCHAR(50) DEFAULT 'no'"],
    ['pets',              "VARCHAR(50) DEFAULT 'no'"],
    ['guest_preference',  "VARCHAR(50) DEFAULT 'occasionally'"],
    ['noise_tolerance',   "VARCHAR(50) DEFAULT 'moderate'"],
    ['gender_preference', "VARCHAR(50) DEFAULT 'any'"],
  ]

  for (const [col, def] of cols) {
    await addCol('seeker_profiles', col, def)
  }

  // Migrate old boolean columns to VARCHAR where needed
  // smoking: was TINYINT, now VARCHAR — copy data if column type is wrong
  try {
    const [rows] = await db.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seeker_profiles' AND COLUMN_NAME='smoking'`
    )
    if (rows[0]?.DATA_TYPE === 'tinyint') {
      console.log('  Converting smoking from TINYINT to VARCHAR...')
      await db.query(`ALTER TABLE seeker_profiles MODIFY COLUMN smoking VARCHAR(50) DEFAULT 'no'`)
      await db.query(`UPDATE seeker_profiles SET smoking='yes' WHERE smoking='1'`)
      await db.query(`UPDATE seeker_profiles SET smoking='no'  WHERE smoking='0' OR smoking IS NULL`)
      console.log('  ✓ smoking converted')
    }
  } catch(e) { console.log('  smoking convert skipped:', e.message) }

  try {
    const [rows] = await db.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seeker_profiles' AND COLUMN_NAME='drinking'`
    )
    if (rows[0]?.DATA_TYPE === 'tinyint') {
      console.log('  Converting drinking from TINYINT to VARCHAR...')
      await db.query(`ALTER TABLE seeker_profiles MODIFY COLUMN drinking VARCHAR(50) DEFAULT 'no'`)
      await db.query(`UPDATE seeker_profiles SET drinking='yes' WHERE drinking='1'`)
      await db.query(`UPDATE seeker_profiles SET drinking='no'  WHERE drinking='0' OR drinking IS NULL`)
      console.log('  ✓ drinking converted')
    }
  } catch(e) { console.log('  drinking convert skipped:', e.message) }

  try {
    const [rows] = await db.query(
      `SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seeker_profiles' AND COLUMN_NAME='pets'`
    )
    if (rows[0]?.DATA_TYPE === 'tinyint') {
      console.log('  Converting pets from TINYINT to VARCHAR...')
      await db.query(`ALTER TABLE seeker_profiles MODIFY COLUMN pets VARCHAR(50) DEFAULT 'no'`)
      await db.query(`UPDATE seeker_profiles SET pets='yes' WHERE pets='1'`)
      await db.query(`UPDATE seeker_profiles SET pets='no'  WHERE pets='0' OR pets IS NULL`)
      console.log('  ✓ pets converted')
    }
  } catch(e) { console.log('  pets convert skipped:', e.message) }

  console.log('\n✅ Migration complete! All columns aligned with UI.\n')
  process.exit(0)
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1) })
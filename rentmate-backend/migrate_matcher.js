require('dotenv').config();
const db = require('./db');

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT COUNT(*) as count
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND COLUMN_NAME  = ?`,
    [table, column]
  );
  return rows[0].count > 0;
}

async function addColumnIfMissing(table, column, definition) {
  const exists = await columnExists(table, column);
  if (!exists) {
    await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  ✓ Added ${table}.${column}`);
  } else {
    console.log(`  – ${table}.${column} already exists, skipping`);
  }
}

async function migrate() {
  console.log('Running matcher migration...\n');

  try {
    const seekerColumns = [
      ['about',             'TEXT'],
      ['personality_type',  "VARCHAR(50) DEFAULT 'ambivert'"],
      ['sleep_schedule',    "VARCHAR(50) DEFAULT 'flexible'"],
      ['cleanliness_level', "VARCHAR(50) DEFAULT 'moderate'"],
      ['noise_tolerance',   "VARCHAR(50) DEFAULT 'moderate'"],
      ['guest_preference',  "VARCHAR(50) DEFAULT 'sometimes'"],
      ['latitude',          'DECIMAL(10,7)'],
      ['longitude',         'DECIMAL(10,7)'],
    ];

    console.log('Table: seeker_profiles');
    for (const [col, def] of seekerColumns) {
      await addColumnIfMissing('seeker_profiles', col, def);
    }

    const userColumns = [
      ['latitude',  'DECIMAL(10,7)'],
      ['longitude', 'DECIMAL(10,7)'],
    ];

    console.log('\nTable: users');
    for (const [col, def] of userColumns) {
      await addColumnIfMissing('users', col, def);
    }

    console.log('\n✅ Migration complete.');
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  } finally {
    db.end();
  }
}

migrate();
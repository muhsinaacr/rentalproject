// migrate_contact.js — Run once: node migrate_contact.js
// Adds contact info columns (phone, whatsapp, contact_email) to seeker_profiles
// and also adds age column if missing.

const db = require('./db')

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND COLUMN_NAME  = ?`,
    [table, column]
  )
  return rows.length > 0
}

async function migrate() {
  try {
    console.log('🔄 Running contact info migration...\n')

    const newColumns = [
      {
        name: 'age',
        sql:  "ADD COLUMN age INT DEFAULT NULL AFTER user_id",
      },
      {
        name: 'phone',
        sql:  "ADD COLUMN phone VARCHAR(20) DEFAULT NULL AFTER age",
      },
      {
        name: 'whatsapp',
        sql:  "ADD COLUMN whatsapp VARCHAR(20) DEFAULT NULL AFTER phone",
      },
      {
        name: 'contact_email',
        sql:  "ADD COLUMN contact_email VARCHAR(150) DEFAULT NULL AFTER whatsapp",
      },
    ]

    for (const col of newColumns) {
      const exists = await columnExists('seeker_profiles', col.name)
      if (!exists) {
        await db.query(`ALTER TABLE seeker_profiles ${col.sql}`)
        console.log(`   ✅ Added seeker_profiles.${col.name}`)
      } else {
        console.log(`   ℹ️  seeker_profiles.${col.name} already exists — skipping`)
      }
    }

    console.log('\n🎉 Contact migration completed!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
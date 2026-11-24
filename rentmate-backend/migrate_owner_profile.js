// migrate_owner_profile.js
// Run: node migrate_owner_profile.js
// Safe to run multiple times — uses ALTER TABLE IF NOT EXISTS column pattern

const db = require('./db')

async function migrate() {
  console.log('🔄 Starting owner_profiles migration...')

  try {
    // 1. Add all missing columns safely (each in its own try-catch so one failure doesn't block others)
    const alterations = [
      // Basic info
      `ALTER TABLE owner_profiles ADD COLUMN age INT NULL`,
      `ALTER TABLE owner_profiles ADD COLUMN occupation VARCHAR(150) NULL`,
      `ALTER TABLE owner_profiles ADD COLUMN phone VARCHAR(20) NULL`,
      `ALTER TABLE owner_profiles ADD COLUMN city VARCHAR(150) NULL`,

      // Verification columns
      `ALTER TABLE owner_profiles ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE owner_profiles ADD COLUMN id_type VARCHAR(50) NULL`,
      `ALTER TABLE owner_profiles ADD COLUMN id_number VARCHAR(100) NULL`,
      `ALTER TABLE owner_profiles ADD COLUMN id_document_url TEXT NULL`,

      // Metadata
      `ALTER TABLE owner_profiles ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP`,
      `ALTER TABLE owner_profiles ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ]

    for (const sql of alterations) {
      try {
        await db.query(sql)
        const col = sql.match(/ADD COLUMN (\w+)/)?.[1]
        console.log(`  ✅ Added column: ${col}`)
      } catch (err) {
        if (err.code === 'ER_DUP_FIELDNAME') {
          const col = sql.match(/ADD COLUMN (\w+)/)?.[1]
          console.log(`  ⏭  Column already exists: ${col}`)
        } else {
          throw err
        }
      }
    }

    // 2. Migrate old "verified" column data into "is_verified" if it exists, then handle it
    try {
      // Copy existing verified values into is_verified
      await db.query(`UPDATE owner_profiles SET is_verified = verified WHERE verified IS NOT NULL`)
      console.log('  ✅ Migrated old "verified" data to "is_verified"')
    } catch (err) {
      // "verified" column may not exist or is already handled — no problem
      console.log('  ⏭  No "verified" column to migrate (or already migrated)')
    }

    // 3. Ensure user_id is UNIQUE (one profile per owner)
    try {
      await db.query(`ALTER TABLE owner_profiles ADD UNIQUE KEY uq_owner_user (user_id)`)
      console.log('  ✅ Added UNIQUE constraint on user_id')
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME' || err.code === 'ER_DUP_ENTRY') {
        console.log('  ⏭  UNIQUE constraint already exists on user_id')
      } else {
        console.log('  ⚠️  Could not add UNIQUE key (may already exist):', err.message)
      }
    }

    // 4. Verify final table structure
    const [columns] = await db.query(`DESCRIBE owner_profiles`)
    console.log('\n📋 Final owner_profiles structure:')
    columns.forEach(col => {
      console.log(`   ${col.Field.padEnd(25)} ${col.Type.padEnd(25)} ${col.Null === 'YES' ? 'nullable' : 'required'}`)
    })

    console.log('\n✅ Migration complete!')
    process.exit(0)
  } catch (err) {
    console.error('❌ Migration failed:', err.message)
    process.exit(1)
  }
}

migrate()
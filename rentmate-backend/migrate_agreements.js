// migrate_agreements.js
// Run ONCE from rentmate-backend folder:  node migrate_agreements.js
//
// Creates the rental_agreements table for storing agreement generator records.
// Safe to run multiple times.

require('dotenv').config()
const db = require('./db')

async function tableExists(name) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name]
  )
  return rows[0].c > 0
}

async function run() {
  console.log('\n── rental_agreements ────────────────────────────')

  if (await tableExists('rental_agreements')) {
    console.log('  – Table already exists, skipping creation')
  } else {
    await db.query(`
      CREATE TABLE rental_agreements (
        id                 INT AUTO_INCREMENT PRIMARY KEY,
        owner_id           INT NOT NULL,

        -- Owner details
        owner_name         VARCHAR(150) NOT NULL,
        owner_phone        VARCHAR(20)  NOT NULL,
        owner_address      TEXT         NOT NULL,

        -- Tenant details
        tenant_name        VARCHAR(150) NOT NULL,
        tenant_phone       VARCHAR(20)  NOT NULL,
        tenant_address     TEXT         NOT NULL,

        -- Property & financial terms
        property_address   TEXT         NOT NULL,
        furnished          VARCHAR(50)  NOT NULL DEFAULT 'Fully Furnished',
        rent_amount        DECIMAL(10,2) NOT NULL,
        advance_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
        maintenance_charges DECIMAL(10,2) NOT NULL DEFAULT 0,
        start_date         DATE         NOT NULL,
        duration           VARCHAR(30)  NOT NULL DEFAULT '11 months',
        notice_period      VARCHAR(30)  NOT NULL DEFAULT '1 month',

        -- Optional clauses
        restrictions       TEXT,
        additional_clauses TEXT,

        -- Payment tracking
        is_paid            TINYINT(1)   NOT NULL DEFAULT 0,
        payment_ref        VARCHAR(100),

        -- Timestamps
        created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_owner (owner_id),
        INDEX idx_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
    console.log('  ✓ Created rental_agreements table')
  }

  console.log('\n✅ Agreement migration complete!\n')
  process.exit(0)
}

run().catch(e => {
  console.error('Migration failed:', e.message)
  process.exit(1)
})
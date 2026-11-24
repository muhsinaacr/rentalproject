// rentmate-backend/fix_undefined_notifications.js
// Run once: node fix_undefined_notifications.js
// Patches all stored notification messages that contain "undefined sent you"

const db = require('./db')

async function fix() {
  try {
    // Find all broken message notifications
    const [rows] = await db.query(
      `SELECT n.id, n.message, n.meta
       FROM notifications n
       WHERE n.type = 'message'
         AND n.message LIKE 'undefined sent you%'`
    )

    console.log(`Found ${rows.length} broken notifications to fix.`)

    for (const row of rows) {
      let meta = null
      try {
        meta = row.meta ? (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta) : null
      } catch (_) {}

      const senderId = meta?.sender_id
      let senderName = 'Someone'

      if (senderId) {
        const [[user]] = await db.query('SELECT name FROM users WHERE id = ?', [senderId])
        if (user?.name) senderName = user.name
      }

      const fixedMessage = row.message.replace(/^undefined/, senderName)

      await db.query(
        'UPDATE notifications SET message = ? WHERE id = ?',
        [fixedMessage, row.id]
      )
      console.log(`  Fixed notification ${row.id}: "${fixedMessage}"`)
    }

    console.log('Done.')
    process.exit(0)
  } catch (err) {
    console.error('Migration error:', err)
    process.exit(1)
  }
}

fix()
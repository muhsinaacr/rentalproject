const mysql = require('mysql2')
require('dotenv').config()

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,   // FIX: returns DATE columns as 'YYYY-MM-DD' strings instead
                       // of JS Date objects, so available_from never shows blank
})

module.exports = pool.promise()
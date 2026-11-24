const mysql = require('mysql2')
require('dotenv').config()

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

const SQL = `
CREATE DATABASE IF NOT EXISTS rentmate_db;
USE rentmate_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('seeker', 'owner', 'admin') NOT NULL,
  phone VARCHAR(20),
  photo VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seeker_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE,
  occupation VARCHAR(100),
  budget_min INT,
  budget_max INT,
  preferred_location VARCHAR(255),
  sleep_time VARCHAR(50),
  food_pref VARCHAR(50),
  smoking BOOLEAN DEFAULT FALSE,
  drinking BOOLEAN DEFAULT FALSE,
  pets BOOLEAN DEFAULT FALSE,
  gender_pref VARCHAR(50),
  move_in_date DATE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS owner_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNIQUE,
  bio TEXT,
  verified BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS listings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  location VARCHAR(255),
  rent INT NOT NULL,
  deposit INT,
  room_type VARCHAR(100),
  furnishing VARCHAR(100),
  available_from DATE,
  amenities TEXT,
  photos TEXT,
  gender_pref VARCHAR(50),
  food_pref VARCHAR(50),
  smoking_allowed BOOLEAN DEFAULT FALSE,
  pets_allowed BOOLEAN DEFAULT FALSE,
  status ENUM('active', 'inactive', 'rented') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  listing_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, listing_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visits (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seeker_id INT NOT NULL,
  listing_id INT NOT NULL,
  owner_id INT NOT NULL,
  visit_date DATE NOT NULL,
  visit_time VARCHAR(50),
  status ENUM('pending', 'confirmed', 'rejected', 'completed') DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seeker_id) REFERENCES users(id),
  FOREIGN KEY (listing_id) REFERENCES listings(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  listing_id INT,
  content TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reviewer_id INT NOT NULL,
  listing_id INT NOT NULL,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255),
  message TEXT,
  type VARCHAR(100),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS unlocks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  seeker_id INT NOT NULL,
  listing_id INT NOT NULL,
  amount INT,
  unlocked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(seeker_id, listing_id),
  FOREIGN KEY (seeker_id) REFERENCES users(id),
  FOREIGN KEY (listing_id) REFERENCES listings(id)
);

INSERT IGNORE INTO users (id, name, email, password, role)
VALUES (1, 'Administrator', 'admin@rentmate.ai', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lJWy', 'admin');
`

const statements = SQL.split(';').map(s => s.trim()).filter(s => s.length > 0)

async function runSetup() {
  for (const statement of statements) {
    await new Promise((resolve, reject) => {
      connection.query(statement, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }
}

runSetup()
  .then(() => {
    console.log('✅ Database and all tables created successfully!')
    console.log('✅ Admin user created → admin@rentmate.ai / admin123')
    connection.end()
  })
  .catch((err) => {
    console.error('❌ Error:', err.message)
    connection.end()
  })
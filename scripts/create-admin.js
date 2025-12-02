#!/usr/bin/env node
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path
const DB_PATH = path.join(__dirname, '../server/database/auth.db');

// Admin credentials
const ADMIN_USERNAME = 'Jack';
const ADMIN_PASSWORD = 'Linode1';
const ADMIN_EMAIL = 'admin@claude-ui.local';

async function createAdmin() {
  console.log('Creating admin user...');

  try {
    // Connect to database
    const db = new Database(DB_PATH);

    // Check if Jack already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE username = ?').get(ADMIN_USERNAME);

    if (existingUser) {
      console.log('User "Jack" already exists.');

      // Update to admin role if not already
      if (existingUser.role !== 'admin') {
        db.prepare('UPDATE users SET role = ? WHERE username = ?').run('admin', ADMIN_USERNAME);
        console.log('Updated Jack to admin role.');
      } else {
        console.log('Jack is already an admin.');
      }

      // Update password if needed
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      db.prepare('UPDATE users SET password_hash = ? WHERE username = ?').run(passwordHash, ADMIN_USERNAME);
      console.log('Password updated for Jack.');

    } else {
      // Create new admin user
      const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

      // Check if this is the first user
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
      const role = userCount === 0 ? 'admin' : 'admin'; // Always admin for Jack

      const stmt = db.prepare(`
        INSERT INTO users (username, password_hash, email, role, created_at, is_active)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 1)
      `);

      const result = stmt.run(ADMIN_USERNAME, passwordHash, ADMIN_EMAIL, role);
      console.log(`Admin user "Jack" created successfully with ID: ${result.lastInsertRowid}`);
    }

    db.close();
    console.log('\n✅ Admin setup complete!');
    console.log('You can now login with:');
    console.log(`  Username: ${ADMIN_USERNAME}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);

  } catch (error) {
    console.error('Error creating admin user:', error);
    process.exit(1);
  }
}

// Run the script
createAdmin();
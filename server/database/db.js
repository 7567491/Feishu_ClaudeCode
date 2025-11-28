import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    dim: '\x1b[2m',
};

const c = {
    info: (text) => `${colors.cyan}${text}${colors.reset}`,
    bright: (text) => `${colors.bright}${text}${colors.reset}`,
    dim: (text) => `${colors.dim}${text}${colors.reset}`,
};

// Use DATABASE_PATH environment variable if set, otherwise use default location
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'auth.db');
const INIT_SQL_PATH = path.join(__dirname, 'init.sql');

// Ensure database directory exists if custom path is provided
if (process.env.DATABASE_PATH) {
  const dbDir = path.dirname(DB_PATH);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      console.log(`Created database directory: ${dbDir}`);
    }
  } catch (error) {
    console.error(`Failed to create database directory ${dbDir}:`, error.message);
    throw error;
  }
}

// Create database connection
const db = new Database(DB_PATH);

// Show app installation path prominently
const appInstallPath = path.join(__dirname, '../..');
console.log('');
console.log(c.dim('═'.repeat(60)));
console.log(`${c.info('[INFO]')} App Installation: ${c.bright(appInstallPath)}`);
console.log(`${c.info('[INFO]')} Database: ${c.dim(path.relative(appInstallPath, DB_PATH))}`);
if (process.env.DATABASE_PATH) {
  console.log(`       ${c.dim('(Using custom DATABASE_PATH from environment)')}`);
}
console.log(c.dim('═'.repeat(60)));
console.log('');

const runMigrations = () => {
  try {
    const tableInfo = db.prepare("PRAGMA table_info(users)").all();
    const columnNames = tableInfo.map(col => col.name);

    if (!columnNames.includes('git_name')) {
      console.log('Running migration: Adding git_name column');
      db.exec('ALTER TABLE users ADD COLUMN git_name TEXT');
    }

    if (!columnNames.includes('git_email')) {
      console.log('Running migration: Adding git_email column');
      db.exec('ALTER TABLE users ADD COLUMN git_email TEXT');
    }

    if (!columnNames.includes('has_completed_onboarding')) {
      console.log('Running migration: Adding has_completed_onboarding column');
      db.exec('ALTER TABLE users ADD COLUMN has_completed_onboarding BOOLEAN DEFAULT 0');
    }

    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Error running migrations:', error.message);
    throw error;
  }
};

// Initialize database with schema
const initializeDatabase = async () => {
  try {
    const initSQL = fs.readFileSync(INIT_SQL_PATH, 'utf8');
    db.exec(initSQL);
    console.log('Database initialized successfully');
    runMigrations();
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
};

// User database operations
const userDb = {
  // Check if any users exist
  hasUsers: () => {
    try {
      const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
      return row.count > 0;
    } catch (err) {
      throw err;
    }
  },

  // Create a new user
  createUser: (username, passwordHash) => {
    try {
      const stmt = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)');
      const result = stmt.run(username, passwordHash);
      return { id: result.lastInsertRowid, username };
    } catch (err) {
      throw err;
    }
  },

  // Get user by username
  getUserByUsername: (username) => {
    try {
      const row = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Update last login time
  updateLastLogin: (userId) => {
    try {
      db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    } catch (err) {
      throw err;
    }
  },

  // Get user by ID
  getUserById: (userId) => {
    try {
      const row = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE id = ? AND is_active = 1').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  getFirstUser: () => {
    try {
      const row = db.prepare('SELECT id, username, created_at, last_login FROM users WHERE is_active = 1 LIMIT 1').get();
      return row;
    } catch (err) {
      throw err;
    }
  },

  updateGitConfig: (userId, gitName, gitEmail) => {
    try {
      const stmt = db.prepare('UPDATE users SET git_name = ?, git_email = ? WHERE id = ?');
      stmt.run(gitName, gitEmail, userId);
    } catch (err) {
      throw err;
    }
  },

  getGitConfig: (userId) => {
    try {
      const row = db.prepare('SELECT git_name, git_email FROM users WHERE id = ?').get(userId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  completeOnboarding: (userId) => {
    try {
      const stmt = db.prepare('UPDATE users SET has_completed_onboarding = 1 WHERE id = ?');
      stmt.run(userId);
    } catch (err) {
      throw err;
    }
  },

  hasCompletedOnboarding: (userId) => {
    try {
      const row = db.prepare('SELECT has_completed_onboarding FROM users WHERE id = ?').get(userId);
      return row?.has_completed_onboarding === 1;
    } catch (err) {
      throw err;
    }
  }
};

// API Keys database operations
const apiKeysDb = {
  // Generate a new API key
  generateApiKey: () => {
    return 'ck_' + crypto.randomBytes(32).toString('hex');
  },

  // Create a new API key
  createApiKey: (userId, keyName) => {
    try {
      const apiKey = apiKeysDb.generateApiKey();
      const stmt = db.prepare('INSERT INTO api_keys (user_id, key_name, api_key) VALUES (?, ?, ?)');
      const result = stmt.run(userId, keyName, apiKey);
      return { id: result.lastInsertRowid, keyName, apiKey };
    } catch (err) {
      throw err;
    }
  },

  // Get all API keys for a user
  getApiKeys: (userId) => {
    try {
      const rows = db.prepare('SELECT id, key_name, api_key, created_at, last_used, is_active FROM api_keys WHERE user_id = ? ORDER BY created_at DESC').all(userId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Validate API key and get user
  validateApiKey: (apiKey) => {
    try {
      const row = db.prepare(`
        SELECT u.id, u.username, ak.id as api_key_id
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.api_key = ? AND ak.is_active = 1 AND u.is_active = 1
      `).get(apiKey);

      if (row) {
        // Update last_used timestamp
        db.prepare('UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?').run(row.api_key_id);
      }

      return row;
    } catch (err) {
      throw err;
    }
  },

  // Delete an API key
  deleteApiKey: (userId, apiKeyId) => {
    try {
      const stmt = db.prepare('DELETE FROM api_keys WHERE id = ? AND user_id = ?');
      const result = stmt.run(apiKeyId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Toggle API key active status
  toggleApiKey: (userId, apiKeyId, isActive) => {
    try {
      const stmt = db.prepare('UPDATE api_keys SET is_active = ? WHERE id = ? AND user_id = ?');
      const result = stmt.run(isActive ? 1 : 0, apiKeyId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

// User credentials database operations (for GitHub tokens, GitLab tokens, etc.)
const credentialsDb = {
  // Create a new credential
  createCredential: (userId, credentialName, credentialType, credentialValue, description = null) => {
    try {
      const stmt = db.prepare('INSERT INTO user_credentials (user_id, credential_name, credential_type, credential_value, description) VALUES (?, ?, ?, ?, ?)');
      const result = stmt.run(userId, credentialName, credentialType, credentialValue, description);
      return { id: result.lastInsertRowid, credentialName, credentialType };
    } catch (err) {
      throw err;
    }
  },

  // Get all credentials for a user, optionally filtered by type
  getCredentials: (userId, credentialType = null) => {
    try {
      let query = 'SELECT id, credential_name, credential_type, description, created_at, is_active FROM user_credentials WHERE user_id = ?';
      const params = [userId];

      if (credentialType) {
        query += ' AND credential_type = ?';
        params.push(credentialType);
      }

      query += ' ORDER BY created_at DESC';

      const rows = db.prepare(query).all(...params);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get active credential value for a user by type (returns most recent active)
  getActiveCredential: (userId, credentialType) => {
    try {
      const row = db.prepare('SELECT credential_value FROM user_credentials WHERE user_id = ? AND credential_type = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get(userId, credentialType);
      return row?.credential_value || null;
    } catch (err) {
      throw err;
    }
  },

  // Delete a credential
  deleteCredential: (userId, credentialId) => {
    try {
      const stmt = db.prepare('DELETE FROM user_credentials WHERE id = ? AND user_id = ?');
      const result = stmt.run(credentialId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  },

  // Toggle credential active status
  toggleCredential: (userId, credentialId, isActive) => {
    try {
      const stmt = db.prepare('UPDATE user_credentials SET is_active = ? WHERE id = ? AND user_id = ?');
      const result = stmt.run(isActive ? 1 : 0, credentialId, userId);
      return result.changes > 0;
    } catch (err) {
      throw err;
    }
  }
};

// Backward compatibility - keep old names pointing to new system
const githubTokensDb = {
  createGithubToken: (userId, tokenName, githubToken, description = null) => {
    return credentialsDb.createCredential(userId, tokenName, 'github_token', githubToken, description);
  },
  getGithubTokens: (userId) => {
    return credentialsDb.getCredentials(userId, 'github_token');
  },
  getActiveGithubToken: (userId) => {
    return credentialsDb.getActiveCredential(userId, 'github_token');
  },
  deleteGithubToken: (userId, tokenId) => {
    return credentialsDb.deleteCredential(userId, tokenId);
  },
  toggleGithubToken: (userId, tokenId, isActive) => {
    return credentialsDb.toggleCredential(userId, tokenId, isActive);
  }
};

// Feishu database operations
const feishuDb = {
  // Get session by conversation ID
  getSession: (conversationId) => {
    try {
      const row = db.prepare('SELECT * FROM feishu_sessions WHERE conversation_id = ? AND is_active = 1').get(conversationId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Create a new Feishu session
  createSession: (conversationId, feishuId, sessionType, projectPath, userId, claudeSessionId = null) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO feishu_sessions
        (conversation_id, feishu_id, session_type, project_path, claude_session_id, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = stmt.run(conversationId, feishuId, sessionType, projectPath, claudeSessionId, userId);
      return {
        id: result.lastInsertRowid,
        conversation_id: conversationId,
        feishu_id: feishuId,
        session_type: sessionType,
        project_path: projectPath,  // 使用数据库字段名
        claude_session_id: claudeSessionId,
        user_id: userId
      };
    } catch (err) {
      throw err;
    }
  },

  // Update session activity timestamp
  updateSessionActivity: (sessionId) => {
    try {
      db.prepare('UPDATE feishu_sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
    } catch (err) {
      throw err;
    }
  },

  // Update Claude session ID
  updateClaudeSessionId: (sessionId, claudeSessionId) => {
    try {
      db.prepare('UPDATE feishu_sessions SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, sessionId);
    } catch (err) {
      throw err;
    }
  },

  // Clear single session's Claude session ID (used by /clear command)
  clearSessionClaudeSessionId: (sessionId) => {
    try {
      const result = db.prepare('UPDATE feishu_sessions SET claude_session_id = NULL WHERE id = ?').run(sessionId);
      return result.changes;
    } catch (err) {
      throw err;
    }
  },

  // Clear Claude session IDs older than specified hours (useful after service restart)
  clearOldClaudeSessionIds: (hours = 24) => {
    try {
      const result = db.prepare(`
        UPDATE feishu_sessions
        SET claude_session_id = NULL
        WHERE claude_session_id IS NOT NULL
          AND datetime(last_activity) < datetime('now', '-${hours} hours')
      `).run();
      return result.changes;
    } catch (err) {
      throw err;
    }
  },

  // Clear all Claude session IDs (kept for backward compatibility)
  clearAllClaudeSessionIds: () => {
    try {
      const result = db.prepare('UPDATE feishu_sessions SET claude_session_id = NULL WHERE claude_session_id IS NOT NULL').run();
      return result.changes;
    } catch (err) {
      throw err;
    }
  },

  // Get all active sessions
  getAllSessions: (userId = null) => {
    try {
      let query = 'SELECT * FROM feishu_sessions WHERE is_active = 1';
      const params = [];

      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }

      query += ' ORDER BY last_activity DESC';

      const rows = db.prepare(query).all(...params);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Log a message
  logMessage: (sessionId, direction, messageType, content, messageId = null) => {
    try {
      // 如果 messageId 存在，使用 OR IGNORE 避免重复插入导致唯一约束错误
      const stmt = messageId
        ? db.prepare(`
            INSERT OR IGNORE INTO feishu_message_log
            (session_id, message_id, direction, message_type, content)
            VALUES (?, ?, ?, ?, ?)
          `)
        : db.prepare(`
            INSERT INTO feishu_message_log
            (session_id, message_id, direction, message_type, content)
            VALUES (?, ?, ?, ?, ?)
          `);

      const result = stmt.run(sessionId, messageId, direction, messageType, content);
      const ignored = messageId ? result.changes === 0 : false;
      return { id: ignored ? null : result.lastInsertRowid, ignored };
    } catch (err) {
      // 兜底处理旧库上的唯一约束，保持幂等
      if (messageId && err.message?.includes('UNIQUE constraint failed')) {
        return { id: null, ignored: true };
      }
      throw err;
    }
  },

  // Get message history for a session
  getMessageHistory: (sessionId, limit = 100) => {
    try {
      const rows = db.prepare(`
        SELECT * FROM feishu_message_log
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(sessionId, limit);
      return rows.reverse(); // Return in chronological order
    } catch (err) {
      throw err;
    }
  },

  // Deactivate a session
  deactivateSession: (sessionId) => {
    try {
      db.prepare('UPDATE feishu_sessions SET is_active = 0 WHERE id = ?').run(sessionId);
    } catch (err) {
      throw err;
    }
  },

  // Get session statistics
  getStats: (userId = null) => {
    try {
      let query = `
        SELECT
          COUNT(*) as total_sessions,
          SUM(CASE WHEN session_type = 'private' THEN 1 ELSE 0 END) as private_sessions,
          SUM(CASE WHEN session_type = 'group' THEN 1 ELSE 0 END) as group_sessions,
          (SELECT COUNT(*) FROM feishu_message_log WHERE session_id IN
            (SELECT id FROM feishu_sessions WHERE is_active = 1${userId ? ' AND user_id = ?' : ''})) as total_messages
        FROM feishu_sessions
        WHERE is_active = 1
      `;

      const params = [];
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId, userId);
      }

      const row = db.prepare(query).get(...params);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Store or update group member information
  upsertGroupMember: (chatId, memberOpenId, memberInfo = {}) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO feishu_group_members
        (chat_id, member_open_id, member_user_id, member_name, member_type, tenant_key, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(chat_id, member_open_id)
        DO UPDATE SET
          member_user_id = excluded.member_user_id,
          member_name = excluded.member_name,
          member_type = excluded.member_type,
          tenant_key = excluded.tenant_key,
          updated_at = CURRENT_TIMESTAMP
      `);

      const result = stmt.run(
        chatId,
        memberOpenId,
        memberInfo.member_user_id || null,
        memberInfo.member_name || null,
        memberInfo.member_type || 'user',
        memberInfo.tenant_key || null
      );

      return { success: true, changes: result.changes };
    } catch (err) {
      throw err;
    }
  },

  // Get all members of a group chat
  getGroupMembers: (chatId) => {
    try {
      const rows = db.prepare(`
        SELECT * FROM feishu_group_members
        WHERE chat_id = ?
        ORDER BY created_at ASC
      `).all(chatId);
      return rows;
    } catch (err) {
      throw err;
    }
  },

  // Get member info by open_id
  getMemberByOpenId: (memberOpenId) => {
    try {
      const row = db.prepare(`
        SELECT * FROM feishu_group_members
        WHERE member_open_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(memberOpenId);
      return row;
    } catch (err) {
      throw err;
    }
  },

  // Delete all members of a group (e.g., when refreshing)
  deleteGroupMembers: (chatId) => {
    try {
      const result = db.prepare('DELETE FROM feishu_group_members WHERE chat_id = ?').run(chatId);
      return result.changes;
    } catch (err) {
      throw err;
    }
  },

  // Get statistics of group members
  getGroupMemberStats: (chatId) => {
    try {
      const row = db.prepare(`
        SELECT
          COUNT(*) as total_members,
          SUM(CASE WHEN member_type = 'user' THEN 1 ELSE 0 END) as user_count,
          SUM(CASE WHEN member_type = 'app' THEN 1 ELSE 0 END) as bot_count
        FROM feishu_group_members
        WHERE chat_id = ?
      `).get(chatId);
      return row;
    } catch (err) {
      throw err;
    }
  }
};

export {
  db,
  initializeDatabase,
  userDb,
  apiKeysDb,
  credentialsDb,
  githubTokensDb, // Backward compatibility
  feishuDb
};

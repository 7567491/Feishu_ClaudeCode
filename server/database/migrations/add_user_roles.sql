-- 添加用户角色支持
-- 第一个用户自动成为管理员，后续用户默认为普通用户

-- 1. 添加角色字段
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'viewer'));

-- 2. 添加邮箱字段（多用户系统必备）
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;

-- 3. 添加更多用户管理字段
ALTER TABLE users ADD COLUMN created_by INTEGER REFERENCES users(id);
ALTER TABLE users ADD COLUMN max_projects INTEGER DEFAULT 10;
ALTER TABLE users ADD COLUMN max_api_keys INTEGER DEFAULT 5;

-- 4. 更新现有用户为管理员
UPDATE users SET role = 'admin' WHERE id = 1;

-- 5. 创建用户邀请表（可选，用于控制谁可以注册）
CREATE TABLE IF NOT EXISTS user_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_code TEXT UNIQUE NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'user' CHECK(role IN ('admin', 'user', 'viewer')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  used_at DATETIME,
  used_by INTEGER REFERENCES users(id),
  expires_at DATETIME,
  is_active BOOLEAN DEFAULT 1
);

-- 6. 创建用户会话管理表（用于追踪活跃会话）
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT UNIQUE NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME,
  is_active BOOLEAN DEFAULT 1
);

-- 创建索引
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_user_invitations_code ON user_invitations(invite_code);
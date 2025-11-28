-- Initialize authentication database
PRAGMA foreign_keys = ON;

-- Users table (single user system)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1,
    git_name TEXT,
    git_email TEXT,
    has_completed_onboarding BOOLEAN DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- API Keys table for external API access
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key_name TEXT NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used DATETIME,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

-- User credentials table for storing various tokens/credentials (GitHub, GitLab, etc.)
CREATE TABLE IF NOT EXISTS user_credentials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    credential_name TEXT NOT NULL,
    credential_type TEXT NOT NULL, -- 'github_token', 'gitlab_token', 'bitbucket_token', etc.
    credential_value TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_type ON user_credentials(credential_type);
CREATE INDEX IF NOT EXISTS idx_user_credentials_active ON user_credentials(is_active);

-- Feishu sessions table for tracking Feishu bot conversations
CREATE TABLE IF NOT EXISTS feishu_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT UNIQUE NOT NULL, -- user-{open_id} or group-{chat_id}
    feishu_id TEXT NOT NULL, -- open_id or chat_id
    session_type TEXT NOT NULL, -- 'private' or 'group'
    project_path TEXT NOT NULL, -- ./feicc/user-xxx/ or ./feicc/group-xxx/
    claude_session_id TEXT, -- Claude CLI session ID
    user_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feishu_sessions_conversation_id ON feishu_sessions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_feishu_sessions_feishu_id ON feishu_sessions(feishu_id);
CREATE INDEX IF NOT EXISTS idx_feishu_sessions_user_id ON feishu_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_feishu_sessions_active ON feishu_sessions(is_active);

-- Feishu message log table for tracking all messages
CREATE TABLE IF NOT EXISTS feishu_message_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    message_id TEXT, -- Feishu message ID
    direction TEXT NOT NULL, -- 'incoming' or 'outgoing'
    message_type TEXT NOT NULL, -- 'text', 'image', etc.
    content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES feishu_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_feishu_message_log_session_id ON feishu_message_log(session_id);
CREATE INDEX IF NOT EXISTS idx_feishu_message_log_created_at ON feishu_message_log(created_at);
-- Feishu group members table for tracking group chat members
CREATE TABLE IF NOT EXISTS feishu_group_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL, -- Group chat ID (oc_xxx)
    member_open_id TEXT NOT NULL, -- Member's open_id (ou_xxx)
    member_user_id TEXT, -- Member's user_id if available
    member_name TEXT, -- Member's display name
    member_type TEXT, -- 'user' or 'app' (bot)
    tenant_key TEXT, -- Tenant key for cross-tenant identification
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(chat_id, member_open_id)
);

CREATE INDEX IF NOT EXISTS idx_feishu_group_members_chat_id ON feishu_group_members(chat_id);
CREATE INDEX IF NOT EXISTS idx_feishu_group_members_open_id ON feishu_group_members(member_open_id);
CREATE INDEX IF NOT EXISTS idx_feishu_group_members_user_id ON feishu_group_members(member_user_id);

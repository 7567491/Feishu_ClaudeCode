-- 飞书文档编辑会话表
CREATE TABLE IF NOT EXISTS feishu_edit_sessions (
  id TEXT PRIMARY KEY,                    -- 会话UUID
  chat_id TEXT NOT NULL,                  -- 飞书聊天ID
  user_id TEXT,                           -- 用户ID
  document_id TEXT NOT NULL,              -- 飞书文档ID
  document_url TEXT NOT NULL,             -- 飞书文档URL
  local_path TEXT NOT NULL,               -- 本地文件路径
  file_name TEXT NOT NULL,                -- 文件名
  original_content TEXT,                  -- 编辑开始时的原始内容
  last_revision_id TEXT,                  -- 最后同步的文档版本ID
  last_sync_time INTEGER,                 -- 最后同步时间（Unix时间戳）
  sync_count INTEGER DEFAULT 0,           -- 同步次数
  conflict_count INTEGER DEFAULT 0,       -- 冲突次数
  status TEXT DEFAULT 'editing',          -- 状态: editing, syncing, completed, conflict, error
  created_at INTEGER DEFAULT (strftime('%s', 'now')),  -- 创建时间
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),  -- 更新时间
  end_time INTEGER                        -- 结束时间
);

-- 同步日志表
CREATE TABLE IF NOT EXISTS feishu_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,               -- 关联会话ID
  action TEXT NOT NULL,                   -- 动作: sync_from_feishu, sync_to_feishu, conflict
  file_path TEXT NOT NULL,                -- 文件路径
  content_hash TEXT,                      -- 内容哈希值
  content_size INTEGER,                   -- 内容大小（字节）
  error_message TEXT,                     -- 错误信息
  duration_ms INTEGER,                    -- 操作耗时（毫秒）
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (session_id) REFERENCES feishu_edit_sessions(id) ON DELETE CASCADE
);

-- 冲突记录表
CREATE TABLE IF NOT EXISTS feishu_conflict_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,               -- 关联会话ID
  conflict_file_path TEXT,                -- 冲突文件保存路径
  local_content TEXT,                     -- 本地内容
  remote_content TEXT,                    -- 远程内容
  base_content TEXT,                      -- 基准内容
  resolved INTEGER DEFAULT 0,             -- 是否已解决
  resolution_type TEXT,                   -- 解决方式: manual, auto_merge, use_local, use_remote
  resolved_content TEXT,                  -- 解决后的内容
  resolved_by TEXT,                       -- 解决者
  resolved_at INTEGER,                    -- 解决时间
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (session_id) REFERENCES feishu_edit_sessions(id) ON DELETE CASCADE
);

-- 文档版本历史表（可选，用于更细粒度的版本控制）
CREATE TABLE IF NOT EXISTS feishu_doc_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,               -- 关联会话ID
  document_id TEXT NOT NULL,              -- 飞书文档ID
  revision_id TEXT NOT NULL,              -- 版本ID
  content TEXT,                           -- 内容快照
  content_hash TEXT,                      -- 内容哈希
  change_summary TEXT,                    -- 变更摘要
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (session_id) REFERENCES feishu_edit_sessions(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_sessions_chat_id ON feishu_edit_sessions(chat_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON feishu_edit_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON feishu_edit_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_composite ON feishu_edit_sessions(chat_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_logs_session_id ON feishu_sync_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_logs_action ON feishu_sync_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON feishu_sync_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_composite ON feishu_sync_logs(session_id, action, created_at);

CREATE INDEX IF NOT EXISTS idx_conflicts_session_id ON feishu_conflict_records(session_id);
CREATE INDEX IF NOT EXISTS idx_conflicts_resolved ON feishu_conflict_records(resolved);
CREATE INDEX IF NOT EXISTS idx_conflicts_created_at ON feishu_conflict_records(created_at);
CREATE INDEX IF NOT EXISTS idx_conflicts_composite ON feishu_conflict_records(session_id, resolved, created_at);

CREATE INDEX IF NOT EXISTS idx_versions_session_document ON feishu_doc_versions(session_id, document_id);
CREATE INDEX IF NOT EXISTS idx_versions_revision_id ON feishu_doc_versions(revision_id);
CREATE INDEX IF NOT EXISTS idx_versions_created_at ON feishu_doc_versions(created_at);

-- 创建视图：活跃的编辑会话
CREATE VIEW IF NOT EXISTS active_edit_sessions AS
SELECT
  id,
  chat_id,
  user_id,
  file_name,
  document_url,
  status,
  sync_count,
  conflict_count,
  datetime(created_at, 'unixepoch', 'localtime') as created_time,
  datetime(last_sync_time, 'unixepoch', 'localtime') as last_sync,
  (strftime('%s', 'now') - created_at) / 60 as duration_minutes
FROM feishu_edit_sessions
WHERE status = 'editing'
  AND created_at > strftime('%s', 'now', '-24 hours')
ORDER BY created_at DESC;

-- 创建视图：同步统计
CREATE VIEW IF NOT EXISTS sync_statistics AS
SELECT
  s.session_id,
  e.file_name,
  COUNT(*) as total_syncs,
  COUNT(CASE WHEN s.action = 'sync_from_feishu' THEN 1 END) as from_feishu_count,
  COUNT(CASE WHEN s.action = 'sync_to_feishu' THEN 1 END) as to_feishu_count,
  COUNT(CASE WHEN s.action = 'conflict' THEN 1 END) as conflict_count,
  AVG(s.duration_ms) as avg_duration_ms,
  MAX(s.duration_ms) as max_duration_ms,
  SUM(s.content_size) as total_bytes_synced,
  datetime(MAX(s.created_at), 'unixepoch', 'localtime') as last_sync_time
FROM feishu_sync_logs s
JOIN feishu_edit_sessions e ON s.session_id = e.id
GROUP BY s.session_id, e.file_name;

-- 创建触发器：自动更新 updated_at 字段
CREATE TRIGGER IF NOT EXISTS update_edit_sessions_updated_at
AFTER UPDATE ON feishu_edit_sessions
FOR EACH ROW
BEGIN
  UPDATE feishu_edit_sessions
  SET updated_at = strftime('%s', 'now')
  WHERE id = NEW.id;
END;
/**
 * 飞书文档双向编辑器
 * 实现MD文件与飞书文档的双向同步编辑
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

class FeishuDocEditor {
  constructor(feishuClient, database) {
    this.feishuClient = feishuClient;
    this.database = database;
    this.editSessions = new Map();
    this.syncInterval = process.env.FEISHU_DOC_SYNC_INTERVAL || 30000; // 默认30秒

    console.log('[FeishuDocEditor] Initialized with sync interval:', this.syncInterval);
  }

  /**
   * 解析编辑命令
   */
  parseEditCommand(text) {
    const patterns = [
      /^编辑\s+(.+\.md)$/i,
      /^edit\s+(.+\.md)$/i,
      /^修改\s+(.+\.md)$/i,
      /^在线编辑\s+(.+\.md)$/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          command: 'edit',
          fileName: match[1].trim()
        };
      }
    }

    // 检查停止编辑命令
    if (text.match(/^(停止编辑|完成编辑|结束编辑|stop\s+edit|finish\s+edit)$/i)) {
      return { command: 'stop_edit' };
    }

    // 查看编辑状态
    if (text.match(/^(查看编辑状态|编辑状态|edit\s+status)$/i)) {
      return { command: 'edit_status' };
    }

    return null;
  }

  /**
   * 启动编辑会话
   */
  async startEditSession(chatId, mdFilePath, userId = null) {
    try {
      // 1. 检查文件是否存在
      await fs.access(mdFilePath);

      // 2. 读取本地MD文件
      const content = await fs.readFile(mdFilePath, 'utf-8');
      const fileName = path.basename(mdFilePath);

      // 3. 检查是否已有该文件的编辑会话
      const existingSession = this.findSessionByFile(mdFilePath);
      if (existingSession) {
        return {
          success: false,
          message: `⚠️ 该文件已在编辑中\n编辑链接：${existingSession.documentUrl}\n会话ID：${existingSession.sessionId}`
        };
      }

      // 4. 创建飞书文档
      console.log(`[DocEditor] Creating Feishu document for ${fileName}`);
      const doc = await this.feishuClient.createDocumentFromMarkdown(
        `[编辑中] ${fileName}`,
        content,
        {
          setPermission: true,
          linkShareEntity: 'anyone_can_edit'
        }
      );

      // 5. 创建编辑会话
      const sessionId = crypto.randomUUID();
      const session = {
        sessionId,
        chatId,
        userId,
        documentId: doc.document_id,
        documentUrl: doc.url,
        localPath: mdFilePath,
        fileName,
        originalContent: content,
        lastSyncContent: content,
        lastRevisionId: null,
        lastSyncTime: Date.now(),
        createTime: Date.now(),
        syncTimer: null,
        syncCount: 0,
        status: 'editing', // editing | syncing | completed | conflict | error
        conflictCount: 0
      };

      // 6. 保存会话到数据库
      await this.saveSessionToDatabase(session);

      // 7. 启动同步定时器
      session.syncTimer = setInterval(async () => {
        await this.syncDocument(sessionId);
      }, this.syncInterval);

      this.editSessions.set(sessionId, session);

      console.log(`[DocEditor] Edit session created: ${sessionId}`);

      // 8. 返回编辑信息
      return {
        success: true,
        sessionId,
        documentUrl: doc.url,
        message: this.formatStartMessage(doc.url, sessionId)
      };
    } catch (error) {
      console.error('[DocEditor] Failed to start edit session:', error);
      return {
        success: false,
        message: `❌ 启动编辑失败：${error.message}`
      };
    }
  }

  /**
   * 同步文档（由定时器调用）
   */
  async syncDocument(sessionId) {
    const session = this.editSessions.get(sessionId);
    if (!session || session.status !== 'editing') {
      return;
    }

    console.log(`[DocEditor] Starting sync for session ${sessionId}`);

    try {
      session.status = 'syncing';

      // 调用读取器获取飞书文档内容
      const { FeishuDocReader } = await import('./feishu-doc-reader.js');
      const reader = new FeishuDocReader(this.feishuClient);
      const docContent = await reader.readDocumentAsMarkdown(session.documentId);

      // 检查是否有变化
      if (docContent.content === session.lastSyncContent) {
        console.log(`[DocEditor] No changes detected for session ${sessionId}`);
        session.status = 'editing';
        return;
      }

      // 读取本地文件当前内容
      const localContent = await fs.readFile(session.localPath, 'utf-8');

      // 检测是否有冲突
      if (localContent !== session.lastSyncContent) {
        // 本地也有修改，产生冲突
        await this.handleConflict(session, docContent.content, localContent);
      } else {
        // 无冲突，直接写入本地
        await this.writeToLocal(session, docContent.content);
        session.lastSyncContent = docContent.content;
        session.syncCount++;

        console.log(`[DocEditor] Sync completed for session ${sessionId}, sync count: ${session.syncCount}`);
      }

      session.lastRevisionId = docContent.revisionId;
      session.lastSyncTime = Date.now();
      session.status = 'editing';

      // 更新数据库
      await this.updateSessionInDatabase(session);

    } catch (error) {
      console.error(`[DocEditor] Sync error for session ${sessionId}:`, error);
      session.status = 'error';

      // 发送错误通知
      await this.notifyUser(session.chatId,
        `⚠️ 同步出错（会话${sessionId.slice(0, 8)}）：${error.message}`
      );
    }
  }

  /**
   * 停止编辑会话
   */
  async stopEditSession(sessionId) {
    const session = this.editSessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        message: '❌ 未找到编辑会话'
      };
    }

    try {
      console.log(`[DocEditor] Stopping edit session ${sessionId}`);

      // 1. 最后一次同步
      if (session.status === 'editing') {
        await this.syncDocument(sessionId);
      }

      // 2. 清理定时器
      if (session.syncTimer) {
        clearInterval(session.syncTimer);
        session.syncTimer = null;
      }

      // 3. 更新文档标题（移除"编辑中"标记）
      // TODO: 实现更新文档标题的API调用

      // 4. 更新数据库状态
      session.status = 'completed';
      session.endTime = Date.now();
      await this.updateSessionInDatabase(session);

      // 5. 从内存中移除会话
      this.editSessions.delete(sessionId);

      const duration = Math.round((Date.now() - session.createTime) / 1000 / 60);

      return {
        success: true,
        message: this.formatStopMessage(session, duration)
      };
    } catch (error) {
      console.error(`[DocEditor] Failed to stop session ${sessionId}:`, error);
      return {
        success: false,
        message: `❌ 停止编辑失败：${error.message}`
      };
    }
  }

  /**
   * 查看编辑状态
   */
  async getEditStatus(chatId) {
    const activeSessions = [];

    for (const [sessionId, session] of this.editSessions) {
      if (session.chatId === chatId) {
        const duration = Math.round((Date.now() - session.createTime) / 1000 / 60);
        activeSessions.push({
          sessionId: sessionId.slice(0, 8),
          fileName: session.fileName,
          status: session.status,
          syncCount: session.syncCount,
          duration,
          documentUrl: session.documentUrl
        });
      }
    }

    if (activeSessions.length === 0) {
      return '当前没有活跃的编辑会话';
    }

    let message = '📝 **活跃的编辑会话**\n\n';
    for (const session of activeSessions) {
      message += `• 文件：${session.fileName}\n`;
      message += `  会话：${session.sessionId}\n`;
      message += `  状态：${this.getStatusEmoji(session.status)} ${session.status}\n`;
      message += `  同步次数：${session.syncCount}\n`;
      message += `  持续时间：${session.duration}分钟\n`;
      message += `  链接：${session.documentUrl}\n\n`;
    }

    return message;
  }

  /**
   * 写入本地文件
   */
  async writeToLocal(session, content) {
    // 创建备份
    const backupPath = session.localPath + '.backup';
    const currentContent = await fs.readFile(session.localPath, 'utf-8');
    await fs.writeFile(backupPath, currentContent);

    // 写入新内容
    await fs.writeFile(session.localPath, content, 'utf-8');

    console.log(`[DocEditor] Written to local file: ${session.localPath}`);
  }

  /**
   * 处理冲突
   */
  async handleConflict(session, remoteContent, localContent) {
    session.status = 'conflict';
    session.conflictCount++;

    const conflictPath = session.localPath.replace('.md', `.conflict.${Date.now()}.md`);
    const conflictContent = `# 文档同步冲突

## 冲突信息
- 文件：${session.fileName}
- 会话ID：${session.sessionId}
- 冲突时间：${new Date().toLocaleString()}
- 这是第 ${session.conflictCount} 次冲突

## 飞书文档版本
${remoteContent}

## 本地文件版本
${localContent}

## 原始版本（编辑开始时）
${session.originalContent}

---
请手动解决冲突后，将正确内容保存到原文件：${session.localPath}
`;

    await fs.writeFile(conflictPath, conflictContent);

    await this.notifyUser(session.chatId,
      `⚠️ **编辑冲突**\n\n` +
      `文件：${session.fileName}\n` +
      `冲突文件已保存：${path.basename(conflictPath)}\n` +
      `请手动解决冲突，或使用"停止编辑"命令结束会话。`
    );

    console.log(`[DocEditor] Conflict handled for session ${session.sessionId}`);
  }

  /**
   * 通知用户
   */
  async notifyUser(chatId, message) {
    try {
      await this.feishuClient.sendTextMessage(chatId, message);
    } catch (error) {
      console.error('[DocEditor] Failed to notify user:', error);
    }
  }

  /**
   * 辅助方法
   */

  findSessionByFile(filePath) {
    for (const [_, session] of this.editSessions) {
      if (session.localPath === filePath && session.status === 'editing') {
        return session;
      }
    }
    return null;
  }

  findActiveSessionByChatId(chatId) {
    for (const [sessionId, session] of this.editSessions) {
      if (session.chatId === chatId && session.status === 'editing') {
        return session;
      }
    }
    return null;
  }

  findSessionByChat(chatId) {
    return this.findActiveSessionByChatId(chatId);
  }

  formatStartMessage(documentUrl, sessionId) {
    return `✅ **文档编辑会话已创建**

📝 编辑链接：${documentUrl}
🔑 会话ID：${sessionId.slice(0, 8)}
⏱ 同步间隔：每${this.syncInterval / 1000}秒自动同步

**使用说明：**
• 点击链接在飞书中编辑文档
• 修改会自动同步到本地MD文件
• 发送"停止编辑"结束会话
• 发送"编辑状态"查看进度

⚠️ 注意：请避免同时在本地和飞书编辑，以免产生冲突`;
  }

  formatStopMessage(session, duration) {
    return `✅ **编辑会话已结束**

📄 文件：${session.fileName}
⏱ 持续时间：${duration}分钟
🔄 总同步次数：${session.syncCount}次
⚠️ 冲突次数：${session.conflictCount}次

文档已保存到本地：${session.localPath}`;
  }

  getStatusEmoji(status) {
    const emojis = {
      'editing': '✏️',
      'syncing': '🔄',
      'completed': '✅',
      'conflict': '⚠️',
      'error': '❌'
    };
    return emojis[status] || '❓';
  }

  /**
   * 数据库操作
   */

  async saveSessionToDatabase(session) {
    try {
      const query = `
        INSERT INTO feishu_edit_sessions (
          id, chat_id, user_id, document_id, document_url,
          local_path, file_name, original_content,
          status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.database.run(query, [
        session.sessionId,
        session.chatId,
        session.userId,
        session.documentId,
        session.documentUrl,
        session.localPath,
        session.fileName,
        session.originalContent,
        session.status,
        Math.floor(session.createTime / 1000)
      ]);
    } catch (error) {
      console.error('[DocEditor] Failed to save session to database:', error);
    }
  }

  async updateSessionInDatabase(session) {
    try {
      const query = `
        UPDATE feishu_edit_sessions
        SET last_revision_id = ?, last_sync_time = ?,
            sync_count = ?, status = ?, conflict_count = ?,
            updated_at = ?
        WHERE id = ?
      `;

      await this.database.run(query, [
        session.lastRevisionId,
        Math.floor(session.lastSyncTime / 1000),
        session.syncCount,
        session.status,
        session.conflictCount,
        Math.floor(Date.now() / 1000),
        session.sessionId
      ]);
    } catch (error) {
      console.error('[DocEditor] Failed to update session in database:', error);
    }
  }

  /**
   * 恢复会话（服务重启时）
   */
  async restoreSessions() {
    try {
      const query = `
        SELECT * FROM feishu_edit_sessions
        WHERE status = 'editing'
        AND created_at > ?
      `;

      const oneDayAgo = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
      const sessions = await this.database.all(query, [oneDayAgo]);

      for (const dbSession of sessions) {
        const session = {
          sessionId: dbSession.id,
          chatId: dbSession.chat_id,
          userId: dbSession.user_id,
          documentId: dbSession.document_id,
          documentUrl: dbSession.document_url,
          localPath: dbSession.local_path,
          fileName: dbSession.file_name,
          originalContent: dbSession.original_content,
          lastSyncContent: dbSession.original_content,
          lastRevisionId: dbSession.last_revision_id,
          lastSyncTime: dbSession.last_sync_time * 1000,
          createTime: dbSession.created_at * 1000,
          syncTimer: null,
          syncCount: dbSession.sync_count || 0,
          status: 'editing',
          conflictCount: dbSession.conflict_count || 0
        };

        // 重新启动同步定时器
        session.syncTimer = setInterval(async () => {
          await this.syncDocument(session.sessionId);
        }, this.syncInterval);

        this.editSessions.set(session.sessionId, session);
        console.log(`[DocEditor] Restored session: ${session.sessionId}`);
      }

      console.log(`[DocEditor] Restored ${sessions.length} active sessions`);
    } catch (error) {
      console.error('[DocEditor] Failed to restore sessions:', error);
    }
  }
}

export { FeishuDocEditor };
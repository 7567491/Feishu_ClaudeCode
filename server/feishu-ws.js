#!/usr/bin/env node
/**
 * Feishu WebSocket Service
 *
 * Main service that integrates all Feishu components:
 * - FeishuClient for WebSocket connection
 * - FeishuSessionManager for session management
 * - FeishuMessageWriter for message streaming
 * - queryClaude for Claude integration
 */

import { FeishuClient } from './lib/feishu-client.js';
import { FeishuSessionManager } from './lib/feishu-session.js';
import { FeishuMessageWriter } from './lib/feishu-message-writer.js';
import { FeishuFileHandler } from './lib/feishu-file-handler.js';
import { FeishuFileWatcher } from './lib/feishu-file-watcher.js';
import { queryClaude } from './claude-cli.js';
import { credentialsDb, userDb, feishuDb, initializeDatabase } from './database/db.js';
import { contextManager } from './lib/context-manager.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FeishuService {
  constructor() {
    this.client = null;
    this.sessionManager = null;
    this.fileWatcher = null;
    this.userId = null;
    this.isRunning = false;

    console.log('[FeishuService] Initialized');
  }

  /**
   * Load configuration from database
   */
  async loadConfig() {
    console.log('[FeishuService] Loading configuration...');

    // Initialize database
    await initializeDatabase();

    // Get first user (single-user system)
    const user = userDb.getFirstUser();
    if (!user) {
      throw new Error('No user found. Please create a user first.');
    }

    this.userId = user.id;
    console.log('[FeishuService] Using user:', user.username);

    // Get Feishu credentials
    // Try to get from database first, fall back to environment variables
    let appId, appSecret;

    const credentialValue = credentialsDb.getActiveCredential(this.userId, 'feishu');
    if (credentialValue) {
      console.log('[FeishuService] Using Feishu credentials from database');
      try {
        const credentials = JSON.parse(credentialValue);
        appId = credentials.appId;
        appSecret = credentials.appSecret;
      } catch (error) {
        console.error('[FeishuService] Failed to parse credentials:', error.message);
      }
    }

    // Fall back to environment variables
    if (!appId || !appSecret) {
      console.log('[FeishuService] Using Feishu credentials from environment');
      appId = process.env.FeishuCC_App_ID;
      appSecret = process.env.FeishuCC_App_Secret;
    }

    if (!appId || !appSecret) {
      throw new Error('Feishu credentials not found. Please set FeishuCC_App_ID and FeishuCC_App_Secret environment variables or add credentials in database.');
    }

    return { appId, appSecret };
  }

  /**
   * Start the service
   */
  async start() {
    if (this.isRunning) {
      console.log('[FeishuService] Already running');
      return;
    }

    try {
      // Load configuration
      const config = await this.loadConfig();

      // Create Feishu client first
      this.client = new FeishuClient({
        appId: config.appId,
        appSecret: config.appSecret
      });

      // Create session manager with client reference
      this.sessionManager = new FeishuSessionManager(this.userId, './feicc', this.client);

      // Clear old Claude session IDs on startup (only sessions inactive for 24+ hours)
      console.log('[FeishuService] 🧹 Clearing Claude session IDs inactive for 24+ hours...');
      const staleCount = feishuDb.clearOldClaudeSessionIds(24);
      console.log(`[FeishuService] ✅ Cleared ${staleCount} old session IDs (24h+ inactive)`);

      // Start client with message handler
      await this.client.start(this.handleMessage.bind(this));

      // Create and start file watcher
      const watchPath = path.resolve(__dirname, '..');
      this.fileWatcher = new FeishuFileWatcher(watchPath, {
        enabled: false, // 关闭自动推送，改为按指令发送
        debounceDelay: 3000
      });
      this.fileWatcher.setClient(this.client);
      this.fileWatcher.start();

      this.isRunning = true;
      console.log('[FeishuService] Service started successfully');

    } catch (error) {
      console.error('[FeishuService] Failed to start service:', error.message);
      console.error(error.stack);
      throw error;
    }
  }

  /**
   * Stop the service
   */
  async stop() {
    if (!this.isRunning) {
      console.log('[FeishuService] Not running');
      return;
    }

    try {
      if (this.fileWatcher) {
        await this.fileWatcher.stop();
      }

      if (this.client) {
        await this.client.stop();
      }

      this.isRunning = false;
      console.log('[FeishuService] Service stopped');

    } catch (error) {
      console.error('[FeishuService] Error stopping service:', error.message);
    }
  }

  /**
   * Handle file message (file/image/media upload)
   */
  async handleFileMessage(event, session, chatId, filePayload) {
    console.log('[FeishuService] Handling file message:', filePayload);

    try {
      // Send confirmation
      await this.client.sendTextMessage(chatId, '📥 收到文件，正在下载到工作目录...');

      const { type, fileKey, fileName } = filePayload;
      const messageId = event.message?.message_id;

      let downloadResult;

      // Download file based on type
      if (type === 'image') {
        downloadResult = await this.client.downloadImage(fileKey, messageId);
      } else if (type === 'file' || type === 'media') {
        downloadResult = await this.client.downloadFile(fileKey, messageId);
      } else {
        throw new Error(`不支持的文件类型: ${type}`);
      }

      // Save to project directory
      const { buffer, fileName: finalFileName, fileSize } = downloadResult;
      const filePath = path.join(session.project_path, finalFileName);

      // Write file
      fs.writeFileSync(filePath, buffer);

      console.log('[FeishuService] File saved to:', filePath);

      // Send success message
      const sizeKB = (fileSize / 1024).toFixed(2);
      await this.client.sendTextMessage(
        chatId,
        `✅ 文件已保存到工作目录：\n` +
        `📄 文件名：${finalFileName}\n` +
        `📂 路径：${filePath}\n` +
        `💾 大小：${sizeKB} KB`
      );

      // Log to database
      feishuDb.logMessage(session.id, 'incoming', type, `file:${finalFileName}`, messageId);
      feishuDb.updateSessionActivity(session.id);

      console.log('[FeishuService] File message handled successfully');

    } catch (error) {
      console.error('[FeishuService] Error handling file message:', error.message);
      await this.client.sendTextMessage(chatId, `❌ 文件下载失败: ${error.message}`);
    }
  }

  /**
   * Handle incoming message
   * This is the core message processing logic
   */
  async handleMessage(event, userText, filePayload = null) {
    console.log('[FeishuService] Handling message:', userText || 'FILE');

    try {
      // Get or create session
      const session = await this.sessionManager.getOrCreateSession(event);
      console.log('[FeishuService] Session:', session.id);

      // Get chat ID for sending messages
      const chatId = this.sessionManager.getFeishuId(event);

      // Handle file message
      if (filePayload) {
        return await this.handleFileMessage(event, session, chatId, filePayload);
      }

      // Update active chat for file watcher
      if (this.fileWatcher) {
        this.fileWatcher.setActiveChatId(chatId);
      }

      // Determine confirmation message based on content
      let confirmationMessage = '🤔 收到！正在调用Claude…';

      // Check if it's a file command
      const fileCommand = FeishuFileHandler.parseFileCommand(userText);
      const convertCommand = FeishuFileHandler.parseConvertCommand(userText);
      if ((fileCommand && fileCommand.command === 'send') ||
          (convertCommand && convertCommand.command === 'convert')) {
        confirmationMessage = '📁 收到，我来处理文件';
      }

      // Check if it's a Linux command
      const trimmedText = userText.trim();
      const lowerText = trimmedText.toLowerCase();
      const linuxCommands = ['ls', 'pwd', 'cd', 'cat', 'echo', 'mkdir', 'rm', 'mv', 'cp',
                             'touch', 'chmod', 'chown', 'ps', 'df', 'du', 'whoami',
                             'date', 'uname', 'which', 'whereis', 'find', 'grep', 'head', 'tail'];
      const firstWord = lowerText.split(/\s+/)[0];
      const isLinuxCommand = linuxCommands.includes(firstWord) ||
                             lowerText.startsWith('ls ') ||
                             lowerText.startsWith('cd ') ||
                             lowerText.startsWith('cat ') ||
                             lowerText.startsWith('./') ||
                             lowerText.startsWith('sudo ');

      if (isLinuxCommand) {
        confirmationMessage = '💻 收到，正在执行命令...';
      }

      // Send immediate confirmation message to improve user experience
      try {
        await this.client.sendTextMessage(chatId, confirmationMessage);
        console.log('[FeishuService] Sent confirmation message:', confirmationMessage);
      } catch (error) {
        console.error('[FeishuService] Failed to send confirmation message:', error.message);
        // Continue processing even if confirmation fails
      }

      // Check if session is busy
      if (this.sessionManager.isSessionBusy(session)) {
        console.log('[FeishuService] Session is busy, sending wait message');
        await this.client.sendTextMessage(chatId, '⏳ 正在处理中，请稍候...');
        return;
      }

      // Log incoming message
      try {
        feishuDb.logMessage(
          session.id,
          'incoming',
          'text',
          userText,
          event.message?.message_id
        );
      } catch (error) {
        console.error('[FeishuService] Failed to log message:', error.message);
        // Continue anyway
      }

      // Check if this is a /clear command to reset conversation context
      if (userText.trim().toLowerCase() === '/clear') {
        console.log('[FeishuService] /clear command detected, clearing session context');

        try {
          // Clear Claude session ID from database
          feishuDb.clearSessionClaudeSessionId(session.id);

          // Clear sent files tracking
          this.sessionManager.clearSentFiles(session.conversation_id);

          // Send confirmation
          await this.client.sendTextMessage(chatId, '🔄 会话已重置，上下文和文件发送记录已清空。');

          console.log('[FeishuService] Session context cleared successfully');
          return;

        } catch (error) {
          console.error('[FeishuService] Failed to clear session:', error.message);
          await this.client.sendTextMessage(chatId, `❌ 清空失败: ${error.message}`);
          return;
        }
      }

      // Check if this is a paper command
      if (trimmedText.toLowerCase().startsWith('paper ')) {
        const keyword = trimmedText.substring(6).trim();

        if (!keyword) {
          await this.client.sendTextMessage(chatId, '❌ 请提供关键词，例如：paper 深度学习');
          return;
        }

        console.log('[FeishuService] Paper command detected:', keyword);

        try {
          const { PaperHandler } = await import('../paper/lib/handler.js');
          const handler = new PaperHandler(this.client);
          await handler.handle(chatId, keyword, session);
          return;
        } catch (error) {
          console.error('[FeishuService] Paper command failed:', error.message);
          await this.client.sendTextMessage(chatId, `❌ Paper 指令处理失败: ${error.message}`);
          return;
        }
      }

      // Check if this is a file convert command (already parsed above)
      if (convertCommand && convertCommand.command === 'convert') {
        console.log('[FeishuService] File convert command detected:', convertCommand.fileName);
        try {
          await FeishuFileHandler.handleFileConvert(
            this.client,
            chatId,
            session.project_path,
            convertCommand.fileName
          );
          feishuDb.logMessage(session.id, 'outgoing', 'file', `convert:${convertCommand.fileName}`, null);
          feishuDb.updateSessionActivity(session.id);
          return;
        } catch (error) {
          console.error('[FeishuService] Failed to convert file:', error.message);
          await this.client.sendTextMessage(chatId, `❌ 转化失败: ${error.message}`);
          return;
        }
      }

      // Check if this is a file send command (already parsed above)
      if (fileCommand && fileCommand.command === 'send') {
        console.log('[FeishuService] File send command detected:', fileCommand.fileName);

        try {
          await FeishuFileHandler.handleFileSend(
            this.client,
            chatId,
            session.project_path,
            fileCommand.fileName
          );

          // Log success
          feishuDb.logMessage(session.id, 'outgoing', 'file', fileCommand.fileName, null);
          feishuDb.updateSessionActivity(session.id);

          console.log('[FeishuService] File sent successfully');
          return;

        } catch (error) {
          console.error('[FeishuService] Failed to send file:', error.message);
          await this.client.sendTextMessage(chatId, `❌ 发送失败: ${error.message}`);
          return;
        }
      }

      // Check if it's a Linux command and execute directly (already determined above)
      if (isLinuxCommand) {
        console.log('[FeishuService] Linux command detected:', trimmedText);

        try {
          const execAsync = promisify(exec);

          // Handle cd command - disabled to prevent project_path inconsistency
          // See RCA: cd command was modifying session.project_path without database persistence
          if (firstWord === 'cd') {
            await this.client.sendTextMessage(chatId,
              `⚠️ cd 命令已禁用，工作目录固定为：\`${session.project_path}\`\n` +
              `如需在子目录执行命令，请使用相对路径，如：\`ls subdir/\` 或 \`cat subdir/file.txt\``
            );
            feishuDb.logMessage(session.id, 'outgoing', 'command', `cd (blocked): ${trimmedText}`, null);
            return;
          }

          // Execute other Linux commands
          const { stdout, stderr } = await execAsync(trimmedText, {
            cwd: session.project_path,
            shell: '/bin/bash',
            timeout: 30000, // 30 seconds timeout
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
          });

          let output = stdout || '';
          if (stderr) {
            output += (output ? '\n' : '') + `⚠️ 错误输出:\n${stderr}`;
          }

          if (!output) {
            output = '✅ 命令执行成功（无输出）';
          }

          // Format output with code block
          const formattedOutput = `\`\`\`\n${output}\n\`\`\``;

          // Send result to Feishu
          await this.client.sendTextMessage(chatId, formattedOutput);

          // Log and update activity
          feishuDb.logMessage(session.id, 'outgoing', 'command', trimmedText, null);
          feishuDb.updateSessionActivity(session.id);

          console.log('[FeishuService] Linux command executed successfully');
          return;

        } catch (error) {
          console.error('[FeishuService] Failed to execute command:', error.message);
          await this.client.sendTextMessage(chatId, `❌ 命令执行失败: ${error.message}`);
          return;
        }
      }

      // Create message writer
      const writer = new FeishuMessageWriter(
        this.client,
        chatId,
        session.claude_session_id,
        session.project_path,
        this.sessionManager,
        session.conversation_id
      );

      // Track Claude session ID
      let capturedClaudeSessionId = session.claude_session_id;

      // 🆕 混合双保险：构建上下文
      const hybridContext = contextManager.buildHybridContext(
        session.id,
        session.claude_session_id,
        userText
      );

      console.log('[FeishuService] 混合上下文统计:', hybridContext.stats);

      // 如果有数据库历史，将其格式化为前缀添加到消息中
      let enhancedMessage = userText;
      if (hybridContext.databaseHistory.length > 0) {
        const contextPrefix = contextManager.formatAsContextPrompt(hybridContext.databaseHistory);
        enhancedMessage = contextPrefix + userText;
        console.log('[FeishuService] 已添加数据库历史前缀，历史消息数:', hybridContext.databaseHistory.length);
      }

      // Prepare options for queryClaude
      const claudeOptions = {
        sessionId: session.claude_session_id, // Resume existing session or null for new
        cwd: session.project_path,
        skipPermissions: true, // Skip permissions for Feishu bot
        projectPath: session.project_path,
        // 传递混合上下文信息（用于日志和监控）
        contextInfo: {
          hasResume: hybridContext.useResume,
          historyMessageCount: hybridContext.stats.historyMessageCount,
          historyTokens: hybridContext.stats.estimatedTokens
        }
      };

      console.log('[FeishuService] Calling Claude with options:', claudeOptions);

      // Call Claude CLI（使用增强后的消息）
      try {
        await queryClaude(enhancedMessage, claudeOptions, writer);

        // Get session ID from writer (it's set by queryClaude)
        if (writer.sessionId && writer.sessionId !== capturedClaudeSessionId) {
          capturedClaudeSessionId = writer.sessionId;
          console.log('[FeishuService] Captured new Claude session ID:', capturedClaudeSessionId);

          // Update database
          this.sessionManager.updateClaudeSessionId(session.id, capturedClaudeSessionId);
        }

        // Complete the message stream
        await writer.complete();

        // Log successful completion
        feishuDb.logMessage(
          session.id,
          'outgoing',
          'text',
          'Response sent successfully',
          null
        );

        // Update session activity
        feishuDb.updateSessionActivity(session.id);

        console.log('[FeishuService] Message handled successfully');

      } catch (error) {
        console.error('[FeishuService] Error calling Claude:', error.message);
        console.error(error.stack);

        // Send error message
        try {
          await this.client.sendTextMessage(chatId, `❌ 处理失败: ${error.message}`);
        } catch (sendError) {
          console.error('[FeishuService] Failed to send error message:', sendError.message);
        }

        // Log error
        feishuDb.logMessage(
          session.id,
          'outgoing',
          'error',
          `Error: ${error.message}`,
          null
        );
      }

    } catch (error) {
      console.error('[FeishuService] Error handling message:', error.message);
      console.error(error.stack);

      // Try to send error message
      try {
        const chatId = this.sessionManager.getFeishuId(event);
        await this.client.sendTextMessage(chatId, `❌ 系统错误: ${error.message}`);
      } catch (sendError) {
        console.error('[FeishuService] Failed to send error message:', sendError.message);
      }
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      userId: this.userId,
      clientStatus: this.client ? this.client.getStatus() : null,
      stats: this.sessionManager ? this.sessionManager.getStats() : null,
      fileWatcher: this.fileWatcher ? this.fileWatcher.getStatus() : null
    };
  }
}

// Main entry point
async function main() {
  console.log('🚀 Starting Feishu WebSocket Service...\n');

  const service = new FeishuService();

  // Handle graceful shutdown
  const shutdown = async (signal) => {
    console.log(`\n\n📴 Received ${signal}, shutting down gracefully...`);

    try {
      await service.stop();
      console.log('✅ Service stopped successfully');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start service
  try {
    await service.start();
    console.log('\n✅ Feishu service is running');
    console.log('   Send a message to the bot in Feishu to test\n');

    // Keep process alive
    process.stdin.resume();

  } catch (error) {
    console.error('\n❌ Failed to start service:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for programmatic use
export { FeishuService };

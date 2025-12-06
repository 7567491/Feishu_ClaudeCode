/**
 * Feishu Proxy API
 *
 * 允许其他机器人通过HTTP调用小六的Claude能力
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { queryClaude } from '../claude-cli.js';
import { FeishuClient } from '../lib/feishu-client.js';
import { FeishuSessionManager } from '../lib/feishu-session.js';
import { FeishuMessageWriter } from '../lib/feishu-message-writer.js';
import { FeishuFileWatcher } from '../lib/feishu-file-watcher.js';
import { FeishuFileHandler } from '../lib/feishu-file-handler.js';
import { credentialsDb, userDb, feishuDb } from '../database/db.js';
import ConfigLoader from '../lib/feishu-shared/config-loader.js';
import DataAccess from '../lib/feishu-shared/data-access.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Global instances (shared with webhook)
let feishuClient = null;
let sessionManager = null;
let userId = null;
let fileWatcher = null;
const recentBotQueries = new Map(); // chatId|fromBot -> { message, ts }

/**
 * Initialize
 */
async function initializeProxy() {
  const user = userDb.getFirstUser();
  if (!user) {
    throw new Error('No user found');
  }

  userId = user.id; // Store userId

  // Get credentials using shared config loader
  const { appId, appSecret } = ConfigLoader.loadFeishuCredentials(user.id);

  feishuClient = new FeishuClient({ appId, appSecret });
  sessionManager = new FeishuSessionManager(userId, './feicc'); // Pass userId here

  // Create and start file watcher for auto-sending md files
  const watchPath = path.resolve(__dirname, '..');
  fileWatcher = new FeishuFileWatcher(watchPath, {
    enabled: false, // 关闭自动推送，改为按指令发送
    sendAsDocument: true,
    debounceDelay: 3000
  });
  fileWatcher.setClient(feishuClient);
  fileWatcher.start();

  console.log('[FeishuProxy] Initialized with userId:', userId);
  console.log('[FeishuProxy] File watcher started, monitoring:', watchPath);
}

/**
 * POST /api/feishu-proxy/query
 *
 * 允许其他机器人调用小六处理任务
 *
 * Body:
 * {
 *   "message": "开发一个扫雷游戏...",
 *   "chatId": "oc_xxx",  // 飞书群ID或用户open_id
 *   "fromBot": "AI初老师",  // 调用方机器人名称
 *   "apiKey": "xxx"  // API密钥（可选，用于鉴权）
 * }
 */
router.post('/query', async (req, res) => {
  try {
    // Initialize if needed
    if (!feishuClient || !sessionManager) {
      await initializeProxy();
    }

    const { message, chatId, fromBot = 'Unknown Bot', apiKey } = req.body;

    // Validate
    if (!message || !chatId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: message, chatId'
      });
    }

    // Optional: Check API key
    const expectedApiKey = process.env.FEISHU_PROXY_API_KEY;
    if (expectedApiKey && apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    console.log('[FeishuProxy] Received query from bot:', fromBot);
    console.log('[FeishuProxy] Message:', message);
    console.log('[FeishuProxy] Chat ID:', chatId);

    // Deduplicate rapid repeat calls from the same bot in the same chat
    const now = Date.now();
    const dedupeKey = `${chatId}|${fromBot}`;
    const normalizedMessage = String(message).trim();
    const last = recentBotQueries.get(dedupeKey);
    if (last && last.message === normalizedMessage && now - last.ts < 30000) {
      console.log('[FeishuProxy] Duplicate bot query detected, ignoring.');
      return res.json({
        success: true,
        skipped: true,
        reason: 'duplicate_recent'
      });
    }
    recentBotQueries.set(dedupeKey, { message: normalizedMessage, ts: now });
    // prune stale cache occasionally
    if (recentBotQueries.size > 200) {
      for (const [key, value] of recentBotQueries) {
        if (now - value.ts > 5 * 60 * 1000) {
          recentBotQueries.delete(key);
        }
      }
    }

    // Activate file watcher for this chat
    if (fileWatcher) {
      fileWatcher.setActiveChatId(chatId);
      console.log('[FeishuProxy] File watcher activated for chat:', chatId);
    }

    // Create fake event for session management
    const fakeEvent = {
      message: {
        chat_id: chatId,
        chat_type: chatId.startsWith('oc_') ? 'group' : 'p2p',
        message_id: `proxy_${Date.now()}`
      },
      sender: {
        sender_id: {
          open_id: fromBot
        },
        sender_type: 'app'
      }
    };

    // Get or create session
    const session = await sessionManager.getOrCreateSession(fakeEvent);
    console.log('[FeishuProxy] Session:', session.id);

    // Check if busy
    if (sessionManager.isSessionBusy(session)) {
      return res.status(429).json({
        success: false,
        error: 'Session is busy, please try again later'
      });
    }

    // Check if this is a paper command
    const trimmedMessage = message.trim();
    if (trimmedMessage.toLowerCase().startsWith('paper ')) {
      const keyword = trimmedMessage.substring(6).trim();

      if (!keyword) {
        await feishuClient.sendTextMessage(chatId, '❌ 请提供关键词，例如：paper 深度学习');
        return res.status(400).json({
          success: false,
          error: 'Missing keyword for paper command'
        });
      }

      console.log('[FeishuProxy] Paper command detected:', keyword);

      try {
        const { PaperCommandHandler } = await import('../lib/paper-command-handler.js');
        const handler = new PaperCommandHandler(feishuClient);
        await handler.handle(chatId, keyword, session);

        DataAccess.logMessage(session.id, 'outgoing', 'paper', `paper:${keyword}`, null);

        return res.json({
          success: true,
          message: `Paper command executed: ${keyword}`,
          sessionId: session.id
        });
      } catch (error) {
        console.error('[FeishuProxy] Paper command failed:', error.message);
        await feishuClient.sendTextMessage(chatId, `❌ Paper 指令处理失败: ${error.message}`);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }

    // Handle markdown convert command: "转化 xx.md"
    const convertCommand = FeishuFileHandler.parseConvertCommand(message);
    if (convertCommand && convertCommand.command === 'convert') {
      console.log('[FeishuProxy] File convert command detected:', convertCommand.fileName);
      try {
        await FeishuFileHandler.handleFileConvert(
          feishuClient,
          chatId,
          session.project_path,
          convertCommand.fileName
        );

        DataAccess.logMessage(session.id, 'outgoing', 'file', `convert:${convertCommand.fileName}`, null);

        return res.json({
          success: true,
          message: `File converted: ${convertCommand.fileName}`,
          sessionId: session.id
        });
      } catch (error) {
        console.error('[FeishuProxy] Failed to convert file:', error.message);
        await feishuClient.sendTextMessage(chatId, `❌ 转化失败: ${error.message}`);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }

    // Handle direct file send command: "发送 xx.md"
    const fileCommand = FeishuFileHandler.parseFileCommand(message);
    if (fileCommand && fileCommand.command === 'send') {
      console.log('[FeishuProxy] File send command detected:', fileCommand.fileName);

      try {
        await FeishuFileHandler.handleFileSend(
          feishuClient,
          chatId,
          session.project_path,
          fileCommand.fileName
        );

        DataAccess.logMessage(session.id, 'outgoing', 'file', fileCommand.fileName, null);

        console.log('[FeishuProxy] File sent successfully');
        return res.json({
          success: true,
          message: `File sent: ${fileCommand.fileName}`,
          sessionId: session.id
        });

      } catch (error) {
        console.error('[FeishuProxy] Failed to send file:', error.message);
        await feishuClient.sendTextMessage(chatId, `❌ 发送失败: ${error.message}`);
        return res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }

    // 立即发送简单的确认消息，提升用户体验
    await feishuClient.sendTextMessage(chatId, '收到');

    // Log incoming
    DataAccess.logMessage(
      session.id,
      'incoming',
      'text',
      `[From ${fromBot}] ${message}`,
      null
    );

    // Create message writer
    const writer = new FeishuMessageWriter(
      feishuClient,
      chatId,
      session.claude_session_id,
      session.project_path,
      sessionManager,
      session.conversation_id
    );

    // Call Claude (async, don't wait)
    queryClaude(message, {
      sessionId: session.claude_session_id,
      cwd: session.project_path,
      skipPermissions: true,
      projectPath: session.project_path
    }, writer)
      .then(async () => {
        // Update session ID
        if (writer.sessionId && writer.sessionId !== session.claude_session_id) {
          sessionManager.updateClaudeSessionId(session.id, writer.sessionId);
        }

        // Complete
        await writer.complete();

        // Log success
        DataAccess.logMessage(session.id, 'outgoing', 'text', 'Response sent', null);

        console.log('[FeishuProxy] Query completed successfully');
      })
      .catch(async (error) => {
        console.error('[FeishuProxy] Error processing query:', error.message);

        await feishuClient.sendTextMessage(
          chatId,
          `❌ 处理失败: ${error.message}`
        );

        DataAccess.logMessage(session.id, 'outgoing', 'error', error.message, null);
      });

    // Return immediately (processing continues in background)
    res.json({
      success: true,
      message: 'Query accepted and processing',
      sessionId: session.id
    });

  } catch (error) {
    console.error('[FeishuProxy] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

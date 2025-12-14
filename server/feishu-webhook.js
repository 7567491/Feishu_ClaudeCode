/**
 * Feishu Webhook Handler
 *
 * Handles incoming events from Feishu via Webhook (HTTP POST)
 * Alternative to WebSocket long-connection mode
 */

import lark from '@larksuiteoapi/node-sdk';
import { FeishuClient } from './lib/feishu-client.js';
import { FeishuSessionManager } from './lib/feishu-session.js';
import { FeishuMessageWriter } from './lib/feishu-message-writer.js';
import { FeishuFileHandler } from './lib/feishu-file-handler.js';
import { GroupMemberCollector } from './lib/group-member-collector.js';
import { queryClaude, abortClaudeSession, isClaudeSessionActive } from './claude-cli.js';
import { credentialsDb, userDb, feishuDb, initializeDatabase } from './database/db.js';
import { buildContextualMessage } from './lib/context-injection.js';

// Global instances
let client = null; // Lark client for basic API calls
let feishuClient = null; // FeishuClient for file operations
let sessionManager = null;
let userId = null;
let botOpenId = null; // Bot's own open_id for mention checking
const processedMessages = new Map(); // messageId -> timestamp
const recentFileRequests = new Map(); // chatId|file -> timestamp
const contentDedup = new Map(); // chatId:content -> timestamp (内容去重)
const MESSAGE_TTL_MS = 10 * 60 * 1000; // 10分钟内相同消息不重复处理
const FILE_COOLDOWN_MS = 5 * 60 * 1000; // 5分钟内相同聊天同一文件不重复转化
const CONTENT_DEDUP_WINDOW_MS = 5 * 1000; // 5秒内相同内容不重复处理

/**
 * Get user's display name with fallback strategy:
 * 1. Try to get from group members cache (works for cross-tenant users)
 * 2. Try to get from Feishu API (only works for same-tenant users)
 * 3. Use union_id to generate identifier
 * 4. Use default "User"
 */
async function getUserDisplayName(openId, unionId = null, chatId = null) {
  try {
    console.log(`[getUserDisplayName] Trying to get display name for openId: ${openId}, chatId: ${chatId}, unionId: ${unionId}`);

    // Strategy 1: Check group members cache (fastest, works for cross-tenant)
    if (chatId) {
      const cachedMember = feishuDb.getMemberByOpenId(openId);
      if (cachedMember && cachedMember.member_name) {
        console.log(`[getUserDisplayName] ✅ Found in cache: ${cachedMember.member_name} (tenant: ${cachedMember.tenant_key})`);
        return cachedMember.member_name;
      } else {
        console.log(`[getUserDisplayName] ❌ Not found in cache for openId: ${openId}`);
      }
    }

    // Strategy 2: Try Feishu API (only works for same-tenant users)
    try {
      const userInfo = await feishuClient.getUserInfo(openId);
      if (userInfo && userInfo.name) {
        console.log(`[getUserDisplayName] ✅ Got from API: ${userInfo.name}`);
        // Cache the name for future use
        if (chatId) {
          feishuDb.upsertGroupMember(chatId, openId, {
            member_name: userInfo.name,
            tenant_key: userInfo.tenant_key || null
          });
        }
        return userInfo.name;
      }
    } catch (apiError) {
      console.log(`[getUserDisplayName] ⚠️  API failed (likely cross-tenant user): ${apiError.message}`);
    }

    // Strategy 3: Use union_id to generate identifier
    if (unionId) {
      const displayName = `User_${unionId.substring(3, 11).toUpperCase()}`;
      console.log(`[getUserDisplayName] ⚠️  Generated from union_id: ${displayName}`);
      return displayName;
    }

    // Strategy 4: Default fallback
    console.log(`[getUserDisplayName] ⚠️  Using default: User`);
    return 'User';

  } catch (error) {
    console.error('[getUserDisplayName] Error:', error.message);
    return 'User';
  }
}

/**
 * Initialize Feishu Webhook handler
 */
export async function initializeFeishuWebhook() {
  console.log('[FeishuWebhook] Initializing...');

  // Initialize database
  await initializeDatabase();

  // Get user
  const user = userDb.getFirstUser();
  if (!user) {
    throw new Error('No user found');
  }
  userId = user.id;

  // Get credentials
  let appId, appSecret;
  const credentialValue = credentialsDb.getActiveCredential(userId, 'feishu');
  if (credentialValue) {
    const credentials = JSON.parse(credentialValue);
    appId = credentials.appId;
    appSecret = credentials.appSecret;
  } else {
    appId = process.env.FeishuCC_App_ID;
    appSecret = process.env.FeishuCC_App_Secret;
  }

  if (!appId || !appSecret) {
    throw new Error('Feishu credentials not found');
  }

  // Create client (for sending messages)
  client = new lark.Client({
    appId,
    appSecret,
    domain: lark.Domain.Feishu
  });

  // Create FeishuClient for file operations
  feishuClient = new FeishuClient({
    appId,
    appSecret
  });

  // Create session manager
  sessionManager = new FeishuSessionManager(userId, './feicc');

  // Try to get bot info (bot's own open_id)
  try {
    // Method 1: Get from tenant access token endpoint
    const botInfo = await client.auth.tenantAccessToken.internal({
      data: { app_id: appId, app_secret: appSecret }
    });

    // The bot's app_id can be used, but we need the bot's open_id
    // Unfortunately, there's no direct API to get bot's open_id
    // So we'll use the app_id as a fallback identifier
    console.log('[FeishuWebhook] Bot App ID:', appId);

    // Store app_id for comparison (some mention events use app_id)
    botOpenId = appId;
  } catch (error) {
    console.warn('[FeishuWebhook] Could not get bot info:', error.message);
    console.warn('[FeishuWebhook] Will accept any @mention in groups');
    botOpenId = null;
  }

  console.log('[FeishuWebhook] Initialized successfully');
}

/**
 * Handle incoming message event
 */
async function handleMessageEvent(data) {
  try {
    const event = data.event || data;
    const messageId = event.message?.message_id;
    const chatId = event.message?.chat_id;
    const now = Date.now();

    if (messageId) {
      const lastHandled = processedMessages.get(messageId);
      if (lastHandled && now - lastHandled < MESSAGE_TTL_MS) {
        console.log('[FeishuWebhook] Duplicate message detected, skipping:', messageId);
        return;
      }
      processedMessages.set(messageId, now);
      // 简单清理过期记录，避免内存累积
      if (processedMessages.size > 500) {
        for (const [id, ts] of processedMessages) {
          if (now - ts > MESSAGE_TTL_MS) {
            processedMessages.delete(id);
          }
        }
      }
    }

    // 🆕 检查消息时间戳：忽略5分钟前的旧消息（防止服务重启后处理积压消息）
    const messageCreateTime = event.message?.create_time;
    if (messageCreateTime) {
      const createTimeMs = parseInt(messageCreateTime);
      const messageAge = now - createTimeMs;
      const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5分钟

      if (messageAge > MAX_MESSAGE_AGE_MS) {
        console.log(`[FeishuWebhook] 🕐 忽略过期消息: ${Math.round(messageAge / 1000)}秒前的消息`);
        console.log(`  消息ID: ${messageId}`);
        console.log(`  创建时间: ${new Date(createTimeMs).toISOString()}`);
        return;
      }
    }

    console.log('[FeishuWebhook] Received message:');
    console.log('  Message ID:', event.message?.message_id);
    console.log('  Chat ID:', event.message?.chat_id);
    console.log('  Chat Type:', event.message?.chat_type);
    console.log('  Sender:', event.sender?.sender_id?.open_id);
    console.log('  Sender Type:', event.sender?.sender_type); // user or app

    // 🆕 收集发送者和被提及用户的信息
    await GroupMemberCollector.collectFromMessageEvent(event);
    await GroupMemberCollector.collectFromMentions(event);

    // Check if message is for bot
    const chatType = event.message?.chat_type;
    // chatId 已在上方提取

    // 🆕 Cache group members if this is a group chat
    if (chatType === 'group' && chatId) {
      try {
        // Check if we already have cached members for this group
        const cachedMembers = feishuDb.getGroupMembers(chatId);
        const cacheAge = cachedMembers.length > 0
          ? (Date.now() - new Date(cachedMembers[0].updated_at).getTime()) / 1000
          : Infinity;

        // Refresh cache if older than 1 hour or empty
        if (cacheAge > 3600 || cachedMembers.length === 0) {
          console.log(`[FeishuWebhook] Refreshing group members cache for ${chatId}...`);
          const members = await feishuClient.getChatMembers(chatId);

          // Store members in database
          for (const member of members) {
            feishuDb.upsertGroupMember(chatId, member.open_id, {
              member_name: member.name,
              member_type: member.member_type || 'user',
              tenant_key: member.tenant_key
            });
          }

          // Log member types for debugging
          const userCount = members.filter(m => m.member_type === 'user').length;
          const botCount = members.filter(m => m.member_type === 'app').length;
          console.log(`[FeishuWebhook] Member breakdown: ${userCount} users, ${botCount} bots/apps`);

          console.log(`[FeishuWebhook] Cached ${members.length} members for group ${chatId}`);
        } else {
          console.log(`[FeishuWebhook] Using cached group members (${cachedMembers.length} members, age: ${Math.round(cacheAge)}s)`);
        }
      } catch (error) {
        console.error('[FeishuWebhook] Failed to cache group members:', error.message);
        // Continue processing message even if caching fails
      }
    }

    // Extract text early for command detection
    const content = event.message?.content;
    if (!content) {
      console.log('[FeishuWebhook] No content in message');
      return;
    }

    let parsedContent;
    try {
      parsedContent = JSON.parse(content);
    } catch (error) {
      console.error('[FeishuWebhook] Failed to parse content:', error.message);
      return;
    }

    let userText = parsedContent.text || parsedContent.content || '';

    // 确保可替换，处理数组/对象/空值
    if (!userText || typeof userText.replace !== 'function') {
      if (Array.isArray(userText)) {
        userText = userText.map(item => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && item.text) return item.text;
          return '';
        }).filter(Boolean).join(' ');
      } else if (userText && typeof userText === 'object' && userText.text) {
        userText = userText.text;
      } else {
        userText = String(userText || '');
      }
    }

    // Remove @mentions for command detection
    const cleanedForCommand = userText.replace(/@[^\s]+\s*/g, '').trim();
    const isSendMdCommand = /发送\s*[^\s]+\.(md)/i.test(cleanedForCommand);

    if (chatType === 'group') {
      const mentions = event.message?.mentions || [];
      console.log('  Mentions count:', mentions.length);
      console.log('  Mentions details:', JSON.stringify(mentions, null, 2));

      // 🎯 新机制：根据群聊中机器人数量决定是否需要@
      // 获取群成员统计信息（从缓存读取，性能很好）
      const memberStats = feishuDb.getGroupMemberStats(chatId);

      let requireMention = false; // 是否需要@才响应

      if (memberStats) {
        const botCount = memberStats.bot_count || 0;
        console.log(`[FeishuWebhook] 📊 群聊统计: users=${memberStats.user_count}, bots=${botCount}`);

        // 核心逻辑：只有当群聊中有2个或以上机器人时才需要@
        if (botCount >= 2) {
          requireMention = true;
          console.log('[FeishuWebhook] 🤖 检测到多机器人环境 (≥2个机器人)，需要@才响应');
        } else {
          requireMention = false;
          console.log('[FeishuWebhook] ✨ 单机器人环境 (<2个机器人)，无需@即可响应');
        }
      } else {
        // 如果无法获取统计信息，默认需要@（保守策略）
        requireMention = true;
        console.log('[FeishuWebhook] ⚠️  无法获取群成员信息，默认需要@才响应');
      }

      // 根据是否需要@来决定处理流程
      if (requireMention) {
        // 多机器人环境：需要检查@
        if (mentions.length === 0 && !isSendMdCommand) {
          console.log('[FeishuWebhook] 多机器人群聊需要@，但未检测到mention，跳过处理');
          return;
        }

        // 有@的情况，检查是否@了当前机器人
        let isMentioned = false;

        for (const mention of mentions) {
          console.log('  Checking mention:', JSON.stringify(mention, null, 2));

          // Check multiple fields to determine if this bot was mentioned
          // Method 1: Check if mention key contains bot name
          const botName = process.env.FeishuCC_Bot_Name || '小六';
          if (mention.key && mention.key.includes(botName)) {
            console.log(`  ✅ Bot "${botName}" was mentioned via key`);
            isMentioned = true;
            break;
          }

          // Method 2: Check if mention name matches bot name
          if (mention.name && mention.name.includes(botName)) {
            console.log(`  ✅ Bot "${botName}" was mentioned via name`);
            isMentioned = true;
            break;
          }

          // Method 3: Check if it's @all
          if (mention.key === '@_all') {
            console.log('  ✅ @all mention detected');
            isMentioned = true;
            break;
          }

          // Method 4: Check by app_id if available
          if (botOpenId && mention.id?.app_id === botOpenId) {
            console.log('  ✅ Bot mentioned via app_id');
            isMentioned = true;
            break;
          }
        }

        if (!isMentioned && !isSendMdCommand) {
          console.log('[FeishuWebhook] ❌ 多机器人环境中未@本机器人，跳过处理');
          console.log('[FeishuWebhook] (可能@了其他机器人)');
          return;
        }

        console.log('[FeishuWebhook] ✅ 检测到@本机器人，继续处理');
      } else {
        // 单机器人环境：无需@即可响应
        console.log('[FeishuWebhook] ✅ 单机器人环境，直接处理消息（无需@）');
      }
    }

    // Remove @mentions for final processing
    userText = cleanedForCommand;

    if (!userText) {
      console.log('[FeishuWebhook] Empty message after cleaning');
      return;
    }

    // 🛑 方案2: /stop 命令显式中断
    const STOP_COMMANDS = ['/stop', '!停止', '/停', '!stop'];
    if (STOP_COMMANDS.some(cmd => userText.toLowerCase().startsWith(cmd))) {
      console.log('[FeishuWebhook] 🛑 收到中断命令');
      // 获取当前会话的 claude_session_id
      const tempSession = await sessionManager.getOrCreateSession(event);
      if (tempSession.claude_session_id && isClaudeSessionActive(tempSession.claude_session_id)) {
        const aborted = abortClaudeSession(tempSession.claude_session_id);
        await sendMessage(chatId, aborted ? '✅ 已中断当前任务' : '⚠️ 中断失败');
      } else {
        await sendMessage(chatId, '⚠️ 当前没有运行中的任务');
      }
      return;
    }

    console.log('[FeishuWebhook] User text:', userText);

    // Get user nickname for directory prefix
    const senderId = event.sender?.sender_id?.open_id;
    const unionId = event.sender?.sender_id?.union_id;
    let userNickname = null;
    if (senderId) {
      userNickname = await getUserDisplayName(senderId, unionId, chatId);
      console.log('[FeishuWebhook] User nickname:', userNickname);
    }

    // Get or create session with user nickname
    const session = await sessionManager.getOrCreateSession(event, userNickname);
    console.log('[FeishuWebhook] Session:', session.id);

    // 🔧 Detect actual project directory (may be in subdirectory)
    let actualWorkingDir = session.project_path;
    try {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Check if there's a subdirectory with actual project files
      const entries = await fs.readdir(session.project_path, { withFileTypes: true });
      const subdirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

      if (subdirs.length === 1) {
        // If there's exactly one non-hidden subdirectory, use it
        const subdir = path.join(session.project_path, subdirs[0].name);
        const subdirEntries = await fs.readdir(subdir);

        // Check if subdirectory contains project files (README.md, package.json, etc.)
        const hasProjectFiles = subdirEntries.some(f =>
          f === 'README.md' || f === 'package.json' || f === 'requirements.txt'
        );

        if (hasProjectFiles) {
          actualWorkingDir = subdir;
          console.log('[FeishuWebhook] 📂 Detected project subdirectory:', actualWorkingDir);
        }
      }
    } catch (error) {
      console.log('[FeishuWebhook] ⚠️  Failed to detect subdirectory:', error.message);
      // Continue with original path
    }

    // Check if busy
    if (sessionManager.isSessionBusy(session)) {
      console.log('[FeishuWebhook] Session is busy');
      await sendMessage(chatId, '⏳ 正在处理中，请稍候...');
      return;
    }

    // Log incoming message
    feishuDb.logMessage(
      session.id,
      'incoming',
      'text',
      userText,
      event.message?.message_id
    );

    // Check if this is a markdown convert command
    const convertCommand = FeishuFileHandler.parseConvertCommand(userText);
    if (convertCommand && convertCommand.command === 'convert') {
      console.log('[FeishuWebhook] File convert command detected:', convertCommand.fileName);
      if (chatId) {
        const key = `${chatId}|${convertCommand.fileName}`;
        const lastTime = recentFileRequests.get(key);
        if (lastTime && now - lastTime < FILE_COOLDOWN_MS) {
          console.log('[FeishuWebhook] Recent identical convert request, skipping:', key);
          await sendMessage(chatId, '⏳ 该文件刚处理过，请稍后再试');
          return;
        }
        recentFileRequests.set(key, now);
      }

      try {
        await FeishuFileHandler.handleFileConvert(
          feishuClient,
          chatId,
          session.project_path,
          convertCommand.fileName
        );
        feishuDb.logMessage(session.id, 'outgoing', 'file', `convert:${convertCommand.fileName}`, null);
        feishuDb.updateSessionActivity(session.id);
        return;
      } catch (error) {
        console.error('[FeishuWebhook] Failed to convert file:', error.message);
        await sendMessage(chatId, `❌ 转化失败: ${error.message}`);
        return;
      }
    }

    // Check if this is a file send command
    const fileCommand = FeishuFileHandler.parseFileCommand(userText);
    if (fileCommand && fileCommand.command === 'send') {
      console.log('[FeishuWebhook] File send command detected:', fileCommand.fileName);

      try {
        await FeishuFileHandler.handleFileSend(
          feishuClient,
          chatId,
          session.project_path,
          fileCommand.fileName
        );

        // Log success
        feishuDb.logMessage(session.id, 'outgoing', 'file', fileCommand.fileName, null);
        feishuDb.updateSessionActivity(session.id);

        console.log('[FeishuWebhook] File sent successfully');
        return;

      } catch (error) {
        console.error('[FeishuWebhook] Failed to send file:', error.message);
        await sendMessage(chatId, `❌ 发送失败: ${error.message}`);
        return;
      }
    }

    // Check if this is a document edit command
    const { FeishuDocEditor } = await import('./lib/feishu-doc-editor.js');
    const { database } = await import('./database/db.js');

    if (!global.docEditor) {
      global.docEditor = new FeishuDocEditor(feishuClient, database);
      // Restore active sessions on startup
      await global.docEditor.restoreSessions();
    }

    const editCommand = global.docEditor.parseEditCommand(userText);
    if (editCommand) {
      console.log('[FeishuWebhook] Document edit command detected:', editCommand);

      if (editCommand.command === 'edit' && editCommand.fileName) {
        // Find the file in project directory
        const filePath = FeishuFileHandler.findFile(actualWorkingDir, editCommand.fileName);

        if (filePath) {
          const result = await global.docEditor.startEditSession(chatId, filePath, senderId);
          await sendMessage(chatId, result.message);
        } else {
          await sendMessage(chatId, `❌ 找不到文件：${editCommand.fileName}\n请确保文件存在且扩展名为 .md`);
        }

        feishuDb.updateSessionActivity(session.id);
        return;
      } else if (editCommand.command === 'stop_edit') {
        const activeSession = global.docEditor.findSessionByChat(chatId);
        if (activeSession) {
          const result = await global.docEditor.stopEditSession(activeSession.sessionId);
          await sendMessage(chatId, result.message);
        } else {
          await sendMessage(chatId, '当前没有活跃的编辑会话');
        }

        feishuDb.updateSessionActivity(session.id);
        return;
      } else if (editCommand.command === 'edit_status') {
        const status = await global.docEditor.getEditStatus(chatId);
        await sendMessage(chatId, status);

        feishuDb.updateSessionActivity(session.id);
        return;
      }
    }

    // 立即发送简单的确认消息，提升用户体验
    await sendMessage(chatId, '收到');

    // 🆕 内容去重：5秒内相同内容不重复调用Claude（但"收到"已发送）
    const dedupSenderId = event.sender?.sender_id?.open_id || 'unknown';
    const contentDedupKey = `${chatId}:${dedupSenderId}:${userText.trim()}`;
    const lastContentTime = contentDedup.get(contentDedupKey);
    const nowForDedup = Date.now();

    if (lastContentTime && nowForDedup - lastContentTime < CONTENT_DEDUP_WINDOW_MS) {
      console.log(`[FeishuWebhook] 🚫 内容去重: 5秒内重复消息，跳过Claude调用（已发送"收到"）`);
      console.log(`  内容: "${userText.substring(0, 50)}${userText.length > 50 ? '...' : ''}"`);
      console.log(`  上次处理时间: ${new Date(lastContentTime).toISOString()}`);
      feishuDb.updateSessionActivity(session.id);
      return;
    }
    contentDedup.set(contentDedupKey, nowForDedup);

    // 清理过期的内容去重记录
    if (contentDedup.size > 1000) {
      for (const [key, ts] of contentDedup) {
        if (nowForDedup - ts > CONTENT_DEDUP_WINDOW_MS * 2) {
          contentDedup.delete(key);
        }
      }
    }

    // Create message writer
    const writer = new FeishuMessageWriter(
      {
        sendTextMessage: (chatId, text) => sendMessage(chatId, text),
        sendFile: (chatId, filePath) => feishuClient.sendFile(chatId, filePath)
      },
      chatId,
      session.claude_session_id,
      actualWorkingDir,
      sessionManager,
      session.conversation_id
    );

    // 🛑 方案3: 双消息自动中断（3秒超时判断）
    // 如果有正在运行的任务，且距离上次消息超过3秒，自动中断旧任务
    if (session.claude_session_id && isClaudeSessionActive(session.claude_session_id)) {
      const lastActivity = session.last_activity ? new Date(session.last_activity).getTime() : 0;
      const timeSinceLastMsg = Date.now() - lastActivity;
      const AUTO_ABORT_THRESHOLD_MS = 3000; // 3秒阈值

      if (timeSinceLastMsg > AUTO_ABORT_THRESHOLD_MS) {
        console.log(`[FeishuWebhook] 🔄 检测到新消息（间隔 ${Math.round(timeSinceLastMsg/1000)}秒），自动中断旧任务`);
        abortClaudeSession(session.claude_session_id);
        await new Promise(r => setTimeout(r, 500)); // 等待进程清理
        await sendMessage(chatId, '⏹️ 已中断上一个任务，正在处理新请求...');
      } else {
        // 3秒内的消息视为"补充"，直接追加处理（排队）
        console.log(`[FeishuWebhook] ⏳ 检测到快速连续消息（间隔 ${timeSinceLastMsg}ms），排队等待...`);
      }
    }

    // Call Claude with context isolation
    const claudeOptions = {
      sessionId: session.claude_session_id,
      cwd: actualWorkingDir,  // 🔧 Use detected actual working directory
      skipPermissions: true,
      projectPath: actualWorkingDir  // 🔧 Use detected actual working directory
    };

    // 🔧 使用上下文注入模块，提取最近 2 轮完整对话（用户消息+对应助手回复）
    const userTextWithContext = buildContextualMessage(
      session.id,
      userText,
      actualWorkingDir,
      session.conversation_id,
      { roundCount: 2 }  // 提取最近2轮完整对话
    );
    console.log('[FeishuWebhook] 📝 上下文注入完成（2轮完整对话）');

    console.log('[FeishuWebhook] Calling Claude...');
    console.log('[FeishuWebhook] Claude options:', JSON.stringify(claudeOptions, null, 2));
    console.log('[FeishuWebhook] 🔐 Session isolation - Conversation:', session.conversation_id);
    console.log('[FeishuWebhook] 🔐 Working directory:', actualWorkingDir);

    try {
      await queryClaude(userTextWithContext, claudeOptions, writer);

      // Update session ID if changed
      if (writer.sessionId && writer.sessionId !== session.claude_session_id) {
        sessionManager.updateClaudeSessionId(session.id, writer.sessionId);
      }

      // Complete message
      await writer.complete();

      // Log success - 存储实际回复内容（截取前2000字符）
      const responseContent = writer.collectedText
        ? writer.collectedText.substring(0, 2000)
        : 'Response sent';
      feishuDb.logMessage(session.id, 'outgoing', 'text', responseContent, null);
      feishuDb.updateSessionActivity(session.id);

      console.log('[FeishuWebhook] Message handled successfully');

    } catch (error) {
      console.error('[FeishuWebhook] Error calling Claude:', error.message);

      // If session not found, clear the invalid session ID and retry with new session
      if (error.message && error.message.includes('No conversation found')) {
        console.log('[FeishuWebhook] Invalid session ID detected, clearing and retrying...');
        sessionManager.updateClaudeSessionId(session.id, null);
        await sendMessage(chatId, `🔄 会话已过期，正在创建新会话...\n\n${userText}`);
        // Note: The retry will happen on the next user message
      } else {
        await sendMessage(chatId, `❌ 处理失败: ${error.message}`);
      }

      feishuDb.logMessage(session.id, 'outgoing', 'error', error.message, null);
    }

  } catch (error) {
    console.error('[FeishuWebhook] Error handling message:', error.message);
    console.error(error.stack);
  }
}

/**
 * Send message to Feishu
 */
async function sendMessage(chatId, text) {
  const receiveIdType = chatId.startsWith('oc_') ? 'chat_id' : 'open_id';

  try {
    const res = await client.im.message.create({
      params: { receive_id_type: receiveIdType },
      data: {
        receive_id: chatId,
        content: JSON.stringify({ text }),
        msg_type: 'text'
      }
    });

    if (res.code === 0) {
      console.log('[FeishuWebhook] Message sent successfully');
      return { success: true, message_id: res.data?.message_id };
    } else {
      throw new Error(`Feishu API error: ${res.code} - ${res.msg}`);
    }
  } catch (error) {
    console.error('[FeishuWebhook] Failed to send message:', error.message);
    throw error;
  }
}

/**
 * Create Express middleware for Webhook
 */
export function createWebhookHandler() {
  // Get encryption key if configured
  const encryptKey = process.env.FeishuCC_Encrypt_Key || '';

  // Create EventDispatcher
  const eventDispatcher = new lark.EventDispatcher({
    encryptKey,
    loggerLevel: lark.LoggerLevel.debug
  }).register({
    'im.message.receive_v1': handleMessageEvent
  });

  // Return Express middleware
  return lark.adaptExpress(eventDispatcher, {
    autoChallenge: true  // Automatically handle URL verification
  });
}

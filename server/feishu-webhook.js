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
import dualBotChecker from './lib/dual-bot-checker.js';
import { SESSION_LIMITS, checkSessionLimits, shouldResetSession, truncatePrompt, getSessionStats } from './lib/session-limits.js';

// Global instances
let client = null; // Lark client for basic API calls (current context)
let feishuClient = null; // FeishuClient for file operations (current context)
let sessionManager = null;
let userId = null;
let botOpenId = null; // Bot's own open_id for mention checking (current context)
const botContexts = new Map(); // appId -> { client, feishuClient, sessionManager, botOpenId }
const tokenToAppId = new Map(); // verification token -> appId
let defaultAppId = null; // primary bot appId
const processedMessages = new Map(); // messageId -> timestamp
const recentFileRequests = new Map(); // chatId|file -> timestamp
const contentDedup = new Map(); // chatId:content -> timestamp (内容去重)
const MESSAGE_TTL_MS = 10 * 60 * 1000; // 10分钟内相同消息不重复处理
const FILE_COOLDOWN_MS = 5 * 60 * 1000; // 5分钟内相同聊天同一文件不重复转化
const CONTENT_DEDUP_WINDOW_MS = 5 * 1000; // 5秒内相同内容不重复处理

function selectBotContext(event) {
  const token = event?.header?.token || event?.token;
  if (token && tokenToAppId.has(token)) {
    const appId = tokenToAppId.get(token);
    return botContexts.get(appId);
  }

  const appId = event?.header?.app_id;
  if (appId && botContexts.has(appId)) {
    return botContexts.get(appId);
  }

  // Fallback: 默认走 primary（小六）上下文
  if (defaultAppId && botContexts.has(defaultAppId)) {
    return botContexts.get(defaultAppId);
  }

  // Fallback to first context if available
  const first = botContexts.values().next();
  return first?.value || null;
}

/**
 * Parse context management commands
 * @param {string} text - User input text
 * @returns {string|null} - Command type ('clear', 'reset', 'status') or null
 */
function parseContextCommand(text) {
  const trimmed = text.trim().toLowerCase();

  // /clear or /reset - Clear context
  if (trimmed === '/clear' || trimmed === '/reset') {
    return 'clear';
  }

  // /context status - Show context status
  if (trimmed === '/context status' || trimmed === '/status' || trimmed === '/context') {
    return 'status';
  }

  return null;
}

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

  const createContext = async ({ id, secret, workdir = './feicc', label, token }) => {
    const ctxClient = new lark.Client({
      appId: id,
      appSecret: secret,
      domain: lark.Domain.Feishu
    });

    const ctxFeishuClient = new FeishuClient({
      appId: id,
      appSecret: secret
    });

    const ctxSessionManager = new FeishuSessionManager(userId, workdir);
    let ctxBotOpenId = null;

    try {
      await ctxClient.auth.tenantAccessToken.internal({
        data: { app_id: id, app_secret: secret }
      });
      ctxBotOpenId = id; // fallback identifier
      console.log(`[FeishuWebhook] (${label}) Bot App ID:`, id);
    } catch (error) {
      console.warn(`[FeishuWebhook] (${label}) Could not get bot info:`, error.message);
      ctxBotOpenId = null;
    }

    const ctx = {
      appId: id,
      client: ctxClient,
      feishuClient: ctxFeishuClient,
      sessionManager: ctxSessionManager,
      botOpenId: ctxBotOpenId,
      label
    };

    botContexts.set(id, ctx);
    if (token) {
      tokenToAppId.set(token, id);
    }
    return ctx;
  };

  // Primary bot（小六）
  const primaryCtx = await createContext({
    id: appId,
    secret: appSecret,
    workdir: './feicc',
    label: 'primary',
    token: process.env.FeishuCC_Verification_Token
  });
  defaultAppId = primaryCtx.appId;

  // Optional: 小曼
  if (process.env.Feishu_Xiaoman_App_ID && process.env.Feishu_Xiaoman_App_Secret) {
    const xiaomanCtx = await createContext({
      id: process.env.Feishu_Xiaoman_App_ID,
      secret: process.env.Feishu_Xiaoman_App_Secret,
      workdir: './feicc-xiaoman',
      label: 'xiaoman',
      token: process.env.Feishu_Xiaoman_Verification_Token
    });

    console.log('[FeishuWebhook] 小曼上下文已初始化:', xiaomanCtx.appId);
  }

  // Optional: AI初老师
  if (process.env.Feishu_Teacher_App_ID && process.env.Feishu_Teacher_App_Secret) {
    const teacherCtx = await createContext({
      id: process.env.Feishu_Teacher_App_ID,
      secret: process.env.Feishu_Teacher_App_Secret,
      workdir: './feicc-teacher',
      label: 'teacher',
      token: process.env.Feishu_Teacher_Verification_Token
    });

    console.log('[FeishuWebhook] AI初老师上下文已初始化:', teacherCtx.appId);
  }

  // Set current context to primary by default
  client = primaryCtx.client;
  feishuClient = primaryCtx.feishuClient;
  sessionManager = primaryCtx.sessionManager;
  botOpenId = primaryCtx.botOpenId;

  console.log('[FeishuWebhook] Token map initialized:', Array.from(tokenToAppId.keys()).map(k => `${k.substring(0, 6)}...`));

  // 🆕 初始化双机器人群检测器
  try {
    await dualBotChecker.initialize();
    const stats = dualBotChecker.getStats();
    console.log(`[FeishuWebhook] 双机器人群检测器已启动，双机器人群数: ${stats.dualBotGroupCount}`);
  } catch (error) {
    console.warn('[FeishuWebhook] 双机器人群检测器初始化失败:', error.message);
    console.warn('[FeishuWebhook] 将使用保守策略（默认无需@）');
  }

  console.log('[FeishuWebhook] Initialized successfully');
}

/**
 * 🆕 处理文件/图片消息下载
 * @param {Object} event - 消息事件
 * @param {Object} parsedContent - 解析后的消息内容
 * @param {string} messageType - 消息类型 ('file' | 'image')
 * @param {string} chatId - 聊天 ID
 * @param {string} messageId - 消息 ID
 */
async function handleFileDownload(event, parsedContent, messageType, chatId, messageId) {
  const fs = await import('fs/promises');
  const path = await import('path');

  try {
    // 获取发送者信息
    const senderId = event.sender?.sender_id?.open_id;
    const chatType = event.message?.chat_type;

    // 获取或创建会话
    const conversationId = chatType === 'group' ? `group-${chatId}` : `user-${senderId}`;
    let session = feishuDb.getSession(conversationId);

    if (!session) {
      // 创建新会话
      const projectPath = chatType === 'group'
        ? `./feicc/group-${chatId.substring(0, 16)}`
        : `./feicc/user-${senderId.substring(0, 16)}`;

      session = feishuDb.getOrCreateSession(conversationId, chatType, senderId, projectPath);
      console.log(`[FileDownload] 创建新会话: ${conversationId}`);
    }

    const workingDir = session.project_path;

    // 确保工作目录存在
    await fs.mkdir(workingDir, { recursive: true });

    let savedPath;
    let fileName;

    if (messageType === 'file') {
      // 处理文件消息
      const fileKey = parsedContent.file_key;
      fileName = parsedContent.file_name || 'unknown_file';

      console.log(`[FileDownload] 下载文件: ${fileName} (key: ${fileKey})`);

      // 调用飞书 API 下载文件
      const fileData = await feishuClient.downloadFile(fileKey, messageId);

      // 生成保存路径
      savedPath = path.default.join(workingDir, fileName);

      // 写入文件
      await fs.writeFile(savedPath, fileData.buffer);

      console.log(`[FileDownload] ✅ 文件已保存: ${savedPath} (${fileData.fileSize} bytes)`);

    } else if (messageType === 'image') {
      // 处理图片消息
      const imageKey = parsedContent.image_key;
      const timestamp = Date.now();
      fileName = `image_${timestamp}.png`;

      console.log(`[FileDownload] ========== 图片下载开始 ==========`);
      console.log(`[FileDownload] 📷 image_key: ${imageKey}`);
      console.log(`[FileDownload] 📨 message_id: ${messageId}`);
      console.log(`[FileDownload] 💬 chat_id: ${chatId}`);
      console.log(`[FileDownload] 📁 目标目录: ${workingDir}`);

      // 调用飞书 API 下载图片
      const imageData = await feishuClient.downloadImage(imageKey, messageId);

      // 如果 API 返回了文件名，使用它
      if (imageData.fileName && imageData.fileName !== 'unknown') {
        fileName = imageData.fileName;
      }

      // 生成保存路径
      savedPath = path.default.join(workingDir, fileName);

      // 写入文件
      await fs.writeFile(savedPath, imageData.buffer);

      console.log(`[FileDownload] ✅ 图片已保存: ${savedPath} (${imageData.fileSize} bytes)`);
    }

    // 记录消息日志
    feishuDb.logMessage(session.id, 'incoming', messageType, `${messageType}:${fileName}`, senderId);

    // 发送确认消息
    const confirmMsg = `📥 已接收${messageType === 'file' ? '文件' : '图片'}: \`${fileName}\`\n📂 保存位置: \`${savedPath}\``;
    await sendMessage(chatId, confirmMsg);

    // 记录响应
    feishuDb.logMessage(session.id, 'outgoing', 'text', confirmMsg, null);
    feishuDb.updateSessionActivity(session.id);

  } catch (error) {
    console.error(`[FileDownload] ========== 下载失败 ==========`);
    console.error(`[FileDownload] ❌ 错误类型: ${error.name}`);
    console.error(`[FileDownload] ❌ 错误消息: ${error.message}`);
    console.error(`[FileDownload] ❌ 错误堆栈: ${error.stack}`);

    // 发送错误消息
    await sendMessage(chatId, `❌ ${messageType === 'file' ? '文件' : '图片'}下载失败: ${error.message}`);
  }
}

/**
 * Handle incoming message event
 */
async function handleMessageEvent(data) {
  try {
    const event = data.event || data;
    // 兼容 Feishu 回调：header/token 可能在根节点
    if (!event.header && data.header) {
      event.header = data.header;
    }
    if (!event.token && data.token) {
      event.token = data.token;
    }
    const ctx = selectBotContext(event);
    if (!ctx) {
      console.warn('[FeishuWebhook] No bot context available, skipping message');
      return;
    }

    const eventAppId = event?.header?.app_id || 'unknown';
    const eventToken = event?.header?.token || 'none';
    console.log(`[FeishuWebhook] Using context for app_id: ${eventAppId} (token: ${eventToken?.substring(0, 6)}...) -> ${ctx.appId} [${ctx.label}]`);

    // Switch active context for this event
    client = ctx.client;
    feishuClient = ctx.feishuClient;
    sessionManager = ctx.sessionManager;
    botOpenId = ctx.botOpenId;

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

    // 🆕 检测文件/图片消息类型并处理下载
    const messageType = event.message?.message_type;
    if (messageType === 'file' || messageType === 'image') {
      console.log(`[FeishuWebhook] 📁 检测到${messageType === 'file' ? '文件' : '图片'}消息`);
      await handleFileDownload(event, parsedContent, messageType, chatId, messageId);
      return; // 文件消息处理完毕，不继续走文本流程
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

      // 🎯 使用 DualBotChecker 判断是否为双机器人群
      // 通过预加载的群列表交集判断，准确且高效
      const isDualBot = dualBotChecker.isDualBotGroup(chatId);
      const requireMention = isDualBot;

      if (isDualBot) {
        console.log(`[FeishuWebhook] 🤖 双机器人群 (${chatId})，需要@才响应`);
      } else {
        console.log(`[FeishuWebhook] ✨ 单机器人群 (${chatId})，无需@即可响应`);
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

    // 🔐 管理员专属命令：重启服务
    // 仅允许张璐 (ou_a56e25820913cc1ee1e0ea35d9ffb497) 在私聊中执行
    const ADMIN_OPEN_IDS = ['ou_a56e25820913cc1ee1e0ea35d9ffb497'];  // 张璐
    const senderOpenId = event.sender?.sender_id?.open_id;
    const isPrivateChat = chatType === 'p2p';
    const isAdmin = ADMIN_OPEN_IDS.includes(senderOpenId);

    const RESTART_COMMANDS = ['重启服务', '重启项目', '/restart', '!restart'];
    if (RESTART_COMMANDS.some(cmd => userText.toLowerCase().includes(cmd.toLowerCase()))) {
      console.log(`[FeishuWebhook] 🔄 收到重启命令，发送者: ${senderOpenId}, 私聊: ${isPrivateChat}, 管理员: ${isAdmin}`);

      if (isPrivateChat && isAdmin) {
        console.log('[FeishuWebhook] ✅ 管理员权限验证通过，执行重启');
        await sendMessage(chatId, '🔄 正在重启服务，请稍候约 5 秒...');

        // 异步执行重启，给当前响应留出时间
        setTimeout(async () => {
          const { exec } = await import('child_process');
          exec('pm2 restart claude-code-ui', (error, stdout, stderr) => {
            if (error) {
              console.error('[FeishuWebhook] 重启失败:', error.message);
            } else {
              console.log('[FeishuWebhook] 重启成功:', stdout);
            }
          });
        }, 1000);
        return;
      } else {
        console.log('[FeishuWebhook] ❌ 权限不足，拒绝重启命令');
        if (!isPrivateChat) {
          await sendMessage(chatId, '⚠️ 重启命令仅支持私聊使用');
        } else if (!isAdmin) {
          await sendMessage(chatId, '⚠️ 您没有执行重启命令的权限');
        }
        return;
      }
    }

    console.log('[FeishuWebhook] User text:', userText);

    // 🔧 清理 HTML 标签（飞书富文本消息可能包含 <p>、<a> 等标签）
    const cleanText = userText.replace(/<[^>]+>/g, '').trim();

    // 🆕 检测多维表格 URL
    const baseUrlPattern = /https?:\/\/[^\s]+\/base\/[a-zA-Z0-9_-]+/;
    const baseUrlMatch = cleanText.match(baseUrlPattern);
    if (baseUrlMatch) {
      const baseUrl = baseUrlMatch[0];
      console.log('[FeishuWebhook] 📊 检测到多维表格 URL:', baseUrl);

      try {
        // 发送"正在读取"提示
        await sendMessage(chatId, '📊 正在读取多维表格，请稍候...');

        // 读取表格数据
        const result = await feishuClient.readBaseFromUrl(baseUrl, {
          maxRows: 50  // 限制显示50条，避免消息过长
        });

        // 构建响应消息
        const { markdown, tableInfo } = result;
        let responseText = `📊 **${tableInfo.tableName}**\n\n`;
        responseText += `📈 共 ${tableInfo.totalRecords} 条记录，${tableInfo.totalFields} 个字段\n\n`;

        // 如果有多个数据表，列出所有表
        if (tableInfo.allTables.length > 1) {
          responseText += `📑 该多维表格包含以下数据表：\n`;
          tableInfo.allTables.forEach((table, index) => {
            const isCurrent = table.id === tableInfo.tableId;
            responseText += `  ${index + 1}. ${table.name}${isCurrent ? ' (当前)' : ''}\n`;
          });
          responseText += `\n`;
        }

        responseText += markdown;

        await sendMessage(chatId, responseText);

      } catch (error) {
        console.error('[FeishuWebhook] 读取多维表格失败:', error.message);
        await sendMessage(
          chatId,
          `❌ 读取多维表格失败: ${error.message}\n\n` +
          `💡 可能的原因：\n` +
          `1. 机器人没有访问该表格的权限\n` +
          `2. URL 格式不正确\n` +
          `3. 表格已被删除或移动\n\n` +
          `请检查表格权限设置，或联系管理员。`
        );
      }

      return; // 处理完毕，不继续走 Claude 流程
    }

    // 【新增】小曼机器人全量路由到 Codex（无需关键词）
    const isXiaomanContext = (ctx?.label === 'xiaoman') ||
      (process.env.Feishu_Xiaoman_App_ID && ctx?.appId === process.env.Feishu_Xiaoman_App_ID) ||
      (process.env.Feishu_Xiaoman_App_ID && eventAppId === process.env.Feishu_Xiaoman_App_ID);
    console.log('[FeishuWebhook] Xiaoman check:', {
      label: ctx?.label,
      ctxApp: ctx?.appId,
      eventAppId,
      hasEnv: !!process.env.Feishu_Xiaoman_App_ID,
      isXiaomanContext
    });

    if (isXiaomanContext) {
      const actualMessage = userText.trim();
      if (!actualMessage) {
        await sendMessage(chatId, '请直接输入你的问题');
        return;
      }

      console.log('[FeishuWebhook] 🤖 Xiaoman context detected, routing to Codex Proxy');
      try {
        const response = await fetch('http://localhost:33300/api/codex-proxy/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: actualMessage,
            chatId: chatId,
            fromBot: 'FeishuWebhook/Xiaoman'
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const result = await response.json();
        console.log('[FeishuWebhook] ✅ Codex query dispatched (Xiaoman), sessionId:', result.sessionId);
      } catch (error) {
        console.error('[FeishuWebhook] ❌ Failed to dispatch Xiaoman to Codex:', error.message);
        await sendMessage(
          chatId,
          `❌ 小曼调用失败: ${error.message}\n请稍后重试或联系管理员。`
        );
      }

      return; // 小曼不再继续走 Claude
    }

    // 【新增】检测小曼关键词
    const codexKeywords = ['codex ', '小曼 ', 'Codex ', '小曼：'];
    const isCodexRequest = codexKeywords.some(kw => userText.startsWith(kw));

    if (isCodexRequest) {
      console.log('[FeishuWebhook] 🤖 Routing to Codex (keyword detected)');

      // 提取实际消息（去除关键词前缀）
      let actualMessage = userText;
      for (const kw of codexKeywords) {
        if (userText.startsWith(kw)) {
          actualMessage = userText.substring(kw.length).trim();
          break;
        }
      }

      if (!actualMessage) {
        await sendMessage(
          chatId,
          '请在关键词后输入你的问题，例如："小曼 写一个 Python 函数"'
        );
        return;
      }

      // 调用 Codex Proxy
      try {
        const response = await fetch('http://localhost:33300/api/codex-proxy/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: actualMessage,
            chatId: chatId,
            fromBot: 'FeishuWebhook'
          })
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const result = await response.json();
        console.log('[FeishuWebhook] ✅ Codex query dispatched, sessionId:', result.sessionId);

      } catch (error) {
        console.error('[FeishuWebhook] ❌ Failed to dispatch to Codex:', error.message);
        await sendMessage(
          chatId,
          `❌ 小曼调用失败: ${error.message}\n请稍后重试或联系管理员。`
        );
      }

      return; // 不再继续处理（不调用 Claude）
    }

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

    // 🆕 Check if this is a context management command
    const contextCommand = parseContextCommand(userText);
    if (contextCommand) {
      console.log('[FeishuWebhook] Context command detected:', contextCommand);

      if (contextCommand === 'clear' || contextCommand === 'reset') {
        // Clear current session context
        const hadSession = !!session.claude_session_id;
        sessionManager.updateClaudeSessionId(session.id, null);

        // Get context stats before clearing
        const stats = getSessionStats(feishuDb, session.id);

        const message = hadSession
          ? `✅ 上下文已清空\n\n📊 清空前统计:\n- 消息数: ${stats.messageCount}\n- 对话轮次: ${Math.floor(stats.messageCount / 2)}\n\n💡 下次发送消息时，将自动创建新会话。`
          : `ℹ️ 当前会话已经是空白状态，无需清空。`;

        await sendMessage(chatId, message);
        feishuDb.logMessage(session.id, 'outgoing', 'text', message, null);
        feishuDb.updateSessionActivity(session.id);
        return;
      }

      if (contextCommand === 'status') {
        // Show context status
        const stats = getSessionStats(feishuDb, session.id);
        const hasActiveSession = !!session.claude_session_id;

        // Estimate tokens (1 token ≈ 2.5 characters for Chinese)
        const estimatedTokens = Math.ceil(stats.totalChars / 2.5);
        const usageRatio = ((estimatedTokens / 200000) * 100).toFixed(2);

        const statusMessage = `📊 当前上下文状态\n\n` +
          `会话ID: ${session.conversation_id.substring(0, 20)}...\n` +
          `Claude会话: ${hasActiveSession ? '✅ 活跃' : '❌ 未激活'}\n` +
          `工作目录: ${session.project_path}\n\n` +
          `📈 上下文统计:\n` +
          `- 消息总数: ${stats.messageCount}\n` +
          `- 总字符数: ${stats.totalChars.toLocaleString()}\n` +
          `- 平均长度: ${stats.avgChars} 字符/条\n` +
          `- 最长消息: ${stats.maxChars} 字符\n\n` +
          `🔢 Token估算:\n` +
          `- 估算tokens: ${estimatedTokens.toLocaleString()}\n` +
          `- 使用率: ${usageRatio}% (200K上限)\n\n` +
          `💡 提示:\n` +
          `- 发送 /clear 清空上下文\n` +
          `- 建议消息数超过 500 时清理`;

        await sendMessage(chatId, statusMessage);
        feishuDb.logMessage(session.id, 'outgoing', 'text', statusMessage, null);
        feishuDb.updateSessionActivity(session.id);
        return;
      }
    }

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

    // 🔧 会话限制检查（根据 docs/long.md RCA）
    const sessionStats = getSessionStats(feishuDb, session.id);
    const limitCheck = checkSessionLimits({
      messageCount: sessionStats.messageCount,
      promptLength: userText.length  // 预估，实际会包含上下文
    });

    if (limitCheck.needsReset) {
      console.log(`[FeishuWebhook] ⚠️ 会话超限: ${limitCheck.reason}`);
      console.log(`[FeishuWebhook] 🔄 自动重置会话 (消息数: ${sessionStats.messageCount})`);
      sessionManager.updateClaudeSessionId(session.id, null);
      claudeOptions.sessionId = null;
      // 注意：自动刷新不发送飞书通知（避免打扰用户），仅记录日志
      // 用户可通过 /status 命令主动查看会话状态
    }

    // 🔧 智能上下文注入：优先保留用户当前输入，避免截断用户消息
    let userTextWithContext;
    const userInputLength = userText.length;

    // 策略1: 如果用户输入本身就很长（超过80%限制），直接跳过历史上下文
    if (userInputLength > SESSION_LIMITS.MAX_PROMPT_LENGTH * 0.8) {
      console.log(`[FeishuWebhook] 📝 用户输入较长 (${userInputLength} 字符)，跳过历史上下文注入`);
      // 只添加基本信息，不加历史上下文
      userTextWithContext = `[当前工作目录: ${actualWorkingDir}]\n[会话ID: ${session.conversation_id}]\n\n### 当前问题:\n\n${userText}`;
    } else {
      // 策略2: 正常加上下文（2轮对话）
      userTextWithContext = buildContextualMessage(
        session.id,
        userText,
        actualWorkingDir,
        session.conversation_id,
        { roundCount: 2 }
      );

      // 策略3: 如果加上上下文后超限，逐步减少上下文
      if (userTextWithContext.length > SESSION_LIMITS.MAX_PROMPT_LENGTH) {
        console.log(`[FeishuWebhook] ⚠️ 加上上下文后过长 (${userTextWithContext.length} > ${SESSION_LIMITS.MAX_PROMPT_LENGTH})，尝试减少上下文`);

        // 尝试只用1轮上下文
        userTextWithContext = buildContextualMessage(
          session.id,
          userText,
          actualWorkingDir,
          session.conversation_id,
          { roundCount: 1 }
        );

        // 策略4: 如果还是超限，完全不加历史上下文
        if (userTextWithContext.length > SESSION_LIMITS.MAX_PROMPT_LENGTH) {
          console.log(`[FeishuWebhook] ⚠️ 仍然过长，完全跳过历史上下文注入`);
          userTextWithContext = `[当前工作目录: ${actualWorkingDir}]\n[会话ID: ${session.conversation_id}]\n\n### 当前问题:\n\n${userText}`;
        } else {
          console.log(`[FeishuWebhook] ✅ 使用1轮上下文 (总长度: ${userTextWithContext.length})`);
        }
      } else {
        console.log(`[FeishuWebhook] ✅ 使用2轮上下文 (总长度: ${userTextWithContext.length})`);
      }
    }

    console.log('[FeishuWebhook] 📝 上下文注入完成，用户输入完整保留');

    // 如果当前上下文是小曼（Codex），直接转发到 codex-proxy，保持小六走 Claude
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
      } else if (shouldResetSession(error.message)) {
        // 🔧 "Prompt is too long" 错误自动恢复（根据 docs/long.md RCA）
        console.log('[FeishuWebhook] 🔄 检测到 Prompt 过长错误，自动重置会话');
        sessionManager.updateClaudeSessionId(session.id, null);
        await sendMessage(chatId, `🔄 上下文过长，已自动刷新会话。请重新发送您的问题。`);
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
  const keyCandidates = [
    process.env.FeishuCC_Encrypt_Key,
    process.env.Feishu_Xiaoman_Encrypt_Key,
    process.env.Feishu_Teacher_Encrypt_Key
  ].filter(k => k && k.trim() && k.trim().toLowerCase() !== 'na');

  const encryptKey = keyCandidates[0] || '';
  const validTokens = [
    process.env.FeishuCC_Verification_Token,
    process.env.Feishu_Xiaoman_Verification_Token,
    process.env.Feishu_Teacher_Verification_Token
  ].filter(Boolean);

  // Return Express middleware (manual verification to support multiple bots)
  return async (req, res) => {
    try {
      const body = req.body || {};
      const token = body?.header?.token || body?.token;

      if (validTokens.length > 0 && !validTokens.includes(token)) {
        console.warn('[FeishuWebhook] Verification token mismatch (allowing for multi-bot setup)');
      }

      // URL verification
      if (body?.type === 'url_verification' || body?.challenge) {
        return res.json({ challenge: body.challenge });
      }

      // Encrypted payloads are not used now; encryptKey kept for compatibility
      await handleMessageEvent(body);
      res.json({ status: 'ok' });
    } catch (error) {
      console.error('[FeishuWebhook] Middleware error:', error.message);
      res.status(500).send('error');
    }
  };
}

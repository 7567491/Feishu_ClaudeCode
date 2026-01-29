/**
 * Feishu Codex Proxy API
 * 允许其他机器人通过 HTTP 调用小曼的 Codex 能力
 */

import express from 'express';
import { queryCodex } from '../codex-cli.js';
import { FeishuClient } from '../lib/feishu-client.js';
import { FeishuSessionManager } from '../lib/feishu-session.js';
import { FeishuMessageWriter } from '../lib/feishu-message-writer.js';
import { userDb, feishuDb } from '../database/db.js';
import { truncatePrompt, SESSION_LIMITS } from '../lib/session-limits.js';
import DataAccess from '../lib/feishu-shared/data-access.js';

const router = express.Router();

let feishuClient = null;
let sessionManager = null;
let userId = null;
const busySessions = new Map();
const BUSY_LOCK_TTL_MS = 15_000;

// 上下文配置
const CODEX_CONFIG = {
  // 上下文窗口大小（消息数量）
  CONTEXT_WINDOW_SIZE: parseInt(process.env.CODEX_CONTEXT_SIZE || '6'),

  // 单条消息最大长度
  MAX_MESSAGE_LENGTH: 500,

  // 总提示词最大长度
  MAX_PROMPT_LENGTH: 4000
};

// 网络抓取配置
const FETCH_TIMEOUT_MS = parseInt(process.env.CODEX_FETCH_TIMEOUT || '8000');
const FETCH_MAX_LENGTH = parseInt(process.env.CODEX_FETCH_LIMIT || '2000');

/**
 * 构建上下文提示词（方案 C 核心逻辑）
 * @param {Array} recentMessages - 最近的消息记录
 * @param {string} currentMessage - 当前消息
 * @returns {string} 拼接后的提示词
 */
function buildContextPrompt(recentMessages, currentMessage) {
  // 1. 边界情况：无历史消息
  if (!recentMessages || recentMessages.length === 0) {
    return currentMessage;
  }

  // 2. 过滤有效消息（排除系统消息）
  const validMessages = recentMessages
    .filter(m => {
      // 基础过滤
      if (!m.content || !m.content.trim()) return false;
      if (!['incoming', 'outgoing'].includes(m.direction)) return false;

      // 过滤系统消息
      if (m.content.includes('[From ') && m.content.includes(']')) {
        // 提取实际内容
        const match = m.content.match(/\[From [^\]]+\] (.+)/);
        if (match) {
          m.content = match[1];
        }
      }

      // 过滤错误消息
      if (m.content.startsWith('❌')) return false;

      // 过滤确认消息
      if (m.content === '小曼收到，正在思考...') return false;

      return true;
    })
    .slice(-CODEX_CONFIG.CONTEXT_WINDOW_SIZE);

  if (validMessages.length === 0) {
    return currentMessage;
  }

  // 3. 格式化历史对话
  const contextLines = validMessages.map(m => {
    const role = m.direction === 'incoming' ? '用户' : 'Codex';
    // 截断过长的消息
    const content = m.content.length > CODEX_CONFIG.MAX_MESSAGE_LENGTH
      ? m.content.substring(0, CODEX_CONFIG.MAX_MESSAGE_LENGTH) + '...'
      : m.content;
    return `${role}: ${content}`;
  });

  // 4. 拼接提示词
  let mergedContext = contextLines;
  let fullPrompt = `之前的对话：
${mergedContext.join('\n')}

当前问题：
${currentMessage}`;

  // 5. 检查总长度
  const promptLimit = Math.min(CODEX_CONFIG.MAX_PROMPT_LENGTH, SESSION_LIMITS.MAX_PROMPT_LENGTH);
  while (fullPrompt.length > promptLimit && mergedContext.length > 1) {
    mergedContext = mergedContext.slice(1);
    fullPrompt = `之前的对话：
${mergedContext.join('\n')}

当前问题：
${currentMessage}`;
  }

  if (fullPrompt.length > promptLimit) {
    console.warn('[CodexProxy] ⚠️  Prompt too long, truncating context');
    return truncatePrompt(fullPrompt, promptLimit);
  }

  return fullPrompt;
}

/**
 * 检查会话是否被锁定（并发防护）
 * @param {number} sessionId
 * @returns {boolean}
 */
function isSessionLocked(sessionId) {
  if (!busySessions.has(sessionId)) return false;
  const ts = busySessions.get(sessionId);
  const expired = Date.now() - ts > BUSY_LOCK_TTL_MS;
  if (expired) {
    busySessions.delete(sessionId);
    return false;
  }
  return true;
}

/**
 * 尝试从用户消息中提取天气查询城市
 * @param {string} message
 * @returns {string|null}
 */
function detectWeatherCity(message) {
  if (!/(天气|气温|气象)/.test(message)) return null;

  const directMatch = message.match(/([\u4e00-\u9fa5]{2,8})的?天气/);
  if (directMatch) return directMatch[1];

  const knownCities = ['深圳', '北京', '上海', '广州', '杭州', '南京', '成都', '武汉', '西安', '重庆', '天津'];
  for (const city of knownCities) {
    if (message.includes(city)) return city;
  }
  return '深圳';
}

/**
 * 抓取外部数据并返回截断后的文本
 * @param {string} url
 * @returns {Promise<string|null>}
 */
async function fetchExternalText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return text.slice(0, FETCH_MAX_LENGTH);
  } catch (error) {
    console.warn('[CodexProxy] ⚠️  Fetch external failed:', error.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 初始化小曼代理
 */
async function initializeCodexProxy() {
  // 1. 获取用户信息
  const user = userDb.getFirstUser();
  if (!user) {
    throw new Error('No user found in database');
  }
  userId = user.id;

  // 2. 读取小曼凭据
  const appId = process.env.Feishu_Xiaoman_App_ID;
  const appSecret = process.env.Feishu_Xiaoman_App_Secret;

  if (!appId || !appSecret) {
    throw new Error('Missing Feishu_Xiaoman credentials in .env');
  }

  // 3. 初始化飞书客户端
  feishuClient = new FeishuClient({ appId, appSecret });

  // 4. 初始化会话管理器
  sessionManager = new FeishuSessionManager(userId, './feicc');

  console.log('[CodexProxy] ✅ Initialized');
  console.log('[CodexProxy] 🆔 User ID:', userId);
  console.log('[CodexProxy] 🤖 App ID:', appId);
  console.log('[CodexProxy] 📁 Work dir: ./feicc');
}

/**
 * POST /api/codex-proxy/query
 *
 * 处理 Codex 查询请求
 *
 * Body:
 * {
 *   "message": "用户问题",
 *   "chatId": "oc_xxx 或 ou_xxx",
 *   "fromBot": "调用方机器人名称"
 * }
 */
router.post('/query', async (req, res) => {
  let session = null;
  let lockKey = null;

  try {

    // 1. 延迟初始化
    if (!feishuClient || !sessionManager) {
      await initializeCodexProxy();
    }

    // 2. 解析请求参数
    const { message, chatId, fromBot = 'Unknown Bot' } = req.body;

    if (!message || !chatId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: message, chatId'
      });
    }

    console.log('[CodexProxy] 📩 Query from:', fromBot);
    console.log('[CodexProxy] 💬 Message:', message);
    console.log('[CodexProxy] 🆔 Chat ID:', chatId);

    // 3. 创建会话
    const fakeEvent = {
      message: {
        chat_id: chatId,
        chat_type: chatId.startsWith('oc_') ? 'group' : 'p2p',
        message_id: `codex_proxy_${Date.now()}`
      },
      sender: {
        sender_id: { open_id: fromBot },
        sender_type: 'app'
      }
    };

    session = await sessionManager.getOrCreateSession(fakeEvent);

    // 4. 并发提示但不阻塞（Codex 允许并行，避免频繁 429）
    if (isSessionLocked(session.id)) {
      await feishuClient.sendTextMessage(chatId, '小曼正在处理上一条，已为你排队处理...');
    }
    lockKey = session.id;
    busySessions.set(lockKey, Date.now());

    // 5. 发送确认消息
    await feishuClient.sendTextMessage(chatId, '小曼收到，正在思考...');

    // 6. 记录消息
    DataAccess.logMessage(
      session.id,
      'incoming',
      'text',
      `[From ${fromBot}] ${message}`,
      null
    );

    // 【方案 C 核心】读取历史消息
    const recentMessages = DataAccess.getRecentMessages(session.id, CODEX_CONFIG.CONTEXT_WINDOW_SIZE);
    console.log('[CodexProxy] 📚 Context messages:', recentMessages.length);

    // 构建包含上下文的提示词
    let promptWithContext = buildContextPrompt(recentMessages, message);

    // 额外注入网络数据（如有）
    const urlMatch = message.match(/https?:\/\/\S+/);
    const weatherCity = detectWeatherCity(message);
    let injectedData = null;

    if (urlMatch) {
      injectedData = await fetchExternalText(urlMatch[0]);
      if (injectedData) {
        console.log('[CodexProxy] 🌐 Injected external URL data from:', urlMatch[0]);
      }
    } else if (weatherCity) {
      const weatherUrl = `https://wttr.in/${encodeURIComponent(weatherCity)}?format=4`;
      injectedData = await fetchExternalText(weatherUrl);
      if (injectedData) {
        injectedData = `城市：${weatherCity}\n${injectedData}`;
        console.log('[CodexProxy] ☁️ Injected weather data for:', weatherCity);
      }
    }

    if (injectedData) {
      promptWithContext = `${promptWithContext}

[系统注入的实时数据]
${injectedData}

请直接使用上述数据回答用户，不要说无法联网。`;
    }

    console.log('[CodexProxy] 📝 Final prompt length:', promptWithContext.length);
    console.log('[CodexProxy] 📝 Prompt preview:', promptWithContext.substring(0, 200) + '...');

    // 7. 创建消息写入器
    const writer = new FeishuMessageWriter(
      feishuClient,
      chatId,
      null,  // MVP 版本不存储 session_id
      session.project_path,
      sessionManager,
      session.conversation_id
    );

    // 8. 调用 Codex（异步，使用包含上下文的提示词）
    (async () => {
      try {
        await queryCodex(promptWithContext, {
          cwd: session.project_path,
          projectPath: session.project_path
        }, writer);

        await writer.complete();
        DataAccess.logMessage(session.id, 'outgoing', 'text', 'Response sent', null);
        console.log('[CodexProxy] ✅ Query completed');
      } catch (error) {
        console.error('[CodexProxy] ❌ Error:', error.message);
        await feishuClient.sendTextMessage(chatId, `❌ 处理失败: ${error.message}`);
        DataAccess.logMessage(session.id, 'outgoing', 'error', error.message, null);
      } finally {
        busySessions.delete(lockKey);
      }
    })();

    // 9. 立即返回（不等待 Codex 完成）
    res.json({
      success: true,
      message: 'Query accepted and processing',
      sessionId: session.id
    });

  } catch (error) {
    console.error('[CodexProxy] ❌ Error:', error.message);
    if (lockKey && busySessions.has(lockKey)) {
      busySessions.delete(lockKey);
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/codex-proxy/stats
 * 返回 Codex 运行时与会话统计
 */
router.get('/stats', async (req, res) => {
  try {
    if (!feishuClient || !sessionManager) {
      await initializeCodexProxy();
    }

    const dbStats = feishuDb.getStats(userId);
    const promptLimit = Math.min(CODEX_CONFIG.MAX_PROMPT_LENGTH, SESSION_LIMITS.MAX_PROMPT_LENGTH);

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      config: {
        contextWindow: CODEX_CONFIG.CONTEXT_WINDOW_SIZE,
        promptLimit,
        maxMessageLength: CODEX_CONFIG.MAX_MESSAGE_LENGTH
      },
      runtime: {
        busySessions: busySessions.size,
        busySessionIds: Array.from(busySessions.keys())
      },
      sessions: dbStats
    });
  } catch (error) {
    console.error('[CodexProxy] ❌ Stats error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

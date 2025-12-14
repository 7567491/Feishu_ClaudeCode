/**
 * 上下文注入模块 (方案一: Prompt 前缀注入)
 *
 * 功能：
 * 1. 从数据库提取最近 N 条用户消息 + M 条助手回复
 * 2. 格式化为 prompt 前缀，注入到当前用户消息前
 *
 * 用途：
 * - 即使 --resume 会话失效，也能保持基本上下文
 * - 轻量级方案，只注入最关键的历史
 */

import { feishuDb } from '../database/db.js';

// 需要过滤的系统消息（这些不是真正的对话内容）
const SYSTEM_MESSAGES = [
  '收到',
  'Response sent',  // 旧版占位符
  '⏳ 正在处理中，请稍候...',
  '🔄 会话已过期，正在创建新会话...',
];

// 过短的回复（可能是占位符或无效内容）
const MIN_VALID_CONTENT_LENGTH = 10;

// 消息内容最大长度（超过则截断）
const MAX_CONTENT_LENGTH = 500;

/**
 * 从数据库获取轻量级上下文
 *
 * @param {number} sessionId - 数据库会话 ID
 * @param {number} userMsgCount - 需要的用户消息数量，默认 1
 * @param {number} assistantMsgCount - 需要的助手回复数量，默认 2
 * @returns {Array<{role: string, content: string}>} 格式化的消息数组
 */
export function getLightweightContext(sessionId, userMsgCount = 1, assistantMsgCount = 2) {
  // 获取最近的消息（多取一些用于过滤）
  const messages = feishuDb.getMessageHistory(sessionId, 20);

  if (!messages || messages.length === 0) {
    return [];
  }

  // 过滤：只保留文本消息，排除系统消息
  const validMessages = messages.filter(msg => {
    // 只处理文本消息
    if (msg.message_type !== 'text') {
      return false;
    }

    // 过滤系统消息
    const content = (msg.content || '').trim();
    if (SYSTEM_MESSAGES.includes(content)) {
      return false;
    }

    // 过滤以特定符号开头的系统消息
    if (content.startsWith('❌') || content.startsWith('⏳') || content.startsWith('🔄')) {
      return false;
    }

    // 过滤过短的回复（可能是占位符）
    if (content.length < MIN_VALID_CONTENT_LENGTH) {
      return false;
    }

    return true;
  });

  // 分离用户消息和助手消息
  const userMsgs = validMessages.filter(m => m.direction === 'incoming');
  const assistantMsgs = validMessages.filter(m => m.direction === 'outgoing');

  // 取最近的 N 条用户消息和 M 条助手回复
  const selectedUserMsgs = userMsgs.slice(-userMsgCount);
  const selectedAssistantMsgs = assistantMsgs.slice(-assistantMsgCount);

  // 合并并按时间排序
  const selectedMessages = [...selectedUserMsgs, ...selectedAssistantMsgs]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // 转换为标准格式
  return selectedMessages.map(msg => ({
    role: msg.direction === 'incoming' ? 'user' : 'assistant',
    content: msg.content
  }));
}

/**
 * 判断消息内容是否有效（用于过滤）
 */
function isValidContent(msg) {
  if (msg.message_type !== 'text') return false;

  const content = (msg.content || '').trim();
  if (SYSTEM_MESSAGES.includes(content)) return false;
  if (content.startsWith('❌') || content.startsWith('⏳') || content.startsWith('🔄')) return false;
  if (content.length < MIN_VALID_CONTENT_LENGTH) return false;

  return true;
}

/**
 * 获取最近 N 轮完整对话（用户消息+对应的助手回复）
 *
 * 优点：确保用户消息和助手回复是配对的，避免跨轮次混淆
 *
 * @param {number} sessionId - 数据库会话 ID
 * @param {number} roundCount - 需要的对话轮次数量，默认 2
 * @returns {Array<{role: string, content: string}>} 格式化的消息数组
 */
export function getRecentRounds(sessionId, roundCount = 2) {
  const messages = feishuDb.getMessageHistory(sessionId, 50);

  if (!messages || messages.length === 0) {
    return [];
  }

  // 过滤有效消息
  const validMessages = messages.filter(isValidContent);

  if (validMessages.length === 0) {
    return [];
  }

  // 找到所有用户消息（按时间正序）
  const userMessages = validMessages.filter(m => m.direction === 'incoming');

  if (userMessages.length === 0) {
    return [];
  }

  // 取最近 N 轮的用户消息
  const selectedUserMessages = userMessages.slice(-roundCount);

  // 构建结果：每个用户消息 + 紧跟其后的第一条有效助手回复
  const result = [];

  for (const userMsg of selectedUserMessages) {
    // 添加用户消息
    result.push({
      role: 'user',
      content: userMsg.content,
      created_at: userMsg.created_at
    });

    // 找到这条用户消息之后的第一条有效助手回复
    const userMsgTime = new Date(userMsg.created_at);
    const assistantReply = validMessages.find(m =>
      m.direction === 'outgoing' &&
      new Date(m.created_at) > userMsgTime
    );

    if (assistantReply) {
      // 确保这个助手回复不是下一个用户消息之后的
      const userMsgIndex = selectedUserMessages.indexOf(userMsg);
      const nextUserMsg = selectedUserMessages[userMsgIndex + 1];

      if (!nextUserMsg || new Date(assistantReply.created_at) < new Date(nextUserMsg.created_at)) {
        result.push({
          role: 'assistant',
          content: assistantReply.content,
          created_at: assistantReply.created_at
        });
      }
    }
  }

  // 按时间排序并移除临时字段
  return result
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(({ role, content }) => ({ role, content }));
}

/**
 * 将消息格式化为 prompt 前缀
 *
 * @param {Array<{role: string, content: string}>} messages - 消息数组
 * @param {string} workingDir - 当前工作目录
 * @param {string} conversationId - 会话标识
 * @returns {string} 格式化的 prompt 前缀
 */
export function formatContextPrefix(messages, workingDir, conversationId) {
  const lines = [];

  // 基本上下文信息
  lines.push(`[当前工作目录: ${workingDir}]`);
  lines.push(`[会话ID: ${conversationId}]`);
  lines.push('');

  // 如果有历史消息，添加对话上下文
  if (messages && messages.length > 0) {
    lines.push('### 最近对话上下文:');
    lines.push('');

    for (const msg of messages) {
      const label = msg.role === 'user' ? '用户' : '助手';
      const content = truncateContent(msg.content, MAX_CONTENT_LENGTH);
      lines.push(`**${label}**: ${content}`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  lines.push('### 当前问题:');
  lines.push('');

  return lines.join('\n');
}

/**
 * 截断过长的内容
 *
 * @param {string} content - 原始内容
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的内容
 */
function truncateContent(content, maxLength) {
  if (!content) return '';

  if (content.length <= maxLength) {
    return content;
  }

  return content.substring(0, maxLength) + '...';
}

/**
 * 构建完整的带上下文的用户消息
 *
 * @param {number} sessionId - 数据库会话 ID
 * @param {string} userText - 当前用户输入
 * @param {string} workingDir - 工作目录
 * @param {string} conversationId - 会话标识
 * @param {Object} options - 可选配置
 * @param {number} options.roundCount - 对话轮次数量，默认 2（推荐，确保配对）
 * @param {boolean} options.useLegacy - 是否使用旧逻辑（分别取N条），默认 false
 * @returns {string} 带上下文前缀的完整消息
 */
export function buildContextualMessage(sessionId, userText, workingDir, conversationId, options = {}) {
  const { roundCount = 2, useLegacy = false } = options;

  // 默认使用新的轮次提取方式（确保用户消息和助手回复配对）
  const context = useLegacy
    ? getLightweightContext(sessionId, options.userMsgCount || 1, options.assistantMsgCount || 2)
    : getRecentRounds(sessionId, roundCount);

  const prefix = formatContextPrefix(context, workingDir, conversationId);

  return prefix + userText;
}

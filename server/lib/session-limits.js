/**
 * 会话限制模块
 *
 * 功能：
 * 1. 定义会话消息数量上限（100条）
 * 2. 定义 prompt 长度上限（2000字符）
 * 3. 检测 "Prompt is too long" 错误并触发自动恢复
 *
 * @see docs/long.md - RCA 分析报告
 */

/**
 * 会话限制常量
 */
export const SESSION_LIMITS = {
  /** 会话消息数量上限 */
  MAX_MESSAGES: 100,

  /** Prompt 长度上限（字符数） */
  MAX_PROMPT_LENGTH: 2000,
};

/**
 * 检查会话是否需要重置
 *
 * @param {Object} stats - 会话统计
 * @param {number} stats.messageCount - 消息数量
 * @param {number} stats.promptLength - prompt 长度
 * @returns {{needsReset: boolean, reason: string|null}}
 */
export function checkSessionLimits({ messageCount, promptLength }) {
  // 检查消息数量
  if (messageCount > SESSION_LIMITS.MAX_MESSAGES) {
    return {
      needsReset: true,
      reason: `消息数量超限 (${messageCount} > ${SESSION_LIMITS.MAX_MESSAGES})`
    };
  }

  // 检查 prompt 长度
  if (promptLength > SESSION_LIMITS.MAX_PROMPT_LENGTH) {
    return {
      needsReset: true,
      reason: `Prompt 长度超限 (${promptLength} > ${SESSION_LIMITS.MAX_PROMPT_LENGTH})`
    };
  }

  return { needsReset: false, reason: null };
}

/**
 * 根据错误消息判断是否需要重置会话
 *
 * 匹配的错误模式：
 * - "Prompt is too long"
 * - "context length exceeded"
 *
 * @param {string} errorMessage - 错误消息
 * @returns {boolean} 是否需要重置
 */
export function shouldResetSession(errorMessage) {
  if (!errorMessage) return false;

  const lowerMessage = String(errorMessage).toLowerCase();

  const resetPatterns = [
    'prompt is too long',
    'context length exceeded',
    'maximum context length',
    'token limit exceeded'
  ];

  return resetPatterns.some(pattern => lowerMessage.includes(pattern));
}

/**
 * 截断过长的 prompt
 *
 * @param {string} prompt - 原始 prompt
 * @param {number} maxLength - 最大长度，默认使用 SESSION_LIMITS.MAX_PROMPT_LENGTH
 * @returns {string} 截断后的 prompt
 */
export function truncatePrompt(prompt, maxLength = SESSION_LIMITS.MAX_PROMPT_LENGTH) {
  if (!prompt || prompt.length <= maxLength) {
    return prompt;
  }

  const truncateMarker = '\n\n...[已截断]';
  const truncatedLength = maxLength - truncateMarker.length;

  return prompt.substring(0, truncatedLength) + truncateMarker;
}

/**
 * 获取会话统计信息（使用优化的 SQL 聚合查询）
 *
 * @param {Object} feishuDb - 数据库实例
 * @param {number} sessionId - 会话 ID
 * @returns {{messageCount: number, totalChars: number, avgChars: number, maxChars: number}}
 */
export function getSessionStats(feishuDb, sessionId) {
  try {
    // 使用优化的 SQL 聚合查询，直接计算统计信息
    // 避免了硬编码的 limit=100 限制
    const stats = feishuDb.getMessageStats(sessionId);
    return stats;
  } catch (error) {
    console.error('[SessionLimits] 获取会话统计失败:', error);
    return {
      messageCount: 0,
      totalChars: 0,
      avgChars: 0,
      maxChars: 0
    };
  }
}

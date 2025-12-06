/**
 * 上下文管理器 - 混合双保险方案
 *
 * 设计目标：
 * 1. 优先使用 --resume 机制（快速、官方支持）
 * 2. 同时从数据库读取历史作为"安全网"
 * 3. 规则：至少 5000 字符 OR 至少 3 轮用户消息
 * 4. 内容：用户消息 + 机器人回复
 */

import { feishuDb } from '../database/db.js';

export class ContextManager {
  constructor() {
    this.MIN_CHARS = 5000;      // 最小字符数
    this.MIN_USER_MESSAGES = 3;  // 最小用户消息数
  }

  /**
   * 从数据库提取上下文历史
   * @param {number} sessionId - 数据库会话 ID
   * @returns {Array} messages 数组 [{role: 'user'|'assistant', content: '...'}]
   */
  extractContextFromDatabase(sessionId) {
    // 从数据库读取所有消息，按时间正序（chronological order）
    const allMessages = feishuDb.getMessageHistory(sessionId, 1000); // 最多1000条

    if (!allMessages || allMessages.length === 0) {
      return [];
    }

    // 反向遍历，累积字符数和用户消息数
    let cumulativeChars = 0;
    let userMessageCount = 0;
    const selectedMessages = [];

    for (let i = allMessages.length - 1; i >= 0; i--) {
      const msg = allMessages[i];

      // 跳过非文本消息（文件、命令等）
      if (msg.message_type !== 'text') {
        continue;
      }

      const messageLength = (msg.content || '').length;
      cumulativeChars += messageLength;

      // 转换为 Claude API 格式
      const role = msg.direction === 'incoming' ? 'user' : 'assistant';
      selectedMessages.unshift({
        role: role,
        content: msg.content
      });

      // 统计用户消息数
      if (role === 'user') {
        userMessageCount++;
      }

      // 检查是否满足最小条件
      const meetsCharRequirement = cumulativeChars >= this.MIN_CHARS;
      const meetsUserMsgRequirement = userMessageCount >= this.MIN_USER_MESSAGES;

      // 如果同时满足两个条件，可以停止
      if (meetsCharRequirement && meetsUserMsgRequirement) {
        break;
      }
    }

    console.log(`[ContextManager] 提取上下文: ${selectedMessages.length} 条消息, ${cumulativeChars} 字符, ${userMessageCount} 条用户消息`);

    return selectedMessages;
  }

  /**
   * 构建混合上下文选项
   * @param {number} sessionId - 数据库会话 ID
   * @param {string|null} claudeSessionId - Claude API session_id
   * @param {string} currentMessage - 当前用户消息
   * @returns {Object} 包含 resume 和 fallback 历史的选项
   */
  buildHybridContext(sessionId, claudeSessionId, currentMessage) {
    const result = {
      // 主策略：使用 --resume
      useResume: !!claudeSessionId,
      resumeSessionId: claudeSessionId,

      // 备份策略：数据库历史
      databaseHistory: this.extractContextFromDatabase(sessionId),

      // 当前消息
      currentMessage: currentMessage,

      // 统计信息
      stats: {
        historyMessageCount: 0,
        historyChars: 0,
        estimatedTokens: 0
      }
    };

    // 计算统计信息
    result.stats.historyMessageCount = result.databaseHistory.length;
    result.stats.historyChars = result.databaseHistory.reduce(
      (sum, msg) => sum + (msg.content || '').length,
      0
    );
    result.stats.estimatedTokens = Math.round(result.stats.historyChars / 3);

    return result;
  }

  /**
   * 将数据库历史转换为 Claude CLI 可用的格式
   * 注意：Claude CLI 目前不支持直接传递 messages 数组
   * 这个方法为未来升级到 SDK 做准备
   *
   * @param {Array} messages - 消息数组
   * @returns {string} 格式化的上下文字符串
   */
  formatAsContextPrompt(messages) {
    if (!messages || messages.length === 0) {
      return '';
    }

    // 将历史对话格式化为文本前缀
    const lines = [
      '# 对话历史上下文',
      '',
      '以下是之前的对话历史，请基于这些上下文回答后续问题：',
      ''
    ];

    messages.forEach((msg, index) => {
      const label = msg.role === 'user' ? '用户' : '助手';
      lines.push(`## [${index + 1}] ${label}:`);
      lines.push(msg.content);
      lines.push('');
    });

    lines.push('---');
    lines.push('# 当前问题');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 验证 --resume 是否有效
   * 通过检测 Claude 的回复中是否包含上下文相关内容
   *
   * @param {string} response - Claude 的回复
   * @param {Array} databaseHistory - 数据库历史
   * @returns {boolean} 是否检测到有效上下文
   */
  validateResumeEffectiveness(response, databaseHistory) {
    // 简单启发式：如果数据库有历史，但 Claude 回复没有引用任何历史内容
    // 可能说明 --resume 失效了

    if (databaseHistory.length === 0) {
      return true; // 没有历史，无法验证
    }

    // 提取历史中的关键词（简化版）
    const keywords = new Set();
    databaseHistory.slice(-3).forEach(msg => {
      const words = msg.content.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/g) || [];
      words.slice(0, 5).forEach(w => keywords.add(w));
    });

    // 检查 Claude 回复中是否包含这些关键词
    let matchCount = 0;
    keywords.forEach(keyword => {
      if (response.includes(keyword)) {
        matchCount++;
      }
    });

    const matchRate = matchCount / Math.max(keywords.size, 1);
    console.log(`[ContextManager] 上下文验证: 关键词匹配率 ${(matchRate * 100).toFixed(1)}%`);

    return matchRate > 0.2; // 至少 20% 的关键词出现
  }
}

// 导出单例
export const contextManager = new ContextManager();

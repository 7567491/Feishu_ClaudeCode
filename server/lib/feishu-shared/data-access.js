/**
 * 数据访问层（DAL）
 * 统一管理数据库操作
 */

import { feishuDb } from '../../database/db.js';

class DataAccess {
  // 会话相关操作
  static getSession(sessionId) {
    return feishuDb.getSession(sessionId);
  }

  static createSession(data) {
    return feishuDb.createSession(data);
  }

  static updateSession(sessionId, data) {
    return feishuDb.updateSession(sessionId, data);
  }

  // 消息日志操作
  static logMessage(sessionId, direction, messageType, content, messageId = null) {
    feishuDb.logMessage(sessionId, direction, messageType, content, messageId);
    if (direction === 'outgoing') {
      feishuDb.updateSessionActivity(sessionId);
    }
  }

  // 获取最近的消息记录（按时间顺序）
  static getRecentMessages(sessionId, limit = 20) {
    return feishuDb.getMessageHistory(sessionId, limit);
  }

  // 统计操作
  static getStatistics(timeRange = '24h') {
    return feishuDb.getStatistics(timeRange);
  }

  // 批量操作（带事务）
  static async batchOperation(operations) {
    const results = [];
    try {
      for (const op of operations) {
        const result = await op();
        results.push(result);
      }
      return { success: true, results };
    } catch (error) {
      console.error('Batch operation failed:', error);
      // 这里可以加入回滚逻辑
      return { success: false, error: error.message };
    }
  }
}

export default DataAccess;

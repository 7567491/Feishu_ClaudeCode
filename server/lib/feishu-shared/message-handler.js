/**
 * 统一的飞书消息处理模块
 * 解决代码重复问题
 */

import { FeishuFileHandler } from '../feishu-file-handler.js';
import { feishuDb } from '../../database/db.js';

class MessageHandler {
  /**
   * 处理文件转换命令
   */
  static async handleFileConvert(client, chatId, projectPath, userText, sessionId) {
    const convertCommand = FeishuFileHandler.parseConvertCommand(userText);
    if (!convertCommand || convertCommand.command !== 'convert') {
      return false;
    }

    try {
      await FeishuFileHandler.handleFileConvert(
        client,
        chatId,
        projectPath,
        convertCommand.fileName
      );

      feishuDb.logMessage(sessionId, 'outgoing', 'file', `convert:${convertCommand.fileName}`, null);
      feishuDb.updateSessionActivity(sessionId);

      return { success: true };
    } catch (error) {
      await client.sendTextMessage(chatId, `❌ 转化失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 处理文件发送命令
   */
  static async handleFileSend(client, chatId, projectPath, userText, sessionId) {
    const fileCommand = FeishuFileHandler.parseFileCommand(userText);
    if (!fileCommand || fileCommand.command !== 'send') {
      return false;
    }

    try {
      await FeishuFileHandler.handleFileSend(
        client,
        chatId,
        projectPath,
        fileCommand.fileName
      );

      feishuDb.logMessage(sessionId, 'outgoing', 'file', fileCommand.fileName, null);
      feishuDb.updateSessionActivity(sessionId);

      return { success: true };
    } catch (error) {
      await client.sendTextMessage(chatId, `❌ 发送失败: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * 记录消息日志
   */
  static logMessage(sessionId, direction, messageType, content, messageId = null) {
    feishuDb.logMessage(sessionId, direction, messageType, content, messageId);
    if (direction === 'outgoing') {
      feishuDb.updateSessionActivity(sessionId);
    }
  }
}

export default MessageHandler;
